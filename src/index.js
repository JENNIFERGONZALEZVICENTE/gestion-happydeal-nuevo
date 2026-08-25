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
    orderDate: order.created_at || "",
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

async function handleReviewNote(request, env) {
  const body = await request.json();
  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  return stub.fetch("https://do/orders/review-note", {
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
  .bell-cell { text-align: center; width: 1%; }
  .review-bell {
    background: none;
    border: none;
    cursor: pointer;
    line-height: 1;
    padding: 2px;
    color: #ea580c;
    animation: bell-pulse 1.6s infinite;
  }
  .review-bell svg { width: 20px; height: 20px; display: block; }
  .review-bell.answered { animation: none; color: #16a34a; }
  @keyframes bell-pulse {
    0%, 100% { transform: rotate(0); }
    10% { transform: rotate(-15deg); }
    20% { transform: rotate(12deg); }
    30% { transform: rotate(-8deg); }
    40% { transform: rotate(4deg); }
    50% { transform: rotate(0); }
  }
  .modal-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(15, 61, 36, 0.45);
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .modal-overlay.open { display: flex; }
  .modal-box {
    background: var(--panel, #fff);
    border-radius: 12px;
    padding: 1.5rem;
    width: min(480px, 90vw);
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 12px 40px rgba(0,0,0,0.25);
  }
  .modal-box h3 { margin: 0 0 0.75rem; color: var(--brand-dark); }
  .review-question { margin-bottom: 1.1rem; }
  .review-question:last-child { margin-bottom: 0; }
  .review-question p { background: #fef3c7; color: #92400e; border-radius: 8px; padding: 0.6rem 0.85rem; margin: 0 0 0.5rem; font-size: 13.5px; }
  .modal-box textarea { width: 100%; min-height: 60px; box-sizing: border-box; padding: 0.6rem; border: 1px solid var(--border); border-radius: 8px; font: inherit; resize: vertical; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1rem; }
  .modal-actions button.secondary { background: transparent; color: var(--brand-dark); border: 1px solid var(--border); }
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
  .quickform {
    margin: 0 2rem 1rem;
    padding: 1.25rem 1.5rem;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .quickform h3 { margin: 0 0 0.75rem; font-size: 0.95rem; color: var(--text); }
  .quickform .toolbar { padding: 0; }
  .quickform select, .quickform input[type="text"] {
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 14px;
    background: white;
  }
  #quick-query { min-width: 260px; }
  #quick-talla { width: 160px; }
  #quick-qty { width: 80px; padding: 10px 8px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; }
  #quick-baja { background: var(--muted); }
  #quick-baja:hover { background: #4a5a52; }
  #color-filter, #stock-model-select {
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 14px;
    background: white;
  }
  #stock-model-select { min-width: 520px; width: 100%; max-width: 640px; }
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
  .stock-model-input, .sku-input, .alt-sku-input {
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
  .fabricacion-input { width: 100%; min-width: 220px; min-height: 54px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; font: inherit; resize: vertical; }
  #pendientes-filter-row th { padding: 4px 8px; background: var(--panel); position: sticky; top: 34px; }
  #pendientes-filter-row input { width: 100%; box-sizing: border-box; padding: 4px 6px; font-size: 12.5px; font-weight: 400; text-transform: none; border: 1px solid var(--border); border-radius: 4px; }
  .pedido-generado-tag { display: block; font-size: 13px; font-weight: 600; color: #146138; margin-top: 4px; }
  tr.fila-pedido-generado { background: #eafaf0; }
  tr.fila-pedido-generado:hover { background: #d9f5e3; }
  tr.fila-grupo-inicio td, tr.fila-grupo-medio td, tr.fila-grupo-fin td { border-left: 2px solid var(--brand); border-right: 2px solid var(--brand); }
  tr.fila-grupo-inicio td { border-top: 2px solid var(--brand); }
  tr.fila-grupo-fin td { border-bottom: 2px solid var(--brand); }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
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
    <li><a href="#" class="nav-link" data-inventario="historial">Historial de stock</a></li>
  </ul>
  <button class="section-title" id="proveedores-toggle">
    <span>Proveedores</span>
    <span class="chevron">▶</span>
  </button>
  <ul id="proveedores-list">
    <li><a href="#" class="nav-link" data-proveedores="polival">Polival</a></li>
    <li><a href="#" class="nav-link" data-proveedores="luso">Luso</a></li>
    <li><a href="#" class="nav-link" data-proveedores="new">New</a></li>
    <li><a href="#" class="nav-link" data-proveedores="decision">Pendiente de decisión</a></li>
    <li><a href="#" class="nav-link" data-proveedores="revisar">Sin proveedor</a></li>
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
        <tr><th>Producto</th><th>Modelo de stock</th><th>SKU (Shopify)</th><th>SKU alternativos (otras plataformas)</th><th>Proveedor</th><th>Excepción FURNITURE</th><th>No llevamos stock</th></tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-stock" style="display:none">
  <div class="quickform">
    <h3>Dar de alta / baja</h3>
    <div class="toolbar">
      <select id="quick-mode">
        <option value="nombre">Por nombre</option>
        <option value="sku">Por SKU</option>
      </select>
      <input id="quick-query" type="text" list="stock-models-datalist" placeholder="Nombre del modelo..." autocomplete="off" />
      <input id="quick-talla" type="text" placeholder="Talla (ej. 150x190)" autocomplete="off" />
      <input id="quick-qty" type="number" min="1" value="1" />
      <button id="quick-alta" type="button">Dar de alta (+)</button>
      <button id="quick-baja" type="button">Dar de baja (−)</button>
    </div>
    <div id="quick-result" class="inventario-count"></div>
  </div>
  <div class="toolbar">
    <input id="stock-model-select" type="text" list="stock-models-datalist" placeholder="Escribe o elige un modelo..." autocomplete="off" />
    <datalist id="stock-models-datalist"></datalist>
    <datalist id="stock-skus-datalist"></datalist>
  </div>
  <div id="stock-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="stock-table">
      <thead><tr><th>Talla</th><th>Stock real</th><th>Vendido pendiente</th><th>Pedido a proveedor</th><th>Disponible al llegar</th><th>Ajustar</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-pendientes" style="display:none">
  <div class="toolbar" id="pendientes-toolbar" style="display:none">
    <button type="button" id="generar-pedido-btn" disabled>Generar pedido a fábrica (PDF)</button>
    <span id="seleccion-count" class="inventario-count" style="padding:0"></span>
  </div>
  <div id="pendientes-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="pendientes-table">
      <thead>
        <tr><th id="pendientes-check-head" style="display:none"></th><th>Pedido</th><th>Modelo</th><th id="pendientes-refpolival-head" style="display:none">Ref. Polival</th><th>Mercancía para pedir a fábrica</th><th>Color</th><th>Talla</th><th>Cantidad</th><th>Fecha del pedido</th><th>FUR/FPK</th><th id="pendientes-camion-head">Camión estimado</th><th>Recibido de fábrica</th></tr>
        <tr id="pendientes-filter-row">
          <th></th>
          <th><input id="pendientes-pedido-search" type="text" placeholder="Filtrar..." /></th>
          <th></th>
          <th id="pendientes-refpolival-filter" style="display:none"><input id="pendientes-referencia-search" type="text" placeholder="Filtrar..." /></th>
          <th></th><th></th><th></th><th></th><th></th><th></th><th></th><th></th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-historial" style="display:none">
  <div id="historial-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="historial-table">
      <thead><tr><th>Fecha</th><th>Modelo</th><th>Talla</th><th>Campo</th><th>Cambio</th><th>Resultado</th><th>Origen</th><th>Detalle</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>


<div class="modal-overlay" id="review-modal-overlay">
  <div class="modal-box">
    <h3 id="review-modal-title">Revisar pedido</h3>
    <div id="review-modal-questions"></div>
    <div class="modal-actions">
      <button type="button" class="secondary" id="review-modal-cancel">Cerrar</button>
      <button type="button" id="review-modal-save">Guardar</button>
    </div>
  </div>
</div>

</div>
<script>
let allOrders = [];
const platforms = ${JSON.stringify(PLATFORMS)};
const USERS = ${JSON.stringify(USERS)};
const COLOR_ACCESS_USERS = ${JSON.stringify(COLOR_ACCESS_USERS)};
const COLOR_META = ${JSON.stringify(COLOR_META)};
const BASE_HEAD = ["","Nº Pedido","Fecha","Nombre","Dirección de entrega","Teléfono","Producto comprado","Servicios adicionales","Método de pago","Situación de envío","Agencia","Precio"];

let currentUser = localStorage.getItem("hd_user");
let editing = false;
let pendingRefresh = false;

function hasColorAccess() {
  return COLOR_ACCESS_USERS.includes(currentUser);
}

function escapeAttr(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatOrderDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES");
}

function statusBadge(status) {
  const s = (status || "pendiente").toLowerCase();
  const cls = s === "fulfilled" ? "fulfilled" : s === "partial" ? "partial" : "pendiente";
  const label = s === "fulfilled" ? "Enviado" : s === "partial" ? "Parcial" : "Pendiente";
  return \`<span class="badge \${cls}">\${label}</span>\`;
}

function isReviewAnswered(order) {
  const reasons = order.reviewReasons || [];
  const answers = order.reviewAnswers || [];
  return reasons.length > 0 && reasons.every((r, i) => (answers[i] || "").trim());
}

function reviewBell(order) {
  if (!order.needsReview) return "";
  const answered = isReviewAnswered(order);
  const cls = answered ? "review-bell answered" : "review-bell";
  const title = answered ? "Ya tiene instrucciones — clic para ver/editar" : "Este pedido necesita una decisión — clic para revisar";
  const icon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a1 1 0 0 1 1 1v1.06A7.002 7.002 0 0 1 19 11v3.586l1.707 1.707A1 1 0 0 1 20 18H4a1 1 0 0 1-.707-1.707L5 14.586V11a7.002 7.002 0 0 1 6-6.94V3a1 1 0 0 1 1-1zm0 20a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22z"/></svg>';
  return \`<button type="button" class="\${cls}" data-review-id="\${order.id}" title="\${escapeAttr(title)}">\${icon}</button>\`;
}

function agenciaBadge(order) {
  if (!order.agencia) return "";
  const cls = order.agencia === "FURNITURE" ? "agencia-furniture" : "agencia-seur";
  let html = \`<span class="badge \${cls}">\${order.agencia}</span>\`;
  if (order.pendingManufacture) {
    html += \`<br><span class="badge agencia-pendiente" title="\${order.pendingManufacture.modelo} \${order.pendingManufacture.talla}">Colchón pendiente</span>\`;
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
      <td class="bell-cell">\${reviewBell(o)}</td>
      <td>BEZEN\${o.orderNumber}</td>
      <td>\${formatOrderDate(o.orderDate)}</td>
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

let reviewModalOrderId = null;
function openReviewModal(order) {
  reviewModalOrderId = order.id;
  document.getElementById("review-modal-title").textContent = "Revisar pedido BEZEN" + order.orderNumber;
  const reasons = order.reviewReasons || [];
  const answers = order.reviewAnswers || [];
  const questionsEl = document.getElementById("review-modal-questions");
  questionsEl.innerHTML = reasons.length
    ? reasons.map((r, i) => \`
        <div class="review-question">
          <p>\${r}</p>
          <textarea class="review-answer-input" data-index="\${i}" placeholder="Tu decisión para esto...">\${escapeAttr(answers[i] || "")}</textarea>
        </div>
      \`).join("")
    : "<p>Este pedido está marcado para revisar.</p>";
  document.getElementById("review-modal-overlay").classList.add("open");
}
function closeReviewModal() {
  document.getElementById("review-modal-overlay").classList.remove("open");
  reviewModalOrderId = null;
}
document.getElementById("review-modal-cancel").addEventListener("click", closeReviewModal);
document.getElementById("review-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "review-modal-overlay") closeReviewModal();
});
document.getElementById("review-modal-save").addEventListener("click", async () => {
  if (reviewModalOrderId == null) return;
  const inputs = document.querySelectorAll("#review-modal-questions .review-answer-input");
  const answers = [];
  inputs.forEach(inp => { answers[Number(inp.dataset.index)] = inp.value; });
  await fetch("/api/pedidos/shopify/review-note", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: reviewModalOrderId, reviewAnswers: answers }),
  });
  const order = allOrders.find(o => String(o.id) === String(reviewModalOrderId));
  if (order) order.reviewAnswers = answers;
  closeReviewModal();
  render(currentFiltered());
  if (document.getElementById("view-pendientes").style.display !== "none") loadPendientes();
});
document.querySelector("#orders tbody").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-review-id]");
  if (!btn) return;
  const order = allOrders.find(o => String(o.id) === btn.dataset.reviewId);
  if (order) openReviewModal(order);
});

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
document.getElementById("pendientes-referencia-search").addEventListener("input", renderPendientes);
document.getElementById("pendientes-pedido-search").addEventListener("input", renderPendientes);
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

const ALL_VIEWS = ["view-shopify", "view-placeholder", "view-catalogo", "view-stock", "view-pendientes", "view-historial"];
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

const INVENTARIO_LABELS = { catalogo: "Catálogo", stock: "Stock", historial: "Historial de stock" };
function selectInventario(id) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.inventario === id));
  document.getElementById("view-title").textContent = "Inventario · " + INVENTARIO_LABELS[id];
  hideAllViews();
  document.getElementById("view-" + id).style.display = "block";
  if (id === "catalogo") loadCatalogo();
  if (id === "stock") loadStock();
  if (id === "historial") loadHistorial();
}

const PROVEEDORES_LABELS = { polival: "Polival", luso: "Luso", new: "New", decision: "Pendiente de decisión", revisar: "Sin proveedor asignado" };
let currentProveedorFilter = "polival";
function selectProveedores(id) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.proveedores === id));
  document.getElementById("view-title").textContent = "Proveedores · " + PROVEEDORES_LABELS[id];
  hideAllViews();
  document.getElementById("view-pendientes").style.display = "block";
  currentProveedorFilter = id;
  loadPendientes();
}

document.querySelectorAll(".nav-link").forEach(a => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    if (a.dataset.platform) selectPlatform(a.dataset.platform);
    else if (a.dataset.inventario) selectInventario(a.dataset.inventario);
    else if (a.dataset.proveedores) selectProveedores(a.dataset.proveedores);
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

const proveedoresToggle = document.getElementById("proveedores-toggle");
const proveedoresListEl = document.getElementById("proveedores-list");
proveedoresToggle.addEventListener("click", () => {
  proveedoresToggle.classList.toggle("open");
  proveedoresListEl.classList.toggle("open");
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
      <td><input type="text" class="sku-input" data-id="\${p.productId}" value="\${escapeAttr(p.skuPrefix)}" placeholder="ej. COLZNIR"></td>
      <td><input type="text" class="alt-sku-input" data-id="\${p.productId}" value="\${escapeAttr((p.altSkuPrefixes || []).join(", "))}" placeholder="ej. COLPHAR, AURORA"></td>
      <td>
        <select class="proveedor-select" data-id="\${p.productId}">
          <option value=""\${!p.proveedor ? " selected" : ""}>— sin asignar —</option>
          <option value="POLIVAL"\${p.proveedor === "POLIVAL" ? " selected" : ""}>Polival</option>
          <option value="LUSO"\${p.proveedor === "LUSO" ? " selected" : ""}>Luso</option>
          <option value="NEW"\${p.proveedor === "NEW" ? " selected" : ""}>New</option>
        </select>
      </td>
      <td><input type="checkbox" class="exception-check" data-id="\${p.productId}"\${p.exceptionFurniture ? " checked" : ""}></td>
      <td><input type="checkbox" class="nostock-check" data-id="\${p.productId}"\${p.noStock ? " checked" : ""}></td>
    </tr>
  \`).join("");
  document.getElementById("catalogo-count").textContent = colchones.length + " modelos de colchón";

  tbody.querySelectorAll(".stock-model-input").forEach(inp => {
    inp.addEventListener("change", () => saveCatalogoFlags(inp.dataset.id, { stockModel: inp.value }));
  });
  tbody.querySelectorAll(".sku-input").forEach(inp => {
    inp.addEventListener("change", () => saveCatalogoFlags(inp.dataset.id, { skuPrefix: inp.value.toUpperCase() }));
  });
  tbody.querySelectorAll(".alt-sku-input").forEach(inp => {
    inp.addEventListener("change", () => saveCatalogoFlags(inp.dataset.id, { altSkuPrefixes: inp.value }));
  });
  tbody.querySelectorAll(".proveedor-select").forEach(sel => {
    sel.addEventListener("change", () => saveCatalogoFlags(sel.dataset.id, { proveedor: sel.value }));
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
  const [stockRes, catalogoRes] = await Promise.all([
    fetch("/api/inventario/stock"),
    fetch("/api/inventario/catalogo"),
  ]);
  stockRows = await stockRes.json();
  catalogoProducts = await catalogoRes.json();
  populateStockModelSelect();
  populateStockSkuDatalist();
  renderStock();
}

function populateStockModelSelect() {
  const datalist = document.getElementById("stock-models-datalist");
  const models = [...new Set(stockRows.map(r => r.stockModel))].sort((a, b) => a.localeCompare(b));
  datalist.innerHTML = models.map(m => \`<option value="\${escapeAttr(m)}"></option>\`).join("");
}

function populateStockSkuDatalist() {
  const datalist = document.getElementById("stock-skus-datalist");
  const skus = new Set();
  for (const p of catalogoProducts) {
    if (p.skuPrefix) skus.add(p.skuPrefix);
    for (const alt of p.altSkuPrefixes || []) skus.add(alt);
  }
  const sorted = [...skus].sort((a, b) => a.localeCompare(b));
  datalist.innerHTML = sorted.map(s => \`<option value="\${escapeAttr(s)}"></option>\`).join("");
}

function parseTalla(talla) {
  const m = (talla || "").match(/^(\\d+)X(\\d+)$/);
  if (m) return [Number(m[1]), Number(m[2])];
  const n = Number(talla);
  return [Number.isNaN(n) ? Infinity : n, 0];
}

function compareTalla(a, b) {
  const [aw, ah] = parseTalla(a);
  const [bw, bh] = parseTalla(b);
  return aw - bw || ah - bh;
}

function renderStock() {
  const typed = document.getElementById("stock-model-select").value.trim();
  const tbody = document.querySelector("#stock-table tbody");

  if (!typed) {
    tbody.innerHTML = "";
    document.getElementById("stock-count").textContent = "Escribe o elige un modelo para ver su stock.";
    return;
  }

  const model = stockRows.find(r => r.stockModel === typed) ? typed
    : (stockRows.find(r => r.stockModel.toLowerCase() === typed.toLowerCase())?.stockModel || null);

  if (!model) {
    tbody.innerHTML = "";
    document.getElementById("stock-count").textContent = "No hay ningún modelo que coincida exactamente con \\"" + typed + "\\".";
    return;
  }

  const sorted = stockRows.filter(r => r.stockModel === model).sort((a, b) => compareTalla(a.talla, b.talla));
  tbody.innerHTML = sorted.map(r => {
    const pedido = r.pedidoProveedor || 0;
    const disponible = pedido - (r.vendidoPendiente || 0);
    return \`
    <tr>
      <td>\${r.talla}</td>
      <td class="\${r.cantidad <= 0 ? "cantidad-baja" : ""}">\${r.cantidad}</td>
      <td class="\${r.vendidoPendiente > 0 ? "cantidad-baja" : ""}">\${r.vendidoPendiente || 0}</td>
      <td>\${pedido}</td>
      <td class="\${disponible < 0 ? "cantidad-baja" : ""}">\${disponible}</td>
      <td>
        <span class="adjust-form">
          <button type="button" class="stock-adjust" data-field="cantidad" data-model="\${escapeAttr(r.stockModel)}" data-talla="\${escapeAttr(r.talla)}" data-delta="-1">−</button>
          <button type="button" class="stock-adjust" data-field="cantidad" data-model="\${escapeAttr(r.stockModel)}" data-talla="\${escapeAttr(r.talla)}" data-delta="1">+</button>
        </span>
      </td>
    </tr>
  \`;
  }).join("");
  document.getElementById("stock-count").textContent = sorted.length + " tallas de " + model;

  tbody.querySelectorAll(".stock-adjust").forEach(btn => {
    btn.addEventListener("click", () => adjustStock(btn.dataset.model, btn.dataset.talla, Number(btn.dataset.delta), btn.dataset.field));
  });
}

async function adjustStock(stockModel, talla, delta, field) {
  await fetch("/api/inventario/stock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stockModel, talla, delta, field, usuario: currentUser }),
  });
  loadStock();
}

function updateQuickModeUI() {
  const mode = document.getElementById("quick-mode").value;
  const query = document.getElementById("quick-query");
  query.setAttribute("list", mode === "sku" ? "stock-skus-datalist" : "stock-models-datalist");
  query.placeholder = mode === "sku" ? "SKU (ej. COLZNIR)..." : "Nombre del modelo...";
}
document.getElementById("quick-mode").addEventListener("change", updateQuickModeUI);

async function quickAdjust(sign) {
  const mode = document.getElementById("quick-mode").value;
  const query = document.getElementById("quick-query").value.trim();
  const talla = document.getElementById("quick-talla").value.trim();
  const qty = Math.max(1, Number(document.getElementById("quick-qty").value) || 1);
  const resultEl = document.getElementById("quick-result");

  if (!query || !talla) {
    resultEl.textContent = "Rellena el modelo/SKU y la talla.";
    return;
  }

  const res = await fetch("/api/inventario/stock/adjust-by-lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, mode, talla, delta: sign * qty, usuario: currentUser }),
  });
  const body = await res.json();

  if (!res.ok) {
    resultEl.textContent = body.error || "No se ha encontrado el artículo.";
    return;
  }

  resultEl.textContent = "Actualizado: " + body.stockModel + " " + body.talla + " → " + body.cantidad + " unidades.";
  document.getElementById("quick-query").value = "";
  document.getElementById("quick-talla").value = "";
  document.getElementById("quick-qty").value = "1";
  document.getElementById("stock-model-select").value = body.stockModel;
  await loadStock();
}

document.getElementById("quick-alta").addEventListener("click", () => quickAdjust(1));
document.getElementById("quick-baja").addEventListener("click", () => quickAdjust(-1));

document.getElementById("stock-model-select").addEventListener("input", renderStock);

let backorders = [];
async function loadPendientes() {
  const res = await fetch("/api/inventario/pendientes");
  backorders = await res.json();
  renderPendientes();
}

let pedidoFabricaSeleccion = new Set();
function renderPendientes() {
  const busquedaReferencia = document.getElementById("pendientes-referencia-search").value.trim().toLowerCase();
  const busquedaPedido = document.getElementById("pendientes-pedido-search").value.trim().toLowerCase();
  const pendientes = backorders.filter(b => {
    if (b.estado !== "pendiente") return false;
    if (busquedaReferencia && !(b.referencia || "").toLowerCase().includes(busquedaReferencia)) return false;
    if (busquedaPedido && !("bezen" + b.orderNumber).includes(busquedaPedido)) return false;
    if (currentProveedorFilter === "decision") return !!b.pendingDecision;
    if (b.pendingDecision) return false;
    if (currentProveedorFilter === "revisar") return !b.proveedor;
    return b.proveedor === currentProveedorFilter.toUpperCase();
  });
  const tbody = document.querySelector("#pendientes-table tbody");
  const isDecisionTab = currentProveedorFilter === "decision";
  const showCheckbox = ["polival", "luso", "new"].includes(currentProveedorFilter);
  document.getElementById("pendientes-check-head").style.display = showCheckbox ? "" : "none";
  document.getElementById("pendientes-toolbar").style.display = showCheckbox ? "flex" : "none";
  if (!showCheckbox) pedidoFabricaSeleccion.clear();
  // En Polival nunca hay colchones de pack (esos van en Luso/New), así que
  // "Camión estimado" (que solo aplica a esos) siempre saldría vacío ahí —
  // Jennifer pidió quitarla directamente en esa pestaña.
  const showCamionCol = currentProveedorFilter !== "polival";
  document.getElementById("pendientes-camion-head").style.display = showCamionCol ? "" : "none";
  const showRefPolivalCol = currentProveedorFilter === "polival";
  document.getElementById("pendientes-refpolival-head").style.display = showRefPolivalCol ? "" : "none";
  document.getElementById("pendientes-refpolival-filter").style.display = showRefPolivalCol ? "" : "none";

  // Varios artículos del mismo pedido se agrupan visualmente en un mismo
  // recuadro (Jennifer, 2026-08-25) — cada uno sigue en su fila (para
  // poder editarlos por separado) pero con un borde que los rodea juntos.
  const pendientesOrdenadas = [...pendientes].sort((a, b) => a.orderNumber - b.orderNumber);
  tbody.innerHTML = pendientesOrdenadas.map((b, i) => {
    const anterior = pendientesOrdenadas[i - 1];
    const siguiente = pendientesOrdenadas[i + 1];
    const mismoAnterior = anterior && anterior.orderNumber === b.orderNumber;
    const mismoSiguiente = siguiente && siguiente.orderNumber === b.orderNumber;
    let grupoClass = "";
    if (!mismoAnterior && mismoSiguiente) grupoClass = "fila-grupo-inicio";
    else if (mismoAnterior && mismoSiguiente) grupoClass = "fila-grupo-medio";
    else if (mismoAnterior && !mismoSiguiente) grupoClass = "fila-grupo-fin";
    const esPackColchon = b.esPack && b.tipo === "colchon";
    const tipoEnvioSelect = esPackColchon
      ? \`<select class="tipo-envio-select" data-id="\${b.id}">
           <option value="FPK"\${b.tipoEnvio === "FPK" ? " selected" : ""}>FPKBEZEN\${b.orderNumber} (independiente)</option>
           <option value="FUR"\${b.tipoEnvio === "FUR" ? " selected" : ""}>FURBEZEN\${b.orderNumber} (junto)</option>
         </select>\`
      : "";
    // En "Pendiente de decisión" se puede corregir directamente lo que
    // aplique (FUR/FPK si es un colchón de pack) y además responder a la
    // pregunta de texto (ej. confirmar qué artículo era del catálogo).
    const referenciaCell = isDecisionTab
      ? \`\${tipoEnvioSelect}<button type="button" class="responder-btn" data-order="\${b.orderNumber}">Responder dudas</button>\`
      : (tipoEnvioSelect || "—");
    const fechaCell = !showCamionCol
      ? ""
      : esPackColchon
      ? \`<td><input type="date" class="fecha-camion-input" data-id="\${b.id}" value="\${b.fechaEstimadaLlegada ? b.fechaEstimadaLlegada.slice(0, 10) : ""}"></td>\`
      : "<td>—</td>";
    const checkCell = showCheckbox
      ? \`<td><input type="checkbox" class="pendiente-check" data-id="\${b.id}"\${pedidoFabricaSeleccion.has(b.id) ? " checked" : ""}></td>\`
      : "<td></td>";
    const pedidoTag = b.pedidoGenerado
      ? \`<span class="pedido-generado-tag">✓ Pedido a fábrica \${new Date(b.fechaPedidoFabrica).toLocaleDateString("es-ES")}</span>\`
      : "";
    const refPolivalCell = showRefPolivalCol
      ? \`<td><input type="text" class="referencia-input" data-id="\${b.id}" value="\${escapeAttr(b.referencia || "")}" placeholder="ref."></td>\`
      : "";
    return \`
    <tr class="\${[b.pedidoGenerado ? "fila-pedido-generado" : "", grupoClass].filter(Boolean).join(" ")}">
      \${checkCell}
      <td>BEZEN\${b.orderNumber}</td>
      <td>\${b.stockModel}\${pedidoTag}</td>
      \${refPolivalCell}
      <td><textarea class="fabricacion-input" data-id="\${b.id}" placeholder="cómo pedirlo a fábrica...">\${escapeAttr(b.mercanciaFabrica != null ? b.mercanciaFabrica : (b.nombreFabricacion || ""))}</textarea></td>
      <td>\${b.color || "—"}</td>
      <td>\${b.talla}</td>
      <td>\${b.cantidad}</td>
      <td>\${new Date(b.fecha).toLocaleDateString("es-ES")}</td>
      <td>\${referenciaCell}</td>
      \${fechaCell}
      <td><button type="button" class="resolver-btn" data-id="\${b.id}">\${b.recibidoFabrica ? "✓ Recibido" : "Marcar recibido"}</button></td>
    </tr>
  \`;
  }).join("");
  document.getElementById("pendientes-count").textContent = pendientes.length + " artículos pendientes en " + PROVEEDORES_LABELS[currentProveedorFilter] + " (se cierran solos al marcarse el pedido como enviado)";
  actualizarSeleccionUI();

  tbody.querySelectorAll(".pendiente-check").forEach(chk => {
    chk.addEventListener("change", () => {
      if (chk.checked) pedidoFabricaSeleccion.add(chk.dataset.id);
      else pedidoFabricaSeleccion.delete(chk.dataset.id);
      actualizarSeleccionUI();
    });
  });
  tbody.querySelectorAll(".fabricacion-input").forEach(inp => {
    inp.addEventListener("change", () => guardarMercanciaFabrica(inp.dataset.id, inp.value));
  });
  tbody.querySelectorAll(".referencia-input").forEach(inp => {
    inp.addEventListener("change", () => guardarReferenciaPolival(inp.dataset.id, inp.value));
  });
  tbody.querySelectorAll(".resolver-btn").forEach(btn => {
    btn.addEventListener("click", () => resolverPendiente(btn.dataset.id));
  });
  tbody.querySelectorAll(".tipo-envio-select").forEach(sel => {
    sel.addEventListener("change", () => updateBackorderPlan(sel.dataset.id, { tipoEnvio: sel.value }));
  });
  tbody.querySelectorAll(".fecha-camion-input").forEach(inp => {
    inp.addEventListener("change", () => updateBackorderPlan(inp.dataset.id, { fechaEstimadaLlegada: inp.value || null }));
  });
  tbody.querySelectorAll(".responder-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const order = allOrders.find(o => o.orderNumber === Number(btn.dataset.order));
      if (order) openReviewModal(order);
    });
  });
}

function actualizarSeleccionUI() {
  const n = pedidoFabricaSeleccion.size;
  document.getElementById("generar-pedido-btn").disabled = n === 0;
  document.getElementById("seleccion-count").textContent = n > 0 ? n + " seleccionados" : "";
}

async function guardarMercanciaFabrica(id, texto) {
  await fetch("/api/inventario/pendientes/" + encodeURIComponent(id) + "/mercancia", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mercanciaFabrica: texto }),
  });
  const b = backorders.find(b => b.id === id);
  if (b) b.mercanciaFabrica = texto;
}

async function guardarReferenciaPolival(id, referencia) {
  await fetch("/api/inventario/pendientes/" + encodeURIComponent(id) + "/referencia", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ referencia }),
  });
  const b = backorders.find(b => b.id === id);
  if (b) b.referencia = referencia;
}

document.getElementById("generar-pedido-btn").addEventListener("click", async () => {
  const seleccionados = backorders.filter(b => pedidoFabricaSeleccion.has(b.id));
  if (!seleccionados.length) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const proveedorLabel = PROVEEDORES_LABELS[currentProveedorFilter] || "";
  doc.setFontSize(14);
  doc.text("Pedido a fábrica · " + proveedorLabel, 14, 16);
  doc.setFontSize(10);
  doc.text(new Date().toLocaleDateString("es-ES"), 14, 22);

  // Varios artículos del mismo pedido van en el mismo recuadro (misma
  // fila), con las referencias juntas en una sola línea — a petición de
  // Jennifer, 2026-08-25.
  const grupos = new Map();
  seleccionados.forEach(b => {
    if (!grupos.has(b.orderNumber)) grupos.set(b.orderNumber, []);
    grupos.get(b.orderNumber).push(b);
  });
  const filas = [...grupos.values()].map(items => [
    items.map(b => b.referencia || "—").join(" / "),
    items.map(b => b.mercanciaFabrica || b.nombreFabricacion || b.stockModel).join("\\n\\n"),
  ]);
  doc.autoTable({
    head: [["Referencia", "Mercancía para pedir a fábrica"]],
    body: filas,
    startY: 28,
    styles: { fontSize: 10, cellPadding: 3, valign: "middle" },
    headStyles: { fillColor: [31, 138, 76] },
    columnStyles: { 0: { cellWidth: 30 } },
  });

  doc.save("pedido-" + currentProveedorFilter + "-" + new Date().toISOString().slice(0, 10) + ".pdf");

  await fetch("/api/inventario/pendientes/mark-ordered", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: seleccionados.map(b => b.id) }),
  });
  pedidoFabricaSeleccion.clear();
  loadPendientes();
});

async function resolverPendiente(id) {
  await fetch("/api/inventario/pendientes/" + encodeURIComponent(id) + "/resolver", { method: "POST" });
  loadPendientes();
}

async function updateBackorderPlan(id, patch) {
  await fetch("/api/inventario/pendientes/" + encodeURIComponent(id) + "/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  loadPendientes();
}

const HISTORIAL_ORIGEN_LABELS = { manual: "Manual", venta: "Venta", envio: "Envío" };
const HISTORIAL_CAMPO_LABELS = { cantidad: "Stock real", vendidoPendiente: "Vendido pendiente", pedidoProveedor: "Pedido a proveedor" };

let historialMovimientos = [];
async function loadHistorial() {
  const res = await fetch("/api/inventario/movimientos");
  historialMovimientos = await res.json();
  renderHistorial();
}

function renderHistorial() {
  const tbody = document.querySelector("#historial-table tbody");
  tbody.innerHTML = historialMovimientos.map(m => {
    const detalle = m.origen === "manual" ? (m.usuario || "—") : (m.orderNumber ? "BEZEN" + m.orderNumber : "—");
    const signo = m.delta > 0 ? "+" : "";
    return \`
    <tr>
      <td>\${new Date(m.fecha).toLocaleString("es-ES")}</td>
      <td>\${m.stockModel}</td>
      <td>\${m.talla}</td>
      <td>\${HISTORIAL_CAMPO_LABELS[m.campo] || m.campo}</td>
      <td class="\${m.delta < 0 ? "cantidad-baja" : ""}">\${signo}\${m.delta}</td>
      <td>\${m.resultante}</td>
      <td>\${HISTORIAL_ORIGEN_LABELS[m.origen] || m.origen}</td>
      <td>\${detalle}</td>
    </tr>
  \`;
  }).join("");
  document.getElementById("historial-count").textContent = historialMovimientos.length + " movimientos (los últimos 1000)";
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

// Es una app interna con datos que cambian a cada momento (pedidos, stock);
// dejar que Cloudflare cachee las respuestas en el borde causó una vez que
// una ruta nueva siguiera devolviendo un 404 viejo en producción. Todas las
// respuestas se marcan no-store para evitarlo.
async function handleFetch(request, env) {
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

    if (url.pathname === "/api/pedidos/shopify/review-note" && request.method === "POST") {
      return handleReviewNote(request, env);
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

    if (url.pathname === "/api/inventario/stock/adjust-by-lookup" && request.method === "POST") {
      return proxyInventory(env, "/stock/adjust-by-lookup", request);
    }

    if (url.pathname === "/api/inventario/movimientos" && request.method === "GET") {
      return proxyInventory(env, "/movements", request);
    }

    if (url.pathname === "/api/inventario/stock/delete" && request.method === "POST") {
      return proxyInventory(env, "/stock/delete", request);
    }

    if (url.pathname === "/api/inventario/pendientes/delete" && request.method === "POST") {
      return proxyInventory(env, "/backorders/delete", request);
    }

    if (url.pathname === "/api/inventario/pendientes" && request.method === "GET") {
      return proxyInventory(env, "/backorders", request);
    }

    const resolvePendingMatch = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/resolver$/);
    if (resolvePendingMatch && request.method === "POST") {
      return proxyInventory(env, `/backorders/${resolvePendingMatch[1]}/resolver`, request);
    }

    const planPendingMatch = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/plan$/);
    if (planPendingMatch && request.method === "POST") {
      return proxyInventory(env, `/backorders/${planPendingMatch[1]}/plan`, request);
    }

    const referenciaPendingMatch = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/referencia$/);
    if (referenciaPendingMatch && request.method === "POST") {
      return proxyInventory(env, `/backorders/${referenciaPendingMatch[1]}/referencia`, request);
    }

    const mercanciaPendingMatch = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/mercancia$/);
    if (mercanciaPendingMatch && request.method === "POST") {
      return proxyInventory(env, `/backorders/${mercanciaPendingMatch[1]}/mercancia`, request);
    }

    if (url.pathname === "/api/inventario/pendientes/release-decision" && request.method === "POST") {
      return proxyInventory(env, "/backorders/release-decision", request);
    }

    if (url.pathname === "/api/inventario/fabricacion" && request.method === "POST") {
      return proxyInventory(env, "/fabricacion", request);
    }

    if (url.pathname === "/api/inventario/pendientes/mark-ordered" && request.method === "POST") {
      return proxyInventory(env, "/backorders/mark-ordered", request);
    }

    if (url.pathname === "/api/inventario/admin/reset-stock" && request.method === "POST") {
      return proxyInventory(env, "/admin/reset-stock", request);
    }

    if (url.pathname === "/api/inventario/admin/backfill-proveedor" && request.method === "POST") {
      return proxyInventory(env, "/admin/backfill-proveedor", request);
    }

    if (url.pathname === "/api/inventario/admin/backfill-pending-decision" && request.method === "POST") {
      return proxyInventory(env, "/admin/backfill-pending-decision", request);
    }

    if (url.pathname === "/api/inventario/admin/pause" && request.method === "POST") {
      return proxyInventory(env, "/admin/pause", request);
    }

    if (url.pathname === "/api/inventario/admin/resume" && request.method === "POST") {
      return proxyInventory(env, "/admin/resume", request);
    }

    if (url.pathname === "/api/inventario/admin/status" && request.method === "GET") {
      return proxyInventory(env, "/admin/status", request);
    }

    if (url.pathname === "/api/pedidos/shopify/force-process" && request.method === "POST") {
      const body = await request.text();
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/orders/force-process", { method: "POST", body });
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/pedidos/shopify/clear-pending" && request.method === "POST") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/orders/clear-pending", { method: "POST" });
      return new Response(await res.text(), { headers: { "content-type": "application/json" } });
    }

    return new Response("not found", { status: 404 });
}

export default {
  async fetch(request, env) {
    const res = await handleFetch(request, env);
    // WebSocket upgrades (status 101) no admiten cabeceras extra sobre la
    // respuesta de upgrade.
    if (res.status === 101) return res;
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleSync(env));
  },
};
