const ORPHAN_RE = /BEZEN0*([0-9]+)/i;

// Estado (color) y observaciones son datos manuales de control interno, no
// vienen de Shopify: hay que conservarlos cuando un sync/webhook reemplaza
// los campos de la tienda con datos frescos.
function mergeCustomFields(existing, incoming) {
  if (!existing) return incoming;
  return { ...incoming, colorTag: existing.colorTag, observaciones: existing.observaciones };
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
        orders[order.id] = mergeCustomFields(orders[order.id], order);
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return new Response("ok");
    }

    if (url.pathname === "/orders/upsert" && request.method === "POST") {
      const order = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      orders[order.id] = mergeCustomFields(orders[order.id], order);
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return new Response("ok");
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
