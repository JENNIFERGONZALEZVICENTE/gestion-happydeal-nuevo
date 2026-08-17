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
      const list = Object.values(orders).sort((a, b) => b.orderNumber - a.orderNumber);
      return Response.json(list);
    }

    if (url.pathname === "/orders/import" && request.method === "POST") {
      const incoming = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      for (const order of incoming) {
        orders[order.id] = order;
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return new Response("ok");
    }

    if (url.pathname === "/orders/upsert" && request.method === "POST") {
      const order = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      orders[order.id] = order;
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
