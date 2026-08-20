const TYPE_MAP = {
  Colchones: "colchon",
  Almohada: "almohada",
  "Protector de colchón": "protector",
  Topper: "topper",
  Canapé: "tapiceria",
  "Canapé fijo": "tapiceria",
  Base: "tapiceria",
  Cabecero: "tapiceria",
};

const STOCK_TYPES = new Set(["colchon", "almohada", "protector", "topper"]);

function longestCommonPrefix(strings) {
  const clean = strings.filter(Boolean);
  if (!clean.length) return "";
  let prefix = clean[0];
  for (const s of clean.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < s.length && prefix[i].toUpperCase() === s[i].toUpperCase()) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

function normalizeTalla(text) {
  if (!text) return "";
  const m = text.match(/(\d{2,3})\s*[xX]\s*(\d{2,3})/);
  if (m) return `${m[1]}X${m[2]}`;
  const bare = text.trim().match(/^\d{2,3}(\.\d+)?$/);
  if (bare) return text.trim();
  return "";
}

function stockKey(stockModel, talla) {
  return `${stockModel}|${talla}`;
}

// Un segmento de SKU de pack (ej. "COLZSUPREME90X190") no siempre trae el
// código de producto tal cual: a veces le precede texto de "PACK" u otro
// componente pegado. Buscamos, entre los productos base ya sincronizados,
// cuál prefijo de SKU conocido aparece contenido en el segmento, quedandonos
// con el más largo (más específico) si hay varios candidatos.
function findBestPrefixMatch(segmentRaw, products) {
  const segment = segmentRaw.toUpperCase();
  let best = null;
  for (const p of Object.values(products)) {
    if (p.product_type === "Pack") continue;
    if (!p.skuPrefix || p.skuPrefix.length < 4) continue;
    const prefix = p.skuPrefix.toUpperCase();
    if (segment.includes(prefix) && (!best || prefix.length > best.skuPrefix.length)) {
      best = p;
    }
  }
  if (!best) return null;
  const idx = segment.indexOf(best.skuPrefix.toUpperCase());
  const remainder = segmentRaw.slice(idx + best.skuPrefix.length);
  return { product: best, talla: normalizeTalla(remainder) };
}

function resolvePackSku(rawSku, products) {
  if (!rawSku || rawSku.includes("(")) return { componentes: [], needsReview: true };
  const base = rawSku.split("-")[0];
  const segments = base.split("+").map((s) => s.trim()).filter(Boolean);
  const componentes = [];
  let unresolved = 0;
  for (const seg of segments) {
    const match = findBestPrefixMatch(seg, products);
    if (match) {
      componentes.push({ tipo: TYPE_MAP[match.product.product_type] || "otro", product: match.product, talla: match.talla });
    } else {
      unresolved++;
    }
  }
  return { componentes, needsReview: unresolved > 0 || componentes.length === 0 };
}

function resolveItem(item, products) {
  const product = item.productId != null ? products[item.productId] : null;
  if (!product) return { tipo: "desconocido" };
  if (product.product_type === "Pack") {
    const { componentes, needsReview } = resolvePackSku(item.sku, products);
    return { tipo: "pack", componentes, needsReview, qty: item.qty };
  }
  const tipo = TYPE_MAP[product.product_type] || "otro";
  return { tipo, product, talla: normalizeTalla(item.variantTitle), qty: item.qty };
}

export class InventoryStore {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async load(key, fallback) {
    const value = await this.state.storage.get(key);
    return value === undefined ? fallback : value;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    if (url.pathname === "/catalog/sync" && method === "POST") {
      return this.syncCatalog(await request.json());
    }
    if (url.pathname === "/catalog" && method === "GET") {
      const products = await this.load("products", {});
      return Response.json(Object.values(products));
    }
    if (url.pathname === "/catalog/flags" && method === "POST") {
      return this.updateFlags(await request.json());
    }
    if (url.pathname === "/stock" && method === "GET") {
      const stock = await this.load("stock", {});
      return Response.json(Object.values(stock));
    }
    if (url.pathname === "/stock/adjust" && method === "POST") {
      return this.adjustStock(await request.json());
    }
    if (url.pathname === "/backorders" && method === "GET") {
      const backorders = await this.load("backorders", []);
      return Response.json(backorders);
    }
    const resolveMatch = url.pathname.match(/^\/backorders\/([^/]+)\/resolver$/);
    if (resolveMatch && method === "POST") {
      return this.resolveBackorder(decodeURIComponent(resolveMatch[1]));
    }
    if (url.pathname === "/process-sale" && method === "POST") {
      return this.processSale(await request.json());
    }

    return new Response("not found", { status: 404 });
  }

  async syncCatalog(shopifyProducts) {
    const products = await this.load("products", {});
    const stock = await this.load("stock", {});

    for (const sp of shopifyProducts) {
      const skus = (sp.variants || []).map((v) => v.sku).filter(Boolean);
      const existing = products[sp.id];
      const entry = existing || {
        productId: sp.id,
        stockModel: sp.title,
        exceptionFurniture: false,
        noStock: false,
      };
      entry.title = sp.title;
      entry.product_type = sp.product_type;
      entry.skuPrefix = longestCommonPrefix(skus);
      entry.tallas = [...new Set((sp.variants || []).map((v) => normalizeTalla(v.title)).filter(Boolean))];
      products[sp.id] = entry;

      const tipo = TYPE_MAP[sp.product_type];
      if (tipo && STOCK_TYPES.has(tipo) && !entry.noStock) {
        for (const talla of entry.tallas) {
          const key = stockKey(entry.stockModel, talla);
          if (!stock[key]) stock[key] = { stockModel: entry.stockModel, talla, cantidad: 0 };
        }
      }
    }

    await this.state.storage.put("products", products);
    await this.state.storage.put("stock", stock);
    return Response.json({ ok: true, total: Object.keys(products).length });
  }

  async updateFlags({ productId, exceptionFurniture, noStock, stockModel }) {
    const products = await this.load("products", {});
    const entry = products[productId];
    if (!entry) return new Response("not found", { status: 404 });

    const oldStockModel = entry.stockModel;
    const wasNoStock = entry.noStock;
    if (exceptionFurniture !== undefined) entry.exceptionFurniture = !!exceptionFurniture;
    if (noStock !== undefined) entry.noStock = !!noStock;
    if (stockModel !== undefined && stockModel.trim()) entry.stockModel = stockModel.trim();
    products[productId] = entry;
    await this.state.storage.put("products", products);

    const tipo = TYPE_MAP[entry.product_type];
    if (tipo && STOCK_TYPES.has(tipo)) {
      const stock = await this.load("stock", {});

      if (!entry.noStock) {
        for (const talla of entry.tallas || []) {
          const key = stockKey(entry.stockModel, talla);
          if (!stock[key]) {
            const oldKey = stockKey(oldStockModel, talla);
            stock[key] = stock[oldKey]
              ? { ...stock[oldKey], stockModel: entry.stockModel }
              : { stockModel: entry.stockModel, talla, cantidad: 0 };
          }
        }
      }

      // Si se marcó "no llevamos stock" o cambió de modelo de stock, las
      // filas del modelo/tallas anteriores pueden quedar huérfanas. Solo se
      // borran si ningún otro producto activo las sigue necesitando y están
      // a 0 (nunca se pisa una cantidad ya contada).
      if ((entry.noStock && !wasNoStock) || entry.stockModel !== oldStockModel) {
        const stillNeeded = new Set();
        for (const p of Object.values(products)) {
          if (p.noStock) continue;
          if (!STOCK_TYPES.has(TYPE_MAP[p.product_type])) continue;
          for (const talla of p.tallas || []) stillNeeded.add(stockKey(p.stockModel, talla));
        }
        for (const talla of entry.tallas || []) {
          const oldKey = stockKey(oldStockModel, talla);
          if (stock[oldKey] && !stillNeeded.has(oldKey) && stock[oldKey].cantidad === 0) {
            delete stock[oldKey];
          }
        }
      }

      await this.state.storage.put("stock", stock);
    }

    return Response.json(entry);
  }

  async adjustStock({ stockModel, talla, delta }) {
    const stock = await this.load("stock", {});
    const key = stockKey(stockModel, talla);
    const row = stock[key] || { stockModel, talla, cantidad: 0 };
    row.cantidad = (row.cantidad || 0) + Number(delta);
    stock[key] = row;
    await this.state.storage.put("stock", stock);
    return Response.json(row);
  }

  async resolveBackorder(id) {
    const backorders = await this.load("backorders", []);
    const entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });
    entry.estado = "recibido";
    await this.state.storage.put("backorders", backorders);
    return Response.json(entry);
  }

  async processSale({ orderId, orderNumber, items }) {
    const products = await this.load("products", {});
    const stock = await this.load("stock", {});
    const backorders = await this.load("backorders", []);

    const flat = [];
    let needsReview = false;

    for (const item of items) {
      const resolved = resolveItem(item, products);
      if (resolved.tipo === "pack") {
        if (resolved.needsReview) needsReview = true;
        for (const c of resolved.componentes) flat.push({ ...c, qty: resolved.qty });
      } else if (resolved.tipo === "desconocido") {
        needsReview = true;
      } else {
        if (resolved.tipo === "otro") needsReview = true;
        flat.push(resolved);
      }
    }

    const hasTapiceria = flat.some((c) => c.tipo === "tapiceria");
    let agencia;
    let pendingManufacture = null;

    if (flat.length === 0) {
      agencia = "FURNITURE";
      needsReview = true;
    } else if (hasTapiceria) {
      agencia = "FURNITURE";
      for (const item of flat) {
        if (!STOCK_TYPES.has(item.tipo) || !item.product || item.product.noStock) continue;
        const key = stockKey(item.product.stockModel, item.talla);
        const row = stock[key] || { stockModel: item.product.stockModel, talla: item.talla, cantidad: 0 };
        if (item.tipo === "colchon" && row.cantidad < item.qty) {
          const falta = item.qty - row.cantidad;
          row.cantidad = 0;
          const id = `${orderId}-${key}`;
          if (!backorders.some((b) => b.id === id)) {
            backorders.push({
              id,
              orderId,
              orderNumber,
              modelo: item.product.stockModel,
              talla: item.talla,
              cantidad: falta,
              fecha: new Date().toISOString(),
              estado: "pendiente",
            });
          }
          pendingManufacture = { modelo: item.product.stockModel, talla: item.talla, cantidad: falta };
        } else {
          row.cantidad -= item.qty;
        }
        stock[key] = row;
      }
    } else {
      const colchones = flat.filter((c) => c.tipo === "colchon");
      agencia = colchones.some((c) => c.product.exceptionFurniture) ? "FURNITURE" : "SEUR";
      for (const item of flat) {
        if (!STOCK_TYPES.has(item.tipo) || !item.product || item.product.noStock) continue;
        const key = stockKey(item.product.stockModel, item.talla);
        const row = stock[key] || { stockModel: item.product.stockModel, talla: item.talla, cantidad: 0 };
        row.cantidad -= item.qty;
        stock[key] = row;
      }
    }

    await this.state.storage.put("stock", stock);
    await this.state.storage.put("backorders", backorders);

    return Response.json({ agencia, pendingManufacture, needsReview });
  }
}
