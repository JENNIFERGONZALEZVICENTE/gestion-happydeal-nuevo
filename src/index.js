export { OrdersStore } from "./orders-store.js";

function mapOrder(order) {
  const productTitles = [];
  const serviceParts = [];

  for (const item of order.line_items || []) {
    if (item.title) productTitles.push(item.title);
    for (const prop of item.properties || []) {
      if (!prop.name || !prop.value) continue;
      if (prop.name.startsWith("_")) continue;
      serviceParts.push(`${prop.name}: ${prop.value}`);
    }
  }

  // Some line items repeat the base product title with extra variant detail;
  // keep only titles that aren't a prefix of a more specific one.
  const products = productTitles.filter(
    (title, i) => !productTitles.some((other, j) => j !== i && other.length > title.length && other.startsWith(title))
  );
  const uniqueProducts = [...new Set(products)];

  const address = order.shipping_address || {};
  const addressStr = [address.address1, address.address2, address.city, address.zip, address.province]
    .filter(Boolean)
    .join(", ");

  const customerName = address.name
    || `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();

  return {
    id: order.id,
    orderNumber: order.order_number,
    name: customerName,
    address: addressStr,
    phone: order.phone || address.phone || order.customer?.phone || "",
    product: uniqueProducts.join(", "),
    services: serviceParts.join(" · "),
    paymentMethod: (order.payment_gateway_names || []).join(", "),
    shippingStatus: order.fulfillment_status || "pendiente",
    price: order.total_price,
    currency: order.currency,
  };
}

async function fetchShopifyOrders(env) {
  const orders = [];
  let url = `https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/orders.json?limit=250&status=any`;
  while (url) {
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN },
    });
    if (!res.ok) {
      throw new Error(`Shopify API error: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    orders.push(...data.orders);

    const link = res.headers.get("Link");
    const next = link && link.split(",").find((p) => p.includes('rel="next"'));
    url = next ? next.match(/<(.+)>/)[1] : null;
  }
  return orders;
}

async function handleSync(env) {
  const rawOrders = await fetchShopifyOrders(env);
  const mapped = rawOrders.map(mapOrder);

  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  await stub.fetch("https://do/orders/import", {
    method: "POST",
    body: JSON.stringify(mapped),
  });

  return Response.json({ synced: mapped.length });
}

async function handleUpsertOrder(rawOrder, env) {
  const mapped = mapOrder(rawOrder);
  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  await stub.fetch("https://do/orders/upsert", {
    method: "POST",
    body: JSON.stringify(mapped),
  });
}

async function verifyShopifyWebhook(request, env) {
  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256");
  if (!hmacHeader) return null;

  const rawBody = await request.text();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SHOPIFY_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = btoa(String.fromCharCode(...new Uint8Array(signature)));

  if (computed !== hmacHeader) return null;
  return rawBody;
}

async function handleWebhook(request, env) {
  const rawBody = await verifyShopifyWebhook(request, env);
  if (!rawBody) {
    return new Response("Invalid signature", { status: 401 });
  }
  const order = JSON.parse(rawBody);
  await handleUpsertOrder(order, env);
  return new Response("ok");
}

async function handleGetOrders(env) {
  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  return stub.fetch("https://do/orders");
}

async function handleWebSocket(request, env) {
  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  return stub.fetch("https://do/ws", request);
}

const PLATFORMS = [
  { id: "shopify", label: "Shopify", ready: true },
  { id: "carrefour", label: "Carrefour", ready: false },
  { id: "maison-du-monde", label: "Maison du Monde", ready: false },
  { id: "worten", label: "Worten", ready: false },
  { id: "conforama-es", label: "Conforama ES", ready: false },
  { id: "conforama-fr", label: "Conforama FR", ready: false },
  { id: "leroy-merlin", label: "Leroy Merlin", ready: false },
  { id: "brico-depot", label: "Brico Depot", ready: false },
  { id: "pink", label: "Pink", ready: false },
  { id: "reforman", label: "Reforman", ready: false },
];

