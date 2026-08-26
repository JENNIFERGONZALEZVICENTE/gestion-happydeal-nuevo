const ORPHAN_RE = /BEZEN0*([0-9]+)/i;

// Estado (color), observaciones y los datos de inventario (agencia, pendiente
// de fabricante) son datos manuales o calculados una sola vez, no vienen de
// Shopify: hay que conservarlos cuando un sync/webhook reemplaza los campos
// de la tienda con datos frescos. La agencia se fija con el stock que había
// en el momento de la venta, no se recalcula en resyncs posteriores.
const PRESERVED_FIELDS = ["colorTag", "observaciones", "agencia", "pendingManufacture", "needsReview", "inventoryProcessed", "reviewReasons", "reviewAnswers"];

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
    // Mantenimiento puntual (2026-08-26): "desprocesa" pedidos concretos —
    // los vuelve a dejar como si nunca se hubieran calculado (agencia,
    // pendingManufacture, needsReview, reviewReasons/reviewAnswers,
    // inventoryProcessed a false), para que el próximo sync/webhook los
    // recalcule desde cero con la lógica actual. Usado tras el incidente
    // del 26/08 donde una sincronización completa procesó pedidos que
    // todavía no estaban PAGADO.
    if (url.pathname === "/orders/unprocess" && request.method === "POST") {
      const { ids } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      let actualizados = 0;
      for (const id of ids || []) {
        const order = orders[id];
        if (!order) continue;
        order.agencia = null;
        order.pendingManufacture = null;
        order.needsReview = false;
        order.reviewReasons = [];
        order.reviewAnswers = [];
        order.inventoryProcessed = false;
        actualizados++;
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, actualizados });
    }

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

    // Respuestas de Jennifer a un pedido marcado "Revisar" (ver
    // reviewReasons, generado por InventoryStore cuando no hay una regla fija
    // posible) — una respuesta por pregunta, no una nota única para todo el
    // pedido. No cambia agencia/proveedor, es solo instrucción visible para
    // el equipo.
    if (url.pathname === "/orders/review-note" && request.method === "POST") {
      const { id, reviewAnswers } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const existing = orders[id];
      if (!existing) return new Response("not found", { status: 404 });
      const answers = Array.isArray(reviewAnswers) ? reviewAnswers : [];
      existing.reviewAnswers = answers;
      orders[id] = existing;
      await this.state.storage.put("orders", orders);
      // Mientras falte responder a alguna pregunta, sus pendientes de
      // colchón siguen bloqueados (sin carpeta de Proveedores concreta); en
      // cuanto están todas respondidas, se sueltan. Si luego borra una
      // respuesta, se vuelven a bloquear.
      const reasons = existing.reviewReasons || [];
      const allAnswered = reasons.length > 0 && reasons.every((r, i) => (answers[i] || "").trim());
      await this.releaseInventoryDecision(existing.id, !allAnswered);
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
      body: JSON.stringify({ orderId: order.id, orderNumber: order.orderNumber, items: order.items || [], force, orderDate: order.orderDate, services: order.services || "", paymentStatus: order.paymentStatus }),
    });
    const { agencia, pendingManufacture, needsReview, reviewReasons, paused } = await res.json();
    // `paused` cubre dos casos (InventoryStore.processSale): la pausa
    // general, o que el pedido todavía no esté PAGADO (financiación/
    // transferencia sin confirmar — regla de seguridad, no se salta ni con
    // force). En ambos casos no se marca inventoryProcessed: se reintenta
    // solo en el próximo sync/webhook.
    if (paused) return;
    order.agencia = agencia;
    order.pendingManufacture = pendingManufacture;
    order.needsReview = needsReview;
    order.reviewReasons = reviewReasons || [];
    order.inventoryProcessed = true;
  }

  // Suelta (o vuelve a bloquear) los pendientes de este pedido que estaban
  // esperando la decisión de Jennifer — ver reviewReasons/reviewAnswers y
  // InventoryStore.releaseDecision.
  async releaseInventoryDecision(orderId, relock) {
    const id = this.env.INVENTORY_STORE.idFromName("main");
    const stub = this.env.INVENTORY_STORE.get(id);
    await stub.fetch("https://do/backorders/release-decision", {
      method: "POST",
      body: JSON.stringify({ orderId, relock }),
    });
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
