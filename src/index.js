export { OrdersStore } from "./orders-store.js";
export { InventoryStore } from "./inventory-store.js";

function mapOrder(order) {
  const productTitles = [];
  const serviceParts = [];
  const items = [];

  for (const item of order.line_items || []) {
    if (item.title) productTitles.push(item.title);
    for (const prop of item.properties || []) {
      if (!prop.name || !prop.value) continue;
      if (prop.name.startsWith("_")) continue;
      serviceParts.push(`${prop.name}: ${prop.value}`);
    }
    // Shopify duplica algunas líneas para adjuntar las opciones (montaje,
    // tapa...) elegidas como "properties": esa línea duplicada siempre trae
    // product_id null. Solo la línea real (con product_id) sirve para
    // resolver categoría/stock/agencia.
    if (item.product_id != null) {
      items.push({
        productId: item.product_id,
        sku: item.sku || "",
        variantTitle: item.variant_title || "",
        qty: item.quantity || 1,
      });
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
    items,
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

const RELEVANT_PRODUCT_TYPES = new Set([
  "Colchones",
  "Almohada",
  "Protector de colchón",
  "Topper",
  "Canapé",
  "Canapé fijo",
  "Base",
  "Cabecero",
  "Pack",
]);

async function fetchShopifyProducts(env) {
  const products = [];
  let url = `https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/products.json?limit=250&fields=id,title,variants,product_type`;
  while (url) {
    const res = await fetch(url, { headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN } });
    if (!res.ok) throw new Error(`Shopify API error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    products.push(...data.products);
    const link = res.headers.get("Link");
    const next = link && link.split(",").find((p) => p.includes('rel="next"'));
    url = next ? next.match(/<(.+)>/)[1] : null;
  }
  return products.filter((p) => RELEVANT_PRODUCT_TYPES.has(p.product_type));
}

function inventoryStub(env) {
  const id = env.INVENTORY_STORE.idFromName("main");
  return env.INVENTORY_STORE.get(id);
}

async function handleSyncCatalog(env) {
  const products = await fetchShopifyProducts(env);
  const stub = inventoryStub(env);
  const res = await stub.fetch("https://do/catalog/sync", {
    method: "POST",
    body: JSON.stringify(products),
  });
  return new Response(await res.text(), { headers: { "content-type": "application/json" } });
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

async function handleUpdateMeta(request, env) {
  const body = await request.json();
  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  return stub.fetch("https://do/orders/meta", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function proxyInventory(env, path, request) {
  const stub = inventoryStub(env);
  const init = request.method === "GET" ? undefined : { method: request.method, body: await request.text() };
  const res = await stub.fetch("https://do" + path, init);
  return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
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

const USERS = ["JENNIFER", "ARIADNA", "ARANTXA", "SERGIO"];
const COLOR_ACCESS_USERS = ["SERGIO"];
const COLOR_META = {
  rojo: { label: "Cancelado", bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
  verde: { label: "Entregado", bg: "#dcfce7", text: "#146138", dot: "#22c55e" },
  naranja: { label: "Enviado", bg: "#ffedd5", text: "#9a3412", dot: "#f97316" },
  amarillo: { label: "No enviado", bg: "#fef9c3", text: "#854d0e", dot: "#eab308" },
  azul: { label: "Pendiente de pago", bg: "#dbeafe", text: "#1e40af", dot: "#3b82f6" },
};

function renderPage() {
  const navItems = PLATFORMS.map(
    (p) => `<li>
        <a href="#" class="nav-link${p.ready ? " active" : ""}" data-platform="${p.id}">
          ${p.label}${p.ready ? "" : '<span class="soon">próx.</span>'}
        </a>
      </li>`
  ).join("");

  const userButtons = USERS.map((u) => `<button class="user-btn" data-user="${u}">${u}</button>`).join("");

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
  .badge.agencia-seur { background: #e0e7ff; color: #3730a3; }
  .badge.agencia-furniture { background: #fce7f3; color: #9d174d; }
  .badge.agencia-pendiente { background: #fef3c7; color: #92400e; margin-top: 4px; }
  .badge.agencia-revisar { background: #fee2e2; color: #991b1b; }
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
  .header-row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
  .user-badge { font-size: 0.85rem; color: white; opacity: 0.95; white-space: nowrap; }
  .user-badge button {
    padding: 4px 10px;
    font-size: 12px;
    margin-left: 8px;
    border-radius: 6px;
    background: rgba(255,255,255,0.15);
  }
  .user-badge button:hover { background: rgba(255,255,255,0.28); }
  .user-gate {
    position: fixed;
    inset: 0;
    background: rgba(15,61,36,0.92);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .user-gate-card {
    background: var(--panel);
    border-radius: 16px;
    padding: 2.5rem 3rem;
    text-align: center;
    box-shadow: 0 10px 40px rgba(0,0,0,0.25);
  }
  .user-gate-card h2 { margin: 0 0 1.5rem; color: var(--text); }
  .user-gate-options { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
  .user-btn {
    padding: 14px 26px;
    font-size: 15px;
    border-radius: 10px;
    background: var(--brand-light);
    color: var(--brand-dark);
    font-weight: 600;
    border: 1px solid var(--border);
  }
  .user-btn:hover { background: var(--brand); color: white; }
  .color-filter-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .color-filter-wrap label {
    font-size: 13px;
    color: var(--muted);
    font-weight: 600;
    white-space: nowrap;
  }
  #color-filter {
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 14px;
    background: white;
  }
  .estado-cell { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; white-space: normal; }
  .estado-select {
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 12.5px;
  }
  .estado-chip {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }
  .obs-input {
    width: 100%;
    min-width: 150px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 12.5px;
    font-family: inherit;
  }
  .inventario-count { color: var(--muted); font-size: 0.85rem; padding: 0 2rem 0.5rem; }
  .stock-model-input {
    width: 100%;
    min-width: 180px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 12.5px;
    font-family: inherit;
  }
  .adjust-form { display: flex; align-items: center; gap: 6px; }
  .adjust-form button {
    padding: 4px 10px;
    font-size: 13px;
    line-height: 1;
  }
  .adjust-form input {
    width: 60px;
    padding: 6px 4px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 12.5px;
    text-align: center;
  }
  .cantidad-baja { color: #991b1b; font-weight: 700; }
  .resolver-btn { padding: 6px 12px; font-size: 12.5px; }
</style>
</head>
<body>
<div id="user-gate" class="user-gate">
  <div class="user-gate-card">
    <h2>¿Quién eres?</h2>
    <div class="user-gate-options">${userButtons}</div>
  </div>
</div>
<nav class="sidebar">
  <div class="brand">Gestión HappyDeal</div>
  <button class="section-title" id="pedidos-toggle">
    <span>Pedidos</span>
    <span class="chevron">▶</span>
  </button>
  <ul id="pedidos-list">${navItems}</ul>
  <button class="section-title" id="inventario-toggle">
    <span>Inventario</span>
    <span class="chevron">▶</span>
  </button>
  <ul id="inventario-list">
    <li><a href="#" class="nav-link" data-inventario="catalogo">Catálogo</a></li>
    <li><a href="#" class="nav-link" data-inventario="stock">Stock</a></li>
    <li><a href="#" class="nav-link" data-inventario="pendientes">Pendientes de fabricante</a></li>
  </ul>
</nav>
<div class="main">
<header>
  <div class="header-row">
    <div>
      <h1 id="view-title">Pedidos · Shopify</h1>
      <p>Vista en vivo sincronizada con tu tienda</p>
    </div>
    <div class="user-badge" id="user-badge"></div>
  </div>
</header>

<div id="view-shopify">
  <div class="toolbar">
    <input id="search" type="text" placeholder="Buscar por nº de pedido o nombre..." />
    <span class="color-filter-wrap" id="color-filter-wrap" style="display:none">
      <label for="color-filter">Filtrar por estado:</label>
      <select id="color-filter">
        <option value="">Todos</option>
        <option value="rojo">🔴 Cancelado</option>
        <option value="verde">🟢 Entregado</option>
        <option value="naranja">🟠 Enviado</option>
        <option value="amarillo">🟡 No enviado</option>
        <option value="azul">🔵 Pendiente de pago</option>
      </select>
    </span>
    <button id="sync">Sincronizar ahora</button>
  </div>
  <div id="count"></div>
  <div class="table-wrap">
  <table id="orders">
    <thead>
      <tr id="orders-head-row"></tr>
    </thead>
    <tbody></tbody>
  </table>
  </div>
</div>

<div id="view-placeholder" class="placeholder" style="display:none"></div>

<div id="view-catalogo" style="display:none">
  <div class="toolbar">
    <button id="sync-catalogo">Sincronizar catálogo</button>
    <span id="catalogo-count" class="inventario-count"></span>
  </div>
  <div class="table-wrap">
    <table id="catalogo-table">
      <thead>
        <tr><th>Producto</th><th>Modelo de stock</th><th>Excepción FURNITURE</th><th>No llevamos stock</th></tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-stock" style="display:none">
  <div class="toolbar">
    <input id="stock-search" type="text" placeholder="Buscar modelo o talla..." />
  </div>
  <div id="stock-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="stock-table">
      <thead><tr><th>Modelo</th><th>Talla</th><th>Cantidad</th><th>Ajustar</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-pendientes" style="display:none">
  <div id="pendientes-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="pendientes-table">
      <thead><tr><th>Pedido</th><th>Modelo</th><th>Talla</th><th>Cantidad</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

</div>
<script>
let allOrders = [];
const platforms = ${JSON.stringify(PLATFORMS)};
const USERS = ${JSON.stringify(USERS)};
const COLOR_ACCESS_USERS = ${JSON.stringify(COLOR_ACCESS_USERS)};
const COLOR_META = ${JSON.stringify(COLOR_META)};
const BASE_HEAD = ["Nº Pedido","Nombre","Dirección de entrega","Teléfono","Producto comprado","Servicios adicionales","Método de pago","Situación de envío","Agencia","Precio"];

let currentUser = localStorage.getItem("hd_user");
let editing = false;
let pendingRefresh = false;

function hasColorAccess() {
  return COLOR_ACCESS_USERS.includes(currentUser);
}

function escapeAttr(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function statusBadge(status) {
  const s = (status || "pendiente").toLowerCase();
  const cls = s === "fulfilled" ? "fulfilled" : s === "partial" ? "partial" : "pendiente";
  const label = s === "fulfilled" ? "Enviado" : s === "partial" ? "Parcial" : "Pendiente";
  return \`<span class="badge \${cls}">\${label}</span>\`;
}

function agenciaBadge(order) {
  if (!order.agencia) return order.needsReview ? '<span class="badge agencia-revisar">Revisar</span>' : "";
  const cls = order.agencia === "FURNITURE" ? "agencia-furniture" : "agencia-seur";
  let html = \`<span class="badge \${cls}">\${order.agencia}</span>\`;
  if (order.pendingManufacture) {
    html += \`<br><span class="badge agencia-pendiente" title="\${order.pendingManufacture.modelo} \${order.pendingManufacture.talla}">Colchón pendiente</span>\`;
  }
  if (order.needsReview) {
    html += ' <span class="badge agencia-revisar">Revisar</span>';
  }
  return html;
}

function renderHead() {
  const cells = hasColorAccess() ? ["Estado", ...BASE_HEAD, "Observaciones Sergio"] : BASE_HEAD;
  document.getElementById("orders-head-row").innerHTML = cells.map(c => \`<th>\${c}</th>\`).join("");
}

function render(orders) {
  const access = hasColorAccess();
  const tbody = document.querySelector("#orders tbody");
  tbody.innerHTML = orders.map(o => {
    const baseCells = \`
      <td>BEZEN\${o.orderNumber}</td>
      <td>\${o.name}</td>
      <td>\${o.address}</td>
      <td>\${o.phone}</td>
      <td>\${o.product}</td>
      <td class="services">\${o.services}</td>
      <td>\${o.paymentMethod}</td>
      <td>\${statusBadge(o.shippingStatus)}</td>
      <td>\${agenciaBadge(o)}</td>
      <td class="price">\${o.price} \${o.currency || ""}</td>
    \`;
    if (!access) return \`<tr>\${baseCells}</tr>\`;

    const meta = COLOR_META[o.colorTag];
    const rowStyle = meta ? \`border-left: 5px solid \${meta.dot}; background-color: \${meta.bg};\` : "";
    const chip = meta ? \`<span class="estado-chip" style="background:\${meta.bg};color:\${meta.text}">\${meta.label}</span>\` : "";
    const options = Object.entries(COLOR_META).map(([key, m]) =>
      \`<option value="\${key}"\${o.colorTag === key ? " selected" : ""}>\${m.label}</option>\`
    ).join("");
    const estadoCell = \`
      <td class="estado-cell">
        <select class="estado-select" data-id="\${o.id}">
          <option value="">— Sin estado —</option>
          \${options}
        </select>
        \${chip}
      </td>\`;
    const obsCell = \`<td><input type="text" class="obs-input" data-id="\${o.id}" value="\${escapeAttr(o.observaciones)}" placeholder="Observaciones Sergio..."></td>\`;

    return \`<tr style="\${rowStyle}">\${estadoCell}\${baseCells}\${obsCell}</tr>\`;
  }).join("");
  document.getElementById("count").textContent = orders.length + " pedidos";

  if (access) {
    tbody.querySelectorAll(".estado-select").forEach(sel => {
      sel.addEventListener("change", () => {
        const order = allOrders.find(o => String(o.id) === sel.dataset.id);
        if (order) order.colorTag = sel.value || null;
        saveMeta(sel.dataset.id, { colorTag: sel.value || null });
        render(currentFiltered());
      });
    });
    tbody.querySelectorAll(".obs-input").forEach(inp => {
      inp.addEventListener("focus", () => { editing = true; });
      inp.addEventListener("blur", () => {
        editing = false;
        const order = allOrders.find(o => String(o.id) === inp.dataset.id);
        if (order) order.observaciones = inp.value;
        saveMeta(inp.dataset.id, { observaciones: inp.value });
        if (pendingRefresh) { pendingRefresh = false; loadOrders(); }
      });
    });
  }
}

async function saveMeta(id, patch) {
  try {
    await fetch("/api/pedidos/shopify/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  } catch (e) {
    console.error("No se pudo guardar", e);
  }
}

async function loadOrders() {
  const res = await fetch("/api/pedidos/shopify");
  allOrders = await res.json();
  applyFilter();
}

function currentFiltered() {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const colorFilter = hasColorAccess() ? document.getElementById("color-filter").value : "";
  let filtered = allOrders;
  if (q) {
    filtered = filtered.filter(o => ("bezen" + o.orderNumber).includes(q) || (o.name || "").toLowerCase().includes(q));
  }
  if (colorFilter) {
    filtered = filtered.filter(o => o.colorTag === colorFilter);
  }
  return filtered;
}

function applyFilter() {
  render(currentFiltered());
}

document.getElementById("search").addEventListener("input", applyFilter);
document.getElementById("color-filter").addEventListener("change", applyFilter);

function updateUserBadge() {
  const badge = document.getElementById("user-badge");
  badge.innerHTML = currentUser + ' <button id="switch-user">Cambiar</button>';
  document.getElementById("switch-user").addEventListener("click", () => {
    localStorage.removeItem("hd_user");
    location.reload();
  });
}

function onUserReady() {
  renderHead();
  document.getElementById("color-filter-wrap").style.display = hasColorAccess() ? "flex" : "none";
  updateUserBadge();
  loadOrders();
  connectWS();
}

function initUser() {
  if (!currentUser || !USERS.includes(currentUser)) {
    document.getElementById("user-gate").style.display = "flex";
  } else {
    onUserReady();
  }
}

document.querySelectorAll(".user-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    currentUser = btn.dataset.user;
    localStorage.setItem("hd_user", currentUser);
    document.getElementById("user-gate").style.display = "none";
    onUserReady();
  });
});

document.getElementById("sync").addEventListener("click", async () => {
  await fetch("/api/pedidos/shopify/sync");
  loadOrders();
});

const ALL_VIEWS = ["view-shopify", "view-placeholder", "view-catalogo", "view-stock", "view-pendientes"];
function hideAllViews() {
  ALL_VIEWS.forEach(id => { document.getElementById(id).style.display = "none"; });
}

function selectPlatform(id) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.platform === id));
  const platform = platforms.find(p => p.id === id);
  document.getElementById("view-title").textContent = "Pedidos · " + platform.label;
  hideAllViews();

  if (id === "shopify") {
    document.getElementById("view-shopify").style.display = "block";
  } else {
    const ph = document.getElementById("view-placeholder");
    ph.style.display = "block";
    ph.textContent = platform.label + " todavía no está conectado. Lo añadiremos próximamente.";
  }
}

const INVENTARIO_LABELS = { catalogo: "Catálogo", stock: "Stock", pendientes: "Pendientes de fabricante" };
function selectInventario(id) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.inventario === id));
  document.getElementById("view-title").textContent = "Inventario · " + INVENTARIO_LABELS[id];
  hideAllViews();
  document.getElementById("view-" + id).style.display = "block";
  if (id === "catalogo") loadCatalogo();
  if (id === "stock") loadStock();
  if (id === "pendientes") loadPendientes();
}

document.querySelectorAll(".nav-link").forEach(a => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    if (a.dataset.platform) selectPlatform(a.dataset.platform);
    else if (a.dataset.inventario) selectInventario(a.dataset.inventario);
  });
});

const pedidosToggle = document.getElementById("pedidos-toggle");
const pedidosList = document.getElementById("pedidos-list");
pedidosToggle.addEventListener("click", () => {
  pedidosToggle.classList.toggle("open");
  pedidosList.classList.toggle("open");
});

const inventarioToggle = document.getElementById("inventario-toggle");
const inventarioListEl = document.getElementById("inventario-list");
inventarioToggle.addEventListener("click", () => {
  inventarioToggle.classList.toggle("open");
  inventarioListEl.classList.toggle("open");
});

let catalogoProducts = [];
async function loadCatalogo() {
  const res = await fetch("/api/inventario/catalogo");
  catalogoProducts = await res.json();
  renderCatalogo();
}

function renderCatalogo() {
  const colchones = catalogoProducts
    .filter(p => p.product_type === "Colchones")
    .sort((a, b) => a.title.localeCompare(b.title));
  const tbody = document.querySelector("#catalogo-table tbody");
  tbody.innerHTML = colchones.map(p => \`
    <tr>
      <td>\${p.title}</td>
      <td><input type="text" class="stock-model-input" data-id="\${p.productId}" value="\${escapeAttr(p.stockModel)}"></td>
      <td><input type="checkbox" class="exception-check" data-id="\${p.productId}"\${p.exceptionFurniture ? " checked" : ""}></td>
      <td><input type="checkbox" class="nostock-check" data-id="\${p.productId}"\${p.noStock ? " checked" : ""}></td>
    </tr>
  \`).join("");
  document.getElementById("catalogo-count").textContent = colchones.length + " modelos de colchón";

  tbody.querySelectorAll(".stock-model-input").forEach(inp => {
    inp.addEventListener("change", () => saveCatalogoFlags(inp.dataset.id, { stockModel: inp.value }));
  });
  tbody.querySelectorAll(".exception-check").forEach(chk => {
    chk.addEventListener("change", () => saveCatalogoFlags(chk.dataset.id, { exceptionFurniture: chk.checked }));
  });
  tbody.querySelectorAll(".nostock-check").forEach(chk => {
    chk.addEventListener("change", () => saveCatalogoFlags(chk.dataset.id, { noStock: chk.checked }));
  });
}

async function saveCatalogoFlags(productId, patch) {
  await fetch("/api/inventario/catalogo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productId: Number(productId), ...patch }),
  });
  loadCatalogo();
}

document.getElementById("sync-catalogo").addEventListener("click", async () => {
  await fetch("/api/inventario/sync");
  loadCatalogo();
});

let stockRows = [];
async function loadStock() {
  const res = await fetch("/api/inventario/stock");
  stockRows = await res.json();
  renderStock();
}

function renderStock() {
  const q = document.getElementById("stock-search").value.trim().toLowerCase();
  const filtered = q
    ? stockRows.filter(r => r.stockModel.toLowerCase().includes(q) || r.talla.toLowerCase().includes(q))
    : stockRows;
  const sorted = [...filtered].sort((a, b) => a.stockModel.localeCompare(b.stockModel) || a.talla.localeCompare(b.talla));
  const tbody = document.querySelector("#stock-table tbody");
  tbody.innerHTML = sorted.map(r => \`
    <tr>
      <td>\${r.stockModel}</td>
      <td>\${r.talla}</td>
      <td class="\${r.cantidad <= 0 ? "cantidad-baja" : ""}">\${r.cantidad}</td>
      <td>
        <span class="adjust-form">
          <button type="button" class="stock-adjust" data-model="\${escapeAttr(r.stockModel)}" data-talla="\${escapeAttr(r.talla)}" data-delta="-1">−</button>
          <button type="button" class="stock-adjust" data-model="\${escapeAttr(r.stockModel)}" data-talla="\${escapeAttr(r.talla)}" data-delta="1">+</button>
        </span>
      </td>
    </tr>
  \`).join("");
  document.getElementById("stock-count").textContent = sorted.length + " artículos";

  tbody.querySelectorAll(".stock-adjust").forEach(btn => {
    btn.addEventListener("click", () => adjustStock(btn.dataset.model, btn.dataset.talla, Number(btn.dataset.delta)));
  });
}

async function adjustStock(stockModel, talla, delta) {
  await fetch("/api/inventario/stock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stockModel, talla, delta }),
  });
  loadStock();
}

document.getElementById("stock-search").addEventListener("input", renderStock);

let backorders = [];
async function loadPendientes() {
  const res = await fetch("/api/inventario/pendientes");
  backorders = await res.json();
  renderPendientes();
}

function renderPendientes() {
  const pendientes = backorders.filter(b => b.estado === "pendiente");
  const tbody = document.querySelector("#pendientes-table tbody");
  tbody.innerHTML = pendientes.map(b => \`
    <tr>
      <td>BEZEN\${b.orderNumber}</td>
      <td>\${b.modelo}</td>
      <td>\${b.talla}</td>
      <td>\${b.cantidad}</td>
      <td>\${new Date(b.fecha).toLocaleDateString("es-ES")}</td>
      <td>Pendiente</td>
      <td><button type="button" class="resolver-btn" data-id="\${b.id}">Marcar recibido</button></td>
    </tr>
  \`).join("");
  document.getElementById("pendientes-count").textContent = pendientes.length + " colchones pendientes de fabricante";

  tbody.querySelectorAll(".resolver-btn").forEach(btn => {
    btn.addEventListener("click", () => resolverPendiente(btn.dataset.id));
  });
}

async function resolverPendiente(id) {
  await fetch("/api/inventario/pendientes/" + encodeURIComponent(id) + "/resolver", { method: "POST" });
  loadPendientes();
}

function connectWS() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(proto + "//" + location.host + "/pedidos/shopify/ws");
  ws.onmessage = () => {
    if (editing) { pendingRefresh = true; } else { loadOrders(); }
  };
  ws.onclose = () => setTimeout(connectWS, 2000);
}

initUser();
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

    if (url.pathname === "/api/pedidos/shopify/meta" && request.method === "POST") {
      return handleUpdateMeta(request, env);
    }

    if (url.pathname === "/pedidos/shopify/ws") {
      return handleWebSocket(request, env);
    }

    if (url.pathname === "/webhooks/shopify/orders" && request.method === "POST") {
      return handleWebhook(request, env);
    }

    if (url.pathname === "/api/inventario/sync") {
      try {
        return await handleSyncCatalog(env);
      } catch (err) {
        return new Response("Sync error: " + err.message, { status: 500 });
      }
    }

    if (url.pathname === "/api/inventario/catalogo" && request.method === "GET") {
      return proxyInventory(env, "/catalog", request);
    }

    if (url.pathname === "/api/inventario/catalogo" && request.method === "POST") {
      return proxyInventory(env, "/catalog/flags", request);
    }

    if (url.pathname === "/api/inventario/stock" && request.method === "GET") {
      return proxyInventory(env, "/stock", request);
    }

    if (url.pathname === "/api/inventario/stock" && request.method === "POST") {
      return proxyInventory(env, "/stock/adjust", request);
    }

    if (url.pathname === "/api/inventario/pendientes" && request.method === "GET") {
      return proxyInventory(env, "/backorders", request);
    }

    const resolvePendingMatch = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/resolver$/);
    if (resolvePendingMatch && request.method === "POST") {
      return proxyInventory(env, `/backorders/${resolvePendingMatch[1]}/resolver`, request);
    }

    return new Response("not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleSync(env));
  },
};