function renderPage() {
  const navItems = PLATFORMS.map(
    (p) => `<li>
        <a href="#" class="nav-link${p.ready ? " active" : ""}" data-platform="${p.id}">
          ${p.label}${p.ready ? "" : '<span class="soon">próx.</span>'}
        </a>
      </li>`
  ).join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Gestión HappyDeal · Pedidos</title>
<style>
  :root {
    --bg: #f3f6f4;
    --panel: #ffffff;
    --border: #dfe7e2;
    --text: #1f2933;
    --muted: #667a70;
    --brand: #1f8a4c;
    --brand-dark: #146138;
    --brand-light: #e7f5ec;
    --sidebar-bg: #0f3d24;
    --sidebar-hover: #145430;
    --sidebar-active: #1f8a4c;
    --sidebar-text: #cfe8da;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    font-family: "Segoe UI", system-ui, sans-serif;
    margin: 0;
    background: var(--bg);
    color: var(--text);
    display: flex;
  }
  .sidebar {
    width: 240px;
    flex-shrink: 0;
    background: var(--sidebar-bg);
    color: var(--sidebar-text);
    min-height: 100vh;
    padding: 1.25rem 0;
  }
  .sidebar .brand {
    padding: 0 1.25rem 1.25rem;
    font-weight: 700;
    font-size: 1.05rem;
    color: white;
    border-bottom: 1px solid rgba(255,255,255,0.12);
    margin-bottom: 0.75rem;
  }
  .sidebar .section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.6rem 1.25rem;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #a7d9bb;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
  }
  .sidebar .section-title:hover { color: white; }
  .sidebar .section-title .chevron {
    transition: transform 0.15s ease;
    font-size: 10px;
  }
  .sidebar .section-title.open .chevron { transform: rotate(90deg); }
  .sidebar ul { list-style: none; margin: 0; padding: 0; max-height: 0; overflow: hidden; transition: max-height 0.2s ease; }
  .sidebar ul.open { max-height: 500px; }
  .sidebar .nav-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 1.25rem;
    color: var(--sidebar-text);
    text-decoration: none;
    font-size: 14px;
    border-left: 3px solid transparent;
  }
  .sidebar .nav-link:hover { background: var(--sidebar-hover); }
  .sidebar .nav-link.active {
    background: var(--sidebar-active);
    color: white;
    border-left-color: #a7f3c0;
    font-weight: 600;
  }
  .sidebar .nav-link .soon {
    font-size: 10px;
    background: rgba(255,255,255,0.15);
    padding: 2px 6px;
    border-radius: 999px;
  }
  .main { flex: 1; min-width: 0; }
  header {
    background: linear-gradient(135deg, var(--brand), var(--brand-dark));
    color: white;
    padding: 1.5rem 2rem;
  }
  header h1 { margin: 0; font-size: 1.4rem; }
  header p { margin: 4px 0 0; opacity: 0.9; font-size: 0.9rem; }
  .toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 1rem 2rem;
    flex-wrap: wrap;
  }
  #search {
    flex: 1;
    min-width: 220px;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 14px;
  }
  button {
    padding: 10px 18px;
    border: none;
    border-radius: 8px;
    background: var(--brand);
    color: white;
    cursor: pointer;
    font-size: 14px;
  }
  button:hover { background: var(--brand-dark); }
  #count { color: var(--muted); font-size: 0.85rem; padding: 0 2rem 0.5rem; }
  .table-wrap {
    margin: 0 2rem 2rem;
    background: var(--panel);
    border-radius: 12px;
    border: 1px solid var(--border);
    overflow: auto;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  table { border-collapse: collapse; width: 100%; min-width: 1100px; }
  th, td {
    padding: 10px 14px;
    text-align: left;
    font-size: 13.5px;
    border: 1px solid var(--border);
    white-space: nowrap;
  }
  td { white-space: normal; }
  th {
    background: #fafbfc;
    color: var(--muted);
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.04em;
    position: sticky;
    top: 0;
  }
  tbody tr:hover { background: var(--brand-light); }
  .badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }
  .badge.pendiente { background: #fef3c7; color: #92400e; }
  .badge.fulfilled { background: #dcfce7; color: #146138; }
  .badge.partial { background: #dbeafe; color: #1e40af; }
  .services { color: var(--brand-dark); font-size: 12.5px; }
  .price { font-weight: 600; }
  .placeholder {
    margin: 3rem;
    padding: 2.5rem;
    background: var(--panel);
    border: 1px dashed var(--border);
    border-radius: 12px;
    text-align: center;
    color: var(--muted);
  }
</style>
</head>
<body>
<nav class="sidebar">
  <div class="brand">Gestión HappyDeal</div>
  <button class="section-title" id="pedidos-toggle">
    <span>Pedidos</span>
    <span class="chevron">▶</span>
  </button>
  <ul id="pedidos-list">${navItems}</ul>
</nav>
<div class="main">
<header>
  <h1 id="view-title">Pedidos · Shopify</h1>
  <p>Vista en vivo sincronizada con tu tienda</p>
</header>

<div id="view-shopify">
  <div class="toolbar">
    <input id="search" type="text" placeholder="Buscar por nº de pedido o nombre..." />
    <button id="sync">Sincronizar ahora</button>
  </div>
  <div id="count"></div>
  <div class="table-wrap">
  <table id="orders">
    <thead>
      <tr>
        <th>Nº Pedido</th><th>Nombre</th><th>Dirección de entrega</th><th>Teléfono</th>
        <th>Producto comprado</th><th>Servicios adicionales</th><th>Método de pago</th>
        <th>Situación de envío</th><th>Precio</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>
  </div>
</div>

<div id="view-placeholder" class="placeholder" style="display:none"></div>

</div>
<script>
let allOrders = [];
const platforms = ${JSON.stringify(PLATFORMS)};

function statusBadge(status) {
  const s = (status || "pendiente").toLowerCase();
  const cls = s === "fulfilled" ? "fulfilled" : s === "partial" ? "partial" : "pendiente";
  const label = s === "fulfilled" ? "Enviado" : s === "partial" ? "Parcial" : "Pendiente";
  return \`<span class="badge \${cls}">\${label}</span>\`;
}

function render(orders) {
  const tbody = document.querySelector("#orders tbody");
  tbody.innerHTML = orders.map(o => \`
    <tr>
      <td>BEZEN\${o.orderNumber}</td>
      <td>\${o.name}</td>
      <td>\${o.address}</td>
      <td>\${o.phone}</td>
      <td>\${o.product}</td>
      <td class="services">\${o.services}</td>
      <td>\${o.paymentMethod}</td>
      <td>\${statusBadge(o.shippingStatus)}</td>
      <td class="price">\${o.price} \${o.currency || ""}</td>
    </tr>
  \`).join("");
  document.getElementById("count").textContent = orders.length + " pedidos";
}

async function loadOrders() {
  const res = await fetch("/api/pedidos/shopify");
  allOrders = await res.json();
  applyFilter();
}

function applyFilter() {
  const q = document.getElementById("search").value.trim().toLowerCase();
  if (!q) return render(allOrders);
  const filtered = allOrders.filter(o =>
    ("bezen" + o.orderNumber).includes(q) || (o.name || "").toLowerCase().includes(q)
  );
  render(filtered);
}

document.getElementById("search").addEventListener("input", applyFilter);

document.getElementById("sync").addEventListener("click", async () => {
  await fetch("/api/pedidos/shopify/sync");
  loadOrders();
});

function selectPlatform(id) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.platform === id));
  const platform = platforms.find(p => p.id === id);
  document.getElementById("view-title").textContent = "Pedidos · " + platform.label;

  if (id === "shopify") {
    document.getElementById("view-shopify").style.display = "block";
    document.getElementById("view-placeholder").style.display = "none";
  } else {
    document.getElementById("view-shopify").style.display = "none";
    const ph = document.getElementById("view-placeholder");
    ph.style.display = "block";
    ph.textContent = platform.label + " todavía no está conectado. Lo añadiremos próximamente.";
  }
}

document.querySelectorAll(".nav-link").forEach(a => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    selectPlatform(a.dataset.platform);
  });
});

const pedidosToggle = document.getElementById("pedidos-toggle");
const pedidosList = document.getElementById("pedidos-list");
pedidosToggle.addEventListener("click", () => {
  pedidosToggle.classList.toggle("open");
  pedidosList.classList.toggle("open");
});

function connectWS() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(proto + "//" + location.host + "/pedidos/shopify/ws");
  ws.onmessage = () => loadOrders();
  ws.onclose = () => setTimeout(connectWS, 2000);
}

loadOrders();
connectWS();
</script>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response(renderPage(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (url.pathname === "/api/pedidos/shopify/sync") {
      try {
        return await handleSync(env);
      } catch (err) {
        return new Response("Sync error: " + err.message, { status: 500 });
      }
    }

    if (url.pathname === "/api/pedidos/shopify") {
      return handleGetOrders(env);
    }

    if (url.pathname === "/pedidos/shopify/ws") {
      return handleWebSocket(request, env);
    }

    if (url.pathname === "/webhooks/shopify/orders" && request.method === "POST") {
      return handleWebhook(request, env);
    }

    return new Response("not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleSync(env));
  },
};
