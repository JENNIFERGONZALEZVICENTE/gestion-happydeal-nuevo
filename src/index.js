export { OrdersStore } from "./orders-store.js";
export { InventoryStore } from "./inventory-store.js";
import { parseCabeceroVariant, matchCabeceroRecipeKey, CABECERO_RECIPES, findBestPrefixMatch, PREGUNTA_FORMATO_160 } from "./inventory-store.js";
import { etiquetaTransformacionPdf, resumenSeurPdf } from "./etiqueta-pdf.js";
import { enviarEmailAlmacen, llamarScriptSeur, enviarReservaAlmacen, bultosPorUnidad, lineaTextoReserva, fechaHoyEs, referenciaPedidoAlmacen, modeloCorto } from "./avisos-almacen.js";

// Interruptor de Fase 2 de cada "marketplace" (Carrefour, Jennifer,
// 2026-09-17, activado parcialmente 2026-09-19; generalizado el mismo día
// al añadir Maison Du Monde como segunda tienda con el mismo funcionamiento
// exacto): los pedidos siempre se guardan e integran en el mismo almacén
// que Shopify (cargas compartidas, etc.), pero el motor de agencia/stock
// solo actúa sobre los pedidos cuya fecha de creación sea igual o posterior
// a la de este mapa por plataforma — así los pedidos anteriores (la mayoría
// ya resueltos manualmente antes de que existiera esta integración) se
// quedan sin tocar el stock ni generar pendientes en Polival/Luso/New,
// mientras que los de la fecha de corte en adelante sí pasan por el mismo
// motor que Bezen. Bajar la fecha (o quitarla del todo) es lo único que
// hace falta para ampliar la activación cuando Jennifer lo pida.
const PROCESAMIENTO_DESDE = {
  // Subida a 2026-09-24 (Jennifer, 2026-09-23): "los pedidos [ya
  // gestionados por la vía anterior]... solo comenzaremos a descontar a
  // partir de los nuevos ficheros que te suba, por lo tanto, los pedidos
  // que estén en fecha posterior al 23/09" — mismo motivo que llevó a
  // vaciar `backorders` el mismo día (ver memoria del proyecto). Antes:
  // "2026-09-18" (quedaba fuera de las pruebas del 18-20/09 de este mismo
  // fichero histórico).
  Carrefour: "2026-09-24",
  // Ampliado hacia atrás (Jennifer, 2026-09-21) para poder probar de
  // verdad el cruce de seguimiento de Furniture/SEUR contra pedidos reales
  // de estas dos tiendas, no solo los que lleguen desde hoy.
  // Reactivado (Jennifer, 2026-10-01: "Maison tiene que tramitar también")
  // desde el 30/09: el último pedido (2001791372-A, 29/09) y todo lo
  // anterior se metió a mano ese día. Estuvo desactivado unas horas
  // ("2099-12-31") tras la subida de la mañana; antes "2026-09-13".
  "Maison Du Monde": "2026-09-30",
  // Reactivado (Jennifer, 2026-09-29): "a partir de este pedido 83752933-A
  // (24/09 21:09, único de ese día, ya con su pendiente manual) todos se
  // van a tramitar con normalidad". Lo anterior se dejó pendiente a mano.
  // Antes: "2099-12-31" (desactivado un rato), y antes "2026-09-13".
  Worten: "2026-09-24",
  // Ampliado hacia atrás (Jennifer, 2026-09-21) para poder probar de
  // verdad estas dos tiendas con pedidos reales, igual que se hizo con
  // Maison/Worten. Conforama Francia no tenía ningún pedido tras el 13/09
  // (el más reciente era del 06/09), así que se amplió más, al 01/09.
  // Jennifer, 2026-09-29: se tramita a partir del último pedido que entró,
  // 20071165501-A (28/09/2026 14:40, único pedido de ese día) — todo lo
  // anterior ya se gestionó por otra vía y no debe descontar nada. (Un rato
  // antes estuvo desactivado con "2099-12-31"; antes de eso "2026-09-01".)
  Conforama: "2026-09-28",
  // Subida a 2026-09-21 (Jennifer, 2026-09-25): el último pedido que
  // gestionó Ariadna a mano fue MP9992626400274607-A (único pedido de esa
  // fecha en el fichero real subido ese día, verificado sin ambigüedad de
  // orden dentro del mismo día) — a partir de ahí (inclusive) es cuando
  // empieza a tener sentido que el motor normal se encargue; todo lo
  // anterior ya está gestionado y no debe volver a descontar stock ni pedir
  // a proveedor. Antes: "2026-09-13".
  // Reactivado (Jennifer, 2026-09-29): "a partir de los pedidos que entren a
  // raíz de MP9992626800277699-A (25/09 17:02, ya tramitado) ya se pueden
  // tramitar con normalidad". El 25/09 también incluye MP9992626800277698-A
  // (17:02:05, pendiente de verificación de fraude): se tramita solo cuando
  // pase a un estado elegible (MARKETPLACE_ESTADOS_ELEGIBLES). Lo anterior
  // se gestionó a mano (pendientes creados con crear-pendiente-manual).
  // Antes: "2099-12-31" (desactivado), y antes "2026-09-21".
  "Conforama ES": "2026-09-25",
  // Ampliado hacia atrás (Jennifer, 2026-09-21) para procesar todo el
  // histórico real de prueba (95 pedidos desde el 24/06).
  // Reactivado (Jennifer, 2026-10-01): "el contador de Leroy ya puede
  // funcionar con normalidad" — desde los pedidos del 28/09; lo anterior se
  // metió a mano. Antes: "2099-12-31" (desactivado ese mismo día) y antes
  // "2026-06-24".
  "Leroy Merlin": "2026-09-28",
};
// Prefijo del id interno por plataforma (para no chocar entre sí ni con los
// pedidos de Shopify, que usan el id numérico real de Shopify tal cual).
const MARKETPLACE_ID_PREFIX = {
  Carrefour: "CF",
  "Maison Du Monde": "MDM",
  Worten: "WT",
  Conforama: "CFM",
  "Conforama ES": "CFES",
  "Leroy Merlin": "LM",
};
// id de PLATFORMS (y de las rutas /api/<id>/...) -> nombre real de
// plataforma tal como se guarda en order.platform.
const MARKETPLACE_PLATFORM_BY_ID = {
  carrefour: "Carrefour",
  "maison-du-monde": "Maison Du Monde",
  worten: "Worten",
  conforama: "Conforama",
  "conforama-es": "Conforama ES",
  "leroy-merlin": "Leroy Merlin",
};
function marketplaceFechaDesde(orderDateStr, cutoffIso) {
  const m = String(orderDateStr || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return false;
  const [, d, mo, y] = m;
  const fecha = y + "-" + mo.padStart(2, "0") + "-" + d.padStart(2, "0");
  return fecha >= cutoffIso;
}
// Conforama ES (Jennifer, 2026-09-21): "entran muchísimo pedidos que se
// quedan en débito en curso o pendiente de verificación de fraude, y
// muchos de esos pedidos se acaban cancelado, hasta que no aparezca como
// pendiente de envío no podemos gestionar ese pedido" — no conocemos el
// texto exacto que usa Mirakl para esos estados intermedios, así que en
// vez de intentar reconocerlos y bloquearlos (lista negra, arriesgada si
// el texto no coincide exacto), se usa una LISTA BLANCA de estados que sí
// sabemos que significan pedido confirmado — cualquier otro estado
// (incluidos los de fraude/débito que no conocemos) se queda fuera por
// defecto, sin tocar stock, hasta que se confirme. Solo aplica a Conforama
// ES; las demás plataformas no tienen este problema y siguen sin filtro
// de estado (solo la fecha de PROCESAMIENTO_DESDE).
const MARKETPLACE_ESTADOS_ELEGIBLES = {
  "Conforama ES": new Set(["Recibido", "Enviado", "Esperando envío"]),
};
function marketplaceEstadoElegible(order) {
  const permitidos = MARKETPLACE_ESTADOS_ELEGIBLES[order.platform];
  if (!permitidos) return true;
  return permitidos.has(order.estado);
}

// Envío automático de seguimiento a Shopify (Jennifer, 2026-09-21): en
// cuanto se sube el fichero de SEUR o de Furniture y se cruza un
// seguimiento NUEVO con un pedido de Shopify, se marca como enviado en
// Shopify con ese número de seguimiento — Shopify manda su email al
// cliente en ese momento (confirmado explícitamente por Jennifer). Solo
// aplica a pedidos de Shopify (las demás plataformas no dan acceso para
// subir esto directamente). Un pack partido en dos envíos (tapicería
// ahora, colchón más adelante) pasa dos veces: la primera crea el
// fulfillment, la segunda actualiza el seguimiento del mismo — ver
// procesarFulfillmentsShopify.
// Probado en real el 2026-09-21 (pedido BEZEN12164 y también BEZEN12149,
// una nota de Sergio, ambos con email de Shopify confirmado como
// "delivered" en el timeline del pedido). Jennifer pidió que el envío
// automático empiece a funcionar de verdad a partir del MIÉRCOLES 23 DE
// SEPTIEMBRE — por eso es una fecha de corte, no un simple true/false,
// mismo patrón que PROCESAMIENTO_DESDE. No adelantar esta fecha sin que
// ella lo pida explícitamente.
const SHOPIFY_FULFILL_DESDE = "2026-09-23";
function shopifyFulfillActivo() {
  return new Date().toISOString().slice(0, 10) >= SHOPIFY_FULFILL_DESDE;
}

// Shopify manda payment_gateway_names con nombres reales (Cetelem, SeQura
// Payment Gateway, Transferencia bancaria, MONEI Pay · Bizum) pero a veces
// junto con "shopify_payments" de relleno (visto en pedidos reales, ej.
// "Cetelem, shopify_payments") — se prioriza el nombre real de
// financiación/método sobre "shopify_payments", que solo significa tarjeta
// cuando va solo.
function normalizePaymentMethod(gatewayNames) {
  const joined = (gatewayNames || []).join(", ").toLowerCase();
  if (!joined) return "—";
  if (joined.includes("cetelem")) return "CETELEM";
  if (joined.includes("sequra")) return "SEQURA";
  if (joined.includes("transferencia")) return "TRANSFERENCIA BANCARIA";
  if (joined.includes("bizum") || joined.includes("monei")) return "BIZUM";
  if (joined.includes("shopify_payments")) return "VISA";
  return (gatewayNames || []).join(", ").toUpperCase();
}

function mapOrder(order, catalogMap) {
  const productTitles = [];
  const serviceParts = [];
  const items = [];

  for (const item of order.line_items || []) {
    if (item.title) {
      // Los productos simples (ej. un colchón suelto, sin pack ni línea
      // duplicada de Shopify) solo traen la medida en variant_title, no en
      // el título — sin esto, "Producto comprado" se queda sin medida
      // (Jennifer, 2026-08-27). Se evita duplicar cuando el título ya la
      // trae incluida (packs y canapés que sí llegan con la línea repetida
      // más detallada, ver filtro de prefijos más abajo).
      const variant = (item.variant_title || "").trim();
      const yaIncluida = !variant || variant.toLowerCase() === "default title" || item.title.toLowerCase().includes(variant.toLowerCase());
      const titulo = yaIncluida ? item.title : `${item.title} - ${variant}`;
      // Cantidad siempre visible delante del producto (Jennifer, 2026-09-16:
      // "no logro ver la cantidad que el cliente ha comprado de cada").
      productTitles.push(`${item.quantity || 1}x ${titulo}`);
    }
    for (const prop of item.properties || []) {
      if (!prop.name || !prop.value) continue;
      if (prop.name.startsWith("_")) continue;
      serviceParts.push(`${prop.name}: ${prop.value}`);
      // Almohadas de regalo (Jennifer, 2026-09-18): hasta ahora solo
      // aparecían como texto en "Servicios adicionales" — nunca se
      // descontaban de stock ni se pedían a Polival si faltaban. El propio
      // texto trae cantidad + SKU entre paréntesis, ej. "2 x Almohada Sea
      // Foam 67,5 cm (ALMSEAFOAM67,5)" — se añade como un item más para
      // que pase por el mismo motor de inventario que el resto.
      if (prop.name === "Almohadas de regalo" && catalogMap) {
        const m = prop.value.match(/^(\d+)\s*x\s*.*\(([^)]+)\)\s*$/i);
        if (m) {
          const qty = Number(m[1]) || 1;
          // El SKU de regalo trae la talla con coma decimal ("67,5") pero
          // el Catálogo la guarda con punto ("67.5") — normalizeTalla solo
          // reconoce el formato con punto.
          const skuRegalo = m[2].replace(",", ".");
          const match = findBestPrefixMatch(skuRegalo, catalogMap);
          if (match) {
            items.push({
              productId: match.product.productId,
              sku: skuRegalo,
              variantTitle: match.talla || "",
              qty,
            });
          }
        }
      }
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

  // Campos separados de la dirección (Jennifer, 2026-08-27): necesarios
  // para el fichero de etiquetas de Furniture (C.POSTAL/POBLACIÓN/
  // PROVINCIA van en columnas propias, no mezclados en un solo texto como
  // "Dirección de entrega"). "furnitureAddress" incluye la empresa (si la
  // hay) delante de la calle, tal y como pidió Jennifer con el ejemplo de
  // BEZEN12123 ("Desguace Recupera2" + "Av segre 1").
  const furnitureAddress = [address.company, address.address1, address.address2].filter(Boolean).join(", ");

  // Cancelado de verdad en Shopify (distinto del botón manual "Cancelar
  // pedido" nuestro) — exige TAMBIÉN closed_at (archivado), no solo
  // cancelled_at: cuando SeQura/Cetelem marca un pago como vencido puede
  // dejar cancelled_at puesto sin que Jennifer considere el pedido
  // realmente cancelado — solo cuenta cancelado Y archivado (2026-09-16).
  // Un pedido reembolsado (financial_status "refunded") se trata exactamente
  // igual que uno cancelado — mismo aviso de campanita si tiene algo
  // pendiente en Proveedores, mismo estilo de fila (Jennifer, 2026-09-16,
  // caso real BEZEN11816: ya pagado y procesado, luego reembolsado, y el
  // sistema seguía mostrándolo como si nada).
  const shopifyCancelado = (!!order.cancelled_at && !!order.closed_at) || order.financial_status === "refunded";
  const paymentMethod = normalizePaymentMethod(order.payment_gateway_names);

  return {
    id: order.id,
    // Único origen conectado por ahora — cuando se conecte otra plataforma
    // (Leroy, Carrefour...), su propio mapeo de pedidos deberá poner aquí
    // su nombre en vez de "Shopify" (usado en Logística > Furniture).
    platform: "Shopify",
    orderNumber: order.order_number,
    orderDate: order.created_at || "",
    name: customerName,
    address: addressStr,
    furnitureAddress,
    // Dirección completa sin mezclar CP/población (Jennifer, 2026-09-08,
    // fichero de SEUR): a veces Shopify trae la calle en address1 y el
    // piso/puerta en address2 por separado — hay que juntar los dos, no
    // coger solo el primero.
    streetAddress: [address.address1, address.address2].filter(Boolean).join(", "),
    postalCode: address.zip || "",
    city: address.city || "",
    province: (address.province || "").replace(/\s*Province$/i, "").trim(),
    countryCode: (address.country_code || "").toUpperCase(),
    email: order.email || order.customer?.email || "",
    phone: order.phone || address.phone || order.customer?.phone || "",
    product: uniqueProducts.join(", "),
    services: serviceParts.join(" · "),
    // Si el pedido está cancelado y archivado de verdad, "Transferencia
    // bancaria" pasa a decir "CANCELADO" — Jennifer, 2026-09-16: evita que
    // parezca que sigue pendiente de recibir una transferencia que ya no
    // va a llegar (financiación vencida que acabó cancelándose de verdad).
    paymentMethod: shopifyCancelado && paymentMethod === "TRANSFERENCIA BANCARIA" ? "CANCELADO" : paymentMethod,
    // Solo "paid" cuenta como pagado de verdad — pendiente cubre tanto la
    // transferencia bancaria sin marcar recibida como la financiación
    // (Cetelem/SeQura) todavía sin conceder. Nunca se procesa/pide a
    // proveedor un pedido que no esté en PAGADO (Jennifer, 2026-08-26).
    // "REEMBOLSADO" aparte de "PENDIENTE DE PAGO" (Jennifer, 2026-09-16,
    // caso BEZEN11816) — un pedido reembolsado NO está pendiente de pago,
    // ya se le devolvió el dinero al cliente.
    paymentStatus: order.financial_status === "paid" ? "PAGADO"
      : order.financial_status === "refunded" ? "REEMBOLSADO"
      : "PENDIENTE DE PAGO",
    // Si el pedido está cancelado/reembolsado, "Situación de envío" pasa a
    // decir "cancelado" en vez de arrastrar el fulfillment_status normal de
    // Shopify (Jennifer, 2026-09-16: un reembolsado no puede seguir
    // pareciendo "Pendiente" de enviar).
    shippingStatus: shopifyCancelado ? "cancelado" : (order.fulfillment_status || "pendiente"),
    // Ver mergeCustomFields en orders-store.js: si esto es true, manda
    // sobre el "cancelado" manual preservado (Jennifer, 2026-09-16, caso
    // real BEZEN12204).
    shopifyCancelado,
    price: order.total_price,
    currency: order.currency,
    items,
  };
}

async function fetchShopifyOrders(env) {
  const orders = [];
  // Solo los últimos 4 meses (Jennifer, 2026-09-16): con read_all_orders
  // recién añadido, un sync completo sin límite se puso a traer TODO el
  // historial (años) y el Worker reventó por límite de recursos (error
  // 1102 de Cloudflare) — además ella no necesita más que 4 meses.
  const createdAtMin = new Date();
  createdAtMin.setUTCMonth(createdAtMin.getUTCMonth() - 4);
  let url = `https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/orders.json?limit=250&status=any&created_at_min=${createdAtMin.toISOString()}`;
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

// Fulfillment real en Shopify con seguimiento (Jennifer, 2026-09-21): se
// llama con los candidatos que devuelve orders-store.js al procesar un
// fichero de SEUR/Furniture (ver /orders/tracking-import[-seur]).
// notify_customer:true a propósito — es justo el momento en el que
// Jennifer quiere que el cliente reciba el aviso de envío de Shopify.
//
// `primerEnvio` distingue dos casos (un pack partido en dos envíos pasa
// por aquí dos veces, una por cada seguimiento nuevo):
// - true: se crea el fulfillment de verdad (marca el pedido como enviado
//   en Shopify) — caso normal, y también la PRIMERA vez de un pack partido.
// - false: el pedido ya estaba fulfillado (viene de un envío anterior del
//   mismo pack) — en vez de crear otro fulfillment (Shopify no lo permite,
//   es una sola línea de producto), se ACTUALIZA el seguimiento del mismo
//   fulfillment con el nuevo número. Jennifer confirmó (2026-09-21) que
//   quiere que esto también dispare un aviso nuevo al cliente —
//   update_tracking con notify_customer:true lo hace.
// Líneas "fantasma" de propiedades (Jennifer, 2026-09-25, caso real
// BEZEN12174): cuando un producto lleva opciones tipo montaje/tapa/servicios
// elegidas al comprar, Shopify duplica la línea — la real (con product_id) y
// otra solo con las properties (product_id null, requires_shipping false, ver
// mapOrder). Shopify mete esa línea fantasma en su PROPIA fulfillment order,
// separada de la real, y si no se fulfilla también, se queda abierta para
// siempre y el pedido aparece "parcial" en Shopify aunque esté todo entregado
// (pasaba con el montaje/tapa de BEZEN12174). El SKU de la fantasma siempre
// es el SKU real + "-" + las propiedades codificadas, así que se enlazan por
// ahí — nunca se asume a ciegas que la fantasma es de la tapicería, puede ser
// de cualquier línea real (colchón suelto incluido); solo se cierra la que de
// verdad corresponde a lo que se está fulfillando ahora, dejando intacta la
// de cualquier otro componente del pedido que siga pendiente (Jennifer:
// "no quiero que se marque todo, solo las partes que correspondan").
async function fetchOrderLineItemsInfo(env, orderId) {
  const res = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/orders/${orderId}.json?fields=line_items`, {
    headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN },
  });
  if (!res.ok) return new Map();
  const { order } = await res.json();
  return new Map((order.line_items || []).map((li) => [li.id, { sku: li.sku || "", productId: li.product_id, esFantasma: li.product_id == null }]));
}
function fulfillmentOrdersFantasmaDe(fulfillmentOrders, lineItemsInfo, skusReales) {
  const fantasmaIds = [];
  for (const fo of fulfillmentOrders) {
    if (fo.status !== "open") continue;
    const esFantasma = fo.line_items.every((li) => (lineItemsInfo.get(li.line_item_id) || {}).esFantasma);
    if (!esFantasma) continue;
    const coincide = fo.line_items.some((li) => {
      const info = lineItemsInfo.get(li.line_item_id);
      return info && skusReales.some((sku) => info.sku.startsWith(sku + "-"));
    });
    if (coincide) fantasmaIds.push(fo.id);
  }
  return fantasmaIds;
}

// Reparto por tipo de producto real que se está fulfillando (Jennifer,
// 2026-09-25, caso real BEZEN12173): un pedido puede tener un colchón suelto
// Y tapicería como líneas SEPARADAS de Shopify (no un pack de un solo SKU),
// y Shopify las agrupa en la MISMA fulfillment order por ir a la misma
// ubicación. Fulfillar esa fulfillment order entera marcaría el colchón como
// enviado aunque solo haya salido la tapicería por Furniture (o al revés con
// SEUR). Mismo criterio que ya usa InventoryStore (TYPE_MAP en
// inventory-store.js) para no inventar una segunda regla: tapicería/Pack va
// con FURNITURE, colchón/almohada/protector/topper va con SEUR. Si solo hay
// un tipo de producto real de por medio (el caso normal — pack, o un solo
// artículo), no se filtra nada y se comporta exactamente igual que antes.
const TAPICERIA_PRODUCT_TYPES = new Set(["Canapé", "Canapé fijo", "Base", "Cabecero", "Pack"]);
const STOCK_PRODUCT_TYPES = new Set(["Colchones", "Almohada", "Protector de colchón", "Topper"]);
async function fetchProductTypes(env, productIds) {
  const ids = [...new Set(productIds)].filter(Boolean);
  if (!ids.length) return new Map();
  const res = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/products.json?ids=${ids.join(",")}&fields=id,product_type`, {
    headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN },
  });
  if (!res.ok) return new Map();
  const { products } = await res.json();
  return new Map(products.map((p) => [p.id, p.product_type]));
}
async function seleccionarLineasReales(env, realLineItems, lineItemsInfo, company) {
  if (realLineItems.length <= 1) return realLineItems;
  const productIds = realLineItems.map((li) => lineItemsInfo.get(li.line_item_id).productId);
  if (new Set(productIds).size <= 1) return realLineItems;
  const tipos = await fetchProductTypes(env, productIds);
  const deseado = company === "FURNITURE" ? TAPICERIA_PRODUCT_TYPES : company === "SEUR" ? STOCK_PRODUCT_TYPES : null;
  if (!deseado) return realLineItems;
  const seleccion = realLineItems.filter((li) => deseado.has(tipos.get(lineItemsInfo.get(li.line_item_id).productId)));
  // Si ningún artículo encaja en el tipo esperado (categoría desconocida,
  // producto raro...) no nos arriesgamos a dejarlo todo sin fulfillar —
  // mejor mantener el comportamiento anterior (fulfillar todo) que silenciar
  // un envío real.
  return seleccion.length ? seleccion : realLineItems;
}

async function shopifyFulfillOrder(env, { orderId, trackingNumber, trackingUrl, company, primerEnvio, fulfillmentId }) {
  if (!primerEnvio) {
    if (!fulfillmentId) return { ok: false, orderId, reason: "sin_fulfillment_previo_guardado" };
    const res = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/fulfillments/${fulfillmentId}/update_tracking.json`, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({
        fulfillment: { tracking_info: { number: trackingNumber, url: trackingUrl, company }, notify_customer: true },
      }),
    });
    if (!res.ok) return { ok: false, orderId, reason: "update_tracking_error", detail: await res.text() };
    return { ok: true, orderId, fulfillmentId };
  }

  const foRes = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/orders/${orderId}/fulfillment_orders.json`, {
    headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN },
  });
  if (!foRes.ok) return { ok: false, orderId, reason: "fulfillment_orders_error", detail: await foRes.text() };
  const { fulfillment_orders } = await foRes.json();
  const lineItemsInfo = await fetchOrderLineItemsInfo(env, orderId);
  const abierto = (fulfillment_orders || []).find(
    (fo) => fo.status === "open" && fo.line_items.some((li) => !(lineItemsInfo.get(li.line_item_id) || {}).esFantasma)
  );
  if (!abierto) return { ok: false, orderId, reason: "sin_fulfillment_order_abierto" };

  const realLineItems = abierto.line_items.filter((li) => !(lineItemsInfo.get(li.line_item_id) || {}).esFantasma);
  const seleccionadas = await seleccionarLineasReales(env, realLineItems, lineItemsInfo, company);
  const skusSeleccionados = seleccionadas.map((li) => lineItemsInfo.get(li.line_item_id).sku).filter(Boolean);
  const fantasmaIds = fulfillmentOrdersFantasmaDe(fulfillment_orders || [], lineItemsInfo, skusSeleccionados);

  const entradaPrincipal = seleccionadas.length === realLineItems.length
    ? { fulfillment_order_id: abierto.id }
    : { fulfillment_order_id: abierto.id, fulfillment_order_line_items: seleccionadas.map((li) => ({ id: li.id, quantity: li.quantity })) };
  const lineItemsByFo = [entradaPrincipal, ...fantasmaIds.map((id) => ({ fulfillment_order_id: id }))];

  const res = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/fulfillments.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN, "content-type": "application/json" },
    body: JSON.stringify({
      fulfillment: {
        line_items_by_fulfillment_order: lineItemsByFo,
        tracking_info: { number: trackingNumber, url: trackingUrl, company },
        notify_customer: true,
      },
    }),
  });
  if (!res.ok) return { ok: false, orderId, reason: "fulfillment_create_error", detail: await res.text() };
  const { fulfillment } = await res.json();
  return { ok: true, orderId, fulfillmentId: fulfillment && fulfillment.id };
}

// Recorre los candidatos que devuelve orders-store.js, llama a Shopify uno
// a uno, y confirma en la DO los que salieron bien para que no se
// reintenten en el futuro (ver /orders/shopify-fulfilled). Lleva un mapa
// local orderId->fulfillmentId por si el MISMO pedido trae dos seguimientos
// nuevos en el mismo fichero (pack partido resuelto de golpe) — sin esto,
// ambos candidatos llegarían marcados "primerEnvio:true" desde
// orders-store.js (que no sabe nada del primero hasta que se guarda) y el
// segundo intentaría crear un fulfillment duplicado.
async function procesarFulfillmentsShopify(env, paraShopify) {
  const activo = shopifyFulfillActivo();
  if (!activo || !paraShopify || !paraShopify.length) {
    return { activo, enviados: 0, errores: [] };
  }
  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  let enviados = 0;
  const errores = [];
  const fulfillmentIdsEnEsteLote = new Map();
  for (const c of paraShopify) {
    const yaEnEsteLote = fulfillmentIdsEnEsteLote.get(c.orderId);
    const candidato = yaEnEsteLote ? { ...c, primerEnvio: false, fulfillmentId: yaEnEsteLote } : c;
    const resultado = await shopifyFulfillOrder(env, candidato);
    if (resultado.ok) {
      if (candidato.primerEnvio) {
        fulfillmentIdsEnEsteLote.set(c.orderId, resultado.fulfillmentId);
        await stub.fetch("https://do/orders/shopify-fulfilled", {
          method: "POST",
          body: JSON.stringify({ id: c.orderId, fulfillmentId: resultado.fulfillmentId }),
        });
      }
      enviados++;
    } else {
      errores.push({ orderNumber: c.orderNumber, albaran: c.trackingNumber, reason: resultado.reason, detail: resultado.detail });
    }
  }
  return { activo: true, enviados, errores };
}

// Guarda en cada albarán de Furniture si falló el envío a Shopify (y lo
// borra si salió bien), para reintentarlo en la siguiente subida
// (Jennifer, 2026-09-29).
async function marcarErroresShopifyFurniture(env, candidatos, errores) {
  const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
  for (const c of candidatos || []) {
    const err = (errores || []).find((x) => x.orderNumber === c.orderNumber && x.albaran === c.trackingNumber);
    await stub.fetch("https://do/orders/furniture-shopify-error", {
      method: "POST",
      body: JSON.stringify({ orderNumber: c.orderNumber, albaran: c.trackingNumber, error: err ? [err.reason, err.detail].filter(Boolean).join(": ").slice(0, 500) : null }),
    });
  }
}

// Notas internas de Sergio (Jennifer, 2026-09-21): pedidos que solo sirven
// para añadir un dato/cargo sobre OTRO pedido real (ej. "CAMBIO COLOR
// CANAPÉ BEZEN12133") — no son un envío de verdad, así que se marcan como
// enviados en Shopify SIN seguimiento y SIN avisar al cliente
// (notify_customer:false, pedido explícito de Jennifer — esos pedidos usan
// el propio email de Sergio, no tiene sentido mandarle un aviso de envío).
// Detectados en orders-store.js (esNotaSergio, mismo patrón que
// mergeOrphans) y fulfillados aquí porque solo aquí hay acceso a env.
async function shopifyFulfillSinSeguimiento(env, orderId) {
  const foRes = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/orders/${orderId}/fulfillment_orders.json`, {
    headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN },
  });
  if (!foRes.ok) return { ok: false, reason: "fulfillment_orders_error" };
  const { fulfillment_orders } = await foRes.json();
  const abierto = (fulfillment_orders || []).find((fo) => fo.status === "open");
  if (!abierto) return { ok: false, reason: "sin_fulfillment_order_abierto" };

  const res = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/fulfillments.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN, "content-type": "application/json" },
    body: JSON.stringify({
      fulfillment: {
        line_items_by_fulfillment_order: [{ fulfillment_order_id: abierto.id }],
        notify_customer: false,
      },
    }),
  });
  if (!res.ok) return { ok: false, reason: "fulfillment_create_error" };
  return { ok: true };
}

async function procesarNotasFulfillar(env, ids) {
  if (!shopifyFulfillActivo() || !ids || !ids.length) return;
  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  for (const orderId of ids) {
    const resultado = await shopifyFulfillSinSeguimiento(env, orderId);
    if (resultado.ok) {
      await stub.fetch("https://do/orders/shopify-fulfilled", { method: "POST", body: JSON.stringify({ id: orderId }) });
    }
  }
}

// Fallback por nombre cuando el SKU no sirve para encontrar el producto
// (Jennifer, 2026-09-17, Carrefour: fila sin SKU; ampliado 2026-09-19 al
// conectar Worten, cuya columna "SKU de Tienda" casi siempre trae un
// identificador interno del marketplace en vez del código real — ver
// mapMarketplaceOrder, que ahora prueba este camino también cuando el SKU
// SÍ viene pero no ha encajado con nada). Busca el nombre del modelo (el
// último trozo del título del Catálogo, que sigue el patrón "... | ... |
// Modelo") dentro del texto de "Detalles" — o, si no encaja así, contra los
// alias de nombre libre que Jennifer haya añadido a mano (altTitleKeywords,
// para cuando el marketplace traduce o renombra el modelo, ej. Worten
// llama "Extrasuave" a lo que aquí es "Toscana Deluxe").
function findByTitleFallback(detalles, products) {
  const normalize = (s) => (s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const detallesNorm = normalize(detalles);
  if (!detallesNorm) return null;
  // Recoge TODAS las coincidencias posibles (nombre real del modelo o
  // alias) y se queda con la más larga/específica — igual que
  // findBestPrefixMatch con los códigos de SKU (Jennifer, 2026-09-21, caso
  // real Worten: "Pharma Therapy" genérico y "Pharmatherapy Slim" son dos
  // productos distintos del catálogo, hace falta que gane el más
  // específico si algún día ambos encajaran a la vez).
  let best = null;
  for (const p of Object.values(products)) {
    if (p.product_type === "Pack" || !p.title) continue;
    const parts = p.title.split("|").map((s) => s.trim()).filter(Boolean);
    const candidates = [parts[parts.length - 1], ...(p.altTitleKeywords || [])];
    for (const candidate of candidates) {
      if (candidate && candidate.length >= 4 && detallesNorm.includes(normalize(candidate))) {
        if (!best || candidate.length > best.matchLength) best = { product: p, matchLength: candidate.length };
      }
    }
  }
  return best ? { product: best.product, talla: null } : null;
}
// El fallback por nombre no trae talla (a diferencia del SKU, el texto de
// "Detalles" no sigue un patrón fijo) — se busca sueltas por el patrón
// habitual "NNNxNNN" en el texto entero, sea cual sea el idioma o el orden
// de las palabras (visto real en Worten: a veces la talla va pegada al
// nombre del modelo, ej. "Extrasuave 140x200 | 21 Cm | Firmeza Média").
function extractTallaFromText(text) {
  const m = String(text || "").match(/(\d{2,3})\s*[xX]\s*(\d{2,3})/);
  return m ? `${m[1]}X${m[2]}` : "";
}
// A diferencia de Shopify, un pedido de marketplace no trae el color en un
// campo aparte (solo la talla, ver resolveMarketplaceItem) — pero el texto
// del pedido a veces sí lo dice de forma legible, ej. "... | Color Cerezo |
// ..." (Jennifer, 2026-09-25, caso real Carrefour 76401664-A: salía "(sin
// color)" en la referencia de Polival y la receta de fábrica, aunque el
// propio pedido decía el color). Solo se usa si encaja este patrón exacto —
// si no aparece así, se sigue sin color como hasta ahora, no se adivina.
function extractColorFromText(text) {
  const m = String(text || "").match(/\|\s*Color\s+([^|]+?)\s*\|/i);
  return m ? m[1].trim() : "";
}
// Número de pedido interno a partir de la referencia real del marketplace
// (Jennifer, 2026-09-21, caso real Conforama ES: referencias con letras,
// ej. "MP6172617500191839-A" — `Number(...)` de eso da NaN, y los 76
// pedidos se quedaban con orderNumber 0, todos chocando entre sí). Se
// ignora cualquier letra/guion y se cogen los últimos 15 dígitos (cabe
// dentro del rango seguro de Number, y coincide con el mismo tramo final
// que ya usa referenciaSeur/truncarReferenciaSeur para la etiqueta de
// SEUR — así el cruce de seguimiento encaja con lo que SEUR devuelve).
// EQUIVALENTE cliente: ver extractTrackingOrderNumber, más abajo en el
// script embebido — misma lógica, dos sitios porque uno corre en el
// Worker y el otro en el navegador.
function referenceDigits(ref) {
  // IMPORTANTE: recortar primero a los últimos 15 CARACTERES (igual que
  // truncarReferenciaSeur) y solo DESPUÉS quitar las letras — hacerlo al
  // revés (quitar letras y luego recortar dígitos) da un número distinto
  // al que se puede extraer de la referencia que devuelve SEUR, porque
  // SEUR trunca por caracteres, no por dígitos (verificado con un caso
  // real: "MP9992626000271599-A" da 992626000271599 quitando letras antes,
  // pero SEUR devolvería "2626000271599-A" — 2626000271599, un número
  // distinto — así SÍ coinciden).
  const truncado = String(ref || "").slice(-15);
  const digits = truncado.replace(/\D/g, "");
  return Number(digits) || 0;
}

// Convierte una fila ya parseada del fichero de un marketplace (Carrefour,
// Maison Du Monde, Worten...) en un pedido con la MISMA forma que produce
// mapOrder() para Shopify, para poder reusar tal cual el motor de
// inventario (/orders/import -> processInventory -> InventoryStore.
// processSale) sin tocarlo. `items` lleva el productId REAL del Catálogo
// (no el del marketplace) porque resolveItem() en inventory-store.js
// resuelve por productId, no por SKU — el SKU solo sirve aquí para
// encontrar ese productId (findBestPrefixMatch; si no encaja con nada —
// SKU vacío, o un identificador interno del marketplace que no significa
// nada para nosotros, ver Worten — se prueba el fallback por nombre contra
// el texto de "Detalles").
// Resuelve UNA línea/entrada (un artículo) del pedido contra el Catálogo —
// factorizado de mapMarketplaceOrder (Jennifer, 2026-09-23, caso real
// Carrefour 76257042-A) para poder llamarlo una vez por artículo cuando un
// mismo pedido trae varios colchones distintos, en vez de una sola vez
// para todo el pedido.
function resolveMarketplaceItem(e, catalogMap) {
  let match = e.sku ? findBestPrefixMatch(e.sku, catalogMap) : null;
  let skuUsado = match ? e.sku : null;
  // Segundo intento por "SKU de la oferta" (Jennifer, 2026-09-21, Conforama:
  // "SKU de Tienda" trae a veces un identificador interno sin relación con
  // nuestro código, mientras que este otro campo SÍ trae el real de forma
  // fiable) — antes de caer al reconocimiento por el texto del pedido.
  if (!match && e.skuOferta) {
    match = findBestPrefixMatch(e.skuOferta, catalogMap);
    if (match) skuUsado = e.skuOferta;
  }
  let viaFallback = false;
  if (!match) {
    match = findByTitleFallback(e.product, catalogMap);
    viaFallback = true;
  }
  if (match && !match.talla) match.talla = extractTallaFromText(e.product);
  // Cuando el SKU que manda el marketplace no sirve para nada (ej. Worten,
  // Jennifer 2026-09-21: "el sku que me coges en Worten no me sirve para
  // luego sacar las etiquetas") y el producto se ha reconocido por el
  // texto del pedido en vez de por el código, se muestra el código REAL
  // nuestro (skuPrefix + talla) en vez del identificador inútil del
  // marketplace — así la columna SKU sirve de verdad para las etiquetas de
  // SEUR y no hay que teclearlo a mano.
  const skuMostrado = viaFallback && match
    ? `${match.product.skuPrefix || ""}${match.talla || ""}`
    : (skuUsado || e.sku);
  // Color leído del texto del pedido si aparece (ver extractColorFromText):
  // se antepone a la talla con el mismo formato "Color / Talla" que ya usa
  // Shopify en variant_title, para poder reusar tal cual extractColor() en
  // inventory-store.js sin duplicar esa lógica aquí.
  const colorTexto = match ? extractColorFromText(e.product) : "";
  const variantTitle = colorTexto ? `${colorTexto} / ${match.talla || ""}` : (match ? match.talla || "" : "");
  const item = match
    ? { productId: match.product.productId, sku: skuMostrado || "", variantTitle, qty: e.qty || 1 }
    : { productId: null, sku: e.sku || "", variantTitle: "", qty: e.qty || 1 };
  // "M" delante del código de un canapé/cabecero/base en marketplace
  // (Jennifer, 2026-09-25, caso real Carrefour 76401664-A, SKU
  // "MCANMONCER150X190"): significa que el cliente compró CON montaje —
  // Shopify lo manda como properties aparte, pero un marketplace lo mete
  // pegado delante del propio código. Ningún prefijo real de tapicería del
  // Catálogo empieza por "M" (comprobado), así que no hay ambigüedad. Solo
  // aplica a tapicería — un colchón con SKU que por casualidad empezara por
  // "M" no tiene montaje como concepto.
  const TAPICERIA_TYPES_MARKETPLACE = new Set(["Canapé", "Canapé fijo", "Base", "Cabecero"]);
  const montaje = !!(match && TAPICERIA_TYPES_MARKETPLACE.has(match.product.product_type)
    && /^M/i.test(String(skuUsado || e.sku || "").trim()));
  return { item, skuMostrado, matched: !!match, montaje };
}

// `entriesGrupo`: todas las filas del fichero que comparten el mismo
// "Número de pedido" — normalmente 1, pero un cliente puede comprar 2+
// colchones distintos en el mismo pedido (Jennifer, 2026-09-23: "esto
// claro que puede pasar... en ese caso habría que gestionar ambos"). Antes
// se llamaba una vez POR FILA y cada llamada generaba un pedido con el
// MISMO id (prefijo+número) — la última pisaba a las anteriores en
// `orders[order.id] = ...` (orders-store.js) y el artículo se perdía sin
// dejar rastro (caso real: 76257042-A). Ahora se agrupa antes de llamar
// aquí (ver el handler de /api/<plataforma>/import) y se construye UN
// pedido con TANTOS `items` como filas — mismo patrón que ya usa
// mapOrder() de Shopify para los packs (varias líneas, un pedido).
function mapMarketplaceOrder(entriesGrupo, catalogMap, platform) {
  const first = entriesGrupo[0];
  const items = [];
  const productParts = [];
  const skuParts = [];
  const serviceParts = [];
  for (const e of entriesGrupo) {
    const { item, skuMostrado, montaje } = resolveMarketplaceItem(e, catalogMap);
    items.push(item);
    productParts.push(e.product);
    skuParts.push(skuMostrado || e.sku || "");
    // Mismo formato que usa Shopify en "services" (ver mapOrder) para que
    // tieneMontajeFurniture() lo reconozca tal cual, sin duplicar esa lógica
    // aquí (ver resolveMarketplaceItem).
    if (montaje) serviceParts.push("Montaje: Con Montaje");
  }
  const prefijo = MARKETPLACE_ID_PREFIX[platform] || "MKT";
  return {
    id: prefijo + "-" + first.orderNumber,
    platform,
    orderNumber: referenceDigits(first.orderNumber),
    orderRef: first.orderNumber,
    orderDate: first.orderDate,
    name: first.name,
    address: first.address,
    furnitureAddress: first.address,
    streetAddress: first.address,
    postalCode: first.postalCode,
    city: first.city,
    province: first.province,
    // Carrefour es solo España (Jennifer, 2026-09-17); Maison Du Monde
    // vende también a Francia e Italia (fichero real, 2026-09-19: 89
    // pedidos "Espagne", 60 "France", 52 "Italie") — el país real del
    // fichero (ver PAIS_A_COUNTRY_CODE) decide si el envío de SEUR sale
    // como nacional o internacional (ver buildSeurExport/esNacional).
    countryCode: first.countryCode || "ES",
    email: first.email,
    phone: first.phone,
    // Varios artículos se listan juntos (mismo separador que usa mapOrder
    // de Shopify para "Producto comprado") — igual para SKU, así la
    // columna SKU de la tabla sigue siendo útil aunque haya más de uno.
    product: productParts.join(", "),
    services: serviceParts.join(" · "),
    // Todos los pedidos de estos marketplaces se tratan como pagados
    // (Jennifer, 2026-09-17) — no hay un estado de pago fila a fila fiable
    // como en Shopify.
    paymentMethod: platform.toUpperCase().replace(/\s+/g, "_"),
    paymentStatus: "PAGADO",
    shippingStatus: "pendiente",
    // El "Importe total del pedido con IVA" ya viene repetido igual en
    // cada fila del mismo pedido (verificado con el caso real de arriba:
    // dos filas, mismo total 465.0 en las dos) — coger el de la primera
    // fila es correcto, no hay que sumarlos.
    price: first.price,
    currency: "EUR",
    items,
    sku: skuParts.join(", "),
    qty: items.reduce((s, it) => s + (it.qty || 1), 0),
    // Si CUALQUIER artículo del pedido no se reconoce, todo el pedido se
    // marca para revisar — antes era por fila, ahora por pedido completo.
    skuMatched: items.every((it) => it.productId != null),
    estado: first.estado,
    // "Fecha límite de envío" de Mirakl (Jennifer, 2026-09-29): hasta
    // cuándo hay que dar el seguimiento al cliente.
    limiteEnvio: first.limiteEnvio || "",
  };
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

// Catálogo cargado una sola vez por sync/webhook para resolver las
// "Almohadas de regalo" dentro de mapOrder() (2026-09-18) — no hace falta
// pedirlo pedido a pedido.
async function loadCatalogMap(env) {
  const catalogRes = await inventoryStub(env).fetch("https://do/catalog");
  const catalogList = await catalogRes.json();
  return Object.fromEntries(catalogList.map((p) => [p.productId, p]));
}

async function handleSync(env) {
  const rawOrders = await fetchShopifyOrders(env);
  const catalogMap = await loadCatalogMap(env);
  const mapped = rawOrders.map((o) => mapOrder(o, catalogMap));

  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  const res = await stub.fetch("https://do/orders/import", {
    method: "POST",
    body: JSON.stringify(mapped),
  });
  const { notasParaFulfillar } = await res.json();
  await procesarNotasFulfillar(env, notasParaFulfillar);

  return Response.json({ synced: mapped.length });
}

async function handleUpsertOrder(rawOrder, env) {
  const catalogMap = await loadCatalogMap(env);
  const mapped = mapOrder(rawOrder, catalogMap);
  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  const res = await stub.fetch("https://do/orders/upsert", {
    method: "POST",
    body: JSON.stringify(mapped),
  });
  const { notasParaFulfillar } = await res.json();
  await procesarNotasFulfillar(env, notasParaFulfillar);
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

// Emails al almacén (Jennifer, 2026-09-28) — ver avisos-almacen.js.
async function pedidoDeBackorder(env, entry) {
  try {
    const orders = await (await env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify")).fetch("https://do/orders")).json();
    return orders.find((x) => String(x.id) === String(entry.orderId)) || null;
  } catch (e) {
    return null; // sin datos del pedido, el aviso sale igual
  }
}

// Transformación: el almacén tiene que subir el colchón de la medida de
// origen a fábrica. Etiqueta 15x10 cm adjunta para pegarla al colchón.
async function avisarAlmacenTransformacion(env, entry) {
  const o = await pedidoDeBackorder(env, entry);
  const cliente = (o && o.name) || "";
  const pedido = referenciaPedidoAlmacen(entry);
  const unidades = entry.cantidad || 1;
  const lineas = [
    "Hay que subir a fábrica para transformar:",
    "",
    `${entry.stockModel}`,
    `De ${entry.transformadoDesde}${entry.transformadoDesdeAbierto ? " (el colchón ABIERTO" + (entry.notaAbierto ? " — " + entry.notaAbierto : "") + ")" : ""} a ${entry.talla} — ${unidades} ${unidades > 1 ? "unidades" : "unidad"}`,
    "",
    `Pedido: ${pedido}${cliente ? " — " + cliente : ""}`,
    "",
    "Sale por Furniture (colchón abierto).",
    "",
    "Se adjunta la etiqueta para imprimir y pegar en el colchón.",
  ];
  const pdf = etiquetaTransformacionPdf({
    pedido, cliente, modelo: modeloCorto(entry.stockModel) + (entry.transformadoDesdeAbierto ? " · ABIERTO" + (entry.notaAbierto ? " · " + entry.notaAbierto : "") : ""),
    desde: entry.transformadoDesde, hasta: entry.talla, unidades, fecha: fechaHoyEs(),
  });
  return enviarEmailAlmacen(env, { asunto: `Transformación de colchón — ${pedido}`, texto: lineas.join("\n"), pdf, nombrePdf: `Etiqueta transformacion ${pedido}.pdf` });
}

// Reserva de un artículo marcado a mano como "STOCK" (Jennifer, 2026-09-28:
// de tapicería la app no conoce el stock, así que lo marcan ellos). Un
// canapé lleva una etiqueta por BULTO (mismo desglose que el fichero de
// Furniture: tapas, cajones, fondo, bisagras...), para que el almacén
// reserve todas sus partes; el resto, una por unidad.
async function reservarStockManual(env, entry) {
  const o = await pedidoDeBackorder(env, entry);
  const cliente = (o && o.name) || "";
  const pedido = referenciaPedidoAlmacen(entry);
  let bultos;
  if (entry.tipo === "tapiceria") {
    const piezas = piezasBackorder(entry, (o && o.product) || "", tapaPartidaFurniture((o && o.services) || ""), (o && o.services) || "");
    bultos = piezas.map((p) => {
      // p.texto = "<referencia> <parte> <resto>": para la etiqueta, el
      // artículo sin referencia ni parte, y la parte en grande aparte.
      let resto = p.texto;
      if (entry.referencia && resto.startsWith(entry.referencia + " ")) resto = resto.slice(entry.referencia.length + 1);
      if (p.parte && resto.startsWith(p.parte + " ")) resto = resto.slice(p.parte.length + 1);
      return { articulo: resto, parte: p.parte === "REVISAR" ? "" : p.parte };
    });
  } else {
    bultos = bultosPorUnidad(entry);
  }
  return enviarReservaAlmacen(env, { pedido, cliente, lineasTexto: [lineaTextoReserva(entry)], bultos });
}

async function proxyInventory(env, path, request) {
  const stub = inventoryStub(env);
  const init = request.method === "GET" ? undefined : { method: request.method, body: await request.text() };
  const res = await stub.fetch("https://do" + path, init);
  return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
}

// Aviso de campanita (Jennifer, 2026-09-16, caso real BEZEN12204): un
// pedido cancelado puede tener un pendiente ya en Polival/Luso/New — a
// veces hasta ya pedido a fábrica de verdad. Cruza OrdersStore (pedidos
// cancelados) con InventoryStore (backorders) porque viven en DOs
// distintos, igual que hace buildSeurExport. Se calcula al vuelo, nada se
// guarda aparte — el "resuelto" vive en el propio backorder (estado
// "cancelado", ver cancelBackorder en inventory-store.js).
async function getAvisosCancelados(env) {
  const ordersId = env.ORDERS_STORE.idFromName("shopify");
  const ordersStub = env.ORDERS_STORE.get(ordersId);
  const invStub = inventoryStub(env);
  const [orders, backorders] = await Promise.all([
    ordersStub.fetch("https://do/orders").then((r) => r.json()),
    invStub.fetch("https://do/backorders").then((r) => r.json()),
  ]);
  const canceladosById = new Map(orders.filter((o) => o.cancelado).map((o) => [o.id, o]));

  // Si todavía no se había pedido a fábrica (pedidoGenerado:false), no hace
  // falta llamar a nadie — se cancela solo, sin avisar con la campanita
  // (Jennifer, 2026-09-16). El aviso se reserva para cuando de verdad ya
  // se generó el pedido y hay que anularlo con el proveedor.
  const autoCancelar = backorders.filter((b) => canceladosById.has(b.orderId) && b.estado === "pendiente" && !b.pedidoGenerado);
  await Promise.all(autoCancelar.map((b) => invStub.fetch(`https://do/backorders/${encodeURIComponent(b.id)}/cancelar`, { method: "POST" })));
  const fechaAuto = new Date().toISOString();
  for (const b of autoCancelar) { b.estado = "cancelado"; b.fechaCancelado = fechaAuto; }

  const pendientes = [];
  const resueltos = [];
  for (const b of backorders) {
    const order = canceladosById.get(b.orderId);
    if (!order || (b.estado !== "pendiente" && b.estado !== "cancelado")) continue;
    const item = {
      backorderId: b.id, orderId: order.id, orderNumber: order.orderNumber, name: order.name,
      platform: order.platform, orderRef: order.orderRef,
      proveedor: b.proveedor, stockModel: b.stockModel, talla: b.talla, cantidad: b.cantidad,
      pedidoGenerado: !!b.pedidoGenerado, fechaPedidoFabrica: b.fechaPedidoFabrica || null,
      fechaCancelado: b.fechaCancelado || null,
    };
    if (b.estado === "pendiente") pendientes.push(item);
    else resueltos.push(item);
  }
  return { pendientes, resueltos };
}

async function handleGetOrders(env) {
  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  // Carrefour vive en el mismo almacén (cargas compartidas, Fase 2), y
  // devuelve TODOS los pedidos sin filtrar a propósito — Furniture/SEUR/
  // Proveedores/Historial necesitan poder encontrar cualquier pedido de
  // cualquier plataforma en `allOrders` (ver allOrders.find(...) en el
  // cliente). El filtro de "solo Shopify" para Pedidos > Shopify se hace
  // en el cliente, en currentFiltered() — ver renderPage().
  return stub.fetch("https://do/orders");
}

async function handleWebSocket(request, env) {
  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  return stub.fetch("https://do/ws", request);
}

const PLATFORMS = [
  { id: "shopify", label: "Shopify", ready: true },
  { id: "carrefour", label: "Carrefour", ready: true },
  { id: "maison-du-monde", label: "Maison du Monde", ready: true },
  { id: "worten", label: "Worten", ready: true },
  { id: "conforama-es", label: "Conforama ES", ready: true },
  // Jennifer, 2026-09-21: "la tienda de Conforama Francia, que para ti es
  // CONFORAMA a secas" — Conforama ES queda aparcada, así que la francesa
  // se llama simplemente "Conforama", sin sufijo, para no crear confusión.
  { id: "conforama", label: "Conforama", ready: true },
  { id: "leroy-merlin", label: "Leroy Merlin", ready: true },
];

// Ariadna y Arantxa ya no trabajan en la empresa (Jennifer, 2026-09-16) —
// quitadas del selector de usuario. No se borra nada del histórico (notas,
// movimientos de stock...) que quedara a su nombre, solo dejan de poder
// entrar como ellas.
const USERS = ["JENNIFER", "SERGIO"];
const COLOR_ACCESS_USERS = ["SERGIO"];
// Botón "Pagado por transferencia – tramitar ya" (Jennifer, 2026-09-28).
const PAGO_MANUAL_USERS = ["JENNIFER"];
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
          ${p.label}${p.ready ? "" : '<span class="soon">próx.</span>'}${p.id !== "shopify" ? `<span id="plazo-badge-${p.id}" class="plazo-badge" style="display:none" title="Pedidos que vencen mañana, hoy o ya vencidos sin seguimiento"></span>` : ""}
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
  .sidebar .nav-link.sublink { padding-left: 2.25rem; font-size: 13px; }
  .sidebar .sublista-header {
    padding: 8px 1.25rem 4px 1.25rem;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--sidebar-text);
    opacity: 0.65;
  }
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
  #payment-filter, #estado-filter { text-transform: none; font-size: 11px; margin-top: 4px; padding: 2px 4px; font-weight: 400; letter-spacing: normal; }
  #carrefour-table td:first-child, #maison-du-monde-table td:first-child, #worten-table td:first-child, #conforama-table td:first-child, #conforama-es-table td:first-child, #leroy-merlin-table td:first-child { white-space: nowrap; }
  /* Tabla de Pedidos > Shopify más compacta (Jennifer, 2026-09-16): filas
     más estrechas para ver más pedidos de un vistazo sin scroll. */
  #orders th, #orders td { padding: 4px 12px; }
  #orders td { font-size: 13px; }
  /* Mismo motivo en Proveedores (Luso/New/Polival), Jennifer, 2026-09-23:
     "solo me entran 5 líneas y hay que hacer demasiado scroll" — filas más
     estrechas, y el textarea de "Mercancía para pedir a fábrica" (el que
     más alto hacía la fila) más bajo por defecto — sigue siendo
     redimensionable a mano (resize:vertical) si hace falta más texto. */
  #pendientes-table th, #pendientes-table td { padding: 2px 8px; }
  #pendientes-table td { font-size: 12px; }
  #pendientes-table .fabricacion-input { min-height: 22px; padding: 3px 6px; }
  #pendientes-table input, #pendientes-table select, #pendientes-table textarea { font-size: 12px; }
  #pendientes-table .resolver-btn, #pendientes-table .resolver-seur-btn, #pendientes-table .sustituir-btn { padding: 3px 8px; font-size: 12px; }
  /* Proveedores (Jennifer, 2026-10-01: "necesito una fila de scroll... para
     poder ir de izquierda a derecha porque la lista ahora es muy larga"): la
     tabla ocupa como mucho el alto de la pantalla, así la barra horizontal
     de abajo siempre se ve, y hay otra barra igual encima de la tabla. */
  #pendientes-wrap { max-height: calc(100vh - 200px); margin-top: 0; border-top-left-radius: 0; border-top-right-radius: 0; }
  .scroll-arriba { margin: 0 2rem; overflow-x: auto; overflow-y: hidden; height: 16px; border: 1px solid var(--border); border-bottom: none; border-radius: 12px 12px 0 0; background: var(--panel); }
  .scroll-arriba > div { height: 1px; }
  /* La caja de la tabla se limita a la altura visible de la pantalla, para
     que su barra de scroll horizontal quede siempre a mano sin tener que
     bajar hasta el final de la página (Jennifer, 2026-09-16). */
  #view-shopify .table-wrap, #view-carrefour .table-wrap, #view-maison-du-monde .table-wrap, #view-worten .table-wrap, #view-conforama .table-wrap, #view-conforama-es .table-wrap, #view-leroy-merlin .table-wrap { max-height: calc(100vh - 230px); }
  .badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }
  .badge.pendiente { background: #fef3c7; color: #92400e; }
  .badge.pago-pendiente { background: #fee2e2; color: #991b1b; }
  .badge.reembolsado { background: #ede9fe; color: #5b21b6; }
  /* Fecha límite de envío de marketplaces (2026-09-29) */
  .plazo-badge { display: inline-block; min-width: 18px; margin-left: 6px; padding: 0 6px; border-radius: 9px; background: #dc2626; color: #fff; font-size: 11px; font-weight: 700; text-align: center; line-height: 18px; }
  .plazo-envio { display: inline-block; padding: 2px 7px; border-radius: 6px; font-size: 12px; font-weight: 700; white-space: nowrap; }
  .plazo-vencido { background: #7f1d1d; color: #fff; border: 1px solid #450a0a; }
  .plazo-rojo { background: #fee2e2; color: #991b1b; border: 1px solid #ef4444; }
  .plazo-naranja { background: #ffedd5; color: #9a3412; border: 1px solid #f97316; }
  .plazo-verde { background: #dcfce7; color: #146138; }
  .plazo-hecho { background: #f3f4f6; color: #6b7280; font-weight: 500; }
  /* Colchones abiertos (2026-09-28): morado, distinto de la campana */
  .abiertos-badge { display: inline-block; min-width: 18px; margin-left: 6px; padding: 0 6px; border-radius: 9px; background: #7c3aed; color: #fff; font-size: 11px; font-weight: 700; text-align: center; line-height: 18px; }
  .abierto-box { margin-top: 4px; }
  .abierto-tag { display: inline-block; margin: 2px 0; padding: 2px 7px; border-radius: 6px; background: #ede9fe; color: #5b21b6; font-size: 11px; font-weight: 700; white-space: nowrap; }
  .abierto-btn { margin-left: 4px; padding: 2px 8px; font-size: 11px; font-weight: 600; border: 1px solid #7c3aed; border-radius: 6px; background: #fff; color: #7c3aed; cursor: pointer; }
  .abierto-btn:hover { background: #7c3aed; color: #fff; }
  .abiertos-oportunidades-box { margin: 1rem 2rem; padding: 12px 14px; border: 2px solid #c4b5fd; border-radius: 10px; background: #faf5ff; }
  .formato160-box { margin-top: 4px; }
  .formato160-falta { display: inline-block; margin-bottom: 3px; padding: 1px 6px; border-radius: 6px; background: #fee2e2; color: #991b1b; font-size: 11px; font-weight: 700; }
  .formato160-select { font-size: 12px; }
  .transformado-tag { display: inline-block; margin-top: 3px; padding: 1px 6px; border-radius: 6px; background: #e0e7ff; color: #3730a3; font-size: 11px; font-weight: 600; white-space: nowrap; }
  .grupo-envio-item-ref { font-size: 11px; font-weight: 700; color: #92400e; }
  .grupo-envio-tag {
    display: inline-block; margin-top: 4px; padding: 2px 6px; border-radius: 6px;
    background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 600; white-space: nowrap;
  }
  .envio-aparte-btn { margin: 0 0 4px 22px; padding: 1px 7px; font-size: 11px; background: #fff; color: #1e40af; border: 1px solid #93c5fd; border-radius: 6px; cursor: pointer; }
  .envio-aparte-btn:hover { background: #1e40af; color: #fff; }
  .envio-aparte-tag { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 6px; background: #dbeafe; color: #1e40af; font-size: 11px; font-weight: 700; }
  .cancelar-linea-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 1px solid var(--border); border-radius: 6px; background: #fff; color: #6b7280; font-size: 14px; cursor: pointer; }
  .cancelar-linea-btn:hover { color: #b91c1c; border-color: #b91c1c; background: #fff; }
  .cancelar-pendiente-btn { margin-top: 4px; padding: 2px 8px; font-size: 11px; background: #fff; color: #b91c1c; border: 1px solid #fca5a5; border-radius: 6px; cursor: pointer; }
  .cancelar-pendiente-btn:hover { background: #b91c1c; color: #fff; }
  .fila-pendiente-cancelada td { color: #9ca3af; }
  .fila-pendiente-cancelada textarea { opacity: 0.5; pointer-events: none; }
  .cancelado-tag { display: inline-block; padding: 2px 8px; border-radius: 6px; background: #fee2e2; color: #991b1b; font-size: 12px; font-weight: 700; white-space: nowrap; }
  .linea-cancelada-tag { margin-top: 3px; font-size: 11px; font-weight: 700; color: #991b1b; }
  .elegir-unidades-lista { display: flex; flex-direction: column; gap: 6px; margin: 0.5rem 0 0.75rem; }
  .elegir-unidades-fila { display: flex; align-items: center; gap: 8px; font-size: 13.5px; }
  .elegir-unidades-fila input[type=number] { width: 56px; padding: 3px 6px; }
  .no-salio-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 1px solid #fca5a5; border-radius: 6px; background: #fff; color: #b91c1c; font-size: 14px; font-weight: 700; cursor: pointer; }
  .no-salio-btn:hover { background: #b91c1c; color: #fff; }
  .juntar-envio-btn {
    display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 3px;
    border: 1px solid var(--border); border-radius: 6px; background: #fff; color: #6b7280; cursor: pointer;
  }
  .juntar-envio-btn svg { width: 14px; height: 14px; }
  .juntar-envio-btn:hover { color: var(--brand); border-color: var(--brand); }
  .juntar-envio-btn-activa { background: #fef3c7; color: #92400e; border-color: #f59e0b; }
  .badge.pago-manual-tag { background: #dcfce7; color: #146138; margin-top: 4px; font-size: 11px; }
  .pago-manual-btn {
    margin-top: 4px; padding: 3px 8px; font-size: 11px; font-weight: 600; cursor: pointer;
    border: 1px solid var(--brand); border-radius: 6px; background: #fff; color: var(--brand); white-space: nowrap;
  }
  .pago-manual-btn:hover { background: var(--brand); color: #fff; }
  .pago-manual-btn:disabled { opacity: 0.6; cursor: default; }
  .badge.fulfilled { background: #dcfce7; color: #146138; }
  .badge.partial { background: #dbeafe; color: #1e40af; }
  .badge.agencia-seur { background: #e0e7ff; color: #3730a3; }
  .badge.agencia-furniture { background: #fce7f3; color: #9d174d; }
  .badge.agencia-pendiente { background: #fef3c7; color: #92400e; margin-top: 4px; }
  .tracking-link {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 600;
    background: var(--brand-light);
    color: var(--brand-dark);
    text-decoration: none;
  }
  .tracking-link:hover { background: var(--brand); color: white; }
  .tracking-link.tracking-sin-link { background: #f1f5f4; color: var(--muted); cursor: default; }
  .tracking-entry { white-space: nowrap; margin-bottom: 3px; }
  .tracking-entry:last-child { margin-bottom: 0; }
  .tracking-estado { font-size: 11px; color: #92400e; }
  .tracking-estado.tracking-estado-ok { color: var(--brand-dark); }
  .bell-cell { text-align: center; width: 1%; white-space: nowrap; }
  /* Iconos de cada pedido en rejilla de 3 por fila (Jennifer, 2026-09-28:
     "ya tenemos muchos iconos... ponerlos en dos líneas"). */
  .iconos-pedido { display: grid; grid-template-columns: repeat(3, auto); gap: 4px; justify-content: center; align-items: center; }
  .iconos-pedido > * { margin: 0 !important; }
  .cancel-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid var(--border);
    border-radius: 50%;
    width: 22px;
    height: 22px;
    padding: 0;
    cursor: pointer;
    color: #991b1b;
    margin-left: 4px;
    vertical-align: middle;
  }
  .cancel-btn svg { width: 12px; height: 12px; display: block; }
  .cancel-btn:hover { background: #fee2e2; }
  .cancel-btn.cancelado { background: #991b1b; color: white; border-color: #991b1b; }
  .sustituir-pedido-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid var(--border);
    border-radius: 50%;
    width: 22px;
    height: 22px;
    padding: 0;
    cursor: pointer;
    color: var(--brand-dark);
    margin-left: 4px;
    vertical-align: middle;
  }
  .sustituir-pedido-btn svg { width: 12px; height: 12px; display: block; }
  .sustituir-pedido-btn:hover { background: var(--brand-light); }
  .reposicion-pedido-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid #f97316;
    border-radius: 11px;
    height: 22px;
    padding: 0 7px;
    cursor: pointer;
    color: #f97316;
    font-size: 10.5px;
    font-weight: 700;
    line-height: 1;
    margin-left: 4px;
    vertical-align: middle;
  }
  .reposicion-pedido-btn:hover { background: #ffedd5; }
  .reposicion-pedido-btn-activa { background: #f97316; color: white; }
  .reposicion-pedido-btn-activa:hover { background: #ea580c; }
  .gesto-comercial-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid #a855f7;
    border-radius: 11px;
    height: 22px;
    padding: 0 7px;
    cursor: pointer;
    color: #a855f7;
    font-size: 10.5px;
    font-weight: 700;
    line-height: 1;
    margin-left: 4px;
    vertical-align: middle;
  }
  .gesto-comercial-btn:hover { background: #f3e8ff; }
  .gesto-comercial-btn-activa { background: #a855f7; color: white; }
  .gesto-comercial-btn-activa:hover { background: #9333ea; }
  tr.fila-cancelada, tr.fila-cancelada:hover { background: #fee2e2 !important; color: #7f1d1d; }
  tr.fila-cancelada td { text-decoration: line-through; text-decoration-color: #99181866; }
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
  .modal-box-wide { width: min(760px, 92vw); }
  .avisos-bell-btn {
    position: relative;
    background: rgba(255,255,255,0.15);
    border: none;
    border-radius: 50%;
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: white;
    padding: 0;
  }
  .avisos-bell-btn:hover { background: rgba(255,255,255,0.28); }
  .avisos-bell-btn svg { width: 18px; height: 18px; }
  .avisos-bell-count {
    position: absolute;
    top: -4px;
    right: -4px;
    background: #dc2626;
    color: white;
    border-radius: 999px;
    font-size: 10.5px;
    font-weight: 700;
    min-width: 16px;
    height: 16px;
    padding: 0 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .aviso-cancelado-card {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-bottom: 0.6rem;
    background: var(--panel);
  }
  .aviso-cancelado-card.resuelto { opacity: 0.7; }
  .aviso-cancelado-card .aviso-titulo { font-weight: 600; margin-bottom: 2px; }
  .aviso-cancelado-card .aviso-detalle { font-size: 13px; color: var(--muted); }
  .aviso-cancelado-card .aviso-fabrica-tag { display: inline-block; margin-top: 4px; padding: 1px 8px; border-radius: 4px; font-size: 11.5px; font-weight: 600; background: #fee2e2; color: #991b1b; }
  .aviso-cancelado-card .aviso-resuelto-tag { display: inline-block; margin-top: 4px; padding: 1px 8px; border-radius: 4px; font-size: 11.5px; font-weight: 600; background: #f1f5f4; color: var(--muted); }
  .review-question { margin-bottom: 1.1rem; }
  .review-question:last-child { margin-bottom: 0; }
  .review-question p { background: #fef3c7; color: #92400e; border-radius: 8px; padding: 0.6rem 0.85rem; margin: 0 0 0.5rem; font-size: 13.5px; }
  .modal-box textarea { width: 100%; min-height: 60px; box-sizing: border-box; padding: 0.6rem; border: 1px solid var(--border); border-radius: 8px; font: inherit; resize: vertical; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1rem; }
  .modal-actions button.secondary { background: transparent; color: var(--brand-dark); border: 1px solid var(--border); }
  .alternativa-opcion {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    text-align: left;
    padding: 8px 12px;
    margin-bottom: 6px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
    color: var(--text);
    cursor: pointer;
    font: inherit;
    font-size: 13.5px;
    font-weight: 500;
  }
  .alternativa-opcion:hover { border-color: var(--brand); background: var(--brand-light); }
  .alternativa-opcion.selected { border-color: var(--brand); background: var(--brand-light); font-weight: 600; }
  .alternativa-opcion .alternativa-stock { color: var(--muted); font-size: 12px; }
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
  .notas-pendiente-input { width: 100%; min-width: 150px; min-height: 22px; padding: 3px 6px; border: 1px solid var(--border); border-radius: 6px; font: inherit; font-size: 12px; resize: vertical; }
  .revisar-pendiente-btn { padding: 2px 6px; font-size: 11px; }
  .ocultar-recibidos-label { display: flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--brand-dark); cursor: pointer; }
  .carga-abierta-box { margin: 0 2rem 1.5rem; border: 2px solid var(--brand); border-radius: 12px; overflow: hidden; background: var(--brand-light); }
  .carga-abierta-box.tener-en-cuenta-box { border-color: #b45309; background: #fef3c7; }
  .carga-abierta-box.tener-en-cuenta-box h3 { color: #92400e; }
  .carga-abierta-box.retenidos-box { border-color: #6d28d9; background: #f5f3ff; }
  .carga-abierta-box.retenidos-box h3 { color: #5b21b6; }
  .retenido-listo { color: #15803d; font-weight: 600; }
  .coste-tarifa { text-align: right; white-space: nowrap; }
  .reservar-almacen-btn { padding: 2px 8px; font-size: 11px; margin-left: 4px; }
  .reserva-tag { display: inline-block; margin-left: 4px; padding: 3px 8px; border-radius: 4px; background: #dcfce7; color: #166534; border: 1px solid #22c55e; font-size: 11px; font-weight: 700; }
  .carga-abierta-box.revision-box { border-color: #dc2626; background: #fef2f2; }
  .carga-abierta-box.revision-box h3 { color: #b91c1c; }
  .revision-motivo { font-weight: 600; color: #b91c1c; }
  @media (prefers-color-scheme: dark) {
    .carga-abierta-box.revision-box { background: #450a0a; border-color: #ef4444; }
    .carga-abierta-box.revision-box h3, .revision-motivo { color: #fecaca; }
  }
  .coste-unidad { color: var(--muted); font-size: 11px; }
  .preferente-tag { display: inline-block; background: #fee2e2; color: #b91c1c; border: 1px solid #ef4444; font-weight: 700; font-size: 11px; padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
  .valdemoro-tag { display: inline-block; background: #fef3c7; color: #92400e; border: 1px solid #f59e0b; font-weight: 700; font-size: 11px; padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
  .ref-duplicada { display: inline-block; background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; font-weight: 700; font-size: 11px; padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
  .retenido-falta { color: #b45309; font-weight: 600; }
  .retenido-toca { background: #15803d; color: #fff; font-weight: 700; padding: 1px 6px; border-radius: 4px; }
  @media (prefers-color-scheme: dark) {
    .carga-abierta-box.retenidos-box { background: #2e1065; border-color: #7c3aed; }
    .carga-abierta-box.retenidos-box h3 { color: #ddd6fe; }
  }
  .quitar-tener-en-cuenta-btn { padding: 5px 10px; font-size: 12px; background: transparent; color: #92400e; border: 1px solid #92400e; }
  .furniture-items-cell { min-width: 220px; }
  .furniture-item-check { display: flex; align-items: flex-start; gap: 6px; font-size: 12.5px; margin-bottom: 4px; cursor: pointer; }
  .furniture-item-check:last-child { margin-bottom: 0; }
  .furniture-item-check input { margin-top: 2px; }
  .furniture-item-fpk { color: #92400e; }
  .fpk-tag { display: inline-block; margin-left: 4px; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; font-weight: 600; background: #fef3c7; color: #92400e; }
  .furniture-ya-salio-tag { display: block; margin-top: 4px; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; font-weight: 600; background: #dbeafe; color: #1e40af; }
  .furniture-pendiente-tag { display: block; margin-top: 4px; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; font-weight: 600; background: #fef3c7; color: #92400e; }
  .carga-abierta-box .toolbar { padding: 1rem 1rem 0.25rem; }
  .carga-abierta-box .table-wrap { max-height: 320px; }
  /* Cargas de SEUR (Jennifer, 2026-09-29: "el cuadro se corta"): la tabla
     solo tiene 6 columnas, así que se ajusta al ancho del cuadro en vez del
     mínimo general de 1100px, y el texto largo pasa a la línea de abajo. Si
     aun así algo no cabe, el cuadro se puede desplazar en horizontal. */
  #view-seur .carga-abierta-box table, #view-historial-cargas-seur .carga-historial-card table { min-width: 0; }
  .seur-readd-btn { padding: 5px 10px; font-size: 12px; margin: 2px 0; }
  .seur-readd-fecha { padding: 4px 6px; font-size: 12px; margin: 2px 0; }
  .mover-seur { display: flex; gap: 4px; margin-top: 4px; }
  .mover-seur select { padding: 3px 6px; font-size: 12px; }
  .cargas-tabs { display: flex; gap: 6px; flex-wrap: wrap; padding: 0.75rem 1rem 0; }
  .carga-tab { padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border, #d1d5db); background: transparent; color: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .carga-tab.activa { background: #1f8a4c; border-color: #1f8a4c; color: #fff; }
  .carga-tab.vencida { border-color: #dc2626; color: #b91c1c; }
  .carga-tab.vencida.activa { background: #dc2626; color: #fff; }
  .aviso-sin-cerrar { margin: 0.75rem 2rem; padding: 10px 14px; border: 2px solid #dc2626; border-radius: 10px; background: #fef2f2; color: #991b1b; font-size: 14px; }
  #furniture-cargas-tabs .aviso-sin-cerrar { margin: 0 0 6px; }
  @media (prefers-color-scheme: dark) { .aviso-sin-cerrar { background: #450a0a; color: #fecaca; } }
  .mover-seur input, .mover-seur button { padding: 3px 6px; font-size: 12px; }
  .seur-programados { margin: 1rem 2rem; }
  .seur-programados > summary { cursor: pointer; font-weight: 600; padding: 8px 0; }
  .carga-abierta-box .table-wrap, .carga-historial-card .table-wrap { overflow-x: auto; max-width: calc(100% - 4rem); }
  .carga-historial-card .table-wrap { max-height: 420px; }
  /* Jennifer, 2026-09-29: "que toda la información entre a golpe de vista" —
     las cargas de SEUR se ven enteras, sin límite de alto ni scroll interno,
     y los botones de quitar pueden partirse en dos líneas. */
  #view-seur .carga-abierta-box .table-wrap { max-height: none; overflow: visible; }
  #view-seur .carga-abierta-box { overflow: visible; }
  .quitar-seur-btn { white-space: normal; text-align: center; line-height: 1.25; }
  #furniture-pendientes-toolbar { padding-top: 1.5rem; }
  .seur-decision-card { margin: 0 1rem 0.75rem; padding: 0.75rem 1rem; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; }
  .seur-decision-card ul { margin: 0.4rem 0; padding-left: 1.2rem; font-size: 13px; color: var(--muted); }
  .seur-decision-card button { margin-top: 0.4rem; }
  .carga-historial-card { margin: 0 2rem 1.25rem; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .carga-historial-card summary { padding: 0.75rem 1rem; cursor: pointer; font-weight: 600; color: var(--brand-dark); background: var(--panel); list-style: none; }
  .carga-historial-card summary::-webkit-details-marker { display: none; }
  .sacar-carga-btn { padding: 5px 10px; font-size: 12px; background: transparent; color: #991b1b; border: 1px solid #991b1b; }
  #pendientes-filter-row th, #furniture-filter-row th { padding: 8px; background: #eef2f0; position: sticky; top: 34px; z-index: 2; border-top: 1px solid var(--border) !important; border-bottom: 3px solid var(--brand) !important; }
  #pendientes-filter-row input, #furniture-filter-row input { width: 100%; box-sizing: border-box; padding: 4px 6px; font-size: 12.5px; font-weight: 400; text-transform: none; border: 1px solid var(--border); border-radius: 4px; }
  .pedido-generado-tag { display: block; font-size: 13px; font-weight: 600; color: #146138; margin-top: 4px; }
  .reposicion-tag { display: inline-block; margin-top: 4px; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; font-weight: 700; background: #fef3c7; color: #92400e; }
  .gesto-comercial-tag { display: inline-block; margin-top: 4px; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; font-weight: 700; background: #f3e8ff; color: #6b21a8; }
  tr.fila-pedido-generado { background: #eafaf0; }
  tr.fila-pedido-generado:hover { background: #d9f5e3; }
  tr.fila-grupo-inicio td, tr.fila-grupo-medio td, tr.fila-grupo-fin td { border-left: 2px solid var(--brand); border-right: 2px solid var(--brand); }
  tr.fila-grupo-inicio td { border-top: 2px solid var(--brand); }
  tr.fila-grupo-fin td { border-bottom: 2px solid var(--brand); }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
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
    <li><a href="#" class="nav-link" data-inventario="abiertos">Colchones abiertos <span id="abiertos-badge" class="abiertos-badge" style="display:none" title="Pedidos de Furniture que pueden usar un colchón abierto"></span></a></li>
    <li><a href="#" class="nav-link" data-inventario="historial">Historial de stock</a></li>
    <li><a href="#" class="nav-link" data-inventario="pesos">Pesos SEUR</a></li>
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
  <button class="section-title" id="logistica-toggle">
    <span>Logística</span>
    <span class="chevron">▶</span>
  </button>
  <ul id="logistica-list">
    <li class="sublista-header">FURNITURE</li>
    <li><a href="#" class="nav-link sublink" data-logistica="furniture">Pedidos pendientes</a></li>
    <li><a href="#" class="nav-link sublink" data-logistica="historial-cargas">Historial de cargas</a></li>
    <li><a href="#" class="nav-link sublink" data-logistica="casos-revisar">Casos a revisar</a></li>
    <li class="sublista-header">SEUR</li>
    <li><a href="#" class="nav-link sublink" data-logistica="seur">Pedidos pendientes</a></li>
    <li><a href="#" class="nav-link sublink" data-logistica="historial-cargas-seur">Historial de cargas</a></li>
    <li><a href="#" class="nav-link sublink" data-logistica="casos-revisar-seur">Envíos SEUR</a></li>
  </ul>
  <button class="section-title" id="historico-toggle">
    <span>Histórico</span>
    <span class="chevron">▶</span>
  </button>
  <ul id="historico-list">
    <li><a href="#" class="nav-link" data-historico="rep-gc">Histórico reposiciones y gestos comerciales</a></li>
  </ul>
  <button class="section-title" id="tarifas-toggle">
    <span>Tarifas</span>
    <span class="chevron">▶</span>
  </button>
  <ul id="tarifas-list">
    <li><a href="#" class="nav-link" data-tarifas="consultar">Consultar tarifas</a></li>
    <li><a href="#" class="nav-link" data-tarifas="plataformas">Ficheros plataformas</a></li>
  </ul>
  <button class="section-title" id="plazos-toggle">
    <span>Plazos de entrega</span>
    <span class="chevron">▶</span>
  </button>
  <ul id="plazos-list">
    <li><a href="#" class="nav-link" data-plazos="marketplace">Marketplace</a></li>
    <li><a href="#" class="nav-link" data-plazos="bezen">Bezen</a></li>
  </ul>
</nav>
<div class="main">
<header>
  <div class="header-row">
    <div>
      <h1 id="view-title">Pedidos · Shopify</h1>
      <p>Vista en vivo sincronizada con tu tienda</p>
    </div>
    <div style="display:flex;align-items:center;gap:14px">
      <button type="button" id="avisos-cancelados-btn" class="avisos-bell-btn" title="Pedidos cancelados con pendiente en Proveedores">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a1 1 0 0 1 1 1v1.06A7.002 7.002 0 0 1 19 11v3.586l1.707 1.707A1 1 0 0 1 20 18H4a1 1 0 0 1-.707-1.707L5 14.586V11a7.002 7.002 0 0 1 6-6.94V3a1 1 0 0 1 1-1zm0 20a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22z"/></svg>
        <span id="avisos-cancelados-count" class="avisos-bell-count" style="display:none">0</span>
      </button>
      <div class="user-badge" id="user-badge"></div>
    </div>
  </div>
</header>

<div class="modal-overlay" id="avisos-cancelados-modal-overlay">
  <div class="modal-box modal-box-wide">
    <h3>Pedidos cancelados con pendiente en Proveedores</h3>
    <p style="margin:0 0 0.75rem;color:var(--muted);font-size:13px">Si ya se pidió a fábrica, llama al proveedor para cancelarlo antes de marcarlo aquí.</p>
    <div id="avisos-cancelados-pendientes-list"></div>
    <details id="avisos-cancelados-resueltos-details" style="margin-top:1rem">
      <summary style="cursor:pointer;color:var(--muted);font-size:13px">Ya resueltos (rastro)</summary>
      <div id="avisos-cancelados-resueltos-list" style="margin-top:0.5rem"></div>
    </details>
    <div class="modal-actions">
      <button type="button" class="secondary" id="avisos-cancelados-cerrar-btn">Cerrar</button>
    </div>
  </div>
</div>

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

<div id="view-carrefour" style="display:none">
  <div class="toolbar">
    <input id="carrefour-search" type="text" placeholder="Buscar por nº de pedido o nombre..." />
    <label class="ocultar-recibidos-label"><input type="checkbox" id="carrefour-orden-limite"> Primero los que vencen antes</label>
    <button type="button" id="carrefour-upload-btn" class="secondary">Subir fichero de Carrefour</button>
    <input type="file" id="carrefour-upload-input" accept=".xlsx" style="display:none" />
    <span id="carrefour-upload-status" class="inventario-count" style="padding:0"></span>
  </div>
  <div id="carrefour-sku-aviso" class="inventario-count" style="display:none;color:#991b1b;font-weight:600"></div>
  <div id="carrefour-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="carrefour-table">
      <thead><tr><th></th><th>Nº Pedido</th><th>Fecha pedido</th><th>Límite envío</th><th>Nombre</th><th>Dirección</th><th>CP</th><th>Población</th><th>Provincia</th><th>País</th><th>Teléfono</th><th>Producto</th><th>Cantidad</th><th>SKU</th><th>Precio</th><th>Seguimiento</th><th>Notas</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-maison-du-monde" style="display:none">
  <div class="toolbar">
    <input id="maison-du-monde-search" type="text" placeholder="Buscar por nº de pedido o nombre..." />
    <label class="ocultar-recibidos-label"><input type="checkbox" id="maison-du-monde-orden-limite"> Primero los que vencen antes</label>
    <button type="button" id="maison-du-monde-upload-btn" class="secondary">Subir fichero de Maison Du Monde</button>
    <input type="file" id="maison-du-monde-upload-input" accept=".xlsx" style="display:none" />
    <span id="maison-du-monde-upload-status" class="inventario-count" style="padding:0"></span>
  </div>
  <div id="maison-du-monde-sku-aviso" class="inventario-count" style="display:none;color:#991b1b;font-weight:600"></div>
  <div id="maison-du-monde-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="maison-du-monde-table">
      <thead><tr><th></th><th>Nº Pedido</th><th>Fecha pedido</th><th>Límite envío</th><th>Nombre</th><th>Dirección</th><th>CP</th><th>Población</th><th>Provincia</th><th>País</th><th>Teléfono</th><th>Producto</th><th>Cantidad</th><th>SKU</th><th>Precio</th><th>Seguimiento</th><th>Notas</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-worten" style="display:none">
  <div class="toolbar">
    <input id="worten-search" type="text" placeholder="Buscar por nº de pedido o nombre..." />
    <label class="ocultar-recibidos-label"><input type="checkbox" id="worten-orden-limite"> Primero los que vencen antes</label>
    <button type="button" id="worten-upload-btn" class="secondary">Subir fichero de Worten</button>
    <input type="file" id="worten-upload-input" accept=".xlsx" style="display:none" />
    <span id="worten-upload-status" class="inventario-count" style="padding:0"></span>
  </div>
  <div id="worten-sku-aviso" class="inventario-count" style="display:none;color:#991b1b;font-weight:600"></div>
  <div id="worten-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="worten-table">
      <thead><tr><th></th><th>Nº Pedido</th><th>Fecha pedido</th><th>Límite envío</th><th>Nombre</th><th>Dirección</th><th>CP</th><th>Población</th><th>Provincia</th><th>País</th><th>Teléfono</th><th>Producto</th><th>Cantidad</th><th>SKU</th><th>Precio</th><th>Seguimiento</th><th>Notas</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-conforama" style="display:none">
  <div class="toolbar">
    <input id="conforama-search" type="text" placeholder="Buscar por nº de pedido o nombre..." />
    <label class="ocultar-recibidos-label"><input type="checkbox" id="conforama-orden-limite"> Primero los que vencen antes</label>
    <button type="button" id="conforama-upload-btn" class="secondary">Subir fichero de Conforama</button>
    <input type="file" id="conforama-upload-input" accept=".xlsx" style="display:none" />
    <span id="conforama-upload-status" class="inventario-count" style="padding:0"></span>
  </div>
  <div id="conforama-sku-aviso" class="inventario-count" style="display:none;color:#991b1b;font-weight:600"></div>
  <div id="conforama-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="conforama-table">
      <thead><tr><th></th><th>Nº Pedido</th><th>Fecha pedido</th><th>Límite envío</th><th>Nombre</th><th>Dirección</th><th>CP</th><th>Población</th><th>Provincia</th><th>País</th><th>Teléfono</th><th>Producto</th><th>Cantidad</th><th>SKU</th><th>Precio</th><th>Seguimiento</th><th>Notas</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-conforama-es" style="display:none">
  <div class="toolbar">
    <input id="conforama-es-search" type="text" placeholder="Buscar por nº de pedido o nombre..." />
    <label class="ocultar-recibidos-label"><input type="checkbox" id="conforama-es-orden-limite"> Primero los que vencen antes</label>
    <button type="button" id="conforama-es-upload-btn" class="secondary">Subir fichero de Conforama ES</button>
    <input type="file" id="conforama-es-upload-input" accept=".xlsx" style="display:none" />
    <span id="conforama-es-upload-status" class="inventario-count" style="padding:0"></span>
  </div>
  <div id="conforama-es-sku-aviso" class="inventario-count" style="display:none;color:#991b1b;font-weight:600"></div>
  <div id="conforama-es-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="conforama-es-table">
      <thead><tr><th></th><th>Nº Pedido</th><th>Fecha pedido</th><th>Límite envío</th><th>Nombre</th><th>Dirección</th><th>CP</th><th>Población</th><th>Provincia</th><th>País</th><th>Teléfono</th><th>Producto</th><th>Cantidad</th><th>SKU</th><th>Precio</th><th>Seguimiento</th><th>Notas</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-leroy-merlin" style="display:none">
  <div class="toolbar">
    <input id="leroy-merlin-search" type="text" placeholder="Buscar por nº de pedido o nombre..." />
    <label class="ocultar-recibidos-label"><input type="checkbox" id="leroy-merlin-orden-limite"> Primero los que vencen antes</label>
    <button type="button" id="leroy-merlin-upload-btn" class="secondary">Subir fichero de Leroy Merlin</button>
    <input type="file" id="leroy-merlin-upload-input" accept=".xlsx" style="display:none" />
    <span id="leroy-merlin-upload-status" class="inventario-count" style="padding:0"></span>
  </div>
  <div id="leroy-merlin-sku-aviso" class="inventario-count" style="display:none;color:#991b1b;font-weight:600"></div>
  <div id="leroy-merlin-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="leroy-merlin-table">
      <thead><tr><th></th><th>Nº Pedido</th><th>Fecha pedido</th><th>Límite envío</th><th>Nombre</th><th>Dirección</th><th>CP</th><th>Población</th><th>Provincia</th><th>País</th><th>Teléfono</th><th>Producto</th><th>Cantidad</th><th>SKU</th><th>Precio</th><th>Seguimiento</th><th>Notas</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-catalogo" style="display:none">
  <div class="toolbar">
    <button id="sync-catalogo">Sincronizar catálogo</button>
    <span id="catalogo-count" class="inventario-count"></span>
  </div>
  <div class="table-wrap">
    <table id="catalogo-table">
      <thead>
        <tr><th>Producto</th><th>Modelo de stock</th><th>SKU (Shopify)</th><th>SKU alternativos (otras plataformas)</th><th>Proveedor</th><th>Excepción FURNITURE</th><th>No llevamos stock</th><th>Excluido (ficha duplicada)</th></tr>
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

<div id="view-abiertos" style="display:none">
  <div class="abiertos-oportunidades-box">
    <h3 style="margin:0 0 6px">✂️ Pedidos que pueden usar un colchón abierto</h3>
    <div id="abiertos-oportunidades-count" class="inventario-count" style="padding:0 0 6px"></div>
    <div class="table-wrap">
      <table id="abiertos-oportunidades-table">
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Colchón del pedido</th><th>Abierto disponible</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
  <div class="quickform">
    <h3>Dar de alta / baja un colchón abierto</h3>
    <div class="toolbar">
      <input id="abiertos-query" type="text" list="abiertos-models-datalist" placeholder="Modelo de colchón..." autocomplete="off" />
      <datalist id="abiertos-models-datalist"></datalist>
      <input id="abiertos-talla" type="text" placeholder="Talla (ej. 150x190)" autocomplete="off" />
      <input id="abiertos-qty" type="number" min="1" value="1" />
      <input id="abiertos-nota" type="text" placeholder="Nota (opcional)" autocomplete="off" />
      <button id="abiertos-alta" type="button">Dar de alta (+)</button>
      <button id="abiertos-baja" type="button">Dar de baja (−)</button>
    </div>
    <div id="abiertos-result" class="inventario-count"></div>
  </div>
  <div id="abiertos-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="abiertos-table">
      <thead><tr><th>Modelo</th><th>Talla</th><th>Abiertos</th><th>Nota</th><th>Ajustar</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-pendientes" style="display:none">
  <div class="toolbar">
    <label class="ocultar-recibidos-label"><input type="checkbox" id="pendientes-ocultar-recibidos"> Ocultar ya recibidos de fábrica</label>
    <label class="ocultar-recibidos-label"><input type="checkbox" id="pendientes-mostrar-cancelados"> Mostrar cancelados</label>
    <button type="button" id="descargar-excel-pendientes-btn" class="secondary">Descargar Excel (todos los proveedores)</button>
  </div>
  <div class="carga-abierta-box revision-box" id="revision-box" style="display:none">
    <div class="toolbar"><h3 style="margin:0">Pendientes de revisión antes de pedir</h3></div>
    <div id="revision-count" class="inventario-count"></div>
    <div class="table-wrap">
      <table id="revision-table">
        <thead><tr><th>Pedido</th><th>Proveedor</th><th>Modelo</th><th>Talla</th><th>Cantidad</th><th>Coste tarifa</th><th>Motivo</th><th>Notas</th><th>Fecha del pedido</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
  <div class="toolbar" id="pendientes-toolbar" style="display:none">
    <button type="button" id="generar-pedido-btn" disabled>Generar pedido a fábrica (PDF)</button>
    <button type="button" id="generar-pedido-excel-btn" disabled>Generar pedido a fábrica (Excel)</button>
    <button type="button" id="marcar-ya-pedido-btn" class="secondary" disabled title="Ya se ha pedido a fábrica por otra vía: se marca como pedido sin descargar nada">Marcar como ya pedido</button>
    <span id="seleccion-count" class="inventario-count" style="padding:0"></span>
  </div>
  <div id="pendientes-count" class="inventario-count"></div>
  <div class="scroll-arriba" id="pendientes-scroll-arriba"><div></div></div>
  <div class="table-wrap" id="pendientes-wrap">
    <table id="pendientes-table">
      <thead>
        <tr><th id="pendientes-check-head" style="display:none"></th><th>Pedido</th><th>Plataforma</th><th>Modelo</th><th>Color</th><th>Talla</th><th id="pendientes-sku-head">SKU</th><th>Cantidad</th><th id="pendientes-coste-head" title="Coste según la tarifa vigente del proveedor (precio unidad × unidades)">Coste tarifa</th><th id="pendientes-refpolival-head" style="display:none">Ref. Polival</th><th>Mercancía para pedir a fábrica</th><th>Notas</th><th>Fecha del pedido</th><th id="pendientes-furfpk-head">FUR/FPK</th><th id="pendientes-camion-head">Camión estimado</th><th>Recibido de fábrica</th></tr>
        <tr id="pendientes-filter-row">
          <th></th>
          <th><input id="pendientes-pedido-search" type="text" placeholder="Filtrar..." /></th>
          <th></th>
          <th></th><th></th><th></th><th id="pendientes-sku-filter"><input id="pendientes-sku-search" type="text" placeholder="ej. COLZNIR105X180" /></th><th></th><th id="pendientes-coste-filter"></th>
          <th id="pendientes-refpolival-filter" style="display:none"><input id="pendientes-referencia-search" type="text" placeholder="Filtrar..." /></th>
          <th></th><th></th><th></th><th id="pendientes-furfpk-filter"></th><th></th><th></th>
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

<div id="view-pesos" style="display:none">
  <div class="toolbar">
    <input id="pesos-search" type="text" placeholder="Buscar SKU (ej. COLZNIR150X190)..." />
  </div>
  <div id="pesos-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="pesos-table">
      <thead><tr><th>SKU</th><th>Peso (kg)</th><th>Origen</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-furniture" style="display:none">
  <div class="carga-abierta-box">
    <div id="furniture-cargas-tabs" class="cargas-tabs"></div>
    <div class="toolbar">
      <h3 id="carga-abierta-titulo" style="margin:0">Carga</h3>
      <button type="button" id="descargar-carga-btn" class="secondary" disabled>Descargar Excel Furniture</button>
      <button type="button" id="listado-almacen-btn" class="secondary listado-almacen-btn" disabled>Listado almacén</button>
      <button type="button" id="cerrar-carga-btn" disabled>Cerrar carga</button>
      <button type="button" id="tracking-upload-btn" class="secondary">Actualizar seguimiento Furniture</button>
      <input type="file" id="tracking-upload-input" accept=".xls,.htm,.html" style="display:none" />
      <span id="tracking-upload-status" class="inventario-count" style="padding:0"></span>
      <button type="button" id="tracking-report-btn" class="secondary" style="display:none">Descargar reporte de esta subida</button>
    </div>
    <div id="carga-abierta-count" class="inventario-count"></div>
    <div class="table-wrap">
      <table id="carga-abierta-table">
        <thead><tr><th>Pedido</th><th>Plataforma</th><th>Nombre</th><th>Producto comprado</th><th>Servicios adicionales</th><th>Artículos / Llegada</th><th>Notas</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>

  <div class="carga-abierta-box tener-en-cuenta-box">
    <div class="toolbar">
      <h3 style="margin:0">Pedidos para tener en cuenta</h3>
    </div>
    <div id="tener-en-cuenta-count" class="inventario-count"></div>
    <div class="table-wrap">
      <table id="tener-en-cuenta-table">
        <thead><tr><th>Pedido</th><th>Plataforma</th><th>Nombre</th><th>Producto comprado</th><th>Servicios adicionales</th><th>Artículos / Llegada</th><th>Notas</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>

  <div class="carga-abierta-box retenidos-box">
    <div class="toolbar">
      <h3 style="margin:0">Retenidos a la espera del cliente</h3>
    </div>
    <div id="retenidos-count" class="inventario-count"></div>
    <div class="table-wrap">
      <table id="retenidos-table">
        <thead><tr><th>Pedido</th><th>Plataforma</th><th>Nombre</th><th>Producto comprado</th><th>Servicios adicionales</th><th>Artículos / Llegada</th><th>Notas</th><th>Retención</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>

  <div class="toolbar" id="furniture-pendientes-toolbar">
    <button type="button" id="anadir-carga-btn" disabled>Añadir a la carga</button>
    <button type="button" id="anadir-tener-en-cuenta-btn" disabled>Añadir a "tener en cuenta"</button>
    <button type="button" id="retener-btn" class="secondary" disabled>Retener (el cliente lo quiere más adelante)</button>
    <span id="furniture-seleccion-count" class="inventario-count" style="padding:0"></span>
  </div>
  <div id="furniture-pendientes-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="furniture-pendientes-table">
      <thead>
        <tr><th></th><th>Pedido</th><th>Plataforma</th><th>Nombre</th><th>Producto comprado</th><th>Servicios adicionales</th><th>Artículos / Llegada</th><th>Notas</th></tr>
        <tr id="furniture-filter-row">
          <th></th>
          <th><input id="furniture-pedido-search" type="text" placeholder="Filtrar..." /></th>
          <th></th><th></th><th></th><th></th>
          <th><input id="furniture-referencia-search" type="text" placeholder="Filtrar..." /></th>
          <th></th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-historial-cargas" style="display:none">
  <div id="historial-cargas-count" class="inventario-count"></div>
  <div id="historial-cargas-list"></div>
</div>

<div id="view-casos-revisar" style="display:none">
  <div id="casos-revisar-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="casos-revisar-table">
      <thead><tr><th>Pedido</th><th>Nombre</th><th>Albarán</th><th>Estado Furniture</th><th>Motivo</th><th>Seguimiento</th><th>Notas</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-casos-revisar-seur" style="display:none">
  <div class="toolbar" style="margin-bottom:6px">
    <button type="button" id="tracking-seur-upload-btn" class="secondary">Actualizar seguimiento SEUR</button>
    <input type="file" id="tracking-seur-upload-input" accept=".xlsx" style="display:none" />
    <button type="button" id="tracking-seur-report-btn" class="secondary" style="display:none">Descargar reporte de esta subida</button>
    <span id="tracking-seur-upload-status" class="inventario-count" style="padding:0"></span>
  </div>
  <div class="toolbar">
    <input id="envios-seur-search" type="text" placeholder="Buscar por referencia, nombre u observaciones..." style="min-width:280px" />
    <select id="envios-seur-estado"><option value="">Todos los estados de SEUR</option></select>
    <select id="envios-seur-reclamado">
      <option value="">Reclamados y no reclamados</option>
      <option value="si">Solo reclamados a SEUR</option>
      <option value="no">Solo no reclamados</option>
      <option value="respuesta">💬 Con respuesta de SEUR sin leer</option>
      <option value="conversacion">✉ Con conversación con SEUR</option>
    </select>
    <label style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;color:#b91c1c;font-weight:600"><input type="checkbox" id="envios-seur-solo-avisos" /> ⚠ Solo para reclamar (registrado +24 h)</label>
    <select id="envios-seur-pais"><option value="">Todos los países</option></select>
    <label style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap"><input type="checkbox" id="envios-seur-ocultar-entregados" checked /> Ocultar entregados</label>
    <label style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap"><input type="checkbox" id="envios-seur-ocultar-archivados" checked /> Ocultar archivados</label>
  </div>
  <div id="envios-seur-aviso" style="display:none;background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;border-radius:8px;padding:10px 14px;margin:6px 0;font-weight:600"></div>
  <div id="envios-seur-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="envios-seur-table">
      <thead><tr><th>Fecha de carga</th><th>Referencia pedido</th><th>Nombre</th><th>País</th><th>Observaciones</th><th>Estado en SEUR</th><th>Reclamado a SEUR</th><th style="min-width:320px">Notas</th><th>Archivar</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-historico-rep" style="display:none">
  <div class="toolbar">
    <input id="historico-pedido-search" type="text" placeholder="Buscar por nº de pedido..." />
    <input id="historico-referencia-search" type="text" placeholder="Buscar por referencia (REP.../GC.../I-...)..." />
    <select id="historico-tipo-filter">
      <option value="">Todas</option>
      <option value="reposicion">Solo reposiciones</option>
      <option value="gestoComercial">Solo gestos comerciales</option>
    </select>
  </div>
  <div id="historico-rep-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="historico-rep-table">
      <thead><tr><th>Tipo</th><th>Referencia</th><th>Pedido</th><th>Cliente</th><th>Modelo</th><th>Talla</th><th>Cant.</th><th>Motivo / Nota</th><th>Agencia</th><th>Recogida</th><th>Estado</th><th>Fecha</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-tarifas" style="display:none">
  <div class="toolbar">
    <label style="font-size:13px;color:var(--muted)">Modelo:</label>
    <input id="tarifas-modelo-select" type="text" list="tarifas-modelos-datalist" placeholder="Escribe o elige un modelo..." autocomplete="off" style="min-width:280px" />
    <datalist id="tarifas-modelos-datalist"></datalist>
  </div>
  <div id="tarifas-aviso" class="inventario-count" style="display:none;color:#991b1b;font-weight:600"></div>
  <div id="tarifas-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="tarifas-table">
      <thead><tr><th>Talla</th><th>Coste</th><th>BEZEN</th><th>MAISON ES</th><th>RESTO ES</th><th>MAISON FR</th><th>RESTO FR</th><th>MAISON IT</th><th>RESTO IT</th><th>RESTO AL</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-tarifas-plataformas" style="display:none">
  <div id="tarifas-plataformas-lista" class="inventario-count">Cargando...</div>
</div>

<div id="view-plazos-marketplace" style="display:none">
  <div id="plazos-marketplace-lista" class="inventario-count">Cargando...</div>
</div>

<div class="modal-overlay" id="tarifas-desglose-overlay">
  <div class="modal-box">
    <h3 id="tarifas-desglose-titulo">Desglose del cálculo</h3>
    <div id="tarifas-desglose-pasos"></div>
    <div class="modal-actions">
      <button type="button" class="secondary" id="tarifas-desglose-cerrar">Cerrar</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="seur-correo-overlay">
  <div class="modal-box modal-box-wide">
    <h3 id="seur-correo-titulo">Conversación con SEUR</h3>
    <div id="seur-correo-destino" style="color:var(--muted);font-size:12px;margin-bottom:8px"></div>
    <div id="seur-correo-mensajes" style="display:flex;flex-direction:column;gap:8px;max-height:45vh;overflow-y:auto;margin-bottom:10px"></div>
    <textarea id="seur-correo-texto" rows="6" style="width:100%;resize:vertical" placeholder="Escribe aquí el problema o la duda para SEUR..."></textarea>
    <div style="color:var(--muted);font-size:11px;margin-top:4px">Se envía desde tu Gmail (jennifer@colchonesbezen.com). La referencia, el nº de expedición y el destinatario se añaden solos arriba del mensaje.</div>
    <div class="modal-actions">
      <button type="button" class="secondary" id="seur-correo-cerrar">Cerrar</button>
      <button type="button" id="seur-correo-enviar">Enviar a SEUR</button>
    </div>
  </div>
</div>

<div id="view-seur" style="display:none">
  <div id="seur-decision-box"class="carga-abierta-box" style="display:none">
    <div class="toolbar">
      <h3 style="margin:0">Pedidos con disponibilidad mixta — pendientes de decidir</h3>
    </div>
    <p style="margin:0 1rem 0.75rem;color:var(--muted);font-size:13px">Tienen 2 o más colchones sueltos y solo hay stock real de alguno. Si no decides nada, se quedan esperando a que haya stock de todos.</p>
    <div id="seur-decision-list"></div>
  </div>

  <div id="seur-cargas-list"></div>
  <div id="seur-fuera-carga"></div>
</div>

<div id="view-historial-cargas-seur" style="display:none">
  <div id="historial-cargas-seur-count" class="inventario-count"></div>
  <div id="historial-cargas-seur-list"></div>
</div>

<div class="modal-overlay" id="reposicion-modal-overlay">
  <div class="modal-box">
    <h3>Reposición de pieza</h3>
    <p id="reposicion-modal-texto" style="color:var(--muted);font-size:13px"></p>
    <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">Producto del pedido a reponer:</label>
    <select id="reposicion-item-select" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px"></select>
    <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">Pieza exacta a reponer:</label>
    <select id="reposicion-pieza-select" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px"></select>
    <div id="reposicion-colchon-agencia-block" style="display:none">
      <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">Es un colchón — ¿sale por SEUR o por FURNITURE?</label>
      <select id="reposicion-agencia-select" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px">
        <option value="">Elige una opción...</option>
        <option value="SEUR">SEUR (reenvío directo, sin recogida)</option>
        <option value="FURNITURE">FURNITURE (incidencia, puede llevar recogida)</option>
      </select>
    </div>
    <div id="reposicion-colchon-recogida-block" style="display:none">
      <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">¿Tiene recogida del colchón antiguo?</label>
      <select id="reposicion-recogida-select" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px">
        <option value="">Elige una opción...</option>
        <option value="si">Sí</option>
        <option value="no">No</option>
      </select>
    </div>
    <div id="reposicion-colchon-destino-block" style="display:none">
      <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">El colchón recogido, ¿vuelve a nuestras instalaciones o es para desechar?</label>
      <select id="reposicion-destino-select" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px">
        <option value="">Elige una opción...</option>
        <option value="instalaciones">Vuelve a nuestras instalaciones</option>
        <option value="desechar">Para desechar</option>
      </select>
    </div>
    <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">Nota adicional (opcional):</label>
    <input id="reposicion-motivo" type="text" placeholder="ej. llegó con un arañazo" autocomplete="off" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px" />
    <div id="reposicion-modal-result" class="inventario-count"></div>
    <div class="modal-actions">
      <button type="button" class="secondary" id="reposicion-modal-cancel">Cancelar</button>
      <button type="button" id="reposicion-modal-confirmar">Registrar reposición</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="gesto-comercial-modal-overlay">
  <div class="modal-box">
    <h3>Gesto comercial</h3>
    <p id="gesto-comercial-modal-texto" style="color:var(--muted);font-size:13px"></p>
    <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">Modelo de almohada:</label>
    <select id="gesto-comercial-modelo-select" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px"></select>
    <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">Medida:</label>
    <select id="gesto-comercial-talla-select" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px"></select>
    <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">Cantidad:</label>
    <select id="gesto-comercial-cantidad-select" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px">
      <option value="1">1 almohada</option>
      <option value="2">2 almohadas</option>
    </select>
    <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">Motivo (opcional):</label>
    <input id="gesto-comercial-motivo" type="text" placeholder="ej. llegó con un arañazo, no compensa cambiar la pieza" autocomplete="off" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px" />
    <div id="gesto-comercial-modal-result" class="inventario-count"></div>
    <div class="modal-actions">
      <button type="button" class="secondary" id="gesto-comercial-modal-cancel">Cancelar</button>
      <button type="button" id="gesto-comercial-modal-confirmar">Registrar gesto comercial</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="sustituir-modal-overlay">
  <div class="modal-box">
    <h3>Sustituir por otro modelo</h3>
    <p id="sustituir-modal-texto" style="color:var(--muted);font-size:13px"></p>
    <div id="sustituir-alternativas-list" style="margin-bottom:0.75rem"></div>
    <p style="color:var(--muted);font-size:12.5px;margin:0 0 4px">O transformar uno del mismo modelo de otra medida:</p>
    <div id="sustituir-transformar-list" style="margin-bottom:0.75rem"></div>
    <p style="color:var(--muted);font-size:12.5px;margin:0 0 4px">O escribe otro modelo (misma talla):</p>
    <input id="sustituir-query" type="text" list="stock-models-datalist" placeholder="Nombre del modelo..." autocomplete="off" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px" />
    <div class="modal-actions">
      <button type="button" class="secondary" id="sustituir-modal-cancel">Cancelar</button>
      <button type="button" id="sustituir-directo-btn" disabled style="display:none">Sustituir</button>
      <button type="button" class="secondary" id="sustituir-hoy-btn" disabled style="display:none">Sustituir — carga de hoy</button>
      <button type="button" id="sustituir-manana-btn" disabled style="display:none">Sustituir — carga de mañana</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="retener-modal-overlay">
  <div class="modal-box">
    <h3>Retener hasta que el cliente lo pida</h3>
    <p id="retener-modal-texto" style="color:var(--muted);font-size:13px"></p>
    <label style="display:block;font-size:13px;margin:8px 0"><input type="radio" name="retener-tipo" value="sin-fecha" checked /> Sin fecha: a falta de que el cliente dé luz verde al envío</label>
    <label style="display:block;font-size:13px;margin:8px 0"><input type="radio" name="retener-tipo" value="fecha" /> Enviar en la carga de este día o la siguiente:
      <input type="date" id="retener-fecha-input" style="display:block;margin-top:6px" />
    </label>
    <div class="modal-actions">
      <button type="button" class="secondary" id="retener-modal-cancel">Cancelar</button>
      <button type="button" id="retener-modal-ok">Retener</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="seur-fecha-modal-overlay">
  <div class="modal-box">
    <h3>¿En qué carga de SEUR sale?</h3>
    <p id="seur-fecha-modal-texto" style="color:var(--muted);font-size:13px"></p>
    <label style="font-size:13px">Día de la carga (cualquier día laborable, aunque sea dentro de varias semanas):
      <input type="date" id="seur-fecha-input" style="display:block;margin-top:6px" />
    </label>
    <div class="modal-actions">
      <button type="button" class="secondary" id="seur-fecha-modal-cancel">Cancelar</button>
      <button type="button" id="seur-fecha-ok-btn">Preparar para ese día</button>
    </div>
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
const PAGO_MANUAL_USERS = ${JSON.stringify(PAGO_MANUAL_USERS)};
const COLOR_META = ${JSON.stringify(COLOR_META)};
const BASE_HEAD = ["","Nº Pedido","Fecha","Nombre","Dirección de entrega","Teléfono","Producto comprado","Servicios adicionales","Método de pago","Estado de pago","Situación de envío","Agencia","Seguimiento","Precio","Notas"];

let currentUser = localStorage.getItem("hd_user");
let editing = false;
let pendingRefresh = false;

function hasColorAccess() {
  return COLOR_ACCESS_USERS.includes(currentUser);
}

function escapeAttr(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// "BEZEN" es una convención de Shopify — Carrefour (y cualquier otra
// plataforma futura) usa su propia referencia real, sin ningún prefijo
// (Jennifer, 2026-09-17). Acepta un pedido, un pendiente o un caso/aviso —
// cualquier objeto con orderNumber y, si no es de Shopify, platform +
// orderRef.
function refLabel(o) {
  const base = o && o.platform && o.platform !== "Shopify" && o.orderRef ? o.orderRef : "BEZEN" + o.orderNumber;
  // Reposición de pieza rota (Jennifer, 2026-09-21): la referencia con la
  // que se graba SIEMPRE lleva "REP" delante de la del pedido original
  // (ej. BEZEN12215 -> REPBEZEN12215), para distinguirla a simple vista de
  // un pedido normal — nunca se confunde con la referencia real del pedido.
  if (o && o.reposicion) return "REP" + base;
  // Gesto comercial (Jennifer, 2026-09-22): mismo patrón, "GC" delante.
  if (o && o.gestoComercial) return "GC" + base;
  return base;
}

function formatOrderDate(iso) {
  if (!iso) return "";
  const t = parseFechaGenerica(iso);
  if (!t) return "";
  return new Date(t).toLocaleDateString("es-ES");
}

// Convierte cualquier "fecha" de un backorder a timestamp real, sea cual
// sea la plataforma (Jennifer, 2026-09-21, bug real: al ordenar Polival por
// orderNumber, un pedido de marketplace como Conforama ES tiene un
// orderNumber enorme — sacado de su referencia, no un correlativo — que se
// cuela por delante de pedidos de Shopify mucho más recientes, como el
// caso real BEZEN12215/reposición, que quedó enterrado entre 73 pendientes
// de Polival). Nunca se usa Date.parse/new Date directo con el formato
// "DD/MM/YYYY..." de los marketplaces: con día y mes ambos ≤12 el
// navegador lo interpretaría en silencio como MM/DD, dando una fecha
// equivocada en vez de fallar.
function parseFechaGenerica(fecha) {
  if (!fecha) return 0;
  if (fecha.includes("/")) {
    const m = /^(\\d{1,2})[/](\\d{1,2})[/](\\d{4})(?:[ T](\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?/.exec(fecha);
    if (!m) return 0;
    const [, d, mo, y, h, mi, s] = m;
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h || 0), Number(mi || 0), Number(s || 0)).getTime();
  }
  const t = Date.parse(fecha);
  return Number.isNaN(t) ? 0 : t;
}

// Fecha límite de envío de los marketplaces (Jennifer, 2026-09-29): hasta
// cuándo hay que dar el seguimiento al cliente. Solo cuenta mientras el
// pedido sigue pendiente de envío y sin seguimiento. Colores: verde (2+
// días), naranja (vence mañana), rojo (vence hoy), rojo oscuro (vencido).
// Corte por plataforma (Jennifer, 2026-09-29): solo cuenta la fecha límite
// de los pedidos con límite a partir de esta fecha, para que no salga nada
// antiguo. Una plataforma que no esté aquí NO muestra fecha límite todavía
// ("para el resto de plataformas te iré diciendo según las vayamos
// trabajando"). Formato AAAA-MM-DD.
const PLAZO_LIMITE_DESDE = { "Carrefour": "2026-09-29" };
// Corte por FECHA DEL PEDIDO en vez de por fecha límite (Jennifer,
// 2026-09-29, Conforama ES: "que el aviso sobre el vencimiento sea solo
// visible en los pedidos a partir del día 24/09").
// Worten desde 83706555-A (18/09, único pedido de ese día).
// Leroy Merlin desde el 23/09 (Jennifer, 2026-10-01: "en Leroy también me
// tienes que avisar de la fecha límite"; lo anterior ya tiene el plazo
// vencido hace semanas).
// Maison du Monde desde el 22/09 (Jennifer, 2026-10-01: "el primer pedido
// que pone esperando envío", 10002308790-A).
// Conforama (Francia) desde el 28/09, igual que su tramitación (Jennifer,
// 2026-10-01: "todos ya deben estar activos en ese sentido").
const PLAZO_PEDIDOS_DESDE = { "Conforama ES": "2026-09-24", "Worten": "2026-09-18", "Leroy Merlin": "2026-09-23", "Maison Du Monde": "2026-09-22", "Conforama": "2026-09-28" };
function plazoEnvioActivo(o) {
  if (!o || !o.limiteEnvio) return false;
  // Sin aviso mientras el cliente no ha pagado (Jennifer, 2026-09-29:
  // "si está en pendiente de verificación de fraude no me tienes que
  // informar... solo cuando está pendiente de envío").
  if (/fraude|pago|d[eé]bito/i.test(o.estado || "")) return false;
  const pedidosDesde = PLAZO_PEDIDOS_DESDE[o.platform];
  if (pedidosDesde) {
    const tp = parseFechaGenerica(o.orderDate);
    return !!tp && tp >= new Date(pedidosDesde + "T00:00:00").getTime();
  }
  const desde = PLAZO_LIMITE_DESDE[o.platform];
  if (!desde) return false;
  const t = parseFechaGenerica(o.limiteEnvio);
  return !!t && t >= new Date(desde + "T00:00:00").getTime();
}
function plazoEnvioPendiente(o) {
  if (!o || !plazoEnvioActivo(o) || o.platform === "Shopify" || o.cancelado) return false;
  if (o.shippingStatus === "fulfilled") return false;
  if (/enviado|recibido|cerrado|reembols|cancel|rechaz/i.test(o.estado || "")) return false;
  if ((o.furnitureTracking || []).length || (o.seurTracking || []).some(t => !t.anulado)) return false;
  return true;
}
function plazoEnvio(o) {
  if (!plazoEnvioActivo(o)) return null;
  const t = parseFechaGenerica(o && o.limiteEnvio);
  if (!t) return null;
  const limite = new Date(t);
  const fecha = limite.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
  if (!plazoEnvioPendiente(o)) return { nivel: "hecho", texto: fecha + " ✓" };
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = new Date(limite); dia.setHours(0, 0, 0, 0);
  const dias = Math.round((dia - hoy) / 86400000);
  // Vencido en rojo OSCURO, distinto del rojo de "vence hoy" (Jennifer, 2026-09-29).
  if (Date.now() > t) return { nivel: "vencido", texto: "VENCIDO " + fecha, dias };
  if (dias <= 0) return { nivel: "rojo", texto: "VENCE HOY", dias };
  if (dias === 1) return { nivel: "naranja", texto: "VENCE MAÑANA", dias };
  return { nivel: "verde", texto: fecha + " · " + dias + " días", dias };
}
function plazoEnvioCell(o) {
  const p = plazoEnvio(o);
  if (!p) return "—";
  return \`<span class="plazo-envio plazo-\${p.nivel}" title="Fecha límite de envío: \${escapeAttr(o.limiteEnvio)}">\${p.texto}</span>\`;
}
// Número rojo en el menú, por marketplace: pedidos que vencen mañana, hoy
// o ya vencidos, sin seguimiento.
function actualizarBadgesPlazo() {
  for (const p of platforms) {
    if (p.id === "shopify") continue;
    const badge = document.getElementById("plazo-badge-" + p.id);
    if (!badge) continue;
    const n = allOrders.filter(o => o.platform === p.label && (() => { const x = plazoEnvio(o); return x && (x.nivel === "vencido" || x.nivel === "rojo" || x.nivel === "naranja"); })()).length;
    badge.textContent = n;
    badge.style.display = n ? "" : "none";
  }
}

function statusBadge(status) {
  const s = (status || "pendiente").toLowerCase();
  const cls = s === "fulfilled" ? "fulfilled" : s === "partial" ? "partial" : s === "cancelado" ? "pago-pendiente" : "pendiente";
  const label = s === "fulfilled" ? "Enviado" : s === "partial" ? "Parcial" : s === "cancelado" ? "Cancelado" : "Pendiente";
  return \`<span class="badge \${cls}">\${label}</span>\`;
}

function paymentStatusBadge(paymentStatus) {
  const cls = paymentStatus === "PAGADO" ? "fulfilled" : paymentStatus === "REEMBOLSADO" ? "reembolsado" : "pago-pendiente";
  return \`<span class="badge \${cls}">\${paymentStatus || "PENDIENTE DE PAGO"}</span>\`;
}

// Pago confirmado a mano (Jennifer, 2026-09-28): transferencia recibida pero
// aún sin marcar como pagada en Shopify — se tramita ya, con fecha de hoy.
// Cuando luego se marque pagado en Shopify no se vuelve a tramitar.
function pagoManualCell(o) {
  let html = paymentStatusBadge(o.paymentStatus);
  if (o.pagoConfirmadoManual) {
    const p = o.pagoConfirmadoManual;
    html += \`<br><span class="badge pago-manual-tag" title="Tramitado por \${escapeAttr(p.usuario || "")} el \${new Date(p.fecha).toLocaleString("es-ES")}">Pago confirmado a mano</span>\`;
  } else if (o.paymentStatus === "PENDIENTE DE PAGO" && !o.agencia && !o.cancelado && PAGO_MANUAL_USERS.includes(currentUser)) {
    html += \`<br><button type="button" class="pago-manual-btn" data-pago-manual-id="\${o.id}" title="El cliente ya ha pagado (p. ej. por transferencia) aunque no esté marcado en Shopify: tramitar ya con fecha de hoy">Pagado – tramitar ya</button>\`;
  }
  return html;
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

const CANCEL_ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const CANCEL_ICON_UNDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11a8 8 0 1 1 2.6 5.9"/><path d="M3 5v6h6"/></svg>';

// Sustituir un colchón pendiente de este pedido por otro modelo con stock
// (Jennifer, 2026-09-18) — accesible desde la propia ficha del pedido
// (Shopify o Carrefour), sin tener que ir a Proveedores. Busca al vuelo si
// aplica (ver abrirSustituirDesdePedido), así que el icono sale siempre —
// si no hay nada que sustituir, avisa en vez de no hacer nada.
const SUSTITUIR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 21l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
function sustituirPedidoButton(order) {
  return \`<button type="button" class="sustituir-pedido-btn" data-sustituir-order-id="\${order.id}" title="Sustituir un colchón pendiente por otro modelo">\${SUSTITUIR_ICON}</button>\`;
}

// Aviso a simple vista de que este pedido YA tiene una reposición pedida
// (Jennifer, 2026-09-21: "no soy capaz de ver si de ese pedido ya he
// pedido la reposición") — cualquier estado (pendiente, cubierto, servido)
// cuenta, no solo las que siguen sin resolver: lo que importa es que ya se
// pidió, no si ya llegó. backorders puede estar vacío si Proveedores no
// se ha cargado todavía en esta sesión — se recarga desde onUserReady.
function reposicionButton(order) {
  const reposicionesDelPedido = backorders.filter(b => b.reposicion && b.orderId === order.id);
  const cls = "reposicion-pedido-btn" + (reposicionesDelPedido.length ? " reposicion-pedido-btn-activa" : "");
  // Al pasar el ratón se ve QUÉ se pidió, no solo que se pidió algo
  // (Jennifer, 2026-09-21) — una línea por reposición, con su referencia
  // (ej. "I-002") y el texto completo de la pieza/motivo.
  const title = reposicionesDelPedido.length
    ? reposicionesDelPedido.map(b => (b.referencia ? b.referencia + ": " : "") + (b.piezaTexto || b.stockModel)).join("\\n")
    : "Reponer una pieza rota de este pedido";
  return \`<button type="button" class="\${cls}" data-reposicion-order-id="\${order.id}" title="\${escapeAttr(title)}">REP</button>\`;
}

// Botón "GC" (gesto comercial, Jennifer, 2026-09-22): mismo patrón que REP
// — se pinta activo si este pedido ya tiene algún gesto comercial pedido
// (cualquier estado), y el tooltip enseña qué se dio sin tener que abrir
// nada.
function gestoComercialButton(order) {
  const gestosDelPedido = backorders.filter(b => b.gestoComercial && b.orderId === order.id);
  const cls = "gesto-comercial-btn" + (gestosDelPedido.length ? " gesto-comercial-btn-activa" : "");
  const title = gestosDelPedido.length
    ? gestosDelPedido.map(b => (b.referencia ? b.referencia + ": " : "") + b.cantidad + "x " + b.stockModel + " (" + b.talla + ")").join("\\n")
    : "Gesto comercial (almohada de regalo) por daño o retraso en este pedido";
  return \`<button type="button" class="\${cls}" data-gesto-comercial-order-id="\${order.id}" title="\${escapeAttr(title)}">GC</button>\`;
}

// Envío conjunto (Jennifer, 2026-09-28): mismo cliente, pedidos distintos,
// quiere recibirlo todo junto.
const JUNTAR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg>';
function juntarEnvioButton(order) {
  const cls = "juntar-envio-btn" + (order.grupoEnvio ? " juntar-envio-btn-activa" : "");
  const title = order.grupoEnvio
    ? "Se envía junto con " + pedidosDelGrupo(order).filter(o => o.id !== order.id).map(refLabel).join(", ") + " — clic para separarlo"
    : "Enviar junto con otro pedido del mismo cliente (un solo envío por Furniture)";
  return \`<button type="button" class="\${cls}" data-juntar-id="\${order.id}" title="\${escapeAttr(title)}">\${JUNTAR_ICON}</button>\`;
}

// "No ha salido" (Jennifer, 2026-09-29, caso Carrefour 76393184-A): el
// colchón iba por SEUR pero no salió — vuelve a pendiente en su proveedor
// con referencia "…2". Solo si hay un colchón cubierto con stock o ya
// preparado para SEUR.
function colchonesSeurDelPedido(order) {
  return backorders.filter(b => String(b.orderId) === String(order.id) && b.tipo === "colchon" && !b.reposicion && !b.gestoComercial
    && (b.estado === "listo-seur" || (b.estado === "cubierto" && String(b.id).endsWith("-cubierto"))));
}
function noSalioButton(order) {
  if (order.agencia !== "SEUR" || order.shippingStatus === "fulfilled" || order.cancelado) return "";
  if (!colchonesSeurDelPedido(order).length) return "";
  return \`<button type="button" class="no-salio-btn" data-no-salio-id="\${escapeAttr(String(order.id))}" title="El colchón NO ha salido: vuelve a pendiente en su proveedor con la referencia siguiente (…2)">↩</button>\`;
}
// Ventana para elegir unidades (Jennifer, 2026-09-29): "No ha salido" de
// solo una parte del pedido, o cancelar unidades concretas. filas: [{ key,
// label, max }] -> Promise<[{ key, unidades }] | null>.
function elegirUnidades({ titulo, texto, filas, boton, peligro }) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay open";
    overlay.innerHTML = \`<div class="modal-box">
      <h3>\${escapeAttr(titulo)}</h3>
      <p style="color:var(--muted);font-size:13px">\${escapeAttr(texto)}</p>
      <div class="elegir-unidades-lista">\${filas.map((f, i) => \`
        <label class="elegir-unidades-fila">
          <input type="checkbox" data-i="\${i}"\${filas.length === 1 ? " checked" : ""}>
          <span>\${escapeAttr(f.label)}</span>
          \${f.max > 1 ? \`<input type="number" min="1" max="\${f.max}" value="\${f.max}" data-n="\${i}" title="Unidades"> de \${f.max}\` : ""}
        </label>\`).join("")}</div>
      <div class="modal-actions">
        <button type="button" class="secondary" data-accion="cancelar">Volver</button>
        <button type="button" data-accion="ok"\${peligro ? ' style="background:#b91c1c"' : ""}>\${escapeAttr(boton)}</button>
      </div>
    </div>\`;
    document.body.appendChild(overlay);
    const cerrar = (valor) => { overlay.remove(); resolve(valor); };
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay || ev.target.dataset.accion === "cancelar") return cerrar(null);
      if (ev.target.dataset.accion !== "ok") return;
      const elegidas = [];
      overlay.querySelectorAll("input[type=checkbox]").forEach(chk => {
        if (!chk.checked) return;
        const i = Number(chk.dataset.i);
        const inp = overlay.querySelector('input[data-n="' + i + '"]');
        const n = inp ? Math.min(filas[i].max, Math.max(1, Math.floor(Number(inp.value) || 1))) : 1;
        elegidas.push({ key: filas[i].key, unidades: n });
      });
      if (!elegidas.length) { alert("Marca al menos una."); return; }
      cerrar(elegidas);
    });
  });
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-no-salio-id]");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const order = allOrders.find(o => String(o.id) === btn.dataset.noSalioId);
  if (!order) return;
  const colchones = colchonesSeurDelPedido(order);
  // Qué unidades NO han salido (el resto sigue en la carga).
  const elegidas = await elegirUnidades({
    titulo: "¿Qué no ha salido? · " + refLabel(order),
    texto: "Marca lo que NO ha salido: vuelve a pendiente en su proveedor con la referencia siguiente (…2). Lo que no marques sigue en la carga de SEUR. El stock no se devuelve (se entiende que no estaba).",
    filas: colchones.map(b => ({ key: b.id, label: nombreCortoModelo(b.stockModel) + " " + b.talla + " (" + (b.proveedor || "?") + ")", max: b.cantidad || 1 })),
    boton: "No ha salido",
  });
  if (!elegidas) return;
  const res = await fetch("/api/pedidos/no-salio", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: order.id, seleccion: elegidas.map(x => ({ id: x.key, unidades: x.unidades })) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) { alert(data.error || "No se ha podido marcar como no salido."); return; }
  alert("Hecho: " + data.afectados.map(b => b.cantidad + "x " + nombreCortoModelo(b.stockModel) + " " + b.talla).join(", ")
    + " vuelve a pendiente en " + [...new Set(data.afectados.map(b => b.proveedor))].join("/") + " con la referencia " + refLabel(order) + data.afectados[0].refSuffix + "."
    + (data.quedanEnCarga ? " El resto del pedido sigue en la carga de SEUR." : ""));
  backorders = await (await fetch("/api/inventario/pendientes")).json();
  await loadOrders();
  if (document.getElementById("view-seur").style.display !== "none") loadSeur();
  for (const p of platforms) {
    if (p.id !== "shopify" && document.getElementById("view-" + p.id) && document.getElementById("view-" + p.id).style.display !== "none") loadMarketplacePedidos(p.id);
  }
}, true);

// Cancelar unidades (Jennifer, 2026-09-29): desde el pedido (⊘, eligiendo
// qué artículo y cuántas unidades) o desde el pendiente del proveedor
// ("Cancelar"). Se anotan en el pedido y se ven tachadas.
function lineasPedido(order) {
  const items = order.items || [];
  const partes = String(order.product || "").split(", ");
  return items.map((it, i) => ({
    index: i,
    qty: it.qty || 1,
    label: partes.length === items.length ? partes[i] : ((it.qty || 1) + "x " + (it.sku || "") + " " + (it.variantTitle || "")).trim(),
    canceladas: (order.lineasCanceladas || []).filter(l => l.itemIndex === i).reduce((s, l) => s + l.unidades, 0),
  }));
}
function cancelarLineaButton(order) {
  if (order.cancelado || !(order.items || []).length) return "";
  if (!lineasPedido(order).some(l => l.canceladas < l.qty)) return "";
  return \`<button type="button" class="cancelar-linea-btn" data-cancelar-linea-id="\${escapeAttr(String(order.id))}" title="Cancelar una o varias unidades de este pedido (no el pedido entero)">⊘</button>\`;
}
function lineasCanceladasHtml(order) {
  const l = order.lineasCanceladas || [];
  if (!l.length) return "";
  return l.map(x => \`<div class="linea-cancelada-tag" title="Cancelada \${x.desde === "proveedor" ? "desde el proveedor" : "desde el pedido"} el \${new Date(x.fecha).toLocaleDateString("es-ES")}\${x.usuario ? " por " + escapeAttr(x.usuario) : ""}">CANCELADA: <s>\${escapeAttr(x.texto)}</s></div>\`).join("");
}
async function recargarTrasCancelar() {
  backorders = await (await fetch("/api/inventario/pendientes")).json();
  await loadOrders();
  if (document.getElementById("view-pendientes").style.display !== "none") renderPendientes();
  if (document.getElementById("view-seur").style.display !== "none") loadSeur();
  if (document.getElementById("view-furniture").style.display !== "none") renderFurniture();
  for (const p of platforms) {
    if (p.id !== "shopify" && document.getElementById("view-" + p.id) && document.getElementById("view-" + p.id).style.display !== "none") loadMarketplacePedidos(p.id);
  }
}
document.addEventListener("click", async (e) => {
  const btnPedido = e.target.closest("[data-cancelar-linea-id]");
  const btnPend = e.target.closest("[data-cancelar-pendiente]");
  if (!btnPedido && !btnPend) return;
  e.preventDefault();
  e.stopPropagation();
  if (btnPedido) {
    const order = allOrders.find(o => String(o.id) === btnPedido.dataset.cancelarLineaId);
    if (!order) return;
    const lineas = lineasPedido(order).filter(l => l.canceladas < l.qty);
    const elegidas = await elegirUnidades({
      titulo: "Cancelar unidades · " + refLabel(order),
      texto: "Marca lo que ha cancelado el cliente. Si tiene un pendiente en el proveedor, también se cancela allí. Si cancelas todo, el pedido queda cancelado.",
      filas: lineas.map(l => ({ key: l.index, label: l.label, max: l.qty - l.canceladas })),
      boton: "Cancelar unidades", peligro: true,
    });
    if (!elegidas) return;
    let pedidoCancelado = false, pendientes = 0;
    for (const x of elegidas) {
      const l = lineas.find(y => y.index === x.key);
      const res = await fetch("/api/pedidos/cancelar-linea", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, itemIndex: x.key, unidades: x.unidades, texto: x.unidades + "x " + l.label.replace(/^\\d+x\\s*/, ""), usuario: currentUser }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || !r.ok) { alert(r.error || "No se ha podido cancelar."); break; }
      pendientes += r.pendientesCancelados || 0;
      pedidoCancelado = pedidoCancelado || r.pedidoCancelado;
    }
    alert("Cancelado." + (pendientes ? " También se ha quitado del proveedor." : " No tenía pendiente en ningún proveedor.") + (pedidoCancelado ? " El pedido entero queda CANCELADO." : ""));
    await recargarTrasCancelar();
    return;
  }
  const b = backorders.find(x => x.id === btnPend.dataset.cancelarPendiente);
  if (!b) return;
  let unidades = b.cantidad || 1;
  if (unidades > 1) {
    const elegidas = await elegirUnidades({
      titulo: "Cancelar · " + refLabel(b),
      texto: "¿Cuántas unidades ha cancelado el cliente?",
      filas: [{ key: b.id, label: nombreCortoModelo(b.stockModel) + " " + b.talla, max: unidades }],
      boton: "Cancelar unidades", peligro: true,
    });
    if (!elegidas) return;
    unidades = elegidas[0].unidades;
  }
  const aviso = b.pedidoGenerado ? "\\n\\nOJO: esto YA estaba pedido a fábrica" + (b.fechaPedidoFabrica ? " (" + new Date(b.fechaPedidoFabrica).toLocaleDateString("es-ES") + ")" : "") + ". Avisa a la fábrica." : "";
  if (!confirm("¿Cancelar " + unidades + "x " + nombreCortoModelo(b.stockModel) + " " + b.talla + " de " + refLabel(b) + "?\\n\\nSe quita del proveedor y queda como CANCELADA en el pedido." + aviso)) return;
  const res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(b.id) + "/cancelar-unidades", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ unidades, usuario: currentUser }),
  });
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.ok) { alert(r.error || "No se ha podido cancelar."); return; }
  await recargarTrasCancelar();
}, true);

function cancelButton(order) {
  const cls = order.cancelado ? "cancel-btn cancelado" : "cancel-btn";
  const icon = order.cancelado ? CANCEL_ICON_UNDO : CANCEL_ICON_X;
  const title = order.cancelado ? "Reactivar pedido" : "Cancelar pedido";
  return \`<button type="button" class="\${cls}" data-cancel-id="\${order.id}" title="\${title}">\${icon}</button>\`;
}

function agenciaBadge(order) {
  if (order.seurMixedPending) {
    return '<span class="badge agencia-pendiente" title="Tiene 2+ colchones sueltos, solo hay stock de alguno — decide en Logística · SEUR">Elegir SEUR</span>';
  }
  if (!order.agencia) return "";
  const cls = order.agencia === "FURNITURE" ? "agencia-furniture" : "agencia-seur";
  let html = \`<span class="badge \${cls}">\${order.agencia}</span>\`;
  if (order.pendingManufacture) {
    html += \`<br><span class="badge agencia-pendiente" title="\${order.pendingManufacture.modelo} \${order.pendingManufacture.talla}">Colchón pendiente</span>\`;
  }
  return html;
}

// Seguimiento de Furniture (Jennifer, 2026-09-16): un pedido puede tener
// varios albaranes relacionados (normal + BIS/INC/REP por incidencias),
// cada uno con su propio enlace de seguimiento — se muestran todos, uno
// debajo del otro, etiquetados por tipo.
const TRACKING_TIPO_LABEL = { BIS: "BIS", INC: "Incidencia", REP: "Reposición" };
function esEstadoEntregado(estado) {
  return /ENTREGAD/i.test(estado || "") || /retirado el envío/i.test(estado || "");
}
function trackingEntryHtml(label, seguimiento, estado, title) {
  const linkHtml = seguimiento
    ? \`<a href="\${escapeAttr(seguimiento)}" target="_blank" rel="noopener" class="tracking-link" title="\${title}">\${label}</a>\`
    : \`<span class="tracking-link tracking-sin-link" title="\${title}">\${label}</span>\`;
  const estadoHtml = estado
    ? \`<span class="tracking-estado\${esEstadoEntregado(estado) ? " tracking-estado-ok" : ""}">\${estado}</span>\`
    : "";
  return \`<div class="tracking-entry">\${linkHtml} \${estadoHtml}</div>\`;
}
// Conforama ES (Jennifer, 2026-09-25): un pedido "Pendiente de verificación
// de fraude" o "Cancelado" nunca pasa por el motor (ver
// MARKETPLACE_ESTADOS_ELEGIBLES en el Worker) y por tanto nunca tiene
// seguimiento real de Furniture/SEUR que mostrar aquí — en vez de dejar la
// columna vacía ("—"), se enseña el estado real de Mirakl tal cual, para
// saber de un vistazo por qué no hay seguimiento sin tener que abrir el
// pedido. El pedido cancelado NUNCA se quita del listado (solo se marca
// así en esta columna) — sigue viéndose en Pedidos como cualquier otro.
function estadoSeguimientoEspecial(estado) {
  const e = String(estado || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (e.includes("cancelad")) return "CANCELADO";
  if (e.includes("verificacion de fraude")) return "VERIFICACIÓN DE FRAUDE";
  return null;
}
function trackingCell(order) {
  // Las etiquetas de SEUR anuladas con "No ha salido" no cuentan.
  order = { ...order, seurTracking: (order.seurTracking || []).filter(t => !t.anulado) };
  const especial = estadoSeguimientoEspecial(order.estado);
  if (especial) return \`<span class="tracking-link tracking-sin-link">\${especial}</span>\`;
  const furniture = (order.furnitureTracking || []).map(e => {
    const label = TRACKING_TIPO_LABEL[e.tipo] || "Furniture";
    const title = escapeAttr(e.fechaPrevista ? "Fecha prevista: " + e.fechaPrevista : "");
    return trackingEntryHtml(label, e.seguimiento, e.estado, title);
  });
  let seur;
  // Un pedido con varios artículos sueltos por SEUR puede tener cada uno en
  // un envío distinto (Jennifer, 2026-09-16, caso real BEZEN12076: almohada
  // ya entregada, colchón sin enviar todavía) — mostrar "entregado" a nivel
  // de pedido entero confundía. Se desglosa por artículo (order.items),
  // cruzando por SKU contra la "INFORMACIÓN ADICIONAL" (columna AR) de cada
  // envío de SEUR; el que no tenga envío encontrado sale como pendiente.
  if (order.agencia === "SEUR" && (order.items || []).length) {
    const usados = new Set();
    seur = order.items.map(item => {
      const entry = (order.seurTracking || []).find(t =>
        !usados.has(t.localizador) && item.sku && (t.infoAdicional || "").toUpperCase().includes(item.sku.toUpperCase())
      );
      const etiqueta = "SEUR" + (order.items.length > 1 ? " · " + (item.sku || item.variantTitle || "") : "");
      if (entry) {
        usados.add(entry.localizador);
        const title = escapeAttr(entry.fechaSituacion ? "Fecha: " + entry.fechaSituacion : "");
        return trackingEntryHtml(etiqueta, entry.seguimiento, entry.estado, title);
      }
      return trackingEntryHtml(etiqueta, null, "Pendiente de enviar a SEUR", "");
    });
    // Por si queda algún envío de SEUR sin cruzar con ningún artículo (SKU
    // no coincide) — no se oculta, para no perder información real.
    const sinCruzar = (order.seurTracking || []).filter(t => !usados.has(t.localizador));
    seur.push(...sinCruzar.map(e => {
      const title = escapeAttr(e.fechaSituacion ? "Fecha: " + e.fechaSituacion : "");
      return trackingEntryHtml("SEUR", e.seguimiento, e.estado, title);
    }));
  } else {
    seur = (order.seurTracking || []).map(e => {
      const title = escapeAttr(e.fechaSituacion ? "Fecha: " + e.fechaSituacion : "");
      return trackingEntryHtml("SEUR", e.seguimiento, e.estado, title);
    });
  }
  const all = [...furniture, ...seur];
  return all.length ? all.join("") : "—";
}

// Filtros metidos en la propia cabecera de columna (Jennifer, 2026-09-16),
// en vez de en la barra de herramientas — para encontrar rápido lo que hace
// falta desde la columna que ya se está mirando.
const PAYMENT_FILTER_HEADER = \`Estado de pago<br><select id="payment-filter" onclick="event.stopPropagation()">
  <option value="">Todos</option>
  <option value="PAGADO">Pagado</option>
  <option value="PENDIENTE">Pendiente de pago</option>
  <option value="REEMBOLSADO">Reembolsado</option>
</select>\`;
const ESTADO_FILTER_HEADER = \`Situación de envío<br><select id="estado-filter" onclick="event.stopPropagation()">
  <option value="todos">Todos</option>
  <option value="pendientes">Pendientes (envío o pago)</option>
</select>\`;
const HEADER_FILTERS = { "Estado de pago": PAYMENT_FILTER_HEADER, "Situación de envío": ESTADO_FILTER_HEADER };
function renderHead() {
  const cells = hasColorAccess() ? ["Estado", ...BASE_HEAD, "Observaciones Sergio"] : BASE_HEAD;
  document.getElementById("orders-head-row").innerHTML = cells
    .map(c => \`<th>\${HEADER_FILTERS[c] || c}</th>\`)
    .join("");
  document.getElementById("payment-filter").addEventListener("change", applyFilter);
  document.getElementById("estado-filter").addEventListener("change", applyFilter);
}

function render(orders) {
  const access = hasColorAccess();
  const tbody = document.querySelector("#orders tbody");
  tbody.innerHTML = orders.map(o => {
    const baseCells = \`
      <td class="bell-cell"><div class="iconos-pedido">\${reviewBell(o)}\${cancelButton(o)}\${sustituirPedidoButton(o)}\${reposicionButton(o)}\${gestoComercialButton(o)}\${juntarEnvioButton(o)}\${noSalioButton(o)}\${cancelarLineaButton(o)}</div></td>
      <td>BEZEN\${o.orderNumber}\${grupoEnvioTag(o)}</td>
      <td>\${formatOrderDate(o.orderDate)}</td>
      <td>\${o.name}</td>
      <td>\${o.address}</td>
      <td>\${o.phone}</td>
      <td>\${o.product}\${lineasCanceladasHtml(o)}\${backorders.filter(b => b.orderId === o.id).map(abiertoTagHtml).join("")}</td>
      <td class="services">\${o.services}</td>
      <td>\${o.paymentMethod}</td>
      <td>\${pagoManualCell(o)}</td>
      <td>\${statusBadge(o.shippingStatus)}</td>
      <td>\${agenciaBadge(o)}</td>
      <td>\${trackingCell(o)}</td>
      <td class="price">\${o.price} \${o.currency || ""}</td>
      <td><input type="text" class="notas-input" data-id="\${o.id}" value="\${escapeAttr(o.notas)}" placeholder="Notas..."></td>
    \`;
    if (!access) return \`<tr\${o.cancelado ? ' class="fila-cancelada"' : ""}>\${baseCells}</tr>\`;

    const meta = COLOR_META[o.colorTag];
    const rowStyle = !o.cancelado && meta ? \`border-left: 5px solid \${meta.dot}; background-color: \${meta.bg};\` : "";
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

    return \`<tr\${o.cancelado ? ' class="fila-cancelada"' : ""} style="\${rowStyle}">\${estadoCell}\${baseCells}\${obsCell}</tr>\`;
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

  tbody.querySelectorAll(".notas-input").forEach(inp => {
    inp.addEventListener("focus", () => { editing = true; });
    inp.addEventListener("blur", () => {
      editing = false;
      const order = allOrders.find(o => String(o.id) === inp.dataset.id);
      if (order) order.notas = inp.value;
      saveMeta(inp.dataset.id, { notas: inp.value });
      if (pendingRefresh) { pendingRefresh = false; loadOrders(); }
    });
  });
}

// Las dudas de "sale junto (FUR) o aparte (FPK)" generadas por
// inventory-store.js (ver reviewReasons.push con "del pack sin stock")
// llevan siempre este texto fijo al final — se usa para detectarlas y
// mostrar un selector real en vez de un textarea libre, y para poder
// aplicar la respuesta directamente al tipoEnvio del pendiente
// correspondiente (Jennifer, 2026-09-24, caso real BEZEN12224: contestó
// "FUR. SALE JUNTO" en la campana pero el pendiente de Luso se quedó en
// FPK porque el texto libre nunca se aplicaba al pendiente).
const FUR_FPK_MARKER = "Dime si sale junto con la tapicería (FUR) o puede ir aparte (FPK).";
function parseFurFpkReason(reason) {
  if (!reason || !reason.includes(FUR_FPK_MARKER)) return null;
  const m = /^(.+?) \\(([^)]+)\\) del pack/.exec(reason);
  if (!m) return null;
  return { stockModel: m[1], talla: m[2] };
}
async function aplicarRespuestasFurFpk(order, answers) {
  const reasons = order.reviewReasons || [];
  const pendientesPorAplicar = reasons
    .map((r, i) => ({ furFpk: parseFurFpkReason(r), valor: answers[i] }))
    .filter(x => x.furFpk && (x.valor === "FUR" || x.valor === "FPK"));
  if (!pendientesPorAplicar.length) return;
  const res = await fetch("/api/inventario/pendientes");
  const todos = await res.json();
  for (const { furFpk, valor } of pendientesPorAplicar) {
    const b = todos.find(x => String(x.orderId) === String(order.id) && x.tipo === "colchon" && x.stockModel === furFpk.stockModel && x.talla === furFpk.talla && x.estado === "pendiente");
    if (b) await updateBackorderPlan(b.id, { tipoEnvio: valor });
  }
}

let reviewModalOrderId = null;
function openReviewModal(order) {
  reviewModalOrderId = order.id;
  document.getElementById("review-modal-title").textContent = "Revisar pedido " + refLabel(order);
  const reasons = order.reviewReasons || [];
  const answers = order.reviewAnswers || [];
  const questionsEl = document.getElementById("review-modal-questions");
  questionsEl.innerHTML = reasons.length
    ? reasons.map((r, i) => {
        const furFpk = parseFurFpkReason(r);
        if (furFpk) {
          const actual = (answers[i] || "").toUpperCase();
          const sel = actual.includes("FUR") ? "FUR" : actual.includes("FPK") ? "FPK" : "";
          return \`
        <div class="review-question">
          <p>\${r}</p>
          <select class="review-answer-input" data-index="\${i}">
            <option value="">-- Elige --</option>
            <option value="FUR"\${sel === "FUR" ? " selected" : ""}>FUR — Sale junto con la tapicería</option>
            <option value="FPK"\${sel === "FPK" ? " selected" : ""}>FPK — Va aparte</option>
          </select>
        </div>
      \`;
        }
        return \`
        <div class="review-question">
          <p>\${r}</p>
          <textarea class="review-answer-input" data-index="\${i}" placeholder="Tu decisión para esto...">\${escapeAttr(answers[i] || "")}</textarea>
        </div>
      \`;
      }).join("")
    // Un pedido puede quedar marcado "para revisar" sin ningún motivo de
    // texto asociado (ej. un fallo ya corregido a mano) — sin esto el
    // modal salía vacío y sin ninguna acción posible (Jennifer, 2026-09-19,
    // caso real BEZEN12207: "me ha salido un pop up... pero no me deja
    // hacer nada").
    : '<p>Este pedido está marcado para revisar, pero no hay ningún motivo de texto guardado (puede que ya esté solucionado a mano).</p><button type="button" id="review-modal-marcar-revisado">Marcar como revisado</button>';
  document.getElementById("review-modal-overlay").classList.add("open");
  const marcarBtn = document.getElementById("review-modal-marcar-revisado");
  if (marcarBtn) {
    marcarBtn.addEventListener("click", async () => {
      await fetch("/api/pedidos/shopify/meta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: order.id, needsReview: false }),
      });
      order.needsReview = false;
      closeReviewModal();
      render(currentFiltered());
    });
  }
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
  if (order) {
    order.reviewAnswers = answers;
    await aplicarRespuestasFurFpk(order, answers);
  }
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
document.querySelector("#orders tbody").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-sustituir-order-id]");
  if (!btn) return;
  abrirSustituirDesdePedido(btn.dataset.sustituirOrderId);
});
document.querySelector("#orders tbody").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-reposicion-order-id]");
  if (!btn) return;
  abrirReposicionDesdePedido(btn.dataset.reposicionOrderId);
});
document.querySelector("#orders tbody").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-gesto-comercial-order-id]");
  if (!btn) return;
  abrirGestoComercialDesdePedido(btn.dataset.gestoComercialOrderId);
});
document.querySelector("#orders tbody").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-juntar-id]");
  if (!btn) return;
  const order = allOrders.find(o => String(o.id) === btn.dataset.juntarId);
  if (!order) return;
  if (order.grupoEnvio) {
    const otros = pedidosDelGrupo(order).filter(o => o.id !== order.id).map(refLabel).join(", ");
    if (!confirm("¿Separar " + refLabel(order) + " del envío conjunto con " + otros + "?\\n\\nVolverá a salir por su cuenta (un colchón volverá a SEUR).")) return;
    const res = await fetch("/api/pedidos/shopify/grupo-envio/desvincular", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: order.id }),
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) alert("No se ha podido separar: " + (r.error || res.status));
  } else {
    const texto = prompt("¿Con qué pedido se envía junto " + refLabel(order) + "?\\nEscribe el número (ej. BEZEN12233 o 12233):");
    if (!texto) return;
    const limpio = texto.trim().toUpperCase();
    const numero = Number(limpio.replace(/^BEZEN/, ""));
    const otro = allOrders.find(o => o.id !== order.id && ((numero && o.platform === "Shopify" && o.orderNumber === numero) || (o.orderRef || "").toUpperCase() === limpio));
    if (!otro) { alert("No encuentro el pedido " + texto + "."); return; }
    const nombreLimpio = s => (s || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").trim().toLowerCase();
    if (nombreLimpio(otro.name) !== nombreLimpio(order.name)
      && !confirm("Ojo: los nombres no coinciden (" + order.name + " / " + otro.name + "). ¿Juntarlos igualmente?")) return;
    const res = await fetch("/api/pedidos/shopify/grupo-envio/vincular", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderIds: [order.id, otro.id] }),
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) { alert("No se han podido juntar: " + (r.error || res.status)); return; }
    alert(refLabel(order) + " y " + refLabel(otro) + " saldrán juntos por Furniture, en un solo envío.");
  }
  await loadOrders();
  loadPendientes();
});
document.querySelector("#orders tbody").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-pago-manual-id]");
  if (!btn) return;
  const order = allOrders.find(o => String(o.id) === btn.dataset.pagoManualId);
  if (!order) return;
  if (!confirm("¿Confirmas que el cliente ya ha pagado " + refLabel(order) + "?\\n\\nSe tramitará ahora con fecha de hoy y aparecerá en Proveedores para pedirlo a fábrica. Cuando se marque como pagado en Shopify no se volverá a tramitar.")) return;
  btn.disabled = true;
  btn.textContent = "Tramitando…";
  const res = await fetch("/api/pedidos/shopify/admin/tramitar-pagado-manual", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: order.id, usuario: currentUser }),
  });
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.inventoryProcessed) {
    alert("No se ha podido tramitar: " + (r.error || "revisa el pedido (quizá el procesamiento está en pausa)."));
  }
  await loadOrders();
  loadPendientes();
});
document.querySelector("#orders tbody").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-cancel-id]");
  if (!btn) return;
  const order = allOrders.find(o => String(o.id) === btn.dataset.cancelId);
  if (!order) return;
  const nuevoEstado = !order.cancelado;
  if (nuevoEstado && !confirm("¿Cancelar el pedido " + refLabel(order) + "?")) return;
  order.cancelado = nuevoEstado;
  await saveMeta(order.id, { cancelado: nuevoEstado });
  render(currentFiltered());
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
  const estadoFilter = document.getElementById("estado-filter").value;
  const paymentFilter = document.getElementById("payment-filter").value;
  // allOrders trae todas las plataformas (Furniture/SEUR/Proveedores lo
  // necesitan así) — la tabla de Pedidos > Shopify se queda solo con los
  // suyos (Jennifer, 2026-09-17: pantallas separadas por plataforma;
  // generalizado 2026-09-19 al añadir Maison Du Monde).
  let filtered = allOrders.filter(o => o.platform === "Shopify" || !o.platform);
  if (q) {
    filtered = filtered.filter(o => ("bezen" + o.orderNumber).includes(q) || (o.name || "").toLowerCase().includes(q));
  }
  if (colorFilter) {
    filtered = filtered.filter(o => o.colorTag === colorFilter);
  }
  // "Solo pendientes" (Jennifer, 2026-09-16): oculta los pedidos ya
  // terminados (enviados Y pagados) para que la lista no crezca sin límite
  // — se queda solo con los que aún necesitan atención por envío o pago.
  if (estadoFilter === "pendientes") {
    filtered = filtered.filter(o => o.shippingStatus !== "fulfilled" || o.paymentStatus !== "PAGADO");
  }
  if (paymentFilter === "PAGADO") {
    filtered = filtered.filter(o => o.paymentStatus === "PAGADO");
  } else if (paymentFilter === "PENDIENTE") {
    filtered = filtered.filter(o => o.paymentStatus === "PENDIENTE DE PAGO");
  } else if (paymentFilter === "REEMBOLSADO") {
    filtered = filtered.filter(o => o.paymentStatus === "REEMBOLSADO");
  }
  return filtered;
}

function applyFilter() {
  render(currentFiltered());
  actualizarBadgeAbiertos();
  actualizarBadgesPlazo();
}

document.getElementById("search").addEventListener("input", applyFilter);
document.getElementById("pendientes-referencia-search").addEventListener("input", renderPendientes);
document.getElementById("pendientes-pedido-search").addEventListener("input", renderPendientes);
document.getElementById("pendientes-sku-search").addEventListener("input", renderPendientes);
document.getElementById("pendientes-ocultar-recibidos").addEventListener("change", renderPendientes);
// "Mostrar cancelados" se recuerda en este navegador (Jennifer, 2026-09-29).
(() => {
  const chk = document.getElementById("pendientes-mostrar-cancelados");
  try { chk.checked = localStorage.getItem("hd_mostrar_cancelados") === "1"; } catch (e) { /* sin localStorage */ }
  chk.addEventListener("change", () => {
    try { localStorage.setItem("hd_mostrar_cancelados", chk.checked ? "1" : "0"); } catch (e) { /* sin localStorage */ }
    renderPendientes();
  });
})();
// Si la ventana cambia de tamaño el texto de la cabecera puede pasar a 1 o 2
// líneas y cambiar de alto — se re-mide (Jennifer, 2026-09-25, ver
// sincronizarTopFilaFiltro).
window.addEventListener("resize", () => {
  sincronizarTopFilaFiltro("pendientes-table", "pendientes-filter-row");
  sincronizarTopFilaFiltro("furniture-pendientes-table", "furniture-filter-row");
});
// Excel de todos los pendientes de proveedor (Jennifer, 2026-09-25): "por si
// tengo que hacer algo con ellos con el excel" — descarga TODOS los
// pendientes de Polival/Luso/New de golpe, sin importar la pestaña o los
// filtros de texto que haya puestos en pantalla ahora mismo (a diferencia de
// la tabla, que sí filtra). Mismas columnas que ya se ven en pantalla, más
// "Proveedor" para poder distinguirlos una vez mezclados en una sola hoja.
document.getElementById("descargar-excel-pendientes-btn").addEventListener("click", async () => {
  const lista = backorders
    .filter(b => b.estado === "pendiente" && ["POLIVAL", "LUSO", "NEW"].includes(b.proveedor))
    .sort((a, b) => (a.proveedor === b.proveedor ? parseFechaGenerica(a.fecha) - parseFechaGenerica(b.fecha) : a.proveedor.localeCompare(b.proveedor)));
  // Coste de tarifa de los colchones de Luso/New (Jennifer, 2026-09-30:
  // "cuando descargue la tabla de proveedores esos precios se puedan
  // descargar en la columna también") — como número, para poder sumar.
  await cargarCostesTarifa(lista.filter(b => b.proveedor === "LUSO" || b.proveedor === "NEW"));
  const costeUd = b => {
    if (b.proveedor !== "LUSO" && b.proveedor !== "NEW") return "";
    const c = costesTarifa.get(b.stockModel + "|" + b.talla);
    return c && c.coste != null ? Math.round(c.coste * 100) / 100 : "";
  };
  const filas = lista
    .map(b => ({
      Proveedor: b.proveedor,
      Pedido: refLabel(b) + (b.refSuffix || ""),
      Plataforma: b.platform || "Shopify",
      Modelo: b.stockModel,
      Color: b.color || "",
      Talla: b.talla,
      SKU: skuDePendiente(b),
      Cantidad: b.cantidad,
      "Coste ud (tarifa)": costeUd(b),
      "Coste total (tarifa)": costeUd(b) === "" ? "" : Math.round(costeUd(b) * (b.cantidad || 1) * 100) / 100,
      "Ref. Polival": b.referencia || "",
      "FUR/FPK": b.esPack && b.tipo === "colchon" ? (b.tipoEnvio || "") : "",
      "Mercancía para pedir a fábrica": b.mercanciaFabrica || "",
      "Fecha del pedido": b.fecha || "",
      "En revisión": b.revision ? (b.revision.motivo || "Sí") : "",
      Notas: (allOrders.find(o => String(o.id) === String(b.orderId)) || {}).notas || "",
      "Pedido a fábrica": b.pedidoGenerado ? "Sí" + (b.fechaPedidoFabrica ? " (" + new Date(b.fechaPedidoFabrica).toLocaleDateString("es-ES") + ")" : "") : "No",
      "Recibido de fábrica": b.recibidoFabrica ? "Sí" + (b.fechaRecibido ? " (" + new Date(b.fechaRecibido).toLocaleDateString("es-ES") + ")" : "") : "No",
    }));
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pendientes proveedor");
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, "Pendientes_Proveedores_" + fecha + ".xlsx");
});
document.getElementById("furniture-pedido-search").addEventListener("input", renderFurniture);
document.getElementById("furniture-referencia-search").addEventListener("input", renderFurniture);
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
  loadCargas();
  loadAvisosCanceladosCount();
  // Cargado también aquí (no solo al entrar en Catálogo) porque Proveedores
  // pendientes lo necesita para calcular la columna SKU (Jennifer,
  // 2026-09-21) sin depender de que se haya visitado antes esa pantalla.
  loadCatalogo();
  // Igual que arriba con el catálogo (Jennifer, 2026-09-21): el aviso de
  // "ya tiene una reposición pedida" en el botón REP de Pedidos necesita
  // backorders cargado desde el principio, sin depender de haber entrado
  // antes en Proveedores/Furniture. Se vuelve a pintar la tabla de Pedidos
  // en cuanto llega, por si ya se había pintado sin esta información.
  fetch("/api/inventario/pendientes").then(r => r.json()).then(data => {
    backorders = data;
    applyFilter();
  });
  // Colchones abiertos: el contador morado del menú tiene que verse nada
  // más entrar, sin haber abierto antes esa pantalla (Jennifer, 2026-09-28).
  cargarAbiertos().then(applyFilter);
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

const ALL_VIEWS = ["view-shopify", "view-carrefour", "view-maison-du-monde", "view-worten", "view-conforama", "view-conforama-es", "view-leroy-merlin", "view-placeholder", "view-catalogo", "view-stock", "view-abiertos", "view-pendientes", "view-historial", "view-furniture", "view-historial-cargas", "view-casos-revisar", "view-seur", "view-historial-cargas-seur", "view-casos-revisar-seur", "view-pesos", "view-historico-rep", "view-tarifas", "view-tarifas-plataformas", "view-plazos-marketplace"];
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
  } else if (id === "carrefour" || id === "maison-du-monde" || id === "worten" || id === "conforama" || id === "conforama-es" || id === "leroy-merlin") {
    document.getElementById("view-" + id).style.display = "block";
    loadMarketplacePedidos(id);
  } else {
    const ph = document.getElementById("view-placeholder");
    ph.style.display = "block";
    ph.textContent = platform.label + " todavía no está conectado. Lo añadiremos próximamente.";
  }
}

function selectPlazos(id) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.plazos === id));
  hideAllViews();
  if (id === "marketplace") {
    document.getElementById("view-title").textContent = "Plazos de entrega · Marketplace";
    document.getElementById("view-plazos-marketplace").style.display = "block";
    cargarPlazosMarketplace();
    return;
  }
  document.getElementById("view-title").textContent = "Plazos de entrega · Bezen";
  const ph = document.getElementById("view-placeholder");
  ph.style.display = "block";
  ph.textContent = "Plazos de entrega para Bezen todavía no está definido. Lo añadiremos cuando Jennifer dé la regla.";
}
// Fichero de plazos de entrega para Marketplace (Jennifer, 2026-09-23):
// mismo patrón que "Ficheros plataformas" de Tarifas — el .xlsx se
// regenera en caliente con el stock ACTUAL cada vez que se descarga, no
// hay que volver a subirlo cuando cambie el stock.
async function cargarPlazosMarketplace() {
  const el = document.getElementById("plazos-marketplace-lista");
  try {
    const res = await fetch("/api/plazos/listar");
    const data = await res.json();
    const plazos = (data && data.plazos) || [];
    const cfg = plazos.find(p => p.plazo === "MARKETPLACE");
    if (!cfg) {
      el.textContent = "Todavía no hay ningún fichero de plazos de Marketplace cargado.";
      return;
    }
    const fecha = cfg.actualizado ? new Date(cfg.actualizado).toLocaleString("es-ES") : "—";
    const fechaDescarga = cfg.ultimaDescarga ? new Date(cfg.ultimaDescarga).toLocaleString("es-ES") : "todavía no se ha descargado";
    el.innerHTML = \`<div>
      <a href="/api/plazos/marketplace/export" class="secondary" style="display:inline-block;padding:6px 12px;border-radius:6px;text-decoration:none">
        Descargar Marketplace (\${cfg.totalFilas} SKU)
      </a>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">actualizado al cargar: \${fecha}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">· última descarga: \${fechaDescarga}</span>
    </div>\`;
    // El enlace es una descarga real (Content-Disposition attachment), no
    // navega fuera de la página — tras pulsarlo se refresca este bloque
    // para que "última descarga" se actualice sin tener que salir y volver
    // a entrar en la sección (Jennifer, 2026-09-24).
    const enlace = el.querySelector("a");
    if (enlace) enlace.addEventListener("click", () => setTimeout(cargarPlazosMarketplace, 800));
  } catch (e) {
    el.textContent = "No se pudo cargar el fichero de plazos.";
  }
}

const INVENTARIO_LABELS = { catalogo: "Catálogo", stock: "Stock", abiertos: "Colchones abiertos", historial: "Historial de stock", pesos: "Pesos SEUR" };
function selectInventario(id) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.inventario === id));
  document.getElementById("view-title").textContent = "Inventario · " + INVENTARIO_LABELS[id];
  hideAllViews();
  document.getElementById("view-" + id).style.display = "block";
  if (id === "catalogo") loadCatalogo();
  if (id === "stock") loadStock();
  if (id === "abiertos") loadAbiertos();
  if (id === "historial") loadHistorial();
  if (id === "pesos") loadPesos();
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

const LOGISTICA_LABELS = { furniture: "Furniture · Pedidos pendientes", "historial-cargas": "Furniture · Historial de cargas", "casos-revisar": "Furniture · Casos a revisar", seur: "SEUR · Pedidos pendientes", "historial-cargas-seur": "SEUR · Historial de cargas", "casos-revisar-seur": "SEUR · Envíos SEUR" };
function selectLogistica(id) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.logistica === id));
  document.getElementById("view-title").textContent = "Logística · " + LOGISTICA_LABELS[id];
  hideAllViews();
  document.getElementById("view-" + id).style.display = "block";
  if (id === "furniture") loadFurniture();
  if (id === "historial-cargas") loadHistorialCargas();
  if (id === "casos-revisar") loadCasosRevisar();
  if (id === "seur") loadSeur();
  if (id === "historial-cargas-seur") loadHistorialCargasSeur();
  if (id === "casos-revisar-seur") loadCasosRevisarSeur();
}

// Histórico de reposiciones y gestos comerciales (Jennifer, 2026-09-22):
// "un sitio donde yo vaya sola a buscar esas reposiciones y esos gestos
// comerciales" — TODOS, cualquier estado (pendiente, ya enviado por SEUR/
// Furniture, cancelado...), no solo los que siguen activos. Reusa el mismo
// array backorders ya cargado en el resto de pantallas de Proveedores/
// Furniture/SEUR (que ya trae cualquier estado, no solo "pendiente").
function selectHistorico(id) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.historico === id));
  document.getElementById("view-title").textContent = "Histórico reposiciones y gestos comerciales";
  hideAllViews();
  document.getElementById("view-historico-rep").style.display = "block";
  loadHistoricoRepGc();
}

// TARIFAS (Jennifer, 2026-09-22): consulta el precio de venta calculado
// (BEZEN/MAISON/RESTO × ES/FR/IT/AL) para cada talla de un modelo, con
// desglose paso a paso de la fórmula al pulsar sobre cada precio — "quiero
// poder chequear cómo has sacado ese cálculo". Solo modelos de tipo
// Colchones (por ahora, empezando por Toscana Deluxe).
function selectTarifas(id) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.tarifas === id));
  hideAllViews();
  if (id === "plataformas") {
    document.getElementById("view-title").textContent = "Tarifas · Ficheros plataformas";
    document.getElementById("view-tarifas-plataformas").style.display = "block";
    cargarPlataformasExport();
    return;
  }
  document.getElementById("view-title").textContent = "Tarifas · Consultar";
  document.getElementById("view-tarifas").style.display = "block";
  loadTarifas();
}

document.querySelectorAll(".nav-link").forEach(a => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    if (a.dataset.platform) selectPlatform(a.dataset.platform);
    else if (a.dataset.inventario) selectInventario(a.dataset.inventario);
    else if (a.dataset.proveedores) selectProveedores(a.dataset.proveedores);
    else if (a.dataset.logistica) selectLogistica(a.dataset.logistica);
    else if (a.dataset.historico) selectHistorico(a.dataset.historico);
    else if (a.dataset.tarifas) selectTarifas(a.dataset.tarifas);
    else if (a.dataset.plazos) selectPlazos(a.dataset.plazos);
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

const logisticaToggle = document.getElementById("logistica-toggle");
const logisticaListEl = document.getElementById("logistica-list");
logisticaToggle.addEventListener("click", () => {
  logisticaToggle.classList.toggle("open");
  logisticaListEl.classList.toggle("open");
});

const historicoToggle = document.getElementById("historico-toggle");
const historicoListEl = document.getElementById("historico-list");
historicoToggle.addEventListener("click", () => {
  historicoToggle.classList.toggle("open");
  historicoListEl.classList.toggle("open");
});

const tarifasToggle = document.getElementById("tarifas-toggle");
const tarifasListEl = document.getElementById("tarifas-list");
tarifasToggle.addEventListener("click", () => {
  tarifasToggle.classList.toggle("open");
  tarifasListEl.classList.toggle("open");
});

const plazosToggle = document.getElementById("plazos-toggle");
const plazosListEl = document.getElementById("plazos-list");
plazosToggle.addEventListener("click", () => {
  plazosToggle.classList.toggle("open");
  plazosListEl.classList.toggle("open");
});

// Histórico de reposiciones y gestos comerciales (Jennifer, 2026-09-22):
// TODOS, sin importar el estado — pendiente, ya salido por SEUR/Furniture,
// cancelado... Reusa /api/inventario/pendientes, que YA devuelve cualquier
// backorder sin filtrar por estado (el filtrado por "pendiente" solo lo
// hacen las pantallas de Proveedores en el cliente).
async function loadHistoricoRepGc() {
  const res = await fetch("/api/inventario/pendientes");
  backorders = await res.json();
  renderHistoricoRepGc();
}
function renderHistoricoRepGc() {
  const busquedaPedido = document.getElementById("historico-pedido-search").value.trim().toLowerCase();
  const busquedaReferencia = document.getElementById("historico-referencia-search").value.trim().toLowerCase();
  const tipoFiltro = document.getElementById("historico-tipo-filter").value;
  let items = backorders.filter(b => b.reposicion || b.gestoComercial);
  if (tipoFiltro === "reposicion") items = items.filter(b => b.reposicion);
  if (tipoFiltro === "gestoComercial") items = items.filter(b => b.gestoComercial);
  if (busquedaPedido) {
    items = items.filter(b => (refLabel(b) + (b.refSuffix || "")).toLowerCase().includes(busquedaPedido)
      || (b.orderRef || "").toLowerCase().includes(busquedaPedido)
      || String(b.orderNumber).includes(busquedaPedido));
  }
  if (busquedaReferencia) {
    items = items.filter(b => (b.referencia || "").toLowerCase().includes(busquedaReferencia)
      || refLabel(b).toLowerCase().includes(busquedaReferencia));
  }
  // Pantalla de "ir a buscar algo" — más reciente arriba, como Polival.
  items = [...items].sort((a, b) => parseFechaGenerica(b.fecha) - parseFechaGenerica(a.fecha));
  document.getElementById("historico-rep-count").textContent = items.length + " registrados";
  document.querySelector("#historico-rep-table tbody").innerHTML = items.map(b => {
    const o = allOrders.find(x => x.id === b.orderId) || {};
    const tipoLabel = b.gestoComercial ? "GC" : "REP";
    const pedidoBase = o.platform && o.platform !== "Shopify" && o.orderRef ? o.orderRef : "BEZEN" + b.orderNumber;
    const agencia = b.agenciaReposicion || (b.gestoComercial ? "SEUR" : "");
    let recogida = "—";
    if (b.tipo === "colchon" && b.agenciaReposicion === "FURNITURE") {
      recogida = b.recogida ? ("Sí — " + (b.recogidaDestino === "desechar" ? "desechar" : "instalaciones")) : "No";
    }
    return \`
      <tr>
        <td>\${tipoLabel}</td>
        <td>\${refLabel(b)}</td>
        <td>\${pedidoBase}</td>
        <td>\${o.name || ""}</td>
        <td>\${b.stockModel}</td>
        <td>\${b.talla || ""}</td>
        <td>\${b.cantidad}</td>
        <td>\${escapeAttr(b.piezaTexto || "")}</td>
        <td>\${agencia}</td>
        <td>\${recogida}</td>
        <td>\${b.estado}</td>
        <td>\${new Date(parseFechaGenerica(b.fecha)).toLocaleDateString("es-ES")}</td>
      </tr>
    \`;
  }).join("");
}
document.getElementById("historico-pedido-search").addEventListener("input", renderHistoricoRepGc);
document.getElementById("historico-referencia-search").addEventListener("input", renderHistoricoRepGc);
document.getElementById("historico-tipo-filter").addEventListener("change", renderHistoricoRepGc);

let catalogoProducts = [];
async function loadCatalogo() {
  const res = await fetch("/api/inventario/catalogo");
  catalogoProducts = await res.json();
  renderCatalogo();
}
// SKU real de un pendiente de Luso/New (Jennifer, 2026-09-21) — el
// backorder no guarda su propio SKU, así que se busca el producto del
// Catálogo por stockModel y se construye prefijo+talla, igual que ya se
// hace para el SKU calculado de los pedidos de marketplace.
function skuDePendiente(b) {
  const p = catalogoProducts.find(x => x.stockModel === b.stockModel);
  if (!p || !p.skuPrefix) return "—";
  return p.skuPrefix + (b.talla || "");
}

// ¿El pedido de este colchón SUELTO (no pack) lleva también tapicería como
// artículo aparte? (Jennifer, 2026-09-25, caso real BEZEN12173/12133): antes
// esto solo se veía yendo a Logística > Furniture — un colchón suelto
// "siempre por SEUR" (regla dictada 2026-09-18) no tenía ni aviso ni forma de
// decidir mandarlo junto con la tapicería. Mismos tipos de producto que ya
// usa InventoryStore (TYPE_MAP en inventory-store.js) para no inventar una
// clasificación nueva.
const TAPICERIA_PRODUCT_TYPES_FRONT = new Set(["Canapé", "Canapé fijo", "Base", "Cabecero"]);
function ordenTieneTapiceria(orderNumber) {
  const order = allOrders.find(o => o.orderNumber === orderNumber);
  if (!order) return false;
  // Envío conjunto (Jennifer, 2026-09-28): la tapicería puede estar en otro
  // pedido del mismo grupo — cuenta igual, el colchón sale con ella (FUR).
  const pedidos = order.grupoEnvio ? pedidosDelGrupo(order) : [order];
  return pedidos.some(p => (p.items || []).some(it => {
    const cp = catalogoProducts.find(c => c.productId === it.productId);
    return cp && TAPICERIA_PRODUCT_TYPES_FRONT.has(cp.product_type);
  }));
}

// Pedidos que se envían juntos (Jennifer, 2026-09-28): todos llevan
// grupoEnvio = id del pedido principal.
function pedidosDelGrupo(order) {
  if (!order || !order.grupoEnvio) return order ? [order] : [];
  // El principal primero, luego el resto por fecha.
  return allOrders.filter(o => o.grupoEnvio === order.grupoEnvio)
    .sort((a, b) => (b.id === order.grupoEnvio) - (a.id === order.grupoEnvio) || parseFechaGenerica(a.orderDate) - parseFechaGenerica(b.orderDate));
}
function grupoEnvioTag(order) {
  if (!order.grupoEnvio) return "";
  const otros = pedidosDelGrupo(order).filter(o => o.id !== order.id).map(refLabel).join(", ");
  const principal = allOrders.find(o => o.id === order.grupoEnvio);
  return \`<div class="grupo-envio-tag" title="Un solo envío por Furniture con la referencia \${escapeAttr(principal ? refLabel(principal) : "")}">📦 Junto con \${escapeAttr(otros)}</div>\`;
}

// La fila de filtros (Pendientes/Furniture) va sticky justo debajo de la
// cabecera de columnas, también sticky — un "top" fijo en CSS (34px) no
// siempre coincide con la altura REAL de la cabecera (depende de si el
// texto de alguna columna ocupa 1 o 2 líneas, fuente ya cargada o no, etc.),
// y si se queda corto la fila de filtros tapa un poco la fila de datos justo
// debajo, cortando el texto (Jennifer, 2026-09-25, caso real: "Modelo" en la
// primera fila de Luso/New). Se mide la altura real de la cabecera después
// de pintar la tabla y se aplica ese valor exacto en vez de adivinarlo.
// Barra de scroll horizontal encima de la tabla de Proveedores, movida a la
// par que la de la propia tabla (Jennifer, 2026-10-01).
function ajustarScrollArriba() {
  const arriba = document.getElementById("pendientes-scroll-arriba");
  const wrap = document.getElementById("pendientes-wrap");
  if (!arriba || !wrap) return;
  arriba.firstElementChild.style.width = wrap.scrollWidth + "px";
  arriba.style.display = wrap.scrollWidth > wrap.clientWidth + 1 ? "" : "none";
}
(() => {
  const arriba = document.getElementById("pendientes-scroll-arriba");
  const wrap = document.getElementById("pendientes-wrap");
  let moviendo = false;
  arriba.addEventListener("scroll", () => { if (moviendo) { moviendo = false; return; } moviendo = true; wrap.scrollLeft = arriba.scrollLeft; });
  wrap.addEventListener("scroll", () => { if (moviendo) { moviendo = false; return; } moviendo = true; arriba.scrollLeft = wrap.scrollLeft; });
  window.addEventListener("resize", ajustarScrollArriba);
})();

function sincronizarTopFilaFiltro(tablaId, filaFiltroId) {
  const cabecera = document.querySelector("#" + tablaId + " thead tr:first-child");
  const filaFiltro = document.getElementById(filaFiltroId);
  if (!cabecera || !filaFiltro) return;
  const alto = Math.ceil(cabecera.getBoundingClientRect().height);
  if (!alto) return;
  filaFiltro.querySelectorAll("th").forEach(th => { th.style.top = alto + "px"; });
}

// TARIFAS (Jennifer, 2026-09-22): precio de venta calculado por talla para
// cada plataforma/país, con desglose paso a paso de la fórmula al pulsar
// sobre el precio (quiere poder comprobar que el cálculo está bien).
const TARIFAS_COLUMNAS = [
  { key: "BEZEN", label: "BEZEN" },
  { key: "MAISON_ES", label: "MAISON ES" },
  { key: "RESTO_ES", label: "RESTO ES" },
  { key: "MAISON_FR", label: "MAISON FR" },
  { key: "RESTO_FR", label: "RESTO FR" },
  { key: "MAISON_IT", label: "MAISON IT" },
  { key: "RESTO_IT", label: "RESTO IT" },
  { key: "RESTO_AL", label: "RESTO AL" },
];
let tarifasFilasActuales = [];
function fmtPrecio(v) {
  return v == null ? "—" : v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";
}
// Buscador con autocompletado (Jennifer, 2026-09-23) en vez de un
// desplegable — mismo patrón que ya usa Inventario > Stock (input +
// <datalist>, sin resultados hasta que el texto coincide EXACTO con un
// modelo real, sea escrito a mano o elegido de la lista).
async function loadTarifas() {
  // catalogoProducts ya se carga al arrancar la sesión (ver onUserReady) —
  // no hace falta volver a pedirlo aquí. Varias fichas de Shopify pueden
  // compartir el mismo stockModel a propósito (mismo colchón físico, ej.
  // "4D"/"4D 2026"/"4D - LIQUIDACIÓN" son 3 productId distintos con
  // stockModel:"4D" — Jennifer, 2026-09-23, vio "4D" repetido 3 veces en
  // el buscador) — hay que quedarse con un solo nombre por stockModel.
  // Los modelos "LIQUIDACIÓN" con stockModel propio (ej. "Siberian Zen -
  // LIQUIDACION") no interesan en Tarifas (Jennifer, 2026-09-23) — se
  // excluyen del buscador aunque sigan en el Catálogo normal.
  const nombresUnicos = [...new Set(
    catalogoProducts
      .filter(p => p.product_type === "Colchones" && !p.excluido && !/liquidaci/i.test(p.stockModel || ""))
      .map(p => p.stockModel)
  )].sort((a, b) => a.localeCompare(b));
  document.getElementById("tarifas-modelos-datalist").innerHTML = nombresUnicos.map(nombre => \`<option value="\${escapeAttr(nombre)}"></option>\`).join("");
  await cargarTablaTarifas();
}
// Lista de ficheros de precio por plataforma ya cargados en el sistema
// (Jennifer, 2026-09-23: "necesito tener este fichero en el sistema para
// que si hacemos alguna actualización de precio, ese fichero se
// actualice, yo me lo descargue de aquí") — el .xlsx se regenera en el
// servidor con los precios actuales cada vez que se pulsa el enlace, no
// es un fichero estático guardado de una vez.
async function cargarPlataformasExport() {
  const el = document.getElementById("tarifas-plataformas-lista");
  try {
    const res = await fetch("/api/tarifas/plataforma/listar");
    const data = await res.json();
    const plataformas = (data && data.plataformas) || [];
    if (!plataformas.length) {
      el.textContent = "Todavía no hay ningún fichero de plataforma cargado.";
      return;
    }
    // Agrupado visualmente por familia de plataforma (Jennifer, 2026-09-23:
    // "puedes dividir un poco más con líneas... para que sea más fácil
    // visiblemente") — la familia es el nombre sin el sufijo de país
    // (MAISON_ES/MAISON_FR/MAISON_IT -> "MAISON"); un separador+título
    // antes de cada grupo nuevo, no solo delante del primero.
    const PAISES_SUFIJO = ["ES", "FR", "IT", "PT", "AL", "DE"];
    const familiaDe = (nombre) => {
      const partes = nombre.split("_");
      const ultima = partes[partes.length - 1];
      return partes.length > 1 && PAISES_SUFIJO.includes(ultima) ? partes.slice(0, -1).join("_") : nombre;
    };
    let familiaAnterior = null;
    const bloques = [];
    for (const p of plataformas) {
      const familia = familiaDe(p.plataforma);
      if (familia !== familiaAnterior) {
        bloques.push(\`<div style="margin:\${familiaAnterior === null ? "0" : "16px"} 0 6px;padding-top:\${familiaAnterior === null ? "0" : "10px"};\${familiaAnterior === null ? "" : "border-top:1px solid var(--border);"}font-weight:700;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.03em">\${escapeAttr(familia.replace(/_/g, " "))}</div>\`);
        familiaAnterior = familia;
      }
      const fecha = p.actualizado ? new Date(p.actualizado).toLocaleString("es-ES") : "—";
      bloques.push(\`<div style="margin-bottom:6px">
        <a href="/api/tarifas/plataforma/\${encodeURIComponent(p.plataforma)}/export" class="secondary" style="display:inline-block;padding:6px 12px;border-radius:6px;text-decoration:none">
          Descargar \${escapeAttr(p.plataforma)} (\${p.totalFilas} SKU)
        </a>
        <span style="color:var(--muted);font-size:12px;margin-left:8px">actualizado al cargar: \${fecha}</span>
      </div>\`);
    }
    el.innerHTML = bloques.join("");
  } catch (e) {
    el.textContent = "No se pudo cargar la lista de plataformas.";
  }
}
async function cargarTablaTarifas() {
  const typed = document.getElementById("tarifas-modelo-select").value.trim();
  const avisoEl = document.getElementById("tarifas-aviso");
  if (!typed) {
    document.querySelector("#tarifas-table tbody").innerHTML = "";
    document.getElementById("tarifas-count").textContent = "Escribe o elige un modelo para ver su tabla de tarifas.";
    avisoEl.style.display = "none";
    return;
  }
  const modelos = catalogoProducts.filter(p => p.product_type === "Colchones" && !p.excluido && !/liquidaci/i.test(p.stockModel || ""));
  const stockModel = modelos.find(p => p.stockModel === typed)?.stockModel
    || modelos.find(p => p.stockModel.toLowerCase() === typed.toLowerCase())?.stockModel
    || null;
  if (!stockModel) {
    document.querySelector("#tarifas-table tbody").innerHTML = "";
    document.getElementById("tarifas-count").textContent = "No hay ningún modelo que coincida exactamente con \\"" + typed + "\\".";
    avisoEl.style.display = "none";
    return;
  }
  const res = await fetch("/api/tarifas/tabla?stockModel=" + encodeURIComponent(stockModel));
  const data = await res.json();
  if (!res.ok || !data.ok) {
    avisoEl.style.display = "block";
    avisoEl.textContent = data.error || "No se ha podido calcular la tabla.";
    document.querySelector("#tarifas-table tbody").innerHTML = "";
    document.getElementById("tarifas-count").textContent = "";
    return;
  }
  tarifasFilasActuales = data.filas;
  renderTablaTarifas();
}
function renderTablaTarifas() {
  // Orden numérico de talla (Jennifer, 2026-09-23): 80X180, 80X190, 80X200,
  // 90X180... hasta 200X200 — nunca el orden en que vengan del Catálogo.
  // Mismo comparador que ya usa Inventario > Stock (parseTalla).
  const filas = [...tarifasFilasActuales].sort((a, b) => {
    const [aw, ah] = parseTalla(a.talla);
    const [bw, bh] = parseTalla(b.talla);
    return aw - bw || ah - bh;
  });
  const avisoEl = document.getElementById("tarifas-aviso");
  const sinDatos = filas.filter(f => f.error);
  avisoEl.style.display = sinDatos.length ? "block" : "none";
  if (sinDatos.length) {
    avisoEl.textContent = sinDatos.length + " talla(s) sin datos completos: " + sinDatos.map(f => f.talla + " (" + f.error + ")").join(" · ");
  }
  const primeraConCoste = filas.find(f => f.costeProveedor);
  document.getElementById("tarifas-count").textContent = filas.length + " tallas"
    + (primeraConCoste ? " — coste de " + primeraConCoste.costeProveedor + " (" + primeraConCoste.costePeriodo + ")" : "");
  document.querySelector("#tarifas-table tbody").innerHTML = filas.map(f => {
    if (!f.columnas) {
      return \`<tr><td>\${f.talla}</td><td colspan="9" style="color:#991b1b">\${escapeAttr(f.error || "Sin datos")}</td></tr>\`;
    }
    const cells = TARIFAS_COLUMNAS.map(c => {
      const col = f.columnas[c.key];
      if (!col || col.precio == null) return "<td>—</td>";
      return \`<td><button type="button" class="secondary tarifa-precio-btn" data-talla="\${escapeAttr(f.talla)}" data-col="\${c.key}">\${fmtPrecio(col.precio)}</button></td>\`;
    }).join("");
    // Aviso visible (Jennifer, 2026-09-23) cuando el coste y/o el envío son
    // un sustituto (de otra talla, o de otro modelo hermano) — para que se
    // vea a simple vista sin tener que abrir cada desglose.
    const marcas = [];
    if (f.costeSustituto) marcas.push(\`<span title="Coste sustituto de \${escapeAttr(f.costeSustituto)}" style="color:#a855f7;font-weight:700">*</span>\`);
    if (f.envioSustituto) marcas.push(\`<span title="Envío sustituto de \${escapeAttr(f.envioSustituto)}" style="color:#0ea5e9;font-weight:700">†</span>\`);
    if (f.envioFijo != null) marcas.push(\`<span title="Envío fijo FURNITURE (\${fmtPrecio(f.envioFijo)}), igual para cualquier talla/país" style="color:#ea580c;font-weight:700">‡</span>\`);
    const tallaCell = marcas.length ? \`\${f.talla} \${marcas.join(" ")}\` : f.talla;
    return \`<tr><td>\${tallaCell}</td><td>\${fmtPrecio(f.coste)}</td>\${cells}</tr>\`;
  }).join("");
  document.querySelectorAll(".tarifa-precio-btn").forEach(btn => {
    btn.addEventListener("click", () => abrirDesgloseTarifa(btn.dataset.talla, btn.dataset.col));
  });
}
document.getElementById("tarifas-modelo-select").addEventListener("input", cargarTablaTarifas);

function abrirDesgloseTarifa(talla, colKey) {
  const fila = tarifasFilasActuales.find(f => f.talla === talla);
  if (!fila || !fila.columnas || !fila.columnas[colKey]) return;
  const col = fila.columnas[colKey];
  const colLabel = (TARIFAS_COLUMNAS.find(c => c.key === colKey) || {}).label || colKey;
  document.getElementById("tarifas-desglose-titulo").textContent = fila.talla + " — " + colLabel;
  document.getElementById("tarifas-desglose-pasos").innerHTML = col.pasos.map(p => \`
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13.5px">
      <span>\${escapeAttr(p.label)}</span><strong>\${fmtPrecio(p.valor)}</strong>
    </div>
  \`).join("");
  document.getElementById("tarifas-desglose-overlay").classList.add("open");
}
document.getElementById("tarifas-desglose-cerrar").addEventListener("click", () => {
  document.getElementById("tarifas-desglose-overlay").classList.remove("open");
});
document.getElementById("tarifas-desglose-overlay").addEventListener("click", (e) => {
  if (e.target.id === "tarifas-desglose-overlay") document.getElementById("tarifas-desglose-overlay").classList.remove("open");
});

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
      <td><input type="checkbox" class="excluido-check" data-id="\${p.productId}"\${p.excluido ? " checked" : ""} title="No participa en búsquedas por nombre/SKU ni en Tarifas (pero la ficha sigue existiendo en Shopify)"></td>
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
  tbody.querySelectorAll(".excluido-check").forEach(chk => {
    chk.addEventListener("change", () => saveCatalogoFlags(chk.dataset.id, { excluido: chk.checked }));
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

// === Colchones ABIERTOS (Jennifer, 2026-09-28) ===
// Un abierto no puede ir por SEUR, solo por Furniture. Aviso MORADO propio
// (distinto de la campana): un colchón de un pedido de Furniture que se
// puede cubrir con un abierto de la misma medida ("Usar el abierto") o
// cortando uno abierto MÁS GRANDE del mismo modelo ("Cortar").
let abiertosRows = [];
async function cargarAbiertos() {
  try {
    abiertosRows = await (await fetch("/api/inventario/abiertos")).json();
  } catch (e) {
    abiertosRows = [];
  }
  actualizarBadgeAbiertos();
}
function tallaDims(t) {
  const m = String(t || "").toUpperCase().match(/^(\\d+)X(\\d+)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
function esTallaMayor(grande, pequena) {
  const g = tallaDims(grande), p = tallaDims(pequena);
  return !!(g && p && g[0] >= p[0] && g[1] >= p[1] && (g[0] > p[0] || g[1] > p[1]));
}
// Colchón que podría salir de un abierto: de un pedido que va por
// Furniture, pendiente de fábrica o cubierto con un ENROLLADO de stock (que
// se puede devolver para SEUR). Nunca uno ya sacado de un abierto,
// transformado, de reposición o de gesto comercial.
function colchonCandidatoAbierto(b) {
  if (b.tipo !== "colchon" || b.reposicion || b.gestoComercial || b.desdeAbierto || b.transformadoDesde) return false;
  const conEnrollado = b.estado === "cubierto" && String(b.id).endsWith("-cubierto");
  if (b.estado !== "pendiente" && !conEnrollado) return false;
  const o = allOrders.find(x => x.id === b.orderId);
  return !!(o && o.agencia === "FURNITURE" && !o.cancelado && o.shippingStatus !== "fulfilled" && !o.cargaId);
}
// -> { mismo: fila de abierto misma medida | null, cortar: [filas mayores] }
function abiertosParaBackorder(b) {
  if (!abiertosRows.length || !colchonCandidatoAbierto(b)) return null;
  const n = b.cantidad || 1;
  // La ficha normal y la de "LIQUIDACIÓN" son el mismo colchón.
  const base = s => String(s || "").replace(/\\s*-\\s*LIQUIDACI[ÓO]N\\s*$/i, "").trim();
  const delModelo = abiertosRows.filter(a => base(a.stockModel) === base(b.stockModel) && a.cantidad >= n);
  const mismo = delModelo.find(a => a.talla === b.talla) || null;
  // Cortar solo aplica a lo que sigue pendiente (lo cubierto con enrollado
  // ya tiene la medida exacta: ahí solo tiene sentido "usar el abierto").
  const cortar = b.estado === "pendiente" ? delModelo.filter(a => esTallaMayor(a.talla, b.talla)) : [];
  return mismo || cortar.length ? { mismo, cortar } : null;
}
function oportunidadesAbiertos() {
  return backorders.map(b => ({ b, op: abiertosParaBackorder(b) })).filter(x => x.op);
}
function actualizarBadgeAbiertos() {
  const badge = document.getElementById("abiertos-badge");
  if (!badge) return;
  const n = oportunidadesAbiertos().length;
  badge.textContent = n;
  badge.style.display = n ? "" : "none";
}
// Etiqueta morada con sus botones, para pintar junto al colchón.
function abiertoTagHtml(b) {
  const op = abiertosParaBackorder(b);
  if (!op) return "";
  let html = "";
  if (op.mismo) {
    html += \`<span class="abierto-tag">🟣 ABIERTO disponible: \${escapeAttr(nombreCortoModelo(b.stockModel))} \${b.talla} (\${op.mismo.cantidad})\${op.mismo.nota ? " · " + escapeAttr(op.mismo.nota) : ""}</span> <button type="button" class="abierto-btn" data-usar-abierto="\${escapeAttr(b.id)}">Usar el abierto</button>\`;
  }
  for (const a of op.cortar) {
    html += \`\${html ? "<br>" : ""}<span class="abierto-tag">🟣✂️ Se puede CORTAR: abierto \${a.talla} → \${b.talla} (\${a.cantidad})\${a.nota ? " · " + escapeAttr(a.nota) : ""}</span> <button type="button" class="abierto-btn" data-cortar-abierto="\${escapeAttr(b.id)}" data-talla="\${escapeAttr(a.talla)}">Cortar</button>\`;
  }
  return '<div class="abierto-box">' + html + "</div>";
}
function nombreCortoModelo(stockModel) {
  const partes = String(stockModel || "").split("|").map(s => s.trim()).filter(Boolean);
  return partes[partes.length - 1] || stockModel || "";
}
async function usarAbierto(id) {
  const b = backorders.find(x => x.id === id);
  if (!b) return;
  const conEnrollado = b.estado === "cubierto";
  if (!confirm("¿Usar un colchón ABIERTO " + nombreCortoModelo(b.stockModel) + " " + b.talla + " para " + refLabel(b) + "?\\n\\n"
    + (conEnrollado ? "El enrollado que se había descontado vuelve al stock (para SEUR). " : "Deja de estar pendiente de fábrica. ")
    + "Sale por FURNITURE y se manda la reserva del abierto al almacén.")) return;
  const res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(id) + "/usar-abierto", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usuario: currentUser }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) { alert(data.error || "No se ha podido usar el abierto."); return; }
  alert(data.avisoReserva && data.avisoReserva.ok
    ? "Hecho: sale del abierto. Se ha enviado la reserva al almacén."
    : "Hecho: sale del abierto, pero NO se ha podido enviar la reserva al almacén (" + ((data.avisoReserva && data.avisoReserva.reason) || "error") + "). Avísales tú, por favor.");
  await recargarTrasAbierto(b.orderId);
}
async function cortarAbierto(id, tallaAbierto) {
  const b = backorders.find(x => x.id === id);
  if (!b) return;
  if (!confirm("¿Cortar un colchón ABIERTO " + nombreCortoModelo(b.stockModel) + " " + tallaAbierto + " a " + b.talla + " para " + refLabel(b) + "?\\n\\nSe manda al almacén el aviso de transformación con su etiqueta, y sale por FURNITURE.")) return;
  const res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(id) + "/sustituir", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ transformar: true, desdeAbierto: true, talla: tallaAbierto, fecha: null }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) { alert(data.error || "No se ha podido cortar."); return; }
  alert(data.avisoAlmacen && data.avisoAlmacen.ok
    ? "Hecho: se corta el abierto. Se ha enviado el aviso al almacén."
    : "Hecho: se corta el abierto, pero NO se ha podido enviar el email al almacén (" + ((data.avisoAlmacen && data.avisoAlmacen.reason) || "error") + "). Avísales tú, por favor.");
  await recargarTrasAbierto(b.orderId);
}
async function recargarTrasAbierto(orderId) {
  await cargarAbiertos();
  await loadOrders();
  backorders = await (await fetch("/api/inventario/pendientes")).json();
  applyFilter();
  if (document.getElementById("view-pendientes").style.display !== "none") renderPendientes();
  if (document.getElementById("view-furniture").style.display !== "none") renderFurniture();
  if (document.getElementById("view-abiertos").style.display !== "none") renderAbiertos();
  await checkAutoAddCarga(orderId);
}
// Los botones pueden estar en cualquier tabla (Pedidos, Luso/New,
// Furniture, la propia lista de abiertos): un solo escuchador global.
document.addEventListener("click", (e) => {
  const usar = e.target.closest("[data-usar-abierto]");
  if (usar) { e.preventDefault(); e.stopPropagation(); usarAbierto(usar.dataset.usarAbierto); return; }
  const cortar = e.target.closest("[data-cortar-abierto]");
  if (cortar) { e.preventDefault(); e.stopPropagation(); cortarAbierto(cortar.dataset.cortarAbierto, cortar.dataset.talla); }
}, true);

async function loadAbiertos() {
  if (!catalogoProducts.length) {
    try { catalogoProducts = await (await fetch("/api/inventario/catalogo")).json(); } catch (e) { /* sin catálogo, el datalist queda vacío */ }
  }
  const modelos = [...new Set(catalogoProducts.filter(p => p.product_type === "Colchones" && !p.noStock).map(p => p.stockModel).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  document.getElementById("abiertos-models-datalist").innerHTML = modelos.map(m => \`<option value="\${escapeAttr(m)}"></option>\`).join("");
  if (!backorders.length) backorders = await (await fetch("/api/inventario/pendientes")).json();
  await cargarAbiertos();
  renderAbiertos();
}
function renderAbiertos() {
  const ops = oportunidadesAbiertos();
  document.getElementById("abiertos-oportunidades-count").textContent = ops.length
    ? ops.length + (ops.length === 1 ? " colchón de Furniture puede salir de un abierto" : " colchones de Furniture pueden salir de un abierto")
    : "Ahora mismo ningún pedido de Furniture puede aprovechar un abierto.";
  document.querySelector("#abiertos-oportunidades-table tbody").innerHTML = ops.map(({ b }) => {
    const o = allOrders.find(x => x.id === b.orderId) || {};
    return \`<tr>
      <td>\${refLabel(b)}</td>
      <td>\${escapeAttr(o.name || "")}</td>
      <td>\${b.cantidad || 1}x \${escapeAttr(nombreCortoModelo(b.stockModel))} \${b.talla}\${b.estado === "cubierto" ? " <em>(ahora con un enrollado)</em>" : ""}</td>
      <td colspan="2">\${abiertoTagHtml(b)}</td>
    </tr>\`;
  }).join("");
  const filas = abiertosRows.slice().sort((a, b) => a.stockModel.localeCompare(b.stockModel) || compareTalla(a.talla, b.talla));
  const total = filas.reduce((n, r) => n + (r.cantidad || 0), 0);
  document.getElementById("abiertos-count").textContent = total + (total === 1 ? " colchón abierto" : " colchones abiertos") + " en el almacén";
  document.querySelector("#abiertos-table tbody").innerHTML = filas.map(r => \`<tr>
    <td>\${escapeAttr(r.stockModel)}</td>
    <td>\${r.talla}</td>
    <td>\${r.cantidad}</td>
    <td>\${escapeAttr(r.nota || "")}</td>
    <td><span class="adjust-form">
      <button type="button" class="abiertos-adjust" data-model="\${escapeAttr(r.stockModel)}" data-talla="\${escapeAttr(r.talla)}" data-delta="-1">−</button>
      <button type="button" class="abiertos-adjust" data-model="\${escapeAttr(r.stockModel)}" data-talla="\${escapeAttr(r.talla)}" data-delta="1">+</button>
    </span></td>
  </tr>\`).join("");
  document.querySelectorAll(".abiertos-adjust").forEach(btn => {
    btn.addEventListener("click", () => ajustarAbiertos(btn.dataset.model, btn.dataset.talla, Number(btn.dataset.delta)));
  });
}
async function ajustarAbiertos(query, talla, delta, nota) {
  const res = await fetch("/api/inventario/abiertos/adjust", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, mode: "nombre", talla, delta, nota, usuario: currentUser }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { document.getElementById("abiertos-result").textContent = data.error || "No se ha podido guardar."; return; }
  document.getElementById("abiertos-result").textContent = data.stockModel + " " + data.talla + ": " + data.cantidad + " abierto(s).";
  await cargarAbiertos();
  renderAbiertos();
  applyFilter();
}
["abiertos-alta", "abiertos-baja"].forEach(idBtn => {
  document.getElementById(idBtn).addEventListener("click", () => {
    const query = document.getElementById("abiertos-query").value.trim();
    const talla = document.getElementById("abiertos-talla").value.trim();
    const qty = Math.max(1, Number(document.getElementById("abiertos-qty").value) || 1);
    const nota = document.getElementById("abiertos-nota").value.trim();
    if (!query || !talla) { document.getElementById("abiertos-result").textContent = "Indica el modelo y la talla."; return; }
    ajustarAbiertos(query, talla, idBtn === "abiertos-alta" ? qty : -qty, nota || undefined);
  });
});

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
  loadCargas();
  renderPendientes();
}

// Coste de tarifa de cada colchón en Luso/New (Jennifer, 2026-09-30: "al
// lado de los pedidos de proveedores me pongas el importe que tiene cada
// colchón con la tarifa del proveedor"). Se piden al servidor solo los
// modelo+medida que aún no se tienen; al llegar se vuelve a pintar.
const costesTarifa = new Map();
let costesTarifaPidiendo = false;
async function cargarCostesTarifa(lista) {
  const faltan = [];
  const vistos = new Set();
  for (const b of lista) {
    const k = b.stockModel + "|" + b.talla;
    if (costesTarifa.has(k) || vistos.has(k)) continue;
    vistos.add(k);
    faltan.push({ stockModel: b.stockModel, talla: b.talla });
  }
  if (!faltan.length) return;
  // Si ya hay una petición en marcha, se espera a que acabe y se reintenta
  // (la descarga del Excel necesita los precios sí o sí).
  while (costesTarifaPidiendo) await new Promise(r => setTimeout(r, 150));
  if (faltan.every(f => costesTarifa.has(f.stockModel + "|" + f.talla))) return;
  costesTarifaPidiendo = true;
  try {
    const res = await fetch("/api/tarifas/costes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: faltan }) });
    const data = await res.json();
    for (const c of data.costes || []) costesTarifa.set(c.stockModel + "|" + c.talla, c);
    for (const f of faltan) if (!costesTarifa.has(f.stockModel + "|" + f.talla)) costesTarifa.set(f.stockModel + "|" + f.talla, { coste: null });
  } catch (e) { /* sin tarifa: la celda queda en "—" */ }
  costesTarifaPidiendo = false;
  renderPendientes();
}
function formatoEuros(n) {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
function costeTarifaCell(b) {
  const c = costesTarifa.get(b.stockModel + "|" + b.talla);
  if (!c) return '<td class="coste-tarifa">…</td>';
  if (c.coste == null) return '<td class="coste-tarifa" title="Sin precio en la tarifa del proveedor">—</td>';
  const cantidad = b.cantidad || 1;
  const titulo = "Tarifa " + (c.proveedor || "") + " " + (c.periodo || "") + (c.sustituto ? " (precio de la medida " + c.sustituto + ")" : "") + ": " + formatoEuros(c.coste) + " la unidad";
  return '<td class="coste-tarifa" title="' + escapeAttr(titulo) + '"><strong>' + formatoEuros(c.coste * cantidad) + "</strong>"
    + (cantidad > 1 ? '<br><span class="coste-unidad">' + formatoEuros(c.coste) + " / ud</span>" : "") + "</td>";
}
function totalCostesTarifa(lista) {
  let total = 0, sinPrecio = 0;
  for (const b of lista) {
    const c = costesTarifa.get(b.stockModel + "|" + b.talla);
    if (c && c.coste != null) total += c.coste * (b.cantidad || 1); else sinPrecio++;
  }
  return { total, sinPrecio };
}

// Notas del pedido en cada pendiente (Jennifer, 2026-10-01: "todos los
// pedidos tengan un apartado de notas para poder [añadir] información
// adicional"): son las mismas notas del pedido que ya se ven en Furniture.
function notasPedidoInput(b) {
  const o = allOrders.find(x => String(x.id) === String(b.orderId));
  if (!o) return "";
  return '<textarea class="notas-pendiente-input" data-order-id="' + escapeAttr(String(o.id)) + '" placeholder="Notas...">' + escapeAttr(o.notas || "") + "</textarea>";
}
document.addEventListener("change", (e) => {
  const inp = e.target.closest(".notas-pendiente-input");
  if (!inp) return;
  const o = allOrders.find(x => String(x.id) === inp.dataset.orderId);
  if (o) o.notas = inp.value;
  saveMeta(inp.dataset.orderId, { notas: inp.value });
});
// Botón "Revisar" en cualquier pendiente (Jennifer, 2026-10-01: "por si hay
// algo que ver"): pide el motivo y lo pasa al recuadro de revisión.
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-revisar-pendiente]");
  if (!btn) return;
  const b = backorders.find(x => x.id === btn.dataset.revisarPendiente);
  if (!b) return;
  const motivo = prompt("¿Qué hay que revisar de " + refLabel(b) + (b.refSuffix || "") + " (" + b.stockModel + " " + b.talla + ") antes de pedirlo?");
  if (motivo === null) return;
  const res = await fetch("/api/inventario/pendientes/set-campo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: b.id, revision: { motivo: motivo.trim() || "Revisar antes de pedir" } }) });
  if (!res.ok) { alert("No se ha podido pasar a revisión."); return; }
  b.revision = { motivo: motivo.trim() || "Revisar antes de pedir" };
  pedidoFabricaSeleccion.delete(b.id);
  renderPendientes();
});

// Pendientes de revisión antes de pedir (Jennifer, 2026-10-01: pedidos que
// entraron con un precio incorrecto, a la espera de que el cliente pague la
// diferencia). No salen en la lista normal ni se pueden pedir a fábrica
// hasta pulsar "Revisado: se puede pedir".
function renderRevision() {
  // Solo los del proveedor de la pestaña abierta (Jennifer, 2026-10-01: "solo
  // estarán en el apartado del proveedor que le corresponda").
  const enRevision = backorders.filter(b => b.revision && b.estado === "pendiente" && b.proveedor === String(currentProveedorFilter || "").toUpperCase())
    .sort((a, b) => parseFechaGenerica(a.fecha) - parseFechaGenerica(b.fecha));
  document.getElementById("revision-box").style.display = enRevision.length ? "" : "none";
  if (!enRevision.length) return;
  cargarCostesTarifa(enRevision.filter(b => b.proveedor === "LUSO" || b.proveedor === "NEW"));
  document.getElementById("revision-count").textContent = enRevision.length + " artículo(s) en revisión: no se pueden pedir a fábrica hasta marcarlos como revisados.";
  document.querySelector("#revision-table tbody").innerHTML = enRevision.map(b => "<tr>"
    + "<td>" + refLabel(b) + (b.refSuffix || "") + "</td>"
    + "<td>" + escapeAttr(b.proveedor || "") + "</td>"
    + "<td>" + escapeAttr(b.stockModel) + "</td>"
    + "<td>" + escapeAttr(b.talla) + "</td>"
    + "<td>" + b.cantidad + "</td>"
    + ((b.proveedor === "LUSO" || b.proveedor === "NEW") ? costeTarifaCell(b) : "<td>—</td>")
    + '<td class="revision-motivo">' + escapeAttr(b.revision.motivo || "") + "</td>"
    + "<td>" + notasPedidoInput(b) + "</td>"
    + "<td>" + new Date(parseFechaGenerica(b.fecha)).toLocaleDateString("es-ES") + "</td>"
    + '<td><button type="button" class="revision-ok-btn" data-id="' + escapeAttr(b.id) + '">Revisado: se puede pedir</button>'
    // Cancelar también desde aquí (Jennifer, 2026-10-01: si el cliente no
    // paga la diferencia) — mismo botón y comportamiento que en la lista.
    + ' <button type="button" class="cancelar-pendiente-btn" data-cancelar-pendiente="' + escapeAttr(b.id) + '" title="El cliente ha cancelado: se quita del proveedor y queda cancelado en el pedido">✕ Cancelar</button></td>'
    + "</tr>").join("");
  document.querySelectorAll(".revision-ok-btn").forEach(btn => btn.addEventListener("click", async () => {
    const b = backorders.find(x => x.id === btn.dataset.id);
    if (!b || !confirm("¿" + refLabel(b) + (b.refSuffix || "") + " ya está revisado? Pasará a la lista normal de " + b.proveedor + " para pedirlo a fábrica.")) return;
    const res = await fetch("/api/inventario/pendientes/set-campo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: b.id, revision: null }) });
    if (!res.ok) { alert("No se ha podido marcar como revisado."); return; }
    b.revision = null;
    renderPendientes();
  }));
}

// Aviso que desaparece solo, sin bloquear la pantalla como un alert.
function mostrarAvisoBreve(texto) {
  let el = document.getElementById("aviso-breve");
  if (!el) {
    el = document.createElement("div");
    el.id = "aviso-breve";
    el.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#15803d;color:#fff;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:9999;max-width:90vw;text-align:center";
    document.body.appendChild(el);
  }
  el.textContent = texto;
  el.style.display = "block";
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = "none"; }, 5000);
}

let pedidoFabricaSeleccion = new Set();
function renderPendientes() {
  const busquedaReferencia = document.getElementById("pendientes-referencia-search").value.trim().toLowerCase();
  const busquedaPedido = document.getElementById("pendientes-pedido-search").value.trim().toLowerCase();
  // Filtro por SKU en Luso/New (Jennifer, 2026-09-22): cuando llega la
  // mercancía de fábrica, necesita encontrar rápido los pedidos pendientes
  // de ese modelo+medida exactos — el SKU ya es prefijo+talla pegados
  // (ver skuDePendiente), así que un único cuadro de texto sirve para
  // filtrar por modelo solo, por medida sola, o por los dos juntos.
  const busquedaSku = document.getElementById("pendientes-sku-search").value.trim().toLowerCase();
  const ocultarRecibidos = document.getElementById("pendientes-ocultar-recibidos").checked;
  const mostrarCancelados = document.getElementById("pendientes-mostrar-cancelados").checked;
  renderRevision();
  const pendientes = backorders.filter(b => {
    if (b.estado !== "pendiente" && !(mostrarCancelados && b.estado === "cancelado")) return false;
    if (b.revision && b.estado === "pendiente") return false; // en su propio recuadro, no se puede pedir todavía
    if (ocultarRecibidos && b.recibidoFabrica) return false;
    if (busquedaReferencia && !(b.referencia || "").toLowerCase().includes(busquedaReferencia)) return false;
    if (busquedaSku && !skuDePendiente(b).toLowerCase().includes(busquedaSku)) return false;
    // El buscador de "Nº de pedido" asumía siempre el formato BEZEN+número
    // de Shopify — un pedido de marketplace (Carrefour/Maison/Worten) tiene
    // su propia referencia real (ej. "1106707668-A"), que no encaja ahí si
    // se busca tal cual como se ve en su propia tabla (Jennifer, 2026-09-21,
    // caso real: buscaba "1106707668-A" en Luso y no salía, aunque el
    // pendiente sí estaba creado). Se comprueba también contra orderRef.
    // refLabel(b) ya cubre BEZEN+número, la referencia real de marketplace,
    // Y el prefijo "REP" de una reposición (Jennifer, 2026-09-21) — buscar
    // solo bezen+número/orderRef no encontraba "REP..." al escribirlo.
    // Con el número final incluido (Jennifer, 2026-09-30: buscaba
    // "BEZEN121022" y no salía, solo con "BEZEN12102"), y admitiendo FPK/FUR
    // delante, tal como se ve en el selector de envío.
    if (busquedaPedido && !(refLabel(b) + (b.refSuffix || "")).toLowerCase().includes(busquedaPedido.replace(/^(fpk|fur)(?=bezen|rep)/, ""))) return false;
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
  // En Polival la tapicería siempre sale por FUR (nunca hay colchón de pack
  // ahí, eso va en Luso/New), así que esta columna no aporta nada — Jennifer
  // pidió quitarla en esa pestaña.
  const showFurFpkCol = currentProveedorFilter !== "polival";
  document.getElementById("pendientes-furfpk-head").style.display = showFurFpkCol ? "" : "none";
  document.getElementById("pendientes-furfpk-filter").style.display = showFurFpkCol ? "" : "none";
  // Columna SKU (Jennifer, 2026-09-21): solo tiene sentido en Luso/New
  // (colchones), no en Polival, donde ya se ve el modelo + color + tapa +
  // tirador con todo el detalle de fabricación.
  const showSkuCol = ["luso", "new"].includes(currentProveedorFilter);
  document.getElementById("pendientes-sku-head").style.display = showSkuCol ? "" : "none";
  document.getElementById("pendientes-sku-filter").style.display = showSkuCol ? "" : "none";
  // Coste de tarifa (Jennifer, 2026-09-30), también solo en Luso/New.
  document.getElementById("pendientes-coste-head").style.display = showSkuCol ? "" : "none";
  document.getElementById("pendientes-coste-filter").style.display = showSkuCol ? "" : "none";
  if (showSkuCol) cargarCostesTarifa(pendientes);

  // Varios artículos del mismo pedido se agrupan visualmente en un mismo
  // recuadro (Jennifer, 2026-08-25) — cada uno sigue en su fila (para
  // poder editarlos por separado) pero con un borde que los rodea juntos.
  // En Polival, Jennifer selecciona los pedidos más recientes para armar el
  // pedido a fábrica, así que prefiere verlos arriba (2026-09-16). El resto
  // de pestañas se quedan como estaban (más antiguo arriba). Se ordena por
  // FECHA real (parseFechaGenerica), no por orderNumber — un orderNumber de
  // marketplace no es un correlativo cronológico y puede colar un pedido
  // antiguo por delante de uno de Shopify mucho más reciente (o al revés).
  const pendientesOrdenadas = currentProveedorFilter === "polival"
    ? [...pendientes].sort((a, b) => parseFechaGenerica(b.fecha) - parseFechaGenerica(a.fecha))
    : [...pendientes].sort((a, b) => parseFechaGenerica(a.fecha) - parseFechaGenerica(b.fecha));
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
    // Colchón SUELTO (no pack) cuyo pedido también lleva tapicería aparte
    // (Jennifer, 2026-09-25): misma decisión que ya existía para el colchón
    // de un pack (¿junto con Furniture o independiente por SEUR?), ahora
    // también disponible aquí — antes un colchón suelto iba "siempre por
    // SEUR" sin poder elegir. Reusa el mismo campo/selector/ruta (tipoEnvio),
    // sin inventar un mecanismo nuevo.
    const esColchonSueltoConTapiceria = b.tipo === "colchon" && !b.esPack && ordenTieneTapiceria(b.orderNumber);
    const mostrarSelectorEnvio = esPackColchon || esColchonSueltoConTapiceria;
    // Colchón suelto que sale por Furniture (Jennifer, 2026-09-30): sin
    // tapicería no hay nada que elegir, pero se ve la referencia FUR.
    const tipoEnvioSelect = mostrarSelectorEnvio
      ? \`<select class="tipo-envio-select" data-id="\${b.id}">
           <option value="FPK"\${b.tipoEnvio === "FPK" ? " selected" : ""}>FPK\${refLabel(b)}\${b.refSuffix || ""} (independiente)</option>
           <option value="FUR"\${b.tipoEnvio === "FUR" ? " selected" : ""}>FUR\${refLabel(b)}\${b.refSuffix || ""} (junto)</option>
         </select>\`
      : (b.tipo === "colchon" && b.tipoEnvio === "FUR" ? \`<strong>FUR\${refLabel(b)}\${b.refSuffix || ""}</strong> (Furniture)\` : "");
    // Estado de la tapicería de este mismo pedido en Furniture (Jennifer,
    // 2026-08-27, ampliado 2026-09-25): antes solo avisaba cuando la
    // tapicería YA había salido con el colchón todavía marcado FPK aquí
    // (para detectar un FPK que se quedó descolgado). Jennifer pidió
    // también lo contrario — verlo desde Luso/New cuando la tapicería
    // TODAVÍA no ha salido, para poder decidir si esperar y mandarlo junto
    // (FUR) o dejarlo independiente (FPK) sin tener que irse a mirar
    // Logística > Furniture aparte (casos reales BEZEN12225, BEZEN12173).
    // Se cubren los 3 estados posibles: ya enviada (carga cerrada),
    // programada pero sin enviar todavía (carga abierta), o ni siquiera
    // programada en ninguna carga (sin cargaId).
    const pedidoDelColchon = mostrarSelectorEnvio ? allOrders.find(o => o.orderNumber === b.orderNumber) : null;
    const cargaDelColchon = pedidoDelColchon?.cargaId ? allCargas.find(c => c.id === pedidoDelColchon.cargaId) : null;
    // Pedidos del sistema antiguo (Jennifer, 2026-09-30, BEZEN12137): la
    // tapicería salió sin pasar por una carga de aquí — cuenta como enviada
    // si ya tiene seguimiento de Furniture o está marcada a mano.
    const seguimientoFur = pedidoDelColchon && (pedidoDelColchon.furnitureTracking || []).filter(t => t.estado);
    const tapiceriaYaEnviada = !cargaDelColchon && pedidoDelColchon && (pedidoDelColchon.tapiceriaEnviada || (seguimientoFur && seguimientoFur.length));
    const furnitureEstadoTag = !mostrarSelectorEnvio ? ""
      : tapiceriaYaEnviada
      ? \`<span class="furniture-ya-salio-tag">ℹ Tapicería ya enviada\${seguimientoFur && seguimientoFur.length ? " (" + seguimientoFur.map(t => t.albaran + ": " + t.estado).join(", ") + ")" : ""}</span>\`
      : cargaDelColchon?.estado === "cerrada"
      ? \`<span class="furniture-ya-salio-tag">ℹ Furniture de este pedido ya salió (\${new Date(cargaDelColchon.fechaCierre).toLocaleDateString("es-ES")})</span>\`
      : cargaDelColchon?.estado === "abierta"
      ? \`<span class="furniture-pendiente-tag">⏳ Tapicería en carga de Furniture del \${new Date(cargaDelColchon.fecha + "T00:00:00Z").toLocaleDateString("es-ES")}, todavía sin enviar</span>\`
      : \`<span class="furniture-pendiente-tag">⏳ Tapicería sin programar todavía en ninguna carga de Furniture</span>\`;
    // En "Pendiente de decisión" se puede corregir directamente lo que
    // aplique (FUR/FPK si es un colchón de pack) y además responder a la
    // pregunta de texto (ej. confirmar qué artículo era del catálogo).
    const referenciaCell = isDecisionTab
      ? \`\${tipoEnvioSelect}\${furnitureEstadoTag}<button type="button" class="responder-btn" data-order="\${b.orderNumber}">Responder dudas</button>\`
      : (tipoEnvioSelect ? tipoEnvioSelect + furnitureEstadoTag : "—");
    const fechaCell = !showCamionCol
      ? ""
      : mostrarSelectorEnvio
      ? \`<td><input type="date" class="fecha-camion-input" data-id="\${b.id}" value="\${b.fechaEstimadaLlegada ? b.fechaEstimadaLlegada.slice(0, 10) : ""}"></td>\`
      : "<td>—</td>";
    // Un pedido cancelado (Jennifer, 2026-08-26) se queda visible en rojo
    // para no perder el rastro, pero no se puede seleccionar para pedir a
    // fábrica.
    const pedidoCancelado = !!allOrders.find(o => o.orderNumber === b.orderNumber)?.cancelado;
    // Canapé de 160 comprado en GEMELOS (Jennifer, 2026-09-28): hasta que
    // ella confirme GEMELOS o PARTIDO no se puede pedir a fábrica.
    const faltaFormato = b.necesitaFormato160 && !b.formato160;
    const checkCell = showCheckbox
      ? \`<td><input type="checkbox" class="pendiente-check" data-id="\${b.id}"\${pedidoFabricaSeleccion.has(b.id) && !faltaFormato ? " checked" : ""}\${pedidoCancelado || faltaFormato ? " disabled" : ""}\${faltaFormato ? ' title="Falta elegir GEMELOS o PARTIDO"' : ""}></td>\`
      : "<td></td>";
    const formatoHtml = b.necesitaFormato160 || b.formato160
      ? \`<div class="formato160-box">\${faltaFormato ? '<span class="formato160-falta">⚠ Falta elegir: el cliente lo compró en GEMELOS</span><br>' : ""}<select class="formato160-select" data-id="\${escapeAttr(b.id)}"><option value="">¿Gemelos o partido?</option><option value="GEMELOS"\${b.formato160 === "GEMELOS" ? " selected" : ""}>GEMELOS</option><option value="PARTIDO"\${b.formato160 === "PARTIDO" ? " selected" : ""}>PARTIDO</option></select></div>\`
      : "";
    // Sin fecha a propósito (Jennifer, 2026-09-23): pendientes marcados
    // "pedido a fábrica" a mano por fuera del PDF normal, para distinguir
    // de los que sí llevan fecha real (ver markOrdered/sinFecha).
    const pedidoTag = b.pedidoGenerado
      ? \`<span class="pedido-generado-tag">✓ Pedido a fábrica\${b.fechaPedidoFabrica ? " " + new Date(b.fechaPedidoFabrica).toLocaleDateString("es-ES") : ""}</span>\`
      : "";
    const refPolivalCell = showRefPolivalCol
      ? \`<td><input type="text" class="referencia-input" data-id="\${b.id}" value="\${escapeAttr(b.referencia || "")}" placeholder="ref.">\${avisoRefDuplicada(b)}</td>\`
      : "";
    // Columna SKU en Luso/New (Jennifer, 2026-09-21) — mismo cálculo que ya
    // se usa para mostrar el SKU de los pedidos de marketplace: prefijo del
    // Catálogo + talla, buscando el producto por su stockModel.
    const skuCell = showSkuCol
      ? \`<td>\${skuDePendiente(b)}</td>\`
      : "";
    // Colchón suelto (sin pack) con proveedor Luso/New = pista de SEUR: al
    // llegar el camión no basta con marcarlo informativo (como hace
    // Furniture) — hay que descontar stock de verdad y meterlo en una carga
    // de SEUR con fecha (Jennifer, 2026-09-08). Ver resolveSeurBackorder.
    // Un gesto comercial (almohada de regalo) también sale por SEUR, nunca
    // por Furniture (Jennifer, 2026-09-22) — mismo botón, mismo flujo. Una
    // reposición de colchón por FURNITURE es la excepción: aunque sea tipo
    // "colchon", NO debe mostrar este botón — va por la línea independiente
    // de Furniture (con posible recogida), con el botón normal "Marcar
    // recibido" en su lugar. Un colchón suelto marcado FUR (Jennifer,
    // 2026-09-25: quiere poder mandarlo junto con la tapicería de su mismo
    // pedido) tampoco va por SEUR — se trata igual que el colchón de un pack
    // en FUR, "Marcar recibido" normal para que luego lo recoja
    // buildFurnitureExport en la carga de Furniture de ese pedido.
    // Un colchón transformado va abierto: siempre Furniture, nunca SEUR
    // (Jennifer, 2026-09-28).
    // Un colchón suelto marcado FUR (con o sin tapicería, Jennifer,
    // 2026-09-30) sale por Furniture: "Marcar recibido", no SEUR. Y al revés,
    // un colchón de pack en FPK sale independiente por SEUR (Jennifer,
    // 2026-09-30, BEZEN12117: la tapicería ya salió y los colchones "cuando
    // vengan saldrán por SEUR") — antes no tenía forma de prepararse para SEUR.
    const esColchonSeur = ((b.tipo === "colchon" && !b.transformadoDesde && b.tipoEnvio !== "FUR") && !(b.reposicion && b.agenciaReposicion === "FURNITURE")) || b.gestoComercial;
    // Sustituir por otro modelo que sí hay en stock (Jennifer, 2026-09-18):
    // vale tanto para colchón suelto como de pack, mientras siga
    // "pendiente" — una vez preparado o sustituido ya no aplica. El propio
    // modal decide si hace falta fecha de SEUR o si sale con la tapicería
    // (ver decideSustitucionViaSeur en inventory-store.js).
    const sustituirBtnHtml = b.tipo === "colchon" && b.estado === "pendiente"
      ? \`<button type="button" class="secondary sustituir-btn" data-id="\${b.id}" style="margin-left:4px">Sustituir modelo</button>\`
      : "";
    // Cancelado (Jennifer, 2026-09-29): se ve solo con "Mostrar cancelados",
    // en gris y sin botones.
    const esCancelado = b.estado === "cancelado";
    const resolverCell = esCancelado
      ? \`<span class="cancelado-tag">✕ CANCELADO\${b.fechaCancelado ? " " + new Date(b.fechaCancelado).toLocaleDateString("es-ES") : ""}</span>\`
      : esColchonSeur
      ? \`<button type="button" class="recibido-seur-btn" data-id="\${b.id}" title="Recibido: entra solo en la carga de SEUR (antes de las 15:00, la de hoy; después, la de mañana)">Marcar recibido</button> <button type="button" class="secondary resolver-seur-btn" data-id="\${b.id}" title="Recibido y programado para el día que pida el cliente">📅 Otro día</button>\${sustituirBtnHtml}\`
      : \`<button type="button" class="resolver-btn" data-id="\${b.id}">\${b.recibidoFabrica ? "✓ Recibido" + (b.fechaRecibido ? " — " + new Date(b.fechaRecibido).toLocaleDateString("es-ES") : "") : "Marcar recibido"}</button>\${reservaAlmacenHtml(b)}\${sustituirBtnHtml}\`;
    const cancelarBtnHtml = esCancelado ? "" : \`<div><button type="button" class="cancelar-pendiente-btn" data-cancelar-pendiente="\${escapeAttr(b.id)}" title="El cliente ha cancelado esta unidad: se quita del proveedor y queda cancelada en el pedido">✕ Cancelar</button> <button type="button" class="secondary revisar-pendiente-btn" data-revisar-pendiente="\${escapeAttr(b.id)}" title="Hay algo que ver antes de pedirlo: pasa al recuadro de revisión y no se puede pedir hasta marcarlo revisado">🔍 Revisar</button></div>\`;
    return \`
    <tr class="\${[b.pedidoGenerado ? "fila-pedido-generado" : "", pedidoCancelado || esCancelado ? "fila-cancelada" : "", esCancelado ? "fila-pendiente-cancelada" : "", grupoClass].filter(Boolean).join(" ")}">
      \${esCancelado ? "<td></td>" : checkCell}
      <td>\${refLabel(b)}\${b.refSuffix || ""}\${b.reposicion ? '<span class="reposicion-tag">REPOSICIÓN</span>' : ""}\${b.gestoComercial ? '<span class="gesto-comercial-tag">GESTO COMERCIAL</span>' : ""}\${valdemoroTag(allOrders.find(o => String(o.id) === String(b.orderId)))}\${preferenteTag(b)}</td>
      <td>\${escapeAttr(b.platform || "Shopify")}</td>
      <td>\${b.stockModel}\${pedidoTag}\${esCancelado ? "" : abiertoTagHtml(b)}\${esCancelado ? "" : formatoHtml}\${cancelarBtnHtml}</td>
      <td>\${b.color || "—"}</td>
      <td>\${b.talla}\${b.transformadoDesde ? '<br><span class="transformado-tag" title="Transformado de un colchón de otra medida que había en stock">Transformado desde ' + b.transformadoDesde + '</span>' : ""}</td>
      \${skuCell}
      <td>\${b.cantidad}</td>
      \${showSkuCol ? costeTarifaCell(b) : ""}
      \${refPolivalCell}
      <td><textarea class="fabricacion-input" data-id="\${b.id}" placeholder="cómo pedirlo a fábrica...">\${escapeAttr(b.mercanciaFabrica != null ? b.mercanciaFabrica : (b.nombreFabricacion || ""))}</textarea></td>
      <td>\${notasPedidoInput(b)}</td>
      <td>\${new Date(parseFechaGenerica(b.fecha)).toLocaleDateString("es-ES")}</td>
      \${showFurFpkCol ? \`<td>\${referenciaCell}</td>\` : ""}
      \${fechaCell}
      <td>\${resolverCell}</td>
    </tr>
  \`;
  }).join("");
  const nCancelados = pendientes.filter(b => b.estado === "cancelado").length;
  // Total de coste de tarifa de lo que se ve, y de lo que falta por pedir.
  let textoCoste = "";
  if (showSkuCol) {
    const activos = pendientes.filter(b => b.estado !== "cancelado");
    const todo = totalCostesTarifa(activos);
    const porPedir = totalCostesTarifa(activos.filter(b => !b.pedidoGenerado));
    textoCoste = " · Coste tarifa: " + formatoEuros(todo.total) + " (por pedir: " + formatoEuros(porPedir.total) + ")" + (todo.sinPrecio ? " · " + todo.sinPrecio + " sin precio en tarifa" : "");
  }
  document.getElementById("pendientes-count").textContent = (pendientes.length - nCancelados) + " artículos pendientes en " + PROVEEDORES_LABELS[currentProveedorFilter] + " (se cierran solos al marcarse el pedido como enviado)" + (nCancelados ? " · " + nCancelados + " cancelados a la vista" : "") + textoCoste;
  actualizarSeleccionUI();
  sincronizarTopFilaFiltro("pendientes-table", "pendientes-filter-row");
  ajustarScrollArriba();

  tbody.querySelectorAll(".pendiente-check").forEach(chk => {
    chk.addEventListener("change", () => {
      if (chk.checked) {
        // Aviso si ya se pidió antes (Jennifer, 2026-09-21: "si lo vuelvo a
        // seleccionar por error, quiero que me avises") — no bloquea, solo
        // pide confirmar, por si de verdad hace falta repetir el pedido.
        const b = backorders.find(x => x.id === chk.dataset.id);
        if (b && b.pedidoGenerado) {
          const fecha = b.fechaPedidoFabrica ? new Date(b.fechaPedidoFabrica).toLocaleDateString("es-ES") : "";
          const aviso = "Este " + b.stockModel + " (" + b.talla + ") ya se pidió a fábrica" + (fecha ? " el " + fecha : "") + ". ¿Seguro que quieres volver a seleccionarlo?";
          if (!confirm(aviso)) {
            chk.checked = false;
            return;
          }
        }
        pedidoFabricaSeleccion.add(chk.dataset.id);
      } else {
        pedidoFabricaSeleccion.delete(chk.dataset.id);
      }
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
  tbody.querySelectorAll(".resolver-seur-btn").forEach(btn => {
    btn.addEventListener("click", () => abrirModalFechaSeur(btn.dataset.id));
  });
  // Colchón que va solo: al marcarlo recibido entra en la próxima carga de
  // SEUR (Jennifer, 2026-09-30).
  tbody.querySelectorAll(".recibido-seur-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(btn.dataset.id) + "/resolver-seur", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fecha: "auto" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) { alert(data.error || "No se pudo preparar para SEUR."); btn.disabled = false; return; }
      if (data.carga) mostrarAvisoBreve("Recibido. Sale en la " + formatSeurCargaTitulo(data.carga) + " (se puede mover de día en SEUR).");
      loadPendientes();
    });
  });
  tbody.querySelectorAll(".sustituir-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const b = backorders.find(x => x.id === btn.dataset.id);
      if (b) abrirModalSustituir(b);
    });
  });
  tbody.querySelectorAll(".tipo-envio-select").forEach(sel => {
    sel.addEventListener("change", () => updateBackorderPlan(sel.dataset.id, { tipoEnvio: sel.value }));
  });
  tbody.querySelectorAll(".formato160-select").forEach(sel => {
    sel.addEventListener("change", async () => {
      if (!sel.value) return;
      const res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(sel.dataset.id) + "/formato160", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ formato: sel.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { alert(data.error || "No se ha podido guardar el formato."); return; }
      await loadOrders();
      loadPendientes();
    });
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
  document.getElementById("generar-pedido-excel-btn").disabled = n === 0;
  document.getElementById("marcar-ya-pedido-btn").disabled = n === 0;
  // En Luso/New, lo que costaría el pedido a fábrica seleccionado.
  let costeSel = "";
  if (n > 0 && ["luso", "new"].includes(currentProveedorFilter)) {
    const t = totalCostesTarifa(backorders.filter(b => pedidoFabricaSeleccion.has(b.id)));
    costeSel = " · " + formatoEuros(t.total) + (t.sinPrecio ? " (" + t.sinPrecio + " sin precio)" : "");
  }
  document.getElementById("seleccion-count").textContent = n > 0 ? n + " seleccionados" + costeSel : "";
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
  const res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(id) + "/referencia", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ referencia }),
  });
  const b = backorders.find(b => b.id === id);
  if (b) b.referencia = referencia;
  // "STOCK" manda la reserva al almacén con sus etiquetas (Jennifer, 2026-09-28).
  const data = await res.json().catch(() => ({}));
  if (data.avisoReserva) {
    if (data.avisoReserva.ok && b) b.reservaEnviada = new Date().toISOString();
    alert(data.avisoReserva.ok
      ? "Marcado como STOCK. Se ha enviado al almacén el email de reserva con sus etiquetas."
      : "Marcado como STOCK, pero NO se ha podido enviar la reserva al almacén (" + (data.avisoReserva.reason || "error") + "). Avísales tú, por favor.");
  }
}

// Nombre limpio de modelo + talla para un colchón suelto de Luso/New (a
// diferencia de canapés/cabeceros de Polival, no tiene "mercanciaFabrica"/
// "nombreFabricacion") — antes el PDF caía al nombre crudo del catálogo
// ("Colchón Muelles Ensacados | 30cm | Doble Cara | Zen Nirvana Gran
// Hotel"), poco práctico para pedir por teléfono/email. El modelo es el
// último trozo del nombre del catálogo (el mismo patrón que ya usa
// findByTitleFallback para leer el nombre real del modelo).
function modeloConTalla(b) {
  const partes = (b.stockModel || "").split("|").map(s => s.trim()).filter(Boolean);
  const modelo = (partes[partes.length - 1] || b.stockModel || "").toUpperCase();
  return modelo + " " + b.talla;
}
// Jennifer, 2026-09-21, caso real (pedido 1106707668-A): formato de una
// sola línea "MODELO TALLA - N UNIDAD(ES)" — usado como último recurso si
// alguna vez hiciera falta un texto de una sola celda (ver
// formatMercanciaSinReceta); la tabla real de Luso/New ahora usa columnas
// separadas "Modelo"/"Cantidad" en vez de esto (ver generar-pedido-btn).
function formatMercanciaSinReceta(b) {
  const unidad = (b.cantidad || 1) > 1 ? "UNIDADES" : "UNIDAD";
  return modeloConTalla(b) + " - " + (b.cantidad || 1) + " " + unidad;
}
// Cabecera + filas del pedido a fábrica, compartidas por el PDF y el Excel
// (Jennifer, 2026-09-28: el PDF no se puede editar si algo sale mal, quiere
// también un Excel editable con el mismo contenido).
function filasPedidoFabrica(seleccionados) {
  // Luso/New (colchones sueltos, sin referencia de Polival): tabla propia
  // de "Modelo" + "Cantidad", sin columna Referencia — Jennifer,
  // 2026-09-21: "no necesito que aparezca la columna referencia". Polival
  // sigue con Referencia + el texto completo de fabricación, que sí lo
  // necesita (modelo/medida/color/tapa/tirador).
  if (currentProveedorFilter === "polival") {
    // Una fila por ARTÍCULO, con su referencia a la izquierda (Jennifer,
    // 2026-09-28: con "N001FUR / N002FUR" en una sola celda no se veía qué
    // referencia iba con cada artículo). Los artículos del mismo pedido van
    // seguidos (antes, 2026-08-25, compartían recuadro) — grupoDeFila
    // permite al PDF sombrear cada pedido por igual.
    const grupos = new Map();
    seleccionados.forEach(b => {
      if (!grupos.has(b.orderNumber)) grupos.set(b.orderNumber, []);
      grupos.get(b.orderNumber).push(b);
    });
    const filas = [];
    const grupoDeFila = [];
    // Qué líneas de cada fila van en negrita y rojo: "N UNIDADES" (Jennifer,
    // 2026-09-28) y las extras de tapa — TAPA PARTIDA / TAPA REFORZADA / SIN
    // TAPA (Jennifer, 2026-09-30: "había que ponerlo en negrita y color rojo
    // para que llamara la atención").
    const resaltadas = [];
    // Los pedidos PREFERENTES (seQura) van primero y con "PREFERENTE" en
    // rojo como primera línea de cada artículo.
    const gruposOrdenados = [...grupos.values()].sort((a, b) => (a.some(esPreferenteSequra) ? 0 : 1) - (b.some(esPreferenteSequra) ? 0 : 1));
    gruposOrdenados.forEach((items, g) => {
      items.forEach(b => {
        // Producto primero y referencia a la DERECHA (Jennifer, 2026-09-28:
        // "la referencia siempre tiene que ir en la parte de la derecha").
        // El texto de fabricación no lleva la cantidad (Jennifer, 2026-09-28,
        // caso BEZEN12239: 2 almohadas salían como una) — se añade si hay
        // más de una unidad. formatMercanciaSinReceta ya la incluye.
        const cantidad = b.cantidad || 1;
        const texto = b.mercanciaFabrica || b.nombreFabricacion;
        // Cada dato en su línea (MODELO / MEDIDA / COLOR / TAPA / TIRADOR /
        // EXTRA...) para que Polival lo lea más ordenado (Jennifer,
        // 2026-09-29). Solo en el PDF/Excel: el texto guardado no cambia.
        const mercancia = ((esPreferenteSequra(b) ? "PREFERENTE · " : "") + (texto
          ? (cantidad > 1 ? texto + " · " + cantidad + " UNIDADES" : texto)
          : formatMercanciaSinReceta(b))).split(" · ").join("\\n");
        filas.push([mercancia, b.referencia || "—"]);
        grupoDeFila.push(g);
        resaltadas.push(mercancia.split("\\n").map(l => /^PREFERENTE$|TAPA PARTIDA|TAPA REFORZADA|SIN TAPA|\\d+ UNIDADES$/i.test(l)));
      });
    });
    return { head: ["Mercancía para pedir a fábrica", "Referencia"], filas, grupoDeFila, resaltadas };
  }
  // Agrupado por MODELO+TALLA en vez de por pedido (Jennifer, 2026-09-21:
  // "si varios de esos pedidos son del mismo modelo, ¿habría opción de
  // que lo agrupes?") — al proveedor le da igual de qué cliente venga
  // cada colchón, así que se suman las cantidades en una sola línea.
  const grupos = new Map();
  seleccionados.forEach(b => {
    const clave = modeloConTalla(b);
    if (!grupos.has(clave)) grupos.set(clave, 0);
    grupos.set(clave, grupos.get(clave) + (b.cantidad || 1));
  });
  const filas = [...grupos.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([modelo, cantidad]) => [modelo, cantidad]);
  return { head: ["Modelo", "Cantidad"], filas };
}

function descargarPedidoFabricaPdf(seleccionados) {
  const { head, filas, grupoDeFila, resaltadas } = filasPedidoFabrica(seleccionados);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  // Sin el nombre del proveedor en el título (Jennifer, 2026-09-21: "no
  // quiero que ponga luso") — se mantiene genérico "Pedido a fábrica" para
  // cualquier proveedor.
  // Letra más grande (Jennifer, 2026-09-28: en Polival la veían muy pequeña).
  doc.setFontSize(17);
  doc.text("Pedido a fábrica", 14, 17);
  doc.setFontSize(12);
  doc.text(new Date().toLocaleDateString("es-ES"), 14, 24);

  if (currentProveedorFilter === "polival") {
    doc.autoTable({
      head: [head],
      body: filas,
      startY: 30,
      theme: "grid",
      styles: { fontSize: 13, cellPadding: 3.5, valign: "middle" },
      headStyles: { fillColor: [31, 138, 76], fontSize: 13 },
      columnStyles: { 1: { cellWidth: 45, fontStyle: "bold" } },
      // Mismo sombreado para todos los artículos de un mismo pedido,
      // alternando entre pedidos.
      didParseCell: data => {
        if (data.section === "body" && grupoDeFila[data.row.index] % 2 === 1) {
          data.cell.styles.fillColor = [234, 244, 238];
        }
      },
      // autoTable no admite estilos distintos dentro de una celda: si alguna
      // línea va resaltada, la celda se escribe a mano línea a línea (las
      // resaltadas en negrita y rojo, Jennifer, 2026-09-30).
      willDrawCell: data => {
        if (data.section !== "body" || data.column.index !== 0) return;
        const marcas = resaltadas[data.row.index];
        if (!marcas || !marcas.some(Boolean)) return;
        const cell = data.cell;
        const ancho = cell.width - cell.padding("left") - cell.padding("right");
        doc.setFontSize(cell.styles.fontSize);
        cell.lineasPropias = String(cell.raw).split("\\n").flatMap((l, n) => {
          doc.setFont(undefined, marcas[n] ? "bold" : "normal");
          return doc.splitTextToSize(l, ancho).map(t => ({ t, marcada: marcas[n] }));
        });
        doc.setFont(undefined, "normal");
        cell.text = [];
      },
      didDrawCell: data => {
        const lineas = data.cell.lineasPropias;
        if (!lineas) return;
        const cell = data.cell;
        const alto = cell.styles.fontSize * 1.15 / doc.internal.scaleFactor;
        let y = cell.y + (cell.height - lineas.length * alto) / 2 + (alto - cell.styles.fontSize / doc.internal.scaleFactor) / 2;
        doc.setFontSize(cell.styles.fontSize);
        for (const { t, marcada } of lineas) {
          doc.setFont(undefined, marcada ? "bold" : "normal");
          doc.setTextColor(marcada ? 200 : 20, 0, 0);
          if (!marcada) doc.setTextColor(20, 20, 20);
          doc.text(t, cell.x + cell.padding("left"), y, { baseline: "top" });
          y += alto;
        }
        doc.setFont(undefined, "normal");
        doc.setTextColor(20, 20, 20);
      },
    });
  } else {
    doc.autoTable({
      head: [head],
      body: filas.map(([modelo, cantidad]) => [modelo, String(cantidad)]),
      startY: 30,
      // Cuadrícula completa (borde en todas las celdas), a petición de
      // Jennifer, 2026-09-21 ("hazlo en modo tabla") — el tema por defecto
      // de autoTable solo raya filas alternas, no pone borde por celda.
      theme: "grid",
      styles: { fontSize: 13, cellPadding: 3.5, valign: "middle" },
      headStyles: { fillColor: [31, 138, 76], fontSize: 13 },
      columnStyles: { 1: { cellWidth: 34, halign: "center" } },
    });
  }

  doc.save("pedido-" + currentProveedorFilter + "-" + new Date().toISOString().slice(0, 10) + ".pdf");
}

// ExcelJS solo se carga al descargar el pedido a fábrica en Excel: SheetJS
// (el XLSX que ya usa la página) no escribe formato de celda, y aquí hace
// falta ajuste de texto, bordes y configuración de impresión.
let excelJsPromesa = null;
function cargarExcelJs() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!excelJsPromesa) {
    excelJsPromesa = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
      s.onload = () => resolve(window.ExcelJS);
      s.onerror = () => { excelJsPromesa = null; reject(new Error("No se pudo cargar ExcelJS")); };
      document.head.appendChild(s);
    });
  }
  return excelJsPromesa;
}

// Excel listo para imprimir (Jennifer, 2026-09-28): el texto largo pasa a
// varias líneas dentro de la celda y todo el ancho cabe en un A4 vertical.
async function descargarPedidoFabricaExcel(seleccionados) {
  const { head, filas, grupoDeFila, resaltadas } = filasPedidoFabrica(seleccionados);
  const ExcelJS = await cargarExcelJs();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pedido a fábrica", {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  const esPolival = currentProveedorFilter === "polival";
  // Anchos pensados para que la suma quepa en un A4 vertical sin reducir la letra.
  const anchos = esPolival ? [70, 16] : [70, 12];
  ws.columns = anchos.map(width => ({ width }));

  ws.getCell("A1").value = "Pedido a fábrica";
  // Letra más grande (Jennifer, 2026-09-28: en Polival la veían muy pequeña).
  const TAM = 14;
  ws.getCell("A1").font = { bold: true, size: 18 };
  ws.getCell("A2").value = new Date().toLocaleDateString("es-ES");
  ws.getCell("A2").font = { size: 12 };
  ws.addRow([]);

  const borde = { style: "thin", color: { argb: "FF999999" } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };

  const cabecera = ws.addRow(head);
  cabecera.eachCell(c => {
    c.font = { bold: true, size: TAM, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F8A4C" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = bordes;
  });
  // La cabecera se repite arriba en cada página impresa.
  ws.pageSetup.printTitlesRow = cabecera.number + ":" + cabecera.number;

  filas.forEach((fila, i) => {
    const row = ws.addRow(fila);
    // Alto calculado a mano: Excel no reajusta solo la altura de una fila
    // con texto ajustado al abrir un fichero generado.
    const lineas = Math.max(...fila.map((v, col) => String(v).split("\\n").reduce(
      (n, trozo) => n + Math.max(1, Math.ceil(trozo.length / ((anchos[col] - 2) * 11 / TAM))), 0)));
    row.height = Math.max(1, lineas) * (TAM * 1.35) + 6;
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "center", wrapText: true };
      c.border = bordes;
      c.font = { size: TAM, bold: esPolival && col === 2 };
      // Líneas resaltadas (unidades y extras de tapa) en negrita y rojo, el
      // resto del texto normal.
      const marcas = resaltadas ? resaltadas[i] : null;
      if (col === 1 && marcas && marcas.some(Boolean)) {
        const lineasTexto = String(c.value).split("\\n");
        c.value = { richText: lineasTexto.map((l, n) => ({
          text: l + (n < lineasTexto.length - 1 ? "\\n" : ""),
          font: marcas[n] ? { size: TAM, bold: true, color: { argb: "FFC80000" } } : { size: TAM },
        })) };
      }
      if (grupoDeFila && grupoDeFila[i] % 2 === 1) {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF4EE" } };
      }
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pedido-" + currentProveedorFilter + "-" + new Date().toISOString().slice(0, 10) + ".xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function generarPedidoFabrica(formato) {
  const seleccionados = backorders.filter(b => pedidoFabricaSeleccion.has(b.id));
  if (!seleccionados.length) return;
  const sinFormato = seleccionados.filter(b => b.necesitaFormato160 && !b.formato160);
  if (sinFormato.length) {
    alert("Falta elegir GEMELOS o PARTIDO en: " + sinFormato.map(b => refLabel(b)).join(", ") + ". Elígelo antes de pedirlo a fábrica.");
    return;
  }

  if (formato === "excel") {
    // Si falla la descarga, no se marcan como pedidos a fábrica.
    try {
      await descargarPedidoFabricaExcel(seleccionados);
    } catch (err) {
      alert("No se pudo generar el Excel: " + err.message);
      return;
    }
  } else {
    descargarPedidoFabricaPdf(seleccionados);
  }

  await fetch("/api/inventario/pendientes/mark-ordered", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: seleccionados.map(b => b.id) }),
  });
  pedidoFabricaSeleccion.clear();
  loadPendientes();
}
document.getElementById("generar-pedido-btn").addEventListener("click", () => generarPedidoFabrica("pdf"));
document.getElementById("generar-pedido-excel-btn").addEventListener("click", () => generarPedidoFabrica("excel"));
// Ya pedido a fábrica por otra vía (Jennifer, 2026-09-28): se marca como
// pedido sin generar PDF/Excel, para que no se vuelva a pedir.
document.getElementById("marcar-ya-pedido-btn").addEventListener("click", async () => {
  const seleccionados = backorders.filter(b => pedidoFabricaSeleccion.has(b.id));
  if (!seleccionados.length) return;
  const refs = seleccionados.map(b => b.referencia || refLabel(b)).join(", ");
  if (!confirm("¿Marcar como ya pedidos a fábrica (" + seleccionados.length + "): " + refs + "?\\n\\nNo se descarga nada.")) return;
  await fetch("/api/inventario/pendientes/mark-ordered", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: seleccionados.map(b => b.id) }),
  });
  pedidoFabricaSeleccion.clear();
  loadPendientes();
});

async function resolverPendiente(id) {
  const before = backorders.find(x => x.id === id);
  const orderId = before ? before.orderId : null;
  const res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(id) + "/resolver", { method: "POST" });
  const entry = await res.json();
  avisarReservaAutomatica(entry);
  await loadPendientes();
  if (orderId != null && entry && entry.recibidoFabrica) await checkAutoAddCarga(orderId);
}

// Subida automática a la carga (Jennifer, 2026-08-26): en cuanto TODOS los
// artículos del pedido (uno o varios) están marcados como recibidos, sube
// solo a la próxima carga — salvo que el pedido tenga una nota, en cuyo caso
// se pregunta primero (la nota puede indicar una fecha de entrega concreta
// que no encaje con la próxima carga). Compartida entre los dos sitios donde
// se puede marcar un artículo como recibido — la casilla de Furniture y el
// botón "Marcar recibido" de Proveedores pendientes (Jennifer, 2026-09-18:
// "los he marcado como recibidos pero no se ponen automáticamente en
// Furniture para las cargas" — solo estaba conectada en un sitio).
async function checkAutoAddCarga(orderId) {
  const order = allOrders.find(o => o.id === orderId);
  if (!order || order.cargaId || order.cancelado) return;
  // Envío conjunto (Jennifer, 2026-09-28): el grupo entero espera hasta que
  // TODOS sus pedidos estén recibidos, y entonces sube junto a la carga.
  const grupo = pedidosDelGrupo(order).filter(o => !o.cancelado);
  const items = grupo.flatMap(o => backordersPorPedido(o.id));
  // Un colchón de pack marcado FPK sale independiente por SEUR, no junto con
  // la tapicería — no debe bloquear que el resto del pedido (tapicería,
  // almohadas...) suba solo a la carga de Furniture en cuanto esté listo.
  const esFpkPendiente = i => i.esPack && i.tipo === "colchon" && i.tipoEnvio === "FPK";
  const itemsFurniture = items.filter(i => !esFpkPendiente(i));
  const todosRecibidos = itemsFurniture.length > 0 && itemsFurniture.every(i => i.recibidoFabrica);
  const colchonFpkPendiente = items.some(i => esFpkPendiente(i) && i.estado === "pendiente");
  if (!todosRecibidos) return;
  // Retenido por el cliente (Jennifer, 2026-09-30): no sube solo salvo que
  // ya le toque por fecha.
  if (retencionDe(order) && !retencionCumplida(order)) return;
  const cargaRetencion = cargaParaRetencion(order);
  if (retencionDe(order)) await guardarRetencion([order.id], null);
  const notaTexto = grupo.map(o => (o.notas || "").trim()).filter(Boolean).join(" / ");
  const confirmar = notaTexto
    ? confirm(grupo.map(refLabel).join(" + ") + ' tiene una nota: "' + notaTexto + '". ¿Añadirlo a la próxima carga igualmente?')
    : true;
  if (confirmar) {
    await anadirPedidosACarga(grupo.map(o => o.id), cargaRetencion && cargaRetencion.id);
  } else if (!order.paraTenerEnCuenta) {
    // Si Jennifer dice que NO lo añada (ej. el cliente pidió recibirlo más
    // adelante), que no se pierda de vista entre el resto de pendientes —
    // se marca solo "para tener en cuenta", mismo recuadro que ya usan para
    // avisos puntuales.
    await fetch("/api/pedidos/shopify/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: order.id, paraTenerEnCuenta: true }),
    });
    order.paraTenerEnCuenta = true;
  }
  // Aunque la tapicería ya suba a su carga, si a este mismo pedido le sigue
  // quedando un colchón de pack pendiente en Luso/New con FPK, que no se
  // pierda de vista — se marca "para tener en cuenta" también.
  if (colchonFpkPendiente && !order.paraTenerEnCuenta) {
    await fetch("/api/pedidos/shopify/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: order.id, paraTenerEnCuenta: true }),
    });
    order.paraTenerEnCuenta = true;
  }
}

async function updateBackorderPlan(id, patch) {
  await fetch("/api/inventario/pendientes/" + encodeURIComponent(id) + "/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  loadPendientes();
}

const HISTORIAL_ORIGEN_LABELS = { manual: "Manual", venta: "Venta", envio: "Envío", camion: "Camión (proveedor)", sustitucion: "Sustitución", transformacion: "Transformación" };
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
    const detalle = m.origen === "manual"
      ? (m.usuario || "—")
      : (m.orderNumber ? refLabel(m) : "—");
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

// ---- Inventario > Pesos SEUR ----
let pesosSeur = [];
async function loadPesos() {
  const res = await fetch("/api/inventario/pesos");
  pesosSeur = await res.json();
  renderPesos();
}
function renderPesos() {
  const q = document.getElementById("pesos-search").value.trim().toUpperCase();
  const filtrados = q ? pesosSeur.filter(p => p.sku.includes(q)) : pesosSeur.slice(0, 100);
  document.getElementById("pesos-count").textContent = q
    ? filtrados.length + " resultados"
    : pesosSeur.length + " SKU en total (escribe para buscar; se muestran los primeros 100)";
  document.querySelector("#pesos-table tbody").innerHTML = filtrados.map(p => \`
    <tr>
      <td>\${p.sku}</td>
      <td><input type="number" step="0.1" min="0" class="peso-input" data-sku="\${escapeAttr(p.sku)}" value="\${p.peso != null ? p.peso : ""}"></td>
      <td>\${p.esManual ? "Manual" : "Por defecto (histórico)"}</td>
    </tr>
  \`).join("");
  document.querySelectorAll(".peso-input").forEach(inp => {
    inp.addEventListener("change", async () => {
      await fetch("/api/inventario/pesos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku: inp.dataset.sku, peso: inp.value }),
      });
      loadPesos();
    });
  });
}
document.getElementById("pesos-search").addEventListener("input", renderPesos);

// ---- Logística > Furniture ----
// Todo pedido con agencia FURNITURE (calculado ya en Pedidos/Proveedores)
// tiene que aparecer aquí, esté o no también esperando fabricarse en
// Polival/Luso/New — son dos listas independientes (qué hay que pedir a
// fábrica vs qué sale por esta agencia).
let cargaAbierta = null;
let furnitureSeleccion = new Set();
// Selección de reposiciones pendientes (Jennifer, 2026-09-21) — aparte de
// furnitureSeleccion porque son backorder.id, no order.id, y se añaden a
// la carga por su propia ruta independiente.
let reposicionSeleccion = new Set();
// Todas las cargas (abiertas y cerradas) — se necesita también fuera de
// Furniture, para avisar en Proveedores si el pedido de un colchón FPK ya
// salió por Furniture (Jennifer, 2026-08-27).
let allCargas = [];
async function loadCargas() {
  allCargas = await fetch("/api/cargas").then(r => r.json());
}

function referenciasPorPedido(orderId) {
  return backorders
    .filter(b => b.orderId === orderId && b.referencia)
    .map(b => b.referencia)
    .join(" / ");
}

function formatCargaTitulo(carga) {
  if (!carga) return "No hay carga abierta todavía";
  const fecha = new Date(carga.fecha + "T00:00:00");
  return "Carga " + carga.dia + " · " + fecha.toLocaleDateString("es-ES");
}

async function loadFurniture() {
  const [pendRes, cargasRes] = await Promise.all([
    fetch("/api/inventario/pendientes"),
    fetch("/api/cargas"),
  ]);
  backorders = await pendRes.json();
  allCargas = await cargasRes.json();
  elegirCargaFurniture();
  renderFurniture();
  if (await aplicarRetencionesCumplidas()) renderFurniture();
}

// Varias cargas de Furniture abiertas a la vez (Jennifer, 2026-09-30: las 2
// próximas de miércoles/viernes). cargaAbierta es la de la pestaña
// elegida: la tabla, descargar, listado, cerrar y "Añadir a la carga"
// trabajan con ella. Por defecto, la más próxima.
let cargaFurnitureElegidaId = null;
function cargasFurnitureAbiertas() {
  return allCargas.filter(c => (c.tipo || "furniture") === "furniture" && c.estado === "abierta").sort((a, b) => a.fecha.localeCompare(b.fecha));
}
function elegirCargaFurniture() {
  const abiertas = cargasFurnitureAbiertas();
  cargaAbierta = abiertas.find(c => c.id === cargaFurnitureElegidaId) || abiertas[0] || null;
  cargaFurnitureElegidaId = cargaAbierta ? cargaAbierta.id : null;
}
function pedidosEnCargaFurniture(cargaId) {
  return allOrders.filter(o => o.agencia === "FURNITURE" && o.cargaId === cargaId && !o.gestionadoExterno && !esMiembroSecundario(o)).length
    + backorders.filter(b => (b.envioAparte || b.reposicion) && b.cargaId === cargaId && (b.estado === "pendiente" || b.estado === "cubierto")).length;
}
function renderPestanasFurniture() {
  const abiertas = cargasFurnitureAbiertas();
  const cont = document.getElementById("furniture-cargas-tabs");
  // Carga con la fecha ya pasada y sin cerrar (Jennifer, 2026-10-01): aviso
  // arriba y su pestaña en rojo, para revisarla y cerrarla.
  const sinCerrar = abiertas.filter(c => c.fecha < hoyMadrid());
  cont.innerHTML = (sinCerrar.length
      ? '<div class="aviso-sin-cerrar" style="flex-basis:100%">⚠ <strong>Pendiente de cerrar:</strong> ' + sinCerrar.map(c => formatCargaTitulo(c) + " (" + pedidosEnCargaFurniture(c.id) + " pedidos)").join(", ") + ". Ábrela en su pestaña, revísala y pulsa «Cerrar carga» si ya salió.</div>"
      : "")
    + abiertas.map(c => '<button type="button" class="carga-tab' + (cargaAbierta && c.id === cargaAbierta.id ? " activa" : "") + (c.fecha < hoyMadrid() ? " vencida" : "") + '" data-carga-tab="' + c.id + '">'
    + (c.fecha < hoyMadrid() ? "⚠ " : "") + formatCargaTitulo(c) + ' · ' + pedidosEnCargaFurniture(c.id) + ' pedidos</button>').join("");
  cont.querySelectorAll("[data-carga-tab]").forEach(btn => btn.addEventListener("click", () => {
    cargaFurnitureElegidaId = btn.dataset.cargaTab;
    elegirCargaFurniture();
    renderFurniture();
  }));
}
// Desplegable "Mover a…" con las otras cargas de Furniture abiertas.
function moverFurnitureHtml(attrs) {
  const otras = cargasFurnitureAbiertas().filter(c => !cargaAbierta || c.id !== cargaAbierta.id);
  if (!otras.length) return "";
  return '<div class="mover-seur"><select class="mover-fur-destino">' + otras.map(c => '<option value="' + c.id + '">' + formatCargaTitulo(c) + '</option>').join("")
    + '</select><button type="button" class="secondary mover-fur-btn" ' + attrs + '>Mover</button></div>';
}

// Un pedido de Furniture puede tener varios artículos (ej. BEZEN12117:
// almohada + colchón + canapé de madera) que no llegan todos al almacén el
// mismo día — Jennifer necesita ir marcando cada uno según va llegando, sin
// salir de Furniture. Reutiliza el mismo "recibidoFabrica" que ya existe en
// Proveedores (mismo dato, dos sitios donde marcarlo).
// Nunca incluye reposiciones (Jennifer, 2026-09-21): tienen su propia línea
// y su propia carga independiente (ver reposicionRowCells/renderFurniture),
// así que no deben aparecer dentro de la fila del pedido original ni
// bloquear su auto-añadido a carga en checkAutoAddCarga.
function backordersPorPedido(orderId) {
  return backorders.filter(b => b.orderId === orderId && (b.estado === "pendiente" || b.estado === "cubierto") && !b.reposicion && !b.gestoComercial && !b.envioAparte);
}

// Envío conjunto (Jennifer, 2026-09-28): en Furniture el grupo es UNA sola
// línea, la del pedido principal, con los artículos de todos sus pedidos
// ("el colchón no aparece en la línea del pedido BEZEN12205"). Los demás
// pedidos del grupo no salen como línea propia mientras el principal siga
// pendiente de envío.
function esMiembroSecundario(o) {
  return !!o.grupoEnvio && o.grupoEnvio !== o.id
    && allOrders.some(p => p.id === o.grupoEnvio && p.shippingStatus !== "fulfilled");
}

// Aviso tras marcar recibido un colchón FUR que se reservó solo (ver la ruta
// /resolver en el servidor).
function avisarReservaAutomatica(entry) {
  if (!entry || !entry.avisoReserva) return;
  if (entry.avisoReserva.ok) mostrarAvisoBreve("Recibido y reservado: email de reserva enviado al almacén (" + refLabel(entry) + ").");
  else alert("Recibido, pero NO se ha podido mandar el email de reserva al almacén" + (entry.avisoReserva.reason ? " (" + entry.avisoReserva.reason + ")" : "") + ". Avísales a mano o usa el botón «Reservar en almacén».");
}

// Reserva en almacén (Jennifer, 2026-10-01): artículo recibido de un pedido
// de Furniture que todavía espera a otra cosa — botón para mandar el email
// con sus etiquetas, o la fecha si ya se mandó. Lo decide ella en cada caso
// (BEZEN12211 no la llevó porque salía al día siguiente).
function reservaAlmacenHtml(b) {
  if (!b || b.estado === "cancelado" || b.estado === "servido") return "";
  // Si ya se mandó se ve SIEMPRE, esté o no marcado como recibido
  // (Jennifer, 2026-10-02: para no mandarlo por duplicado).
  if (b.reservaEnviada) return ' <span class="reserva-tag" title="Email de reserva YA enviado al almacén — no hace falta volver a mandarlo">✅ YA RESERVADO EN ALMACÉN · ' + new Date(b.reservaEnviada).toLocaleDateString("es-ES") + "</span>";
  if (!b.recibidoFabrica) return "";
  const o = allOrders.find(x => String(x.id) === String(b.orderId));
  if (!o || o.agencia !== "FURNITURE") return "";
  const resto = backordersPorPedido(o.id).filter(x => x.id !== b.id && !(x.esPack && x.tipo === "colchon" && x.tipoEnvio === "FPK"));
  if (!resto.some(x => !x.recibidoFabrica)) return ""; // ya está todo: sale en la carga
  return ' <button type="button" class="secondary reservar-almacen-btn" data-reservar-almacen="' + escapeAttr(b.id) + '" title="Manda al almacén el email con las etiquetas de reserva para que lo aparten para este cliente">📦 Reservar en almacén</button>';
}
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-reservar-almacen]");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const b = backorders.find(x => x.id === btn.dataset.reservarAlmacen);
  if (!b || !confirm("¿Mandar al almacén el email de reserva de " + b.cantidad + "x " + b.stockModel + " " + b.talla + " (" + refLabel(b) + ")?")) return;
  btn.disabled = true;
  let res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(b.id) + "/reservar-almacen", { method: "POST" });
  let data = await res.json().catch(() => ({}));
  if (data.yaEnviada) {
    // Se mandó desde otra pantalla o de forma automática y esta aún no lo sabía.
    b.reservaEnviada = data.yaEnviada;
    if (!confirm("El email de reserva de este artículo YA se mandó al almacén el " + new Date(data.yaEnviada).toLocaleString("es-ES") + ".\\n\\n¿Seguro que quieres mandarlo OTRA VEZ?")) {
      if (document.getElementById("view-furniture").style.display !== "none") renderFurniture(); else renderPendientes();
      return;
    }
    res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(b.id) + "/reservar-almacen?forzar=1", { method: "POST" });
    data = await res.json().catch(() => ({}));
  }
  if (!res.ok || !data.ok) { alert("No se ha podido mandar el email de reserva" + (data.avisoReserva && data.avisoReserva.reason ? " (" + data.avisoReserva.reason + ")" : "") + ". Avisa al almacén a mano."); btn.disabled = false; return; }
  b.reservaEnviada = new Date().toISOString();
  mostrarAvisoBreve("Reserva enviada al almacén: " + refLabel(b));
  if (document.getElementById("view-furniture").style.display !== "none") renderFurniture(); else renderPendientes();
}, true);

// Entregas en Valdemoro (Jennifer, 2026-09-30: "cuando un pedido sea para
// entregar en Valdemoro por Furniture o por SEUR siempre me tendrás que
// avisar o poner una nota por si lo entregamos por nuestros medios").
// Por población o por código postal de Valdemoro (28340-28343): hay
// pedidos con población "Madrid" y CP de Valdemoro.
// Solo para los pedidos nuevos (Jennifer, 2026-09-30: los de Maison du Monde
// a Valdemoro son de prueba; "se los ponemos a los nuevos que vayan
// entrando a partir de ahora", más el cabecero pendiente de BEZEN12035).
// BEZEN12247 (29/09, pendiente por Furniture) entra por fecha.
const VALDEMORO_AVISO_DESDE = "2026-09-29";
const VALDEMORO_AVISO_TAMBIEN = [12035];
function esValdemoro(o) {
  if (!o) return false;
  const direccion = /valdemoro/i.test((o.city || "") + " " + (o.address || "") + " " + (o.furnitureAddress || "")) || /^2834[0-3]$/.test(String(o.postalCode || "").trim());
  if (!direccion) return false;
  if (VALDEMORO_AVISO_TAMBIEN.includes(o.orderNumber)) return true;
  const t = parseFechaGenerica(o.orderDate || o.createdAt);
  return !!t && t >= new Date(VALDEMORO_AVISO_DESDE + "T00:00:00").getTime();
}
// PREFERENTE (Jennifer, 2026-10-02): seQura no paga hasta que el pedido se
// marca como enviado, así que la tapicería de los pedidos pagados con
// seQura se pide a Polival como preferente para que la hagan antes.
function esPreferenteSequra(b) {
  if (!b || b.proveedor !== "POLIVAL") return false;
  const o = allOrders.find(x => String(x.id) === String(b.orderId));
  if (!o || o.paymentMethod !== "SEQURA") return false;
  return b.tipo === "tapiceria" || backorders.some(x => String(x.orderId) === String(b.orderId) && x.proveedor === "POLIVAL" && x.tipo === "tapiceria");
}
function preferenteTag(b) {
  return esPreferenteSequra(b) ? '<span class="preferente-tag" title="Pagado con seQura: no cobramos hasta enviarlo. Sale como PREFERENTE en el pedido a fábrica.">⚡ PREFERENTE (seQura)</span>' : "";
}
function valdemoroTag(o) {
  return esValdemoro(o) ? '<span class="valdemoro-tag" title="Entrega en Valdemoro: ¿lo llevamos nosotros en vez de Furniture/SEUR?">📍 VALDEMORO — ¿lo entregamos nosotros?</span>' : "";
}

// Misma referencia de fábrica en pedidos distintos (Jennifer, 2026-09-30:
// MB251FUR se puso por error a BEZEN12188 y BEZEN12178 — "estaría bien poner
// una señal de advertencia para que lo vea cuando venga esa referencia de
// fábrica"). Dentro del mismo pedido (dos canapés iguales) no avisa.
function avisoRefDuplicada(b) {
  const ref = (b.referencia || "").trim().toUpperCase();
  if (!ref) return "";
  const otros = backorders.filter(x => x.id !== b.id && x.orderNumber !== b.orderNumber
    && (x.referencia || "").trim().toUpperCase() === ref && x.estado !== "cancelado" && x.estado !== "servido");
  if (!otros.length) return "";
  const texto = otros.map(x => refLabel(x) + (x.refSuffix || "") + " (" + x.talla + (x.color ? " " + x.color : "") + ")").join(", ");
  return ' <span class="ref-duplicada" title="Dos pedidos distintos comparten esta referencia de fábrica: al llegar, mira la medida para saber de cuál es">⚠ ' + escapeAttr(ref) + " también en " + escapeAttr(texto) + "</span>";
}

function furnitureRowCells(o) {
  const grupo = pedidosDelGrupo(o);
  const items = grupo.flatMap(p => backordersPorPedido(p.id));
  const refDeOtroPedido = b => b.orderId !== o.id ? '<span class="grupo-envio-item-ref">' + refLabel(allOrders.find(p => p.id === b.orderId) || {}) + '</span> ' : "";
  const productoGrupo = grupo.length > 1
    ? grupo.map(p => (p.id !== o.id ? '<span class="grupo-envio-item-ref">' + refLabel(p) + '</span> ' : "") + p.product).join("<br>")
    : o.product;
  const serviciosGrupo = grupo.map(p => p.services).filter(Boolean).join(" · ");
  const itemsHtml = items.length
    ? items.map(b => {
        // Colchón marcado FPK (Jennifer, 2026-08-27, ampliado 2026-09-25 a
        // colchón suelto además de pack): por defecto sale independiente
        // por SEUR, sin esperar a la tapicería — pero se sigue mostrando
        // aquí (en vez de ocultarlo) para que quede claro que ese pedido lo
        // tiene, por si al final coincide con la tapicería y le interesa
        // mandarlo junto en la carga.
        const esFpk = b.tipo === "colchon" && b.tipoEnvio === "FPK";
        return \`
        <label class="furniture-item-check\${esFpk ? " furniture-item-fpk" : ""}">
          <input type="checkbox" class="item-recibido-check" data-id="\${b.id}"\${b.recibidoFabrica ? " checked" : ""}>
          \${refDeOtroPedido(b)}\${b.referencia ? b.referencia + avisoRefDuplicada(b) + " — " : ""}\${b.cantidad}x \${b.stockModel}\${b.talla ? " (" + b.talla + ")" : ""}\${esFpk ? ' <span class="fpk-tag">FPK · en ' + b.proveedor + ', sale independiente</span>' : ""}\${b.transformadoDesde ? ' <span class="transformado-tag" title="Transformado de un ' + b.transformadoDesde + ' que había en stock">🔧 Subido a transformar (desde ' + b.transformadoDesde + (b.fechaTransformacion ? ", " + new Date(b.fechaTransformacion).toLocaleDateString("es-ES") : "") + ')</span>' : ""}\${b.desdeAbierto ? ' <span class="abierto-tag">🟣 Sale de un colchón ABIERTO</span>' : ""}
        </label>\${reservaAlmacenHtml(b)}\${items.length > 1 ? \`<button type="button" class="envio-aparte-btn" data-envio-aparte="\${escapeAttr(b.id)}" data-aparte="1" title="Sacar este artículo del envío: se queda pendiente como línea propia con la referencia terminada en 2">Enviar aparte</button>\` : ""}\${abiertoTagHtml(b)}
      \`;
      }).join("")
    : "<em>Todo en stock</em>";
  return \`
    <td>\${refLabel(o)}\${grupoEnvioTag(o)}\${valdemoroTag(o)}</td>
    <td>\${o.platform || "Shopify"}</td>
    <td>\${o.name}</td>
    <td>\${productoGrupo}</td>
    <td class="services">\${serviciosGrupo}</td>
    <td class="furniture-items-cell">\${itemsHtml}</td>
    <td><input type="text" class="notas-input" data-id="\${o.id}" value="\${escapeAttr(o.notas)}" placeholder="Notas..."></td>
  \`;
}

// Línea independiente para una reposición de pieza rota (Jennifer,
// 2026-09-21): "tengo que poder sacarlo de manera independiente" — no
// depende de si el resto del pedido original ya se envió o está en otra
// carga, absorbe el nombre/dirección/teléfono del pedido original pero
// tiene su propia casilla de "recibido" y su propia carga (ver
// reposicionesEnCarga/reposicionesPendientes en renderFurniture).
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-envio-aparte]");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const b = backorders.find(x => x.id === btn.dataset.envioAparte);
  if (!b) return;
  const aparte = btn.dataset.aparte === "1";
  const o = allOrders.find(x => x.id === b.orderId) || b;
  if (!confirm(aparte
    ? "¿Enviar aparte " + b.cantidad + "x " + b.stockModel + " (" + b.talla + ") de " + refLabel(o) + "?\\n\\nSale de este envío y se queda pendiente como línea propia con la referencia " + refLabel(o) + ((b.refSuffix ? Number(b.refSuffix) + 1 : 2)) + ", para añadirla a una carga cuando quieras."
    : "¿Volver a juntar " + b.stockModel + " (" + b.talla + ") con el resto de " + refLabel(o) + "?")) return;
  const res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(b.id) + "/envio-aparte", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ aparte }),
  });
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.ok) { alert(r.error || "No se ha podido cambiar."); return; }
  backorders = await (await fetch("/api/inventario/pendientes")).json();
  renderFurniture();
}, true);

function reposicionRowCells(b) {
  const o = allOrders.find(x => x.id === b.orderId) || {};
  if (b.envioAparte) {
    // Artículo enviado aparte (Jennifer, 2026-09-29): referencia del
    // pedido terminada en su sufijo ("…2") y opción de volver a juntarlo.
    return \`
    <td>\${refLabel(o.id ? o : b)}\${b.refSuffix || ""}<span class="envio-aparte-tag">ENVÍO APARTE</span>\${valdemoroTag(o)}</td>
    <td>\${o.platform || "Shopify"}</td>
    <td>\${o.name || ""}</td>
    <td>\${b.cantidad}x \${b.stockModel}\${b.talla ? " (" + b.talla + ")" : ""}\${b.color ? " " + escapeAttr(b.color) : ""}</td>
    <td class="services">\${o.services || ""}</td>
    <td class="furniture-items-cell">
      <label class="furniture-item-check">
        <input type="checkbox" class="item-recibido-check" data-id="\${b.id}"\${b.recibidoFabrica ? " checked" : ""}>
        \${b.referencia ? b.referencia + " — " : ""}\${b.cantidad}x \${b.stockModel}\${b.talla ? " (" + b.talla + ")" : ""}
      </label>
      <button type="button" class="envio-aparte-btn" data-envio-aparte="\${escapeAttr(b.id)}" data-aparte="0" title="Volver a juntarlo con el resto de su pedido">Juntar con el pedido</button>
    </td>
    <td><input type="text" class="notas-input" data-id="\${o.id}" value="\${escapeAttr(o.notas)}" placeholder="Notas..."></td>
  \`;
  }
  return \`
    <td>\${refLabel(b)}</td>
    <td>\${o.platform || "Shopify"}</td>
    <td>\${o.name || ""}</td>
    <td>\${b.stockModel}\${b.talla ? " (" + b.talla + ")" : ""}</td>
    <td class="services">\${o.services || ""}</td>
    <td class="furniture-items-cell">
      <label class="furniture-item-check">
        <input type="checkbox" class="item-recibido-check" data-id="\${b.id}"\${b.recibidoFabrica ? " checked" : ""}>
        \${b.referencia ? b.referencia + " — " : ""}1x \${b.stockModel}\${b.talla ? " (" + b.talla + ")" : ""}
      </label>
      \${b.piezaTexto ? '<div class="reposicion-tag">REPOSICIÓN: ' + escapeAttr(b.piezaTexto) + '</div>' : ""}
      \${b.tipo === "colchon" && b.agenciaReposicion === "FURNITURE" ? (b.recogida
        ? '<div class="reposicion-tag" style="background:#fee2e2;color:#991b1b">RECOGIDA: ' + (b.recogidaDestino === "desechar" ? "desechar" : "vuelve a instalaciones") + '</div>'
        : '<div class="reposicion-tag">SIN recogida</div>') : ""}
    </td>
    <td><input type="text" class="notas-input" data-id="\${o.id}" value="\${escapeAttr(o.notas)}" placeholder="Notas..."></td>
  \`;
}

function renderFurniture() {
  renderPestanasFurniture();
  document.getElementById("carga-abierta-titulo").textContent = formatCargaTitulo(cargaAbierta);
  document.getElementById("cerrar-carga-btn").disabled = !cargaAbierta;
  document.getElementById("descargar-carga-btn").disabled = !cargaAbierta;
  document.getElementById("listado-almacen-btn").disabled = !cargaAbierta;

  const todasFurniture = allOrders.filter(o => o.agencia === "FURNITURE" && o.shippingStatus !== "fulfilled" && !o.gestionadoExterno && !esMiembroSecundario(o));
  // Todo lo que está en la carga abierta se ve en ella, aunque en Shopify ya
  // figure como enviado (Jennifer, 2026-09-29, caso BEZEN12194: marcado como
  // enviado en el sistema antiguo pero sale en esta carga).
  const enCarga = cargaAbierta
    ? allOrders.filter(o => o.agencia === "FURNITURE" && o.cargaId === cargaAbierta.id && !o.gestionadoExterno && !esMiembroSecundario(o))
    : [];
  const busquedaPedido = document.getElementById("furniture-pedido-search").value.trim().toLowerCase();
  const busquedaReferencia = document.getElementById("furniture-referencia-search").value.trim().toLowerCase();
  // Al revés que Polival: aquí Jennifer quiere los más antiguos arriba, para
  // detectar de un vistazo los pedidos más retrasados y atenderlos primero
  // (2026-09-16). allOrders llega del backend ya ordenado más reciente
  // primero, así que aquí se invierte. Se ordena por FECHA real
  // (parseFechaGenerica), no por orderNumber — mismo fallo real que en
  // Proveedores pendientes (Jennifer, 2026-09-21): un orderNumber de
  // marketplace no es un correlativo cronológico.
  const pendientes = todasFurniture.filter(o => {
    if (o.cargaId) return false;
    if (retencionDe(o)) return false; // van en su propio recuadro
    // Mismo arreglo que en Proveedores pendientes (Jennifer, 2026-09-21):
    // buscar por la referencia real del marketplace, no solo BEZEN+número.
    // En un envío conjunto se busca en todos sus pedidos (la línea es una).
    const grupo = pedidosDelGrupo(o);
    if (busquedaPedido) {
      const encaja = grupo.some(p => ("bezen" + p.orderNumber).toLowerCase().includes(busquedaPedido)
        || (p.orderRef || "").toLowerCase().includes(busquedaPedido));
      if (!encaja) return false;
    }
    if (busquedaReferencia && !grupo.some(p => referenciasPorPedido(p.id).toLowerCase().includes(busquedaReferencia))) return false;
    return true;
  }).sort((a, b) => parseFechaGenerica(a.orderDate) - parseFechaGenerica(b.orderDate));

  // Reposiciones de pieza rota (Jennifer, 2026-09-21): línea independiente
  // del resto del pedido, con su propia carga (backorder.cargaId, no
  // order.cargaId) — así se pueden sacar/añadir sin tocar el estado del
  // pedido original, esté o no ya enviado. Una reposición de COLCHÓN por
  // SEUR (Jennifer, 2026-09-22) NO entra aquí — esa va por Luso/New +
  // "Preparar para SEUR", nunca por esta línea de Furniture.
  const esRepoColchonSeur = b => b.tipo === "colchon" && b.agenciaReposicion === "SEUR";
  // Los artículos "enviados aparte" (Jennifer, 2026-09-29) van por este
  // mismo camino que las reposiciones: línea propia, su propia carga.
  const esLineaPropia = b => (b.reposicion && b.estado === "pendiente" && !esRepoColchonSeur(b))
    || (b.envioAparte && (b.estado === "pendiente" || b.estado === "cubierto"));
  const reposicionesEnCarga = cargaAbierta ? backorders.filter(b => esLineaPropia(b) && b.cargaId === cargaAbierta.id) : [];
  const reposicionesPendientes = backorders.filter(b => esLineaPropia(b) && !b.cargaId).filter(b => {
    if (!busquedaPedido) return true;
    // refLabel(b) ya incluye el prefijo "REP" (Jennifer, 2026-09-21) —
    // buscar solo bezen+número/orderRef no lo encontraba si se escribía
    // "REP" o la referencia completa con REP delante.
    return (refLabel(b) + (b.refSuffix || "")).toLowerCase().includes(busquedaPedido);
  }).sort((a, b) => parseFechaGenerica(a.fecha) - parseFechaGenerica(b.fecha));

  document.getElementById("carga-abierta-count").textContent = (enCarga.length + reposicionesEnCarga.length) + " pedidos en esta carga";
  document.querySelector("#carga-abierta-table tbody").innerHTML = enCarga.map(o => \`
    <tr\${o.cancelado ? ' class="fila-cancelada"' : ""}>
      \${furnitureRowCells(o)}
      <td><button type="button" class="sacar-carga-btn" data-id="\${o.id}">Sacar de la carga</button>\${moverFurnitureHtml('data-order-id="' + o.id + '"')}</td>
    </tr>
  \`).join("") + reposicionesEnCarga.map(b => \`
    <tr>
      \${reposicionRowCells(b)}
      <td><button type="button" class="sacar-carga-reposicion-btn" data-repo-id="\${b.id}">Sacar de la carga</button>\${moverFurnitureHtml('data-backorder-id="' + escapeAttr(b.id) + '"')}</td>
    </tr>
  \`).join("");
  document.querySelectorAll(".mover-fur-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const cargaId = btn.parentElement.querySelector(".mover-fur-destino").value;
      let body;
      if (btn.dataset.backorderId) body = { backorderId: btn.dataset.backorderId, cargaId };
      else {
        const order = allOrders.find(o => String(o.id) === btn.dataset.orderId);
        body = { orderIds: pedidosDelGrupo(order).filter(o => o.cargaId).map(o => o.id), cargaId };
      }
      const res = await fetch("/api/cargas/furniture/mover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) { alert(data.error || "No se ha podido mover."); return; }
      await loadOrders();
      await loadFurniture();
    });
  });
  document.querySelectorAll(".sacar-carga-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      // Envío conjunto: sale el grupo entero de la carga.
      const order = allOrders.find(o => String(o.id) === btn.dataset.id);
      for (const o of pedidosDelGrupo(order)) {
        if (!o.cargaId) continue;
        await fetch("/api/cargas/remove", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderId: o.id }),
        });
        o.cargaId = null;
      }
      renderFurniture();
    });
  });
  document.querySelectorAll(".sacar-carga-reposicion-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await fetch("/api/inventario/reposicion/carga-remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: btn.dataset.repoId }),
      });
      const b = backorders.find(x => x.id === btn.dataset.repoId);
      if (b) b.cargaId = null;
      renderFurniture();
    });
  });
  const paraTenerEnCuenta = allOrders.filter(o => o.paraTenerEnCuenta && !esMiembroSecundario(o));
  document.getElementById("tener-en-cuenta-count").textContent = paraTenerEnCuenta.length + " pedidos marcados";
  document.querySelector("#tener-en-cuenta-table tbody").innerHTML = paraTenerEnCuenta.map(o => \`
    <tr\${o.cancelado ? ' class="fila-cancelada"' : ""}>
      \${furnitureRowCells(o)}
      <td>
        \${!o.cargaId && !o.cancelado ? \`<button type="button" class="anadir-carga-tener-btn" data-id="\${o.id}">Añadir a la carga</button>\` : ""}
        <button type="button" class="quitar-tener-en-cuenta-btn" data-id="\${o.id}">Quitar</button>
      </td>
    </tr>
  \`).join("");
  document.querySelectorAll(".quitar-tener-en-cuenta-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await fetch("/api/pedidos/shopify/meta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: Number(btn.dataset.id), paraTenerEnCuenta: false }),
      });
      const order = allOrders.find(o => String(o.id) === btn.dataset.id);
      if (order) order.paraTenerEnCuenta = false;
      renderFurniture();
    });
  });
  document.querySelectorAll(".anadir-carga-tener-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      // Añadir manualmente desde "para tener en cuenta" (Jennifer,
      // 2026-09-18: "no tengo opción de añadirlo a la carga") — una vez en
      // la carga ya no hace falta seguir teniéndolo a golpe de vista aquí.
      await anadirPedidosACarga([id], cargaAbierta && cargaAbierta.id);
      await fetch("/api/pedidos/shopify/meta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, paraTenerEnCuenta: false }),
      });
      const order = allOrders.find(o => o.id === id);
      if (order) order.paraTenerEnCuenta = false;
      renderFurniture();
    });
  });

  renderRetenidos(todasFurniture.filter(o => !o.cargaId && retencionDe(o)));

  document.getElementById("furniture-pendientes-count").textContent = (pendientes.length + reposicionesPendientes.length) + " pedidos pendientes de envío por Furniture";
  document.querySelector("#furniture-pendientes-table tbody").innerHTML = pendientes.map(o => \`
    <tr\${o.cancelado ? ' class="fila-cancelada"' : ""}>
      <td><input type="checkbox" class="furniture-check" data-id="\${o.id}"\${furnitureSeleccion.has(o.id) ? " checked" : ""}\${o.cancelado ? " disabled" : ""}></td>
      \${furnitureRowCells(o)}
    </tr>
  \`).join("") + reposicionesPendientes.map(b => \`
    <tr>
      <td><input type="checkbox" class="reposicion-select-check" data-repo-id="\${b.id}"\${reposicionSeleccion.has(b.id) ? " checked" : ""}></td>
      \${reposicionRowCells(b)}
    </tr>
  \`).join("");
  document.querySelectorAll(".furniture-check").forEach(chk => {
    chk.addEventListener("change", () => {
      const id = Number(chk.dataset.id);
      if (chk.checked) furnitureSeleccion.add(id);
      else furnitureSeleccion.delete(id);
      actualizarFurnitureSeleccionUI();
    });
  });
  document.querySelectorAll(".reposicion-select-check").forEach(chk => {
    chk.addEventListener("change", () => {
      const id = chk.dataset.repoId;
      if (chk.checked) reposicionSeleccion.add(id);
      else reposicionSeleccion.delete(id);
      actualizarFurnitureSeleccionUI();
    });
  });
  actualizarFurnitureSeleccionUI();
  sincronizarTopFilaFiltro("furniture-pendientes-table", "furniture-filter-row");

  document.querySelectorAll(".item-recibido-check").forEach(chk => {
    chk.addEventListener("change", async () => {
      const resp = await fetch("/api/inventario/pendientes/" + encodeURIComponent(chk.dataset.id) + "/resolver", { method: "POST" });
      const entry = await resp.json().catch(() => null);
      avisarReservaAutomatica(entry);
      const b = backorders.find(x => x.id === chk.dataset.id);
      if (b) b.recibidoFabrica = chk.checked;
      if (b && entry && entry.reservaEnviada) b.reservaEnviada = entry.reservaEnviada;
      if (chk.checked && b) await checkAutoAddCarga(b.orderId);
      renderFurniture();
    });
  });

  document.querySelectorAll("#view-furniture .notas-input").forEach(inp => {
    inp.addEventListener("focus", () => { editing = true; });
    inp.addEventListener("blur", () => {
      editing = false;
      const order = allOrders.find(o => o.id === Number(inp.dataset.id));
      if (order) order.notas = inp.value;
      saveMeta(inp.dataset.id, { notas: inp.value });
    });
  });
}

// Pedidos retenidos a petición del cliente (Jennifer, 2026-09-30): "habría
// que habilitar una casilla donde pongamos RETENIDO A FALTA DE QUE EL
// CLIENTE DIGA QUE SE ENVÍE... o bien, si el cliente ya da una fecha a un
// mes vista, poderlo meter en la carga que queramos". order.retenido =
// { hasta: "AAAA-MM-DD" | null }. En un envío conjunto basta con que uno
// del grupo esté retenido.
function retencionDe(o) {
  const p = o && pedidosDelGrupo(o).find(x => x.retenido);
  return p ? p.retenido : null;
}
function todoRecibidoFurniture(o) {
  const items = pedidosDelGrupo(o).filter(p => !p.cancelado).flatMap(p => backordersPorPedido(p.id))
    .filter(i => !(i.esPack && i.tipo === "colchon" && i.tipoEnvio === "FPK"));
  return items.length > 0 && items.every(i => i.recibidoFabrica);
}
function fechaCortaEs(f) {
  return new Date(f + "T00:00:00").toLocaleDateString("es-ES");
}
// ¿Le toca ya salir? Solo con fecha: la primera carga de Furniture abierta de
// ese día o posterior (con las 2 próximas siempre abiertas, un retenido
// para una fecha cercana entra ya en la carga de su día).
function cargaParaRetencion(o) {
  const r = retencionDe(o);
  if (!r || !r.hasta) return null;
  return cargasFurnitureAbiertas().find(c => c.fecha >= r.hasta) || null;
}
function retencionCumplida(o) {
  return !!cargaParaRetencion(o);
}
async function guardarRetencion(orderIds, retenido) {
  const ids = [...new Set(orderIds.flatMap(id => pedidosDelGrupo(allOrders.find(o => o.id === id)).map(o => o.id).concat(id)))];
  await Promise.all(ids.map(id => fetch("/api/pedidos/shopify/meta", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, retenido }),
  })));
  ids.forEach(id => { const o = allOrders.find(x => x.id === id); if (o) o.retenido = retenido ? { hasta: retenido.hasta || null } : null; });
}
function renderRetenidos(retenidos) {
  retenidos.sort((a, b) => ((retencionDe(a).hasta || "9999") + a.orderNumber).localeCompare((retencionDe(b).hasta || "9999") + b.orderNumber));
  document.getElementById("retenidos-count").textContent = retenidos.length
    ? retenidos.length + " pedido(s) retenidos. No suben solos a la carga hasta que el cliente dé luz verde o llegue su fecha."
    : "No hay pedidos retenidos.";
  document.querySelector("#retenidos-table tbody").innerHTML = retenidos.map(o => {
    const r = retencionDe(o);
    const listo = todoRecibidoFurniture(o);
    const toca = retencionCumplida(o);
    const retTxt = (r.hasta ? "Enviar en la carga del " + fechaCortaEs(r.hasta) + " o la siguiente" : "Sin fecha: a falta de luz verde del cliente")
      + '<br><span class="' + (listo ? "retenido-listo" : "retenido-falta") + '">' + (listo ? "✓ Todo en stock" : "Falta mercancía") + "</span>"
      + (toca ? '<br><span class="retenido-toca">TOCA EN ESTA CARGA</span>' : "");
    return '<tr' + (o.cancelado ? ' class="fila-cancelada"' : "") + ">" + furnitureRowCells(o)
      + "<td>" + retTxt + "</td><td>"
      + '<button type="button" class="luz-verde-btn" data-id="' + o.id + '">Luz verde: a la carga</button> '
      + '<button type="button" class="secondary cambiar-retencion-btn" data-id="' + o.id + '">Cambiar</button> '
      + '<button type="button" class="secondary quitar-retencion-btn" data-id="' + o.id + '">Quitar retención</button>'
      + "</td></tr>";
  }).join("");
  document.querySelectorAll(".luz-verde-btn").forEach(btn => btn.addEventListener("click", async () => {
    const o = allOrders.find(x => String(x.id) === btn.dataset.id);
    if (!o) return;
    if (todoRecibidoFurniture(o)) {
      if (!confirm("¿El cliente da luz verde? " + refLabel(o) + " entra ahora en la carga de Furniture.")) return;
      await guardarRetencion([o.id], null);
      await anadirPedidosACarga([o.id]);
    } else {
      if (!confirm(refLabel(o) + " todavía no tiene toda la mercancía. Se quita la retención y subirá solo a la carga cuando llegue todo. ¿Seguir?")) return;
      await guardarRetencion([o.id], null);
    }
    renderFurniture();
  }));
  document.querySelectorAll(".quitar-retencion-btn").forEach(btn => btn.addEventListener("click", async () => {
    await guardarRetencion([Number(btn.dataset.id)], null);
    renderFurniture();
  }));
  document.querySelectorAll(".cambiar-retencion-btn").forEach(btn => btn.addEventListener("click", () => abrirModalRetener([Number(btn.dataset.id)])));
}
// Con fecha: al abrir Furniture, lo que ya toca y está todo recibido entra
// solo en la carga abierta (y deja de estar retenido).
async function aplicarRetencionesCumplidas() {
  const listos = allOrders.filter(o => o.agencia === "FURNITURE" && !o.cargaId && !o.cancelado && o.retenido && !esMiembroSecundario(o)
    && retencionCumplida(o) && todoRecibidoFurniture(o));
  for (const o of listos) {
    const carga = cargaParaRetencion(o);
    await guardarRetencion([o.id], null);
    await anadirPedidosACarga([o.id], carga && carga.id);
  }
  return listos.length;
}
let retenerModalIds = [];
function abrirModalRetener(ids) {
  retenerModalIds = ids;
  const refs = ids.map(id => refLabel(allOrders.find(o => o.id === id) || {})).join(", ");
  document.getElementById("retener-modal-texto").textContent = refs;
  const r = ids.length === 1 ? retencionDe(allOrders.find(o => o.id === ids[0])) : null;
  const input = document.getElementById("retener-fecha-input");
  input.min = hoyMadrid();
  input.value = r && r.hasta ? r.hasta : "";
  document.querySelector('input[name="retener-tipo"][value="' + (r && r.hasta ? "fecha" : "sin-fecha") + '"]').checked = true;
  document.getElementById("retener-modal-overlay").classList.add("open");
}
document.getElementById("retener-btn").addEventListener("click", () => {
  if (furnitureSeleccion.size) abrirModalRetener([...furnitureSeleccion]);
});
document.getElementById("retener-modal-cancel").addEventListener("click", () => document.getElementById("retener-modal-overlay").classList.remove("open"));
document.getElementById("retener-fecha-input").addEventListener("input", () => {
  document.querySelector('input[name="retener-tipo"][value="fecha"]').checked = true;
});
document.getElementById("retener-modal-ok").addEventListener("click", async () => {
  const conFecha = document.querySelector('input[name="retener-tipo"]:checked').value === "fecha";
  const hasta = document.getElementById("retener-fecha-input").value;
  if (conFecha && (!hasta || hasta < hoyMadrid())) { alert("Elige una fecha de hoy en adelante."); return; }
  await guardarRetencion(retenerModalIds, { hasta: conFecha ? hasta : null });
  document.getElementById("retener-modal-overlay").classList.remove("open");
  furnitureSeleccion.clear();
  renderFurniture();
});

function actualizarFurnitureSeleccionUI() {
  const n = furnitureSeleccion.size + reposicionSeleccion.size;
  document.getElementById("anadir-carga-btn").disabled = n === 0;
  // "Tener en cuenta" no aplica a reposiciones (Jennifer no lo ha pedido) —
  // solo cuenta pedidos normales.
  document.getElementById("anadir-tener-en-cuenta-btn").disabled = furnitureSeleccion.size === 0;
  document.getElementById("retener-btn").disabled = furnitureSeleccion.size === 0;
  document.getElementById("furniture-seleccion-count").textContent = n > 0 ? n + " seleccionados" : "";
}

document.getElementById("anadir-tener-en-cuenta-btn").addEventListener("click", async () => {
  const orderIds = [...furnitureSeleccion];
  if (!orderIds.length) return;
  await Promise.all(orderIds.map(id => fetch("/api/pedidos/shopify/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, paraTenerEnCuenta: true }),
  })));
  orderIds.forEach(id => {
    const order = allOrders.find(o => o.id === id);
    if (order) order.paraTenerEnCuenta = true;
  });
  furnitureSeleccion.clear();
  renderFurniture();
});

// cargaId opcional (Jennifer, 2026-09-30): sin él va a la carga de
// Furniture más próxima (subidas automáticas); el botón "Añadir a la carga"
// manda la de la pestaña elegida.
async function anadirPedidosACarga(orderIds, cargaId) {
  // Un pedido de un envío conjunto nunca entra solo: arrastra a su grupo.
  orderIds = [...new Set(orderIds.flatMap(id => pedidosDelGrupo(allOrders.find(o => o.id === id)).filter(o => !o.cancelado).map(o => o.id).concat(id)))];
  const res = await fetch("/api/cargas/add", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderIds, cargaId: cargaId || undefined }),
  });
  const { carga } = await res.json();
  orderIds.forEach(id => {
    const order = allOrders.find(o => o.id === id);
    if (order) order.cargaId = carga.id;
  });
  if (!allCargas.some(c => c.id === carga.id)) allCargas.push(carga);
  if (!cargaAbierta) { cargaAbierta = carga; cargaFurnitureElegidaId = carga.id; }
  return carga;
}

// Reposiciones a la carga (Jennifer, 2026-09-21): cada una lleva su propia
// carga independiente (backorder.cargaId) — si no hay carga abierta
// todavía, se crea/reusa la misma que usarían los pedidos normales
// (anadirPedidosACarga con orderIds vacío ya la crea sin tocar ningún
// pedido).
async function anadirReposicionesACarga(repoIds) {
  if (!repoIds.length) return;
  const carga = cargaAbierta || await anadirPedidosACarga([]);
  for (const id of repoIds) {
    await fetch("/api/inventario/reposicion/carga-add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, cargaId: carga.id }),
    });
    const b = backorders.find(x => x.id === id);
    if (b) b.cargaId = carga.id;
  }
}

document.getElementById("anadir-carga-btn").addEventListener("click", async () => {
  const orderIds = [...furnitureSeleccion];
  const repoIds = [...reposicionSeleccion];
  if (!orderIds.length && !repoIds.length) return;
  if (orderIds.length) await anadirPedidosACarga(orderIds, cargaAbierta && cargaAbierta.id);
  if (repoIds.length) await anadirReposicionesACarga(repoIds);
  furnitureSeleccion.clear();
  reposicionSeleccion.clear();
  renderFurniture();
});

// Listado para el almacén (Jennifer, 2026-09-29): Excel imprimible con solo
// pedido, referencia de fábrica, producto, unidades y montaje.
async function descargarListadoAlmacen(cargaId) {
  const res = await fetch("/api/cargas/almacen?cargaId=" + encodeURIComponent(cargaId));
  if (!res.ok) { alert("No se pudo sacar el listado: " + await res.text()); return; }
  const { carga, filas } = await res.json();
  const ExcelJS = await cargarExcelJs();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Almacén", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });
  const TAM = 13;
  const anchos = [16, 13, 52, 7, 11, 18];
  ws.columns = anchos.map(width => ({ width }));
  ws.getCell("A1").value = "Carga Furniture — " + formatCargaTitulo(carga);
  ws.getCell("A1").font = { bold: true, size: 18 };
  ws.getCell("A2").value = filas.length + " artículos · " + new Set(filas.map(f => f.pedido)).size + " pedidos";
  ws.getCell("A2").font = { size: 12 };
  ws.addRow([]);
  const borde = { style: "thin", color: { argb: "FF999999" } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };
  const cabecera = ws.addRow(["Pedido", "Ref. fábrica", "Producto", "Uds", "Montaje", "Reserva"]);
  cabecera.eachCell(c => {
    c.font = { bold: true, size: TAM, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F8A4C" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = bordes;
  });
  ws.pageSetup.printTitlesRow = cabecera.number + ":" + cabecera.number;

  let grupo = -1, anterior = null, inicio = 0;
  const cerrarGrupo = (fin) => { if (anterior !== null && fin > inicio) ws.mergeCells(inicio, 1, fin, 1); };
  filas.forEach((f) => {
    if (f.pedido !== anterior) { cerrarGrupo(ws.rowCount); grupo++; anterior = f.pedido; inicio = ws.rowCount + 1; }
    // Ya apartado con etiqueta de reserva (Jennifer, 2026-10-02): que no
    // lo vuelvan a buscar ni preparar.
    const reserva = f.reservado ? "YA APARTADO (etiqueta reserva " + new Date(f.reservado).toLocaleDateString("es-ES") + ")" : "";
    const row = ws.addRow([f.pedido, f.referencia, f.producto, f.cantidad, f.montaje ? "SÍ" : "NO", reserva]);
    const lineas = Math.max(1, Math.ceil(f.producto.length / ((anchos[2] - 2) * 11 / TAM)), reserva ? 2 : 1);
    row.height = lineas * (TAM * 1.35) + 6;
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.alignment = { vertical: "middle", horizontal: col === 3 ? "left" : "center", wrapText: true };
      c.border = bordes;
      c.font = col === 6
        ? { size: TAM - 1, bold: true, color: { argb: "FF7C3AED" } }
        : { size: TAM, bold: col === 1 || col === 2 || (col === 5 && f.montaje), color: col === 5 && f.montaje ? { argb: "FFC80000" } : undefined };
      if (f.reservado && col > 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
      else if (grupo % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF4EE" } };
    });
  });
  cerrarGrupo(ws.rowCount);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "Almacen_" + carga.fecha + ".xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Listado para el almacén de una carga de SEUR (Jennifer, 2026-10-01): qué
// sale y de dónde (STOCK / RECIBIDO HOY / APARTADO), para que lo busquen en
// el sitio correcto.
async function descargarListadoAlmacenSeur(cargaId) {
  const res = await fetch("/api/cargas/seur/almacen?cargaId=" + encodeURIComponent(cargaId));
  if (!res.ok) { alert("No se pudo sacar el listado: " + await res.text()); return; }
  const { carga, filas } = await res.json();
  const ExcelJS = await cargarExcelJs();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Almacén SEUR", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });
  const TAM = 13;
  const anchos = [20, 46, 7, 28];
  ws.columns = anchos.map(width => ({ width }));
  ws.getCell("A1").value = "Carga SEUR — " + formatSeurCargaTitulo(carga);
  ws.getCell("A1").font = { bold: true, size: 18 };
  ws.getCell("A2").value = filas.reduce((n, f) => n + f.cantidad, 0) + " bultos · " + new Set(filas.map(f => f.pedido)).size + " envíos";
  ws.getCell("A2").font = { size: 12 };
  ws.addRow([]);
  const borde = { style: "thin", color: { argb: "FF999999" } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };
  const cabecera = ws.addRow(["Pedido", "Producto", "Uds", "De dónde sale"]);
  cabecera.eachCell(c => {
    c.font = { bold: true, size: TAM, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F8A4C" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = bordes;
  });
  ws.pageSetup.printTitlesRow = cabecera.number + ":" + cabecera.number;
  filas.forEach(f => {
    const row = ws.addRow([f.pedido, f.producto, f.cantidad, f.origen]);
    row.height = Math.max(1, Math.ceil(f.producto.length / ((anchos[1] - 2) * 11 / TAM))) * (TAM * 1.35) + 6;
    const color = /^STOCK/.test(f.origen) ? "FF1D4ED8" : /HOY/.test(f.origen) ? "FF15803D" : /APARTADO/.test(f.origen) ? "FF7C3AED" : "FF374151";
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.alignment = { vertical: "middle", horizontal: col === 2 ? "left" : "center", wrapText: true };
      c.border = bordes;
      c.font = col === 4 ? { size: TAM, bold: true, color: { argb: color } } : { size: TAM, bold: col === 1 };
    });
  });
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "Almacen_SEUR_" + carga.fecha + ".xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".listado-almacen-seur-btn");
  if (!btn) return;
  btn.disabled = true;
  try { await descargarListadoAlmacenSeur(btn.dataset.id); }
  catch (err) { alert("No se pudo generar el Excel: " + err.message); }
  finally { btn.disabled = false; }
});

document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".resumen-almacen-seur-btn");
  if (!btn) return;
  if (!confirm("¿Enviar al email del almacén el resumen de " + btn.dataset.titulo + " (etiqueta 15×10)?")) return;
  btn.disabled = true;
  try {
    const res = await fetch("/api/cargas/seur/almacen-email?cargaId=" + encodeURIComponent(btn.dataset.id), { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (d.ok) alert("Resumen enviado al almacén.");
    else alert("No se pudo enviar: " + (d.error || d.reason || res.status));
  } catch (err) { alert("No se pudo enviar: " + err.message); }
  finally { btn.disabled = false; }
});

document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".listado-almacen-btn");
  if (!btn) return;
  const cargaId = btn.dataset.id || (cargaAbierta && cargaAbierta.id);
  if (!cargaId) return;
  btn.disabled = true;
  try { await descargarListadoAlmacen(cargaId); }
  catch (err) { alert("No se pudo generar el Excel: " + err.message); }
  finally { btn.disabled = false; }
});

document.getElementById("descargar-carga-btn").addEventListener("click", () => {
  if (!cargaAbierta) return;
  window.location.href = "/api/cargas/export?cargaId=" + encodeURIComponent(cargaAbierta.id);
});

document.getElementById("cerrar-carga-btn").addEventListener("click", async () => {
  if (!cargaAbierta) return;
  if (!confirm("¿Cerrar " + formatCargaTitulo(cargaAbierta) + "? Pasará al historial de cargas.")) return;
  await fetch("/api/cargas/close", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cargaId: cargaAbierta.id }),
  });
  // Al cerrar se abre sola la siguiente de miércoles/viernes (servidor).
  cargaAbierta = null;
  cargaFurnitureElegidaId = null;
  await loadFurniture();
});

// Seguimiento de Furniture (Jennifer, 2026-09-16): sube a diario el
// "Listado de Notas" que descarga de la web de Furniture (fichero .xls que
// en realidad es una tabla HTML de una sola hoja) — se lee tal cual con
// DOMParser, sin depender de dependencias npm. La acumulación por albarán
// (no reemplazo entero) vive en el backend, ver /orders/tracking-import en
// orders-store.js.
const BEZEN_NUM_RE = /BEZEN0*([0-9]+)/i;
// Carrefour/Maison/Worten/Conforama dentro de estos ficheros (Jennifer,
// 2026-09-19, ampliado 2026-09-21): usan su propia referencia real, sin
// prefijo BEZEN. Algunas (Conforama ES, ej. "MP6172617500191839-A") llevan
// letras pegadas a los dígitos, así que ya no vale un patrón con \b (no
// hay límite de palabra entre una letra y un dígito) — se cogen
// simplemente TODOS los dígitos del texto (se ignoran letras/guiones) y se
// quedan los últimos 15, igual que referenceDigits() en el servidor, para
// que el número calculado aquí coincida con el que se guardó al importar
// el pedido.
// Un pedido SEUR con colchones sueltos que se divide en dos envíos añade
// un sufijo numérico pegado sin separador a la referencia (refSuffix "2",
// "3"... ver seurRefSuffix/nextRefSuffix en inventory-store.js) — ej. el
// pedido BEZEN11996 con sufijo "2" se manda a SEUR como "BEZEN119962". Al
// releer el fichero de seguimiento de SEUR, el número completo de dígitos
// ("119962") no es ningún pedido real, así que si no coincide con ninguno
// se prueba a recortar 1 o 2 dígitos del final (el sufijo) hasta encontrar
// un número que SÍ sea un pedido conocido — así el seguimiento se aplica
// al pedido correcto en vez de descartarse en silencio como "sin pedido"
// (Jennifer, 2026-09-24: "no ha machacado la información del envío
// anterior", el fichero nunca llegó a tocar el pedido).
function resolveKnownOrderNumber(digitsStr, knownOrderNumbers) {
  const full = Number(digitsStr);
  if (!knownOrderNumbers || knownOrderNumbers.has(full)) return full || null;
  for (const cut of [1, 2]) {
    if (digitsStr.length <= cut) break;
    const candidato = Number(digitsStr.slice(0, digitsStr.length - cut));
    if (knownOrderNumbers.has(candidato)) return candidato;
  }
  return full || null;
}
function extractTrackingOrderNumber(text, knownOrderNumbers) {
  const t = (text || "").trim();
  const bezen = t.match(BEZEN_NUM_RE);
  if (bezen) return resolveKnownOrderNumber(bezen[1], knownOrderNumbers);
  // Mismo orden de operaciones que referenceDigits() en el servidor:
  // recortar primero a los últimos 15 caracteres, luego quitar letras —
  // así coincide con lo que trunca SEUR (ver esa función para el porqué).
  const truncado = t.slice(-15);
  // Doble barra: está dentro de renderPage y una sola se perdía (salía
  // /D/g), así que no casaban las referencias de Leroy Merlin ni las que
  // llevan sufijo (…-A2) — Jennifer, 2026-10-02.
  const digits = truncado.replace(/\\D/g, "");
  if (digits.length < 6) return null;
  return resolveKnownOrderNumber(digits, knownOrderNumbers);
}
function trackingTipoDeAlbaran(albaran, orderNumber) {
  const resto = albaran.replace(new RegExp("BEZEN0*" + orderNumber, "i"), "").toUpperCase();
  if (resto.includes("BIS")) return "BIS";
  if (resto.includes("INC")) return "INC";
  if (resto.includes("REP")) return "REP";
  return "";
}
function parseFurnitureTrackingFile(text) {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const filas = [...doc.querySelectorAll("tr")].filter(tr => tr.querySelector("td"));
  const entries = [];
  let sinMatch = 0;
  const sinMatchDetalle = [];
  const knownOrderNumbers = new Set(allOrders.map(o => o.orderNumber));
  for (const tr of filas) {
    const tds = [...tr.querySelectorAll("td")];
    if (tds.length < 18) continue;
    const albaran = (tds[0].textContent || "").trim();
    const orderNumber = extractTrackingOrderNumber(albaran, knownOrderNumbers);
    if (orderNumber == null) { sinMatch++; sinMatchDetalle.push(albaran); continue; }
    const linkEl = tds[17].querySelector("a");
    entries.push({
      orderNumber,
      albaran,
      estado: (tds[1].textContent || "").trim(),
      fechaAlmacen: (tds[4].textContent || "").trim(),
      fechaPrevista: (tds[8].textContent || "").trim(),
      seguimiento: linkEl ? linkEl.href : (tds[17].textContent || "").trim(),
      tipo: trackingTipoDeAlbaran(albaran, orderNumber),
    });
  }
  return { entries, sinMatch, sinMatchDetalle };
}
// Reporte de la subida de seguimiento de Furniture (Jennifer, 2026-09-29:
// "necesito poder descargar un archivo para ver los errores").
let ultimoReporteFurniture = null;
const MOTIVOS_SHOPIFY = {
  update_tracking_error: "Shopify no dejó actualizar el seguimiento del envío que ya existía",
  fulfillment_create_error: "Shopify no dejó marcar el pedido como enviado",
  sin_fulfillment_order_abierto: "En Shopify el pedido no tiene nada pendiente de enviar (¿ya marcado como enviado a mano?)",
  sin_fulfillment_previo_guardado: "El pedido ya estaba enviado en Shopify, pero no tenemos guardado ese envío para añadirle el seguimiento",
  fulfillment_orders_error: "No se pudo leer el pedido en Shopify",
};
function construirFilasReporteFurniture(sinMatchDetalle, data) {
  const filas = [];
  const errores = (data.shopify && data.shopify.errores) || [];
  for (const r of errores) {
    const pedido = allOrders.find(o => o.orderNumber === r.orderNumber);
    filas.push({ Estado: "ERROR AL ENVIAR A SHOPIFY", "Albarán": r.albaran || "", "Nº Pedido": r.orderNumber, Cliente: pedido ? pedido.name : "",
      Motivo: MOTIVOS_SHOPIFY[r.reason] || r.reason || "", "Detalle de Shopify": r.detail || "" });
  }
  for (const a of sinMatchDetalle || []) {
    filas.push({ Estado: "SIN REFERENCIA RECONOCIBLE", "Albarán": a, "Nº Pedido": "", Cliente: "", Motivo: "No se pudo sacar ningún número de pedido de este albarán", "Detalle de Shopify": "" });
  }
  for (const r of data.sinPedidoDetalle || []) {
    filas.push({ Estado: "SIN PEDIDO CORRESPONDIENTE", "Albarán": r.albaran, "Nº Pedido": r.orderNumberDetectado ?? "", Cliente: "", Motivo: "No existe ningún pedido con ese número en el sistema", "Detalle de Shopify": "" });
  }
  for (const r of data.actualizadosDetalle || []) {
    if (errores.some(x => x.orderNumber === r.orderNumber && x.albaran === r.albaran)) continue;
    filas.push({ Estado: "ACTUALIZADO", "Albarán": r.albaran, "Nº Pedido": r.orderNumber, Cliente: r.nombre || "", Motivo: (r.nuevo ? "Envío nuevo" : "Actualización de un envío ya conocido") + (r.estado ? " · " + r.estado : ""), "Detalle de Shopify": "" });
  }
  return filas;
}
document.getElementById("tracking-report-btn").addEventListener("click", () => {
  if (!ultimoReporteFurniture || !ultimoReporteFurniture.length) return;
  const ws = XLSX.utils.json_to_sheet(ultimoReporteFurniture);
  ws["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 11 }, { wch: 28 }, { wch: 60 }, { wch: 80 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Seguimiento Furniture");
  XLSX.writeFile(wb, "Reporte_Furniture_" + new Date().toISOString().slice(0, 10) + ".xlsx");
});
document.getElementById("tracking-upload-btn").addEventListener("click", () => {
  document.getElementById("tracking-upload-input").click();
});
document.getElementById("tracking-upload-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const statusEl = document.getElementById("tracking-upload-status");
  const reportBtn = document.getElementById("tracking-report-btn");
  reportBtn.style.display = "none";
  statusEl.textContent = "Leyendo archivo...";
  const text = await file.text();
  const { entries, sinMatch, sinMatchDetalle } = parseFurnitureTrackingFile(text);
  if (!entries.length) {
    statusEl.textContent = "No se reconoció ninguna referencia de pedido en el archivo.";
    return;
  }
  statusEl.textContent = "Subiendo " + entries.length + " filas...";
  const res = await fetch("/api/furniture/tracking-import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  const data = await res.json();
  let msg = data.actualizados + " pedidos actualizados" + (sinMatch ? " · " + sinMatch + " filas sin referencia reconocible" : "") + (data.sinPedido ? " · " + data.sinPedido + " albaranes sin pedido correspondiente" : "");
  if (data.shopify && data.shopify.activo) {
    msg += " · " + data.shopify.enviados + " enviados a Shopify";
    if (data.shopify.errores && data.shopify.errores.length) msg += " · " + data.shopify.errores.length + " con error al enviar a Shopify";
  }
  statusEl.textContent = msg;
  ultimoReporteFurniture = construirFilasReporteFurniture(sinMatchDetalle, data);
  reportBtn.style.display = ultimoReporteFurniture.length ? "" : "none";
  await loadOrders();
});

// Seguimiento de SEUR (Jennifer, 2026-09-16): sube a diario el .xlsx real
// que descarga de SEUR ("Envios_todos") — a diferencia del de Furniture, es
// un solo fichero binario, así que se lee con la librería xlsx (CDN) en vez
// de DOMParser. La columna que le importa para el estado es "DESCRIPCION
// SITUACION" (columna AJ). Por ahora se ignoran las filas sin "BEZEN" en la
// referencia (otras plataformas/clientes) — Jennifer confirmó que se
// tendrán en cuenta más adelante cuando configure esos otros clientes, no
// es un fallo del parseo.
// Enlace de seguimiento de SEUR (dictado por Jennifer, 2026-09-16, con
// ejemplo real verificado — BEZEN119143 -> nº expedición 4156186 ->
// https://www.seur.com/miseur/mis-envios?tracking=4156186): la base es
// siempre "https://www.seur.com/miseur/mis-envios?tracking=", y el número
// que se añade depende de si el envío es nacional o internacional según la
// cuenta usada (columna T, "CCC CUENTA" — mismo código 63235/48297 que ya
// se usa en la exportación a SEUR, ver referenciaSeur/CODREMITENTE):
// nacional (63235) -> número de expedición (columna C); internacional
// (48297) -> "parcel number" (columna L, suele empezar por "07"). Un mismo
// envío con varios bultos puede traer varios "parcel number" separados por
// ";" — se usa solo el primero para el enlace.
const SEUR_TRACKING_BASE = "https://www.seur.com/miseur/mis-envios?tracking=";
// Las fechas de este fichero a veces llegan como número de serie de Excel
// crudo (ej. "46270.441...") en vez de formateadas, según si la celda tenía
// o no formato de fecha aplicado en origen — se convierte a mano por si
// acaso, con el mismo cálculo que usa Excel (día 0 = 1899-12-30).
function excelSerialToFecha(v) {
  const s = String(v || "").trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return s;
  const ms = Date.UTC(1899, 11, 30) + Number(s) * 86400000;
  return new Date(ms).toLocaleDateString("es-ES");
}
function parseSeurTrackingFile(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  const header = rows[0].map(h => String(h).trim().toUpperCase());
  const idx = {
    localizador: header.indexOf("LOCALIZADOR"),
    referencia: header.indexOf("REFERENCIA"),
    numeroExpedicion: header.indexOf("NUMERO DE EXPEDICION"),
    parcelNumber: header.indexOf("PARCEL NUMBER"),
    cccCuenta: header.indexOf("CCC CUENTA"),
    fechaCreacion: header.indexOf("FECHA CREACION"),
    fechaSituacion: header.indexOf("FECHA SITUACION"),
    codigoSituacion: header.indexOf("CODIGO SITUACION"),
    estado: header.indexOf("DESCRIPCION SITUACION"),
    // Columna AR: trae el SKU de lo que va en ese envío concreto (ej.
    // "ALMANT90 - SOLO TRANSPORTE", "COLTOSD80X180") — Jennifer,
    // 2026-09-16: con esto se puede saber qué artículo concreto de un
    // pedido con varios productos sueltos se ha enviado.
    infoAdicional: header.indexOf("INFORMACIÓN ADICIONAL") >= 0 ? header.indexOf("INFORMACIÓN ADICIONAL") : header.findIndex(h => h.includes("ADICIONAL")),
  };
  const entries = [];
  let sinMatch = 0;
  const sinMatchDetalle = [];
  const knownOrderNumbers = new Set(allOrders.map(o => o.orderNumber));
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const referencia = String(row[idx.referencia] || "").trim();
    const orderNumber = extractTrackingOrderNumber(referencia, knownOrderNumbers);
    if (orderNumber == null) {
      sinMatch++;
      sinMatchDetalle.push({ referencia, estado: String(row[idx.estado] || "").trim() });
      continue;
    }
    const cccCuenta = String(row[idx.cccCuenta] || "").trim();
    const numeroExpedicion = String(row[idx.numeroExpedicion] || "").trim();
    const parcelNumber = String(row[idx.parcelNumber] || "").split(";")[0].trim();
    let seguimiento = "";
    if (cccCuenta.startsWith("63235") && numeroExpedicion) seguimiento = SEUR_TRACKING_BASE + numeroExpedicion;
    else if (cccCuenta.startsWith("48297") && parcelNumber) seguimiento = SEUR_TRACKING_BASE + parcelNumber;
    entries.push({
      orderNumber,
      referencia,
      localizador: String(row[idx.localizador] || "").trim(),
      numeroExpedicion,
      seguimiento,
      codigoSituacion: String(row[idx.codigoSituacion] || "").trim(),
      estado: String(row[idx.estado] || "").trim(),
      fechaSituacion: excelSerialToFecha(row[idx.fechaSituacion]),
      fechaCreacion: excelSerialToFecha(row[idx.fechaCreacion]),
      infoAdicional: String(row[idx.infoAdicional] || "").trim(),
    });
  }
  return { entries, sinMatch, sinMatchDetalle };
}
document.getElementById("tracking-seur-upload-btn").addEventListener("click", () => {
  document.getElementById("tracking-seur-upload-input").click();
});
// Reporte descargable de la última subida de SEUR (Jennifer, 2026-09-24:
// "necesito... revisar cuales son los pedidos que están teniendo esos
// problemas" — el resumen de texto solo daba contadores, no permitía ver
// CUÁLES eran los pedidos concretos de cada categoría). Se guarda en esta
// variable tras cada subida y se genera el .xlsx solo al pulsar el botón
// (con SheetJS, ya cargado en la página para leer los ficheros de origen).
let ultimoReporteSeur = null;
function construirFilasReporteSeur(sinMatchDetalle, data) {
  const filas = [];
  for (const r of sinMatchDetalle || []) {
    filas.push({ Estado: "SIN REFERENCIA RECONOCIBLE", Referencia: r.referencia, "Nº Pedido": "", Cliente: "", "Estado SEUR": r.estado || "", Detalle: "No se pudo extraer ningún número de pedido de esta referencia" });
  }
  for (const r of (data.sinPedidoDetalle || [])) {
    filas.push({ Estado: "SIN PEDIDO CORRESPONDIENTE", Referencia: r.referencia, "Nº Pedido": r.orderNumberDetectado ?? "", Cliente: "", "Estado SEUR": r.estadoSeur || "", Detalle: "Se detectó un nº de pedido pero no existe ningún pedido así en el sistema" });
  }
  for (const r of ((data.shopify && data.shopify.errores) || [])) {
    const pedido = allOrders.find(o => o.orderNumber === r.orderNumber);
    filas.push({ Estado: "ERROR AL ENVIAR A SHOPIFY", Referencia: pedido ? refLabel(pedido) : ("BEZEN" + r.orderNumber), "Nº Pedido": r.orderNumber, Cliente: pedido ? pedido.name : "", "Estado SEUR": "", Detalle: [r.reason, r.detail].filter(Boolean).join(": ") });
  }
  for (const r of (data.actualizadosDetalle || [])) {
    filas.push({ Estado: "ACTUALIZADO", Referencia: r.referencia, "Nº Pedido": r.orderNumber, Cliente: r.nombre || "", "Estado SEUR": r.estadoSeur || "", Detalle: r.nuevo ? "Envío nuevo" : "Actualización de un envío ya conocido" });
  }
  return filas;
}
document.getElementById("tracking-seur-report-btn").addEventListener("click", () => {
  if (!ultimoReporteSeur || !ultimoReporteSeur.length) return;
  const ws = XLSX.utils.json_to_sheet(ultimoReporteSeur);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Seguimiento SEUR");
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, "Reporte_SEUR_" + fecha + ".xlsx");
});
document.getElementById("tracking-seur-upload-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const statusEl = document.getElementById("tracking-seur-upload-status");
  const reportBtn = document.getElementById("tracking-seur-report-btn");
  reportBtn.style.display = "none";
  statusEl.textContent = "Leyendo archivo...";
  const arrayBuffer = await file.arrayBuffer();
  const { entries, sinMatch, sinMatchDetalle } = parseSeurTrackingFile(arrayBuffer);
  if (!entries.length && !sinMatch) {
    statusEl.textContent = "No se reconoció ninguna referencia de pedido en el archivo.";
    return;
  }
  statusEl.textContent = "Subiendo " + entries.length + " filas...";
  const res = await fetch("/api/seur/tracking-import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  const data = await res.json();
  let msg = data.actualizados + " pedidos actualizados" + (sinMatch ? " · " + sinMatch + " filas sin referencia reconocible" : "") + (data.sinPedido ? " · " + data.sinPedido + " referencias sin pedido correspondiente" : "");
  if (data.shopify && data.shopify.activo) {
    msg += " · " + data.shopify.enviados + " enviados a Shopify";
    if (data.shopify.errores && data.shopify.errores.length) msg += " · " + data.shopify.errores.length + " con error al enviar a Shopify";
  }
  statusEl.textContent = msg;
  ultimoReporteSeur = construirFilasReporteSeur(sinMatchDetalle, data);
  reportBtn.style.display = ultimoReporteSeur.length ? "" : "none";
  await loadOrders();
  // El botón está en "Envíos SEUR": se refresca la lista con los estados nuevos.
  await loadCasosRevisarSeur();
});

// Ficheros de "marketplace" tipo Mirakl Connect (Carrefour, Fase 1,
// Jennifer 2026-09-16/17; generalizado 2026-09-19 al añadir Maison Du
// Monde con el mismo formato exacto de fichero — "el funcionamiento aquí es
// exactamente igual que en Carrefour"): sube el fichero bruto que se
// descarga de Mirakl Connect (no una plantilla propia hecha a mano). El
// mapeo se hace SIEMPRE por nombre de columna (nunca por letra), porque
// Jennifer avisó que la posición de las columnas puede variar de una tienda
// a otra — confirmado real: en Carrefour la dirección empieza en AX/AY,
// en Maison Du Monde una columna de más ("Dirección de entrega: empresa")
// desplaza todo ese bloque una posición a la derecha (AY/AZ). Buscar por
// nombre evita tener que tocar nada al añadir una tienda nueva con este
// mismo formato.
function parseMiraklFile(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  // La columna de importe viene con un formato de celda que deja el texto
  // formateado (.w) vacío aunque el valor numérico (.v) sí está — se lee
  // aparte "en bruto" solo para esta columna (Jennifer, 2026-09-19: "no soy
  // capaz de verlo" — con raw:false salía siempre vacío).
  const rowsRaw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  const header = rows[0].map(h => String(h).trim());
  const idx = {
    fechaCreacion: header.indexOf("Fecha de creación"),
    orderNumber: header.indexOf("Número de pedido"),
    cantidad: header.indexOf("Cantidad"),
    detalles: header.indexOf("Detalles"),
    estado: header.indexOf("Estado"),
    importe: header.indexOf("Importe total del pedido con IVA (gastos de envío incluidos)"),
    // Conforama España llama a esta columna "SKU de Seller" en vez de "SKU
    // de Tienda" (Jennifer, 2026-09-21) — mismo campo, nombre distinto.
    sku: header.indexOf("SKU de Tienda") >= 0 ? header.indexOf("SKU de Tienda") : header.indexOf("SKU de Seller"),
    // Respaldo (Jennifer, 2026-09-21, Conforama): "SKU de Tienda" a veces
    // trae un identificador interno del marketplace sin relación con
    // nuestro código real (igual que pasaba con Worten), mientras que "SKU
    // de la oferta" SÍ trae el código real nuestro de forma fiable en
    // Conforama (verificado contra 19 pedidos reales, 19/19 coincide) — se
    // prueba como segundo intento en mapMarketplaceOrder antes de caer al
    // reconocimiento por texto.
    skuOferta: header.indexOf("SKU de la oferta"),
    email: header.indexOf("Dirección de entrega: correo electrónico"),
    nombre: header.indexOf("Dirección de entrega: nombre de pila"),
    apellido: header.indexOf("Dirección de entrega: apellido"),
    calle1: header.indexOf("Dirección de entrega: calle 1"),
    calle2: header.indexOf("Dirección de entrega: calle 2"),
    cp: header.indexOf("Dirección de entrega: código postal"),
    poblacion: header.indexOf("Dirección de entrega: ciudad"),
    provincia: header.indexOf("Dirección de entrega: provincia"),
    telefono: header.indexOf("Dirección de entrega: teléfono"),
    // Ausente en el fichero de Carrefour (siempre España) — si no existe la
    // columna, header.indexOf da -1 y row[-1] sale undefined sin romper
    // nada, quedando countryCode sin definir (mapMarketplaceOrder cae a
    // "ES" por defecto).
    pais: header.indexOf("Dirección de entrega: país"),
    // Fecha máxima para dar el seguimiento al cliente (Jennifer, 2026-09-29).
    limiteEnvio: header.indexOf("Fecha límite de envío"),
  };
  const entries = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[idx.orderNumber]) continue;
    entries.push({
      orderDate: excelSerialToFecha(row[idx.fechaCreacion]),
      orderNumber: String(row[idx.orderNumber]).trim(),
      qty: Math.round(Number(row[idx.cantidad])) || 1,
      product: String(row[idx.detalles] || "").trim(),
      estado: String(row[idx.estado] || "").trim(),
      price: String((rowsRaw[i] && rowsRaw[i][idx.importe]) ?? "").trim(),
      sku: String(row[idx.sku] || "").trim(),
      skuOferta: String(row[idx.skuOferta] || "").trim(),
      email: String(row[idx.email] || "").trim(),
      name: [row[idx.nombre], row[idx.apellido]].filter(Boolean).join(" ").trim(),
      address: [row[idx.calle1], row[idx.calle2]].filter(Boolean).join(" ").trim(),
      postalCode: String(row[idx.cp] || "").trim(),
      city: String(row[idx.poblacion] || "").trim(),
      province: String(row[idx.provincia] || "").trim(),
      phone: String(row[idx.telefono] || "").trim(),
      countryCode: paisToCountryCode(row[idx.pais]),
      limiteEnvio: idx.limiteEnvio >= 0 ? excelSerialToFecha(row[idx.limiteEnvio]) : "",
    });
  }
  return entries;
}
// Maison Du Monde vende a España, Francia e Italia (fichero real,
// 2026-09-19: "Espagne"/"France"/"Italie" en francés) — de momento solo
// estos 3, se amplía si aparece alguno nuevo en un fichero futuro.
const PAIS_A_COUNTRY_CODE = {
  "españa": "ES", "espagne": "ES", "spain": "ES",
  "francia": "FR", "france": "FR",
  "italia": "IT", "italie": "IT", "italy": "IT",
  "portugal": "PT",
};
function paisToCountryCode(pais) {
  const raw = String(pais || "").trim();
  // Worten manda ya el código ISO de 2 letras tal cual ("PT", "ES") en vez
  // del nombre completo del país como hace Maison Du Monde ("Portugal",
  // "Espagne") — Jennifer, 2026-09-19, caso real: sin esto TODOS los
  // pedidos de Worten (en su mayoría a Portugal) salían como España por
  // defecto, con el código de servicio de SEUR nacional en vez del
  // internacional que les corresponde.
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  const key = raw.toLowerCase();
  return PAIS_A_COUNTRY_CODE[key] || undefined;
}
// Marketplaces tipo Mirakl (Carrefour, Fase 1/2; generalizado 2026-09-19 al
// añadir Maison Du Monde con "exactamente el mismo funcionamiento que
// Carrefour"): una sola implementación genérica para todos, parametrizada
// por platformId (prefijo de los ids del DOM y de las rutas /api/) —
// initMarketplacePlatform() se llama una vez por tienda, más abajo.
const marketplaceOrdersByPlatform = {};
function initMarketplacePlatform(platformId) {
  marketplaceOrdersByPlatform[platformId] = [];
  document.getElementById(platformId + "-upload-btn").addEventListener("click", () => {
    document.getElementById(platformId + "-upload-input").click();
  });
  document.getElementById(platformId + "-upload-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const statusEl = document.getElementById(platformId + "-upload-status");
    statusEl.textContent = "Leyendo archivo...";
    const arrayBuffer = await file.arrayBuffer();
    const entries = parseMiraklFile(arrayBuffer);
    if (!entries.length) {
      statusEl.textContent = "No se reconoció ningún pedido en el archivo.";
      return;
    }
    statusEl.textContent = "Subiendo " + entries.length + " pedidos...";
    const res = await fetch("/api/" + platformId + "/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    const data = await res.json();
    statusEl.textContent = data.actualizados + " pedidos actualizados · " + data.procesados + " tramitados ahora (nuevos, con descuento de stock)" + (data.sinMatch ? " · " + data.sinMatch + " con SKU sin reconocer" : "");
    await loadMarketplacePedidos(platformId);
    loadOrders(); // refresca el aviso rojo de fecha límite del menú
  });
  document.getElementById(platformId + "-search").addEventListener("input", () => renderMarketplace(platformId));
  document.getElementById(platformId + "-orden-limite").addEventListener("change", () => renderMarketplace(platformId));
}
async function loadMarketplacePedidos(platformId) {
  const res = await fetch("/api/" + platformId + "/pedidos");
  marketplaceOrdersByPlatform[platformId] = await res.json();
  renderMarketplace(platformId);
}
function renderMarketplace(platformId) {
  const orders = marketplaceOrdersByPlatform[platformId] || [];
  const q = document.getElementById(platformId + "-search").value.trim().toLowerCase();
  // El backend devuelve todo ordenado por orderNumber (correcto para
  // Shopify, correlativo real) pero un marketplace como Conforama ES usa
  // referencias que NO son un correlativo cronológico (ej. "40630979H-B"
  // puede ser numéricamente menor que pedidos bastante más antiguos) —
  // mismo fallo real ya conocido en Polival/Furniture (Jennifer,
  // 2026-09-21/25: "estos pedidos no se ordenan por número de pedido, sino
  // por la fecha de realización"). Se reordena aquí por la fecha real,
  // más reciente primero (misma convención que la tabla de Shopify).
  const porLimite = document.getElementById(platformId + "-orden-limite").checked;
  // "Primero los que vencen antes" (Jennifer, 2026-09-29): los pendientes de
  // envío por fecha límite (el más urgente arriba), y el resto detrás.
  const claveLimite = o => plazoEnvioPendiente(o) ? (parseFechaGenerica(o.limiteEnvio) || Infinity) : Infinity;
  const filtered = orders
    .filter(o => !q || (o.orderRef || "").toLowerCase().includes(q) || (o.name || "").toLowerCase().includes(q))
    .sort((a, b) => porLimite
      ? (claveLimite(a) - claveLimite(b)) || (parseFechaGenerica(b.orderDate) - parseFechaGenerica(a.orderDate))
      : parseFechaGenerica(b.orderDate) - parseFechaGenerica(a.orderDate));
  document.getElementById(platformId + "-count").textContent = filtered.length + " pedidos";
  const sinMatch = orders.filter(o => !o.skuMatched);
  const avisoEl = document.getElementById(platformId + "-sku-aviso");
  if (sinMatch.length) {
    avisoEl.style.display = "block";
    avisoEl.textContent = "⚠ " + sinMatch.length + " pedido(s) con SKU sin reconocer en el Catálogo — revisar: " + sinMatch.map(o => o.orderRef + " (" + o.sku + ")").join(", ");
  } else {
    avisoEl.style.display = "none";
  }
  document.querySelector("#" + platformId + "-table tbody").innerHTML = filtered.map(o => \`
    <tr\${(o.cancelado || estadoSeguimientoEspecial(o.estado) === "CANCELADO") ? ' class="fila-cancelada"' : ""}>
      <td class="bell-cell"><div class="iconos-pedido">\${cancelButton(o)}\${sustituirPedidoButton(o)}\${reposicionButton(o)}\${gestoComercialButton(o)}\${noSalioButton(o)}\${cancelarLineaButton(o)}</div></td>
      <td>\${o.orderRef}</td>
      <td>\${o.orderDate || ""}</td>
      <td>\${plazoEnvioCell(o)}</td>
      <td>\${o.name || ""}</td>
      <td>\${o.address || ""}</td>
      <td>\${o.postalCode || ""}</td>
      <td>\${o.city || ""}</td>
      <td>\${o.province || ""}</td>
      <td>\${o.countryCode || ""}</td>
      <td>\${o.phone || ""}</td>
      <td>\${o.product || ""}\${lineasCanceladasHtml(o)}</td>
      <td>\${o.qty || 1}</td>
      <td\${o.skuMatched ? "" : ' style="color:#991b1b;font-weight:600"'}>\${o.sku || ""}\${o.skuMatched ? "" : " ⚠"}</td>
      <td>\${o.price || ""}</td>
      <td>\${trackingCell(o)}</td>
      <td><input type="text" class="notas-input" data-id="\${o.id}" value="\${escapeAttr(o.notas)}" placeholder="Notas..."></td>
    </tr>
  \`).join("");
  document.querySelectorAll("#" + platformId + "-table .notas-input").forEach(inp => {
    inp.addEventListener("focus", () => { editing = true; });
    inp.addEventListener("blur", () => {
      editing = false;
      const order = orders.find(o => String(o.id) === inp.dataset.id);
      if (order) order.notas = inp.value;
      fetch("/api/pedidos/shopify/meta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: inp.dataset.id, notas: inp.value }),
      });
    });
  });
  document.querySelectorAll("#" + platformId + "-table [data-cancel-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const order = orders.find(o => String(o.id) === btn.dataset.cancelId);
      if (!order) return;
      const nuevoEstado = !order.cancelado;
      if (nuevoEstado && !confirm("¿Cancelar el pedido " + order.orderRef + "?")) return;
      order.cancelado = nuevoEstado;
      await fetch("/api/pedidos/shopify/meta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: order.id, cancelado: nuevoEstado }),
      });
      renderMarketplace(platformId);
    });
  });
  document.querySelectorAll("#" + platformId + "-table [data-sustituir-order-id]").forEach(btn => {
    btn.addEventListener("click", () => abrirSustituirDesdePedido(btn.dataset.sustituirOrderId));
  });
  document.querySelectorAll("#" + platformId + "-table [data-reposicion-order-id]").forEach(btn => {
    btn.addEventListener("click", () => abrirReposicionDesdePedido(btn.dataset.reposicionOrderId));
  });
  document.querySelectorAll("#" + platformId + "-table [data-gesto-comercial-order-id]").forEach(btn => {
    btn.addEventListener("click", () => abrirGestoComercialDesdePedido(btn.dataset.gestoComercialOrderId));
  });
}
initMarketplacePlatform("carrefour");
initMarketplacePlatform("maison-du-monde");
initMarketplacePlatform("worten");
initMarketplacePlatform("conforama");
initMarketplacePlatform("conforama-es");
initMarketplacePlatform("leroy-merlin");

// ---- Logística > Historial de cargas ----
// "Casos a revisar" (Jennifer, 2026-09-16): incidencias con Furniture — se
// recalculan en el backend cada vez que se abre esta pantalla (ver
// /casos-revisar en orders-store.js), no hay que marcar nada a mano: en
// cuanto Furniture actualiza el estado en una subida de seguimiento, el
// caso desaparece solo.
// Nota de seguimiento manual por caso (Jennifer, 2026-09-16): un textarea
// por fila, se guarda al perder el foco — igual que "Notas"/"Observaciones"
// en otras tablas del sistema (ver editing/pendingRefresh más arriba).
async function guardarNotaCaso(orderId, tipo, key, nota) {
  await fetch("/api/casos-revisar/nota", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId, tipo, key, nota }),
  });
}
function renderCasosRevisarTable(casos, tbodySel, colspan, refColLabel) {
  const tbody = document.querySelector(tbodySel);
  tbody.innerHTML = casos.length
    ? casos.map(c => \`
      <tr>
        <td>\${refLabel(c)}</td>
        <td>\${c.name || ""}</td>
        <td>\${c[refColLabel]}</td>
        <td>\${c.estado}</td>
        <td>\${c.motivos.join(" · ")}</td>
        <td>\${c.seguimiento ? \`<a href="\${escapeAttr(c.seguimiento)}" target="_blank" rel="noopener" class="tracking-link">Ver</a>\` : "—"}</td>
        <td><input type="text" class="caso-nota-input" data-order-id="\${c.orderId}" data-tipo="\${c.tipo}" data-key="\${escapeAttr(c.key)}" value="\${escapeAttr(c.nota)}" placeholder="Notas de seguimiento..."></td>
      </tr>
    \`).join("")
    : \`<tr><td colspan="\${colspan}" style="color:var(--muted)">No hay casos a revisar ahora mismo.</td></tr>\`;
  tbody.querySelectorAll(".caso-nota-input").forEach(inp => {
    inp.addEventListener("focus", () => { editing = true; });
    inp.addEventListener("blur", () => {
      editing = false;
      guardarNotaCaso(inp.dataset.orderId, inp.dataset.tipo, inp.dataset.key, inp.value);
    });
  });
}
async function loadCasosRevisar() {
  const res = await fetch("/api/furniture/casos-revisar");
  const casos = await res.json();
  document.getElementById("casos-revisar-count").textContent = casos.length + " casos a revisar";
  renderCasosRevisarTable(casos, "#casos-revisar-table tbody", 7, "albaran");
}

// "Envíos SEUR" (Jennifer, 2026-10-01): sustituye a "Casos a revisar".
// Todas las líneas de las cargas de SEUR ya cerradas, filtrables por estado
// en SEUR para ir revisando, con notas amplias y botón "Reclamado a SEUR".
let enviosSeur = [];
async function loadCasosRevisarSeur(sinCorreo) {
  const res = await fetch("/api/seur/envios");
  enviosSeur = await res.json();
  const rellenar = (id, valores, primera) => {
    const sel = document.getElementById(id);
    const actual = sel.value;
    sel.innerHTML = '<option value="">' + primera + '</option>' + valores.map(v => '<option value="' + escapeAttr(v) + '">' + escapeAttr(v === "__sin__" ? "Sin estado (aún no hay seguimiento)" : v) + '</option>').join("");
    if (valores.includes(actual)) sel.value = actual;
  };
  const estados = [...new Set(enviosSeur.map(e => e.estadoSeur || "__sin__"))].sort();
  rellenar("envios-seur-estado", estados, "Todos los estados de SEUR");
  rellenar("envios-seur-pais", [...new Set(enviosSeur.map(e => e.pais).filter(Boolean))].sort(), "Todos los países");
  renderEnviosSeur();
  // Al abrir: se mira en Gmail si SEUR ha contestado y se repinta.
  if (!sinCorreo) {
    fetch("/api/seur/correos/actualizar", { method: "POST" }).then(r => r.json()).then(d => { if (d.ok) loadCasosRevisarSeur(true); }).catch(() => {});
  }
}

function renderEnviosSeur() {
  const q = document.getElementById("envios-seur-search").value.trim().toLowerCase();
  const estado = document.getElementById("envios-seur-estado").value;
  const reclamado = document.getElementById("envios-seur-reclamado").value;
  const pais = document.getElementById("envios-seur-pais").value;
  // Entregado = "entregado" o retirado de un punto pickup (mismo criterio
  // que el antiguo "Casos a revisar").
  const ocultarEntregados = document.getElementById("envios-seur-ocultar-entregados").checked;
  const esEntregado = e => /ENTREGAD/i.test(e.estadoSeur || "") || /retirado el envío/i.test(e.estadoSeur || "");
  const ocultarArchivados = document.getElementById("envios-seur-ocultar-archivados").checked;
  const soloAvisos = document.getElementById("envios-seur-solo-avisos").checked;
  const filas = enviosSeur.filter(e =>
    (!soloAvisos || (e.aviso24h && !e.reclamado && !e.archivado)) &&
    (!ocultarEntregados || !esEntregado(e)) &&
    (!ocultarArchivados || !e.archivado) &&
    (!q ||[e.ref, e.nombre, e.observaciones, e.nota].join(" ").toLowerCase().includes(q)) &&
    (!estado || (e.estadoSeur || "__sin__") === estado) &&
    (!reclamado || (reclamado === "si" ? e.reclamado : reclamado === "no" ? !e.reclamado : reclamado === "respuesta" ? e.correoNoLeidos > 0 : !!(e.correo && e.correo.mensajes && e.correo.mensajes.length))) &&
    (!pais || e.pais === pais));
  document.getElementById("envios-seur-count").textContent = filas.length + " de " + enviosSeur.length + " líneas enviadas por SEUR";
  const pendientesReclamar = enviosSeur.filter(e => e.aviso24h && !e.reclamado && !e.archivado).length;
  const avisoEl = document.getElementById("envios-seur-aviso");
  avisoEl.style.display = pendientesReclamar ? "" : "none";
  avisoEl.textContent = "⚠ " + pendientesReclamar + (pendientesReclamar === 1 ? " envío sigue" : " envíos siguen") + " como «El envío ha sido registrado» más de 24 h después de cerrar la carga — hay que reclamarlos a SEUR. Marca «⚠ Solo para reclamar» para verlos.";
  actualizarAvisoMenuSeur(pendientesReclamar);
  const diaSemana = iso => iso ? ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"][new Date(iso + "T12:00:00Z").getUTCDay()] : "";
  const fechaCorta = iso => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "";
  const tbody = document.querySelector("#envios-seur-table tbody");
  tbody.innerHTML = filas.length ? filas.map(e => {
    const i = enviosSeur.indexOf(e);
    const estadoTxt = e.estadoSeur
      ? escapeAttr(e.estadoSeur) + (e.fechaSituacion ? '<br><span style="color:var(--muted);font-size:11px">' + escapeAttr(e.fechaSituacion) + '</span>' : "")
      : '<span style="color:var(--muted)">Sin seguimiento</span>';
    const avisoCelda = e.aviso24h && !e.archivado ? '<br><span class="badge" style="background:' + (e.reclamado ? "#fde68a;color:#78350f" : "#fee2e2;color:#b91c1c") + '">⚠ Sin recoger ' + Math.floor(e.horasDesdeCierre / 24) + ' día(s) tras cerrar la carga' + (e.reclamado ? " (reclamado)" : " — reclamar") + '</span>' : "";
    const seguimiento = avisoCelda + (e.seguimiento ? ' <a href="' + escapeAttr(e.seguimiento) + '" target="_blank" rel="noopener" class="tracking-link">Ver</a>' : "");
    const recl = e.reclamado
      ? '<span class="badge" style="background:#fde68a;color:#78350f">✔ Reclamado ' + (e.fechaReclamado ? new Date(e.fechaReclamado).toLocaleDateString("es-ES") : "") + '</span><br><button type="button" class="secondary envio-seur-reclamar" data-i="' + i + '" data-valor="0" style="margin-top:4px;padding:2px 8px;font-size:11px">Quitar</button>'
      : '<button type="button" class="secondary envio-seur-reclamar" data-i="' + i + '" data-valor="1">Reclamado a SEUR</button>';
    // Correo con SEUR (Jennifer, 2026-10-02).
    const nMsg = e.correo && e.correo.mensajes ? e.correo.mensajes.length : 0;
    const correoBtn = '<br><button type="button" class="secondary envio-seur-correo" data-i="' + i + '" style="margin-top:4px;padding:2px 8px;font-size:11px' + (e.correoNoLeidos ? ';background:#dc2626;color:#fff;border-color:#dc2626' : '') + '">' +
      (e.correoNoLeidos ? "💬 SEUR ha respondido (" + e.correoNoLeidos + ")" : nMsg ? "💬 Ver conversación (" + nMsg + ")" : "✉ Escribir a SEUR") + '</button>';
    return '<tr' + (e.reclamado ? ' style="background:rgba(253,230,138,.25)"' : '') + '>' +
      '<td style="white-space:nowrap">' + (e.sinCarga ? "" : '<span style="font-size:11px;color:var(--muted)">' + escapeAttr(e.diaCarga || diaSemana(e.fechaCarga)) + '</span><br>') + '<strong>' + escapeAttr(fechaCorta(e.fechaCarga)) + '</strong>' + (e.sinCarga ? '<br><span style="color:var(--muted);font-size:11px" title="Envío anterior a las cargas del sistema: sale aquí porque tiene conversación con SEUR">anterior a las cargas</span>' : '') + '</td>' +
      '<td><strong>' + escapeAttr(e.ref) + '</strong></td>' +
      '<td>' + escapeAttr(e.nombre || "") + '</td>' +
      '<td>' + escapeAttr(e.pais || "") + '</td>' +
      '<td>' + escapeAttr(e.observaciones || "") + '</td>' +
      '<td>' + estadoTxt + seguimiento + '</td>' +
      '<td>' + recl + correoBtn + '</td>' +
      '<td><textarea class="envio-seur-nota" data-i="' + i + '" rows="3" style="width:100%;min-width:320px;resize:vertical" placeholder="Notas...">' + escapeAttr(e.nota || "") + '</textarea></td>' +
      '<td>' + (e.archivado
        ? '<span class="badge" style="background:#e5e7eb;color:#374151">Archivado ' + (e.fechaArchivado ? new Date(e.fechaArchivado).toLocaleDateString("es-ES") : "") + '</span><br><button type="button" class="secondary envio-seur-archivar" data-i="' + i + '" data-valor="0" style="margin-top:4px;padding:2px 8px;font-size:11px">Desarchivar</button>'
        : '<button type="button" class="secondary envio-seur-archivar" data-i="' + i + '" data-valor="1" title="No hay nada más que revisar en este envío">Archivar</button>') + '</td>' +
      '</tr>';
  }).join("") : '<tr><td colspan="9" style="color:var(--muted)">No hay líneas con estos filtros.</td></tr>';
  tbody.querySelectorAll(".envio-seur-nota").forEach(ta => {
    ta.addEventListener("focus", () => { editing = true; });
    ta.addEventListener("blur", async () => {
      editing = false;
      const e = enviosSeur[Number(ta.dataset.i)];
      if (ta.value === (e.nota || "")) return;
      e.nota = ta.value;
      await fetch("/api/seur/envios/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: e.orderId, ref: e.ref, nota: ta.value }) });
    });
  });
  tbody.querySelectorAll(".envio-seur-correo").forEach(btn => {
    btn.addEventListener("click", () => abrirCorreoSeur(enviosSeur[Number(btn.dataset.i)]));
  });
  tbody.querySelectorAll(".envio-seur-archivar").forEach(btn => {
    btn.addEventListener("click", async () => {
      const e = enviosSeur[Number(btn.dataset.i)];
      const valor = btn.dataset.valor === "1";
      btn.disabled = true;
      const res = await fetch("/api/seur/envios/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: e.orderId, ref: e.ref, archivado: valor }) });
      const d = await res.json().catch(() => ({}));
      if (!d.ok) { alert("No se pudo guardar."); btn.disabled = false; return; }
      e.archivado = valor;
      e.fechaArchivado = d.info.fechaArchivado;
      renderEnviosSeur();
    });
  });
  tbody.querySelectorAll(".envio-seur-reclamar").forEach(btn => {
    btn.addEventListener("click", async () => {
      const e = enviosSeur[Number(btn.dataset.i)];
      const valor = btn.dataset.valor === "1";
      btn.disabled = true;
      const res = await fetch("/api/seur/envios/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: e.orderId, ref: e.ref, reclamado: valor }) });
      const d = await res.json().catch(() => ({}));
      if (!d.ok) { alert("No se pudo guardar."); btn.disabled = false; return; }
      e.reclamado = valor;
      e.fechaReclamado = d.info.fechaReclamado;
      renderEnviosSeur();
    });
  });
}
// Conversación por email con SEUR de una línea (Jennifer, 2026-10-02): se
// escribe y se contesta desde aquí; sale desde su Gmail y las respuestas de
// SEUR se leen del mismo Gmail (cada hora y al abrir Envíos SEUR).
let correoSeurAbierto = null;
function pintarCorreoSeur() {
  const e = correoSeurAbierto;
  const mensajes = (e.correo && e.correo.mensajes) || [];
  document.getElementById("seur-correo-titulo").textContent = "SEUR · " + e.ref + " · " + (e.nombre || "");
  document.getElementById("seur-correo-destino").textContent = "Para: " + (["ES", "PT"].includes(String(e.pais || "").toUpperCase()) ? "atencionalcliente@seur.com (63235, nacional)" : "customerservice@seur.com (48297, internacional)") + (e.numeroExpedicion ? " · Expedición " + e.numeroExpedicion : "") + (e.estadoSeur ? " · Estado: " + e.estadoSeur : "");
  document.getElementById("seur-correo-mensajes").innerHTML = mensajes.length
    ? mensajes.map(m => '<div style="border-radius:8px;padding:8px 10px;' + (m.deSeur ? "background:#fef3c7;border:1px solid #f59e0b;margin-right:40px" : "background:#ecfdf5;border:1px solid #34d399;margin-left:40px") + '">' +
        '<div style="font-size:11px;color:var(--muted);margin-bottom:4px"><strong>' + (m.deSeur ? "SEUR" : "Nosotros") + '</strong> · ' + escapeAttr(m.de || "") + ' · ' + new Date(m.fecha).toLocaleString("es-ES") + '</div>' +
        '<div style="white-space:pre-wrap;font-size:13px">' + escapeAttr(m.texto || "") + '</div></div>').join("")
    : '<div style="color:var(--muted)">Todavía no has escrito a SEUR por este envío.</div>';
  const caja = document.getElementById("seur-correo-mensajes");
  caja.scrollTop = caja.scrollHeight;
  document.getElementById("seur-correo-enviar").textContent = mensajes.length ? "Responder a SEUR" : "Enviar a SEUR";
}
async function abrirCorreoSeur(e) {
  correoSeurAbierto = e;
  document.getElementById("seur-correo-texto").value = "";
  pintarCorreoSeur();
  document.getElementById("seur-correo-overlay").classList.add("open");
  if (e.correoNoLeidos) {
    e.correoNoLeidos = 0;
    await fetch("/api/seur/envios/visto", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: e.orderId, ref: e.ref }) });
    renderEnviosSeur();
  }
}
document.getElementById("seur-correo-cerrar").addEventListener("click", () => document.getElementById("seur-correo-overlay").classList.remove("open"));
document.getElementById("seur-correo-enviar").addEventListener("click", async () => {
  const e = correoSeurAbierto;
  const texto = document.getElementById("seur-correo-texto").value.trim();
  if (!e || !texto) { alert("Escribe el mensaje para SEUR."); return; }
  const primera = !(e.correo && e.correo.mensajes && e.correo.mensajes.length);
  if (!confirm((primera ? "¿Enviar este email a SEUR" : "¿Responder a SEUR") + " por el envío " + e.ref + "?")) return;
  const btn = document.getElementById("seur-correo-enviar");
  btn.disabled = true;
  try {
    const res = await fetch(primera ? "/api/seur/envios/escribir" : "/api/seur/envios/responder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: e.orderId, ref: e.ref, texto }) });
    const d = await res.json().catch(() => ({}));
    if (!d.ok) {
      alert("No se ha podido enviar: " + (d.error === "script_sin_actualizar" || /no_json/.test(d.error || "") ? "falta actualizar el script de Google (Aviso almacén) a la versión nueva." : (d.error || res.status)));
      return;
    }
    mostrarAvisoBreve(primera ? "Email enviado a SEUR (" + e.ref + ")." : "Respuesta enviada a SEUR (" + e.ref + ").");
    document.getElementById("seur-correo-overlay").classList.remove("open");
    await loadCasosRevisarSeur();
  } catch (err) {
    alert("No se ha podido enviar: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

try {
  const guardado = localStorage.getItem("enviosSeurOcultarEntregados");
  if (guardado !== null) document.getElementById("envios-seur-ocultar-entregados").checked = guardado === "1";
} catch (err) {}
document.getElementById("envios-seur-ocultar-archivados").addEventListener("change", renderEnviosSeur);
document.getElementById("envios-seur-solo-avisos").addEventListener("change", renderEnviosSeur);
// Aviso en el menú "Envíos SEUR" con los envíos por reclamar, visible
// desde cualquier pantalla (se calcula al abrir la app y cada hora).
function actualizarAvisoMenuSeur(n, respuestas) {
  const link = document.querySelector('[data-logistica="casos-revisar-seur"]');
  if (!link) return;
  if (respuestas === undefined) respuestas = enviosSeur.filter(e => e.correoNoLeidos > 0).length;
  link.innerHTML = "Envíos SEUR" + (n ? ' <span class="badge" style="background:#dc2626;color:#fff;padding:1px 6px">⚠ ' + n + '</span>' : "") +
    (respuestas ? ' <span class="badge" style="background:#f59e0b;color:#fff;padding:1px 6px" title="Respuestas de SEUR sin leer">💬 ' + respuestas + '</span>' : "");
}
async function comprobarAvisosSeur() {
  try {
    const res = await fetch("/api/seur/envios");
    const lista = await res.json();
    actualizarAvisoMenuSeur(lista.filter(e => e.aviso24h && !e.reclamado && !e.archivado).length, lista.filter(e => e.correoNoLeidos > 0).length);
  } catch (err) {}
}
comprobarAvisosSeur();
setInterval(comprobarAvisosSeur, 3600000);
document.getElementById("envios-seur-ocultar-entregados").addEventListener("change", e => {
  try { localStorage.setItem("enviosSeurOcultarEntregados", e.target.checked ? "1" : "0"); } catch (err) {}
  renderEnviosSeur();
});
["envios-seur-estado", "envios-seur-reclamado", "envios-seur-pais"].forEach(id => document.getElementById(id).addEventListener("change", renderEnviosSeur));
document.getElementById("envios-seur-search").addEventListener("input", renderEnviosSeur);

async function loadHistorialCargas() {
  const [pendRes, cargasRes] = await Promise.all([
    fetch("/api/inventario/pendientes"),
    fetch("/api/cargas"),
  ]);
  backorders = await pendRes.json();
  const cargas = (await cargasRes.json()).filter(c => c.estado === "cerrada");
  cargas.sort((a, b) => new Date(b.fechaCierre) - new Date(a.fechaCierre));
  renderHistorialCargas(cargas);
}

function renderHistorialCargas(cargas) {
  document.getElementById("historial-cargas-count").textContent = cargas.length + " cargas cerradas";
  const cont = document.getElementById("historial-cargas-list");
  if (!cargas.length) {
    cont.innerHTML = '<p style="margin:0 2rem;color:var(--muted)">Todavía no se ha cerrado ninguna carga.</p>';
    return;
  }
  cont.innerHTML = cargas.map(c => {
    const pedidos = allOrders.filter(o => o.cargaId === c.id);
    const filas = pedidos.map(o => \`<tr\${o.cancelado ? ' class="fila-cancelada"' : ""}>\${furnitureRowCells(o)}<td><button type="button" class="secondary sacar-carga-historial-btn" data-id="\${o.id}">Sacar de la carga</button></td></tr>\`).join("");
    return \`
    <details class="carga-historial-card">
      <summary>\${formatCargaTitulo(c)} — \${pedidos.length} pedidos — cerrada el \${new Date(c.fechaCierre).toLocaleDateString("es-ES")}</summary>
      <div class="toolbar" style="padding:0 1rem 0.5rem">
        <a class="secondary" href="/api/cargas/export?cargaId=\${encodeURIComponent(c.id)}" style="text-decoration:none">Descargar Excel Furniture</a>
        <button type="button" class="secondary listado-almacen-btn" data-id="\${c.id}">Listado almacén</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Pedido</th><th>Plataforma</th><th>Nombre</th><th>Producto comprado</th><th>Servicios adicionales</th><th>Artículos / Llegada</th><th>Notas</th><th>Acciones</th></tr></thead>
          <tbody>\${filas}</tbody>
        </table>
      </div>
    </details>
  \`;
  }).join("");

  // Sacar un pedido de una carga YA CERRADA (Jennifer, 2026-09-18: metió
  // BEZEN12212 en una carga como prueba y no tenía forma de revertirlo, ya
  // que "Sacar de la carga" solo existía para la carga abierta). Pide
  // confirmación porque, a diferencia de "para tener en cuenta", esto puede
  // afectar a un pedido que ya se consideraba listo para salir.
  document.querySelectorAll("#historial-cargas-list .sacar-carga-historial-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      const order = allOrders.find(o => o.id === id);
      if (!confirm("¿Sacar " + (order ? refLabel(order) : "este pedido") + " de esta carga cerrada? Volverá a la lista de pendientes de Furniture.")) return;
      await fetch("/api/cargas/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: id }),
      });
      if (order) order.cargaId = null;
      loadHistorialCargas();
    });
  });

  document.querySelectorAll("#historial-cargas-list .item-recibido-check").forEach(chk => {
    chk.addEventListener("change", async () => {
      await fetch("/api/inventario/pendientes/" + encodeURIComponent(chk.dataset.id) + "/resolver", { method: "POST" });
      const b = backorders.find(x => x.id === chk.dataset.id);
      if (b) b.recibidoFabrica = chk.checked;
    });
  });

  document.querySelectorAll("#historial-cargas-list .notas-input").forEach(inp => {
    inp.addEventListener("focus", () => { editing = true; });
    inp.addEventListener("blur", () => {
      editing = false;
      const order = allOrders.find(o => o.id === Number(inp.dataset.id));
      if (order) order.notas = inp.value;
      saveMeta(inp.dataset.id, { notas: inp.value });
    });
  });
}

// ---- Logística > SEUR ----
// A diferencia de Furniture (selección manual), aquí el sistema mete el
// pedido solo en cuanto detecta stock real (ver processInventory en
// orders-store.js) — esta pantalla es solo para ver las cargas ya formadas,
// cerrarlas, y resolver los pocos casos que sí necesitan una decisión
// manual (pedidos de 2+ colchones con disponibilidad mixta).
function formatSeurCargaTitulo(carga) {
  const fecha = new Date(carga.fecha + "T00:00:00");
  return "Carga " + carga.dia + " · " + fecha.toLocaleDateString("es-ES");
}

function seurOrderRowCells(o, refSuffix) {
  return \`
    <td>\${refLabel(o)}\${refSuffix || ""}\${valdemoroTag(o)}</td>
    <td>\${o.name}</td>
    <td>\${o.furnitureAddress || o.address || ""}</td>
    <td>\${o.phone}</td>
    <td>\${o.product}</td>
  \`;
}

async function loadSeur() {
  const [cargasRes, backRes] = await Promise.all([
    fetch("/api/cargas"),
    fetch("/api/inventario/pendientes"),
  ]);
  allCargas = await cargasRes.json();
  backorders = await backRes.json();
  renderSeur();
}

function renderSeurDecisionBox() {
  const pendientes = allOrders.filter(o => o.seurMixedPending);
  const box = document.getElementById("seur-decision-box");
  box.style.display = pendientes.length ? "block" : "none";
  document.getElementById("seur-decision-list").innerHTML = pendientes.map(o => {
    const detalle = (o.seurMixedInfo?.colchones || []).map(c =>
      \`<li>\${c.stockModel} (\${c.talla}): \${c.disponible} de \${c.cantidad} en stock</li>\`
    ).join("");
    return \`
      <div class="seur-decision-card">
        <strong>\${refLabel(o)}</strong> — \${o.name}
        <ul>\${detalle}</ul>
        <button type="button" class="seur-dividir-btn" data-id="\${o.id}">Dividir ahora (sale ya lo que hay en stock)</button>
      </div>
    \`;
  }).join("");
  document.querySelectorAll(".seur-dividir-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const order = allOrders.find(o => String(o.id) === btn.dataset.id);
      if (!order) return;
      if (!confirm('¿Dividir ' + refLabel(order) + '? Lo que hay en stock sale ya por SEUR; el resto se queda pendiente en Luso/New con referencia "2".')) return;
      const res = await fetch("/api/pedidos/shopify/seur-dividir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: order.id }),
      });
      const updated = await res.json();
      Object.assign(order, updated);
      loadSeur();
      if (document.getElementById("view-shopify").style.display !== "none") render(currentFiltered());
    });
  });
}

// Pedidos de SEUR sacados a mano de su carga (Jennifer, 2026-09-29): igual
// que en Furniture, se quedan aquí para volver a meterlos en la carga de
// hoy o de mañana, o marcar que no han salido (↩, vuelven al proveedor).
function pedidosSeurFueraDeCarga() {
  return allOrders.filter(o => o.agencia === "SEUR" && !o.cargaId && !o.cancelado && o.shippingStatus !== "fulfilled"
    && backorders.some(b => String(b.orderId) === String(o.id) && b.estado === "cubierto" && String(b.id).endsWith("-cubierto")));
}
// Ventana de cargas de SEUR a la vista (Jennifer, 2026-09-30): los 5
// próximos días laborables desde hoy (primera, el 01/10). Las cargas
// programadas más allá se ven aparte, plegadas. Mismo cálculo que
// diasCargaSeur en orders-store.js.
function hoyMadrid() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
}
function finVentanaSeur() {
  const hoy = hoyMadrid();
  const d = new Date((hoy < "2026-10-01" ? "2026-10-01" : hoy) + "T12:00:00Z");
  let n = 0, ultimo = "";
  while (n < 5) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) { n++; ultimo = d.toISOString().slice(0, 10); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return ultimo;
}
function errorFechaSeur(fecha) {
  if (!fecha) return "Elige primero el día.";
  const w = new Date(fecha + "T12:00:00Z").getUTCDay();
  if (w === 0 || w === 6) return "No hay cargas de SEUR ni sábado ni domingo.";
  if (fecha < hoyMadrid()) return "Esa fecha ya ha pasado.";
  return null;
}
function primerDiaSeur() {
  const abiertas = allCargas.filter(c => c.tipo === "seur" && c.estado === "abierta" && c.fecha >= hoyMadrid()).map(c => c.fecha).sort();
  return abiertas[0] || hoyMadrid();
}

function renderSeurFueraCarga() {
  const cont = document.getElementById("seur-fuera-carga");
  const pedidos = pedidosSeurFueraDeCarga();
  if (!pedidos.length) { cont.innerHTML = ""; return; }
  // Cualquier día laborable, aunque su carga aún no se vea (Jennifer,
  // 2026-09-30).
  const diaPorDefecto = primerDiaSeur();
  cont.innerHTML = \`
    <div class="carga-abierta-box tener-en-cuenta-box">
      <div class="toolbar"><h3 style="margin:0">Pedidos de SEUR fuera de carga</h3></div>
      <div class="inventario-count">\${pedidos.length} pedido(s) listos para SEUR que no están en ninguna carga</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Pedido</th><th>Nombre</th><th>Dirección</th><th>Teléfono</th><th>Producto</th><th></th></tr></thead>
          <tbody>\${pedidos.map(o => \`<tr>
            \${seurOrderRowCells(o, "")}
            <td>
              <input type="date" class="seur-readd-fecha" data-order-id="\${escapeAttr(String(o.id))}" min="\${hoyMadrid()}" value="\${diaPorDefecto}" />
              <button type="button" class="seur-readd-btn" data-order-id="\${escapeAttr(String(o.id))}">A la carga</button>
              \${noSalioButton(o)}
            </td>
          </tr>\`).join("")}</tbody>
        </table>
      </div>
    </div>\`;
  cont.querySelectorAll(".seur-readd-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const fecha = [...cont.querySelectorAll(".seur-readd-fecha")].find(s => s.dataset.orderId === btn.dataset.orderId).value;
      const error = errorFechaSeur(fecha);
      if (error) { alert(error); return; }
      const res = await fetch("/api/cargas/seur/add", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderIds: [btn.dataset.orderId], fecha }),
      });
      if (!res.ok) { alert("No se ha podido añadir a la carga."); return; }
      await loadOrders();
      loadSeur();
    });
  });
}

function renderSeurCargas() {
  renderSeurFueraCarga();
  const cargasAbiertas = allCargas.filter(c => c.tipo === "seur" && c.estado === "abierta").sort((a, b) => a.fecha.localeCompare(b.fecha));
  const cont = document.getElementById("seur-cargas-list");
  if (!cargasAbiertas.length) {
    cont.innerHTML = '<p style="margin:1rem 2rem;color:var(--muted)">No hay ninguna carga de SEUR abierta todavía.</p>';
    return;
  }
  // Las cargas más allá de los 5 días laborables a la vista (programadas a
  // petición del cliente, Jennifer, 2026-09-30) van aparte, plegadas.
  const fin = finVentanaSeur();
  const aLaVista = cargasAbiertas.filter(c => c.fecha <= fin);
  const programadas = cargasAbiertas.filter(c => c.fecha > fin && seurEnviosDeCarga(c.id).length);
  const tarjeta = carga => {
    const filas = seurEnviosDeCarga(carga.id);
    const filasHtml = filas.map(({ o, refSuffix, backorderId, backorder }) => {
      const cells = backorder && (backorder.gestoComercial || backorder.reposicion) ? seurBackorderRowCells(backorder) : seurOrderRowCells(o, refSuffix);
      const quitarLabel = backorder && backorder.gestoComercial ? "El gesto comercial no vino: quitar" : (backorder && backorder.reposicion ? "La reposición no vino: quitar" : "El colchón no vino: quitar");
      // Mover a cualquier día laborable (Jennifer, 2026-09-30).
      const moverHtml = \`<div class="mover-seur"><input type="date" class="mover-seur-fecha" min="\${hoyMadrid()}" /><button type="button" class="secondary mover-seur-btn" data-order-id="\${backorderId ? "" : escapeAttr(String(o.id))}" data-backorder-id="\${backorderId ? escapeAttr(backorderId) : ""}">Mover a ese día</button></div>\`;
      return \`
      <tr\${o.cancelado ? ' class="fila-cancelada"' : ""}>
        \${cells}
        <td>\${backorderId
          ? \`<button type="button" class="quitar-seur-btn" data-id="\${backorderId}">\${quitarLabel}</button>\`
          : \`<button type="button" class="sacar-carga-btn sacar-carga-seur-btn" data-order-id="\${escapeAttr(String(o.id))}">Sacar de la carga</button>\`}\${moverHtml}</td>
      </tr>
    \`;
    }).join("");
    return \`
      <div class="carga-abierta-box">
        <div class="toolbar">
          <h3 style="margin:0">\${formatSeurCargaTitulo(carga)}</h3>
          <button type="button" class="secondary descargar-seur-btn" data-id="\${carga.id}">Descargar fichero SEUR</button>
          <button type="button" class="secondary listado-almacen-seur-btn" data-id="\${carga.id}">Listado almacén</button>
          <button type="button" class="secondary resumen-almacen-seur-btn" data-id="\${carga.id}" data-titulo="\${escapeAttr(formatCargaTitulo(carga))}" title="Manda al email del almacén el listado de esta carga en una etiqueta 15×10 para imprimir">📧 Enviar resumen al almacén (15×10)</button>
          <button type="button" class="cerrar-carga-seur-btn" data-id="\${carga.id}">Cerrar carga</button>
        </div>
        <div class="inventario-count">\${filas.length} pedidos en esta carga</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Pedido</th><th>Nombre</th><th>Dirección</th><th>Teléfono</th><th>Producto</th><th></th></tr></thead>
            <tbody>\${filasHtml}</tbody>
          </table>
        </div>
      </div>
    \`;
  };
  const nProgramados = programadas.reduce((n, c) => n + seurEnviosDeCarga(c.id).length, 0);
  // Aviso de cargas con la fecha ya pasada y sin cerrar (Jennifer,
  // 2026-10-01: "si una carga no se ha cerrado, me salga un aviso como que
  // está pendiente de cerrar para poderla revisar y que se cierre").
  const sinCerrar = cargasAbiertas.filter(c => c.fecha < hoyMadrid());
  const avisoSinCerrar = sinCerrar.length
    ? '<div class="aviso-sin-cerrar">⚠ <strong>Carga' + (sinCerrar.length > 1 ? "s" : "") + " de SEUR pendiente" + (sinCerrar.length > 1 ? "s" : "") + " de cerrar:</strong> "
      + sinCerrar.map(c => formatSeurCargaTitulo(c) + " (" + seurEnviosDeCarga(c.id).length + " envíos)").join(", ")
      + ". Revísala" + (sinCerrar.length > 1 ? "s" : "") + " abajo y ciérrala" + (sinCerrar.length > 1 ? "s" : "") + " si ya salió.</div>"
    : "";
  cont.innerHTML = avisoSinCerrar + aLaVista.map(tarjeta).join("") + (programadas.length ? \`
    <details class="seur-programados">
      <summary>Envíos programados más adelante — \${nProgramados} envío(s) en \${programadas.length} carga(s): \${programadas.map(c => new Date(c.fecha + "T00:00:00").toLocaleDateString("es-ES")).join(", ")}</summary>
      \${programadas.map(tarjeta).join("")}
    </details>\` : "");
  document.querySelectorAll(".cerrar-carga-seur-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const carga = allCargas.find(c => c.id === btn.dataset.id);
      if (!carga) return;
      if (!confirm("¿Cerrar " + formatSeurCargaTitulo(carga) + "? Pasará al historial.")) return;
      await fetch("/api/cargas/close", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cargaId: carga.id }),
      });
      loadSeur();
    });
  });
  document.querySelectorAll(".sacar-carga-seur-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const order = allOrders.find(o => String(o.id) === btn.dataset.orderId);
      if (!confirm("¿Sacar " + (order ? refLabel(order) : "este pedido") + " de la carga de SEUR?\\n\\nQuedará en \\"Pedidos de SEUR fuera de carga\\", abajo, para volver a meterlo en otra carga cuando quieras.")) return;
      await fetch("/api/cargas/remove", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: order ? order.id : btn.dataset.orderId }),
      });
      if (order) order.cargaId = null;
      loadSeur();
    });
  });
  document.querySelectorAll(".quitar-seur-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const b = backorders.find(x => x.id === btn.dataset.id);
      const msg = b && b.gestoComercial
        ? "¿Este gesto comercial se ha quedado sin preparar? Se saca de esta carga y vuelve a pendiente en Polival, con referencia nueva para cuando salga de verdad."
        : "¿El colchón no vino en el camión? Se saca de esta carga y vuelve a pendiente en Luso/New, con referencia nueva para cuando salga de verdad.";
      if (!confirm(msg)) return;
      const res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(btn.dataset.id) + "/deshacer-seur", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        alert(data.error || "No se pudo deshacer.");
        return;
      }
      loadSeur();
    });
  });
  document.querySelectorAll(".descargar-seur-btn").forEach(btn => {
    btn.addEventListener("click", () => descargarFicheroSeur(btn.dataset.id));
  });
  document.querySelectorAll(".mover-seur-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const fecha = btn.parentElement.querySelector(".mover-seur-fecha").value;
      const error = errorFechaSeur(fecha);
      if (error) { alert(error); return; }
      const body = btn.dataset.backorderId ? { backorderId: btn.dataset.backorderId, fecha } : { orderId: btn.dataset.orderId, fecha };
      const res = await fetch("/api/cargas/seur/mover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) { alert(data.error || "No se ha podido mover."); return; }
      await loadOrders();
      loadSeur();
    });
  });
}

// Antes de descargar avisa si algún artículo no tiene un peso conocido
// (tabla de Pesos SEUR) — el fichero se genera igualmente con esa casilla
// en blanco, pero mejor saberlo antes de subirlo a Seur.
async function descargarFicheroSeur(cargaId) {
  const res = await fetch("/api/cargas/seur/export-avisos?cargaId=" + encodeURIComponent(cargaId));
  const data = await res.json();
  if (data.avisos && data.avisos.length) {
    const seguir = confirm(data.avisos.length + " aviso(s):\\n\\n" + data.avisos.join("\\n") + "\\n\\n¿Descargar igualmente?");
    if (!seguir) return;
  }
  // En .xlsx (Jennifer, 2026-10-01). Todas las casillas van como texto
  // salvo los números de verdad, para que el CP y el teléfono no pierdan
  // ceros a la izquierda.
  const r = await fetch("/api/cargas/seur/export?formato=json&cargaId=" + encodeURIComponent(cargaId));
  if (!r.ok) { alert("No se pudo generar el fichero: " + (await r.text())); return; }
  const d = await r.json();
  const filas = d.filas.map(f => f.map((v, i) => ((i === 7 || i === 8) && v !== "" && !isNaN(Number(v)) ? Number(v) : v)));
  // Un fichero por código de remitente (63235 nacional, 48297
  // internacional): en SEUR se suben por separado (Jennifer, 2026-10-01).
  const porRemitente = {};
  for (const f of filas) (porRemitente[f[9] || "SIN_REMITENTE"] = porRemitente[f[9] || "SIN_REMITENTE"] || []).push(f);
  const codigos = Object.keys(porRemitente).sort();
  for (let i = 0; i < codigos.length; i++) {
    if (i) await new Promise(ok => setTimeout(ok, 800));
    const ws = XLSX.utils.aoa_to_sheet([d.cabeceras, ...porRemitente[codigos[i]]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
    XLSX.writeFile(wb, "SEUR_" + d.fecha + "_" + codigos[i] + ".xlsx");
  }
  if (codigos.length > 1) alert("Se han descargado " + codigos.length + " ficheros, uno por remitente (" + codigos.join(" y ") + "). Súbelos a SEUR por separado.");
}

// Une los dos orígenes de envío de una carga de SEUR: pedidos que se
// asignaron solos al procesarse (order.cargaId) y colchones que se quedaron
// pendientes en Luso/New y se asignaron al marcarlos "listo para SEUR"
// (backorder.cargaId) — un pedido dividido puede aparecer en ambos, con
// referencias distintas (ver refSuffix). Los gestos comerciales (almohada
// de regalo, Jennifer, 2026-09-22) entran por el mismo camino que un
// colchón suelto "listo para SEUR" — se expone el backorder completo
// (no solo su id) para que el renderer sepa mostrar la almohada de regalo
// en vez del producto real del pedido original.
function seurEnviosDeCarga(cargaId) {
  const directos = allOrders.filter(o => o.agencia === "SEUR" && o.cargaId === cargaId)
    .map(o => ({ o, refSuffix: "", backorderId: null, backorder: null }));
  const divididos = backorders.filter(b => (b.tipo === "colchon" || b.gestoComercial) && b.cargaId === cargaId)
    .map(b => {
      const o = allOrders.find(x => x.orderNumber === b.orderNumber);
      return o ? { o, refSuffix: b.refSuffix || "", backorderId: b.id, backorder: b } : null;
    }).filter(Boolean);
  return [...directos, ...divididos];
}

// Fila de un gesto comercial o de una reposición de colchón por SEUR
// dentro de una carga de SEUR (Jennifer, 2026-09-22) — misma forma que
// seurOrderRowCells, pero la referencia (con su prefijo GC/REP) y el
// "producto" vienen del backorder (la almohada de regalo, o el colchón de
// reposición), no del pedido original (que puede llevar un artículo
// totalmente distinto, o ya estar entregado/cancelado).
function seurBackorderRowCells(b) {
  const o = allOrders.find(x => x.orderNumber === b.orderNumber) || {};
  return \`
    <td>\${refLabel(b)}\${valdemoroTag(o)}</td>
    <td>\${o.name || ""}</td>
    <td>\${o.furnitureAddress || o.address || ""}</td>
    <td>\${o.phone || ""}</td>
    <td>\${b.cantidad}x \${b.stockModel} (\${b.talla})\${b.piezaTexto ? " — " + escapeAttr(b.piezaTexto) : ""}</td>
  \`;
}

function renderSeur() {
  renderSeurDecisionBox();
  renderSeurCargas();
}

async function loadHistorialCargasSeur() {
  const [backRes, cargasRes] = await Promise.all([
    fetch("/api/inventario/pendientes"),
    fetch("/api/cargas"),
  ]);
  backorders = await backRes.json();
  const cargas = (await cargasRes.json()).filter(c => c.tipo === "seur" && c.estado === "cerrada");
  cargas.sort((a, b) => new Date(b.fechaCierre) - new Date(a.fechaCierre));
  renderHistorialCargasSeur(cargas);
}

function renderHistorialCargasSeur(cargas) {
  document.getElementById("historial-cargas-seur-count").textContent = cargas.length + " cargas cerradas";
  const cont = document.getElementById("historial-cargas-seur-list");
  if (!cargas.length) {
    cont.innerHTML = '<p style="margin:0 2rem;color:var(--muted)">Todavía no se ha cerrado ninguna carga de SEUR.</p>';
    return;
  }
  cont.innerHTML = cargas.map(c => {
    const filas = seurEnviosDeCarga(c.id);
    const filasHtml = filas.map(({ o, refSuffix, backorder }) => \`<tr\${o.cancelado ? ' class="fila-cancelada"' : ""}>\${backorder && (backorder.gestoComercial || backorder.reposicion) ? seurBackorderRowCells(backorder) : seurOrderRowCells(o, refSuffix)}</tr>\`).join("");
    return \`
    <details class="carga-historial-card">
      <summary>\${formatSeurCargaTitulo(c)} — \${filas.length} pedidos — cerrada el \${new Date(c.fechaCierre).toLocaleDateString("es-ES")}</summary>
      <div class="toolbar" style="padding:0 1rem 0.5rem">
        <button type="button" class="secondary descargar-seur-historial-btn" data-id="\${c.id}">Descargar fichero SEUR</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Pedido</th><th>Nombre</th><th>Dirección</th><th>Teléfono</th><th>Producto</th></tr></thead>
          <tbody>\${filasHtml}</tbody>
        </table>
      </div>
    </details>
    \`;
  }).join("");
  document.querySelectorAll(".descargar-seur-historial-btn").forEach(btn => {
    btn.addEventListener("click", () => descargarFicheroSeur(btn.dataset.id));
  });
}

// Modal "¿Carga de hoy o de mañana?" al marcar un pendiente de colchón
// (Luso/New, sin pack) como "listo para SEUR" — ver resolveSeurBackorder en
// inventory-store.js.
let seurFechaModalBackorderId = null;
// "Sustituir modelo" (Jennifer, 2026-09-18): ofrece directamente los
// colchones con stock real de la misma talla, para no tener que salir del
// pedido a mirar Stock a mano. Recibe el objeto del pendiente ya cargado
// (desde Proveedores, o desde el propio pedido de Shopify/Carrefour, que lo
// busca al vuelo — ver abrirSustituirDesdePedido).
let sustituirBackorder = null;
let sustituirViaSeur = true;
// Transformar (Jennifer, 2026-09-28): medida de origen elegida (mismo
// modelo), o null si se sustituye por otro modelo.
let sustituirTransformarTalla = null;
async function abrirModalSustituir(b) {
  sustituirBackorder = b;
  sustituirTransformarTalla = null;
  const esPackTexto = b.esPack ? " (dentro de un pack, va " + b.tipoEnvio + ")" : "";
  document.getElementById("sustituir-modal-texto").textContent = refLabel(b) + " — pedido: " + b.cantidad + "x " + b.stockModel + " (" + b.talla + ")" + esPackTexto + ". Elige el sustituto:";
  document.getElementById("sustituir-query").value = "";
  const directoBtn = document.getElementById("sustituir-directo-btn");
  const hoyBtn = document.getElementById("sustituir-hoy-btn");
  const mananaBtn = document.getElementById("sustituir-manana-btn");
  directoBtn.disabled = true;
  hoyBtn.disabled = true;
  mananaBtn.disabled = true;
  directoBtn.style.display = "none";
  hoyBtn.style.display = "none";
  mananaBtn.style.display = "none";
  const listEl = document.getElementById("sustituir-alternativas-list");
  listEl.innerHTML = "Buscando alternativas...";
  document.getElementById("sustituir-modal-overlay").classList.add("open");
  const res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(b.id) + "/alternativas");
  const data = await res.json();
  sustituirViaSeur = data.viaSeur !== false;
  // Colchón de pack con FUR, o FPK cuya tapicería aún no ha salido: no
  // hace falta elegir fecha de SEUR, sale junto con la tapicería (Jennifer,
  // 2026-09-18) — se enseña un único botón "Sustituir" en vez de hoy/mañana.
  mostrarBotonesSustituir(false);
  const alternativas = data.alternativas || [];
  listEl.innerHTML = alternativas.length
    ? alternativas.map(a => \`<button type="button" class="alternativa-opcion" data-modelo="\${escapeAttr(a.stockModel)}"><span>\${a.stockModel}</span><span class="alternativa-stock">\${a.cantidad} en stock</span></button>\`).join("")
    : '<p style="color:var(--muted);font-size:13px">No hay otro colchón con stock real en esta talla ahora mismo.</p>';
  const transEl = document.getElementById("sustituir-transformar-list");
  const transformables = data.transformables || [];
  transEl.innerHTML = transformables.length
    ? transformables.map(t => \`<button type="button" class="alternativa-opcion transformar-opcion" data-talla="\${escapeAttr(t.talla)}"><span>\${escapeAttr(b.stockModel)} \${t.talla} → \${b.talla}</span><span class="alternativa-stock">\${t.cantidad} en stock</span></button>\`).join("")
    : '<p style="color:var(--muted);font-size:13px">No hay stock de este modelo en otras medidas.</p>';
  const todasOpciones = () => document.querySelectorAll("#sustituir-modal-overlay .alternativa-opcion");
  const activarBotones = () => { directoBtn.disabled = false; hoyBtn.disabled = false; mananaBtn.disabled = false; };
  listEl.querySelectorAll(".alternativa-opcion").forEach(btn => {
    btn.addEventListener("click", () => {
      todasOpciones().forEach(x => x.classList.remove("selected"));
      btn.classList.add("selected");
      sustituirTransformarTalla = null;
      mostrarBotonesSustituir(false);
      document.getElementById("sustituir-query").value = btn.dataset.modelo;
      activarBotones();
    });
  });
  transEl.querySelectorAll(".transformar-opcion").forEach(btn => {
    btn.addEventListener("click", () => {
      todasOpciones().forEach(x => x.classList.remove("selected"));
      btn.classList.add("selected");
      sustituirTransformarTalla = btn.dataset.talla;
      mostrarBotonesSustituir(true);
      document.getElementById("sustituir-query").value = "";
      activarBotones();
    });
  });
}
// Un colchón transformado sale siempre por Furniture (Jennifer, 2026-09-28):
// nunca se elige carga de SEUR, solo un botón "Transformar".
function mostrarBotonesSustituir(transformando) {
  const directoBtn = document.getElementById("sustituir-directo-btn");
  const conSeur = !transformando && sustituirViaSeur;
  directoBtn.textContent = transformando ? "Transformar" : "Sustituir";
  directoBtn.style.display = conSeur ? "none" : "";
  document.getElementById("sustituir-hoy-btn").style.display = conSeur ? "" : "none";
  document.getElementById("sustituir-manana-btn").style.display = conSeur ? "" : "none";
}
// Desde la ficha de un pedido (Shopify o Carrefour), Jennifer pidió poder
// sustituir sin salir a Proveedores — se busca al vuelo si ese pedido tiene
// algún colchón pendiente, suelto o de pack (2026-09-18).
async function abrirSustituirDesdePedido(orderId) {
  const res = await fetch("/api/inventario/pendientes");
  const todos = await res.json();
  const candidatos = todos.filter(b => String(b.orderId) === String(orderId) && b.tipo === "colchon" && b.estado === "pendiente");
  if (!candidatos.length) {
    alert("Este pedido no tiene ningún colchón pendiente de proveedor para sustituir.");
    return;
  }
  if (candidatos.length === 1) {
    abrirModalSustituir(candidatos[0]);
    return;
  }
  const opciones = candidatos.map((b, i) => (i + 1) + ") " + b.stockModel + " (" + b.talla + ")").join("\\n");
  const elegido = prompt("Este pedido tiene varios colchones pendientes. ¿Cuál quieres sustituir?\\n" + opciones);
  const idx = Number(elegido) - 1;
  if (candidatos[idx]) abrirModalSustituir(candidatos[idx]);
}

// Reposición de pieza rota (Jennifer, 2026-09-21): botón en cada pedido de
// cualquier canal de venta — abre un desplegable con los artículos reales
// de ESE pedido (resueltos contra el Catálogo por productId, igual que
// hace el motor normal) para elegir cuál hay que reponer, más un motivo
// libre. Crea un pendiente nuevo en Proveedores (Polival/Luso/New según
// el artículo) marcado como reposición — ver crearReposicion en
// inventory-store.js.
let reposicionOrderActual = null;
function abrirReposicionDesdePedido(orderId) {
  const order = allOrders.find(o => String(o.id) === String(orderId));
  if (!order || !order.items || !order.items.length) {
    alert("Este pedido no tiene artículos reconocidos para reponer.");
    return;
  }
  reposicionOrderActual = order;
  document.getElementById("reposicion-modal-texto").textContent = refLabel(order) + " — " + (order.name || "");
  document.getElementById("reposicion-item-select").innerHTML = order.items.map((item, i) => {
    const prod = catalogoProducts.find(p => p.productId === item.productId);
    const label = (prod ? prod.stockModel : (item.sku || "Artículo")) + (item.variantTitle ? " (" + item.variantTitle + ")" : "");
    return \`<option value="\${i}">\${escapeAttr(label)}</option>\`;
  }).join("");
  document.getElementById("reposicion-motivo").value = "";
  document.getElementById("reposicion-modal-result").textContent = "";
  document.getElementById("reposicion-agencia-select").value = "";
  document.getElementById("reposicion-recogida-select").value = "";
  document.getElementById("reposicion-destino-select").value = "";
  document.getElementById("reposicion-colchon-agencia-block").style.display = "none";
  document.getElementById("reposicion-colchon-recogida-block").style.display = "none";
  document.getElementById("reposicion-colchon-destino-block").style.display = "none";
  cargarPiezasReposicion();
  document.getElementById("reposicion-modal-overlay").classList.add("open");
}
// Al elegir el producto del pedido, se piden al servidor las piezas físicas
// reales de ESE artículo (mismas reglas que la exportación a Furniture —
// TAPA/CAJÓN/FONDO/etc. para un canapé, una sola opción para lo demás),
// en vez de dejar que Jennifer tenga que escribirlo a mano (Jennifer,
// 2026-09-21). También trae el "tipo" del artículo (Jennifer, 2026-09-22):
// si es "colchon", hay que enseñar la pregunta SEUR/FURNITURE — para
// cualquier otro tipo esa pregunta no aplica (siempre ha sido Furniture).
let ultimasPiezasReposicion = [];
let ultimoTipoReposicion = "";
async function cargarPiezasReposicion() {
  const piezaSelect = document.getElementById("reposicion-pieza-select");
  if (!reposicionOrderActual) return;
  const idx = Number(document.getElementById("reposicion-item-select").value);
  const item = reposicionOrderActual.items[idx];
  if (!item) return;
  piezaSelect.innerHTML = "<option>Cargando piezas...</option>";
  const res = await fetch("/api/inventario/reposicion/piezas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ item, services: reposicionOrderActual.services, productoTexto: reposicionOrderActual.product }),
  });
  const body = await res.json();
  ultimasPiezasReposicion = (res.ok && body.ok && body.piezas) ? body.piezas : [];
  ultimoTipoReposicion = (res.ok && body.ok) ? (body.tipo || "") : "";
  document.getElementById("reposicion-colchon-agencia-block").style.display = ultimoTipoReposicion === "colchon" ? "" : "none";
  if (ultimoTipoReposicion !== "colchon") {
    document.getElementById("reposicion-agencia-select").value = "";
    document.getElementById("reposicion-recogida-select").value = "";
    document.getElementById("reposicion-destino-select").value = "";
    document.getElementById("reposicion-colchon-recogida-block").style.display = "none";
    document.getElementById("reposicion-colchon-destino-block").style.display = "none";
  }
  if (!ultimasPiezasReposicion.length) {
    piezaSelect.innerHTML = \`<option value="">(sin desglose — se pedirá el artículo completo)</option>\`;
    return;
  }
  // value = índice dentro de ultimasPiezasReposicion (Jennifer, 2026-09-21):
  // "parte" (ej. "TAPA") pasa a ser el Modelo de la reposición; "texto" es
  // la línea completa con modelo/medida/color, solo para que se vea clara
  // en el desplegable y quede apuntada en la mercancía a pedir.
  piezaSelect.innerHTML = ultimasPiezasReposicion.map((p, i) => \`<option value="\${i}">\${escapeAttr(p.texto)}</option>\`).join("");
}
document.getElementById("reposicion-item-select").addEventListener("change", cargarPiezasReposicion);
// SEUR nunca hace recogidas (Jennifer, 2026-09-22) — la pregunta de
// recogida solo tiene sentido si se eligió FURNITURE; y la pregunta de
// destino solo si además se contestó "Sí" a la recogida.
document.getElementById("reposicion-agencia-select").addEventListener("change", (e) => {
  const esFurniture = e.target.value === "FURNITURE";
  document.getElementById("reposicion-colchon-recogida-block").style.display = esFurniture ? "" : "none";
  if (!esFurniture) {
    document.getElementById("reposicion-recogida-select").value = "";
    document.getElementById("reposicion-destino-select").value = "";
    document.getElementById("reposicion-colchon-destino-block").style.display = "none";
  }
});
document.getElementById("reposicion-recogida-select").addEventListener("change", (e) => {
  const hayRecogida = e.target.value === "si";
  document.getElementById("reposicion-colchon-destino-block").style.display = hayRecogida ? "" : "none";
  if (!hayRecogida) document.getElementById("reposicion-destino-select").value = "";
});
function cerrarModalReposicion() {
  document.getElementById("reposicion-modal-overlay").classList.remove("open");
  reposicionOrderActual = null;
}
document.getElementById("reposicion-modal-cancel").addEventListener("click", cerrarModalReposicion);
document.getElementById("reposicion-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "reposicion-modal-overlay") cerrarModalReposicion();
});
document.getElementById("reposicion-modal-confirmar").addEventListener("click", async () => {
  if (!reposicionOrderActual) return;
  const idx = Number(document.getElementById("reposicion-item-select").value);
  const item = reposicionOrderActual.items[idx];
  const piezaIdx = document.getElementById("reposicion-pieza-select").value;
  const piezaElegida = piezaIdx !== "" ? ultimasPiezasReposicion[Number(piezaIdx)] : null;
  const nota = document.getElementById("reposicion-motivo").value.trim();
  const piezaTexto = [piezaElegida?.texto, nota].filter(Boolean).join(" · ");
  const resultEl = document.getElementById("reposicion-modal-result");
  // Validación específica de colchón (Jennifer, 2026-09-22): sin esto no se
  // sabe si va por SEUR o Furniture, ni si hace falta recogida.
  const agenciaReposicion = document.getElementById("reposicion-agencia-select").value;
  const recogidaValue = document.getElementById("reposicion-recogida-select").value;
  const recogidaDestino = document.getElementById("reposicion-destino-select").value;
  if (ultimoTipoReposicion === "colchon") {
    if (!agenciaReposicion) {
      resultEl.textContent = "Indica si el colchón sale por SEUR o por FURNITURE.";
      return;
    }
    if (agenciaReposicion === "FURNITURE" && !recogidaValue) {
      resultEl.textContent = "Indica si tiene recogida del colchón antiguo.";
      return;
    }
    if (recogidaValue === "si" && !recogidaDestino) {
      resultEl.textContent = "Indica si el colchón recogido vuelve a nuestras instalaciones o es para desechar.";
      return;
    }
  }
  resultEl.textContent = "Registrando...";
  const res = await fetch("/api/inventario/reposicion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      orderId: reposicionOrderActual.id, orderNumber: reposicionOrderActual.orderNumber,
      platform: reposicionOrderActual.platform, orderRef: reposicionOrderActual.orderRef,
      orderDate: reposicionOrderActual.orderDate, item, piezaTexto,
      // "parte" (ej. "TAPA") pasa a ser el Modelo de la reposición en vez
      // del nombre completo del canapé (Jennifer, 2026-09-21) — las demás
      // características (medida, color) se conservan igual, vienen del
      // propio artículo resuelto en el servidor.
      parte: piezaElegida?.parte || null,
      agenciaReposicion: ultimoTipoReposicion === "colchon" ? agenciaReposicion : null,
      recogida: recogidaValue === "si",
      recogidaDestino: recogidaValue === "si" ? recogidaDestino : null,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.ok) {
    resultEl.textContent = body.error || "No se ha podido registrar la reposición.";
    return;
  }
  cerrarModalReposicion();
  alert("Reposición registrada — ya está en Proveedores pendientes.");
  await loadOrders();
  if (document.getElementById("view-pendientes").style.display !== "none") loadPendientes();
});

// Gesto comercial (Jennifer, 2026-09-22): almohada(s) de regalo por un daño
// que no compensa gestionar como cambio de pieza, o por un retraso. Solo
// los 4 modelos que se trabajan para esto (nunca Látex Natural) — mismo
// catálogo ya cargado en catalogoProducts, filtrado por palabra clave del
// stockModel para no depender de productId fijos que puedan cambiar.
const GESTO_COMERCIAL_KEYWORDS = ["Antiestres", "Seafoam", "Cotton Feather", "Nordic"];
let gestoComercialOrderActual = null;
function almohadasGestoComercial() {
  return catalogoProducts.filter(p => p.product_type === "Almohada" && GESTO_COMERCIAL_KEYWORDS.some(k => p.stockModel.includes(k)));
}
function rellenarTallasGestoComercial() {
  const productId = Number(document.getElementById("gesto-comercial-modelo-select").value);
  const producto = almohadasGestoComercial().find(p => p.productId === productId);
  document.getElementById("gesto-comercial-talla-select").innerHTML = (producto?.tallas || [])
    .map(t => \`<option value="\${t}">\${t}</option>\`).join("");
}
document.getElementById("gesto-comercial-modelo-select").addEventListener("change", rellenarTallasGestoComercial);
function abrirGestoComercialDesdePedido(orderId) {
  const order = allOrders.find(o => String(o.id) === String(orderId));
  if (!order) return;
  gestoComercialOrderActual = order;
  document.getElementById("gesto-comercial-modal-texto").textContent = refLabel(order) + " — " + (order.name || "");
  document.getElementById("gesto-comercial-modelo-select").innerHTML = almohadasGestoComercial()
    .map(p => \`<option value="\${p.productId}">\${escapeAttr(p.stockModel)}</option>\`).join("");
  rellenarTallasGestoComercial();
  document.getElementById("gesto-comercial-cantidad-select").value = "1";
  document.getElementById("gesto-comercial-motivo").value = "";
  document.getElementById("gesto-comercial-modal-result").textContent = "";
  document.getElementById("gesto-comercial-modal-overlay").classList.add("open");
}
function cerrarModalGestoComercial() {
  document.getElementById("gesto-comercial-modal-overlay").classList.remove("open");
  gestoComercialOrderActual = null;
}
document.getElementById("gesto-comercial-modal-cancel").addEventListener("click", cerrarModalGestoComercial);
document.getElementById("gesto-comercial-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "gesto-comercial-modal-overlay") cerrarModalGestoComercial();
});
document.getElementById("gesto-comercial-modal-confirmar").addEventListener("click", async () => {
  if (!gestoComercialOrderActual) return;
  const productId = Number(document.getElementById("gesto-comercial-modelo-select").value);
  const talla = document.getElementById("gesto-comercial-talla-select").value;
  const cantidad = Number(document.getElementById("gesto-comercial-cantidad-select").value);
  const motivo = document.getElementById("gesto-comercial-motivo").value.trim();
  const resultEl = document.getElementById("gesto-comercial-modal-result");
  resultEl.textContent = "Registrando...";
  const res = await fetch("/api/inventario/gesto-comercial", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      orderId: gestoComercialOrderActual.id, orderNumber: gestoComercialOrderActual.orderNumber,
      platform: gestoComercialOrderActual.platform, orderRef: gestoComercialOrderActual.orderRef,
      orderDate: gestoComercialOrderActual.orderDate, productId, talla, cantidad, motivo,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.ok) {
    resultEl.textContent = body.error || "No se ha podido registrar el gesto comercial.";
    return;
  }
  cerrarModalGestoComercial();
  alert(body.cubiertoConStock >= cantidad
    ? "Gesto comercial registrado — cubierto con stock real, ya está en Furniture pendientes."
    : "Gesto comercial registrado — " + (cantidad - body.cubiertoConStock) + " ud. quedan en Proveedores pendientes (" + body.referencia + ").");
  await loadOrders();
  if (document.getElementById("view-pendientes").style.display !== "none") loadPendientes();
});

function cerrarModalSustituir() {
  document.getElementById("sustituir-modal-overlay").classList.remove("open");
  sustituirBackorder = null;
}
document.getElementById("sustituir-modal-cancel").addEventListener("click", cerrarModalSustituir);
document.getElementById("sustituir-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "sustituir-modal-overlay") cerrarModalSustituir();
});
document.getElementById("sustituir-query").addEventListener("input", () => {
  const has = document.getElementById("sustituir-query").value.trim().length > 0;
  sustituirTransformarTalla = null;
  mostrarBotonesSustituir(false);
  document.getElementById("sustituir-directo-btn").disabled = !has;
  document.getElementById("sustituir-hoy-btn").disabled = !has;
  document.getElementById("sustituir-manana-btn").disabled = !has;
  document.querySelectorAll("#sustituir-modal-overlay .alternativa-opcion").forEach(x => x.classList.remove("selected"));
});
async function confirmarSustituir(fecha) {
  if (!sustituirBackorder) return;
  const b = sustituirBackorder;
  const transformarDesde = sustituirTransformarTalla;
  const query = document.getElementById("sustituir-query").value.trim();
  if (!query && !transformarDesde) return;
  if (transformarDesde && !confirm("¿Transformar un " + b.stockModel + " " + transformarDesde + " en " + b.talla + " para " + refLabel(b) + "?\\n\\nSe descuenta " + (b.cantidad || 1) + " del stock de " + transformarDesde + " y el colchón sale por FURNITURE (va abierto, nunca por SEUR).")) return;
  const res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(b.id) + "/sustituir", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(transformarDesde
      ? { transformar: true, talla: transformarDesde, fecha }
      : { query, mode: "name", talla: b.talla, fecha }),
  });
  const data = await res.json();
  cerrarModalSustituir();
  if (!res.ok || data.ok === false) {
    alert(data.error || "No se pudo sustituir.");
    return;
  }
  if (transformarDesde) {
    alert(data.avisoAlmacen && data.avisoAlmacen.ok
      ? "Transformación registrada. Se ha enviado el aviso por email al almacén."
      : "Transformación registrada, pero NO se ha podido enviar el email al almacén (" + ((data.avisoAlmacen && data.avisoAlmacen.reason) || "error") + "). Avísales tú, por favor.");
    // El pedido ha podido pasar de SEUR a FURNITURE: se recarga todo y, si
    // ya está todo lo del pedido listo, sube solo a la carga de Furniture.
    await loadOrders();
    await loadPendientes();
    await checkAutoAddCarga(b.orderId);
    return;
  }
  if (document.getElementById("view-pendientes").style.display !== "none") loadPendientes();
}
document.getElementById("sustituir-directo-btn").addEventListener("click", () => confirmarSustituir(null));
document.getElementById("sustituir-hoy-btn").addEventListener("click", () => confirmarSustituir("hoy"));
document.getElementById("sustituir-manana-btn").addEventListener("click", () => confirmarSustituir("manana"));

function abrirModalFechaSeur(id) {
  const b = backorders.find(x => x.id === id);
  if (!b) return;
  seurFechaModalBackorderId = id;
  document.getElementById("seur-fecha-modal-texto").textContent = refLabel(b) + " — " + b.cantidad + "x " + b.stockModel + " (" + b.talla + ")";
  const input = document.getElementById("seur-fecha-input");
  input.min = hoyMadrid();
  input.value = primerDiaSeur();
  document.getElementById("seur-fecha-modal-overlay").classList.add("open");
}
function cerrarModalFechaSeur() {
  document.getElementById("seur-fecha-modal-overlay").classList.remove("open");
  seurFechaModalBackorderId = null;
}
document.getElementById("seur-fecha-modal-cancel").addEventListener("click", cerrarModalFechaSeur);
document.getElementById("seur-fecha-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "seur-fecha-modal-overlay") cerrarModalFechaSeur();
});
async function confirmarFechaSeur(fecha) {
  if (!seurFechaModalBackorderId) return;
  const id = seurFechaModalBackorderId;
  const res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(id) + "/resolver-seur", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fecha }),
  });
  const data = await res.json();
  cerrarModalFechaSeur();
  if (!res.ok || data.ok === false) {
    alert(data.error || "No se pudo preparar para SEUR.");
    return;
  }
  loadPendientes();
}
document.getElementById("seur-fecha-ok-btn").addEventListener("click", () => {
  const fecha = document.getElementById("seur-fecha-input").value;
  const error = errorFechaSeur(fecha);
  if (error) { alert(error); return; }
  confirmarFechaSeur(fecha);
});

// Campanita de "pedido cancelado con pendiente en Proveedores" (Jennifer,
// 2026-09-16): el contador se refresca solo (carga inicial + cada update
// por WebSocket), el listado completo solo al abrir el modal.
function formatFechaAviso(iso) {
  return iso ? new Date(iso).toLocaleDateString("es-ES") : "";
}
async function loadAvisosCanceladosCount() {
  const res = await fetch("/api/avisos/cancelados");
  const data = await res.json();
  const n = data.pendientes.length;
  const badge = document.getElementById("avisos-cancelados-count");
  badge.textContent = n;
  badge.style.display = n ? "flex" : "none";
  return data;
}
function avisoCanceladoCard(a, resuelto) {
  const fabricaTag = a.pedidoGenerado
    ? \`<span class="aviso-fabrica-tag">⚠ Ya se pidió a fábrica el \${formatFechaAviso(a.fechaPedidoFabrica)} — llama para cancelarlo</span>\`
    : "";
  const resueltoTag = resuelto
    ? \`<span class="aviso-resuelto-tag">Resuelto el \${formatFechaAviso(a.fechaCancelado)}</span>\`
    : \`<button type="button" class="secondary aviso-resolver-btn" data-id="\${a.backorderId}" data-generado="\${a.pedidoGenerado}">Marcar resuelto</button>\`;
  return \`
    <div class="aviso-cancelado-card\${resuelto ? " resuelto" : ""}">
      <div class="aviso-titulo">\${refLabel(a)} — \${a.name || ""}</div>
      <div class="aviso-detalle">\${a.proveedor || "—"} · \${a.stockModel} \${a.talla} · \${a.cantidad} ud.</div>
      \${fabricaTag}
      <div style="margin-top:6px">\${resueltoTag}</div>
    </div>
  \`;
}
async function openAvisosCanceladosModal() {
  const data = await loadAvisosCanceladosCount();
  document.getElementById("avisos-cancelados-pendientes-list").innerHTML = data.pendientes.length
    ? data.pendientes.map(a => avisoCanceladoCard(a, false)).join("")
    : '<p style="color:var(--muted);font-size:13px">No hay avisos pendientes ahora mismo.</p>';
  document.getElementById("avisos-cancelados-resueltos-list").innerHTML = data.resueltos.length
    ? data.resueltos.map(a => avisoCanceladoCard(a, true)).join("")
    : '<p style="color:var(--muted);font-size:13px">Nada resuelto todavía.</p>';
  document.querySelectorAll(".aviso-resolver-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const generado = btn.dataset.generado === "true";
      const msg = generado
        ? "Este pendiente YA se pidió a fábrica — asegúrate de haber llamado al proveedor para cancelarlo antes de continuar. ¿Confirmas que ya está resuelto?"
        : "¿Confirmas que este pendiente ya está resuelto?";
      if (!confirm(msg)) return;
      await fetch("/api/avisos/cancelados/" + encodeURIComponent(btn.dataset.id) + "/resolver", { method: "POST" });
      openAvisosCanceladosModal();
    });
  });
  document.getElementById("avisos-cancelados-modal-overlay").classList.add("open");
}
document.getElementById("avisos-cancelados-btn").addEventListener("click", openAvisosCanceladosModal);
document.getElementById("avisos-cancelados-cerrar-btn").addEventListener("click", () => {
  document.getElementById("avisos-cancelados-modal-overlay").classList.remove("open");
});
document.getElementById("avisos-cancelados-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "avisos-cancelados-modal-overlay") e.currentTarget.classList.remove("open");
});

function connectWS() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(proto + "//" + location.host + "/pedidos/shopify/ws");
  ws.onmessage = () => {
    if (editing) { pendingRefresh = true; } else { loadOrders(); }
    loadAvisosCanceladosCount();
  };
  ws.onclose = () => setTimeout(connectWS, 2000);
}

initUser();
</script>
</body>
</html>`;
}

// === Fichero de etiquetas de Furniture (Jennifer, 2026-08-27): CSV
// compatible con Excel que se sube a la plataforma de Furniture el día
// antes de cada carga. Cada fila es un "bulto" (una pieza física a
// entregar), no un pedido — un canapé puede generar varias filas (tapa,
// cajón, fondo...). Se construye a partir de los "pendientes" (backorders)
// ya decompuestos por producto/talla/color, en vez de reinterpretar los
// packs desde cero.

const FURNITURE_CSV_HEADERS = [
  "FECHA", "A COBRAR", "DOC. VENTA", "NOM. CLIENTE", "DIRECCIÓN", "C. POSTAL", "POBLACIÓN",
  // N = "USADO/RAEE" en UNA sola columna (Jennifer, 2026-09-29: la columna
  // O "RAEE" sobraba y desajustaba todo el fichero).
  "DESCRIP.", "CANTIDAD", "CENTRO", "TELÉFONO1", "TELÉFONO 2", "OBSERVACIONES", "USADO/RAEE",
  "ARRASTRE", "VERIFICADO", "PLANIFICADO", "LLAMADO", "CAMIÓN", "CARGADO", "HORA INICIO", "HORA FIN",
  "EAN", "PROCEDENCIA", "TIPOSERVICIO", "BULTOS", "VOLUM", "KILOS", "NUMERO_RESERVA", "EMAIL", "PROVINCIA", "VALOR MERCANCÍA",
];

function limpiarTelefonoFurniture(phone) {
  return (phone || "").replace(/^\+34\s*/, "").trim();
}

function tieneMontajeFurniture(services) {
  const m = /Montaje:\s*([^·]+)/i.exec(services || "");
  return !!(m && m[1].trim().toLowerCase().startsWith("con montaje"));
}

// "Tapa de Canapé: Tapa Entera" / "Tapa Reforzada | €25.00" / "Tapa Partida
// | €59.00" (valores reales comprobados en pedidos — Jennifer, 2026-08-27).
function tapaPartidaFurniture(services) {
  const m = /Tapa de Canapé:\s*([^·]+)/i.exec(services || "");
  return !!(m && m[1].trim().toLowerCase().startsWith("tapa partida"));
}

// Mapeo de "Servicios adicionales" (retirada) a OBSERVACIONES (Jennifer,
// 2026-08-27) — por palabras clave porque el texto real de Shopify difiere
// un poco del que se dictó de palabra (confirmado con pedidos reales).
function observacionesRetiradaFurniture(services) {
  const matches = [...(services || "").matchAll(/Servicios adicionales:\s*([^·]+)/gi)].map((m) => m[1].trim());
  const relevante = matches.find((v) => v.toLowerCase() !== "ninguno");
  if (!relevante) return "";
  const v = relevante.toLowerCase();
  const colchon = v.includes("colch");
  const cama = v.includes("cama") || v.includes("canap") || v.includes("base");
  const conDesmontaje = v.includes("desmontaje") && !v.includes("sin desmontaje");
  if (colchon && cama && conDesmontaje) return "Desmontaje; Retirada de colchón y cama punto limpio";
  if (colchon && cama) return "Retirada de colchón y cama punto limpio";
  if (cama && conDesmontaje) return "Desmontaje cama, retirada punto limpio";
  if (cama) return "Retirada de cama para desechar";
  if (colchon) return "Retirada colchón punto limpio";
  return "";
}

function parseMedidaFurniture(talla) {
  const m = /(\d{2,3})\s*[xX]\s*(\d{2,3})/.exec(talla || "");
  if (!m) return null;
  return { ancho: Number(m[1]), largo: Number(m[2]), text: `${m[1]}X${m[2]}` };
}

// 160x190/160x200: Gemelo solo si el cliente lo elige (variante trae
// "Gemelos"). 180x190/180x200: siempre Gemelo (Jennifer, 2026-08-27).
function esGemeloFurniture(medida, productoTexto) {
  if (!medida) return false;
  if (medida.ancho >= 180) return true;
  if (medida.ancho === 160) return /gemelo/i.test(productoTexto || "");
  return false;
}

// PROVINCIA por código postal (Jennifer, 2026-08-27) — los dos primeros
// dígitos del CP marcan la provincia; algunas van con el nombre tradicional
// castellano en vez del oficial actual, según pidió (Girona->GERONA,
// Lleida->LÉRIDA, A Coruña->LA CORUÑA, pero Gipuzkoa/Bizkaia/Illes
// Balears/Ourense se quedan tal cual, no se castellanizan más).
const PROVINCIA_POR_CP = {
  "01": "ÁLAVA", "02": "ALBACETE", "03": "ALICANTE", "04": "ALMERÍA", "05": "ÁVILA",
  "06": "BADAJOZ", "07": "BALEARES", "08": "BARCELONA", "09": "BURGOS", "10": "CÁCERES",
  "11": "CÁDIZ", "12": "CASTELLÓN", "13": "CIUDAD REAL", "14": "CÓRDOBA", "15": "LA CORUÑA",
  "16": "CUENCA", "17": "GERONA", "18": "GRANADA", "19": "GUADALAJARA", "20": "GUIPUZCOA",
  "21": "HUELVA", "22": "HUESCA", "23": "JAÉN", "24": "LEÓN", "25": "LÉRIDA",
  "26": "LA RIOJA", "27": "LUGO", "28": "MADRID", "29": "MÁLAGA", "30": "MURCIA",
  "31": "NAVARRA", "32": "ORENSE", "33": "ASTURIAS", "34": "PALENCIA", "35": "LAS PALMAS",
  "36": "PONTEVEDRA", "37": "SALAMANCA", "38": "SANTA CRUZ DE TENERIFE", "39": "CANTABRIA", "40": "SEGOVIA",
  "41": "SEVILLA", "42": "SORIA", "43": "TARRAGONA", "44": "TERUEL", "45": "TOLEDO",
  "46": "VALENCIA", "47": "VALLADOLID", "48": "VIZCAYA", "49": "ZAMORA", "50": "ZARAGOZA",
  "51": "CEUTA", "52": "MELILLA",
};
// Sin tildes (Jennifer, 2026-09-29: Furniture da error al subir "LEÓN",
// "LÉRIDA"…) — la Ñ se mantiene (LA CORUÑA).
function provinciaPorCp(postalCode) {
  const p = PROVINCIA_POR_CP[(postalCode || "").slice(0, 2)] || "";
  return p.replace(/Ñ/g, "\u0000").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\u0000/g, "Ñ");
}

function nombreCortoProducto(stockModel) {
  const partes = (stockModel || "").split("|");
  return partes[partes.length - 1].trim()
    .replace(/^almohada\s+/i, "")
    .replace(/^colch[oó]n\s+/i, "")
    .replace(/\s+gran hotel$/i, "");
}

// --- Generadores de bultos por familia de canapé (Jennifer, 2026-08-26/27) ---
// Cada uno devuelve {parte, texto}[] — "parte" es el nombre corto de la
// pieza física (TAPA, CAJÓN...) SIN referencia/modelo/medida/color, y
// "texto" es la línea completa que ya se usaba para el Excel real de
// Furniture. Se separan (Jennifer, 2026-09-21) porque una reposición
// necesita guardar la pieza exacta como "Modelo" (ver piezasBackorder /
// crearReposicion) sin perder el desglose completo que ya usa la
// exportación — descripcionesBackorder sigue devolviendo solo "texto",
// así que el fichero real de Furniture no cambia en nada.

function bultosCanapeMadera(modelo, medida, color, referencia, tapaPartida) {
  const linea = (parte) => ({ parte, texto: [referencia, parte, modelo, medida.text, color].filter(Boolean).join(" ") });
  if (medida.ancho >= 160) {
    return [linea("TAPA ½"), linea("TAPA 2/2"), linea("CAJÓN ½"), linea("CAJÓN 2/2"), linea("FONDO"), linea("JUEGO BISAGRAS E HIDRÁULICOS ½"), linea("JUEGO BISAGRAS E HIDRÁULICOS 2/2")];
  }
  if (tapaPartida) {
    return [linea("TAPA PARTIDA ½"), linea("TAPA PARTIDA 2/2"), linea("CAJÓN"), linea("FONDO"), linea("JUEGO BISAGRAS E HIDRÁULICOS")];
  }
  return [linea("TAPA"), linea("CAJÓN"), linea("FONDO"), linea("JUEGO BISAGRAS E HIDRÁULICOS")];
}

function bultosCanapeGranCapacidad(modelo, medida, color, referencia, tapaPartida, gemelo) {
  const linea = (parte) => ({ parte, texto: [referencia, parte, modelo, medida.text, color].filter(Boolean).join(" ") });
  if (gemelo) return [linea("TAPA ½"), linea("TAPA 2/2"), linea("CAJÓN ½"), linea("CAJÓN 2/2")];
  if (tapaPartida) return [linea("TAPA PARTIDA ½"), linea("TAPA PARTIDA 2/2"), linea("CAJÓN CABECERO"), linea("CAJÓN PIECERO")];
  return [linea("TAPA"), linea("CAJÓN CABECERO"), linea("CAJÓN PIECERO")];
}

function bultosCanapeMagnum(modelo, medida, color, referencia, tapaPartida, gemelo) {
  const linea = (parte) => ({ parte, texto: [referencia, parte, modelo, medida.text, color].filter(Boolean).join(" ") });
  if (gemelo) return [linea("TAPA ½"), linea("TAPA 2/2"), linea("CAJÓN ½"), linea("CAJÓN 2/2")];
  const rows = tapaPartida
    ? [linea("TAPA PARTIDA ½"), linea("TAPA PARTIDA 2/2"), linea("CAJÓN CABECERO"), linea("CAJÓN PIECERO")]
    : [linea("TAPA"), linea("CAJÓN CABECERO"), linea("CAJÓN PIECERO")];
  if (medida.ancho >= 135) rows.push(linea("FONDO"));
  return rows;
}

function bultosCanapeInitial(modelo, medida, color, referencia, tapaPartida, gemelo) {
  const linea = (parte) => ({ parte, texto: [referencia, parte, modelo, medida.text, color].filter(Boolean).join(" ") });
  if (gemelo) return [linea("TAPA ½"), linea("TAPA 2/2"), linea("CAJÓN ½"), linea("CAJÓN 2/2"), linea("JUEGO DE PATAS")];
  const rows = tapaPartida
    ? [linea("TAPA PARTIDA ½"), linea("TAPA PARTIDA 2/2"), linea("CAJÓN CABECERO"), linea("CAJÓN PIECERO")]
    : [linea("TAPA"), linea("CAJÓN CABECERO"), linea("CAJÓN PIECERO")];
  if (medida.ancho >= 135) rows.push(linea("FONDO"));
  rows.push(linea("JUEGO DE PATAS"));
  return rows;
}

function bultosBase(medida, color, referencia) {
  const patas = medida.ancho < 135 || (medida.ancho === 135 && medida.largo <= 190) ? 4 : 6;
  return [
    { parte: "BASE", texto: [referencia, "BASE", medida.text, color].filter(Boolean).join(" ") },
    { parte: "JUEGO DE PATAS", texto: `JUEGO DE ${patas} PATAS` },
  ];
}

// Reglas de qué familia/MODELO corresponde a cada canapé del catálogo — el
// orden importa: las reglas más específicas van primero para no confundir
// "esquinas curvas/rectas" (madera) con "alta capacidad y resistencia"
// (polipiel), que comparten ese texto en el título.
const CANAPE_MODELO_RULES = [
  { test: (t) => /esquinas curvas/i.test(t), gen: bultosCanapeMadera, modelo: "CANAPÉ MADERA" },
  { test: (t) => /esquinas rectas/i.test(t), gen: bultosCanapeMadera, modelo: "CANAPÉ MADERA ASTRA" },
  { test: (t) => /extra capacidad/i.test(t), gen: bultosCanapeGranCapacidad, modelo: "CANAPÉ GRAN CAPACIDAD" },
  { test: (t) => /apertura lateral/i.test(t), gen: bultosCanapeGranCapacidad, modelo: "CANAPÉ POLIPIEL APERTURA LATERAL" },
  { test: (t) => /borde polipiel/i.test(t), gen: bultosCanapeGranCapacidad, modelo: "CANAPÉ POLIPIEL BORDE DELUXE" },
  { test: (t) => /tapizado en tela.*alta capacidad/i.test(t), gen: bultosCanapeGranCapacidad, modelo: "CANAPÉ TELA" },
  { test: (t) => /con ruedas/i.test(t), gen: bultosCanapeMagnum, modelo: "CANAPÉ MAGNUM" },
  { test: (t) => /tapizado en tela premium/i.test(t), gen: bultosCanapeInitial, modelo: "CANAPÉ SOUL" },
  { test: (t) => /con patas/i.test(t), gen: bultosCanapeInitial, modelo: "CANAPÉ INITIAL" },
  { test: (t) => /alta capacidad y resistencia/i.test(t) && !/esquinas/i.test(t), gen: bultosCanapeGranCapacidad, modelo: "CANAPÉ POLIPIEL" },
];

function matchCanapeRule(title) {
  return CANAPE_MODELO_RULES.find((r) => r.test(title || "")) || null;
}

function extraerMedidaDeMercancia(mercanciaFabrica) {
  const m = /MEDIDA:\s*([^·]+)/i.exec(mercanciaFabrica || "");
  return m ? m[1].trim().replace(/cm/gi, "").trim() : "";
}

// A partir del backorder de un pedido de Furniture, genera 1+ piezas físicas
// {parte, texto} (una por bulto). "productoTexto" es el "product" ya
// concatenado del pedido, usado solo para detectar "- Gemelos" en la
// variante elegida. Usada tanto por la exportación real a Furniture
// (descripcionesBackorder, más abajo, solo se queda con "texto") como por
// el desplegable de reposición (Jennifer, 2026-09-21, necesita "parte" —
// el nombre corto de la pieza — para usarlo como Modelo de la reposición).
// "Tapa de Canapé: Tapa Reforzada" (Jennifer, 2026-09-29: "quiero que
// aparezca" en las etiquetas de Furniture) — la tapa sale como "TAPA
// REFORZADA" (también "TAPA REFORZADA ½" en gemelos).
function tapaReforzadaFurniture(services) {
  const m = /Tapa de Canapé:\s*([^·]+)/i.exec(services || "");
  return !!(m && m[1].trim().toLowerCase().startsWith("tapa reforzada"));
}
function marcarTapaReforzada(piezas) {
  return piezas.map((p) => {
    if (!/^TAPA\b/.test(p.parte) || /REFORZADA|PARTIDA/.test(p.parte)) return p;
    const parte = p.parte.replace(/^TAPA/, "TAPA REFORZADA");
    return { parte, texto: p.texto.replace(p.parte, parte) };
  });
}

// `servicios` (opcional): el texto de servicios del pedido, para detectar
// la tapa reforzada.
function piezasBackorder(b, productoTexto, tapaPartida, servicios) {
  const stockModel = b.stockModel || "";
  const t = stockModel.toLowerCase();
  const referencia = b.referencia || "";
  // El color puede venir con el prefijo de tejido ("Tela - Cacao", "Polipiel
  // - Beige") — en las etiquetas de Furniture solo se pone el color limpio
  // (Jennifer, 2026-08-27).
  const color = (b.color || "").replace(/^(tela|polipiel)\s*-\s*/i, "");

  if (t.includes("canap")) {
    const medida = parseMedidaFurniture(b.talla);
    const rule = matchCanapeRule(stockModel);
    if (!rule || !medida) return [{ parte: "REVISAR", texto: `REVISAR (sin regla de bultos): ${stockModel} ${b.talla}` }];
    // Si Jennifer ha elegido el formato de un canapé de 160 (2026-09-28),
    // manda sobre lo que diga la variante de Shopify.
    const gemelo = b.formato160 ? b.formato160 === "GEMELOS" : esGemeloFurniture(medida, productoTexto);
    let piezas = rule.gen(rule.modelo, medida, color, referencia, tapaPartida, gemelo);
    if (tapaReforzadaFurniture(servicios)) piezas = marcarTapaReforzada(piezas);
    // Tapa sacada del almacén (Jennifer, 2026-09-30, BEZEN12211): referencia
    // "STOCK" solo en la(s) tapa(s); el resto lleva la referencia de Polival.
    if (b.tapaStock) {
      piezas = piezas.map((p) => (/^TAPA/.test(p.parte)
        ? { ...p, texto: "STOCK " + (referencia && p.texto.startsWith(referencia + " ") ? p.texto.slice(referencia.length + 1) : p.texto) }
        : p));
    }
    return piezas;
  }
  if (t.includes("cabecero")) {
    const medidaTxt = extraerMedidaDeMercancia(b.mercanciaFabrica) || b.talla || "";
    const key = matchCabeceroRecipeKey(stockModel);
    const modeloWeb = key ? key.charAt(0).toUpperCase() + key.slice(1) : stockModel;
    return [{ parte: "CABECERO", texto: [referencia, "CABECERO", modeloWeb, medidaTxt, color].filter(Boolean).join(" ") }];
  }
  if (t.includes("base")) {
    const medida = parseMedidaFurniture(b.talla);
    if (!medida) return [{ parte: "REVISAR", texto: `REVISAR (sin medida): ${stockModel} ${b.talla}` }];
    return bultosBase(medida, color, referencia);
  }
  // Colchón / almohada / topper / protector: sin referencia, formato
  // "{PREFIJO} {n}/{total} {MODELO CORTO} {MEDIDA}" cuando hay 2+ iguales.
  const prefijo = { almohada: "ALMOHADA", protector: "PROTECTOR", topper: "TOPPER" }[b.tipo] || "COLCHÓN";
  // Sin repetir la palabra: "PROTECTOR Impermeable Pronébula", no "PROTECTOR Protector…".
  const corto = nombreCortoProducto(stockModel).replace(/^(protector|topper)\s+/i, "");
  const base = `${corto} ${b.talla || ""}`.trim();
  const cantidad = b.cantidad || 1;
  if (cantidad <= 1) return [{ parte: prefijo, texto: `${prefijo} ${base}`.trim() }];
  const rows = [];
  for (let i = 1; i <= cantidad; i++) rows.push({ parte: prefijo, texto: `${prefijo} ${i}/${cantidad} ${base}`.trim() });
  return rows;
}

// Solo el texto completo de cada bulto — la exportación real de Furniture
// no necesita "parte" por separado, así que no cambia en nada.
function descripcionesBackorder(b, productoTexto, tapaPartida, servicios) {
  return piezasBackorder(b, productoTexto, tapaPartida, servicios).map((p) => p.texto);
}

function csvEscapeFurniture(value) {
  const s = String(value ?? "");
  if (/[;"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// Furniture da error al subir tildes (Jennifer, 2026-09-30) en DESCRIP.
// (productos con referencia) y OBSERVACIONES — igual que en PROVINCIA. La Ñ
// se mantiene; "½" pasa a "1/2" y la raya "—" a guion.
const FURNITURE_COLUMNAS_SIN_TILDES = [7, 12];
function sinTildesFurniture(texto) {
  return String(texto ?? "").replace(/½/g, "1/2").replace(/[—–]/g, "-").replace(/Ñ/g, "\u0000").replace(/ñ/g, "\u0001")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\u0000/g, "Ñ").replace(/\u0001/g, "ñ");
}
function buildFurnitureCsv(rows) {
  const lines = [FURNITURE_CSV_HEADERS.map(csvEscapeFurniture).join(";")];
  for (const row of rows) {
    const limpia = row.map((v, i) => (FURNITURE_COLUMNAS_SIN_TILDES.includes(i) ? sinTildesFurniture(v) : v));
    lines.push(limpia.map(csvEscapeFurniture).join(";"));
  }
  return "﻿" + lines.join("\r\n");
}

async function buildFurnitureExport(env, cargaId) {
  const ordersId = env.ORDERS_STORE.idFromName("shopify");
  const ordersStub = env.ORDERS_STORE.get(ordersId);
  const invStub = inventoryStub(env);
  const [orders, cargas, backorders] = await Promise.all([
    ordersStub.fetch("https://do/orders").then((r) => r.json()),
    ordersStub.fetch("https://do/cargas").then((r) => r.json()),
    invStub.fetch("https://do/backorders").then((r) => r.json()),
  ]);

  const carga = cargaId ? cargas.find((c) => c.id === cargaId) : cargas.find((c) => (c.tipo || "furniture") === "furniture" && c.estado === "abierta");
  if (!carga) return { error: "No hay carga abierta." };

  // Envío conjunto (Jennifer, 2026-09-28): los pedidos de un mismo grupo
  // van seguidos y como UN solo envío — referencia, nombre, dirección y
  // contacto del pedido principal en todas sus líneas.
  const clavePedido = (o) => String(o.grupoEnvio || o.id);
  const pedidos = orders.filter((o) => o.cargaId === carga.id)
    .sort((a, b) => clavePedido(a).localeCompare(clavePedido(b)) || (a.id === a.grupoEnvio ? -1 : b.id === b.grupoEnvio ? 1 : 0));

  // Se sube el día antes de la carga (Jennifer, 2026-08-26): carga viernes
  // 28/08 -> fecha en el fichero 27/08/2026.
  const cargaFecha = new Date(carga.fecha + "T00:00:00Z");
  const fechaSubida = new Date(cargaFecha);
  fechaSubida.setUTCDate(fechaSubida.getUTCDate() - 1);
  const fechaTexto = [fechaSubida.getUTCDate(), fechaSubida.getUTCMonth() + 1, fechaSubida.getUTCFullYear()]
    .map((n, i) => (i < 2 ? String(n).padStart(2, "0") : n))
    .join("/");

  const rows = [];
  for (const o of pedidos) {
    const envio = (o.grupoEnvio && orders.find((x) => x.id === o.grupoEnvio)) || o;
    const montaje = tieneMontajeFurniture(o.services);
    const tapaPartida = tapaPartidaFurniture(o.services);
    const observaciones = observacionesRetiradaFurniture(o.services);
    const telefono = limpiarTelefonoFurniture(envio.phone);
    // Igual que en el desglose de Furniture: un colchón marcado "FPK" sale
    // independiente por SEUR, no entra en esta exportación. Ampliado
    // 2026-09-25 (caso real BEZEN12173): antes solo se comprobaba para un
    // colchón DE PACK (b.esPack) — un colchón SUELTO cuyo pedido también
    // lleva tapicería se colaba aquí sin comprobar tipoEnvio en absoluto
    // (icluido incluso mientras seguía en FPK, el valor por defecto), así
    // que podía acabar en la etiqueta de Furniture sin que Jennifer lo
    // hubiera decidido — ahora un colchón (pack o suelto) solo entra aquí
    // si está marcado explícitamente FUR. Las reposiciones NUNCA entran
    // aquí (Jennifer, 2026-09-21: tienen su propia línea independiente, con
    // su propia carga — ver más abajo, reposicionesEnCarga — así que no
    // dependen de si el resto del pedido está en esta carga o no).
    const backordersPedido = backorders.filter((b) => b.orderId === o.id
      && (b.estado === "pendiente" || b.estado === "cubierto")
      && !b.reposicion
      && !b.gestoComercial
      && !b.envioAparte // sale después, como línea propia (ver más abajo)
      && !(b.tipo === "colchon" && b.tipoEnvio !== "FUR"));

    const descripciones = backordersPedido.length
      ? backordersPedido.flatMap((b) => descripcionesBackorder(b, o.product, tapaPartida, o.services))
      : [o.product || ""];

    for (const descrip of descripciones) {
      rows.push([
        fechaTexto, "", referenciaPedido(envio), envio.name, envio.furnitureAddress || envio.address || "",
        envio.postalCode || "", envio.city || "", descrip, "1", "1229", telefono, telefono, observaciones,
        "", "", "", "", "", "", "", "", "", "", "",
        montaje ? "SUBIDA Y MONTAJE" : "SUBIDA A PISO", "1", "", "", "",
        envio.email || o.email || "", provinciaPorCp(envio.postalCode), "",
      ]);
    }
  }

  // Reposiciones de pieza rota (Jennifer, 2026-09-21): línea propia e
  // independiente del pedido original — su carga es backorder.cargaId, no
  // order.cargaId, así que se recorren aparte y pueden acabar en esta
  // exportación aunque el pedido original ni siquiera esté en esta carga
  // (o ya esté cerrado/entregado). Referencia con "REP" delante (mismo
  // recorte por delante de truncarReferenciaSeur si hiciera falta, aunque
  // aquí Furniture no tiene el límite de 15 de SEUR). El texto de la
  // reposición ya ES la pieza física concreta (ej. "I-002 TAPA 135X180
  // Marron"), no se vuelve a pasar por descripcionesBackorder — eso
  // reclasificaría "TAPA" como si fuera un colchón suelto, al no reconocer
  // "canap" en el nombre.
  // Una reposición de COLCHÓN por SEUR no entra aquí (Jennifer, 2026-09-22)
  // — esa va por Luso/New + "Preparar para SEUR", con su propia línea en el
  // fichero de exportación a SEUR (ver más abajo), no en Furniture.
  const reposicionesEnCarga = backorders.filter((b) => b.reposicion && b.estado === "pendiente" && b.cargaId === carga.id && !(b.tipo === "colchon" && b.agenciaReposicion === "SEUR"));
  for (const b of reposicionesEnCarga) {
    const o = orders.find((x) => x.id === b.orderId);
    if (!o) continue;
    const montaje = tieneMontajeFurniture(o.services);
    // Sin la retirada de cama/colchón del pedido original (Jennifer,
    // 2026-09-21): esa retirada ya se hizo con el envío original — una
    // reposición no vuelve a retirar la cama entera, solo la pieza rota,
    // así que su Observaciones es SIEMPRE únicamente el aviso de
    // reposición, nunca observacionesRetiradaFurniture(o.services).
    // Para un colchón (Jennifer, 2026-09-22) la recogida es opcional y hay
    // que distinguir si el colchón recogido vuelve a nuestras instalaciones
    // o es para desechar — para el resto (tapicería) se mantiene el aviso
    // fijo de siempre, que ya asume la recogida de la pieza dañada.
    let observaciones = "REPOSICIÓN — desmontar y retirar la pieza dañada, devolver a almacén";
    if (b.tipo === "colchon") {
      if (!b.recogida) {
        observaciones = "REPOSICIÓN — colchón nuevo, SIN recogida del colchón anterior";
      } else if (b.recogidaDestino === "desechar") {
        observaciones = "REPOSICIÓN — recoger el colchón dañado, es PARA DESECHAR";
      } else {
        observaciones = "REPOSICIÓN — recoger el colchón dañado y devolver a nuestras instalaciones";
      }
    }
    const telefono = limpiarTelefonoFurniture(o.phone);
    const descrip = [b.referencia, b.stockModel, b.talla, b.color].filter(Boolean).join(" ");
    rows.push([
      fechaTexto, "", "REP" + referenciaPedido(o), o.name, o.furnitureAddress || o.address || "",
      o.postalCode || "", o.city || "", descrip, "1", "1229", telefono, telefono, observaciones,
      "", "", "", "", "", "", "", "", "", "", "",
      montaje ? "SUBIDA Y MONTAJE" : "SUBIDA A PISO", "1", "", "", "",
      o.email || "", provinciaPorCp(o.postalCode), "",
    ]);
  }

  // Artículos enviados aparte (Jennifer, 2026-09-29): su propia carga
  // (b.cargaId) y la referencia del pedido con su sufijo ("…2"). Los bultos
  // se calculan igual que en el pedido; la retirada de cama ya se hizo en el
  // primer envío, así que no se repite.
  const aparteEnCarga = backorders.filter((b) => b.envioAparte && (b.estado === "pendiente" || b.estado === "cubierto") && b.cargaId === carga.id);
  for (const b of aparteEnCarga) {
    const o = orders.find((x) => x.id === b.orderId);
    if (!o) continue;
    const envio = (o.grupoEnvio && orders.find((x) => x.id === o.grupoEnvio)) || o;
    const montaje = tieneMontajeFurniture(o.services);
    const telefono = limpiarTelefonoFurniture(envio.phone);
    const observaciones = "Resto del pedido " + referenciaPedido(o) + " (segundo envío)";
    for (const descrip of descripcionesBackorder(b, o.product, tapaPartidaFurniture(o.services), o.services)) {
      rows.push([
        fechaTexto, "", referenciaPedido(envio) + (b.refSuffix || ""), envio.name, envio.furnitureAddress || envio.address || "",
        envio.postalCode || "", envio.city || "", descrip, "1", "1229", telefono, telefono, observaciones,
        "", "", "", "", "", "", "", "", "", "", "",
        montaje ? "SUBIDA Y MONTAJE" : "SUBIDA A PISO", "1", "", "", "",
        envio.email || o.email || "", provinciaPorCp(envio.postalCode), "",
      ]);
    }
  }

  return { rows, carga };
}

// === Listado para el almacén (Jennifer, 2026-09-29) ===
// Lo que se mete en una carga de Furniture, para que lo preparen: solo
// producto, referencia de fábrica y si lleva montaje — nada de dirección,
// teléfono ni bultos. Un artículo por fila (no por bulto), con el pedido
// para saber qué va junto (colchones y almohadas no llevan referencia).
function productoAlmacen(b, productoTexto, services) {
  const stockModel = b.stockModel || "";
  const t = stockModel.toLowerCase();
  const color = (b.color || "").replace(/^(tela|polipiel)\s*-\s*/i, "");
  if (t.includes("canap")) {
    const rule = matchCanapeRule(stockModel);
    const medida = parseMedidaFurniture(b.talla);
    const gemelo = b.formato160 ? b.formato160 === "GEMELOS" : !!(medida && esGemeloFurniture(medida, productoTexto));
    const extras = [];
    if (gemelo) extras.push("GEMELOS");
    else if (b.formato160 === "PARTIDO") extras.push("PARTIDO");
    else if (tapaPartidaFurniture(services)) extras.push("TAPA PARTIDA");
    if (tapaReforzadaFurniture(services)) extras.push("TAPA REFORZADA");
    if (b.tapaStock) extras.push("TAPA EN STOCK");
    return [rule ? rule.modelo : stockModel, b.talla, color].filter(Boolean).join(" ") + (extras.length ? " · " + extras.join(" · ") : "");
  }
  const piezas = piezasBackorder({ ...b, cantidad: 1, referencia: "" }, productoTexto, false, services);
  if (t.includes("base") && piezas[1]) return piezas[0].texto + " + " + piezas[1].texto;
  return piezas[0] ? piezas[0].texto : stockModel;
}

async function buildListadoAlmacen(env, cargaId) {
  const ordersStub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
  const [orders, cargas, backorders] = await Promise.all([
    ordersStub.fetch("https://do/orders").then((r) => r.json()),
    ordersStub.fetch("https://do/cargas").then((r) => r.json()),
    inventoryStub(env).fetch("https://do/backorders").then((r) => r.json()),
  ]);
  const carga = cargaId ? cargas.find((c) => c.id === cargaId) : cargas.find((c) => (c.tipo || "furniture") === "furniture" && c.estado === "abierta");
  if (!carga) return { error: "No hay carga abierta." };

  // Mismo orden y mismos artículos que el fichero de Furniture.
  const clavePedido = (o) => String(o.grupoEnvio || o.id);
  const pedidos = orders.filter((o) => o.cargaId === carga.id)
    .sort((a, b) => clavePedido(a).localeCompare(clavePedido(b)) || (a.id === a.grupoEnvio ? -1 : b.id === b.grupoEnvio ? 1 : 0));
  const filas = [];
  // reservado (Jennifer, 2026-10-02): fecha del email con la etiqueta de
  // reserva — ese artículo ya está apartado y etiquetado en el almacén.
  const fila = (pedido, o, referencia, producto, cantidad, b) =>
    filas.push({ pedido, referencia: referencia || "", producto, cantidad: cantidad || 1, montaje: tieneMontajeFurniture(o.services), reservado: (b && b.reservaEnviada) || null });

  for (const o of pedidos) {
    const envio = (o.grupoEnvio && orders.find((x) => x.id === o.grupoEnvio)) || o;
    const lineas = backorders.filter((b) => b.orderId === o.id
      && (b.estado === "pendiente" || b.estado === "cubierto")
      && !b.reposicion && !b.gestoComercial && !b.envioAparte
      && !(b.tipo === "colchon" && b.tipoEnvio !== "FUR"));
    if (!lineas.length) { fila(referenciaPedido(envio), o, "", o.product || "", 1); continue; }
    for (const b of lineas) fila(referenciaPedido(envio), o, b.referencia, productoAlmacen(b, o.product, o.services), b.cantidad, b);
  }
  for (const b of backorders.filter((b) => b.reposicion && b.estado === "pendiente" && b.cargaId === carga.id && !(b.tipo === "colchon" && b.agenciaReposicion === "SEUR"))) {
    const o = orders.find((x) => x.id === b.orderId);
    if (o) fila("REP" + referenciaPedido(o), o, b.referencia, "REPOSICIÓN: " + [b.stockModel, b.talla, b.color].filter(Boolean).join(" "), b.cantidad);
  }
  for (const b of backorders.filter((b) => b.envioAparte && (b.estado === "pendiente" || b.estado === "cubierto") && b.cargaId === carga.id)) {
    const o = orders.find((x) => x.id === b.orderId);
    if (!o) continue;
    const envio = (o.grupoEnvio && orders.find((x) => x.id === o.grupoEnvio)) || o;
    fila(referenciaPedido(envio) + (b.refSuffix || ""), o, b.referencia, productoAlmacen(b, o.product, o.services), b.cantidad, b);
  }
  return { carga, filas };
}

// === Fichero de envíos a SEUR (Jennifer, 2026-09-08) ===
// Dictado columna por columna contra dos ficheros reales que subió
// (63235.xlsx nacional, 48297.xlsx internacional): A REF · B NOMBRE ·
// C DIRECCION · D CP · E POBLACION · F/G TLF (duplicado) · H BULTOS ·
// I KILOS · J CODREMITENTE (sin cabecera visible pero con dato) · K PAIS ·
// L OBSERVACIONES · M/N/O sin usar · P EMAIL · Q SERVICIO · R PRODUCTO.
const SEUR_CSV_HEADERS = [
  "REF", "NOMBRE", "DIRECCION", "CP", "POBLACION", "TLF CONTACTO", "",
  "BULTOS", "KILOS", "", "PAIS", "OBSERVACIONES", "", "", "", "EMAIL", "SERVICIO", "PRODUCTO",
];

// Modelos de almohada con casuística propia de bultos (Jennifer,
// 2026-09-08): Sea Foam nunca comparte bulto con otra unidad aunque el peso
// lo permita; el resto (incluidas Nordic/Zen Relax) sigue la regla general
// de kilos.
const ALMOHADA_NUNCA_COMBINA_KEYWORDS_EXPORT = ["sea foam", "seafoam"];

function limpiarTelefonoSeur(phone) {
  return (phone || "").replace(/^\+34\s*/, "").trim();
}

// 15 caracteres máximo admite Seur en la referencia (Jennifer, 2026-09-08):
// si no cabe, se recorta por delante, quedándose con los dígitos finales.
function truncarReferenciaSeur(ref) {
  return ref.length > 15 ? ref.slice(ref.length - 15) : ref;
}

// "BEZEN" es una convención de Shopify — los pedidos de otras plataformas
// (Carrefour, Maison Du Monde...) usan su propia referencia real (orderRef),
// sin ese prefijo (Jennifer, 2026-09-17, Fase 2 de Carrefour; generalizado
// 2026-09-19 al añadir Maison Du Monde como segunda tienda).
function referenciaPedido(o) {
  return o.platform && o.platform !== "Shopify" && o.orderRef ? o.orderRef : "BEZEN" + o.orderNumber;
}
// Reposición de pieza rota (Jennifer, 2026-09-21): la referencia SIEMPRE
// lleva "REP" delante, sea cual sea la plataforma — si eso hace que se
// pase de los 15 caracteres que admite SEUR, el recorte de
// truncarReferenciaSeur ya quita por delante (nunca por detrás), así que
// no hace falta ningún recorte especial aparte, basta con anteponer "REP"
// antes de truncar.
function referenciaSeur(o, refSuffix, prefijo) {
  // Leroy Merlin (Jennifer, 2026-10-01): la referencia real lleva "00"
  // delante ("001-26263L32415-A"), pero en SEUR tiene que salir sin esos
  // ceros ("1-26263L32415-A").
  let ref = o && o.platform === "Leroy Merlin" ? referenciaPedido(o).replace(/^0+/, "") : referenciaPedido(o);
  const pre = prefijo || "";
  // Segundo envío de Leroy Merlin que no cabe: primero se quita el primer
  // guion ("1-26263L32415-A2" -> "126263L32415-A2") (Jennifer, 2026-10-01).
  if (o && o.platform === "Leroy Merlin" && !pre && (ref + (refSuffix || "")).length > 15) ref = ref.replace("-", "");
  // El prefijo (REP de una reposición, GC de un gesto comercial) se conserva
  // siempre; si no cabe, se quitan caracteres del principio de la
  // referencia, nunca del prefijo (Jennifer, 2026-10-01: "metemos el REP
  // delante y quitamos dígitos de delante hasta que hagamos los 15").
  let cuerpo = ref + (refSuffix || "");
  if (pre.length + cuerpo.length > 15) cuerpo = cuerpo.slice(cuerpo.length - (15 - pre.length));
  return truncarReferenciaSeur(pre + cuerpo);
}

// Reparte las unidades de un pedido en líneas del fichero según las reglas
// de bultos (Jennifer, 2026-09-08): internacional siempre 1 bulto por
// línea; nacional puede combinar varias unidades en una misma línea
// mientras no se pasen los 40kg — salvo Sea Foam, que nunca comparte bulto.
// Cada línea resultante lleva sus propias "piezas" (para construir
// Observaciones) y su peso/bultos ya sumados.
function agruparLineasSeur(piezas, esNacional) {
  if (!esNacional) {
    return piezas.map((p) => ({ piezas: [p], bultos: 1, kilos: p.pesoUnidad }));
  }
  const lineas = [];
  for (const p of piezas) {
    const nuncaCombina = p.tipo === "almohada" && matchesKeywordSeur(p.title, ALMOHADA_NUNCA_COMBINA_KEYWORDS_EXPORT);
    const ultima = lineas[lineas.length - 1];
    if (!nuncaCombina && ultima && Math.round((ultima.kilos + p.pesoUnidad) * 100) / 100 <= 40) {
      ultima.piezas.push(p);
      ultima.bultos += 1;
      ultima.kilos = Math.round((ultima.kilos + p.pesoUnidad) * 100) / 100;
    } else {
      lineas.push({ piezas: [p], bultos: 1, kilos: p.pesoUnidad });
    }
  }
  return lineas;
}

function matchesKeywordSeur(title, keywords) {
  const t = (title || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return keywords.some((k) => t.includes(k));
}

// "COLZNIR150X190 (2UD)" si son 2+ piezas del mismo SKU en la línea; varios
// SKU distintos en la misma línea (nacional combinado) van con "+" entre
// medias (Jennifer, 2026-09-08).
function observacionesSeur(linea) {
  const porSku = new Map();
  for (const p of linea.piezas) {
    if (!porSku.has(p.sku)) porSku.set(p.sku, 0);
    porSku.set(p.sku, porSku.get(p.sku) + 1);
  }
  return [...porSku.entries()].map(([sku, n]) => (n > 1 ? `${sku} (${n}UD)` : sku)).join(" + ");
}

// Listado para el almacén de una carga de SEUR (Jennifer, 2026-10-01: "me
// tengo que poder descargar un listado de todos los pedidos que salen para
// el almacén... si es algo marcado como recibido hoy tiene que ponerlo, si
// es de stock tiene que ponerlo para que así no lo busquen en el sitio
// incorrecto"). Mismos artículos que el fichero de SEUR.
async function buildListadoAlmacenSeur(env, cargaId) {
  const ordersStub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
  const [orders, cargas, backorders] = await Promise.all([
    ordersStub.fetch("https://do/orders").then((r) => r.json()),
    ordersStub.fetch("https://do/cargas").then((r) => r.json()),
    inventoryStub(env).fetch("https://do/backorders").then((r) => r.json()),
  ]);
  const carga = cargas.find((c) => c.id === cargaId && c.tipo === "seur");
  if (!carga) return { error: "No se encuentra esa carga de SEUR." };
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
  const diaDe = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }) : "");
  const corto = (iso) => { const d = diaDe(iso); return d ? d.slice(8, 10) + "/" + d.slice(5, 7) : ""; };
  const producto = (b) => [b.tipo === "almohada" ? "ALMOHADA" : b.tipo === "colchon" ? "COLCHÓN" : "", nombreCortoProducto(b.stockModel), b.talla].filter(Boolean).join(" ");
  const filas = [];
  for (const o of orders) {
    if (o.agencia !== "SEUR" || o.cargaId !== carga.id) continue;
    const cubiertos = backorders.filter((b) => b.orderId === o.id && b.estado === "cubierto");
    if (!cubiertos.length) { filas.push({ pedido: referenciaSeur(o, "", ""), cliente: o.name || "", producto: o.product || "", cantidad: 1, origen: "STOCK" }); continue; }
    for (const b of cubiertos) filas.push({ pedido: referenciaSeur(o, b.refSuffix || "", ""), cliente: o.name || "", producto: producto(b), cantidad: b.cantidad || 1, origen: b.reservaEnviada ? "YA APARTADO CON ETIQUETA DE RESERVA (" + corto(b.reservaEnviada) + ")" : "STOCK" });
  }
  for (const b of backorders) {
    if (b.estado !== "listo-seur" || b.cargaId !== carga.id) continue;
    const o = orders.find((x) => x.id === b.orderId);
    if (!o) continue;
    const prefijo = b.reposicion ? "REP" : b.gestoComercial ? "GC" : "";
    let origen;
    if (b.reservaEnviada) origen = "YA APARTADO CON ETIQUETA DE RESERVA (" + corto(b.reservaEnviada) + ")";
    else if (/^ENVÍO SUELTO/i.test(b.mercanciaFabrica || "")) origen = "APARTADO EN ALMACÉN";
    else if (b.fechaRecibido) origen = diaDe(b.fechaRecibido) === hoy ? "RECIBIDO HOY (" + (b.proveedor || "fábrica") + ")" : "RECIBIDO " + corto(b.fechaRecibido) + " (" + (b.proveedor || "fábrica") + ")";
    else origen = "RECIBIDO DE " + (b.proveedor || "FÁBRICA");
    filas.push({ pedido: referenciaSeur(o, b.refSuffix || "", prefijo), cliente: o.name || "", producto: producto(b), cantidad: b.cantidad || 1, origen });
  }
  filas.sort((a, b) => a.origen.localeCompare(b.origen) || a.pedido.localeCompare(b.pedido));
  return { carga, filas };
}

// Códigos postales de Portugal sin el guion (Jennifer, 2026-10-01: "para
// que seur los coja bien les tenemos que quitar el - que hay entre los
// números"): 1000-001 -> 1000001.
function cpSeur(o) {
  const cp = String(o.postalCode || "").trim();
  return String(o.countryCode || "").toUpperCase() === "PT" ? cp.replace(/[^0-9]/g, "") : cp;
}

// Todo lo que necesita buildSeurExport, para cargarlo una sola vez cuando
// se recorren muchas cargas (lista de "Envíos SEUR").
async function cargarDatosSeurExport(env) {
  const ordersStub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
  const invStub = inventoryStub(env);
  const [orders, cargas, backorders, catalog, pesosList] = await Promise.all([
    ordersStub.fetch("https://do/orders").then((r) => r.json()),
    ordersStub.fetch("https://do/cargas").then((r) => r.json()),
    invStub.fetch("https://do/backorders").then((r) => r.json()),
    invStub.fetch("https://do/catalog").then((r) => r.json()),
    invStub.fetch("https://do/pesos").then((r) => r.json()),
  ]);
  return { orders, cargas, backorders, catalog, pesosList };
}

// opts.datos: lo de cargarDatosSeurExport ya cargado. opts.incluirServidos:
// para rehacer una carga ya cerrada, cuyos artículos pasaron a "servido"
// al enviarse.
async function buildSeurExport(env, cargaId, opts = {}) {
  const { orders, cargas, backorders, catalog, pesosList } = opts.datos || (await cargarDatosSeurExport(env));
  const servido = (b) => opts.incluirServidos && b.estado === "servido";

  const carga = cargas.find((c) => c.id === cargaId && c.tipo === "seur");
  if (!carga) return { error: "No se encuentra esa carga de SEUR." };

  const pesos = Object.fromEntries(pesosList.map((p) => [p.sku, p.peso]));
  // Varios productos del Catálogo pueden compartir el mismo "modelo de
  // stock" (para agrupar SKU de distintas plataformas) — cualquiera de
  // ellos vale para leer el SKU/título con el que se calificó NetExpress.
  const productoPorStockModel = new Map();
  for (const p of catalog) if (!productoPorStockModel.has(p.stockModel)) productoPorStockModel.set(p.stockModel, p);

  // Un envío de SEUR puede venir de dos sitios (Jennifer, 2026-09-08): el
  // pedido se asignó solo a la carga al procesarse con stock real
  // ("cubierto", ligado por orderId a un pedido con agencia SEUR y ese
  // cargaId), o un colchón se preparó a mano desde Luso/New al llegar el
  // camión ("listo-seur", ligado directo por su propio cargaId).
  const ordersById = new Map(orders.map((o) => [o.id, o]));
  const itemsPorPedido = new Map(); // orderId -> [{sku, title, talla, tipo, pesoUnidad, refSuffix}]

  function agregarItem(orderId, b) {
    const product = productoPorStockModel.get(b.stockModel);
    const sku = product ? seurSkuExport(product, b.talla) : `${b.stockModel}${b.talla}`.toUpperCase();
    const pesoUnidad = pesos[sku] != null ? pesos[sku] : null;
    if (!itemsPorPedido.has(orderId)) itemsPorPedido.set(orderId, []);
    const lista = itemsPorPedido.get(orderId);
    for (let i = 0; i < b.cantidad; i++) {
      lista.push({ sku, title: product?.title || b.stockModel, talla: b.talla, tipo: b.tipo, pesoUnidad, refSuffix: b.refSuffix || "", reposicion: !!b.reposicion, gestoComercial: !!b.gestoComercial });
    }
  }

  for (const o of orders) {
    if (o.agencia !== "SEUR" || o.cargaId !== carga.id) continue;
    for (const b of backorders) {
      if (b.orderId === o.id && (b.estado === "cubierto" || (servido(b) && !b.cargaId))) agregarItem(o.id, b);
    }
  }
  for (const b of backorders) {
    if ((b.estado === "listo-seur" || servido(b)) && b.cargaId === carga.id) agregarItem(b.orderId, b);
  }

  const rows = [];
  const rowOrderIds = []; // orderId de cada fila de rows, mismo orden
  const avisos = [];
  for (const [orderId, piezas] of itemsPorPedido) {
    const o = ordersById.get(orderId);
    if (!o) continue;
    const esNacional = o.countryCode === "ES" || o.countryCode === "PT";
    const codRemitente = esNacional ? "63235" : "48297";
    const telefono = limpiarTelefonoSeur(o.phone);
    const direccion = o.streetAddress || o.address || "";

    // Cada refSuffix ya asignado (por división manual o por deshacer un
    // "listo-seur") forma su propio grupo — nunca se combinan piezas con
    // sufijo distinto en la misma línea, son envíos distintos de verdad.
    const porSufijo = new Map();
    for (const p of piezas) {
      if (!porSufijo.has(p.refSuffix)) porSufijo.set(p.refSuffix, []);
      porSufijo.get(p.refSuffix).push(p);
    }

    for (const [sufijoBase, piezasGrupo] of porSufijo) {
      const lineas = agruparLineasSeur(piezasGrupo, esNacional);
      lineas.forEach((linea, idx) => {
        // La primera línea de un grupo usa el sufijo ya asignado; si hace
        // falta dividir en más líneas (varios bultos internacional, o
        // nacional pasándose de 40kg), las siguientes avanzan el sufijo
        // para no repetir referencia.
        let sufijo = sufijoBase;
        for (let i = 0; i < idx; i++) sufijo = nextRefSuffixExport(sufijo);
        // "REP"/"GC" delante solo si TODAS las piezas de esta línea son del
        // mismo tipo especial (Jennifer, 2026-09-21/22) — evita marcar como
        // reposición o gesto comercial un envío mixto real, que no debería
        // darse en la práctica.
        const esReposicion = linea.piezas.every((p) => p.reposicion);
        const esGestoComercial = linea.piezas.every((p) => p.gestoComercial);
        const ref = referenciaSeur(o, sufijo, esReposicion ? "REP" : esGestoComercial ? "GC" : "");

        const netExpress = linea.piezas.some((p) => p.tipo === "colchon" && calificaNetExpressExport(p.title, p.talla));
        const servicio = !esNacional ? (netExpress ? "19" : "77") : "31";
        const producto = !esNacional ? (netExpress ? "10" : "70") : "2";

        const sinPeso = linea.piezas.filter((p) => p.pesoUnidad == null);
        if (sinPeso.length) avisos.push(`${referenciaPedido(o)}: sin peso conocido para ${[...new Set(sinPeso.map((p) => p.sku))].join(", ")} — revisa Pesos SEUR.`);

        rows.push([
          ref, o.name, direccion, cpSeur(o), o.city || "",
          telefono, telefono, String(linea.bultos), String(linea.kilos),
          codRemitente, o.countryCode || "", observacionesSeur(linea),
          "", "", "", o.email || "", servicio, producto,
        ]);
        rowOrderIds.push(o.id);
      });
    }
  }

  return { rows, rowOrderIds, carga, avisos };
}

// Líneas de una carga para la lista "Envíos SEUR": REF (0), NOMBRE (1),
// PAIS (10), OBSERVACIONES (11) del fichero de SEUR.
function enviosDeExportSeur(result) {
  return result.rows.map((r, i) => ({ orderId: result.rowOrderIds[i], ref: r[0], nombre: r[1], pais: r[10], observaciones: r[11] }));
}

// === Correo con SEUR desde "Envíos SEUR" (Jennifer, 2026-10-02) ===
// Se escribe desde la cuenta de Gmail de Jennifer vía el Apps Script; las
// respuestas llegan a su bandeja y la app las lee del mismo script.
// 63235 (España/Portugal) -> atención al cliente nacional; 48297 -> internacional.
function destinoSeurDePedido(o) {
  const cc = String((o && o.countryCode) || "").toUpperCase();
  return cc === "ES" || cc === "PT" ? "nacional" : "internacional";
}

function ordersStubSeur(env) {
  return env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
}

// Mensajes de SEUR sin leer de una conversación.
function noLeidosCorreo(correo) {
  if (!correo || !correo.mensajes) return 0;
  const visto = correo.vistoHasta || "";
  return correo.mensajes.filter((m) => m.deSeur && (m.fecha || "") > visto).length;
}

// Relee del Gmail todas las conversaciones con SEUR abiertas desde la app y
// guarda los mensajes nuevos. Los correos de SEUR fuera de esos hilos (si
// abren un correo nuevo con nº de incidencia) se enganchan a la línea cuya
// referencia o nº de expedición aparezca en el asunto o el texto.
async function actualizarCorreosSeur(env, segundaPasada) {
  const orders = await ordersStubSeur(env).fetch("https://do/orders").then((r) => r.json());
  const norm = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const lineas = [];
  for (const o of orders) {
    for (const [ref, info] of Object.entries(o.enviosSeurInfo || {})) {
      if (!info.correo || !(info.correo.threadIds || []).length) continue;
      const t = (o.seurTracking || []).find((x) => norm(x.referencia) === norm(ref));
      lineas.push({ o, ref, correo: info.correo, expedicion: t ? String(t.numeroExpedicion || "") : "" });
    }
    // Envíos SIN conversación guardada (Jennifer, 2026-10-02, 76414228-A:
    // el email salió pero la app no lo apuntó): si SEUR contesta citando la
    // referencia o la expedición, la conversación se engancha sola.
    for (const t of o.seurTracking || []) {
      const ref = t.referencia;
      if (t.anulado || !ref || norm(ref).length < 8) continue;
      const info = (o.enviosSeurInfo || {})[ref];
      if (info && info.correo && (info.correo.threadIds || []).length) continue;
      lineas.push({ o, ref, correo: { threadIds: [], destino: destinoSeurDePedido(o) }, expedicion: String(t.numeroExpedicion || ""), sinConversacion: true });
    }
  }
  if (!lineas.length) return { ok: true, lineas: 0, nuevos: 0 };
  const threadIds = [...new Set(lineas.flatMap((l) => l.correo.threadIds))];
  const r = await llamarScriptSeur(env, "seur-leer", { threadIds });
  if (!r.ok) return { ok: false, error: r.error };
  const cambios = [];
  let nuevos = 0;
  for (const l of lineas) {
    const ids = new Set(l.correo.threadIds);
    for (const m of r.sueltos || []) {
      const texto = norm((m.asunto || "") + " " + (m.texto || ""));
      if (texto.includes(norm(l.ref)) || (l.expedicion.length >= 6 && texto.includes(norm(l.expedicion)))) ids.add(m.threadId);
    }
    const porId = new Map();
    for (const id of ids) for (const m of (r.hilos || {})[id] || []) porId.set(m.id, { ...m, threadId: id });
    for (const m of r.sueltos || []) if (ids.has(m.threadId)) porId.set(m.id, m);
    const mensajes = [...porId.values()].sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""))
      .map((m) => ({ id: m.id, threadId: m.threadId, fecha: m.fecha, de: m.de, asunto: m.asunto, texto: String(m.texto || "").slice(0, 6000), deSeur: !!m.deSeur }))
      .slice(-40);
    if (!mensajes.length) continue;
    const antes = new Set((l.correo.mensajes || []).map((m) => m.id));
    nuevos += mensajes.filter((m) => m.deSeur && !antes.has(m.id)).length;
    const correo = { threadIds: [...ids], mensajes, actualizado: new Date().toISOString() };
    if (l.sinConversacion) { correo.destino = l.correo.destino; correo.asunto = mensajes[0].asunto || ""; }
    // No se marca "reclamado": puede ser SEUR quien abre la conversación
    // ("Solicitud entrega Pedido…" pidiendo instrucciones).
    cambios.push({ orderId: l.o.id, ref: l.ref, correo });
  }
  if (cambios.length) await ordersStubSeur(env).fetch("https://do/orders/envios-seur-correos", { method: "POST", body: JSON.stringify({ cambios }) });
  // Conversación recién enganchada: otra pasada para traer el hilo entero
  // (también el email que mandamos nosotros).
  const enganchadas = lineas.filter((l) => l.sinConversacion && cambios.some((c) => c.orderId === l.o.id && c.ref === l.ref)).length;
  if (enganchadas && !segundaPasada) await actualizarCorreosSeur(env, true);
  return { ok: true, lineas: lineas.length, nuevos, enganchadas };
}

// Estado en SEUR de una línea: la entrada de seguimiento con la misma
// referencia (sin espacios ni guiones). Si el pedido solo tiene un envío y
// una entrada, se usa esa.
function estadoSeurDeLinea(order, ref, lineasDelPedido) {
  const norm = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const tracking = (order && order.seurTracking ? order.seurTracking : []).filter((t) => !t.anulado);
  // Solo la misma referencia exacta (Jennifer, 2026-10-02): antes, con una
  // sola entrada se usaba esa aunque fuera de otro envío, y las líneas
  // "…-A2" salían con el estado del primer envío "…-A".
  const t = tracking.find((x) => norm(x.referencia) === norm(ref));
  return t || null;
}

function seurSkuExport(product, talla) {
  return `${(product.skuPrefix || "").toUpperCase()}${talla}`;
}
function nextRefSuffixExport(current) {
  const n = parseInt(current, 10);
  return Number.isFinite(n) ? String(n + 1) : "2";
}
const NETEXPRESS_ANCHO_135_KEYWORDS_EXPORT = [
  "generacion z", "generacion zen", "paris", "zen mandala", "zen nirvana",
  "zen natural", "natural zen", "supreme zen", "origin zen",
];
const NETEXPRESS_ANCHO_180_KEYWORDS_EXPORT = [
  "pharmatherapy", "pharma-therapy", "bamboo deluxe", "bambu deluxe",
  "bellagio deluxe", "4d", "fitness", "latex gel", "ergo-relax",
  "ergo relax", "louvre", "murano", "toscana deluxe",
];
function calificaNetExpressExport(title, talla) {
  const m = /^(\d{2,3})X\d{2,3}$/.exec(talla || "");
  if (!m) return false;
  const ancho = Number(m[1]);
  if (matchesKeywordSeur(title, NETEXPRESS_ANCHO_135_KEYWORDS_EXPORT)) return ancho >= 135;
  if (matchesKeywordSeur(title, NETEXPRESS_ANCHO_180_KEYWORDS_EXPORT)) return ancho >= 180;
  return false;
}

// Fecha elegida para una carga de SEUR: AAAA-MM-DD, laborable y no pasada
// (hora de Madrid). Devuelve el motivo si no vale, o null.
function errorFechaCargaSeur(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return "Fecha no válida.";
  const w = new Date(fecha + "T12:00:00Z").getUTCDay();
  if (w === 0 || w === 6) return "No hay cargas de SEUR ni sábado ni domingo.";
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
  if (fecha < hoy) return "Esa fecha ya ha pasado.";
  return null;
}

function buildSeurCsv(rows) {
  const lines = [SEUR_CSV_HEADERS.map(csvEscapeFurniture).join(";")];
  for (const row of rows) lines.push(row.map(csvEscapeFurniture).join(";"));
  return "﻿" + lines.join("\r\n");
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

    // Admin, no expuesto en UI: sincroniza a mano el estado de
    // shopifyFulfilled/shopifyFulfillmentId de un pedido cuando el
    // fulfillment se creó fuera del flujo normal (ej. pruebas puntuales
    // directas contra la API de Shopify) — para que un seguimiento
    // posterior del mismo pedido sepa que tiene que actualizar el
    // fulfillment existente en vez de intentar crear uno nuevo.
    if (url.pathname === "/api/pedidos/admin/set-agencia" && request.method === "POST") {
      const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
      const res = await stub.fetch("https://do/orders/admin/set-agencia", { method: "POST", body: await request.text() });
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/pedidos/shopify/admin/shopify-fulfilled" && request.method === "POST") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/orders/shopify-fulfilled", { method: "POST", body: await request.text() });
      return new Response(await res.text(), { status: res.status });
    }

    // Diagnóstico admin, no expuesto en UI: confirma qué permisos (scopes)
    // tiene de verdad el token de Shopify que usa el Worker en producción
    // (nunca devuelve el token en sí, solo la lista de scopes concedidos).
    if (url.pathname === "/api/pedidos/shopify/admin/scopes") {
      const res = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/oauth/access_scopes.json`, {
        headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN },
      });
      const data = await res.json();
      return Response.json({ status: res.status, ...data });
    }

    if (url.pathname === "/api/pedidos/shopify") {
      return handleGetOrders(env);
    }

    // Importar un pedido suelto de Shopify por número (Jennifer,
    // 2026-09-24, caso real REPBEZEN11563): el sync normal solo trae los
    // últimos 4 meses, pero una reposición puede referirse a un pedido más
    // antiguo (el cliente compra, y meses después algo se rompe) — sin este
    // pedido en el sistema, ningún seguimiento (SEUR/Furniture) puede
    // engancharse a él. Busca el pedido en Shopify por su número real y lo
    // importa con el mismo pipeline que el sync/webhook normal
    // (handleUpsertOrder → mapOrder → /orders/upsert), así que respeta las
    // mismas reglas de siempre (SHOPIFY_PROCESAMIENTO_DESDE, etc.). No
    // expuesto en la UI todavía.
    // Solo lectura (Jennifer, 2026-10-01: buscar dónde trae Shopify la fecha
    // de entrega de cada pedido): campos en bruto de UN pedido, sin guardar
    // nada. ?numero=12250
    if (url.pathname === "/api/admin/shopify-pedido-bruto" && request.method === "GET") {
      const numero = url.searchParams.get("numero");
      const res = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/orders.json?status=any&name=%23${numero}`, {
        headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN },
      });
      const data = await res.json();
      const o = (data.orders || []).find((x) => String(x.order_number) === String(numero));
      if (!o) return Response.json({ ok: false, error: "No encontrado." }, { status: 404 });
      return Response.json({
        ok: true, order_number: o.order_number, created_at: o.created_at, note: o.note, note_attributes: o.note_attributes, tags: o.tags,
        shipping_lines: (o.shipping_lines || []).map((s) => ({ title: s.title, code: s.code, source: s.source, delivery_category: s.delivery_category })),
        line_items: (o.line_items || []).map((li) => ({ title: li.title, variant_title: li.variant_title, properties: li.properties })),
        estimated_delivery: o.estimated_delivery_at || null,
      });
    }

    if (url.pathname === "/api/admin/importar-pedido-suelto" && request.method === "POST") {
      const { numero } = await request.json();
      if (!numero) return Response.json({ ok: false, error: "Falta el número de pedido." }, { status: 400 });
      const res = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/orders.json?status=any&name=%23${numero}`, {
        headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN },
      });
      const data = await res.json();
      const found = (data.orders || []).find((o) => String(o.order_number) === String(numero));
      if (!found) return Response.json({ ok: false, error: "No se encontró ese pedido en Shopify." }, { status: 404 });
      await handleUpsertOrder(found, env);
      // Un pedido antiguo importado así se fulfilló en Shopify FUERA de
      // nuestro flujo normal (antes de que este sistema existiera) —
      // mapOrder() no guarda shopifyFulfilled/shopifyFulfillmentId, así que
      // sin este paso un seguimiento nuevo (ej. de una reposición) creería
      // que es el "primer envío" e intentaría crear un fulfillment nuevo en
      // vez de actualizar el que ya existe (ver shopify-fulfilled más
      // abajo, mismo mecanismo que ya usa el pack partido en dos envíos).
      const ultimoFulfillment = (found.fulfillments || [])[found.fulfillments.length - 1];
      if (ultimoFulfillment) {
        const idStub = env.ORDERS_STORE.idFromName("shopify");
        const stub = env.ORDERS_STORE.get(idStub);
        await stub.fetch("https://do/orders/shopify-fulfilled", {
          method: "POST",
          body: JSON.stringify({ id: found.id, fulfillmentId: ultimoFulfillment.id }),
        });
      }
      return Response.json({ ok: true, orderNumber: found.order_number, id: found.id, created_at: found.created_at, fulfillmentId: ultimoFulfillment ? ultimoFulfillment.id : null });
    }

    // Marketplaces tipo Mirakl (Carrefour, Fase 2, Jennifer 2026-09-17;
    // generalizado 2026-09-19 al añadir Maison Du Monde con "exactamente el
    // mismo funcionamiento que Carrefour"): pedidos gestionados y vistos de
    // forma independiente por plataforma, PERO comparten cargas de
    // SEUR/Furniture y las listas de Polival/Luso/New con Shopify (mismo
    // stock físico, mismos camiones) — así que viven en la MISMA instancia
    // de OrdersStore que Shopify ("shopify"). `mapMarketplaceOrder()`
    // construye un pedido con la misma forma que `mapOrder()` de Shopify
    // (items con productId real del Catálogo, resuelto por SKU) para poder
    // reusar tal cual `/orders/import` → processInventory →
    // InventoryStore.processSale, sin tocar ese motor. Todos estos pedidos
    // se tratan como PAGADOS (confirmado por Jennifer, 2026-09-17: "en
    // principio sí vamos a tratar todos como pagados") — a diferencia de
    // Shopify, aquí no hay un estado de pago fiable fila a fila.
    const marketplaceImportMatch = url.pathname.match(/^\/api\/(carrefour|maison-du-monde|worten|conforama|conforama-es|leroy-merlin)\/import$/);
    if (marketplaceImportMatch && request.method === "POST") {
      const platform = MARKETPLACE_PLATFORM_BY_ID[marketplaceImportMatch[1]];
      const { entries } = await request.json();
      const catalogRes = await inventoryStub(env).fetch("https://do/catalog");
      const catalogList = await catalogRes.json();
      const catalogMap = Object.fromEntries(catalogList.map((p) => [p.productId, p]));
      // Agrupar por "Número de pedido" ANTES de mapear (Jennifer,
      // 2026-09-23, caso real Carrefour 76257042-A: "hay clientes que
      // compran dos colchones en un mismo pedido, en ese caso habría que
      // gestionar ambos") — si no se agrupa aquí, cada fila genera un
      // pedido con el mismo id y la última pisa a las anteriores al
      // guardar (ver comentario en mapMarketplaceOrder).
      const entriesPorPedido = new Map();
      for (const e of entries || []) {
        if (!entriesPorPedido.has(e.orderNumber)) entriesPorPedido.set(e.orderNumber, []);
        entriesPorPedido.get(e.orderNumber).push(e);
      }
      const orders = [...entriesPorPedido.values()].map((grupo) => mapMarketplaceOrder(grupo, catalogMap, platform));
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      // PROCESAMIENTO_DESDE (arriba del fichero): solo los pedidos con
      // fecha igual o posterior pasan por el motor real de agencia/stock
      // (/orders/import); el resto se guarda sin tocar stock
      // (/orders/import-simple), igual que en la Fase 1.
      const cutoff = PROCESAMIENTO_DESDE[platform];
      const conMotor = orders.filter((o) => marketplaceFechaDesde(o.orderDate, cutoff) && marketplaceEstadoElegible(o));
      const sinMotor = orders.filter((o) => !(marketplaceFechaDesde(o.orderDate, cutoff) && marketplaceEstadoElegible(o)));
      let tramitadosAhora = 0;
      if (conMotor.length) {
        const r = await stub.fetch("https://do/orders/import", { method: "POST", body: JSON.stringify(conMotor) }).then((x) => x.json()).catch(() => ({}));
        tramitadosAhora = r.tramitadosAhora || 0;
      }
      if (sinMotor.length) await stub.fetch("https://do/orders/import-simple", { method: "POST", body: JSON.stringify(sinMotor) });
      const sinMatch = orders.filter((o) => !o.skuMatched).length;
      return Response.json({ ok: true, actualizados: orders.length, procesados: tramitadosAhora, sinMatch });
    }

    const marketplacePedidosMatch = url.pathname.match(/^\/api\/(carrefour|maison-du-monde|worten|conforama|conforama-es|leroy-merlin)\/pedidos$/);
    if (marketplacePedidosMatch && request.method === "GET") {
      const platform = MARKETPLACE_PLATFORM_BY_ID[marketplacePedidosMatch[1]];
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/orders");
      const all = await res.json();
      return Response.json(all.filter((o) => o.platform === platform));
    }

    // Cancelar/anotar pedidos de estos marketplaces (Jennifer, 2026-09-17):
    // mismo mecanismo que Shopify (/orders/meta ya es genérico en
    // orders-store.js) — el cliente ya llama directo a
    // /api/pedidos/shopify/meta (ver renderMarketplace), esta ruta se deja
    // solo por compatibilidad con la Fase 2 original de Carrefour.
    if (url.pathname === "/api/carrefour/meta" && request.method === "POST") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      return stub.fetch("https://do/orders/meta", { method: "POST", body: await request.text() });
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
      const res = await proxyInventory(env, `/backorders/${resolvePendingMatch[1]}/resolver`, request);
      const texto = await res.text();
      // Reserva automática (Jennifer, 2026-10-01: "cuando venga el camión y
      // yo lo marque como recibido, si ese colchón tiene que esperar para
      // juntarse con el resto de cosas porque tiene referencia FUR,
      // directamente tú tienes que mandar el email"): colchón FUR recién
      // recibido cuyo pedido todavía espera a otro artículo.
      let entry = null;
      try { entry = JSON.parse(texto); } catch (e) { /* respuesta no JSON */ }
      if (res.ok && entry && entry.recibidoFabrica && entry.tipo === "colchon" && entry.tipoEnvio === "FUR" && !entry.reservaEnviada) {
        const backorders = await inventoryStub(env).fetch("https://do/backorders").then((r) => r.json());
        const resto = backorders.filter((b) => String(b.orderId) === String(entry.orderId) && b.id !== entry.id
          && (b.estado === "pendiente" || b.estado === "cubierto") && !b.reposicion && !b.gestoComercial && !b.envioAparte
          && !(b.tipo === "colchon" && b.tipoEnvio !== "FUR"));
        if (resto.some((b) => !b.recibidoFabrica)) {
          const avisoReserva = await reservarStockManual(env, entry);
          if (avisoReserva.ok) {
            await inventoryStub(env).fetch("https://do/backorders/" + encodeURIComponent(entry.id) + "/reserva-enviada", { method: "POST", body: "{}" });
            entry.reservaEnviada = new Date().toISOString();
          }
          entry.avisoReserva = avisoReserva;
        }
        return Response.json(entry);
      }
      return new Response(texto, { status: res.status, headers: { "content-type": "application/json" } });
    }

    const resolveSeurPendingMatch = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/resolver-seur$/);
    if (resolveSeurPendingMatch && request.method === "POST") {
      return proxyInventory(env, `/backorders/${resolveSeurPendingMatch[1]}/resolver-seur`, request);
    }

    const undoSeurPendingMatch = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/deshacer-seur$/);
    if (undoSeurPendingMatch && request.method === "POST") {
      return proxyInventory(env, `/backorders/${undoSeurPendingMatch[1]}/deshacer-seur`, request);
    }

    const alternativasPendingMatch = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/alternativas$/);
    if (alternativasPendingMatch && request.method === "GET") {
      return proxyInventory(env, `/backorders/${alternativasPendingMatch[1]}/alternativas`, request);
    }

    // Formato GEMELOS/PARTIDO de un canapé de 160 (Jennifer, 2026-09-28): se
    // guarda en el pendiente y además se da por respondida la pregunta de
    // la campana de ese pedido.
    const formato160Match = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/formato160$/);
    if (formato160Match && request.method === "POST") {
      const body = await request.text();
      const res = await inventoryStub(env).fetch("https://do/backorders/" + formato160Match[1] + "/formato160", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.entry) {
        const ordersStub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
        const o = await pedidoDeBackorder(env, data.entry);
        const reasons = (o && o.reviewReasons) || [];
        const answers = ((o && o.reviewAnswers) || []).slice();
        const idx = reasons.findIndex((r, i) => r.startsWith(PREGUNTA_FORMATO_160) && r.includes("(" + data.entry.talla) && !(answers[i] || "").trim());
        if (idx >= 0) {
          answers[idx] = data.entry.formato160 + " (elegido en Polival)";
          await ordersStub.fetch("https://do/orders/review-note", { method: "POST", body: JSON.stringify({ id: o.id, reviewAnswers: answers }) });
        }
      }
      return Response.json(data, { status: res.status });
    }

    // Colchones abiertos (Jennifer, 2026-09-28) — ver adjustAbiertos/usarAbierto.
    if (url.pathname === "/api/inventario/abiertos" && request.method === "GET") {
      return proxyInventory(env, "/abiertos", request);
    }
    if (url.pathname === "/api/inventario/abiertos/adjust" && request.method === "POST") {
      return proxyInventory(env, "/abiertos/adjust", request);
    }
    const usarAbiertoMatch = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/usar-abierto$/);
    if (usarAbiertoMatch && request.method === "POST") {
      const res = await inventoryStub(env).fetch("https://do/backorders/" + usarAbiertoMatch[1] + "/usar-abierto", { method: "POST", body: await request.text() });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.entry) {
        // El abierto se queda en el almacén hasta la carga de Furniture:
        // reserva con su etiqueta, como cualquier otro artículo de stock.
        const entry = data.entry;
        const o = await pedidoDeBackorder(env, entry);
        data.avisoReserva = await enviarReservaAlmacen(env, {
          pedido: referenciaPedidoAlmacen(entry),
          cliente: (o && o.name) || "",
          lineasTexto: [lineaTextoReserva(entry) + " — COLCHÓN ABIERTO" + (entry.notaAbierto ? " (" + entry.notaAbierto + ")" : "") + (entry.enrolladoDevuelto ? " (sustituye al enrollado, que vuelve a stock)" : "")],
          bultos: bultosPorUnidad(entry).map((b) => ({ ...b, parte: "COLCHÓN ABIERTO" + (entry.notaAbierto ? " · " + entry.notaAbierto : "") })),
        });
        if (data.avisoReserva.ok) {
          await inventoryStub(env).fetch("https://do/backorders/" + usarAbiertoMatch[1] + "/reserva-enviada", { method: "POST", body: "{}" });
        }
      }
      return Response.json(data, { status: res.status });
    }

    const sustituirPendingMatch = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/sustituir$/);
    if (sustituirPendingMatch && request.method === "POST") {
      const body = await request.text();
      const res = await inventoryStub(env).fetch("https://do/backorders/" + sustituirPendingMatch[1] + "/sustituir", { method: "POST", body });
      const texto = await res.text();
      let data = null;
      try { data = JSON.parse(texto); } catch (e) { /* respuesta no JSON: se devuelve tal cual */ }
      // Transformación hecha: aviso por email al almacén (Jennifer, 2026-09-28)
      // — no bloquea ni deshace la transformación si el email falla.
      if (res.ok && data && data.ok && data.entry && data.entry.transformadoDesde) {
        data.avisoAlmacen = await avisarAlmacenTransformacion(env, data.entry);
        return Response.json(data);
      }
      return new Response(texto, { status: res.status, headers: { "content-type": "application/json" } });
    }

    const planPendingMatch = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/plan$/);
    if (planPendingMatch && request.method === "POST") {
      return proxyInventory(env, `/backorders/${planPendingMatch[1]}/plan`, request);
    }

    const referenciaPendingMatch = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/referencia$/);
    if (referenciaPendingMatch && request.method === "POST") {
      // Al marcar un artículo como "STOCK" (Jennifer, 2026-09-28), se manda
      // la reserva al almacén con sus etiquetas — una sola vez por artículo.
      const body = await request.text();
      const id = decodeURIComponent(referenciaPendingMatch[1]);
      const antes = (await (await inventoryStub(env).fetch("https://do/backorders")).json()).find((b) => b.id === id);
      const res = await inventoryStub(env).fetch("https://do/backorders/" + referenciaPendingMatch[1] + "/referencia", { method: "POST", body });
      const texto = await res.text();
      let nueva = "";
      try { nueva = String(JSON.parse(body).referencia || "").trim().toUpperCase(); } catch (e) { /* sin referencia */ }
      if (res.ok && antes && nueva === "STOCK" && !antes.reservaEnviada) {
        const entry = { ...antes, referencia: "STOCK" };
        const avisoReserva = await reservarStockManual(env, entry);
        if (avisoReserva.ok) {
          await inventoryStub(env).fetch("https://do/backorders/" + referenciaPendingMatch[1] + "/reserva-enviada", { method: "POST", body: "{}" });
        }
        let data = {};
        try { data = JSON.parse(texto); } catch (e) { /* respuesta no JSON */ }
        return Response.json({ ...data, avisoReserva });
      }
      return new Response(texto, { status: res.status, headers: { "content-type": "application/json" } });
    }

    // Reserva en almacén de un artículo ya recibido que espera al resto de
    // su pedido (Jennifer, 2026-10-01: "cuando viene el camión vienen
    // colchones que van a salir por Furniture... necesito que hagamos las
    // etiquetas de reserva y las mandemos al almacén"). Manda el email con
    // sus etiquetas y lo marca como reservado.
    const reservarMatch = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/reservar-almacen$/);
    if (reservarMatch && request.method === "POST") {
      const id = decodeURIComponent(reservarMatch[1]);
      const backorders = await inventoryStub(env).fetch("https://do/backorders").then((r) => r.json());
      const entry = backorders.find((b) => b.id === id);
      if (!entry) return Response.json({ ok: false, error: "Artículo no encontrado." }, { status: 404 });
      // Nunca dos veces sin querer (Jennifer, 2026-10-02): si ya se mandó,
      // solo con ?forzar=1 (el navegador lo pregunta antes).
      if (entry.reservaEnviada && url.searchParams.get("forzar") !== "1") {
        return Response.json({ ok: false, yaEnviada: entry.reservaEnviada }, { status: 409 });
      }
      const avisoReserva = await reservarStockManual(env, entry);
      if (avisoReserva.ok) await inventoryStub(env).fetch("https://do/backorders/" + encodeURIComponent(id) + "/reserva-enviada", { method: "POST", body: "{}" });
      return Response.json({ ok: !!avisoReserva.ok, avisoReserva });
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

    if (url.pathname === "/api/inventario/admin/reset-polival-counter" && request.method === "POST") {
      return proxyInventory(env, "/admin/reset-polival-counter", request);
    }

    if (url.pathname === "/api/inventario/admin/set-polival-counter" && request.method === "POST") {
      return proxyInventory(env, "/admin/set-polival-counter", request);
    }

    if (url.pathname === "/api/inventario/pendientes/set-campo" && request.method === "POST") {
      return proxyInventory(env, "/backorders/set-campo", request);
    }

    if (url.pathname === "/api/inventario/admin/clear-backorders" && request.method === "POST") {
      return proxyInventory(env, "/admin/clear-backorders", request);
    }

    if (url.pathname === "/api/inventario/admin/crear-pendiente-manual" && request.method === "POST") {
      return proxyInventory(env, "/admin/crear-pendiente-manual", request);
    }

    if (url.pathname === "/api/inventario/admin/renombrar-stockmodel-tarifa" && request.method === "POST") {
      return proxyInventory(env, "/admin/renombrar-stockmodel-tarifa", request);
    }

    if (url.pathname === "/api/inventario/admin/renombrar-fichero-plazo" && request.method === "POST") {
      return proxyInventory(env, "/admin/renombrar-fichero-plazo", request);
    }

    if (url.pathname === "/api/inventario/admin/congelar-stock" && request.method === "POST") {
      return proxyInventory(env, "/admin/congelar-stock", request);
    }
    if (url.pathname === "/api/inventario/admin/descongelar-stock" && request.method === "POST") {
      return proxyInventory(env, "/admin/descongelar-stock", request);
    }
    if (url.pathname === "/api/inventario/admin/stock-congelado" && request.method === "GET") {
      return proxyInventory(env, "/admin/stock-congelado", request);
    }

    if (url.pathname === "/api/inventario/admin/backfill-proveedor" && request.method === "POST") {
      return proxyInventory(env, "/admin/backfill-proveedor", request);
    }

    // Mantenimiento puntual, sin UI a propósito (Jennifer, 2026-09-18):
    // añade un artículo suelto a un pedido YA procesado sin volver a tocar
    // lo que ya se descontó — ver addItemToProcessedOrder en
    // inventory-store.js. Usado para el caso real de las almohadas de
    // regalo que no se procesaban hasta corregir mapOrder().
    if (url.pathname === "/api/inventario/admin/add-item-to-order" && request.method === "POST") {
      return proxyInventory(env, "/admin/add-item-to-order", request);
    }

    // Reposición de pieza rota (Jennifer, 2026-09-21): el cliente ya manda
    // el pedido completo (elegido con el botón "⟲" en la propia fila del
    // pedido) — se reenvía a InventoryStore (ver crearReposicion en
    // inventory-store.js) y, si sale bien, se añade también una nota
    // visible en el propio pedido (Pedidos/Furniture), a petición de
    // Jennifer — sin pisar ninguna nota que ya hubiera.
    if (url.pathname === "/api/inventario/reposicion" && request.method === "POST") {
      const bodyText = await request.text();
      const payload = JSON.parse(bodyText);
      const res = await inventoryStub(env).fetch("https://do/admin/reposicion", { method: "POST", body: bodyText });
      const result = await res.json();
      if (res.ok && result.ok) {
        const idOrders = env.ORDERS_STORE.idFromName("shopify");
        const stubOrders = env.ORDERS_STORE.get(idOrders);
        const allOrders = await stubOrders.fetch("https://do/orders").then((r) => r.json());
        const order = allOrders.find((o) => String(o.id) === String(payload.orderId));
        const notaNueva = "REPOSICIÓN: " + (payload.piezaTexto || "artículo completo");
        const notas = order && order.notas ? order.notas + " · " + notaNueva : notaNueva;
        await stubOrders.fetch("https://do/orders/meta", { method: "POST", body: JSON.stringify({ id: payload.orderId, notas }) });
      }
      return Response.json(result, { status: res.status });
    }

    // Gesto comercial (Jennifer, 2026-09-22): mismo patrón que reposición —
    // se reenvía a InventoryStore (ver crearGestoComercial en
    // inventory-store.js) y, si sale bien, se añade también una nota visible
    // en el propio pedido, sin pisar ninguna nota que ya hubiera.
    if (url.pathname === "/api/inventario/gesto-comercial" && request.method === "POST") {
      const bodyText = await request.text();
      const payload = JSON.parse(bodyText);
      const res = await inventoryStub(env).fetch("https://do/admin/gesto-comercial", { method: "POST", body: bodyText });
      const result = await res.json();
      if (res.ok && result.ok) {
        const idOrders = env.ORDERS_STORE.idFromName("shopify");
        const stubOrders = env.ORDERS_STORE.get(idOrders);
        const allOrders = await stubOrders.fetch("https://do/orders").then((r) => r.json());
        const order = allOrders.find((o) => String(o.id) === String(payload.orderId));
        const notaNueva = "GESTO COMERCIAL: " + payload.cantidad + "x almohada" + (payload.motivo ? " — " + payload.motivo : "");
        const notas = order && order.notas ? order.notas + " · " + notaNueva : notaNueva;
        await stubOrders.fetch("https://do/orders/meta", { method: "POST", body: JSON.stringify({ id: payload.orderId, notas }) });
      }
      return Response.json(result, { status: res.status });
    }

    // TARIFAS (Jennifer, 2026-09-22) — ver setTarifaCoste/setTarifaEnvio/
    // setTarifaPeriodoActivo/getTarifaTabla en inventory-store.js.
    if (url.pathname === "/api/tarifas/coste" && request.method === "POST") {
      return proxyInventory(env, "/tarifas/coste", request);
    }
    if (url.pathname === "/api/tarifas/envio" && request.method === "POST") {
      return proxyInventory(env, "/tarifas/envio", request);
    }
    if (url.pathname === "/api/tarifas/periodo-activo" && request.method === "POST") {
      return proxyInventory(env, "/tarifas/periodo-activo", request);
    }
    if (url.pathname === "/api/tarifas/tabla" && request.method === "GET") {
      return inventoryStub(env).fetch("https://do/tarifas/tabla?stockModel=" + encodeURIComponent(url.searchParams.get("stockModel") || ""));
    }
    if (url.pathname === "/api/tarifas/costes" && request.method === "POST") {
      return proxyInventory(env, "/tarifas/costes", request);
    }

    // Exportación de precios a plataforma (Jennifer, 2026-09-23): el .xlsx
    // que devuelve /export es binario, así que NO puede pasar por
    // proxyInventory (hace `res.text()` + fija content-type JSON, corrompe
    // cualquier fichero) — se reenvía tal cual, cabeceras y body incluidos.
    if (url.pathname === "/api/tarifas/plataforma/cargar" && request.method === "POST") {
      return proxyInventory(env, "/tarifas/plataforma/cargar", request);
    }
    if (url.pathname === "/api/tarifas/plataforma/listar" && request.method === "GET") {
      return proxyInventory(env, "/tarifas/plataforma/listar", request);
    }
    const plataformaExportMatch = url.pathname.match(/^\/api\/tarifas\/plataforma\/([^/]+)\/export$/);
    if (plataformaExportMatch && request.method === "GET") {
      const res = await inventoryStub(env).fetch("https://do/tarifas/plataforma/" + plataformaExportMatch[1] + "/export");
      return new Response(res.body, { status: res.status, headers: res.headers });
    }

    // Plazos de entrega > Marketplace (Jennifer, 2026-09-23) — mismo patrón
    // que la exportación de precios: se carga el listado una vez y el
    // .xlsx se regenera en caliente con el stock actual cada descarga.
    if (url.pathname === "/api/plazos/marketplace/cargar" && request.method === "POST") {
      return proxyInventory(env, "/plazos/marketplace/cargar", request);
    }
    if (url.pathname === "/api/plazos/listar" && request.method === "GET") {
      return proxyInventory(env, "/plazos/listar", request);
    }
    if (url.pathname === "/api/plazos/marketplace/export" && request.method === "GET") {
      const res = await inventoryStub(env).fetch("https://do/plazos/marketplace/export");
      return new Response(res.body, { status: res.status, headers: res.headers });
    }

    // Desglose real de piezas físicas para el desplegable de reposición
    // (Jennifer, 2026-09-21): "utilizando las reglas que tenemos para
    // dividir las líneas de FURNITURE" — reusa exactamente
    // descripcionesBackorder/tapaPartidaFurniture/CANAPE_MODELO_RULES, las
    // mismas que generan el Excel real de Furniture, para que un canapé de
    // 3 piezas ofrezca TAPA/CAJÓN/FONDO/etc. en vez de una sola opción
    // genérica. `referencia` se manda vacía a propósito — es solo para
    // elegir la pieza, la referencia de verdad se asigna al confirmar
    // (ver crearReposicion).
    if (url.pathname === "/api/inventario/reposicion/piezas" && request.method === "POST") {
      const { item, services, productoTexto } = await request.json();
      const previewRes = await inventoryStub(env).fetch("https://do/admin/reposicion/preview", {
        method: "POST",
        body: JSON.stringify({ item }),
      });
      if (!previewRes.ok) return new Response(await previewRes.text(), { status: previewRes.status });
      const info = await previewRes.json();
      const tapaPartida = tapaPartidaFurniture(services);
      const b = { stockModel: info.stockModel, talla: info.talla, color: info.color, tipo: info.tipo, referencia: "", cantidad: 1, mercanciaFabrica: null };
      // {parte, texto} por pieza (Jennifer, 2026-09-21): "parte" (ej. "TAPA")
      // es lo que se guarda como Modelo de la reposición; "texto" es la
      // línea completa (con modelo/medida/color) que se ve en el
      // desplegable y que se apunta en "Mercancía para pedir a fábrica".
      const piezas = piezasBackorder(b, productoTexto, tapaPartida, services);
      // tipo también se manda al cliente (Jennifer, 2026-09-22): si es
      // "colchon", el modal tiene que preguntar SEUR/FURNITURE y, si es
      // FURNITURE, si hay recogida del colchón dañado — ver
      // abrirReposicionDesdePedido/cargarPiezasReposicion.
      return Response.json({ ok: true, piezas, tipo: info.tipo });
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

    // Admin, no expuesto en UI: reimporta UN pedido de Shopify por su id
    // numérico (no orderNumber) directamente desde la API de Shopify,
    // reusando el mismo mapeo que el webhook — para huecos puntuales donde
    // un pedido real nunca llegó a guardarse (webhook perdido, y por lo que
    // sea el sync tampoco lo trajo). Caso real 2026-09-21: BEZEN12149
    // existía en Shopify (pagado) pero no en el sistema.
    if (url.pathname === "/api/pedidos/shopify/admin/upsert-one" && request.method === "POST") {
      const { orderId } = await request.json();
      const res = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/orders/${orderId}.json`, {
        headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN },
      });
      if (!res.ok) return new Response(await res.text(), { status: res.status });
      const { order } = await res.json();
      await handleUpsertOrder(order, env);
      return Response.json({ ok: true, orderNumber: order.order_number });
    }

    // "No ha salido" (Jennifer, 2026-09-29): el colchón vuelve a pendiente en
    // su proveedor con referencia "…2" y el pedido sale de la carga de SEUR.
    if (url.pathname === "/api/pedidos/no-salio" && request.method === "POST") {
      const body = await request.text();
      const res = await inventoryStub(env).fetch("https://do/backorders/no-salio", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return Response.json(data, { status: res.status || 500 });
      // Si aún le queda algo por salir en la carga (solo no salió una parte),
      // el pedido sigue en ella y su etiqueta de SEUR sigue valiendo.
      if (!data.quedanEnCarga) {
        await env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify")).fetch("https://do/orders/no-salio-seur", { method: "POST", body });
      }
      return Response.json(data);
    }

    // Cancelar unidades (Jennifer, 2026-09-29): desde un pendiente del
    // proveedor, o desde una línea del pedido. En los dos casos queda
    // anotado en el pedido (lineasCanceladas).
    const cancelarUnidadesMatch = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/cancelar-unidades$/);
    if (cancelarUnidadesMatch && request.method === "POST") {
      const body = await request.text();
      const res = await inventoryStub(env).fetch("https://do/backorders/" + cancelarUnidadesMatch[1] + "/cancelar-unidades", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.cancelado) {
        const c = data.cancelado;
        let usuario = null;
        try { usuario = JSON.parse(body).usuario || null; } catch (e) { /* sin usuario */ }
        await env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify")).fetch("https://do/orders/cancelar-linea", {
          method: "POST",
          body: JSON.stringify({ orderId: c.orderId, unidades: c.cantidad, texto: `${c.cantidad}x ${c.stockModel} ${c.talla}`, desde: "proveedor", usuario }),
        });
      }
      return Response.json(data, { status: res.status });
    }
    if (url.pathname === "/api/pedidos/cancelar-linea" && request.method === "POST") {
      const { orderId, itemIndex, unidades, texto, usuario } = await request.json();
      const ordersStub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
      const orders = await (await ordersStub.fetch("https://do/orders")).json();
      const order = orders.find((o) => String(o.id) === String(orderId));
      const item = order && (order.items || [])[itemIndex];
      if (!item) return Response.json({ ok: false, error: "Artículo no encontrado en el pedido." }, { status: 404 });
      const inv = await (await inventoryStub(env).fetch("https://do/backorders/cancelar-por-item", {
        method: "POST", body: JSON.stringify({ orderId: order.id, item, unidades }),
      })).json();
      const r = await (await ordersStub.fetch("https://do/orders/cancelar-linea", {
        method: "POST", body: JSON.stringify({ orderId: order.id, itemIndex, unidades, texto, desde: "pedido", usuario }),
      })).json();
      return Response.json({ ok: true, pendientesCancelados: (inv.cancelados || []).length, pedidoCancelado: r.cancelado });
    }

    const grupoEnvioMatch = url.pathname.match(/^\/api\/pedidos\/shopify\/grupo-envio\/(vincular|desvincular)$/);
    if (grupoEnvioMatch && request.method === "POST") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/orders/grupo-envio/" + grupoEnvioMatch[1], { method: "POST", body: await request.text() });
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
    }

    const adminPedidosMatch = url.pathname.match(/^\/api\/pedidos\/shopify\/admin\/(marcar-sin-pagar|tramitar-como-nuevo|tramitar-pagado-manual)$/);
    if (adminPedidosMatch && request.method === "POST") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/orders/admin/" + adminPedidosMatch[1], { method: "POST", body: await request.text() });
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/pedidos/shopify/force-process" && request.method === "POST") {
      const body = await request.text();
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/orders/force-process", { method: "POST", body });
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/pedidos/shopify/marcar-gestionado-externo" && request.method === "POST") {
      const body = await request.text();
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/orders/marcar-gestionado-externo", { method: "POST", body });
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/pedidos/shopify/seur-dividir" && request.method === "POST") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/orders/seur-dividir", { method: "POST", body: await request.text() });
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/pedidos/shopify/clear-pending" && request.method === "POST") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/orders/clear-pending", { method: "POST" });
      return new Response(await res.text(), { headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/furniture/tracking-import" && request.method === "POST") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/orders/tracking-import", { method: "POST", body: await request.text() });
      const data = await res.json();
      const shopify = await procesarFulfillmentsShopify(env, data.paraShopify);
      if (shopify.activo) await marcarErroresShopifyFurniture(env, data.paraShopify, shopify.errores);
      delete data.paraShopify;
      return Response.json({ ...data, shopify });
    }

    // Reintenta a mano el envío a Shopify del último albarán de Furniture
    // de un pedido y devuelve el error real de Shopify si lo hay (Jennifer,
    // 2026-09-29). { numero }
    if (url.pathname === "/api/pedidos/shopify/admin/reintentar-furniture" && request.method === "POST") {
      const { numero } = await request.json();
      const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
      const orders = await stub.fetch("https://do/orders").then((r) => r.json());
      const order = orders.find((o) => o.orderNumber === Number(numero));
      const t = order && [...(order.furnitureTracking || [])].reverse().find((x) => x.seguimiento);
      if (!t) return Response.json({ ok: false, reason: "sin_albaran_con_seguimiento" }, { status: 404 });
      const c = {
        orderId: order.id, orderNumber: order.orderNumber, trackingNumber: t.albaran, trackingUrl: t.seguimiento, company: "FURNITURE",
        primerEnvio: !order.shopifyFulfilled, fulfillmentId: order.shopifyFulfillmentId || null,
      };
      const resultado = await shopifyFulfillOrder(env, c);
      if (resultado.ok && c.primerEnvio) {
        await stub.fetch("https://do/orders/shopify-fulfilled", { method: "POST", body: JSON.stringify({ id: order.id, fulfillmentId: resultado.fulfillmentId }) });
      }
      await marcarErroresShopifyFurniture(env, [c], resultado.ok ? [] : [{ orderNumber: c.orderNumber, albaran: c.trackingNumber, reason: resultado.reason, detail: resultado.detail }]);
      return Response.json({ ...resultado, candidato: { ...c, trackingUrl: undefined } });
    }

    if (url.pathname === "/api/furniture/casos-revisar" && request.method === "GET") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/casos-revisar");
      return new Response(await res.text(), { headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/seur/casos-revisar" && request.method === "GET") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/casos-revisar-seur");
      return new Response(await res.text(), { headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/casos-revisar/nota" && request.method === "POST") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/orders/casos-revisar/nota", { method: "POST", body: await request.text() });
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/seur/tracking-import" && request.method === "POST") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/orders/tracking-import-seur", { method: "POST", body: await request.text() });
      const data = await res.json();
      const shopify = await procesarFulfillmentsShopify(env, data.paraShopify);
      delete data.paraShopify;
      return Response.json({ ...data, shopify });
    }

    if (url.pathname === "/api/avisos/cancelados" && request.method === "GET") {
      return Response.json(await getAvisosCancelados(env));
    }

    const avisoResolverMatch = url.pathname.match(/^\/api\/avisos\/cancelados\/([^/]+)\/resolver$/);
    if (avisoResolverMatch && request.method === "POST") {
      return proxyInventory(env, `/backorders/${avisoResolverMatch[1]}/cancelar`, request);
    }

    if (url.pathname === "/api/pedidos/shopify/unprocess" && request.method === "POST") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/orders/unprocess", { method: "POST", body: await request.text() });
      return new Response(await res.text(), { headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/pedidos/shopify/admin/delete" && request.method === "POST") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/orders/admin/delete", { method: "POST", body: await request.text() });
      return new Response(await res.text(), { headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/pedidos/shopify/admin/fix-item-product" && request.method === "POST") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/orders/admin/fix-item-product", { method: "POST", body: await request.text() });
      return new Response(await res.text(), { headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/pedidos/shopify/admin/backfill-processed-cutoff" && request.method === "POST") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/orders/admin/backfill-processed-cutoff", { method: "POST" });
      return new Response(await res.text(), { headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/cargas" && request.method === "GET") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/cargas");
      return new Response(await res.text(), { headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/cargas/add" && request.method === "POST") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/cargas/add", { method: "POST", body: await request.text() });
      return new Response(await res.text(), { headers: { "content-type": "application/json" } });
    }

    // Herramientas de mantenimiento (Jennifer, 2026-09-29, caso BEZEN12157),
    // no expuestas en la UI.
    if (url.pathname === "/api/cargas/set-fecha" && request.method === "POST") {
      const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
      const res = await stub.fetch("https://do/cargas/set-fecha", { method: "POST", body: await request.text() });
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
    }
    if (url.pathname === "/api/inventario/admin/cargar-furniture-manual" && request.method === "POST") {
      return proxyInventory(env, "/admin/cargar-furniture-manual", request);
    }
    if (url.pathname === "/api/pedidos/admin/pasar-a-furniture" && request.method === "POST") {
      const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
      const res = await stub.fetch("https://do/orders/pasar-a-furniture", { method: "POST", body: await request.text() });
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/cargas/seur/add" && request.method === "POST") {
      const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
      const res = await stub.fetch("https://do/cargas/seur/add", { method: "POST", body: await request.text() });
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/cargas/remove" && request.method === "POST") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const res = await stub.fetch("https://do/cargas/remove", { method: "POST", body: await request.text() });
      return new Response(await res.text(), { headers: { "content-type": "application/json" } });
    }

    // Carga independiente de una reposición (Jennifer, 2026-09-21) — ver
    // /admin/reposicion/carga-add|remove en inventory-store.js.
    const envioAparteMatch = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/envio-aparte$/);
    if (envioAparteMatch && request.method === "POST") {
      return proxyInventory(env, `/backorders/${envioAparteMatch[1]}/envio-aparte`, request);
    }

    if (url.pathname === "/api/inventario/reposicion/carga-add" && request.method === "POST") {
      return proxyInventory(env, "/admin/reposicion/carga-add", request);
    }

    if (url.pathname === "/api/inventario/reposicion/carga-remove" && request.method === "POST") {
      return proxyInventory(env, "/admin/reposicion/carga-remove", request);
    }

    if (url.pathname === "/api/cargas/close" && request.method === "POST") {
      const id = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(id);
      const cuerpo = await request.text();
      // Al cerrar una carga de SEUR se guarda la foto de sus líneas para
      // "Envíos SEUR" (Jennifer, 2026-10-01). Si falla, la carga se cierra
      // igual y la lista la rehace con los artículos servidos.
      try {
        const { cargaId } = JSON.parse(cuerpo);
        const ex = await buildSeurExport(env, cargaId);
        if (!ex.error) {
          await stub.fetch("https://do/cargas/seur/envios-guardar", { method: "POST", body: JSON.stringify({ cargaId, envios: enviosDeExportSeur(ex) }) });
        }
      } catch (e) { /* no bloquea el cierre */ }
      const res = await stub.fetch("https://do/cargas/close", { method: "POST", body: cuerpo });
      return new Response(await res.text(), { headers: { "content-type": "application/json" } });
    }

    // "Envíos SEUR" (Jennifer, 2026-10-01): sustituye a "Casos a revisar".
    // Todas las líneas de todas las cargas de SEUR cerradas, con su estado
    // en SEUR, notas y "Reclamado a SEUR".
    if (url.pathname === "/api/seur/envios" && request.method === "GET") {
      const datos = await cargarDatosSeurExport(env);
      const ordersById = new Map(datos.orders.map((o) => [o.id, o]));
      const lista = [];
      const usados = new Set(); // entradas de seguimiento ya ligadas a una línea
      const cerradas = datos.cargas.filter((c) => c.tipo === "seur" && c.estado === "cerrada");
      for (const c of cerradas) {
        let envios = c.envios;
        if (!envios) {
          const ex = await buildSeurExport(env, c.id, { datos, incluirServidos: true });
          envios = ex.error ? [] : enviosDeExportSeur(ex);
        }
        const porPedido = {};
        for (const e of envios) porPedido[e.orderId] = (porPedido[e.orderId] || 0) + 1;
        for (const e of envios) {
          const o = ordersById.get(e.orderId);
          const t = estadoSeurDeLinea(o, e.ref, porPedido[e.orderId]);
          if (t) usados.add(t);
          const info = (o && o.enviosSeurInfo && o.enviosSeurInfo[e.ref]) || {};
          lista.push({
            ...e, cargaId: c.id, fechaCarga: c.fecha, diaCarga: c.dia, fechaCierre: c.fechaCierre || null,
            estadoSeur: t ? t.estado || "" : "", fechaSituacion: t ? t.fechaSituacion || "" : "", seguimiento: t ? t.seguimiento || "" : "",
            nota: info.nota || "", reclamado: !!info.reclamado, fechaReclamado: info.fechaReclamado || null,
            archivado: !!info.archivado, fechaArchivado: info.fechaArchivado || null,
            numeroExpedicion: t ? t.numeroExpedicion || "" : "",
            correo: info.correo || null, correoNoLeidos: noLeidosCorreo(info.correo),
          });
        }
      }
      // Solo líneas de cargas cerradas (Jennifer, 2026-10-01: lo que no se
      // ha metido en ninguna carga no ha salido y no hay nada que revisar).
      // Excepción (Jennifer, 2026-10-02): los envíos de antes de las cargas
      // con conversación con SEUR sí salen, para poder seguirla desde aquí.
      const yaEnLista = new Set(lista.map((e) => String(e.orderId) + "|" + e.ref));
      for (const o of datos.orders) {
        for (const [ref, info] of Object.entries(o.enviosSeurInfo || {})) {
          if (!info.correo || !(info.correo.mensajes || []).length || yaEnLista.has(String(o.id) + "|" + ref)) continue;
          const t = estadoSeurDeLinea(o, ref, 1);
          const m = t ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(t.fechaCreacion || "").trim()) : null;
          lista.push({
            orderId: o.id, ref, nombre: o.name || "", pais: o.countryCode || "", observaciones: "",
            cargaId: null, fechaCarga: m ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") : "", diaCarga: "", sinCarga: true,
            estadoSeur: t ? t.estado || "" : "", fechaSituacion: t ? t.fechaSituacion || "" : "", seguimiento: t ? t.seguimiento || "" : "",
            nota: info.nota || "", reclamado: !!info.reclamado, fechaReclamado: info.fechaReclamado || null,
            archivado: !!info.archivado, fechaArchivado: info.fechaArchivado || null,
            numeroExpedicion: t ? t.numeroExpedicion || "" : "",
            correo: info.correo, correoNoLeidos: noLeidosCorreo(info.correo),
          });
        }
      }
      // Aviso (Jennifer, 2026-10-01): si 24 h después de cerrar la carga el
      // envío sigue "El envío ha sido registrado." (SEUR no lo ha recogido),
      // hay que reclamarlo. Sin fecha de cierre (fuera de carga) cuenta
      // desde el día en que SEUR registró el envío.
      const ahora = Date.now();
      for (const e of lista) {
        let desde = e.fechaCierre ? Date.parse(e.fechaCierre) : NaN;
        const registrado = /^el envío ha sido registrado\.?$/i.test((e.estadoSeur || "").trim());
        e.horasDesdeCierre = isNaN(desde) ? null : Math.floor((ahora - desde) / 3600000);
        e.aviso24h = registrado && e.horasDesdeCierre !== null && e.horasDesdeCierre >= 24;
      }
      lista.sort((a, b) => (b.fechaCarga || "").localeCompare(a.fechaCarga || "") || a.ref.localeCompare(b.ref));
      return Response.json(lista);
    }

    // Escribir a SEUR por un envío (Jennifer, 2026-10-02). El asunto lleva
    // la referencia y el nº de expedición para que SEUR lo localice.
    if (url.pathname === "/api/seur/envios/escribir" && request.method === "POST") {
      const { orderId, ref, texto } = await request.json();
      if (!String(texto || "").trim()) return Response.json({ ok: false, error: "Escribe el mensaje." }, { status: 400 });
      const orders = await ordersStubSeur(env).fetch("https://do/orders").then((r) => r.json());
      const o = orders.find((x) => String(x.id) === String(orderId));
      if (!o) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      const t = estadoSeurDeLinea(o, ref, 1);
      const exp = t && t.numeroExpedicion ? String(t.numeroExpedicion) : "";
      const destino = destinoSeurDePedido(o);
      const asunto = `Consulta envío ${ref}${exp ? " · Expedición " + exp : ""} — Global Happy Deal`;
      const cuerpo = [
        `Referencia: ${ref}`,
        exp ? `Nº de expedición: ${exp}` : null,
        `Destinatario: ${o.name || ""} — ${o.postalCode || ""} ${o.city || ""}`.trim(),
        "",
        String(texto).trim(),
        "",
        "Un saludo,",
        "Global Happy Deal",
      ].filter((x) => x !== null).join("\n");
      const r = await llamarScriptSeur(env, "seur-enviar", { destino, asunto, texto: cuerpo });
      if (!r.ok) return Response.json({ ok: false, error: r.error || "No se pudo enviar." }, { status: 502 });
      const ahora = new Date().toISOString();
      const info = (o.enviosSeurInfo && o.enviosSeurInfo[ref]) || {};
      const previo = info.correo || {};
      const correo = {
        threadIds: [...new Set([...(previo.threadIds || []), r.threadId])],
        destino, asunto,
        mensajes: [...(previo.mensajes || []), { id: "local-" + Date.now(), threadId: r.threadId, fecha: ahora, de: "Happy Deal", asunto, texto: cuerpo, deSeur: false }],
        vistoHasta: ahora,
      };
      await ordersStubSeur(env).fetch("https://do/orders/envio-seur-info", { method: "POST", body: JSON.stringify({ orderId: o.id, ref, correo, ...(info.reclamado ? {} : { reclamado: true }) }) });
      return Response.json({ ok: true, correo });
    }

    // Contestar en la misma conversación.
    if (url.pathname === "/api/seur/envios/responder" && request.method === "POST") {
      const { orderId, ref, texto } = await request.json();
      if (!String(texto || "").trim()) return Response.json({ ok: false, error: "Escribe el mensaje." }, { status: 400 });
      const orders = await ordersStubSeur(env).fetch("https://do/orders").then((r) => r.json());
      const o = orders.find((x) => String(x.id) === String(orderId));
      const correo = o && o.enviosSeurInfo && o.enviosSeurInfo[ref] && o.enviosSeurInfo[ref].correo;
      if (!correo || !(correo.threadIds || []).length) return Response.json({ ok: false, error: "Este envío no tiene conversación con SEUR." }, { status: 400 });
      // En el hilo del último mensaje de SEUR (o en el primero si aún no han escrito).
      const ultimoSeur = [...(correo.mensajes || [])].reverse().find((m) => m.deSeur && m.threadId);
      const threadId = ultimoSeur ? ultimoSeur.threadId : correo.threadIds[0];
      const r = await llamarScriptSeur(env, "seur-responder", { threadId, texto: String(texto).trim(), destino: correo.destino || destinoSeurDePedido(o) });
      if (!r.ok) return Response.json({ ok: false, error: r.error || "No se pudo enviar." }, { status: 502 });
      const ahora = new Date().toISOString();
      await ordersStubSeur(env).fetch("https://do/orders/envio-seur-info", { method: "POST", body: JSON.stringify({ orderId: o.id, ref, correo: {
        mensajes: [...(correo.mensajes || []), { id: "local-" + Date.now(), threadId, fecha: ahora, de: "Happy Deal", asunto: correo.asunto || "", texto: String(texto).trim(), deSeur: false }],
        vistoHasta: ahora,
      } }) });
      return Response.json({ ok: true });
    }

    if (url.pathname === "/api/seur/correos/actualizar" && request.method === "POST") {
      return Response.json(await actualizarCorreosSeur(env));
    }

    // Conversación leída: deja de contar como respuesta nueva.
    if (url.pathname === "/api/seur/envios/visto" && request.method === "POST") {
      const { orderId, ref } = await request.json();
      const res = await ordersStubSeur(env).fetch("https://do/orders/envio-seur-info", { method: "POST", body: JSON.stringify({ orderId, ref, correo: { vistoHasta: new Date().toISOString() } }) });
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/seur/envios/info" && request.method === "POST") {
      const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
      const res = await stub.fetch("https://do/orders/envio-seur-info", { method: "POST", body: await request.text() });
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
    }

    // Resumen de la carga de SEUR en una etiqueta 15×10 enviada al email
    // del almacén (Jennifer, 2026-10-01: lo imprimen desde ahí directamente).
    // ?ver=1 descarga el mismo PDF sin enviar nada, para revisarlo.
    if (url.pathname === "/api/cargas/seur/almacen-email" && (request.method === "POST" || request.method === "GET")) {
      const cargaId = url.searchParams.get("cargaId") || "";
      const result = await buildListadoAlmacenSeur(env, cargaId);
      if (result.error) return Response.json({ ok: false, error: result.error }, { status: 400 });
      if (!result.filas.length) return Response.json({ ok: false, error: "Esta carga no tiene envíos." }, { status: 400 });
      const c = result.carga;
      const fechaCorta = c.fecha.slice(8, 10) + "/" + c.fecha.slice(5, 7);
      const bultos = result.filas.reduce((n, f) => n + (f.cantidad || 1), 0);
      // Solo modelo y medida, sumando las unidades iguales.
      const lineas = [];
      for (const f of result.filas) {
        const producto = String(f.producto || "").replace(/^COLCHÓN\s+/i, "") + (/^YA APARTADO/.test(f.origen) ? " (YA APARTADO)" : "");
        const l = lineas.find((x) => x.producto === producto);
        if (l) l.cantidad += f.cantidad || 1;
        else lineas.push({ producto, cantidad: f.cantidad || 1 });
      }
      lineas.sort((x, y) => x.producto.localeCompare(y.producto, "es", { numeric: true }));
      const pdf = resumenSeurPdf({ titulo: `SEUR  ${c.dia} ${fechaCorta}  ·  ${bultos} ${bultos === 1 ? "BULTO" : "BULTOS"}`, lineas });
      const nombrePdf = `Carga SEUR ${c.fecha}.pdf`;
      if (request.method === "GET" && url.searchParams.get("ver") === "1") {
        return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${nombrePdf}"` } });
      }
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      const texto = [
        `Carga de SEUR del ${c.dia.toLowerCase()} ${fechaCorta}: ${bultos} ${bultos === 1 ? "bulto" : "bultos"}.`,
        "",
        ...lineas.map((l) => `${l.cantidad} x ${l.producto}`),
        "",
        "Se adjunta el resumen en etiqueta 15×10 para imprimir.",
      ].join("\n");
      const r = await enviarEmailAlmacen(env, { asunto: `Carga SEUR ${c.dia} ${fechaCorta}`, texto, pdf, nombrePdf });
      return Response.json(r, { status: r.ok ? 200 : 502 });
    }

    if (url.pathname === "/api/cargas/seur/almacen" && request.method === "GET") {
      const result = await buildListadoAlmacenSeur(env, url.searchParams.get("cargaId") || "");
      if (result.error) return new Response(result.error, { status: 400 });
      return Response.json(result);
    }

    if (url.pathname === "/api/cargas/almacen" && request.method === "GET") {
      const result = await buildListadoAlmacen(env, url.searchParams.get("cargaId") || null);
      if (result.error) return new Response(result.error, { status: 400 });
      return new Response(JSON.stringify(result), { headers: { "content-type": "application/json; charset=utf-8" } });
    }

    if (url.pathname === "/api/cargas/export" && request.method === "GET") {
      const cargaId = url.searchParams.get("cargaId") || null;
      const result = await buildFurnitureExport(env, cargaId);
      if (result.error) return new Response(result.error, { status: 400 });
      const csv = buildFurnitureCsv(result.rows);
      const filename = `Furniture_${result.carga.fecha}.csv`;
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // Mover entre cargas de Furniture abiertas (Jennifer, 2026-09-30):
    // { orderIds } (pedido con su grupo) o { backorderId } (envío aparte /
    // reposición), y cargaId de destino.
    if (url.pathname === "/api/cargas/furniture/mover" && request.method === "POST") {
      const { orderIds, backorderId, cargaId } = await request.json();
      const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
      if (backorderId) {
        const cargas = await stub.fetch("https://do/cargas").then((r) => r.json());
        if (!cargas.some((c) => c.id === cargaId && (c.tipo || "furniture") === "furniture" && c.estado === "abierta")) {
          return Response.json({ ok: false, error: "Esa carga de Furniture no está abierta." }, { status: 400 });
        }
        const res = await inventoryStub(env).fetch("https://do/backorders/set-carga", { method: "POST", body: JSON.stringify({ id: backorderId, cargaId }) });
        return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
      }
      const res = await stub.fetch("https://do/cargas/furniture/mover", { method: "POST", body: JSON.stringify({ orderIds, cargaId }) });
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
    }

    // Mover un envío a otra carga de SEUR abierta (Jennifer, 2026-09-30).
    // { orderId } para un pedido metido entero, { backorderId } para un
    // colchón preparado desde Luso/New (o envío suelto); fecha AAAA-MM-DD.
    // Cualquier día laborable futuro (Jennifer: "el cliente solicita que se
    // mande mucho más adelante, por ejemplo en 15 días"): si la carga de ese
    // día aún no existe, se crea.
    if (url.pathname === "/api/cargas/seur/mover" && request.method === "POST") {
      const { orderId, backorderId, fecha } = await request.json();
      const error = errorFechaCargaSeur(fecha);
      if (error) return Response.json({ ok: false, error }, { status: 400 });
      const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
      const destino = await stub.fetch("https://do/cargas/seur/get-or-create", { method: "POST", body: JSON.stringify({ fecha }) }).then((r) => r.json());
      const res = backorderId
        ? await inventoryStub(env).fetch("https://do/backorders/set-carga", { method: "POST", body: JSON.stringify({ id: backorderId, cargaId: destino.id }) })
        : await stub.fetch("https://do/cargas/seur/mover-pedido", { method: "POST", body: JSON.stringify({ orderId, cargaId: destino.id }) });
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/cargas/seur/export" && request.method === "GET") {
      const cargaId = url.searchParams.get("cargaId") || null;
      if (!cargaId) return new Response("Falta cargaId", { status: 400 });
      const result = await buildSeurExport(env, cargaId);
      if (result.error) return new Response(result.error, { status: 400 });
      // ?formato=json: las filas para que el navegador monte el .xlsx
      // (Jennifer, 2026-10-01: el fichero de SEUR tiene que ser xlsx).
      if (url.searchParams.get("formato") === "json") {
        return Response.json({ cabeceras: SEUR_CSV_HEADERS, filas: result.rows, fecha: result.carga.fecha });
      }
      const csv = buildSeurCsv(result.rows);
      const filename = `SEUR_${result.carga.fecha}.csv`;
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
          "x-seur-avisos": String(result.avisos.length),
        },
      });
    }

    if (url.pathname === "/api/cargas/seur/export-avisos" && request.method === "GET") {
      const cargaId = url.searchParams.get("cargaId") || null;
      if (!cargaId) return new Response("Falta cargaId", { status: 400 });
      const result = await buildSeurExport(env, cargaId);
      if (result.error) return new Response(result.error, { status: 400 });
      return Response.json({ avisos: result.avisos, filas: result.rows.length });
    }

    if (url.pathname === "/api/inventario/pesos" && request.method === "GET") {
      return proxyInventory(env, "/pesos", request);
    }

    if (url.pathname === "/api/inventario/pesos" && request.method === "POST") {
      return proxyInventory(env, "/pesos/set", request);
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
    // Respuestas de SEUR por email (Jennifer, 2026-10-02): cada hora.
    ctx.waitUntil(actualizarCorreosSeur(env).catch(() => null));
  },
};
