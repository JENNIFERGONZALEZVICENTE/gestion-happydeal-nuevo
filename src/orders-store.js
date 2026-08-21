const ORPHAN_RE = /BEZEN0*([0-9]+)/i;

// Estado (color), observaciones y los datos de inventario (agencia, pendiente
// de fabricante) son datos manuales o calculados una sola vez, no vienen de
// Shopify: hay que conservarlos cuando un sync/webhook reemplaza los campos
// de la tienda con datos frescos. La agencia se fija con el stock que había
// en el momento de la venta, no se recalcula en resyncs posteriores.
const PRESERVED_FIELDS = ["colorTag", "observaciones", "agencia", "pendingManufacture", "needsReview", "inventoryProcessed"];

function mergeCustomFields(existing, incoming) {
  if (!existing) return incoming;
  const merged = { ...incoming };
  for (const field of PRESERVED_FIELDS) {
    if (existing[field] !== undefined) merged[field] = existing[field];
  }
  return merged;
}

// Staff sometimes register a montaje/diferencia de precio/etc. as its own
// manual order (e.g. product "MONTAJE 39€ BEZEN11989") instead of a line
// item on the real order. Fold those into the referenced order's services
// and drop the standalone row. If the referenced order isn't in our data
// (deleted in Shopify), leave the row as-is so it stays visible for review.
function mergeOrphans(list) {
  const byNumber = new Map(list.map((o) => [o.orderNumber, o]));
  const result = [];

  for (const order of list) {
    const match = !order.services && (order.product || "").match(ORPHAN_RE);
    const refNumber = match ? Number(match[1]) : null;
    const target = refNumber && refNumber !== order.orderNumber ? byNumber.get(refNumber) : null;

    if (target) {
      const desc = order.product.replace(ORPHAN_RE, "").trim();
      const note = /\d/.test(desc) ? desc : `${desc} (${order.price}€)`;
      target.services = [target.services, note].filter(Boolean).join(" · ");
      continue;
    }

    result.push(order);
  }

  return result;
}

export class OrdersStore {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set();
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/orders" && request.method === "GET") {
      const orders = (await this.state.storage.get("orders")) || {};
      const list = mergeOrphans(Object.values(orders)).sort((a, b) => b.orderNumber - a.orderNumber);
      return Response.json(list);
    }

    if (url.pathname === "/orders/import" && request.method === "POST") {
      const incoming = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      for (const order of incoming) {
        const existing = orders[order.id];
        if (!existing || !existing.inventoryProcessed) {
          await this.processInventory(order);
        }
        if (order.shippingStatus === "fulfilled" && existing?.shippingStatus !== "fulfilled") {
          await this.settleShipment(order.id);
        }
        orders[order.id] = mergeCustomFields(existing, order);
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return new Response("ok");
    }

    if (url.pathname === "/orders/upsert" && request.method === "POST") {
      const order = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const existing = orders[order.id];
      if (!existing || !existing.inventoryProcessed) {
        await this.processInventory(order);
      }
      if (order.shippingStatus === "fulfilled" && existing?.shippingStatus !== "fulfilled") {
        await this.settleShipment(order.id);
      }
      orders[order.id] = mergeCustomFields(existing, order);
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return new Response("ok");
    }

    // Mantenimiento puntual: limpia el aviso de "colchón pendiente de
    // fabricante" que quedó calculado contra un stock histórico erróneo
    // (arrancado a 0 y descontado con todo el histórico de pedidos). No
    // toca colorTag/observaciones/agencia/inventoryProcessed.
    if (url.pathname === "/orders/clear-pending" && request.method === "POST") {
      const orders = (await this.state.storage.get("orders")) || {};
      let cleared = 0;
      for (const order of Object.values(orders)) {
        if (order.pendingManufacture) {
          order.pendingManufacture = null;
          cleared++;
        }
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, cleared });
    }

    // Prueba puntual: fuerza el cálculo de agencia/stock de UN pedido
    // concreto sin tocar la pausa general de Inventario (para poder
    // enseñarle a Jennifer cómo queda un pedido real sin reactivar el
    // procesamiento de todos los pedidos pendientes de golpe).
    if (url.pathname === "/orders/force-process" && request.method === "POST") {
      const { orderId } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const existing = orders[orderId];
      if (!existing) return new Response("not found", { status: 404 });
      await this.processInventory(existing, true);
      if (existing.shippingStatus === "fulfilled") {
        await this.settleShipment(existing.id);
      }
      orders[orderId] = existing;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json(existing);
    }

    if (url.pathname === "/orders/meta" && request.method === "POST") {
      const { id, colorTag, observaciones } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const existing = orders[id];
      if (!existing) return new Response("not found", { status: 404 });
      if (colorTag !== undefined) existing.colorTag = colorTag || null;
      if (observaciones !== undefined) existing.observaciones = observaciones;
      orders[id] = existing;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return new Response("ok");
    }

    if (url.pathname === "/ws") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.sockets.add(server);
      server.addEventListener("close", () => this.sockets.delete(server));
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("not found", { status: 404 });
  }

  async processInventory(order, force) {
    const id = this.env.INVENTORY_STORE.idFromName("main");
    const stub = this.env.INVENTORY_STORE.get(id);
    const res = await stub.fetch("https://do/process-sale", {
      method: "POST",
      body: JSON.stringify({ orderId: order.id, orderNumber: order.orderNumber, items: order.items || [], force, orderDate: order.orderDate }),
    });
    const { agencia, pendingManufacture, needsReview, paused } = await res.json();
    // Si Inventario está en pausa, no se marca inventoryProcessed: el
    // pedido se reintentará en el próximo sync/webhook hasta que Jennifer
    // reactive el procesamiento con /admin/resume.
    if (paused) return;
    order.agencia = agencia;
    order.pendingManufacture = pendingManufacture;
    order.needsReview = needsReview;
    order.inventoryProcessed = true;
  }

  async settleShipment(orderId) {
    const id = this.env.INVENTORY_STORE.idFromName("main");
    const stub = this.env.INVENTORY_STORE.get(id);
    await stub.fetch("https://do/settle-shipment", {
      method: "POST",
      body: JSON.stringify({ orderId }),
    });
  }

  broadcast() {
    for (const ws of this.sockets) {
      try {
        ws.send("update");
      } catch (e) {
        this.sockets.delete(ws);
      }
    }
  }
}
