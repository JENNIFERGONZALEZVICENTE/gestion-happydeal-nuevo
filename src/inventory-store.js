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
// código de producto tal cual: a veces le precede texto de "PACK", un "2"
// de marketplace, u otro componente pegado. Buscamos, entre los productos
// base ya sincronizados —tanto por su SKU de Shopify como por los alias
// que Jennifer haya añadido a mano (otras plataformas, ej. "AURORA")—, cuál
// código conocido aparece contenido en el segmento, quedándonos con el más
// largo (más específico) si hay varios candidatos.
function findBestPrefixMatch(segmentRaw, products) {
  const segment = segmentRaw.toUpperCase();
  let best = null;
  let bestPrefix = null;
  for (const p of Object.values(products)) {
    if (p.product_type === "Pack") continue;
    const candidates = [p.skuPrefix, ...(p.altSkuPrefixes || [])].filter((c) => c && c.length >= 4);
    for (const candidate of candidates) {
      const prefix = candidate.toUpperCase();
      if (segment.includes(prefix) && (!bestPrefix || prefix.length > bestPrefix.length)) {
        best = p;
        bestPrefix = prefix;
      }
    }
  }
  if (!best) return null;
  const idx = segment.indexOf(bestPrefix);
  const remainder = segmentRaw.slice(idx + bestPrefix.length);
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

// Para el alta/baja rápida: localizar el "modelo de stock" a partir de lo
// que Jennifer teclee, por nombre o por SKU (con la misma tolerancia a
// prefijos/alias que ya usa el emparejamiento de packs).
function resolveStockModel(query, mode, products) {
  const q = (query || "").trim().toUpperCase();
  if (!q) return null;

  if (mode === "sku") {
    let best = null;
    let bestLen = 0;
    for (const p of Object.values(products)) {
      if (p.product_type === "Pack") continue;
      const candidates = [p.skuPrefix, ...(p.altSkuPrefixes || [])].filter((c) => c && c.length >= 3);
      for (const c of candidates) {
        const prefix = c.toUpperCase();
        if ((q.includes(prefix) || prefix.includes(q)) && prefix.length > bestLen) {
          best = p;
          bestLen = prefix.length;
        }
      }
    }
    return best ? best.stockModel : null;
  }

  const byName = Object.values(products).filter((p) => p.product_type !== "Pack" && p.stockModel);
  const exact = byName.find((p) => p.stockModel.toUpperCase() === q);
  if (exact) return exact.stockModel;
  const partial = byName.find((p) => p.stockModel.toUpperCase().includes(q));
  return partial ? partial.stockModel : null;
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

  // Historial de movimientos de stock: tanto altas/bajas manuales como los
  // descuentos automáticos por venta y las liberaciones al enviar un
  // pedido. Se guarda con lo justo para poder auditar quién/qué lo generó,
  // recortando a los últimos MAX_MOVEMENTS para no crecer sin límite.
  async logMovement({ stockModel, talla, campo, delta, resultante, origen, usuario, orderNumber }) {
    const movements = await this.load("movements", []);
    movements.push({
      id: crypto.randomUUID(),
      fecha: new Date().toISOString(),
      stockModel,
      talla,
      campo,
      delta,
      resultante,
      origen,
      usuario: usuario || null,
      orderNumber: orderNumber || null,
    });
    const MAX_MOVEMENTS = 1000;
    if (movements.length > MAX_MOVEMENTS) movements.splice(0, movements.length - MAX_MOVEMENTS);
    await this.state.storage.put("movements", movements);
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
    if (url.pathname === "/stock/adjust-by-lookup" && method === "POST") {
      return this.adjustStockByLookup(await request.json());
    }
    if (url.pathname === "/stock/delete" && method === "POST") {
      return this.deleteStock(await request.json());
    }
    if (url.pathname === "/movements" && method === "GET") {
      const movements = await this.load("movements", []);
      return Response.json([...movements].reverse());
    }
    if (url.pathname === "/backorders" && method === "GET") {
      const backorders = await this.load("backorders", []);
      return Response.json(backorders);
    }
    const resolveMatch = url.pathname.match(/^\/backorders\/([^/]+)\/resolver$/);
    if (resolveMatch && method === "POST") {
      return this.resolveBackorder(decodeURIComponent(resolveMatch[1]));
    }
    const planMatch = url.pathname.match(/^\/backorders\/([^/]+)\/plan$/);
    if (planMatch && method === "POST") {
      return this.updateBackorderPlan(decodeURIComponent(planMatch[1]), await request.json());
    }
    if (url.pathname === "/process-sale" && method === "POST") {
      return this.processSale(await request.json());
    }

    if (url.pathname === "/settle-shipment" && method === "POST") {
      return this.settleShipment(await request.json());
    }

    if (url.pathname === "/admin/reset-stock" && method === "POST") {
      return this.resetStock();
    }

    if (url.pathname === "/admin/pause" && method === "POST") {
      await this.state.storage.put("paused", true);
      return Response.json({ paused: true });
    }

    if (url.pathname === "/admin/resume" && method === "POST") {
      await this.state.storage.put("paused", false);
      return Response.json({ paused: false });
    }

    if (url.pathname === "/admin/status" && method === "GET") {
      return Response.json({ paused: await this.load("paused", false) });
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
      // Si Jennifer ha corregido el SKU a mano (la detección automática por
      // prefijo común falla con pocas variantes o SKU irregulares), no lo
      // recalculamos en cada sync.
      if (!entry.skuPrefixManual) entry.skuPrefix = longestCommonPrefix(skus);
      entry.tallas = [...new Set((sp.variants || []).map((v) => normalizeTalla(v.title)).filter(Boolean))];
      products[sp.id] = entry;

      const tipo = TYPE_MAP[sp.product_type];
      if (tipo && STOCK_TYPES.has(tipo) && !entry.noStock) {
        for (const talla of entry.tallas) {
          const key = stockKey(entry.stockModel, talla);
          if (!stock[key]) stock[key] = { stockModel: entry.stockModel, talla, cantidad: 0, vendidoPendiente: 0 };
        }
      }
    }

    await this.state.storage.put("products", products);
    await this.state.storage.put("stock", stock);
    return Response.json({ ok: true, total: Object.keys(products).length });
  }

  async updateFlags({ productId, exceptionFurniture, noStock, stockModel, skuPrefix, altSkuPrefixes }) {
    const products = await this.load("products", {});
    const entry = products[productId];
    if (!entry) return new Response("not found", { status: 404 });

    const oldStockModel = entry.stockModel;
    const wasNoStock = entry.noStock;
    if (exceptionFurniture !== undefined) entry.exceptionFurniture = !!exceptionFurniture;
    if (noStock !== undefined) entry.noStock = !!noStock;
    if (stockModel !== undefined && stockModel.trim()) entry.stockModel = stockModel.trim();
    if (skuPrefix !== undefined && skuPrefix.trim()) {
      entry.skuPrefix = skuPrefix.trim();
      entry.skuPrefixManual = true;
    }
    if (altSkuPrefixes !== undefined) {
      entry.altSkuPrefixes = altSkuPrefixes
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    }
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
              : { stockModel: entry.stockModel, talla, cantidad: 0, vendidoPendiente: 0 };
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
          if (stock[oldKey] && !stillNeeded.has(oldKey) && stock[oldKey].cantidad === 0 && !stock[oldKey].vendidoPendiente) {
            delete stock[oldKey];
          }
        }
      }

      await this.state.storage.put("stock", stock);
    }

    return Response.json(entry);
  }

  // Aplica la venta de un artículo con stock: descuenta primero de la
  // cantidad real disponible (nunca la deja negativa) y, si no llega, el
  // resto pasa a "vendidoPendiente" — pero eso solo se refleja en el Stock
  // para colchones (a petición de Jennifer). Para almohada/protector/topper
  // el faltante solo se apunta en Pendientes de fabricante, sin tocar esa
  // columna. El excedente de vendidoPendiente se libera cuando el pedido
  // que lo generó se marca como enviado (ver settleShipment).
  async applyStockUsage(stock, backorders, item, orderId, orderNumber, esPack) {
    const key = stockKey(item.product.stockModel, item.talla);
    const row = stock[key] || { stockModel: item.product.stockModel, talla: item.talla, cantidad: 0, vendidoPendiente: 0 };
    const covered = Math.min(row.cantidad, item.qty);
    row.cantidad -= covered;
    if (covered > 0) {
      await this.logMovement({
        stockModel: item.product.stockModel,
        talla: item.talla,
        campo: "cantidad",
        delta: -covered,
        resultante: row.cantidad,
        origen: "venta",
        orderNumber,
      });
    }
    const falta = item.qty - covered;
    if (falta > 0) {
      if (item.tipo === "colchon") {
        row.vendidoPendiente = (row.vendidoPendiente || 0) + falta;
        await this.logMovement({
          stockModel: item.product.stockModel,
          talla: item.talla,
          campo: "vendidoPendiente",
          delta: falta,
          resultante: row.vendidoPendiente,
          origen: "venta",
          orderNumber,
        });
      }
      const id = `${orderId}-${key}`;
      if (!backorders.some((b) => b.id === id)) {
        backorders.push({
          id,
          orderId,
          orderNumber,
          stockModel: item.product.stockModel,
          talla: item.talla,
          tipo: item.tipo,
          cantidad: falta,
          fecha: new Date().toISOString(),
          estado: "pendiente",
          recibidoFabrica: false,
          // Solo tiene sentido para colchones dentro de un pack con
          // tapicería: referencia FURBEZEN (tiene que salir junto con la
          // tapicería) o FPKBEZEN (puede salir independiente), por defecto
          // FPK hasta que se indique lo contrario o se sepa una fecha de
          // camión cercana. Ver updateBackorderPlan.
          esPack: !!esPack,
          tipoEnvio: "FPK",
          fechaEstimadaLlegada: null,
        });
      }
    }
    stock[key] = row;
    return falta;
  }

  // Cuando Shopify marca un pedido como enviado, las unidades que se habían
  // quedado en "vendidoPendiente" para ese pedido ya han salido de verdad
  // (o directas desde fábrica al cliente): se descuentan de esa columna y
  // los pendientes de fabricante asociados se cierran. El stock real no se
  // toca aquí — nunca llegó a estar disponible para descontarlo antes.
  async settleShipment({ orderId }) {
    const stock = await this.load("stock", {});
    const backorders = await this.load("backorders", []);
    let settled = 0;

    for (const b of backorders) {
      if (b.orderId !== orderId || b.estado === "servido") continue;
      const key = stockKey(b.stockModel, b.talla);
      const row = stock[key];
      if (row) {
        const before = row.vendidoPendiente || 0;
        row.vendidoPendiente = Math.max(0, before - b.cantidad);
        stock[key] = row;
        await this.logMovement({
          stockModel: b.stockModel,
          talla: b.talla,
          campo: "vendidoPendiente",
          delta: row.vendidoPendiente - before,
          resultante: row.vendidoPendiente,
          origen: "envio",
          orderNumber: b.orderNumber,
        });
      }
      b.estado = "servido";
      settled++;
    }

    if (settled > 0) {
      await this.state.storage.put("stock", stock);
      await this.state.storage.put("backorders", backorders);
    }
    return Response.json({ ok: true, settled });
  }

  async adjustStockByLookup({ query, mode, talla, delta, usuario }) {
    const products = await this.load("products", {});
    const stockModel = resolveStockModel(query, mode, products);
    if (!stockModel) {
      return Response.json({ error: "No se ha encontrado ningún modelo que coincida con \"" + query + "\"." }, { status: 404 });
    }
    const normalizedTalla = normalizeTalla(talla) || (talla || "").trim().toUpperCase();
    if (!normalizedTalla) {
      return Response.json({ error: "Indica una talla válida." }, { status: 400 });
    }
    return this.adjustStock({ stockModel, talla: normalizedTalla, delta, usuario });
  }

  async adjustStock({ stockModel, talla, delta, field, usuario }) {
    const targetField = field === "pedidoProveedor" ? "pedidoProveedor" : "cantidad";
    const stock = await this.load("stock", {});
    const key = stockKey(stockModel, talla);
    const row = stock[key] || { stockModel, talla, cantidad: 0, vendidoPendiente: 0, pedidoProveedor: 0 };
    row[targetField] = Math.max(0, (row[targetField] || 0) + Number(delta));
    stock[key] = row;
    await this.state.storage.put("stock", stock);
    await this.logMovement({
      stockModel,
      talla,
      campo: targetField,
      delta: Number(delta),
      resultante: row[targetField],
      origen: "manual",
      usuario,
    });
    return Response.json(row);
  }

  // Mantenimiento puntual: borra una fila de stock suelta (ej. filas de
  // prueba). No expuesto en la UI, solo por API.
  async deleteStock({ stockModel, talla }) {
    const stock = await this.load("stock", {});
    const key = stockKey(stockModel, talla);
    const existed = key in stock;
    delete stock[key];
    await this.state.storage.put("stock", stock);
    return Response.json({ ok: true, existed });
  }

  // Mantenimiento puntual: pone todo el stock a 0 y borra los pendientes de
  // fabricante. No expuesto en la UI a propósito (solo por API), pensado
  // para arrancar el conteo real de cero cuando el histórico de pedidos ya
  // procesado dejó cantidades que no representan stock físico real.
  async resetStock() {
    const stock = await this.load("stock", {});
    for (const key of Object.keys(stock)) {
      stock[key].cantidad = 0;
      stock[key].vendidoPendiente = 0;
    }
    await this.state.storage.put("stock", stock);
    await this.state.storage.put("backorders", []);
    return Response.json({ ok: true, filas: Object.keys(stock).length });
  }

  // Marca que el fabricante ya entregó ese colchón (aviso informativo para
  // el equipo). No cambia el stock ni cierra el pendiente: el pendiente se
  // cierra solo cuando el pedido del cliente se marca como enviado en
  // Shopify (ver settleShipment) — puede que lo recibido de fábrica tarde
  // en salir hacia el cliente.
  async resolveBackorder(id) {
    const backorders = await this.load("backorders", []);
    const entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });
    entry.recibidoFabrica = !entry.recibidoFabrica;
    await this.state.storage.put("backorders", backorders);
    return Response.json(entry);
  }

  // Decide la referencia FURBEZEN (tiene que salir junto con la tapicería)
  // o FPKBEZEN (puede salir independiente) de un pendiente de colchón en
  // pack. Si se manda tipoEnvio, es un cambio manual directo (el cliente
  // lo pidió así). Si se manda fechaEstimadaLlegada, se recalcula sola:
  // dentro de ~7 días (lo que tarda POLIVAL en la tapicería) → FUR, si no
  // o si no se sabe la fecha → FPK. Siempre queda editable a mano después.
  async updateBackorderPlan(id, { fechaEstimadaLlegada, tipoEnvio }) {
    const backorders = await this.load("backorders", []);
    const entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });

    if (tipoEnvio !== undefined) {
      entry.tipoEnvio = tipoEnvio === "FUR" ? "FUR" : "FPK";
    } else if (fechaEstimadaLlegada !== undefined) {
      entry.fechaEstimadaLlegada = fechaEstimadaLlegada || null;
      if (entry.fechaEstimadaLlegada) {
        const limite = new Date();
        limite.setDate(limite.getDate() + 7);
        entry.tipoEnvio = new Date(entry.fechaEstimadaLlegada) <= limite ? "FUR" : "FPK";
      } else {
        entry.tipoEnvio = "FPK";
      }
    }

    await this.state.storage.put("backorders", backorders);
    return Response.json(entry);
  }

  async processSale({ orderId, orderNumber, items, force }) {
    // Mientras el catálogo/stock no esté configurado del todo, Jennifer
    // pidió no tocar los pedidos que van entrando (ni agencia ni stock).
    // Cuando esté todo listo, un POST a /admin/resume lo reactiva y los
    // pedidos que se sincronicen a partir de ahí sí se procesan. `force`
    // permite procesar un pedido suelto a modo de prueba sin reactivar el
    // procesamiento general (usado desde /orders/force-process).
    if (!force && (await this.load("paused", false))) {
      return Response.json({ agencia: null, pendingManufacture: null, needsReview: false, paused: true });
    }

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
        const falta = await this.applyStockUsage(stock, backorders, item, orderId, orderNumber, true);
        if (item.tipo === "colchon" && falta > 0) {
          pendingManufacture = { modelo: item.product.stockModel, talla: item.talla, cantidad: falta };
        }
      }
    } else {
      const colchones = flat.filter((c) => c.tipo === "colchon");
      agencia = colchones.some((c) => c.product.exceptionFurniture) ? "FURNITURE" : "SEUR";
      for (const item of flat) {
        if (!STOCK_TYPES.has(item.tipo) || !item.product || item.product.noStock) continue;
        await this.applyStockUsage(stock, backorders, item, orderId, orderNumber, false);
      }
    }

    await this.state.storage.put("stock", stock);
    await this.state.storage.put("backorders", backorders);

    return Response.json({ agencia, pendingManufacture, needsReview });
  }
}
