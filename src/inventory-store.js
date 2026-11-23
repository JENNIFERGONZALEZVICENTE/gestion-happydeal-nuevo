import { calcularPrecioReforman, anadirColumnaReforman } from "./reforman.js";
import { CABECERAS_MIRAKL, CLIENTES_FICHERO_COMPLETO, filasDesdeCsvImport, toCsv, calcularPrecioOferta, STOCK_VIVO, esDescatalogado, skuDesdeNombreWorten } from "./ficheros-completos.js";
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

// Reparto de proveedores para "Pendientes" (2026-08-25, dictado por Jennifer):
// tapicería + almohadas + toppers siempre van a POLIVAL; los colchones se
// reparten entre POLIVAL/LUSO/NEW según el modelo. Esto es solo el valor por
// defecto al sincronizar catálogo — Jennifer puede corregirlo a mano por
// producto en Catálogo (igual que con el SKU), y esa corrección no se pisa
// en resyncs (ver proveedorManual en updateFlags).
const PROVEEDOR_FIXED_TYPES = {
  Almohada: "POLIVAL",
  Topper: "POLIVAL",
  Canapé: "POLIVAL",
  "Canapé fijo": "POLIVAL",
  Base: "POLIVAL",
  Cabecero: "POLIVAL",
};
const PROVEEDOR_LUSO_KEYWORDS = [
  "zen mandala", "zen nirvana", "spring zen", "generacion z", "paris",
  "origin zen", "supreme zen", "zen natural", "natural zen",
];
const PROVEEDOR_NEW_KEYWORDS = [
  "murano", "4d", "ergo-relax", "ergo relax", "louvre", "fitness",
  "toscana deluxe", "bellagio deluxe", "latex gel", "pharma-therapy soja",
  "pharmatherapy soja", "bambu deluxe", "pharma slim",
];
const PROVEEDOR_POLIVAL_COLCHON_KEYWORDS = ["latex natura", "siberian zen"];

// Fichero de envíos a SEUR (Jennifer, 2026-09-08): tabla de pesos por SKU
// (kilos por unidad), generada a partir de 9097 envíos reales de 2026 (peso
// de la línea del histórico ÷ bultos de esa línea = peso por unidad; se
// descartaron líneas con varios modelos juntos con "+" y filas con peso 0 o
// no numérico). El SKU es el mismo formato que ya usa Catálogo/Proveedores
// (skuPrefix + talla pegados, ej. "COLZNIR150X190"). Jennifer puede corregir
// cualquiera a mano — ver PESOS_SEUR_OVERRIDES en almacenamiento, que
// siempre gana sobre este valor por defecto.
const PESOS_SEUR_DEFAULT = {
  "1 PATA DE CANMONBLA135X200": 1,
  "ALMANT135": 2,
  "ALMANT150": 2,
  "ALMANT67,5 (2UN)": 2,
  "ALMANT70": 2,
  "ALMANT75": 2,
  "ALMANT80": 1,
  "ALMANT90": 1,
  "ALMANTI135": 2,
  "ALMANTI150": 2,
  "ALMANTI67,5 (2UN)": 2,
  "ALMANTI70 (2UN)": 2,
  "ALMANTI75": 2,
  "ALMANTI75 (2UN)": 2,
  "ALMANTI90 (2UN)": 2,
  "ALMLATEX135": 2,
  "ALMLATEX90": 2,
  "ALMNOR105": 1,
  "ALMNOR135": 2,
  "ALMNOR150": 2,
  "ALMNOR67,5": 2,
  "ALMNOR67,5 (2UN)": 2,
  "ALMNOR675": 2,
  "ALMNOR70": 1,
  "ALMNOR75": 2,
  "ALMNOR75 (2UN)": 2,
  "ALMNOR80": 2,
  "ALMNOR90": 2,
  "ALMNORD 90": 2,
  "ALMNORD80": 2,
  "ALMSEA75": 1,
  "ALMSEAFOAM 75": 1,
  "ALMSEAFOAM67,5": 1,
  "ALMSEAFOAM75": 1,
  "ALMZENR120": 2,
  "ALMZENR150": 2,
  "ALMZENR70": 2,
  "ALMZENR75": 2,
  "ALMZENR80": 1,
  "ALMZENR90": 1,
  "COLBAMDL105X190": 10,
  "COLBAMDL135X180": 15,
  "COLBAMDL135X190": 15,
  "COLBAMDL135X200": 15,
  "COLBAMDL140X190": 15,
  "COLBAMDL140X200": 15,
  "COLBAMDL150X190": 17,
  "COLBAMDL150X200": 17,
  "COLBAMDL160X190": 17,
  "COLBAMDL160X200": 17,
  "COLBAMDL180X200": 20,
  "COLBAMDL80X180": 8,
  "COLBAMDL80X190": 8,
  "COLBAMDL80X200": 8,
  "COLBAMDL90X180": 8,
  "COLBAMDL90X190": 8,
  "COLBAMDL90X200": 8,
  "COLBEL105X180": 10,
  "COLBEL105X190": 10,
  "COLBEL120X180": 12,
  "COLBEL120X190": 12,
  "COLBEL120X200": 12,
  "COLBEL135X180": 15,
  "COLBEL135X190": 15,
  "COLBEL135X200": 15,
  "COLBEL140X190": 15,
  "COLBEL140X200": 15,
  "COLBEL150X190": 17,
  "COLBEL150X200": 17,
  "COLBEL160X200": 17,
  "COLBEL180X200": 20,
  "COLBEL80X180": 8,
  "COLBEL80X190": 8,
  "COLBEL80X200": 8,
  "COLBEL90X180": 8,
  "COLBEL90X190": 8,
  "COLBEL90X200": 8,
  "COLBELD135X190": 15,
  "COLBELD150X190": 17,
  "COLDELUXE4D105X190": 10,
  "COLDELUXE4D105X200": 10,
  "COLDELUXE4D120X180": 12,
  "COLDELUXE4D135X180": 15,
  "COLDELUXE4D135X190": 15,
  "COLDELUXE4D135X200": 15,
  "COLDELUXE4D140X190": 15,
  "COLDELUXE4D140X200": 15,
  "COLDELUXE4D150X190": 17,
  "COLDELUXE4D150X200": 17,
  "COLDELUXE4D160X190": 17,
  "COLDELUXE4D160X200": 17,
  "COLDELUXE4D180X190": 20,
  "COLDELUXE4D180X200": 20,
  "COLDELUXE4D80X180": 8,
  "COLDELUXE4D80X190": 8,
  "COLDELUXE4D80X200": 8,
  "COLDELUXE4D90X180": 8,
  "COLDELUXE4D90X190": 8,
  "COLDELUXE4D90X200": 8,
  "COLFITSPORT105X180": 10,
  "COLFITSPORT105X190": 10,
  "COLFITSPORT105X200": 10,
  "COLFITSPORT135X180": 15,
  "COLFITSPORT135X190": 15,
  "COLFITSPORT140X190": 15,
  "COLFITSPORT140X200": 15,
  "COLFITSPORT150X190": 17,
  "COLFITSPORT150X200": 17,
  "COLFITSPORT160X190": 17,
  "COLFITSPORT160X200": 17,
  "COLFITSPORT180X190": 20,
  "COLFITSPORT180X200": 20,
  "COLFITSPORT80X180": 8,
  "COLFITSPORT80X190": 8,
  "COLFITSPORT80X200": 8,
  "COLFITSPORT90X180": 4,
  "COLFITSPORT90X190": 8,
  "COLFITSPORT90X200": 8,
  "COLGEZ105X180": 17,
  "COLGEZ105X190": 17,
  "COLGEZ105X200": 17,
  "COLGEZ120X190": 20,
  "COLGEZ120X200": 20,
  "COLGEZ135X180": 27,
  "COLGEZ135X190": 25,
  "COLGEZ135X200": 27,
  "COLGEZ140X190": 25,
  "COLGEZ140X200": 30,
  "COLGEZ150X180": 30,
  "COLGEZ150X190": 37,
  "COLGEZ150X200": 30,
  "COLGEZ160X200": 35,
  "COLGEZ180X190": 40,
  "COLGEZ180X200": 40,
  "COLGEZ80X180": 15,
  "COLGEZ80X190": 15,
  "COLGEZ80X200": 15,
  "COLGEZ90X180": 15,
  "COLGEZ90X190": 15,
  "COLGEZ90X200": 15,
  "COLGRA120X190": 12,
  "COLLAT105X190": 10,
  "COLLAT105X200": 10,
  "COLLAT120X190": 12,
  "COLLAT120X200": 12,
  "COLLAT135X180": 15,
  "COLLAT135X190": 15,
  "COLLAT135X200": 15,
  "COLLAT140X180": 15,
  "COLLAT140X190": 15,
  "COLLAT140X200": 15,
  "COLLAT150X180": 17,
  "COLLAT150X190": 17,
  "COLLAT150X200": 17,
  "COLLAT160X200": 17,
  "COLLAT180X200": 20,
  "COLLAT80X180": 8,
  "COLLAT80X190": 8,
  "COLLAT80X200": 8,
  "COLLAT90X180": 8,
  "COLLAT90X190": 8,
  "COLLAT90X200": 8,
  "COLLOU105X180": 8,
  "COLLOU105X190": 10,
  "COLLOU105X200": 10,
  "COLLOU120X180": 12,
  "COLLOU135X180": 15,
  "COLLOU135X190": 15,
  "COLLOU135X200": 15,
  "COLLOU140X190": 15,
  "COLLOU140X200": 15,
  "COLLOU150X190": 17,
  "COLLOU150X200": 17,
  "COLLOU160X190": 17,
  "COLLOU160X200": 17,
  "COLLOU180X190": 20,
  "COLLOU180X200": 20,
  "COLLOU80X200": 8,
  "COLLOU90X190": 8,
  "COLLOU90X200": 8,
  "COLMUR105X180": 10,
  "COLMUR105X190": 10,
  "COLMUR120X200": 12,
  "COLMUR135X190": 15,
  "COLMUR135X200": 15,
  "COLMUR140X190": 15,
  "COLMUR150X190": 17,
  "COLMUR160X190": 18,
  "COLMUR160X200": 17,
  "COLMUR80X190": 8,
  "COLMUR80X200": 8,
  "COLMUR90X180": 8,
  "COLMUR90X190": 8,
  "COLMUR90X200": 8,
  "COLMURANO180X200": 20,
  "COLMURN105X190": 10,
  "COLMURN135X180": 25,
  "COLNIR120X200": 22,
  "COLNIR140X190": 29,
  "COLNIR150X190": 32,
  "COLORIGIN105X190": 17,
  "COLORIGIN135X190": 27,
  "COLORIGIN140X200": 30,
  "COLORIGIN150X190": 27,
  "COLORIGIN150X200": 40,
  "COLORIGIN180X200": 50,
  "COLORIGIN80X180": 17,
  "COLORIGIN90X190": 17,
  "COLORIGIN90X200": 17,
  "COLPAR120X190": 20,
  "COLPAR90X200": 15,
  "COLPARIS105X180": 17,
  "COLPARIS105X190": 17,
  "COLPARIS105X200": 17,
  "COLPARIS120X180": 20,
  "COLPARIS120X190": 20,
  "COLPARIS120X200": 20,
  "COLPARIS135X180": 25,
  "COLPARIS135X190": 25,
  "COLPARIS135X200": 25,
  "COLPARIS140X180": 27,
  "COLPARIS140X190": 27,
  "COLPARIS140X200": 25,
  "COLPARIS150X180": 35,
  "COLPARIS150X190": 30,
  "COLPARIS150X200": 30,
  "COLPARIS160X190": 35,
  "COLPARIS160X200": 35,
  "COLPARIS180X180": 40,
  "COLPARIS180X190": 40,
  "COLPARIS180X200": 40,
  "COLPARIS200X200": 40,
  "COLPARIS80X190": 15,
  "COLPARIS80X200": 15,
  "COLPARIS90X180": 15,
  "COLPARIS90X190": 15,
  "COLPARIS90X200": 15,
  "COLPHARM135X190": 15,
  "COLSUPREME105X190": 18,
  "COLSUPREME105X200": 20,
  "COLSUPREME135X190": 27,
  "COLSUPREME140X190": 30,
  "COLSUPREME150X190": 35,
  "COLSUPREME150X200": 35,
  "COLSUPREMEZEN160X200": 47,
  "COLTOSD105X180": 10,
  "COLTOSD105X190": 10,
  "COLTOSD105X200": 10,
  "COLTOSD120X180": 12,
  "COLTOSD120X190": 12,
  "COLTOSD120X200": 12,
  "COLTOSD135X180": 15,
  "COLTOSD135X190": 15,
  "COLTOSD135X200": 15,
  "COLTOSD140X190": 15,
  "COLTOSD140X200": 15,
  "COLTOSD150X180": 17,
  "COLTOSD150X190": 17,
  "COLTOSD150X200": 17,
  "COLTOSD160X190": 17,
  "COLTOSD160X200": 17,
  "COLTOSD180X190": 20,
  "COLTOSD180X200": 20,
  "COLTOSD80X180": 8,
  "COLTOSD80X190": 8,
  "COLTOSD80X200": 8,
  "COLTOSD90X180": 8,
  "COLTOSD90X190": 8,
  "COLTOSD90X200": 8,
  "COLZMAN105X190": 19,
  "COLZMAN105X200": 17,
  "COLZMAN120X190": 20,
  "COLZMAN135X180": 27,
  "COLZMAN135X190": 27,
  "COLZMAN135X200": 27,
  "COLZMAN140X190": 25,
  "COLZMAN140X200": 29,
  "COLZMAN150X190": 35,
  "COLZMAN150X200": 32,
  "COLZMAN160X190": 40,
  "COLZMAN160X200": 37,
  "COLZMAN180X190": 40,
  "COLZMAN180X200": 40,
  "COLZMAN200X200": 45,
  "COLZMAN80X190": 15,
  "COLZMAN90X180": 15,
  "COLZMAN90X190": 17,
  "COLZMAN90X200": 17,
  "COLZNAT105X180": 20,
  "COLZNAT105X190": 18,
  "COLZNAT105X200": 17,
  "COLZNAT120X190": 22,
  "COLZNAT120X200": 22,
  "COLZNAT135X180": 27,
  "COLZNAT135X190": 27,
  "COLZNAT135X200": 30,
  "COLZNAT140X180": 29,
  "COLZNAT140X190": 29,
  "COLZNAT140X200": 29,
  "COLZNAT150X190": 37,
  "COLZNAT150X200": 32,
  "COLZNAT160X190": 37,
  "COLZNAT160X200": 37,
  "COLZNAT180X190": 50,
  "COLZNAT180X200": 50,
  "COLZNAT200X200": 50,
  "COLZNAT80X190": 17,
  "COLZNAT90X190": 17,
  "COLZNAT90X200": 20,
  "COLZNIR105X180": 18,
  "COLZNIR105X190": 17,
  "COLZNIR105X200": 17,
  "COLZNIR120X180": 25,
  "COLZNIR120X190": 20,
  "COLZNIR120X200": 22,
  "COLZNIR135X180": 27,
  "COLZNIR135X190": 27,
  "COLZNIR135X200": 27,
  "COLZNIR140X190": 30,
  "COLZNIR140X200": 30,
  "COLZNIR150X190": 40,
  "COLZNIR150X200": 32,
  "COLZNIR160X190": 40,
  "COLZNIR160X200": 37,
  "COLZNIR180X190": 50,
  "COLZNIR180X200": 40,
  "COLZNIR200X200": 45,
  "COLZNIR80X190": 17,
  "COLZNIR80X200": 17,
  "COLZNIR90X190": 17,
  "COLZNIR90X200": 17,
  "COLZSENSEI105X190": 17,
  "COLZSENSEI120X200": 22,
  "COLZSENSEI135X190": 27,
  "COLZSENSEI150X190": 35,
  "COLZSENSEI150X200": 37,
  "COLZSENSEI160X190": 40,
  "COLZSENSEI160X200": 40,
  "COLZSENSEI180X190": 40,
  "COLZSPRING105X190": 17,
  "COLZSPRING135X180": 27,
  "COLZSPRING140X200": 40,
  "COLZSPRING150X190": 40,
  "COLZSPRING150X200": 35,
  "COLZSPRING160X200": 40,
  "COLZSPRING180X190": 42,
  "COLZSPRING180X200": 40,
  "COLZSPRING200X200": 50,
  "COLZSPRING90X180": 17,
  "COLZSPRING90X200": 18,
  "COLZSUPREME105X200": 15,
  "COLZSUPREME120X190": 22,
  "COLZSUPREME135X180": 27,
  "COLZSUPREME135X200": 27,
  "COLZSUPREME140X190": 29,
  "COLZSUPREME150X180": 32,
  "COLZSUPREME150X190": 32,
  "COLZSUPREME150X200": 37,
  "COLZSUPREME160X200": 40,
  "COLZSUPREME180X200": 42,
  "COLZSUPREME200X200": 60,
  "COLZSUPREME90X190": 17,
  "COLZSUPREME90X200": 3,
  "COLZSUPREMET200X200": 60,
  "ORBIT 80X180": 8,
  "PHARM105X190": 10,
  "PHARM105X200": 10,
  "PHARM120X180": 12,
  "PHARM120X200": 12,
  "PHARM135X180": 15,
  "PHARM135X190": 15,
  "PHARM135X200": 15,
  "PHARM140X190": 15,
  "PHARM140X200": 15,
  "PHARM150X190": 17,
  "PHARM150X200": 17,
  "PHARM160X190": 17,
  "PHARM160X200": 17,
  "PHARM180X190": 20,
  "PHARM180X200": 20,
  "PHARM80X180": 8,
  "PHARM80X200": 8,
  "PHARM90X180": 8,
  "PHARM90X190": 8,
  "PHARM90X200": 8,
  "PHARMA SLIM105X190": 10,
  "PHARMA SLIM80X180": 8,
  "PHARMA SLIM80X190": 8,
  "PHARMA SLIM80X200": 8,
  "PHARMA SLIM90X180": 8,
  "PHARMA SLIM90X190": 8,
  "PHARMA SLIM90X200": 8,
  "PROBRU135X190": 2,
  "PROBRU150X190": 5,
  "PROBRU150X200": 2,
  "PROBRU180X200": 2,
  "PROPOL105X190": 2,
  "PROPOL105X200": 2,
  "PROPOL150X200": 5,
  "PROPOL90X190": 2,
  "TOPPER VISCO135X190": 5,
  "TOPPER VISCO160X200": 5,
  "TOPPERV5_105X200": 5,
  "TOPPERV5_135X190": 5,
  "TOPPERV5_150X190": 5,
  "TOPPERV5_180X200": 5,
  "TOPPERV5_80X190": 5,
  "TOPPERV5_90X190": 5,
  "TOPPERV5_90X200": 2,
};

// Modelos con servicio NetExpress disponible en envíos internacionales
// (CODREMITENTE 48297) a partir de cierto ANCHO de la talla, inclusive
// (Jennifer, 2026-09-08) — por debajo del umbral, o si el modelo no está en
// ninguna de las dos listas, siempre International Classic. Coincide por
// palabra clave contra el título/stockModel del producto, igual que el
// reparto de proveedores (PROVEEDOR_LUSO_KEYWORDS etc.).
const NETEXPRESS_ANCHO_135_KEYWORDS = [
  "generacion z", "generacion zen", "paris", "zen mandala", "zen nirvana",
  "zen natural", "natural zen", "supreme zen", "origin zen",
];
const NETEXPRESS_ANCHO_180_KEYWORDS = [
  "pharmatherapy", "pharma-therapy", "bamboo deluxe", "bambu deluxe",
  "bellagio deluxe", "4d", "fitness", "latex gel", "ergo-relax",
  "ergo relax", "louvre", "murano", "toscana deluxe",
];

// Almohadas: si se compran 2 del mismo modelo, ¿cuentan como 1 bulto (van
// juntas en el mismo paquete) o 2 (Jennifer, 2026-09-08)? Nordic y Zen Relax
// se combinan; Sea Foam nunca. Cualquier otra almohada no listada aquí no
// tiene esta casuística (normalmente se compran de una en una).
const ALMOHADA_COMBINABLE_KEYWORDS = ["nordic", "zen relax"];
const ALMOHADA_NUNCA_COMBINA_KEYWORDS = ["sea foam", "seafoam"];

function matchesAnyKeyword(title, keywords) {
  const t = normalizeKey(title);
  return keywords.some((k) => t.includes(normalizeKey(k)));
}

// SKU tal y como debe aparecer en el fichero de SEUR (Observaciones/Producto,
// Jennifer, 2026-09-08): skuPrefix + talla pegados, ej. "COLZNIR150X190" —
// el mismo formato que ya usa el histórico de envíos, no el nombre completo
// del producto (no cabe bien en la etiqueta).
function seurSku(product, talla) {
  return `${(product.skuPrefix || "").toUpperCase()}${talla}`;
}

function pesoSeurPorUnidad(sku, overrides) {
  if (overrides && overrides[sku] != null) return overrides[sku];
  return PESOS_SEUR_DEFAULT[sku] != null ? PESOS_SEUR_DEFAULT[sku] : null;
}

// Ancho de una talla "150X190" -> 150. Devuelve null si no se puede leer.
function anchoDeTalla(talla) {
  const m = /^(\d{2,3})X\d{2,3}$/.exec(talla || "");
  return m ? Number(m[1]) : null;
}

function calificaNetExpress(productTitle, talla) {
  const ancho = anchoDeTalla(talla);
  if (ancho == null) return false;
  if (matchesAnyKeyword(productTitle, NETEXPRESS_ANCHO_135_KEYWORDS)) return ancho >= 135;
  if (matchesAnyKeyword(productTitle, NETEXPRESS_ANCHO_180_KEYWORDS)) return ancho >= 180;
  return false;
}

function normalizeKey(text) {
  return (text || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

// Descatalogados (noStock, ya no se venden) no entran en este reparto a
// propósito: Jennifer confirmó que no van a ninguna carpeta porque no se
// van a vender. Si algún día vuelve a haber pedidos de un modelo así, o
// aparece un modelo de colchón nuevo que no coincide con ninguna lista,
// defaultProveedor devuelve null y queda para asignar a mano en Catálogo.
function defaultProveedor(productType, stockModel) {
  if (PROVEEDOR_FIXED_TYPES[productType]) return PROVEEDOR_FIXED_TYPES[productType];
  if (productType !== "Colchones") return null;
  const name = normalizeKey(stockModel);
  if (PROVEEDOR_LUSO_KEYWORDS.some((k) => name.includes(normalizeKey(k)))) return "LUSO";
  if (PROVEEDOR_NEW_KEYWORDS.some((k) => name.includes(normalizeKey(k)))) return "NEW";
  if (PROVEEDOR_POLIVAL_COLCHON_KEYWORDS.some((k) => name.includes(normalizeKey(k)))) return "POLIVAL";
  return null;
}

// Referencia única para pedidos a Polival (Jennifer, 2026-08-25): un
// correlativo global de 3 cifras (001, 002, 003...) que nunca se reasigna,
// con un prefijo/sufijo distinto según el tipo de artículo:
//  - Topper/Almohada: solo el número.
//  - Canapés tapizados (con patas, gran capacidad, polipiel, con Ruedas,
//    apertura Lateral, de tela) y Cabeceros: número + "FUR".
//  - Canapé de madera "Zenit" (esquinas curvas): "M" + letra de color + número.
//  - Canapé de madera "Astra" (esquinas rectas): "ASTRA" + letra de color + número.
// "Base" y "Canapé fijo" no los mencionó — se dejan sin tipo (null) para
// que los clasifique ella en vez de adivinar, igual que un color que no
// esté en REFERENCIA_COLOR_LETTERS.
const REFERENCIA_COLOR_LETTERS = { roble: "R", wengue: "W", cerezo: "C", blanco: "B", nordico: "N" };

function defaultReferenciaTipo(productType, title) {
  const t = normalizeKey(title);
  if (t.includes("esquinas curvas")) return "zenit";
  if (t.includes("esquinas rectas")) return "astra";
  if (productType === "Almohada" || productType === "Topper") return "numero";
  if (productType === "Canapé" || productType === "Cabecero" || productType === "Base" || productType === "Canapé fijo") return "fur";
  return null;
}

async function nextReferenciaNumero(state) {
  const actual = (await state.storage.get("polivalReferenciaCounter")) || 0;
  const siguiente = actual + 1;
  await state.storage.put("polivalReferenciaCounter", siguiente);
  return String(siguiente).padStart(3, "0");
}

// Contador propio para reposiciones (Jennifer, 2026-09-21): "no tendrán las
// referencias que venimos trabajando" — nunca usan el correlativo/letra de
// Polival (MR/ASTRA/...), siempre "I-001", "I-002"... independiente del
// modelo o del proveedor.
async function nextReposicionReferencia(state) {
  const actual = (await state.storage.get("reposicionReferenciaCounter")) || 0;
  const siguiente = actual + 1;
  await state.storage.put("reposicionReferenciaCounter", siguiente);
  return "I-" + String(siguiente).padStart(3, "0");
}

// Contador propio para gestos comerciales (Jennifer, 2026-09-22): mismo
// motivo que reposicionReferenciaCounter — nunca usa el correlativo de
// Polival, siempre "GC-001", "GC-002"... para reconocerlo a simple vista en
// Proveedores/Furniture y no confundirlo con una venta real de almohada.
async function nextGestoComercialReferencia(state) {
  const actual = (await state.storage.get("gestoComercialReferenciaCounter")) || 0;
  const siguiente = actual + 1;
  await state.storage.put("gestoComercialReferenciaCounter", siguiente);
  return "GC-" + String(siguiente).padStart(3, "0");
}

// Corte con el sistema antiguo (Jennifer, 2026-09-25): TODA referencia
// nueva lleva "N" delante (contador reiniciado a 0, ver nextReferenciaNumero
// tras el reset), para distinguir a simple vista un pedido del "nuevo
// comienzo" de uno del sistema anterior. Además, el sufijo "FUR" ya NO
// depende del tipo de artículo (antes solo "fur"/"zenit"/"astra" lo
// llevaban, "numero" nunca) — depende de si ESE artículo concreto sale
// junto con Furniture o no, para poder distinguir a golpe de vista una
// almohada/colchón que va con la tapicería de Furniture (lleva FUR) de una
// que sale independiente por SEUR (sin FUR) — antes ambas se veían iguales.
// `vaFurniture` lo decide el llamador (ver applyStockUsage/processSale):
// true para tapicería siempre, para un colchón/almohada que viaja en un
// pedido con agencia FURNITURE, o para un modelo con exceptionFurniture
// (ej. Látex Natura, que nunca sale por SEUR).
// Devuelve { referencia, needsReview, reason } — needsReview cuando no se
// puede formar la referencia completa (tipo sin clasificar, o color sin
// letra asignada): se asigna igualmente el número (para no dejar huecos en
// el correlativo) pero sin prefijo/sufijo, y Jennifer la corrige a mano.
function tieneServicioSubidaRetirada(servicesText) {
  const t = normalizeKey(servicesText || "");
  return /subida|retirada/.test(t);
}

function buildReferencia(numero, referenciaTipo, color, vaFurniture) {
  const fur = vaFurniture ? "FUR" : "";
  if (referenciaTipo === "numero") return { referencia: "N" + numero + fur, needsReview: false };
  if (referenciaTipo === "fur") return { referencia: "N" + numero + "FUR", needsReview: false };
  if (referenciaTipo === "zenit" || referenciaTipo === "astra") {
    const letra = REFERENCIA_COLOR_LETTERS[normalizeKey(color)];
    if (!letra) {
      return {
        referencia: "N" + numero,
        needsReview: true,
        reason: `No sé qué letra de color usar para "${color || "(sin color)"}" en la referencia de Polival (nº ${numero}) — dime la letra o corrige la referencia a mano.`,
      };
    }
    const prefijo = referenciaTipo === "zenit" ? "M" : "ASTRA";
    return { referencia: "N" + prefijo + letra + numero + "FUR", needsReview: false };
  }
  return {
    referencia: "N" + numero + fur,
    needsReview: true,
    reason: `No tengo clasificado cómo referenciar este artículo para Polival (nº ${numero}) — dime si sigue el número solo, "FUR", o el patrón de canapé de madera, o corrige la referencia a mano.`,
  };
}

// Recetas de "cómo pedir cada canapé a fábrica" (Jennifer, 2026-08-25).
// Cada clave de color es una versión normalizada (sin acentos, minúscula) de
// lo que aparece en el pedido; el valor trae el nombre de fábrica del color,
// el color de la rejilla, y — si el modelo lo necesita (INITIAL) — el
// nombre de modelo correspondiente a ese color (Polipiel → INITIAL, Tela →
// INITIAL DELUXE).
const CANAPE_RECIPES = {
  zenit: {
    modelo: "ZENIT",
    tapaBase: "Tapa entera en rejilla",
    tirador: "Habitual",
    colores: {
      roble: { color: "Roble", rejilla: "Beige" },
      cerezo: { color: "Cerezo", rejilla: "Marrón" },
      wengue: { color: "Wengué", rejilla: "Wengué" },
      blanco: { color: "Blanco", rejilla: "Blanca" },
      nordico: { color: "Nórdico", rejilla: "Gris Grafito" },
      // "Gris" es el mismo color que "Nórdico" para el Zenit (Jennifer, 2026-08-26).
      gris: { color: "Nórdico", rejilla: "Gris Grafito" },
    },
  },
  astra: {
    modelo: "ASTRA",
    tapaBase: "Tapa entera en rejilla",
    tirador: "Habitual",
    colores: {
      roble: { color: "Roble", rejilla: "Beige" },
      cerezo: { color: "Cerezo", rejilla: "Marrón" },
      wengue: { color: "Wengué", rejilla: "Wengué" },
      blanco: { color: "Blanco", rejilla: "Blanca" },
      nordico: { color: "Nórdico", rejilla: "Gris Grafito" },
    },
  },
  space_extra: {
    // Polival lo llama SPACE MAX (Jennifer, 2026-10-27).
    modelo: "SPACE MAX",
    tapaBase: "Tapa entera en rejilla",
    tirador: null,
    colores: {
      blanco: { color: "Argos Blanco", rejilla: "Blanca" },
      beige: { color: "Argos Hielo", rejilla: "Beige" },
      marron: { color: "Argos Cuero", rejilla: "Marrón" },
      negro: { color: "Argos Negro", rejilla: "Negra" },
    },
  },
  space_apertura_lateral: {
    modelo: "SPACE APERTURA LATERAL",
    tapaBase: "Tapa entera en rejilla",
    tirador: "Habitual",
    colores: {
      blanco: { color: "Argos Blanco", rejilla: "Blanca" },
      beige: { color: "Argos Hielo", rejilla: "Beige" },
      marron: { color: "Argos Cuero", rejilla: "Marrón" },
      negro: { color: "Argos Negro", rejilla: "Negra" },
    },
  },
  space: {
    modelo: "SPACE",
    tapaBase: "Tapa entera en rejilla",
    tirador: "Habitual",
    colores: {
      blanco: { color: "Argos Blanco", rejilla: "Blanca" },
      beige: { color: "Argos Hielo", rejilla: "Beige" },
      marron: { color: "Argos Cuero", rejilla: "Marrón" },
      negro: { color: "Argos Negro", rejilla: "Negra" },
      gris: { color: "Argos Marengo", rejilla: "Grafito" },
    },
  },
  space_deluxe: {
    modelo: "SPACE DELUXE",
    tapaBase: "Tapa con borde Deluxe en rejilla",
    tirador: "Habitual",
    extra: ["BORDE DELUXE"],
    colores: {
      blanco: { color: "Argos Blanco", rejilla: "Blanca" },
      beige: { color: "Argos Hielo", rejilla: "Beige" },
      marron: { color: "Argos Cuero", rejilla: "Marrón" },
      negro: { color: "Argos Negro", rejilla: "Negra" },
      gris: { color: "Argos Marengo", rejilla: "Grafito" },
    },
  },
  magnum: {
    modelo: "MAGNUM",
    // "{color}" se sustituye por el color de fábrica real (Jennifer,
    // 2026-09-28: no "mismo color elegido", sino p. ej. "Argos Negro").
    tapaBase: "Tapa con borde Deluxe {color}",
    tirador: "Dos tirador natural",
    extra: ["BORDE DELUXE", "SISTEMA MÓVIL"],
    colores: {
      blanco: { color: "Argos Blanco", rejilla: "Blanca" },
      beige: { color: "Argos Hielo", rejilla: "Beige" },
      marron: { color: "Argos Cuero", rejilla: "Marrón" },
      negro: { color: "Argos Negro", rejilla: "Negra" },
      gris: { color: "Argos Polar", rejilla: "Grafito" },
    },
  },
  initial: {
    // Modelo, tapa y tirador dependen del color (Polipiel → INITIAL,
    // Tela → INITIAL DELUXE) — se calculan en buildCanapeMercancia.
    // Shopify manda el color de dos formas distintas según el pedido: a
    // veces con el prefijo "Polipiel - "/"Tela - " (ej. pedidos 12104/
    // 12108/12114) y a veces pelado, sin prefijo (ej. "Gris Niebla" en el
    // 12111) — se guardan las dos versiones de cada color para que
    // cualquiera de las dos formas encaje. "Beige" pelado (sin prefijo) es
    // el único caso realmente ambiguo entre Polipiel y Tela — Jennifer
    // confirmó que por defecto es Tela/Duna Lino cuando no se sabe cuál es.
    tirador: "Un tirador natural",
    colores: {
      blanco: { color: "Argos Blanco", rejilla: "Blanca", modelo: "INITIAL" },
      "polipiel blanco": { color: "Argos Blanco", rejilla: "Blanca", modelo: "INITIAL" },
      marron: { color: "Argos Cuero", rejilla: "Marrón", modelo: "INITIAL" },
      "polipiel marron": { color: "Argos Cuero", rejilla: "Marrón", modelo: "INITIAL" },
      negro: { color: "Argos Negro", rejilla: "Negra", modelo: "INITIAL" },
      "polipiel negro": { color: "Argos Negro", rejilla: "Negra", modelo: "INITIAL" },
      gris: { color: "Argos Polar", rejilla: "Gris Antracita", modelo: "INITIAL" },
      "polipiel gris": { color: "Argos Polar", rejilla: "Gris Antracita", modelo: "INITIAL" },
      "polipiel beige": { color: "Argos Hielo", rejilla: "Beige", modelo: "INITIAL" },
      beige: { color: "Duna Lino", rejilla: "Tierra", modelo: "INITIAL DELUXE" },
      "tela beige": { color: "Duna Lino", rejilla: "Tierra", modelo: "INITIAL DELUXE" },
      cacao: { color: "Tela Duna Cocoa", rejilla: "Wengué", modelo: "INITIAL DELUXE" },
      "tela cacao": { color: "Tela Duna Cocoa", rejilla: "Wengué", modelo: "INITIAL DELUXE" },
      "gris antracita": { color: "Duna Onix", rejilla: "Grafito", modelo: "INITIAL DELUXE" },
      "tela gris antracita": { color: "Duna Onix", rejilla: "Grafito", modelo: "INITIAL DELUXE" },
      "gris niebla": { color: "Duna Koala", rejilla: "Grafito", modelo: "INITIAL DELUXE" },
      "tela gris niebla": { color: "Duna Koala", rejilla: "Grafito", modelo: "INITIAL DELUXE" },
      // Arena (pack "acabados en tela", Jennifer, 2026-10-19, BEZEN12320).
      arena: { color: "Duna Alpaca", rejilla: "Tierra", modelo: "INITIAL DELUXE" },
      "tela arena": { color: "Duna Alpaca", rejilla: "Tierra", modelo: "INITIAL DELUXE" },
      // Oliva (Jennifer, 2026-11-10, N051FUR / BEZEN12259: rejilla negra).
      oliva: { color: "Duna Oliva", rejilla: "Negra", modelo: "INITIAL DELUXE" },
      "tela oliva": { color: "Duna Oliva", rejilla: "Negra", modelo: "INITIAL DELUXE" },
    },
  },
};
// Las 3 "gamas" del canapé de tela (natural/tierras/vivos) son fichas de
// catálogo separadas solo para organizar los colores — mismo modelo, misma
// tapa y mismo tirador para pedir a Polival en las 3 (Jennifer, 2026-09-19:
// "el canapé de tela siempre es el mismo modelo... lo que varía... es
// únicamente los colores"). El SKU de un pack (ej. "CANAPETELABEIGE") no
// trae ninguna pista de a qué gama pertenece — solo el color — así que las
// 3 listas de colores se unifican en una sola receta para que el color
// encaje sea cual sea la ficha de catálogo con la que haya coincidido el
// segmento del pack.
const TELA_COLORES_UNIFICADOS = {
  cacao: { color: "Tela Duna Cocoa", rejilla: "Wengué" },
  // Beige es Duna Alpaca en SPACE DELUXE y Canapé Fijo (Jennifer,
  // 2026-09-28); el INITIAL DELUXE tiene su propia tabla con Duna Lino.
  beige: { color: "Duna Alpaca", rejilla: "Tierra" },
  "gris antracita": { color: "Duna Onix", rejilla: "Grafito" },
  "gris niebla": { color: "Duna Koala", rejilla: "Grafito" },
  oliva: { color: "Duna Oliva", rejilla: "Negra" },
  menta: { color: "Duna Salvia", rejilla: "Negra" },
  oceanic: { color: "Duna Tulum", rejilla: "Negra" },
  magenta: { color: "Duna Magenta", rejilla: "Negra" },
  rosa: { color: "Duna Flamingo", rejilla: "Negra" },
  lavanda: { color: "Duna Lavanda", rejilla: "Negra" },
  star: { color: "Duna Dijón", rejilla: "Negra" },
  // Arena es Duna Alpaca (Jennifer, 2026-10-19, BEZEN12320).
  arena: { color: "Duna Alpaca", rejilla: "Tierra" },
};
const TELA_RECIPE_BASE = {
  modelo: "SPACE DELUXE",
  tapaBase: "Tapa con borde Deluxe",
  extra: ["BORDE DELUXE"],
  tiradorDefault: "Uñero",
  tiradorTapaPartida: "Normal",
  colores: TELA_COLORES_UNIFICADOS,
};
const CANAPE_RECIPES_TELA = {
  tela_tierra: TELA_RECIPE_BASE,
  tela_natural: TELA_RECIPE_BASE,
  tela_vivos: TELA_RECIPE_BASE,
};
Object.assign(CANAPE_RECIPES, CANAPE_RECIPES_TELA);


// Canapé abatible NO de madera de 160X190/160X200 (Jennifer, 2026-09-28):
// Polival necesita saber si va en GEMELOS o PARTIDO — lo decide ella.
export const PREGUNTA_FORMATO_160 = "¿GEMELOS o PARTIDO?";
export function necesitaFormato160(item) {
  if (!item || !item.product || item.product.product_type !== "Canapé") return false;
  const key = matchCanapeRecipeKey(item.product.title);
  if (key === "zenit" || key === "astra" || /madera/i.test(item.product.title || "")) return false;
  return item.talla === "160X190" || item.talla === "160X200";
}

// Cambia (o añade) "FORMATO: X" al final del texto de fabricación.
export function textoConFormato160(texto, formato) {
  const limpio = String(texto || "").replace(/\s*·\s*FORMATO:\s*(GEMELOS|PARTIDO)\s*$/i, "");
  return formato ? `${limpio}${limpio ? " · " : ""}FORMATO: ${formato}` : limpio;
}

// ¿`grande` es una medida mayor que `pequena` en ancho Y largo (y distinta)?
// Un colchón solo se puede transformar cortándolo (Jennifer, 2026-09-29).
export function esMedidaMayor(grande, pequena) {
  const dims = (t) => { const m = String(t || "").toUpperCase().match(/^(\d+)X(\d+)$/); return m ? [Number(m[1]), Number(m[2])] : null; };
  const g = dims(grande), p = dims(pequena);
  return !!(g && p && g[0] >= p[0] && g[1] >= p[1] && (g[0] > p[0] || g[1] > p[1]));
}

function matchCanapeRecipeKey(title) {
  const t = normalizeKey(title);
  if (t.includes("esquinas curvas")) return "zenit";
  if (t.includes("esquinas rectas")) return "astra";
  if (t.includes("tela premium")) return null;
  if (t.includes("gama colores tierra")) return "tela_tierra";
  if (t.includes("gama colores natural")) return "tela_natural";
  if (t.includes("gama colores vivos")) return "tela_vivos";
  if (t.includes("extra capacidad")) return "space_extra";
  if (t.includes("apertura lateral")) return "space_apertura_lateral";
  if (t.includes("borde polipiel premium")) return "space_deluxe";
  if (t.includes("con ruedas")) return "magnum";
  if (t.includes("con patas")) return "initial";
  if (t.includes("tapizado") && t.includes("alta capacidad y resistencia")) return "space";
  return null;
}

// EXTRA que se añade a cualquier canapé si el pedido tiene Tapa Partida o
// Tapa Reforzada como opción elegida (Jennifer, 2026-08-25) — se busca en
// el texto de "servicios" del pedido (properties de Shopify), que es lo
// único que llega hasta aquí con esa información.
function detectTapaExtra(servicesText) {
  const t = normalizeKey(servicesText);
  const extras = [];
  if (t.includes("tapa partida")) extras.push("TAPA PARTIDA");
  if (t.includes("tapa reforzada")) extras.push("TAPA REFORZADA");
  return extras;
}

// Devuelve { texto, needsReview, reason } para la columna "Mercancía para
// pedir a fábrica" de un canapé. Si el modelo o el color no están
// clasificados, deja el texto en blanco (ella lo rellena a mano, el campo
// siempre es editable) y pide confirmación por la campana.
// Algunos pedidos mandan el color con el prefijo "Tela - "/"Polipiel - "
// (ej. "Tela - Cacao", "Polipiel - Beige") y otros lo mandan pelado (ej.
// "Gris Niebla") — visto en pedidos reales (12111 sin prefijo, 12104/12108/
// 12114 con prefijo). Se normaliza el guion a espacio para que ambas formas
// encajen contra las claves de CANAPE_RECIPES (que tienen tanto la versión
// con prefijo como sin él para "initial", donde sí hace falta distinguir).
function normalizeColorKey(color) {
  return normalizeKey(color).replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

// Color de un canapé a partir del texto del producto, cuando el pedido no lo
// trae aparte (Maison du Monde: "Canapé abatible en tela beige…") —
// Jennifer, 2026-10-07. Solo colores que existen en la receta de ese
// canapé; si encajan varios, el nombre más largo ("gris niebla" > "gris").
function adivinarColorCanape(title, texto) {
  const recipeKey = matchCanapeRecipeKey(title);
  if (!recipeKey || !texto) return "";
  const t = " " + normalizeColorKey(texto) + " ";
  let mejor = "";
  for (const key of Object.keys(CANAPE_RECIPES[recipeKey].colores || {})) {
    if (t.includes(" " + key + " ") && key.length > mejor.length) mejor = key;
  }
  return mejor ? mejor.replace(/\b\w/g, (c) => c.toUpperCase()) : "";
}

function buildCanapeMercancia(title, colorRaw, talla, servicesText) {
  const recipeKey = matchCanapeRecipeKey(title);
  if (!recipeKey) {
    return { texto: "", needsReview: true, reason: `No tengo la receta de fabricación para "${title}" — dime cómo pedirlo (modelo, color, tapa, tirador) o rellena "Mercancía para pedir a fábrica" a mano.` };
  }
  const recipe = CANAPE_RECIPES[recipeKey];
  const colorKey = normalizeColorKey(colorRaw);
  const entry = recipe.colores[colorKey];
  if (!entry) {
    return { texto: "", needsReview: true, reason: `No tengo mapeado el color "${colorRaw || "(sin color)"}" para "${title}" en la receta de fábrica — dime el nombre de fábrica, la rejilla y corrige "Mercancía para pedir a fábrica" a mano.` };
  }
  const modelo = entry.modelo || recipe.modelo;
  const extras = [...(recipe.extra || [])];
  const tapaExtras = detectTapaExtra(servicesText);
  extras.push(...tapaExtras);
  let tirador = recipe.tirador;
  if (recipe.tiradorDefault) {
    tirador = tapaExtras.includes("TAPA PARTIDA") ? recipe.tiradorTapaPartida : recipe.tiradorDefault;
  }
  if (modelo === "INITIAL DELUXE") extras.push("BORDE DELUXE");
  const tapa = modelo === "INITIAL DELUXE" ? "Tapa con borde Deluxe + rejilla" : (modelo === "INITIAL" ? "Tapa entera en rejilla" : recipe.tapaBase.replace("{color}", entry.color));

  const partes = [
    `MODELO: ${modelo}`,
    `MEDIDA: ${talla || "(según SKU)"}`,
    `COLOR: ${entry.color}`,
    `TAPA: ${tapa} — Rejilla ${entry.rejilla}`,
  ];
  if (tirador) partes.push(`TIRADOR: ${tirador}`);
  if (extras.length) partes.push(`EXTRA: ${extras.join(" + ")}`);
  // El INITIAL (y el INITIAL DELUXE) siempre lleva patas (Jennifer, 2026-09-28).
  if (recipeKey === "initial") partes.push("PATAS A 12.5CM COLOR NATURAL");
  return { texto: partes.join(" · "), needsReview: false };
}

// Cabeceros vendidos sueltos (no en pack) traen en Shopify tanto el color
// como la medida final ya calculada en el propio variantTitle, ej.
// "Blanco / Cama 150 – Medida final 180cm" o "Cama 105 - Medida final
// 115cm / Beige" (el orden color/medida cambia según el producto). Se usa
// directamente el "Medida final" que da Shopify en vez de calcular el
// +30cm a mano — así vale igual aunque el margen sea distinto por modelo
// (ej. Aura es +30cm, Atenea/Iris son +10cm, visto en pedidos reales).
export function parseCabeceroVariant(variantTitle) {
  const partes = (variantTitle || "").split("/").map((s) => s.trim()).filter(Boolean);
  let medida = null;
  let color = null;
  for (const p of partes) {
    const m = p.match(/cama\s*(\d+)\s*[-–]\s*medida final\s*(\d+)\s*cm/i);
    if (m) medida = { ancho: m[1], final: m[2] };
    else color = p;
  }
  return { medida, color };
}

// Recetas de "cómo pedir cada cabecero a fábrica" (Jennifer, 2026-08-25).
// Aria/Atenea/Iris/Gaia comparten la misma tabla de acabados; Aura tiene
// su propio modelo (SIENNA) pero Jennifer aún no ha dado sus colores —
// queda sin "colores" hasta que los dé (buildCabeceroMercancia marca
// needsReview en vez de adivinar).
const CABECERO_ACABADOS_COMUNES = {
  beige: "Duna Lino",
  cacao: "Duna Cocoa",
  "gris antracita": "Duna Onix",
  "gris niebla": "Duna Koala",
  oliva: "Duna Oliva",
  menta: "Duna Salvia",
  oceanic: "Duna Tulum",
  rosa: "Duna Flamingo",
  lavanda: "Duna Lavanda",
  star: "Duna Dijón",
  // Arena es Duna Alpaca (Jennifer, 2026-10-19, BEZEN12320).
  arena: "Duna Alpaca",
};
// offset: cuánto se le suma al ancho que elige el cliente para pedir la
// medida final a fábrica — Aura +30cm, el resto +10cm (confirmado con
// pedidos reales y por Jennifer). Se usa tanto si el cabecero va suelto
// (aunque ahí Shopify ya trae la medida final calculada y se usa esa
// directamente) como si va dentro de un pack (donde no hay "medida final"
// en el SKU, solo el ancho del colchón/canapé — ver buildCabeceroMercancia).
export const CABECERO_RECIPES = {
  aura: {
    // Nuestro nombre delante y el de fábrica entre paréntesis (Polival lo
    // pidió, Jennifer, 2026-10-19).
    modelo: "AURA (VUESTRO SIENNA)",
    offset: 30,
    colores: {
      blanco: "Argos Blanco",
      beige: "Argos Hielo",
      gris: "Argos Polar",
      marron: "Argos Cuero",
      wengue: "Argos Wengué",
      negro: "Argos Negro",
    },
  },
  aria: { modelo: "ARIA (VUESTRO ASHLEY)", offset: 10, colores: CABECERO_ACABADOS_COMUNES },
  atenea: { modelo: "ATENEA (VUESTRO MERYL)", offset: 10, colores: CABECERO_ACABADOS_COMUNES },
  iris: { modelo: "IRIS (VUESTRO MARGOT)", offset: 10, colores: CABECERO_ACABADOS_COMUNES },
  gaia: { modelo: "GAIA (VUESTRO GRETA)", offset: 10, colores: CABECERO_ACABADOS_COMUNES },
};

export function matchCabeceroRecipeKey(title) {
  const t = normalizeKey(title);
  if (t.includes("aura")) return "aura";
  if (t.includes("aria")) return "aria";
  if (t.includes("atenea")) return "atenea";
  if (t.includes("iris")) return "iris";
  if (t.includes("gaia")) return "gaia";
  return null;
}

// colorResuelto/tallaResuelta son lo que ya calculó resolveItem/resolvePackSku
// (funciona igual suelto que dentro de un pack). rawVariantTitle solo existe
// para cabeceros vendidos sueltos (no en pack) y trae el "Medida final" que
// ya calcula Shopify — dentro de un pack no hay ese dato, así que se usa la
// talla del pack tal cual y se avisa de que puede no ser la medida final real.
// conInitial: el pedido lleva un canapé INITIAL (ver cabeceroConInitial en
// processSale) — decide la tela Beige.
function buildCabeceroMercancia(title, colorResuelto, tallaResuelta, rawVariantTitle, conInitial = false) {
  const recipeKey = matchCabeceroRecipeKey(title);
  if (!recipeKey) {
    return { texto: "", needsReview: true, reason: `No tengo la receta de fabricación para "${title}" — dime el modelo/acabado de fábrica o rellena "Mercancía para pedir a fábrica" a mano.` };
  }
  const recipe = CABECERO_RECIPES[recipeKey];
  let color = colorResuelto;
  let medidaTexto = null;
  const parsed = parseCabeceroVariant(rawVariantTitle);
  if (parsed.medida) {
    // Suelto: Shopify ya trae la medida final calculada, se usa tal cual.
    medidaTexto = `${parsed.medida.ancho}cm/${parsed.medida.final}cm`;
    color = parsed.color || colorResuelto;
  } else {
    // Dentro de un pack: no hay "medida final" en el SKU, solo el ancho del
    // colchón/canapé (ej. "150X190") — se coge el ancho y se le suma el
    // offset del modelo (Jennifer, 2026-08-25: si el cliente elige 150x190,
    // el cabecero se pide a fábrica en ancho+offset).
    const anchoMatch = (tallaResuelta || "").match(/^(\d{2,3})/);
    if (anchoMatch) {
      const ancho = Number(anchoMatch[1]);
      medidaTexto = `${ancho}cm/${ancho + recipe.offset}cm`;
    }
  }
  const colorKey = normalizeKey(color);
  let acabado = recipe.colores ? recipe.colores[colorKey] : null;
  // Tela Beige a juego del canapé (Jennifer, 2026-09-28): con INITIAL →
  // Duna Lino; con SPACE DELUXE o suelto → Duna Alpaca. Aura (SIENNA) es
  // polipiel, no le afecta.
  if (colorKey === "beige" && recipe.colores === CABECERO_ACABADOS_COMUNES) {
    acabado = conInitial ? "Duna Lino" : "Duna Alpaca";
  }
  if (!acabado) {
    return { texto: "", needsReview: true, reason: `No tengo mapeado el acabado "${color || "(sin color)"}" para "${title}" en la receta de fábrica — dime el nombre de fábrica y corrige "Mercancía para pedir a fábrica" a mano.` };
  }
  if (!medidaTexto) {
    return { texto: "", needsReview: true, reason: `No he podido calcular la medida de "${title}" (talla "${tallaResuelta}") — corrige "Mercancía para pedir a fábrica" a mano.` };
  }
  return { texto: `MODELO: ${recipe.modelo} · MEDIDA: ${medidaTexto} · ACABADO: ${acabado}`, needsReview: false };
}

// Nombre de fábrica para topper/almohadas (Jennifer, 2026-08-25) — solo el
// nombre cambia, siempre con la medida/talla que eligió el cliente. Los que
// no aparecen aquí (Protector, futuras almohadas) se quedan en blanco/editable.
const SIMPLE_FABRICA_NOMBRES = [
  { match: "v5", nombre: "TOPPER V5" },
  { match: "seafoam", nombre: "SEA FOAM" },
  { match: "nordic", nombre: "NORDIC" },
  { match: "copos", nombre: "COPITOS" },
  { match: "cotton feather", nombre: "NUBE" },
  { match: "latex natural", nombre: "ALMOHADA DE LATEX" },
];

function nombreFabricaProducto(p) {
  const tipo = p.product_type;
  const titulo = p.title || p.stockModel || "";
  if (tipo === "Canapé") {
    const k = matchCanapeRecipeKey(titulo);
    if (k === "initial") return "CANAPÉ INITIAL / INITIAL DELUXE (según color)";
    return k && CANAPE_RECIPES[k] ? "CANAPÉ " + CANAPE_RECIPES[k].modelo : "";
  }
  if (tipo === "Canapé fijo") return CANAPE_FIJO_MODELO;
  if (tipo === "Cabecero") {
    const k = matchCabeceroRecipeKey(titulo);
    return k ? "CABECERO " + CABECERO_RECIPES[k].modelo : "";
  }
  if (tipo === "Base") return "BASE TAPIZADA";
  if (tipo === "Almohada" || tipo === "Topper") {
    const t = normalizeKey(titulo);
    const m = SIMPLE_FABRICA_NOMBRES.find((x) => t.includes(x.match));
    return m ? m.nombre : "";
  }
  return "";
}

// Stock de tapicería (Jennifer, 2026-10-20): el estado de cada ficha sale
// de los pendientes que la usan — si se cancela el pendiente, vuelve a estar
// libre sola; si ya salió, queda como usada.
function estadoStockTapiceria(s, backorders) {
  const usos = backorders.filter((b) => (b.stockTapiceriaId === s.id || (b.piezasStock || []).includes(s.id)) && b.estado !== "cancelado");
  const vivo = usos.find((b) => b.estado !== "servido");
  const b = vivo || usos[0];
  if (!b) return { estado: "disponible", asignadoA: null };
  return { estado: vivo ? "asignado" : "salido", asignadoA: { orderId: b.orderId, orderNumber: b.orderNumber, orderRef: b.orderRef || null, platform: b.platform || null, backorderId: b.id } };
}
function colorTapiceriaKey(c) {
  return normalizeColorKey(String(c || "").replace(/^(tela|polipiel)\s*-\s*/i, ""));
}
// La ficha libre más antigua del mismo modelo, medida y color (solo
// canapés/tapicería completos; las piezas se usan a mano).
function buscarStockTapiceria(lista, backorders, stockModel, talla, color) {
  const t = normalizeTalla(talla) || String(talla || "").toUpperCase();
  return lista
    .filter((s) => s.completo && s.stockModel === stockModel && s.talla === t && colorTapiceriaKey(s.color) === colorTapiceriaKey(color)
      && estadoStockTapiceria(s, backorders).estado === "disponible")
    .sort((a, b) => String(a.fechaAlta).localeCompare(String(b.fechaAlta)))[0] || null;
}
// Piezas sueltas libres del mismo modelo, medida y color (una por pieza).
function buscarPiezasStockTapiceria(lista, backorders, stockModel, talla, color) {
  const t = normalizeTalla(talla) || String(talla || "").toUpperCase();
  const vistas = new Set();
  return lista
    .filter((s) => !s.completo && s.stockModel === stockModel && s.talla === t && colorTapiceriaKey(s.color) === colorTapiceriaKey(color)
      && estadoStockTapiceria(s, backorders).estado === "disponible")
    .sort((a, b) => String(a.fechaAlta).localeCompare(String(b.fechaAlta)))
    .filter((s) => { const k = normalizeKey(s.pieza || s.nota || s.id); if (vistas.has(k)) return false; vistas.add(k); return true; });
}
// Pieza suelta del almacén (Jennifer, 2026-10-20): el pedido a Polival va
// como siempre y abajo esta línea, para que la revisen en fábrica.
function lineaPiezaStock(s) {
  const pieza = String(s.pieza || s.nota || "suelta").toUpperCase();
  return "(LA PIEZA " + pieza + (s.referencia ? " (" + s.referencia + ")" : "") + " ESTÁ EN STOCK, ASÍ QUE SUBIR A FÁBRICA PARA REVISAR, SI ESTÁ BIEN NO FABRICAR ESA PIEZA)";
}
function usarPiezasStock(b, piezas) {
  b.piezasStock = [...(b.piezasStock || []), ...piezas.map((s) => s.id)];
  b.piezasStockTexto = [...(b.piezasStockTexto || []), ...piezas.map((s) => String(s.pieza || s.nota || "pieza").toUpperCase() + (s.referencia ? " (" + s.referencia + ")" : ""))];
  // Para las etiquetas de Furniture: esa pieza sale con su referencia de stock.
  b.piezasStockDetalle = [...(b.piezasStockDetalle || []), ...piezas.map((s) => ({ pieza: String(s.pieza || "").toUpperCase(), referencia: s.referencia || "" }))];
  b.mercanciaFabrica = [b.mercanciaFabrica || "", ...piezas.map(lineaPiezaStock)].filter(Boolean).join(" · ");
}

// Base de Groupon (Jennifer, 2026-10-19): a fábrica va la base con su color
// y medida y, siempre, 6 patas. El color sale del propio modelo de stock
// ("Base tapizada con rejilla 3D y respiraderos | BEIGE - LIQUIDACION").
function buildBaseGrouponMercancia(stockModel, talla) {
  const partes = String(stockModel || "").split("|").map((x) => x.trim()).filter(Boolean);
  const color = (partes.length > 1 ? partes[partes.length - 1] : "").replace(/\s*-\s*LIQUIDACI[OÓ]N\s*$/i, "").toUpperCase();
  // En Groupon siempre 6 patas, sea cual sea la medida (Jennifer, 2026-10-27).
  return { texto: "BASE TAPIZADA" + (color ? " · COLOR: " + color : "") + (talla ? " · MEDIDA: " + talla : "") + " · 6 PATAS", needsReview: false };
}

function buildSimpleMercancia(title, talla) {
  const t = normalizeKey(title);
  const found = SIMPLE_FABRICA_NOMBRES.find((r) => t.includes(r.match));
  if (!found) {
    return { texto: "", needsReview: true, reason: `No tengo el nombre de fábrica para "${title}" — dime cómo se pide o rellena "Mercancía para pedir a fábrica" a mano.` };
  }
  return { texto: `${found.nombre}${talla ? " · MEDIDA: " + talla : ""}`, needsReview: false };
}

// Colchones que sí tienen receta de fábrica (Jennifer, 2026-09-25) — solo
// los "exceptionFurniture" que pasan por Polival (Látex Natura y su
// Premium), el resto de colchones van por Luso/New y no llevan esto. Los
// dos modelos comparten título base ("Colchón de Látex Natural Natura"),
// así que se busca por STOCK MODEL exacto, nunca por substring (para no
// confundir el normal con el Premium).
const COLCHON_FABRICA_NOMBRES = {
  "Colchón de Látex Natural Natura": "LATEX NATURA N15 H18",
  "Colchón de Látex Natural Natura Premium": "LATEX NATURA N18 H21",
};
function buildColchonMercancia(stockModel, talla) {
  const nombre = COLCHON_FABRICA_NOMBRES[stockModel];
  if (!nombre) {
    return { texto: "", needsReview: true, reason: `No tengo el nombre de fábrica para "${stockModel}" — dime cómo se pide o rellena "Mercancía para pedir a fábrica" a mano.` };
  }
  return { texto: `${nombre}${talla ? " · MEDIDA: " + talla : ""}`, needsReview: false };
}

// Canapé Fijo (Jennifer, 2026-09-25, caso real BEZEN12232, modelo "Base
// Alpha"): el color de este modelo usa la MISMA correlación que ya existe
// para los canapés de tela (TELA_COLORES_UNIFICADOS, ej. "Oceanic" -> "Duna
// Tulum") — reusada tal cual, sin duplicar la tabla de colores.
const CANAPE_FIJO_MODELO = "BASE ALPHA";
function buildCanapeFijoMercancia(colorRaw, talla) {
  const entry = TELA_COLORES_UNIFICADOS[normalizeColorKey(colorRaw)];
  if (!entry) {
    return { texto: "", needsReview: true, reason: `No tengo la correlación de color de fábrica para "${colorRaw || "(sin color)"}" en Canapé Fijo — dime el color de fábrica o rellena "Mercancía para pedir a fábrica" a mano.` };
  }
  // La Base Alpha también lleva rejilla, con la misma correlación que el
  // SPACE DELUXE de tela (Jennifer, 2026-09-28).
  return { texto: `MODELO - ${CANAPE_FIJO_MODELO} · MEDIDA: ${talla} · COLOR: ${entry.color} · REJILLA: ${entry.rejilla}`, needsReview: false };
}

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
  // Con coma decimal también (Jennifer, 2026-10-22, BEZEN12344: almohada
  // Nordic "67,5" se quedaba sin medida al pedirla a fábrica). Se guarda
  // con punto, como las Seafoam "67.5".
  const t = text.trim().replace(/^(\d{2,3}),(\d+)$/, "$1.$2");
  const bare = t.match(/^\d{2,3}(\.\d+)?$/);
  if (bare) return t;
  return "";
}

// Shopify manda el color de la tapicería pegado delante de la talla en el
// variantTitle, ej. "Wengue / 90x190 cm" o "Gris Antracita / 150x190 cm" —
// Jennifer necesita saber qué color pedirle a Polival, no solo el modelo.
function extractColor(text) {
  if (!text) return "";
  const m = text.match(/\d{2,3}\s*[xX]\s*\d{2,3}/);
  if (!m || m.index === 0) return "";
  return text.slice(0, m.index).replace(/[/\-\s]+$/, "").trim();
}

function stockKey(stockModel, talla) {
  return `${stockModel}|${talla}`;
}

// Pedido de 2+ colchones sueltos (agencia SEUR) donde unos sí hay en stock y
// otros no (Jennifer, 2026-09-08): en vez de decidirlo solo, se para y se le
// pregunta si quiere dividir el envío o esperar a tenerlo completo. Este
// "dry run" mira la disponibilidad sin tocar el stock real — varios artículos
// del mismo pedido pueden compartir modelo+talla, así que se lleva una copia
// local para no contar el mismo stock dos veces.
// Unidades de un pedido para stock que ya tienen cliente.
function reservadasPedidoStock(ps) {
  return (ps.asignaciones || []).reduce((n, a) => n + (a.cantidad || 0), 0);
}

function checkColchonesCoverage(stock, colchones) {
  const consumido = {};
  const detalle = colchones.map((item) => {
    const key = stockKey(item.product.stockModel, item.talla);
    const disponible = (stock[key]?.cantidad || 0) - (consumido[key] || 0);
    const covered = Math.max(0, Math.min(disponible, item.qty));
    consumido[key] = (consumido[key] || 0) + covered;
    return { stockModel: item.product.stockModel, talla: item.talla, cantidad: item.qty, disponible: covered };
  });
  const algunoCubierto = detalle.some((d) => d.disponible > 0);
  const algunoFalta = detalle.some((d) => d.disponible < d.cantidad);
  return { mixto: algunoCubierto && algunoFalta, detalle };
}

// Referencia "quemada" (Jennifer, 2026-09-08): cada vez que se deshace un
// "listo para SEUR" porque el camión no traía de verdad ese colchón, la
// referencia usada hasta ahora puede que ya se haya dado de alta en la
// plataforma de Seur — la siguiente vez que salga tiene que ser distinta
// para no chocar. "" -> "2" -> "3" -> ...
// Pendientes "vivos" (ni cancelados ni ya enviados/cerrados).
const ESTADOS_ACTIVOS = new Set(["pendiente", "cubierto", "listo-seur"]);

// Separa `n` unidades de un pendiente en uno nuevo (Jennifer, 2026-09-29:
// de un pedido de 2 colchones iguales solo sale/se cancela uno). Si `n` es
// todo lo que tiene, devuelve el mismo pendiente. El nuevo no conserva el
// sufijo "-cubierto" del id (ya no es "cubierto por el motor").
function separarUnidades(backorders, entry, n, etiqueta) {
  if (n >= entry.cantidad) return entry;
  entry.cantidad -= n;
  const nuevo = { ...entry, id: `${String(entry.id).replace(/-cubierto$/, "")}-${etiqueta}${Date.now()}${Math.floor(Math.random() * 1000)}`, cantidad: n };
  backorders.push(nuevo);
  return nuevo;
}

function nombreCortoModeloSrv(stockModel) {
  const partes = String(stockModel || "").split("|").map((x) => x.trim()).filter(Boolean);
  // Base: nunca solo el color (Jennifer, 2026-10-19).
  if (partes.length > 1 && /^base tapizada/i.test(partes[0])) return "BASE TAPIZADA " + partes[partes.length - 1];
  return partes[partes.length - 1] || stockModel || "";
}
function nextRefSuffix(current) {
  const n = parseInt(current, 10);
  return Number.isFinite(n) ? String(n + 1) : "2";
}

// Empuja un pendiente nuevo (idempotente por id) — compartido entre la
// venta normal (applyStockUsage) y los productos "no llevamos stock"
// (addNoStockBackorder).
function pushBackorder(backorders, { id, orderId, orderNumber, stockModel, talla, color, tipo, cantidad, orderDate, esPack, proveedor, needsDecision, referencia, mercanciaFabrica, estado, recibidoFabrica, refSuffix, platform, orderRef, reposicion, piezaTexto, gestoComercial, agenciaReposicion, recogida, recogidaDestino, tipoEnvio }) {
  if (backorders.some((b) => b.id === id)) return;
  backorders.push({
    id,
    orderId,
    orderNumber,
    // Para mostrar la referencia real sin el prefijo "BEZEN" cuando el
    // pedido no es de Shopify (Jennifer, 2026-09-17, Fase 2 de Carrefour).
    // platform es undefined para pedidos de Shopify (compatibilidad con
    // pendientes ya guardados antes de este campo).
    platform: platform || "Shopify",
    orderRef: orderRef || null,
    stockModel,
    talla,
    // Color/acabado de la tapicería (ej. "Wengue") — vacío para lo que no
    // tiene color (colchones, almohadas, toppers).
    color: color || "",
    tipo,
    cantidad,
    // Fecha del pedido original (no la de hoy), para saber cuánto lleva
    // esperando el cliente de verdad.
    fecha: orderDate || new Date().toISOString(),
    // "pendiente" = hace falta pedirlo a proveedor (aparece en Polival/
    // Luso/New). "cubierto" = ya había stock real cuando se procesó el
    // pedido, no hace falta pedir nada — solo existe para que Furniture
    // pueda ver el artículo completo del pedido y su llegada ya marcada
    // (ver applyStockUsage). "servido" = el pedido del cliente ya se envió.
    estado: estado || "pendiente",
    recibidoFabrica: !!recibidoFabrica,
    // Solo tiene sentido para colchones dentro de un pack con tapicería, o
    // colchón suelto con tapicería en el mismo pedido: referencia FURBEZEN
    // (tiene que salir junto con la tapicería) o FPKBEZEN (puede salir
    // independiente), por defecto FPK hasta que se indique lo contrario o
    // se sepa una fecha de camión cercana. Ver updateBackorderPlan. Un
    // colchón `exceptionFurniture` (ej. Látex Natura, Jennifer 2026-09-25:
    // "nunca puede ser FPK porque siempre va por Furniture") fuerza FUR
    // desde el llamador — no hay decisión real que tomar ahí, así que
    // tampoco debe mostrar el aviso/etiqueta de FPK en Furniture.
    esPack: !!esPack,
    tipoEnvio: tipoEnvio || "FPK",
    fechaEstimadaLlegada: null,
    // A qué proveedor pedirlo: POLIVAL / LUSO / NEW. null si el modelo no
    // coincide con ningún reparto conocido — queda para asignar a mano en
    // Catálogo (ver defaultProveedor / proveedorManual).
    proveedor: proveedor || null,
    // Casos sin regla fija (Jennifer, 2026-08-25): colchón suelto + tapicería
    // en el mismo pedido, colchón del pack sin stock (FUR/FPK), o un
    // artículo del pack cuyo código de SKU coincidía con más de un producto
    // del catálogo. needsDecision no cambia nunca (marca qué pendientes
    // nacieron de una duda real); pendingDecision es el bloqueo actual —
    // empieza igual a needsDecision y se suelta/rebloquea desde
    // releaseDecision cuando Jennifer responde en el pedido. Mientras
    // pendingDecision sea true, el pendiente no debe aparecer asentado en
    // ninguna carpeta de Proveedores concreta, solo en "Pendiente de
    // decisión" (ver reviewReasons/reviewAnswers en OrdersStore).
    needsDecision: !!needsDecision,
    pendingDecision: !!needsDecision,
    // Referencia única de Polival (ej. "MR007", "007FUR") — null para
    // Luso/New, que no la usan. Siempre editable a mano (ver /backorders/:id/referencia).
    referencia: referencia || null,
    // "Mercancía para pedir a fábrica": autogenerada por receta para
    // canapés (ver buildCanapeMercancia); null para lo demás, que sigue
    // usando el nombre manual por modelo (nombreFabricacion). Siempre
    // editable a mano (ver /backorders/:id/mercancia).
    mercanciaFabrica: mercanciaFabrica || null,
    // Pedido de 2+ colchones dividido a petición de Jennifer (SEUR,
    // 2026-09-08): la parte que se queda pendiente en Luso/New se marca con
    // "2" para que, cuando salga en su propia carga de SEUR más adelante,
    // use una referencia distinta (BEZEN{numero}2) y no choque con la del
    // envío que ya salió con la referencia normal. "" para todo lo demás.
    refSuffix: refSuffix || "",
    // Carga de SEUR a la que se ha asignado este pendiente al marcarlo
    // "listo para SEUR" (ver resolveSeurBackorder) — null hasta entonces.
    cargaId: null,
    // Reposición de una pieza rota (Jennifer, 2026-09-21, ver
    // crearReposicion): marca visible aparte en Proveedores/Furniture para
    // no confundirla con un pendiente de venta normal, con el texto de
    // qué pieza exacta hay que mandar (para que Polival no reenvíe el
    // juego completo si solo se rompió una parte).
    reposicion: !!reposicion,
    piezaTexto: piezaTexto || "",
    // Gesto comercial (Jennifer, 2026-09-22, ver crearGestoComercial):
    // almohada(s) de regalo por un daño/retraso que no compensa gestionar
    // como cambio de pieza. Misma idea que "reposicion" (línea propia e
    // independiente en Proveedores/Furniture, referencia GC-XXX propia),
    // pero SÍ puede cubrirse con stock real si lo hay (a diferencia de una
    // reposición, que siempre pide nuevo a proveedor).
    gestoComercial: !!gestoComercial,
    // Reposición de un COLCHÓN (Jennifer, 2026-09-22): "SEUR" | "FURNITURE"
    // | null (null para reposiciones que no son de colchón, donde siempre
    // se ha usado Furniture y no hace falta elegir). `recogida` solo tiene
    // sentido cuando agenciaReposicion==="FURNITURE" — SEUR nunca puede
    // hacer recogidas del colchón dañado. `recogidaDestino` distingue si el
    // colchón recogido vuelve a nuestras instalaciones o es para desechar,
    // solo relevante cuando recogida===true — se usa al construir el Excel
    // real de Furniture (ver buildFurnitureExport en index.js).
    agenciaReposicion: agenciaReposicion || null,
    recogida: !!recogida,
    recogidaDestino: recogidaDestino || null,
  });
}

// Fichas de Catálogo marcadas "excluido" (ver updateFlags) — duplicados de
// Shopify que no deben participar en ninguna búsqueda por nombre/SKU ni en
// Tarifas, aunque la ficha siga viva en Shopify.
function activeProducts(products) {
  return Object.values(products).filter((p) => !p.excluido);
}

// Un segmento de SKU de pack (ej. "COLZSUPREME90X190") no siempre trae el
// código de producto tal cual: a veces le precede texto de "PACK", un "2"
// de marketplace, u otro componente pegado. Buscamos, entre los productos
// base ya sincronizados —tanto por su SKU de Shopify como por los alias
// que Jennifer haya añadido a mano (otras plataformas, ej. "AURORA")—, cuál
// código conocido aparece contenido en el segmento, quedándonos con el más
// largo (más específico) si hay varios candidatos.
export function findBestPrefixMatch(segmentRaw, products) {
  const segment = segmentRaw.toUpperCase();
  // Recoge TODOS los productos distintos cuyo código encaja en el
  // segmento, no solo el mejor — dos modelos casi gemelos (ej. un canapé y
  // su versión "LIQUIDACIÓN") pueden coincidir a la vez y el más largo no
  // siempre es el correcto. Si hay más de uno, es una duda real: se sigue
  // eligiendo el más largo como mejor apuesta, pero se marca ambiguo para
  // que Jennifer lo confirme (ver resolvePackSku).
  // La exclusión de "para alojamiento" que vivía aquí (Jennifer, 2026-09-19)
  // se quitó el 2026-09-23: Paris y Zen Mandala eran fichas DUPLICADAS de
  // Shopify que compartían prefijo de SKU con su gemelo "normal" — Jennifer
  // confirmó que el nombre "para alojamiento" es solo un resto mal puesto,
  // el producto SÍ se vende normal, así que se fusionaron ambas fichas en
  // una sola (mismo `stockModel`). Ya no hay duplicado que desambiguar, así
  // que excluirlo aquí solo dejaba estos modelos sin ningún match posible.
  // 2026-09-24: fusionar bajo el mismo stockModel seguía siendo frágil (la
  // ficha "para alojamiento" y su gemela normal son DOS entradas de
  // Catálogo independientes que solo coinciden en texto a mano) y volvió a
  // dar problemas (precios de Tarifas huérfanos bajo el nombre antiguo tras
  // la fusión). Ahora la ficha "para alojamiento" se marca `excluido` en
  // Catálogo en vez de fusionarse — `activeProducts()` la ignora aquí y en
  // el resto de búsquedas por nombre/SKU/Tarifas, dejando la ficha "normal"
  // como única fuente real.
  const matches = [];
  for (const p of activeProducts(products)) {
    if (p.product_type === "Pack") continue;
    const candidates = [p.skuPrefix, ...(p.altSkuPrefixes || [])].filter((c) => c && c.length >= 4);
    let bestForProduct = null;
    for (const candidate of candidates) {
      const prefix = candidate.toUpperCase();
      if (segment.includes(prefix) && (!bestForProduct || prefix.length > bestForProduct.length)) {
        bestForProduct = prefix;
      }
    }
    if (bestForProduct) matches.push({ product: p, prefix: bestForProduct });
  }
  if (matches.length === 0) return null;
  // Ficha "LIQUIDACIÓN" con código corto (ej. canapé de madera "CANMON",
  // que cabe dentro de "PACKCANMONROB"): solo cuenta si el código dice
  // LIQUIDACION, y en ese caso gana ella (Jennifer, 2026-10-06, BEZEN12242/
  // 12263: la campanita preguntaba siempre por la ficha de liquidación).
  const esLiquidacion = (m) => /LIQUIDACI[OÓ]N/i.test(m.product.stockModel || m.product.title || "");
  const pideLiquidacion = /LIQUIDACI[OÓ]N/.test(segment);
  const preferidas = matches.filter((m) => esLiquidacion(m) === pideLiquidacion);
  if (preferidas.length && preferidas.length < matches.length) matches.splice(0, matches.length, ...preferidas);
  matches.sort((a, b) => b.prefix.length - a.prefix.length);
  const winner = matches[0];
  const idx = segment.indexOf(winner.prefix);
  const remainder = segmentRaw.slice(idx + winner.prefix.length);
  const ambiguous = matches.length > 1;
  return {
    product: winner.product,
    talla: normalizeTalla(remainder),
    ambiguous,
    candidates: ambiguous ? matches.map((m) => `${m.product.stockModel} (${m.prefix})`) : [],
  };
}

// Almohada de regalo "Nordic" pegada al SKU de algunos packs de Canapé +
// Colchón Paris (Jennifer, 2026-09-19: "solo los packs con el colchón parís
// son los que pueden llegar a llevar el regalo de la almohada nordic") — va
// como un segmento suelto "NOR"+talla (ej. "NOR105"), con un posible dígito
// de cantidad pegado delante si el pack regala más de una (ej. "2NOR100" =
// 2 unidades talla 100). No coincide con el alias "ALMNOR" del catálogo por
// prefijo normal (demasiado distinto/corto), así que se reconoce aparte.
const NOR_PILLOW_RE = /^(\d*)NOR(\d+)$/i;

function resolvePackSku(rawSku, products, packColor, packTalla) {
  if (!rawSku || rawSku.includes("(")) return { componentes: [], needsReview: true, ambiguousNotes: [] };
  const base = rawSku.split("-")[0];
  const segments = base.split("+").map((s) => s.trim()).filter(Boolean);
  const componentes = [];
  const ambiguousNotes = [];
  let unresolved = 0;
  for (const seg of segments) {
    const norMatch = seg.match(NOR_PILLOW_RE);
    const nordic = norMatch ? Object.values(products).find((p) => p.skuPrefix === "ALMNOR") : null;
    if (norMatch && nordic) {
      // La Nordic de 100 no existe (Jennifer, 2026-10-22: "tienen que ser de
      // 90"): los packs 200X200 con "2NOR100" llevan 2 de 90.
      const tallaNor = normalizeTalla(norMatch[2]) === "100" ? "90" : normalizeTalla(norMatch[2]);
      componentes.push({ tipo: "almohada", product: nordic, talla: tallaNor, ambiguousMatch: false, color: "", qtyOverride: norMatch[1] ? Number(norMatch[1]) : 1 });
      continue;
    }
    const match = findBestPrefixMatch(seg, products);
    if (match) {
      // El color (ej. "Wengue") no está en el segmento de SKU, viene del
      // variantTitle del pack entero — solo tiene sentido para la
      // tapicería (canapé/cabecero/base), que es lo único con acabados de
      // color en este catálogo. La talla tampoco siempre viene en cada
      // segmento (ej. "PACKCANMONWEN+COLZNIR90X190" solo trae la talla en
      // el segmento del colchón) — si el segmento no la trae, se usa la
      // talla del pack entero, que en un pack cama es la misma para todos
      // sus componentes.
      const tipo = TYPE_MAP[match.product.product_type] || "otro";
      componentes.push({ tipo, product: match.product, talla: match.talla || packTalla || "", ambiguousMatch: !!match.ambiguous, color: tipo === "tapiceria" ? packColor : "" });
      if (match.ambiguous) {
        ambiguousNotes.push(`El código "${seg}" del pack coincide con varios artículos del catálogo: ${match.candidates.join(" / ")}. He elegido "${match.product.stockModel}" por defecto — confírmame si es correcto o dime cuál es el que corresponde.`);
      }
    } else {
      // Antes esto se descartaba en silencio (Jennifer, 2026-09-19, caso
      // real BEZEN12211: el colchón de un pack "no se ha metido en ningún
      // sitio" — el segmento "TOSCANA150X200" no coincidía con el alias
      // "COLTOS" del catálogo, así que se perdía sin dejar rastro alguno,
      // ni siquiera en Casos a revisar). Ahora, aunque no haya nada que
      // hacer automáticamente, queda un aviso explícito para que no se
      // pierda de vista y se añada a mano (ver /api/inventario/admin/add-item-to-order).
      unresolved++;
      ambiguousNotes.push(`El código "${seg}" del pack no coincide con ningún artículo del catálogo — este componente del pack NO se ha añadido a ningún pendiente. Revísalo a mano y dime qué modelo es (o añade el alias que falta en el Catálogo) para poder incluirlo.`);
    }
  }
  return { componentes, needsReview: unresolved > 0 || componentes.length === 0, ambiguousNotes };
}

function resolveItem(item, products) {
  const product = item.productId != null ? products[item.productId] : null;
  if (!product) return { tipo: "desconocido" };
  if (product.product_type === "Pack") {
    const { componentes, needsReview, ambiguousNotes } = resolvePackSku(item.sku, products, extractColor(item.variantTitle), normalizeTalla(item.variantTitle));
    // La variante del pack (ej. "... - Gemelos") vale para sus componentes
    // (Jennifer, 2026-09-28: formato GEMELOS/PARTIDO de los canapés de 160).
    // Campo aparte: variantTitle NO se toca (buildCabeceroMercancia lo lee
    // para los cabeceros sueltos y con el del pack sacaría mal el color).
    for (const c of componentes) c.variantPack = item.variantTitle;
    return { tipo: "pack", componentes, needsReview, ambiguousNotes, qty: item.qty };
  }
  const tipo = TYPE_MAP[product.product_type] || "otro";
  // Los cabeceros sueltos no usan el formato "Color / WxH cm" de las demás
  // tapicerías, sino "Cama X – Medida final Ycm / Color" — si no se lee la
  // talla real de ahí, dos variantes distintas del mismo cabecero en un
  // mismo pedido (ej. dos colores) comparten talla vacía y se pisan entre
  // sí como un único pendiente (ver stockKey/pushBackorder).
  if (product.product_type === "Cabecero") {
    const { medida, color } = parseCabeceroVariant(item.variantTitle);
    return { tipo, product, talla: medida ? medida.ancho : normalizeTalla(item.variantTitle), color: color || "", variantTitle: item.variantTitle, qty: item.qty };
  }
  return { tipo, product, talla: normalizeTalla(item.variantTitle), color: tipo === "tapiceria" ? extractColor(item.variantTitle) : "", variantTitle: item.variantTitle, qty: item.qty };
}

// Reposición que en realidad es un CAMBIO de modelo/medida (Jennifer,
// 2026-10-07: "el cliente decide hacer un cambio de medida de modelo").
// No es lo habitual: sin `cambio`, se repone el mismo artículo del pedido
// (resolveItem, como siempre). Con `cambio: { productId, talla, color }`
// se usa el artículo elegido a mano del Catálogo en lugar del del pedido.
function resolverItemReposicion(item, cambio, products) {
  if (!cambio) {
    const r = resolveItem(item, products);
    // Pack (Jennifer, 2026-10-14, BEZEN11965: pletinas de un pack de canapé
    // + cabecero): se repone una de sus partes, elegida en la ventana.
    if (r.tipo === "pack" && item.componente != null) {
      const c = r.componentes[Number(item.componente)];
      if (!c || !c.product) return { tipo: "desconocido" };
      return { tipo: c.tipo, product: c.product, talla: c.talla, color: c.color || "", variantTitle: c.variantPack || item.variantTitle, qty: 1 };
    }
    return r;
  }
  const product = products[cambio.productId];
  if (!product || product.product_type === "Pack") return { tipo: "desconocido" };
  const tipo = TYPE_MAP[product.product_type] || "otro";
  const talla = String(cambio.talla || "").trim().toUpperCase();
  const color = tipo === "tapiceria" ? String(cambio.color || "").trim() : "";
  return { tipo, product, talla, color, variantTitle: [color, talla].filter(Boolean).join(" / "), qty: 1 };
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
    for (const p of activeProducts(products)) {
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

  const byName = activeProducts(products).filter((p) => p.product_type !== "Pack" && p.stockModel);
  const exact = byName.find((p) => p.stockModel.toUpperCase() === q);
  if (exact) return exact.stockModel;
  const partial = byName.find((p) => p.stockModel.toUpperCase().includes(q));
  return partial ? partial.stockModel : null;
}

// === TARIFAS (Jennifer, 2026-09-22) ===
// Margen fijo por tramo de ANCHO de talla (el primer número de la talla
// "AnchoXLargo" que ya usa todo el catálogo) — compartido entre MAISON y
// RESTO DE PLATAFORMAS, dictado turno a turno: 80/90→12€, 105/120→15€,
// 135/140/150→18€, 160/180→25€, 200→35€.
// 67 añadido 2026-09-23 (4D/Ergo-Relax Plus, talla real de Carrefour sin
// tramo propio) — mismo tramo que 80/90, coherente con que su coste/envío
// ya se sustituyen por los de 80X180 (ver TARIFA_SUSTITUTOS_GENERALES).
const TARIFA_MARGEN_TRAMOS = [
  // 70 y 75 añadidos 2026-11-04 (almohadas Nordic/Smooth de Polival,
  // ALMNOR70/75: tenían coste pero no salían en plataformas) — tramo de 80/90.
  { anchos: [67, 70, 75, 80, 90], margen: 12 },
  { anchos: [105, 120], margen: 15 },
  { anchos: [135, 140, 150], margen: 18 },
  { anchos: [160, 180], margen: 25 },
  { anchos: [200], margen: 35 },
];
function tarifaMargenPorTalla(talla) {
  const ancho = Number(String(talla || "").split("X")[0]);
  const tramo = TARIFA_MARGEN_TRAMOS.find((t) => t.anchos.includes(ancho));
  return tramo ? tramo.margen : null;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

// Sustituciones de talla cuando no hay coste real guardado (Jennifer,
// 2026-09-23) — en vez de dejar la talla sin precio, se usa el de otra
// talla "equivalente". GENERALES: aplica a cualquier modelo (140X180 nunca
// trae precio en la tarifa real de New Mattress, se usa el de 140X190).
// POR_MODELO: solo para ese stockModel exacto — Pharma-Therapy Soja Slim
// no trae precio de ancho 80 en su tarifa real, se usa el de ancho 90.
// Ampliado 2026-09-23 (Jennifer, al añadir tallas nuevas por Carrefour y
// luego Maison): 67X180 es un caso de ANCHURA (coge 80X180, único caso
// explícito). Cualquier OTRA talla "AnchoX180" que no tenga precio real
// usa el mismo ancho con largo 190 (Jennifer: "exactamente el mismo
// precio de la medida superior") — regla programática, no hace falta
// listar cada ancho a mano según van apareciendo en más ficheros de
// plataforma. Se usa tanto para el precio de COSTE como para el de ENVÍO.
const TARIFA_SUSTITUTOS_GENERALES = { "67X180": "80X180" };
function sustitutoGeneralDeTalla(talla) {
  if (TARIFA_SUSTITUTOS_GENERALES[talla]) return TARIFA_SUSTITUTOS_GENERALES[talla];
  const m = /^(\d+)X180$/.exec(talla || "");
  return m ? m[1] + "X190" : null;
}

// Modelos descatalogados que mientras tanto usan el precio de OTRO modelo
// entero (Jennifer, 2026-09-23) — no es solo coste/envío como los
// sustitutos de arriba, es TODO el cálculo (las 8 columnas) el que se
// copia del modelo base. Quitar la entrada cuando el modelo se elimine
// del todo del Catálogo/de las plataformas.
const TARIFA_MODELO_DESCATALOGADO_USA_PRECIO_DE = {
  "Colchón Viscoelástico | 20cm | Termorregulable con Grafeno": { modelo: "4D", motivo: "descatalogado, precio temporal" },
};

// Plazos de entrega > Marketplace (Jennifer, 2026-09-23): días a mostrar
// según si hay stock real (cantidad > 0) de ese modelo+talla o no —
// distinto según el tipo de artículo. Topper siempre 7, ignora el stock.
const PLAZO_DIAS_REGLAS = {
  colchon: { enStock: 2, sinStock: 12 },
  almohada: { enStock: 2, sinStock: 7 },
  spring_zen: { enStock: 8, sinStock: 25 },
};
function calcularDiasPlazo(tipo, enStock) {
  if (tipo === "topper") return 7;
  const regla = PLAZO_DIAS_REGLAS[tipo] || PLAZO_DIAS_REGLAS.colchon;
  return enStock ? regla.enStock : regla.sinStock;
}

// Tallas que NO vienen como variante real de Shopify (por eso no están en
// `product.tallas`, que se recalcula solo con el sync de Shopify) pero SÍ
// se venden en otros marketplaces (Jennifer, 2026-09-23) — se añaden SOLO
// para que la tabla de Tarifas las calcule, sin tocar `product.tallas`
// (se perdería en el siguiente sync).
const TARIFA_TALLAS_EXTRA_MODELO = {
  "Colchón Muelles Ensacados | 24cm | Una Cara | Generación Zen": ["160X180", "180X180"],
  "Colchón Muelles Ensacados | 27cm | Doble Cara | París Zen": ["67X180", "140X180", "160X180", "180X180"],
  "Colchón Muelles Ensacados | 30cm | Doble Cara | Zen Mandala Gran Hotel": ["140X180", "150X180", "160X180", "180X180"],
  "Colchón Muelles Ensacados | 30cm | Doble Cara | Zen Nirvana Gran Hotel": ["140X180", "150X180", "160X180", "180X180"],
  "Colchón Viscoelástico | 20cm | Látex Gel": ["160X180"],
  "4D": ["67X180", "140X180"],
  "Colchón Viscoelástico | 24cm | Doble cara | Ergo-Relax Plus": ["67X180"],
  "Colchón Viscoelástico | 20cm | Pharma-Therapy Soja": ["67X180", "200X200"],
  "Colchón Viscoelástico | 21cm | Bellagio Deluxe": ["200X200"],
  "Colchón Muelles Ensacados | 31cm | Doble Cara | Zen Natural": ["105X180", "120X180", "140X180", "150X180", "160X180", "180X180"],
  "Colchón Muelles Ensacados | 33cm | Doble Cara | Efecto Nube | Spring Zen": ["105X180", "120X180", "140X180", "150X180", "160X180", "180X180"],
  // Canapé Space polipiel, tarifa Polival (Jennifer, 2026-10-20): medidas de
  // la tarifa que no son variante en Shopify, y el 160 en GEMELOS (precio
  // propio; el 160 "normal" es el PARTIDO). El 180 siempre va en gemelos.
  "Canape Abatible tapizado alta capacidad y resistencia": ["80X180", "105X180", "105X200", "140X180", "150X180", "160X180", "160X180 GEMELOS", "160X190 GEMELOS", "160X200 GEMELOS"],
  // Space Deluxe polipiel (Jennifer, 2026-10-21): tallas de la tarifa ARGOS que no están en la web.
  "Canapé Abatible tapizado gran capacidad con borde polipiel Premium": ["80X180", "105X180", "105X200", "140X180", "150X180", "160X180", "160X190 GEMELOS", "160X200 GEMELOS"],
  // BASE SILVER (Jennifer, 2026-10-27): tallas de la tarifa que no están en la web.
  "Base tapizada con rejilla 3D y respiraderos | BEIGE": ["140X180", "150X180", "160X180", "180X180", "180X190", "180X200"],
  "Base tapizada con rejilla 3D y respiraderos | BLANCO": ["140X180", "150X180", "160X180", "180X180", "180X190", "180X200"],
  "Base tapizada con rejilla 3D y respiraderos | NEGRO": ["140X180", "150X180", "160X180", "180X180", "180X190", "180X200"],
  // Látex Natura (Jennifer, 2026-10-27): gemelos de la web.
  "Colchón de Látex Natural Natura": ["80X180 GEMELOS", "80X200 GEMELOS", "90X190 GEMELOS", "90X200 GEMELOS"],
  "Colchón de Látex Natural Natura Premium": ["80X180 GEMELOS", "80X190 GEMELOS", "80X200 GEMELOS", "90X190 GEMELOS", "90X200 GEMELOS"],
  // MAGNUM (Jennifer, 2026-10-29): tallas de la tarifa ARGOS que no están en la web.
  "Canapé Abatible tapizado gran capacidad con Ruedas": ["120X180", "120X190", "140X180", "150X180", "160X180", "160X190 GEMELOS", "160X200 GEMELOS", "180X180", "180X190", "200X190", "200X200"],
  // SPACE MAX (Jennifer, 2026-10-27): tallas de la tarifa ARGOS que no están en la web.
  "Canapé Abatible tapizado Extra Capacidad": ["120X180", "120X190", "120X200", "140X180", "150X180", "160X180", "160X180 GEMELOS", "160X190 GEMELOS", "160X200 GEMELOS"],
  // Canapé INITIAL polipiel (Jennifer, 2026-10-21): tallas de la tarifa ARGOS que no están en la web.
  "Canapé Abatible tapizado gran capacidad con patas": ["80X180", "90X180", "140X180", "150X180", "160X180", "160X190 GEMELOS", "160X200 GEMELOS",
    // INITIAL DELUXE = las opciones de TELA del mismo producto (Jennifer,
    // 2026-10-21): su coste va en tallas "… TELA" (ver tallaTarifaTela).
    ...["80X180", "80X190", "80X200", "90X180", "90X190", "90X200", "105X180", "105X190", "105X200", "135X180", "135X190", "135X200", "140X180", "140X190", "140X200", "150X180", "150X190", "150X200", "160X180", "160X190", "160X200", "160X190 TELA GEMELOS", "160X200 TELA GEMELOS", "180X190", "180X200", "200X200"].map((t) => / GEMELOS$/.test(t) ? t : t + " TELA")],
  // Cabecero Atenea (Jennifer, 2026-10-21): los cabeceros no tienen tallas en
  // el Catálogo; la talla es el ancho de la cama (Cama 90 → "90").
  "Cabecero Atenea de Tela": ["90", "105", "135", "150", "160", "180", "200"],
  "Cabecero Iris de Tela": ["90", "105", "135", "150", "160", "180", "200"],
  "Cabecero Aria de Tela": ["90", "105", "135", "150", "160", "180", "200"],
  // Aura (Jennifer, 2026-10-27): tarifa ARGOS, cama 80 a 180 (+30 cm).
  "Cabecero Aura": ["80", "90", "105", "120", "135", "140", "150", "160", "180", "200"],
  "Cabecero Gaia de Tela": ["90", "105", "135", "150", "160", "180", "200"],
  // Marsella polipiel (Jennifer, 2026-11-23): tarifa Polival 105/135/150/160/180.
  "Cabecero Marsella Polipiel": ["105", "135", "150", "160", "180"],
  // Canapé ZENIT (Mónaco), madera esquinas curvas (Jennifer, 2026-10-22): tallas de la tarifa que no están en la web.
  "Canape abatible de madera alta capacidad y resistencia - esquinas curvas": ["105X180", "150X180", "160X180", "180X180", "180X190", "200X180", "200X190"],
  // Space Deluxe de tela (Jennifer, 2026-10-21): la misma tarifa ARGOS que la polipiel.
  "Canape abatible tapizado en tela alta capacidad y resistencia  gama colores natural": ["140X180", "150X180", "160X180", "160X190 GEMELOS", "160X200 GEMELOS"],
  "Canape abatible tapizado en tela alta capacidad y resistencia  gama colores tierras": ["140X180", "150X180", "160X180", "160X190 GEMELOS", "160X200 GEMELOS"],
  "Canape abatible tapizado en tela alta capacidad y resistencia  gama colores vivos": ["140X180", "150X180", "160X180", "160X190 GEMELOS", "160X200 GEMELOS"],
};
const TARIFA_SUSTITUTOS_POR_MODELO = {
  // Zenit (Jennifer, 2026-10-22): el 160 de la web ya es el gemelo "frente
  // único"; en los packs llega como "160X… GEMELOS".
  "Canape abatible de madera alta capacidad y resistencia - esquinas curvas": {
    "160X190 GEMELOS": "160X190",
    "160X200 GEMELOS": "160X200",
  },
  // Cabecero de cama 200 dentro de un pack (llega con la medida de la cama).
  "Cabecero Iris de Tela": { "200X200": "200" },
  "Cabecero Aria de Tela": { "200X200": "200" },
  "Cabecero Aura": { "200X200": "200" },
  "Cabecero Gaia de Tela": { "200X200": "200" },
  "Cabecero Atenea de Tela": { "200X200": "200" },
  "Colchón Viscoelástico | 15cm | Pharma-Therapy Soja Slim - Cama Nido": {
    "80X180": "90X180",
    "80X190": "90X190",
    "80X200": "90X200",
  },
};

// Sustituto de ENVÍO por modelo "hermano" (Jennifer, 2026-09-23): si una
// talla no tiene envío guardado, se usa el de otro modelo para esa misma
// talla — Pharma-Therapy Soja Slim no trae 140X190 en la tabla de
// transporte, se usa el de Pharma-Therapy Soja (normal).
const TARIFA_ENVIO_SUSTITUTO_MODELO = {
  "Colchón Viscoelástico | 15cm | Pharma-Therapy Soja Slim - Cama Nido": "Colchón Viscoelástico | 20cm | Pharma-Therapy Soja",
};

// Envío FIJO por modelo (Jennifer, 2026-09-23): colchones que solo salen
// por FURNITURE (nunca por SEUR, ver `exceptionFurniture` en el Catálogo)
// no tienen precio en la tabla de transporte (esa es de SEUR, por país) —
// Furniture cobra un fijo por envío, igual para cualquier talla o país.
// Spring Zen: 42€.
// Base con montaje (SKU "MBASE…") en Precios BEZEN: Furniture cobra 19 € +
// IVA por montarla (Jennifer, 2026-10-27); se suma al envío de 41 €.
const MONTAJE_BASE_FURNITURE = 19;
// Pata de la base (Jennifer, 2026-10-27): 1,16 € cada una; ya va sumada al
// coste guardado (4 patas hasta 135x190, 6 desde 135x200).
const PRECIO_PATA_BASE = 1.16;
// Precio GROUPON (Jennifer, 2026-10-27): modelos y gastos fijos.
const TARIFA_GROUPON_MODELOS = [
  "Base tapizada con rejilla 3D y respiraderos | BEIGE",
  "Base tapizada con rejilla 3D y respiraderos | BLANCO",
  "Base tapizada con rejilla 3D y respiraderos | NEGRO",
  // Canapé Space polipiel (Jennifer, 2026-11-06): misma fórmula, sin patas.
  "Canape Abatible tapizado alta capacidad y resistencia",
  // Colchón Bellagio Deluxe (Jennifer, 2026-11-10): misma fórmula.
  "Colchón Viscoelástico | 21cm | Bellagio Deluxe",
  // Cabecero Marsella (Jennifer, 2026-11-23): "solo está en Groupon".
  // Misma fórmula con el envío fijo de cabecero (41 €).
  "Cabecero Marsella Polipiel",
];
const TARIFA_GROUPON_EXTRA = 9;
// Packs de Groupon (Jennifer, 2026-11-23): canapé + colchón + cabecero todo
// junto. Canapé + colchón = precio de pack de Furniture (un solo envío, el del
// canapé: 45 / 60 en gemelos); el cabecero suma su envío aparte (41). 9 € de
// gastos Groupon una vez y 30 % de margen. Sin IVA. Cama 140 → cabecero 150.
// Colchón suelto: su envío SEUR. Sin cabecero: solo el envío del canapé.
const TARIFA_GROUPON_PACKS = {
  "Groupon Colchón Pharma-Therapy suelto": {
    colchon: "Colchón Viscoelástico | 20cm | Pharma-Therapy Soja",
    divisor: 0.70, margenLabel: "30%",
  },
  "Pack Groupon Canapé Space + Pharma-Therapy": {
    canape: "Canape Abatible tapizado alta capacidad y resistencia",
    colchon: "Colchón Viscoelástico | 20cm | Pharma-Therapy Soja",
    divisor: 0.70, margenLabel: "30%",
  },
  "Pack Groupon Canapé Space + Pharma-Therapy + Cabecero Marsella": {
    canape: "Canape Abatible tapizado alta capacidad y resistencia",
    colchon: "Colchón Viscoelástico | 20cm | Pharma-Therapy Soja",
    cabecero: "Cabecero Marsella Polipiel",
    cabeceroPorAncho: { "105": "105", "135": "135", "140": "150", "150": "150", "160": "160", "180": "180" },
    divisor: 0.70, margenLabel: "30%",
  },
};
// Groupon Bélgica (Jennifer, 2026-11-10): no hay tarifa de envío a BE, así que
// se usa el envío más caro de los guardados para esa talla del modelo.
const TARIFA_GROUPON_ENVIO_BE = ["Colchón Viscoelástico | 21cm | Bellagio Deluxe"];
// Colchones de látex Natura (Jennifer, 2026-10-27): solo se venden en España,
// y sus gemelos (dos colchones de esa medida) llevan tarifa propia en la
// talla "90X190 GEMELOS".
// Modelos que solo existen en Tarifas, no en el Catálogo (Jennifer,
// 2026-10-27): el Somier Kilimanjaro (KEROS en Polival) no se tramita por
// la app, pero quiere su tarifa. Mismo formato que un producto del Catálogo.
const TARIFA_PRODUCTOS_SOLO_TARIFAS = [
  {
    productId: "tarifa-somier-kilimanjaro", stockModel: "Somier Kilimanjaro", title: "Somier Kilimanjaro", product_type: "Somier",
    proveedor: "POLIVAL", skuPrefix: "SOMKIM", nombreFabrica: "SOMIER KEROS",
    tallas: ["80X180", "80X190", "80X200", "90X180", "90X190", "90X200", "105X180", "105X190", "105X200", "120X180", "120X190", "120X200", "135X180", "135X190", "135X200", "150X180", "150X190", "150X200"],
  },
  // Singapur = ARTIC. MOTOR SICILIA Y PATAS de Polival (Jennifer, 2026-10-27).
  {
    productId: "tarifa-somier-singapur", stockModel: "Somier Articulado Eléctrico Singapur | Montaje incluído", title: "Somier Articulado Eléctrico Singapur | Montaje incluído", product_type: "Somier",
    proveedor: "POLIVAL", skuPrefix: "SOMARTICULADOSINGAPUR", nombreFabrica: "ARTIC. MOTOR SICILIA Y PATAS",
    tallas: ["90X180", "90X190", "105X180", "105X190", "135X180", "135X190", "150X180", "150X190"],
  },
  // Packs de Groupon (ver TARIFA_GROUPON_PACKS): solo columna GROUPON.
  {
    productId: "tarifa-groupon-pharma-suelto", stockModel: "Groupon Colchón Pharma-Therapy suelto", title: "Groupon Colchón Pharma-Therapy suelto", product_type: "Pack Groupon",
    proveedor: "VARIOS", skuPrefix: "", nombreFabrica: "",
    tallas: ["80X180", "80X190", "80X200", "90X180", "90X190", "90X200", "105X180", "105X190", "105X200", "120X180", "120X190", "120X200", "135X180", "135X190", "135X200", "140X190", "140X200", "150X180", "150X190", "150X200", "160X190", "160X200", "180X190", "180X200", "200X200"],
  },
  {
    productId: "tarifa-pack-groupon-space-pharma", stockModel: "Pack Groupon Canapé Space + Pharma-Therapy", title: "Pack Groupon Canapé Space + Pharma-Therapy", product_type: "Pack Groupon",
    proveedor: "VARIOS", skuPrefix: "", nombreFabrica: "",
    tallas: ["80X180", "80X190", "80X200", "90X180", "90X190", "90X200", "105X180", "105X190", "105X200", "135X180", "135X190", "135X200", "140X190", "140X200", "150X180", "150X190", "150X200", "160X190", "160X200", "160X190 GEMELOS", "160X200 GEMELOS", "180X190", "180X200", "200X200"],
  },
  {
    productId: "tarifa-pack-groupon-space-pharma-marsella", stockModel: "Pack Groupon Canapé Space + Pharma-Therapy + Cabecero Marsella", title: "Pack Groupon Canapé Space + Pharma-Therapy + Cabecero Marsella", product_type: "Pack Groupon",
    proveedor: "VARIOS", skuPrefix: "", nombreFabrica: "",
    tallas: ["105X180", "105X190", "105X200", "135X180", "135X190", "135X200", "140X190", "140X200", "150X180", "150X190", "150X200", "160X190", "160X200", "160X190 GEMELOS", "160X200 GEMELOS", "180X190", "180X200"],
  },
  // Cabecero MARSELLA polipiel de Polival (Jennifer, 2026-11-23): aún no está
  // en la web/Catálogo. Colores: Blanca, Marrón, Negra, Wengué (160 solo
  // Negra; 180 Blanca y Marrón). Mismo coste para todos los colores.
  {
    productId: "tarifa-cabecero-marsella", stockModel: "Cabecero Marsella Polipiel", title: "Cabecero Marsella Polipiel", product_type: "Cabecero",
    proveedor: "POLIVAL", skuPrefix: "CABMARSELLA", nombreFabrica: "CABECERO MARSELLA",
    tallas: [],
  },
];
// Conjuntos somier + colchón de la web (Jennifer, 2026-10-27): van como los
// demás packs en Precios BEZEN (ella elige precio y descuento por pieza y ve
// el margen). No están en el Catálogo, así que sus piezas se dicen aquí.
const CONJUNTOS_PACK_PIEZAS = {
  "Conjunto Somier Articulado Natura Látex": [
    { tipo: "somier", stockModel: "Somier Articulado Eléctrico Singapur | Montaje incluído" },
    { tipo: "colchon", stockModel: "Colchón de Látex Natural Natura" },
  ],
  "Conjunto Somier Articulado Natura Premium Látex": [
    { tipo: "somier", stockModel: "Somier Articulado Eléctrico Singapur | Montaje incluído" },
    { tipo: "colchon", stockModel: "Colchón de Látex Natural Natura Premium" },
  ],
};
function productoDeTarifa(products, stockModel) {
  return activeProducts(products).find((p) => p.stockModel === stockModel) || TARIFA_PRODUCTOS_SOLO_TARIFAS.find((p) => p.stockModel === stockModel) || null;
}
const TARIFA_SOLO_ESPANA_MODELOS = ["Colchón de Látex Natural Natura", "Colchón de Látex Natural Natura Premium"];
const TARIFA_COLCHON_GEMELOS_MODELOS = ["Colchón de Látex Natural Natura", "Colchón de Látex Natural Natura Premium"];
const TARIFA_ENVIO_FIJO_MODELO = {
  // Cabecero suelto por Furniture (Jennifer, 2026-10-21): 41€.
  "Cabecero Atenea de Tela": 41,
  "Cabecero Iris de Tela": 41,
  "Cabecero Aria de Tela": 41,
  "Cabecero Aura": 41,
  // Base suelta por Furniture sin montaje (Jennifer, 2026-10-20): 41 €.
  "Base tapizada con rejilla 3D y respiraderos | BEIGE": 41,
  "Base tapizada con rejilla 3D y respiraderos | BLANCO": 41,
  "Base tapizada con rejilla 3D y respiraderos | NEGRO": 41,
  // Somier Kilimanjaro: por Furniture, como la base (Jennifer, 2026-10-27).
  "Somier Kilimanjaro": 41,
  // Singapur: montaje incluido → envío de base + montaje de Furniture (41 + 19).
  "Somier Articulado Eléctrico Singapur | Montaje incluído": 60,
  "Cabecero Gaia de Tela": 41,
  "Cabecero Marsella Polipiel": 41,
  // Canapé Fijo = BASE ALPHA (Jennifer, 2026-10-29): envío como una base.
  "Canapé Fijo gama colores vivos": 41,
  "Canapé Fijo gama colores natural": 41,
  "Canapé Fijo gama colores tierra": 41,
  // Canapé ZENIT (Jennifer, 2026-10-22): como el Space.
  // En el Zenit el 160 es siempre gemelo "frente único" (no hay partido en la web).
  "Canape abatible de madera alta capacidad y resistencia - esquinas curvas": { normal: 45, gemelos: 60, gemelosDesde: 160 },
  "Colchón Muelles Ensacados | 33cm | Doble Cara | Efecto Nube | Spring Zen": 42,
  // Látex Natura y Natura Premium: siempre por Furniture (Jennifer, 2026-10-27).
  // Gemelos = dos colchones: Furniture cobra los dos (84 €); solo la talla
  // "… GEMELOS", nunca por ancho.
  "Colchón de Látex Natural Natura": { normal: 42, gemelos: 84, gemelosDesde: Infinity },
  "Colchón de Látex Natural Natura Premium": { normal: 42, gemelos: 84, gemelosDesde: Infinity },
  // Canapé por Furniture, sin montaje (Jennifer, 2026-10-20): 45€; en
  // gemelos (160 GEMELOS y todo lo de 180 o más) 60€.
  "Canape Abatible tapizado alta capacidad y resistencia": { normal: 45, gemelos: 60 },
  // Space apertura lateral (Jennifer, 2026-10-21): mismo precio que el Space.
  "Canapé Abatible tapizado gran capacidad con apertura Lateral": { normal: 45, gemelos: 60 },
  "Canapé Abatible tapizado gran capacidad con borde polipiel Premium": { normal: 45, gemelos: 60 },
  "Canapé Abatible tapizado gran capacidad con patas": { normal: 45, gemelos: 60 },
  "Canapé Abatible tapizado Extra Capacidad": { normal: 45, gemelos: 60 },
  // ASTRA (Jennifer, 2026-10-29).
  "Canapé de madera esquinas rectas": { normal: 45, gemelos: 60 },
  // MAGNUM (Jennifer, 2026-10-29): como el resto de canapés.
  "Canapé Abatible tapizado gran capacidad con Ruedas": { normal: 45, gemelos: 60 },
  "Canape abatible tapizado en tela alta capacidad y resistencia  gama colores natural": { normal: 45, gemelos: 60 },
  "Canape abatible tapizado en tela alta capacidad y resistencia  gama colores tierras": { normal: 45, gemelos: 60 },
  "Canape abatible tapizado en tela alta capacidad y resistencia  gama colores vivos": { normal: 45, gemelos: 60 },
};
// Margen BEZEN propio por modelo (Jennifer, 2026-10-20): el canapé Space
// lleva 25% (÷0,75) en vez del 30% de núcleo.
const TARIFA_BEZEN_MARGEN_MODELO = {
  // Canapé Fijo (Jennifer, 2026-10-29): 30%.
  "Canapé Fijo gama colores vivos": { divisor: 0.70, label: "30%" },
  "Canapé Fijo gama colores natural": { divisor: 0.70, label: "30%" },
  "Canapé Fijo gama colores tierra": { divisor: 0.70, label: "30%" },
  "Canape Abatible tapizado alta capacidad y resistencia": { divisor: 0.75, label: "25%" },
  "Canapé Abatible tapizado gran capacidad con apertura Lateral": { divisor: 0.75, label: "25%" },
  "Canape abatible de madera alta capacidad y resistencia - esquinas curvas": { divisor: 0.75, label: "25%" },
  // MAGNUM (Jennifer, 2026-10-29): 30%.
  "Canapé Abatible tapizado gran capacidad con Ruedas": { divisor: 0.70, label: "30%" },
  // Space Deluxe polipiel (Jennifer, 2026-10-21): de primeras al 30%.
  "Canapé Abatible tapizado gran capacidad con borde polipiel Premium": { divisor: 0.70, label: "30%" },
  "Canapé Abatible tapizado gran capacidad con patas": { divisor: 0.70, label: "30%" },
  "Canapé Abatible tapizado Extra Capacidad": { divisor: 0.70, label: "30%" },
  "Canape abatible tapizado en tela alta capacidad y resistencia  gama colores natural": { divisor: 0.70, label: "30%" },
  "Canape abatible tapizado en tela alta capacidad y resistencia  gama colores tierras": { divisor: 0.70, label: "30%" },
  "Canape abatible tapizado en tela alta capacidad y resistencia  gama colores vivos": { divisor: 0.70, label: "30%" },
};
// Plataformas con margen % en vez del margen fijo por ancho (Jennifer,
// 2026-10-20, Space: (coste+envío) ÷0,75 ÷comisión ×1,21, redondeo .99).
function TARIFA_CANAPE_PLATAFORMA_PUEDE_BAJAR(stockModel) {
  return stockModel === "Canape Abatible tapizado alta capacidad y resistencia" || stockModel === "Canapé Abatible tapizado gran capacidad con apertura Lateral" || stockModel === "Canapé Abatible tapizado gran capacidad con borde polipiel Premium" || TARIFA_MAISON_BEZEN_MAS_MODELO[stockModel] != null || /madera/i.test(stockModel || "");
}
// Maison = BEZEN + X € (Jennifer, 2026-10-21, Space Deluxe): en estos
// canapés el precio de Maison ES y del resto de plataformas es siempre el
// de la web + 2 €.
const TARIFA_MAISON_BEZEN_MAS_MODELO = {
  "Canapé Abatible tapizado gran capacidad con borde polipiel Premium": 2,
  "Canape abatible tapizado en tela alta capacidad y resistencia  gama colores natural": 2,
  "Canape abatible tapizado en tela alta capacidad y resistencia  gama colores tierras": 2,
  "Canape abatible tapizado en tela alta capacidad y resistencia  gama colores vivos": 2,
  // MAGNUM (Jennifer, 2026-10-29).
  "Canapé Abatible tapizado gran capacidad con Ruedas": 2,
  // Space Max y Base Silver (Jennifer, 2026-10-27).
  "Canapé Abatible tapizado Extra Capacidad": 2,
  "Base tapizada con rejilla 3D y respiraderos | BEIGE": 2,
  "Base tapizada con rejilla 3D y respiraderos | BLANCO": 2,
  "Base tapizada con rejilla 3D y respiraderos | NEGRO": 2,
  // Látex Natura y Natura Premium (Jennifer, 2026-10-27).
  "Colchón de Látex Natural Natura": 2,
  "Colchón de Látex Natural Natura Premium": 2,
  "Somier Kilimanjaro": 2,
  // Canapé Fijo (2026-10-29): como la base.
  "Canapé Fijo gama colores vivos": 2,
  "Canapé Fijo gama colores natural": 2,
  "Canapé Fijo gama colores tierra": 2,
  "Somier Articulado Eléctrico Singapur | Montaje incluído": 2,
};
const TARIFA_PLATAFORMAS_MARGEN_MODELO = {
  // ASTRA (Jennifer, 2026-10-29): a coste, solo la comisión de la plataforma.
  "Canapé de madera esquinas rectas": { divisor: 1, label: "sin" },
  // Topper V5 y protectores (Jennifer, 2026-10-29): plataformas al 30%.
  "Topper-sobrecolchón Viscoelástico V5": { divisor: 0.70, label: "30%" },
  "Protector Impermeable Pronébula": { divisor: 0.70, label: "30%" },
  "Protector Antibacteriano Bruner": { divisor: 0.70, label: "30%" },
  "Cabecero Atenea de Tela": { divisor: 0.70, label: "30%" },
  "Cabecero Iris de Tela": { divisor: 0.70, label: "30%" },
  "Cabecero Aria de Tela": { divisor: 0.70, label: "30%" },
  "Cabecero Aura": { divisor: 0.70, label: "30%" },
  "Base tapizada con rejilla 3D y respiraderos | BEIGE": { divisor: 0.70, label: "30%" },
  "Base tapizada con rejilla 3D y respiraderos | BLANCO": { divisor: 0.70, label: "30%" },
  "Base tapizada con rejilla 3D y respiraderos | NEGRO": { divisor: 0.70, label: "30%" },
  "Cabecero Gaia de Tela": { divisor: 0.70, label: "30%" },
  "Cabecero Marsella Polipiel": { divisor: 0.70, label: "30%" },
  // Canapé Fijo (2026-10-29): como la base.
  "Canapé Fijo gama colores vivos": { divisor: 0.70, label: "30%" },
  "Canapé Fijo gama colores natural": { divisor: 0.70, label: "30%" },
  "Canapé Fijo gama colores tierra": { divisor: 0.70, label: "30%" },
  "Canape Abatible tapizado alta capacidad y resistencia": { divisor: 0.75, label: "25%" },
  "Canapé Abatible tapizado gran capacidad con apertura Lateral": { divisor: 0.75, label: "25%" },
  "Canape abatible de madera alta capacidad y resistencia - esquinas curvas": { divisor: 0.75, label: "25%" },
  // MAGNUM (Jennifer, 2026-10-29): 30%.
  "Canapé Abatible tapizado gran capacidad con Ruedas": { divisor: 0.70, label: "30%" },
  // Space Deluxe polipiel (Jennifer, 2026-10-21): de primeras al 30%.
  "Canapé Abatible tapizado gran capacidad con borde polipiel Premium": { divisor: 0.70, label: "30%" },
  "Canapé Abatible tapizado gran capacidad con patas": { divisor: 0.70, label: "30%" },
  "Canapé Abatible tapizado Extra Capacidad": { divisor: 0.70, label: "30%" },
  "Canape abatible tapizado en tela alta capacidad y resistencia  gama colores natural": { divisor: 0.70, label: "30%" },
  "Canape abatible tapizado en tela alta capacidad y resistencia  gama colores tierras": { divisor: 0.70, label: "30%" },
  "Canape abatible tapizado en tela alta capacidad y resistencia  gama colores vivos": { divisor: 0.70, label: "30%" },
};
// Modelos con dos tarifas según el acabado (Jennifer, 2026-10-21): el canapé
// con patas en tela es el INITIAL DELUXE (más caro que el INITIAL de
// polipiel). Su coste se guarda en la talla + " TELA" ("90X190 TELA",
// "160X190 TELA GEMELOS"). Variante "Tela - …" o SKU BDCANINI… = tela.
const TARIFA_MODELOS_TELA_APARTE = ["Canapé Abatible tapizado gran capacidad con patas"];
function tallaTarifaTela(stockModel, talla, esTela) {
  if (!esTela || !TARIFA_MODELOS_TELA_APARTE.includes(stockModel) || !talla || / TELA( |$)/.test(talla)) return talla;
  return / GEMELOS$/.test(talla) ? talla.replace(/ GEMELOS$/, " TELA GEMELOS") : talla + " TELA";
}
function envioFijoDeTalla(fijo, talla) {
  if (fijo == null || typeof fijo === "number") return fijo;
  const t = String(talla || "");
  const gemelos = /GEMELOS/i.test(t) || Number(t.split("X")[0]) >= (fijo.gemelosDesde || 180);
  return gemelos ? fijo.gemelos : fijo.normal;
}

// Fórmula BEZEN (Jennifer, 2026-09-22): coste+envío ÷0,70 (30% margen)
// ÷0,77 (23% publicidad) ×1,21 (IVA) ×1,04 (coste financieras). Cada paso
// se guarda para que Jennifer pueda comprobar el desglose completo, no
// solo el resultado final.
// El último multiplicador subió de 1,02 a 1,04 (Jennifer, 2026-09-23): han
// adquirido un préstamo y quiere recaudar ese coste también por esta vía —
// mismo paso de la fórmula, solo cambia el porcentaje (2%→4%).
// `divisorMargen`/`margenLabel` parametrizan el primer margen (30% para
// núcleo, ÷0,70) porque los modelos de muelles usan un 32% distinto
// (÷0,68) — ver TARIFA_MODELOS_MUELLES, Jennifer 2026-09-23.
// Canapé que se quiere quitar (Jennifer, 2026-10-29, ASTRA = madera esquinas
// rectas): web = (coste + transporte) × IVA × financiera, sin margen comercial
// ni publicidad; en plataformas solo se añade su comisión.
const TARIFA_MODELOS_A_COSTE = ["Canapé de madera esquinas rectas"];
function calcularPrecioACoste(coste, envio) {
  const pasos = [];
  pasos.push({ label: "Precio de coste", valor: round2(coste) });
  pasos.push({ label: "Precio de envío", valor: round2(envio) });
  const suma = coste + envio;
  pasos.push({ label: "Coste + envío (sin margen ni publicidad: se quita)", valor: round2(suma) });
  const conIva = suma * 1.21;
  pasos.push({ label: "× 1,21 (IVA)", valor: round2(conIva) });
  const final = conIva * 1.04;
  pasos.push({ label: "× 1,04 (coste financieras)", valor: round2(final) });
  const redondeado = Math.ceil(final);
  pasos.push({ label: "Redondeo (al alza, € entero)", valor: redondeado });
  return { precio: redondeado, pasos };
}
function calcularPrecioBezen(coste, envio, divisorMargen = 0.70, margenLabel = "30%") {
  const pasos = [];
  // Coste y envío como líneas propias (Jennifer, 2026-09-22: "que también
  // se pueda revisar" cada uno por separado, no solo la suma).
  pasos.push({ label: "Precio de coste", valor: round2(coste) });
  pasos.push({ label: "Precio de envío", valor: round2(envio) });
  const suma = coste + envio;
  pasos.push({ label: "Coste + envío", valor: round2(suma) });
  const conMargen = suma / divisorMargen;
  pasos.push({ label: `÷ ${divisorMargen} (${margenLabel} margen)`, valor: round2(conMargen) });
  const conPublicidad = conMargen / 0.77;
  pasos.push({ label: "÷ 0,77 (23% publicidad)", valor: round2(conPublicidad) });
  const conIva = conPublicidad * 1.21;
  pasos.push({ label: "× 1,21 (IVA)", valor: round2(conIva) });
  const final = conIva * 1.04;
  pasos.push({ label: "× 1,04 (coste financieras)", valor: round2(final) });
  // Redondeo BEZEN (Jennifer, 2026-09-22): siempre al alza, al euro entero
  // (182,54€ → 183€) — nunca decimales en el precio final de BEZEN.
  const redondeado = Math.ceil(final);
  pasos.push({ label: "Redondeo (al alza, € entero)", valor: redondeado });
  return { precio: redondeado, pasos };
}

// Fórmula MAISON / RESTO DE PLATAFORMAS (Jennifer, 2026-09-22): coste+envío
// + margen fijo por talla, luego comisión de plataforma (÷0,77 Maison,
// ÷0,80 resto) + IVA (×1,21). Sin el 30% de margen ni el coste de
// financieras que sí lleva BEZEN.
function calcularPrecioPlataforma(coste, envio, talla, divisorComision) {
  const pasos = [];
  const margen = tarifaMargenPorTalla(talla);
  if (margen == null) {
    return { precio: null, pasos: [], error: "Sin tramo de margen definido para la talla " + talla + "." };
  }
  // Coste y envío como líneas propias (Jennifer, 2026-09-22).
  pasos.push({ label: "Precio de coste", valor: round2(coste) });
  pasos.push({ label: "Precio de envío", valor: round2(envio) });
  const suma = coste + envio;
  pasos.push({ label: "Coste + envío", valor: round2(suma) });
  const conMargen = suma + margen;
  pasos.push({ label: `+ ${margen}€ margen`, valor: round2(conMargen) });
  const conComision = conMargen / divisorComision;
  pasos.push({ label: `÷ ${divisorComision} (comisión plataforma)`, valor: round2(conComision) });
  const final = conComision * 1.21;
  pasos.push({ label: "× 1,21 (IVA)", valor: round2(final) });
  // Redondeo a ".99" de la escala superior (Jennifer, 2026-09-22): sube al
  // siguiente euro entero y resta 1 céntimo (136,74€ → 137€ → 136,99€).
  // Euros justos (Jennifer, 2026-10-21: "los quiero en euros justos", en
  // todas las plataformas): al alza, al euro entero, sin el ,99.
  const redondeado = Math.ceil(final - 0.000001);
  pasos.push({ label: "Redondeo (al alza, € entero)", valor: redondeado });
  return { precio: redondeado, pasos };
}

// Modelos de MUELLES (Jennifer, 2026-09-23): usan un esquema de precios
// distinto al de los modelos de "núcleo" — los 8 modelos de LUSO activados
// para cálculo (ver TARIFA_SUSTITUTOS_* y la carga de LUSO más abajo).
const TARIFA_MODELOS_MUELLES = [
  "Colchón Muelles Ensacados | 24cm | Una Cara | Generación Zen",
  "Colchón Viscoelástico | 30cm | Origin Zen",
  "Colchón Muelles Ensacados | 27cm | Doble Cara | París Zen",
  "Colchón Muelles Ensacados | 33cm | Doble Cara | Efecto Nube | Spring Zen",
  "Colchón Muelles Ensacados | 29cm | Doble Cara | Supreme Zen",
  "Colchón Muelles Ensacados | 30cm | Doble Cara | Zen Mandala Gran Hotel",
  "Colchón Muelles Ensacados | 31cm | Doble Cara | Zen Natural",
  "Colchón Muelles Ensacados | 30cm | Doble Cara | Zen Nirvana Gran Hotel",
];

// PRECIO TACHADO derivado del PRECIO OFERTA (Jennifer, 2026-09-23): "el
// precio tachado lo vamos a modificar en base al precio de oferta" — el
// descuento visible depende del ANCHO de la talla: 40% en 80/90/105
// (y 67, el mismo tramo que ya usa 80 como sustituto en el resto de
// reglas), 50% en 120/135/140/150, 60% en 160/180/200 ("una medida
// superior"). Confirmado con número real (Bellagio Deluxe 90X190,
// oferta 124,99€ → tachado 208,32€, descuento del 40%) antes de
// implementarlo. tachado = oferta ÷ (1 − descuento).
function tarifaTachadoDivisor(talla) {
  const ancho = Number(String(talla || "").split("X")[0]);
  if ([67, 80, 90, 105].includes(ancho)) return 0.60;
  if ([120, 135, 140, 150].includes(ancho)) return 0.50;
  if ([160, 180, 200].includes(ancho)) return 0.40;
  return null;
}

// ESPAÑA para modelos de muelles (Jennifer, 2026-09-23): plano, precio de
// Bezen + 5€, igual para MAISON_ES y RESTO_ES (un único precio de
// plataforma, no depende de la comisión de cada una).
function calcularPrecioPlataformaMuellesEs(precioBezen) {
  const pasos = [];
  pasos.push({ label: "Precio BEZEN", valor: precioBezen });
  const final = round2(precioBezen + 5);
  pasos.push({ label: "+ 5€ (plataformas España)", valor: final });
  return { precio: final, pasos };
}

// BEZEN de Zen Nirvana SIEMPRE 15€ por encima de BEZEN de Zen Mandala
// (Jennifer, 2026-09-23) — aunque su propia fórmula dé otro número, se
// sobreescribe con el precio de otro modelo + una diferencia fija. El
// desglose informativo muestra AMBOS: el precio "de fórmula" y el precio
// final aplicado, para poder comparar.
const TARIFA_BEZEN_REFERENCIA_MODELO = {
  "Colchón Muelles Ensacados | 30cm | Doble Cara | Zen Nirvana Gran Hotel": {
    modeloBase: "Colchón Muelles Ensacados | 30cm | Doble Cara | Zen Mandala Gran Hotel",
    etiquetaBase: "Zen Mandala",
    diferencia: 15,
  },
};

// RESTO DE PAÍSES para modelos de muelles (Jennifer, 2026-09-23): coste+
// envío ÷0,7 (30% margen, igual que BEZEN) ÷comisión de la plataforma que
// corresponda (0,77 Maison / 0,80 Resto) ×1,21 IVA — SIN el margen fijo por
// ancho de talla que sí llevan los modelos de núcleo.
function calcularPrecioPlataformaMuellesResto(coste, envio, divisorComision, divisorMargen = 0.70, margenLabel = "30%") {
  const pasos = [];
  pasos.push({ label: "Precio de coste", valor: round2(coste) });
  pasos.push({ label: "Precio de envío", valor: round2(envio) });
  const suma = coste + envio;
  pasos.push({ label: "Coste + envío", valor: round2(suma) });
  const conMargen = suma / divisorMargen;
  pasos.push({ label: `÷ ${divisorMargen.toFixed(2).replace(".", ",")} (${margenLabel} margen)`, valor: round2(conMargen) });
  const conComision = conMargen / divisorComision;
  pasos.push({ label: `÷ ${divisorComision} (comisión plataforma)`, valor: round2(conComision) });
  const final = conComision * 1.21;
  pasos.push({ label: "× 1,21 (IVA)", valor: round2(final) });
  // Euros justos (Jennifer, 2026-10-21: "los quiero en euros justos", en
  // todas las plataformas): al alza, al euro entero, sin el ,99.
  const redondeado = Math.ceil(final - 0.000001);
  pasos.push({ label: "Redondeo (al alza, € entero)", valor: redondeado });
  return { precio: redondeado, pasos };
}

// --- Generador de .xlsx para exportar precios a plataformas (Jennifer,
// 2026-09-23): "necesito tener este fichero en el sistema para que si
// hacemos alguna actualización de precio, ese fichero se actualice, yo me
// lo descargue de aquí y pueda subirlo al sitio que corresponde" — el
// Worker no tiene ninguna librería de zip/xlsx, así que se construye el
// .zip a mano (cabeceras ZIP local/central/EOCD + CRC32 propio) usando
// solo APIs estándar de Workers (CompressionStream, no hace falta Node).
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
// CompressionStream("deflate") da el formato zlib (2 bytes de cabecera +
// datos + 4 bytes de Adler32) — ZIP necesita el deflate "crudo" de en
// medio, sin esos 6 bytes. "deflate-raw" evitaría este recorte pero no es
// tan universal como "deflate" en todos los runtimes.
async function deflateRawBytes(bytes) {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const full = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  return full.slice(2, full.length - 4);
}
async function buildZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = encoder.encode(name);
    const compressed = await deflateRawBytes(data);
    const crc = crc32(data);

    const local = new Uint8Array(30);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 8, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x21, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBuf.length, true);
    lv.setUint16(28, 0, true);
    localParts.push(local, nameBuf, compressed);

    const central = new Uint8Array(46);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 8, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressed.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBuf.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }
  const centralDirStart = offset;
  const centralBuf = concatBytes(centralParts);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralBuf.length, true);
  ev.setUint32(16, centralDirStart, true);
  ev.setUint16(20, 0, true);
  return concatBytes([...localParts, centralBuf, eocd]);
}
function concatBytes(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
function xmlEscape(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
// `headers`: array de nombres de columna. `rows`: array de arrays, cada
// celda un valor plano (texto → inlineStr, número → <v>) o, para marcar
// una celda en amarillo (Jennifer, 2026-09-23: "necesito que de alguna
// manera lo señales en el fichero... por ejemplo un color amarillo"),
// `{ v: valor, highlight: true }` — usado para el precio de oferta cuando
// NO se ha podido recalcular con Tarifas (sin fórmula para ese artículo,
// ej. Topper V5, o modelo descatalogado como Sensei Zen) y se mantiene el
// último precio manual conocido.
async function buildXlsxBytes(headers, rows) {
  const encoder = new TextEncoder();
  const colLetter = (i) => String.fromCharCode(65 + i);
  let sheetRows = "";
  const headerCells = headers.map((h, i) => `<c r="${colLetter(i)}1" t="inlineStr"><is><t>${xmlEscape(h)}</t></is></c>`).join("");
  sheetRows += `<row r="1">${headerCells}</row>`;
  rows.forEach((row, idx) => {
    const r = idx + 2;
    const cells = row.map((raw, i) => {
      const ref = `${colLetter(i)}${r}`;
      const highlight = raw != null && typeof raw === "object" && "v" in raw;
      const cell = highlight ? raw.v : raw;
      const s = highlight ? ` s="1"` : "";
      if (cell == null) return `<c r="${ref}" t="n"${s}></c>`;
      if (typeof cell === "number") return `<c r="${ref}" t="n"${s}><v>${cell}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${s}><is><t>${xmlEscape(cell)}</t></is></c>`;
    }).join("");
    sheetRows += `<row r="${r}">${cells}</row>`;
  });

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Precios" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  // Estilo 0 = por defecto (sin relleno). Estilo 1 = relleno amarillo
  // (índices de relleno 0/1 son los reservados "none"/"gray125" del
  // formato, el 2 es el amarillo propio).
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/></cellXfs></styleSheet>`;

  return buildZip([
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { name: "_rels/.rels", data: encoder.encode(rootRels) },
    { name: "xl/workbook.xml", data: encoder.encode(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels) },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(sheetXml) },
    { name: "xl/styles.xml", data: encoder.encode(stylesXml) },
  ]);
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
  async logMovement({ stockModel, talla, campo, delta, resultante, origen, usuario, orderNumber, platform, orderRef }) {
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
      // Referencia real del pedido si es de un marketplace (Carrefour/
      // Maison/Worten) — nunca "BEZEN"+número, eso es solo Shopify
      // (Jennifer, 2026-09-21: "las referencias... respetan la referencia
      // con la que trabaja en la propia plataforma").
      platform: platform || null,
      orderRef: orderRef || null,
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
    if (url.pathname === "/abiertos" && method === "GET") {
      return Response.json(Object.values(await this.load("abiertos", {})));
    }
    if (url.pathname === "/abiertos/adjust" && method === "POST") {
      return this.adjustAbiertos(await request.json());
    }
    // Stock de tapicería (Jennifer, 2026-10-20): canapés (o piezas) que ya
    // están en el almacén, una ficha por unidad con su referencia de fábrica.
    if (url.pathname === "/stock-tapiceria" && method === "GET") {
      const lista = await this.load("stockTapiceria", []);
      const backorders = await this.load("backorders", []);
      return Response.json(lista.map((s) => ({ ...s, ...estadoStockTapiceria(s, backorders) })));
    }
    if (url.pathname === "/stock-tapiceria/alta" && method === "POST") {
      const { stockModel, talla, color, referencia, nota, completo, pieza, usuario } = await request.json();
      if (completo === false && !String(pieza || "").trim()) return Response.json({ ok: false, error: "Escribe qué pieza es (TAPA, CAJÓN, FONDO…)." }, { status: 400 });
      const products = await this.load("products", {});
      const p = activeProducts(products).find((x) => x.stockModel === stockModel);
      if (!p || TYPE_MAP[p.product_type] !== "tapiceria") return Response.json({ ok: false, error: "Elige un modelo de tapicería del Catálogo." }, { status: 400 });
      const t = normalizeTalla(talla) || String(talla || "").trim().toUpperCase().replace(/\s+/g, "");
      if (!t) return Response.json({ ok: false, error: "Falta la medida." }, { status: 400 });
      const lista = await this.load("stockTapiceria", []);
      const ficha = { id: crypto.randomUUID(), stockModel, talla: t, color: String(color || "").trim(), referencia: String(referencia || "").trim().toUpperCase(), nota: String(nota || "").trim(), completo: completo !== false, pieza: completo === false ? String(pieza || "").trim().toUpperCase() : "", fechaAlta: new Date().toISOString(), usuario: usuario || null };
      lista.push(ficha);
      await this.state.storage.put("stockTapiceria", lista);
      return Response.json({ ok: true, ficha });
    }
    if (url.pathname === "/stock-tapiceria/baja" && method === "POST") {
      const { id } = await request.json();
      const lista = await this.load("stockTapiceria", []);
      const backorders = await this.load("backorders", []);
      const s = lista.find((x) => x.id === id);
      if (!s) return Response.json({ ok: false, error: "No encontrado." }, { status: 404 });
      if (estadoStockTapiceria(s, backorders).estado === "asignado") return Response.json({ ok: false, error: "Está asignado a un pedido que aún no ha salido: cancela antes ese pendiente." }, { status: 409 });
      await this.state.storage.put("stockTapiceria", lista.filter((x) => x.id !== id));
      return Response.json({ ok: true });
    }
    // Asignar a mano una ficha a un pendiente que ya existía. Un canapé
    // completo cubre el pendiente (sale con su referencia, sin pedir a
    // fábrica); una pieza solo se apunta, el resto se sigue pidiendo.
    if (url.pathname === "/stock-tapiceria/asignar" && method === "POST") {
      const { id, backorderId } = await request.json();
      const lista = await this.load("stockTapiceria", []);
      const backorders = await this.load("backorders", []);
      const s = lista.find((x) => x.id === id);
      const b = backorders.find((x) => x.id === backorderId);
      if (!s || !b) return Response.json({ ok: false, error: "No encontrado." }, { status: 404 });
      if (estadoStockTapiceria(s, backorders).estado !== "disponible") return Response.json({ ok: false, error: "Esta ficha ya está usada." }, { status: 409 });
      if (b.tipo !== "tapiceria" || b.estado !== "pendiente") return Response.json({ ok: false, error: "Solo se puede asignar a tapicería pendiente." }, { status: 409 });
      const avisos = [];
      if (b.pedidoGenerado) avisos.push("⚠ Este artículo YA ESTABA PEDIDO a " + (b.proveedor || "fábrica") + (b.referencia ? " con la referencia " + b.referencia : "") + ": avisa para anularlo.");
      if (s.completo) b.stockTapiceriaId = s.id;
      if (s.completo) {
        b.referenciaAntesDeStock = b.referencia || null;
        if (s.referencia) b.referencia = s.referencia;
        b.mercanciaFabrica = "DEL STOCK DE TAPICERÍA" + (s.referencia ? " (" + s.referencia + ")" : "") + " — ya en el almacén, no pedir a fábrica" + (s.nota ? " · " + s.nota : "");
        b.estado = "cubierto";
        b.recibidoFabrica = true;
        b.fechaRecibido = new Date().toISOString();
      } else {
        if (b.stockTapiceriaId === s.id) b.stockTapiceriaId = null;
        usarPiezasStock(b, [s]);
      }
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, backorder: b, avisos });
    }
    const usarAbiertoMatch = url.pathname.match(/^\/backorders\/([^/]+)\/usar-abierto$/);
    if (usarAbiertoMatch && method === "POST") {
      return this.usarAbierto(decodeURIComponent(usarAbiertoMatch[1]), await request.json().catch(() => ({})));
    }
    if (url.pathname === "/stock/adjust-by-lookup" && method === "POST") {
      return this.adjustStockByLookup(await request.json());
    }
    // Carga de Furniture cerrada (Jennifer, 2026-10-16, BEZEN121402: "me sale
    // en los pedidos pendientes cuando ya se ha marcado como recibido"): lo
    // que iba en ella con línea propia (envío aparte / reposición) ya ha
    // salido — pasa a servido. Un colchón enviado aparte que no es
    // reposición libera su "vendido pendiente", igual que settleShipment.
    if (url.pathname === "/backorders/cerrar-carga" && method === "POST") {
      // idsPedidos (Jennifer, 2026-10-27): los artículos de los pedidos que
      // iban en la carga, los mismos que salen en el fichero de Furniture —
      // lo que quedó fuera (envío aparte, colchón FPK…) sigue pendiente.
      const { cargaId, idsPedidos } = await request.json();
      if (!cargaId) return Response.json({ ok: false, error: "Falta la carga." }, { status: 400 });
      const backorders = await this.load("backorders", []);
      const stock = await this.load("stock", {});
      const servidos = [];
      const delPedido = new Set(idsPedidos || []);
      for (const b of backorders) {
        if (b.estado !== "pendiente" && b.estado !== "cubierto") continue;
        if (delPedido.has(b.id)) {
          if (!(b.gestoComercial && b.gcFurniture)) {
            const key = stockKey(b.stockModel, b.talla);
            const row = stock[key];
            if (row) {
              const antes = row.vendidoPendiente || 0;
              row.vendidoPendiente = Math.max(0, antes - b.cantidad);
              await this.logMovement({ stockModel: b.stockModel, talla: b.talla, campo: "vendidoPendiente", delta: row.vendidoPendiente - antes, resultante: row.vendidoPendiente, origen: "envio", orderNumber: b.orderNumber, platform: b.platform, orderRef: b.orderRef });
            }
          }
          b.estado = "servido";
          b.fechaServido = new Date().toISOString();
          b.servidoEnCarga = cargaId;
          servidos.push(b.id);
          continue;
        }
        if (b.cargaId !== cargaId) continue;
        if (!b.envioAparte && !b.reposicion && !b.gestoComercial) continue;
        if (b.tipo === "colchon" && !b.reposicion && !b.gestoComercial && b.estado === "pendiente") {
          const key = stockKey(b.stockModel, b.talla);
          const row = stock[key];
          if (row) {
            const antes = row.vendidoPendiente || 0;
            row.vendidoPendiente = Math.max(0, antes - b.cantidad);
            await this.logMovement({ stockModel: b.stockModel, talla: b.talla, campo: "vendidoPendiente", delta: row.vendidoPendiente - antes, resultante: row.vendidoPendiente, origen: "envio", orderNumber: b.orderNumber, platform: b.platform, orderRef: b.orderRef });
          }
        }
        b.estado = "servido";
        b.fechaServido = new Date().toISOString();
        servidos.push(b.id);
      }
      if (servidos.length) {
        await this.state.storage.put("stock", stock);
        await this.state.storage.put("backorders", backorders);
      }
      return Response.json({ ok: true, servidos });
    }
    if (url.pathname === "/stock/delete" && method === "POST") {
      return this.deleteStock(await request.json());
    }
    if (url.pathname === "/backorders/delete" && method === "POST") {
      const { id } = await request.json();
      return this.deleteBackorder(id);
    }
    if (url.pathname === "/movements" && method === "GET") {
      const movements = await this.load("movements", []);
      return Response.json([...movements].reverse());
    }
    if (url.pathname === "/backorders" && method === "GET") {
      const backorders = await this.load("backorders", []);
      const fabricacion = await this.load("fabricacion", {});
      return Response.json(backorders.map((b) => ({ ...b, nombreFabricacion: fabricacion[b.stockModel] || "" })));
    }
    if (url.pathname === "/fabricacion" && method === "POST") {
      return this.setNombreFabricacion(await request.json());
    }
    if (url.pathname === "/backorders/mark-ordered" && method === "POST") {
      return this.markOrdered(await request.json());
    }
    if (url.pathname === "/backorders/release-decision" && method === "POST") {
      return this.releaseDecision(await request.json());
    }
    const resolveMatch = url.pathname.match(/^\/backorders\/([^/]+)\/resolver$/);
    if (resolveMatch && method === "POST") {
      let deseado;
      try { const body = JSON.parse((await request.text()) || "{}"); if (typeof body.recibido === "boolean") deseado = body.recibido; } catch (e) { /* sin cuerpo: alterna como antes */ }
      return this.resolveBackorder(decodeURIComponent(resolveMatch[1]), deseado);
    }
    const parcialMatch = url.pathname.match(/^\/backorders\/([^/]+)\/recibir-parcial$/);
    if (parcialMatch && method === "POST") {
      const { unidades } = await request.json();
      return this.recibirParcial(decodeURIComponent(parcialMatch[1]), unidades);
    }
    const cancelarMatch = url.pathname.match(/^\/backorders\/([^/]+)\/cancelar$/);
    if (cancelarMatch && method === "POST") {
      return this.cancelBackorder(decodeURIComponent(cancelarMatch[1]));
    }
    const resolveSeurMatch = url.pathname.match(/^\/backorders\/([^/]+)\/resolver-seur$/);
    if (resolveSeurMatch && method === "POST") {
      const { fecha } = await request.json();
      return this.resolveSeurBackorder(decodeURIComponent(resolveSeurMatch[1]), fecha);
    }
    // "No ha salido" desde el propio pedido (Jennifer, 2026-09-29, caso
    // Carrefour 76393184-A): el colchón iba por SEUR cubierto con stock (o
    // ya preparado), pero no salió porque en realidad no estaba — vuelve a
    // pendiente en su proveedor con la referencia siguiente ("…2"). El stock
    // real NO se devuelve (no estaba); se apunta como vendido pendiente.
    // `seleccion` opcional (Jennifer, 2026-09-29): [{ id, unidades }] — solo
    // esas unidades no han salido; el resto sigue en la carga. Sin
    // selección, todos los colchones del pedido.
    // Sacar de la carga de SEUR para otro día u otro motivo (Jennifer,
    // 2026-10-14): lo cubierto con stock que ya se había dado por servido
    // al subir la etiqueta vuelve a "cubierto" (sigue en el almacén). El
    // stock no se toca.
    if (url.pathname === "/backorders/volver-a-cubierto" && method === "POST") {
      const { orderId } = await request.json();
      const backorders = await this.load("backorders", []);
      const tocados = backorders.filter((b) => String(b.orderId) === String(orderId) && b.estado === "servido" && String(b.id).endsWith("-cubierto") && !b.envioAparte);
      for (const b of tocados) b.estado = "cubierto";
      if (tocados.length) await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, ids: tocados.map((b) => b.id) });
    }
    if (url.pathname === "/backorders/no-salio" && method === "POST") {
      const { orderId, seleccion } = await request.json();
      const backorders = await this.load("backorders", []);
      const stock = await this.load("stock", {});
      // También lo ya dado por "servido" al subir la etiqueta (Jennifer,
      // 2026-10-14, BEZEN12311: se subió la etiqueta y no había mercancía).
      const esDeSeur = (b) => String(b.orderId) === String(orderId) && (b.tipo === "colchon" || b.tipo === "topper")
        && !b.reposicion && !b.gestoComercial && !b.envioAparte
        && (b.estado === "listo-seur" || b.estado === "servido" || (b.estado === "cubierto" && String(b.id).endsWith("-cubierto")));
      let afectados;
      if (Array.isArray(seleccion) && seleccion.length) {
        afectados = [];
        for (const { id, unidades } of seleccion) {
          const entry = backorders.find((b) => b.id === id && esDeSeur(b));
          const n = Math.min(Math.max(0, Math.floor(Number(unidades) || 0)), entry ? entry.cantidad : 0);
          if (!entry || !n) continue;
          afectados.push(separarUnidades(backorders, entry, n, "ns"));
        }
      } else {
        afectados = backorders.filter(esDeSeur);
      }
      if (!afectados.length) return Response.json({ ok: false, error: "Este pedido no tiene ningún colchón preparado o cubierto con stock para SEUR." }, { status: 409 });
      for (const entry of afectados) {
        const key = stockKey(entry.stockModel, entry.talla);
        const row = stock[key] || { stockModel: entry.stockModel, talla: entry.talla, cantidad: 0, vendidoPendiente: 0 };
        row.vendidoPendiente = (row.vendidoPendiente || 0) + entry.cantidad;
        stock[key] = row;
        await this.logMovement({
          stockModel: entry.stockModel, talla: entry.talla, campo: "vendidoPendiente", delta: entry.cantidad,
          resultante: row.vendidoPendiente, origen: "no-salio", orderNumber: entry.orderNumber,
          platform: entry.platform, orderRef: entry.orderRef,
        });
        entry.estado = "pendiente";
        entry.cargaId = null;
        entry.recibidoFabrica = false;
        entry.fechaRecibido = null;
        entry.refSuffix = nextRefSuffix(entry.refSuffix);
        entry.noSalio = new Date().toISOString();
      }
      await this.state.storage.put("stock", stock);
      await this.state.storage.put("backorders", backorders);
      // ¿Le queda al pedido algo listo para SEUR? Si no, el pedido sale de
      // la carga (lo hace OrdersStore, ver /api/pedidos/no-salio).
      const quedanEnCarga = backorders.some(esDeSeur);
      return Response.json({ ok: true, afectados, quedanEnCarga });
    }
    // Pedido del sistema antiguo que ya está entero en el almacén y sale por
    // Furniture (Jennifer, 2026-09-29, caso BEZEN12157): se registran sus
    // artículos como YA LISTOS ("cubierto", recibido), con las referencias
    // que ella da, sin pasar por ningún proveedor y SIN tocar el stock — así
    // la carga de Furniture sabe sus bultos. Idempotente por id.
    if (url.pathname === "/admin/cargar-furniture-manual" && method === "POST") {
      const { orderId, orderNumber, platform, orderRef, orderDate, articulos } = await request.json();
      if (!orderId || !Array.isArray(articulos) || !articulos.length) return Response.json({ ok: false, error: "Faltan orderId o artículos." }, { status: 400 });
      const backorders = await this.load("backorders", []);
      const creados = [];
      for (const a of articulos) {
        const id = `${orderId}-${stockKey(a.stockModel, a.talla)}-manual`;
        if (backorders.some((b) => b.id === id)) continue;
        pushBackorder(backorders, {
          id, orderId, orderNumber, platform, orderRef, orderDate,
          stockModel: a.stockModel, talla: a.talla, color: a.color || "", tipo: a.tipo,
          cantidad: a.cantidad || 1, esPack: !!a.esPack, proveedor: a.proveedor || null,
          referencia: a.referencia || null, estado: "cubierto", recibidoFabrica: true,
          tipoEnvio: a.tipo === "colchon" ? "FUR" : undefined,
        });
        const b = backorders.find((x) => x.id === id);
        b.cargaManual = true;
        creados.push(b);
      }
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, creados });
    }
    // Cancelar unidades de un pendiente (Jennifer, 2026-09-29: el cliente
    // cancela una unidad de un pedido de varias).
    const cancelarUnidadesMatch = url.pathname.match(/^\/backorders\/([^/]+)\/cancelar-unidades$/);
    if (cancelarUnidadesMatch && method === "POST") {
      const { unidades } = await request.json().catch(() => ({}));
      const backorders = await this.load("backorders", []);
      const entry = backorders.find((b) => b.id === decodeURIComponent(cancelarUnidadesMatch[1]));
      if (!entry) return new Response("not found", { status: 404 });
      if (!ESTADOS_ACTIVOS.has(entry.estado)) return Response.json({ ok: false, error: "Este pendiente ya no está activo." }, { status: 409 });
      const n = Math.min(Math.max(1, Math.floor(Number(unidades) || entry.cantidad)), entry.cantidad);
      const cancelado = await this.cancelarUnidadesDe(backorders, entry, n);
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, cancelado });
    }
    // Cancelar unidades de una LÍNEA del pedido (Jennifer, 2026-09-29): se
    // cancelan sus pendientes activos (del artículo o, si es un pack, de sus
    // componentes). Si no tiene ninguno (ej. ya enviado por el sistema
    // antiguo), no se toca nada aquí — solo se anota en el pedido.
    if (url.pathname === "/backorders/cancelar-por-item" && method === "POST") {
      const { orderId, item, unidades } = await request.json();
      const products = await this.load("products", {});
      const backorders = await this.load("backorders", []);
      const resolved = resolveItem(item || {}, products);
      const objetivos = resolved.tipo === "pack"
        ? resolved.componentes.map((c) => ({ stockModel: c.product.stockModel, talla: c.talla }))
        : resolved.product ? [{ stockModel: resolved.product.stockModel, talla: resolved.talla }] : [];
      const n = Math.max(1, Math.floor(Number(unidades) || 1));
      const cancelados = [];
      for (const obj of objetivos) {
        let falta = n;
        for (const entry of backorders.slice()) {
          if (!falta) break;
          if (String(entry.orderId) !== String(orderId) || !ESTADOS_ACTIVOS.has(entry.estado) || entry.reposicion || entry.gestoComercial) continue;
          if (entry.stockModel !== obj.stockModel || entry.talla !== obj.talla) continue;
          const m = Math.min(falta, entry.cantidad);
          cancelados.push(await this.cancelarUnidadesDe(backorders, entry, m));
          falta -= m;
        }
      }
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, cancelados });
    }
    const undoSeurMatch = url.pathname.match(/^\/backorders\/([^/]+)\/deshacer-seur$/);
    if (undoSeurMatch && method === "POST") {
      const opciones = await request.json().catch(() => ({}));
      return this.undoSeurBackorder(decodeURIComponent(undoSeurMatch[1]), opciones);
    }
    const SUF_DESHACER = "/deshacer-cambio-modelo";
    const deshacerCambioMatch = url.pathname.startsWith("/backorders/") && url.pathname.endsWith(SUF_DESHACER) ? [null, url.pathname.slice("/backorders/".length, -SUF_DESHACER.length)] : null;
    if (deshacerCambioMatch && method === "POST") {
      const { nota } = await request.json().catch(() => ({}));
      const backorders = await this.load("backorders", []);
      const entry = backorders.find((b) => b.id === decodeURIComponent(deshacerCambioMatch[1]));
      if (!entry) return new Response("not found", { status: 404 });
      if (!entry.stockModelOriginal) return Response.json({ ok: false, error: "Este pendiente no tiene cambio de modelo." }, { status: 409 });
      if (entry.estado !== "pendiente") return Response.json({ ok: false, error: "Solo se puede deshacer en un pendiente (quítalo antes de la carga)." }, { status: 409 });
      const sustituto = { stockModel: entry.stockModel, talla: entry.talla };
      this.revertirCambioModelo(entry, nota || ("Se le ofreció cambio por " + nombreCortoModeloSrv(entry.stockModel) + " " + entry.talla + ", pero a la hora de salir no había en stock"));
      // Lo vendido pendiente pasa del sustituto al original.
      if (entry.tipo === "colchon" && !entry.reposicion) {
        const stock = await this.load("stock", {});
        for (const [k, sm, t, d] of [[stockKey(sustituto.stockModel, sustituto.talla), sustituto.stockModel, sustituto.talla, -entry.cantidad], [stockKey(entry.stockModel, entry.talla), entry.stockModel, entry.talla, entry.cantidad]]) {
          const row = stock[k] || { stockModel: sm, talla: t, cantidad: 0, vendidoPendiente: 0 };
          const antes = row.vendidoPendiente || 0;
          row.vendidoPendiente = Math.max(0, antes + d);
          stock[k] = row;
          await this.logMovement({ stockModel: sm, talla: t, campo: "vendidoPendiente", delta: row.vendidoPendiente - antes, resultante: row.vendidoPendiente, origen: "deshacer-cambio", orderNumber: entry.orderNumber, platform: entry.platform, orderRef: entry.orderRef });
        }
        await this.state.storage.put("stock", stock);
      }
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, entry });
    }
    const alternativasMatch = url.pathname.match(/^\/backorders\/([^/]+)\/alternativas$/);
    if (alternativasMatch && method === "GET") {
      return this.listBackorderAlternatives(decodeURIComponent(alternativasMatch[1]));
    }
    const sustituirMatch = url.pathname.match(/^\/backorders\/([^/]+)\/sustituir$/);
    if (sustituirMatch && method === "POST") {
      const { query, mode, talla, fecha, transformar, desdeAbierto } = await request.json();
      return this.substituteBackorder(decodeURIComponent(sustituirMatch[1]), { query, mode, talla, fecha, transformar, desdeAbierto: !!(transformar && desdeAbierto) });
    }
    const planMatch = url.pathname.match(/^\/backorders\/([^/]+)\/plan$/);
    if (planMatch && method === "POST") {
      return this.updateBackorderPlan(decodeURIComponent(planMatch[1]), await request.json());
    }
    const referenciaMatch = url.pathname.match(/^\/backorders\/([^/]+)\/referencia$/);
    if (referenciaMatch && method === "POST") {
      const { referencia, siguienteReposicion } = await request.json();
      // Volver a numerar una reposición con el siguiente "I-XXX" del
      // contador, como si se pidiera hoy (Jennifer, 2026-10-29, REP10002269275-A).
      if (siguienteReposicion) return this.setBackorderReferencia(decodeURIComponent(referenciaMatch[1]), await nextReposicionReferencia(this.state));
      return this.setBackorderReferencia(decodeURIComponent(referenciaMatch[1]), referencia);
    }
    // Formato GEMELOS/PARTIDO de un canapé de 160 (Jennifer, 2026-09-28).
    const formatoMatch = url.pathname.match(/^\/backorders\/([^/]+)\/formato160$/);
    if (formatoMatch && method === "POST") {
      const { formato } = await request.json();
      if (formato !== "GEMELOS" && formato !== "PARTIDO") return Response.json({ ok: false, error: "Formato no válido." }, { status: 400 });
      const backorders = await this.load("backorders", []);
      const entry = backorders.find((b) => b.id === decodeURIComponent(formatoMatch[1]));
      if (!entry) return new Response("not found", { status: 404 });
      entry.formato160 = formato;
      entry.necesitaFormato160 = false;
      entry.formato160Elegido = new Date().toISOString();
      entry.mercanciaFabrica = textoConFormato160(entry.mercanciaFabrica, formato);
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, entry });
    }
    // Reserva de stock ya avisada al almacén (Jennifer, 2026-09-28): para no
    // mandar dos veces las etiquetas del mismo artículo.
    const reservaMatch = url.pathname.match(/^\/backorders\/([^/]+)\/reserva-enviada$/);
    if (reservaMatch && method === "POST") {
      const backorders = await this.load("backorders", []);
      const entry = backorders.find((b) => b.id === decodeURIComponent(reservaMatch[1]));
      if (!entry) return new Response("not found", { status: 404 });
      const { fecha } = await request.json().catch(() => ({}));
      // Historial de etiquetas de reserva (Jennifer, 2026-10-28, REPBEZEN12022:
      // una se mandó al reservar la unidad de stock y otra al llegar la de
      // fábrica): la anterior no se pierde.
      if (entry.reservaEnviada) entry.reservasAnteriores = [...(entry.reservasAnteriores || []), entry.reservaEnviada];
      entry.reservaEnviada = fecha && !isNaN(Date.parse(fecha)) ? new Date(fecha).toISOString() : new Date().toISOString();
      await this.state.storage.put("backorders", backorders);
      return Response.json(entry);
    }
    const mercanciaMatch = url.pathname.match(/^\/backorders\/([^/]+)\/mercancia$/);
    if (mercanciaMatch && method === "POST") {
      const { mercanciaFabrica } = await request.json();
      return this.setBackorderMercancia(decodeURIComponent(mercanciaMatch[1]), mercanciaFabrica);
    }
    if (url.pathname === "/process-sale" && method === "POST") {
      return this.processSale(await request.json());
    }

    // Pesos por SKU para el fichero de SEUR (Jennifer, 2026-09-08): valor
    // por defecto calculado del histórico (PESOS_SEUR_DEFAULT), corregible
    // a mano por SKU — la corrección manual siempre gana.
    if (url.pathname === "/pesos" && method === "GET") {
      const overrides = await this.load("pesosSeurOverrides", {});
      const skus = new Set([...Object.keys(PESOS_SEUR_DEFAULT), ...Object.keys(overrides)]);
      const lista = [...skus].sort().map((sku) => ({
        sku,
        peso: pesoSeurPorUnidad(sku, overrides),
        esManual: overrides[sku] != null,
      }));
      return Response.json(lista);
    }
    if (url.pathname === "/pesos/set" && method === "POST") {
      const { sku, peso } = await request.json();
      const overrides = await this.load("pesosSeurOverrides", {});
      if (peso == null || peso === "") delete overrides[sku];
      else overrides[sku] = Number(peso);
      await this.state.storage.put("pesosSeurOverrides", overrides);
      return Response.json({ ok: true, sku, peso: pesoSeurPorUnidad(sku, overrides) });
    }

    if (url.pathname === "/settle-shipment" && method === "POST") {
      return this.settleShipment(await request.json());
    }

    if (url.pathname === "/admin/reset-stock" && method === "POST") {
      return this.resetStock();
    }

    if (url.pathname === "/admin/clear-backorders" && method === "POST") {
      return this.clearBackorders();
    }

    // Corte con el sistema antiguo de referencias de Polival (Jennifer,
    // 2026-09-25): reinicia el correlativo a 0 para que el próximo pedido
    // que se procese saque "N001..." — no toca ningún pendiente ya creado
    // (esos se corrigen a mano por su propia id, ver /backorders/set-campo).
    if (url.pathname === "/admin/reset-polival-counter" && method === "POST") {
      await this.state.storage.put("polivalReferenciaCounter", 0);
      return Response.json({ ok: true });
    }

    // Fija el correlativo a un valor concreto (Jennifer, 2026-09-28): tras el
    // corte del 25/09 se renumeraron a mano N001..N010 pero el contador se
    // quedó en 0, y los pedidos nuevos volvieron a empezar por 001. El
    // próximo pedido saca valor+1.
    if (url.pathname === "/admin/set-polival-counter" && method === "POST") {
      const { valor } = await request.json();
      if (!Number.isInteger(valor) || valor < 0) return new Response("valor inválido", { status: 400 });
      await this.state.storage.put("polivalReferenciaCounter", valor);
      return Response.json({ ok: true, valor });
    }

    // Corrección puntual de un pendiente ya creado (Jennifer, 2026-09-25,
    // corte de numeración de Polival): permite fijar `referencia` y/o
    // `mercanciaFabrica` a mano por id, sin volver a pasar por el motor de
    // stock/agencia (evita duplicar backorders — pushBackorder no
    // sobreescribe uno con la misma id).
    if (url.pathname === "/backorders/pedido-stock" && method === "POST") {
      return this.crearPedidoStock(await request.json());
    }

    if (url.pathname === "/backorders/set-campo" && method === "POST") {
      const { id, referencia, mercanciaFabrica, tapaStock, estado, recibidoFabrica, revision, cuarentena, previsionEntrega, cantidad, enStock, refSuffix, desdeStock, serviciosReposicion, paraTenerEnCuenta, color, cambioColorUsuario, nacex, desdeDevolucion, devolucionFabrica, mercanciaCliente, talla, proveedor, recogidaQue } = await request.json();
      const backorders = await this.load("backorders", []);
      const entry = backorders.find((b) => b.id === id);
      if (!entry) return new Response("not found", { status: 404 });
      // Qué hay que recoger en un colchón con recogida (Jennifer, 2026-11-12):
      // puede no ser lo que se repone (se envió mal).
      if (recogidaQue !== undefined) entry.recogidaQue = String(recogidaQue || "").trim() || null;
      // Proveedor a mano de UN pendiente (Jennifer, 2026-11-05: 3 Generación
      // Zen de LUSO pasan a NEW). No toca la ficha ni el stock.
      if (proveedor !== undefined && String(proveedor).trim()) entry.proveedor = String(proveedor).trim().toUpperCase();
      // Medida a mano (Jennifer, 2026-11-05, BEZEN12344: almohadas Nordic
      // 67,5 → 75; el 📏 solo admite medidas de cama tipo 150X190).
      if (talla !== undefined && String(talla).trim()) entry.talla = String(talla).trim().toUpperCase();
      // Corrección a mano del estado (Jennifer, 2026-09-30: cabeceros dados
      // por servidos sin haber salido).
      if (estado !== undefined && ["pendiente", "cubierto", "servido"].includes(estado)) entry.estado = estado;
      if (recibidoFabrica !== undefined) entry.recibidoFabrica = !!recibidoFabrica;
      // Corrección a mano de unidades (Jennifer, 2026-10-07, BEZEN12022): no
      // toca el stock, solo el pendiente.
      if (cantidad !== undefined && Number(cantidad) >= 1) entry.cantidad = Math.floor(Number(cantidad));
      if (enStock !== undefined) entry.enStock = Math.max(0, Math.floor(Number(enStock) || 0)) || undefined;
      // "Pendiente de revisión antes de pedir" (Jennifer, 2026-10-01: pedidos
      // de Maison du Monde que entraron con un precio incorrecto, a la
      // espera de que el cliente pague la diferencia): { motivo } o null.
      if (revision !== undefined) entry.revision = revision ? { motivo: String(revision.motivo || ""), desde: new Date().toISOString() } : null;
      // Cuarentena (Jennifer, 2026-10-13): el cliente avisa de que quizá
      // cancela. Sigue en la lista del proveedor, marcado, y no se puede
      // pedir a fábrica hasta quitarlo. { motivo, usuario } o null.
      if (cuarentena !== undefined) entry.cuarentena = cuarentena ? { motivo: String(cuarentena.motivo || ""), usuario: cuarentena.usuario || null, desde: new Date().toISOString() } : null;
      // Colchón asignado desde una devolución (Jennifer, 2026-10-28): { ref, fecha, usuario }.
      if (desdeDevolucion !== undefined) entry.desdeDevolucion = desdeDevolucion ? { ref: String(desdeDevolucion.ref || ""), fecha: desdeDevolucion.fecha || new Date().toISOString(), usuario: desdeDevolucion.usuario || null } : null;
      // Devolución a fábrica de la pieza dañada de una reposición (Jennifer,
      // 2026-10-28): { estado, nota, fecha, usuario, historial } o null.
      if (devolucionFabrica !== undefined) entry.devolucionFabrica = devolucionFabrica && typeof devolucionFabrica === "object" ? devolucionFabrica : null;
      // ¿Tiene el cliente la mercancía en casa? (Jennifer, 2026-10-28): "en-casa" | "juntar" (va con BIS y se junta con el resto del pedido).
      if (mercanciaCliente !== undefined) entry.mercanciaCliente = ["en-casa", "juntar"].includes(mercanciaCliente) ? mercanciaCliente : null;
      // Sufijo de la referencia de SEUR a mano (Jennifer, 2026-10-15,
      // 002-26246L38546-A: la "-A2" ya se usó y se anuló en SEUR).
      if (refSuffix !== undefined) entry.refSuffix = String(refSuffix || "");
      // Sale del stock del almacén aunque el pendiente sea de proveedor: en
      // el listado de la carga de SEUR sale como STOCK.
      if (desdeStock !== undefined) entry.desdeStock = !!desdeStock;
      // "Pedidos para tener en cuenta" también para reposiciones / envíos
      // aparte (Jennifer, 2026-10-21, REP10002269275-A).
      if (paraTenerEnCuenta !== undefined) entry.paraTenerEnCuenta = !!paraTenerEnCuenta;
      // Color de las etiquetas de Furniture a mano (Jennifer, 2026-10-21,
      // REP BEZEN11905: reposición, que no pasa por el botón 🎨). Queda
      // apuntado como cambio de color del cliente.
      if (color !== undefined && String(color).trim() && String(color).trim() !== (entry.color || "")) {
        entry.cambioColor = { de: (entry.cambioColor && entry.cambioColor.de) || entry.color || "", a: String(color).trim(), fabrica: null, fecha: new Date().toISOString(), usuario: cambioColorUsuario || null };
        entry.color = String(color).trim();
      }
      if (referencia !== undefined) entry.referencia = referencia;
      if (mercanciaFabrica !== undefined) entry.mercanciaFabrica = mercanciaFabrica;
      // Tapa del canapé que ya está en el almacén (Jennifer, 2026-09-30,
      // BEZEN12211): la TAPA sale con referencia "STOCK" en Furniture y el
      // resto de piezas con la referencia nueva de Polival.
      if (tapaStock !== undefined) entry.tapaStock = !!tapaStock;
      // Servicios adicionales de una reposición por Furniture (2026-10-20).
      if (serviciosReposicion !== undefined) entry.serviciosReposicion = Array.isArray(serviciosReposicion) ? serviciosReposicion.map((s) => String(s || "").trim()).filter(Boolean) : [];
      // Previsión de entrega del proveedor (Jennifer, 2026-10-02), solo
      // informativa: a diferencia de fechaEstimadaLlegada no cambia FUR/FPK.
      if (previsionEntrega !== undefined) entry.previsionEntrega = previsionEntrega || null;
      // Envío por NACEX (Jennifer, 2026-10-28): { documentado, threadId,
      // direccion, recogida, expedicion, enviado } — se van sumando campos.
      if (nacex && typeof nacex === "object") entry.nacex = { ...(entry.nacex || {}), ...nacex };
      await this.state.storage.put("backorders", backorders);
      return Response.json(entry);
    }

    // Cambiar de carga de SEUR un colchón ya preparado (Jennifer, 2026-09-30).
    if (url.pathname === "/backorders/cambiar-medida" && method === "POST") {
      return this.cambiarMedidaPedido(await request.json());
    }
    if (url.pathname === "/backorders/cambiar-color" && method === "POST") {
      return this.cambiarColorPedido(await request.json());
    }

    if (url.pathname === "/backorders/set-carga" && method === "POST") {
      const { id, cargaId, retenido } = await request.json();
      const backorders = await this.load("backorders", []);
      const entry = backorders.find((b) => b.id === id);
      if (!entry) return Response.json({ ok: false, error: "Artículo no encontrado." }, { status: 404 });
      entry.cargaId = cargaId;
      // Con día ya puesto deja de estar retenido (Jennifer, 2026-10-22).
      if (cargaId) delete entry.retenidoCliente;
      // Sacado de la carga a la espera de que el cliente diga la fecha
      // (Jennifer, 2026-10-28): pasa a Retenidos sin fecha.
      else if (retenido && entry.estado === "listo-seur") entry.retenidoCliente = true;
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, backorder: entry });
    }

    // Pendiente de Polival para un artículo sin ficha en el Catálogo (Jennifer,
    // 2026-10-16: colchón PLANET 20 cm sin visco de los ECO-NATURE de
    // Groupon). Referencia N<nº>FUR del contador normal; no toca stock.
    // Bloquear los pendientes vivos de un pedido hasta que se conteste su
    // campana (needsDecision + pendingDecision: salen en "Pendiente de
    // decisión", no en la carpeta del proveedor).
    if (url.pathname === "/admin/bloquear-decision" && method === "POST") {
      const { orderId } = await request.json();
      const backorders = await this.load("backorders", []);
      let n = 0;
      for (const b of backorders) {
        if (b.orderId !== orderId || !["pendiente", "cubierto"].includes(b.estado)) continue;
        b.needsDecision = true;
        b.pendingDecision = true;
        n++;
      }
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, bloqueados: n });
    }
    if (url.pathname === "/admin/crear-pendiente-polival" && method === "POST") {
      const { orderId, orderNumber, platform, orderRef, orderDate, stockModel, talla, cantidad, mercanciaFabrica, tipo } = await request.json();
      if (!orderId || !stockModel || !talla) return Response.json({ ok: false, error: "Faltan datos." }, { status: 400 });
      const backorders = await this.load("backorders", []);
      const id = `${orderId}-${stockKey(stockModel, talla)}`;
      if (backorders.some((b) => b.id === id)) return Response.json({ ok: true, yaExistia: true, id });
      const { referencia } = buildReferencia(await nextReferenciaNumero(this.state), "fur", "", true);
      pushBackorder(backorders, { id, orderId, orderNumber, stockModel, talla, tipo: tipo || "colchon", cantidad: cantidad || 1, orderDate, esPack: false, proveedor: "POLIVAL", referencia, mercanciaFabrica, platform, orderRef, refSuffix: "", tipoEnvio: "FUR" });
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, id, referencia });
    }
    if (url.pathname === "/admin/renombrar-pedido" && method === "POST") {
      const { cambios } = await request.json();
      const backorders = await this.load("backorders", []);
      const movements = await this.load("movements", []);
      let n = 0;
      for (const { from, to, orderRef, orderNumber } of cambios || []) {
        for (const b of backorders) {
          if (b.orderId !== from) continue;
          b.orderId = to;
          b.id = String(b.id).split(from).join(to);
          b.orderRef = orderRef;
          b.orderNumber = orderNumber;
          n++;
        }
        for (const m of movements) if (m.orderId === from) { m.orderId = to; if (m.orderRef !== undefined) m.orderRef = orderRef; }
      }
      await this.state.storage.put("backorders", backorders);
      await this.state.storage.put("movements", movements);
      return Response.json({ ok: true, pendientes: n });
    }
    if (url.pathname === "/admin/crear-pendiente-manual" && method === "POST") {
      return this.crearPendienteManual(await request.json());
    }

    // Corregir modelo/medida de un pendiente mal emparejado (Jennifer,
    // 2026-10-05: Bambú Deluxe entraba como "LIQUIDACIÓN" y 140X190 como
    // 40X190, por el código COLBAMDL1 de la ficha de liquidación). Conserva
    // el resto del pendiente (pedido a fábrica, recibido...) y pasa su
    // "vendido pendiente" de la fila de stock vieja a la nueva.
    if (url.pathname === "/admin/corregir-modelo-pendiente" && method === "POST") {
      const { id, stockModel, talla } = await request.json();
      const backorders = await this.load("backorders", []);
      const b = backorders.find((x) => x.id === id);
      if (!b || !stockModel || !talla) return Response.json({ ok: false, error: "Pendiente no encontrado o faltan stockModel/talla." }, { status: 400 });
      const oldKey = stockKey(b.stockModel, b.talla);
      const newKey = stockKey(stockModel, talla);
      const nuevoId = b.id.split(b.stockModel + "|" + b.talla).join(newKey);
      if (nuevoId !== b.id && backorders.some((x) => x.id === nuevoId)) return Response.json({ ok: false, error: "Ya existe un pendiente " + nuevoId }, { status: 409 });
      const stock = await this.load("stock", {});
      if (b.estado === "pendiente" && !b.paraStock && oldKey !== newKey) {
        if (stock[oldKey]) stock[oldKey].vendidoPendiente = Math.max(0, (stock[oldKey].vendidoPendiente || 0) - b.cantidad);
        const row = stock[newKey] || { stockModel, talla, cantidad: 0, vendidoPendiente: 0 };
        row.vendidoPendiente = (row.vendidoPendiente || 0) + b.cantidad;
        stock[newKey] = row;
        await this.state.storage.put("stock", stock);
      }
      b.id = nuevoId;
      b.stockModel = stockModel;
      b.talla = talla;
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, entry: b });
    }

    // Congelado de stock (Jennifer, 2026-09-23) — ver comentario en
    // applyStockUsage. No expuesto en UI a propósito, solo por API,
    // Jennifer avisa cuándo activar/desactivar.
    if (url.pathname === "/admin/congelar-stock" && method === "POST") {
      await this.state.storage.put("stockCongelado", true);
      return Response.json({ ok: true, stockCongelado: true });
    }
    if (url.pathname === "/admin/descongelar-stock" && method === "POST") {
      await this.state.storage.put("stockCongelado", false);
      return Response.json({ ok: true, stockCongelado: false });
    }
    if (url.pathname === "/admin/stock-congelado" && method === "GET") {
      return Response.json({ stockCongelado: await this.load("stockCongelado", false) });
    }

    if (url.pathname === "/admin/backfill-proveedor" && method === "POST") {
      return this.backfillProveedor();
    }

    if (url.pathname === "/admin/add-item-to-order" && method === "POST") {
      return this.addItemToProcessedOrder(await request.json());
    }

    if (url.pathname === "/admin/reposicion" && method === "POST") {
      return this.crearReposicion(await request.json());
    }

    // Partes de un pack para elegir cuál se repone (Jennifer, 2026-10-14).
    if (url.pathname === "/admin/reposicion/componentes" && method === "POST") {
      const { item } = await request.json();
      const r = resolveItem(item, await this.load("products", {}));
      if (r.tipo !== "pack") return Response.json({ ok: true, componentes: [] });
      return Response.json({ ok: true, componentes: r.componentes.map((c, idx) => ({ idx, nombre: c.product ? [c.product.stockModel, c.talla, c.color].filter(Boolean).join(" · ") : null })).filter((c) => c.nombre) });
    }
    if (url.pathname === "/admin/reposicion/preview" && method === "POST") {
      return this.resolverItemPreview(await request.json());
    }

    if (url.pathname === "/admin/reposicion/foto" && method === "POST") {
      return this.adjuntarFotoReposicion(await request.json());
    }

    // Carga de Furniture independiente para una reposición (Jennifer,
    // 2026-09-21: "tengo que poder sacarlo de manera independiente") — usa
    // backorder.cargaId (ya existía, mismo campo que usa SEUR para sus
    // propias cargas), NUNCA order.cargaId, para no atarla al estado de
    // envío del resto del pedido original.
    // "Enviar aparte" en Furniture (Jennifer, 2026-09-29): un artículo de un
    // pedido (ej. el cabecero) se separa del resto y sale más tarde como
    // línea propia con la referencia del pedido terminada en 2 — mismo
    // mecanismo que las reposiciones (su propia carga, backorder.cargaId).
    // aparte:false lo vuelve a juntar con el pedido.
    const envioAparteMatch = url.pathname.match(/^\/backorders\/([^/]+)\/envio-aparte$/);
    if (envioAparteMatch && method === "POST") {
      const { aparte } = await request.json();
      const backorders = await this.load("backorders", []);
      const b = backorders.find((x) => x.id === decodeURIComponent(envioAparteMatch[1]));
      if (!b) return Response.json({ ok: false, error: "Artículo no encontrado." }, { status: 404 });
      if (b.reposicion || b.gestoComercial) return Response.json({ ok: false, error: "Las reposiciones y gestos comerciales ya van aparte." }, { status: 409 });
      if (aparte && !b.envioAparte) {
        b.refSuffixAntesAparte = b.refSuffix || "";
        b.refSuffix = nextRefSuffix(b.refSuffix);
        b.envioAparte = true;
        b.cargaId = null;
      } else if (!aparte && b.envioAparte) {
        b.envioAparte = false;
        b.refSuffix = b.refSuffixAntesAparte || "";
        b.cargaId = null;
      }
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, entry: b });
    }

    if (url.pathname === "/admin/reposicion/carga-add" && method === "POST") {
      const { id, cargaId } = await request.json();
      const backorders = await this.load("backorders", []);
      const b = backorders.find((x) => x.id === id);
      if (!b) return Response.json({ ok: false, error: "Reposición no encontrada." }, { status: 404 });
      if (b.cargaId) return Response.json({ ok: false, error: "Ya está en una carga." }, { status: 400 });
      b.cargaId = cargaId;
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true });
    }

    if (url.pathname === "/admin/reposicion/carga-remove" && method === "POST") {
      const { id } = await request.json();
      const backorders = await this.load("backorders", []);
      const b = backorders.find((x) => x.id === id);
      if (!b) return Response.json({ ok: false, error: "Reposición no encontrada." }, { status: 404 });
      b.cargaId = null;
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true });
    }

    // El gesto comercial (almohada) sale por SEUR, no por Furniture
    // (Jennifer, 2026-09-22) — nace "pendiente" en Proveedores > Polival y
    // usa el mismo /backorders/:id/resolver-seur que ya usan los colchones
    // sueltos (ver resolveSeurBackorder más abajo), así que no necesita
    // rutas propias de carga.
    if (url.pathname === "/admin/gesto-comercial" && method === "POST") {
      return this.crearGestoComercial(await request.json());
    }

    // TARIFAS (Jennifer, 2026-09-22) — ver setTarifaCoste/setTarifaEnvio/
    // setTarifaPeriodoActivo/getTarifaTabla más arriba en la clase.
    if (url.pathname === "/tarifas/coste" && method === "POST") {
      return this.setTarifaCoste(await request.json());
    }
    if (url.pathname === "/tarifas/envios-piezas" && method === "POST") {
      return this.enviosDePiezas((await request.json()).piezas);
    }
    if (url.pathname === "/tarifas/envio-historial" && method === "GET") {
      return Response.json(await this.load("tarifasEnvioHistorial", []));
    }
    if (url.pathname === "/tarifas/envio-deshacer" && method === "POST") {
      return this.deshacerCambioEnvio(await request.json());
    }
    if (url.pathname === "/tarifas/envio" && method === "POST") {
      return this.setTarifaEnvio(await request.json());
    }
    if (url.pathname === "/tarifas/periodo-activo" && method === "POST") {
      return this.setTarifaPeriodoActivo(await request.json());
    }
    // Coste de tarifa vigente por modelo+medida (Jennifer, 2026-09-30: "al
    // lado de los pedidos de proveedores me pongas el importe que tiene cada
    // colchón con la tarifa del proveedor"). { items: [{ stockModel, talla }] }
    if (url.pathname === "/tarifas/costes" && method === "POST") {
      const { items } = await request.json();
      const vistos = new Map();
      for (const it of items || []) {
        const k = it.stockModel + "|" + it.talla;
        if (vistos.has(k)) continue;
        const t = await this.calcularTarifaModelo(it.stockModel, it.talla);
        vistos.set(k, { stockModel: it.stockModel, talla: it.talla, coste: t.coste ?? null, sustituto: t.costeSustituto || null, proveedor: t.costeProveedor || null, periodo: t.costePeriodo || null });
      }
      return Response.json({ ok: true, costes: [...vistos.values()] });
    }
    // PRECIOS BEZEN (Jennifer, 2026-10-15): histórico de los precios de la
    // web, comparados con el precio BEZEN de Tarifas.
    if (url.pathname === "/precios-bezen/subidas" && method === "GET") {
      return Response.json(await this.load("preciosBezenIndex", []));
    }
    if (url.pathname === "/precios-bezen/subir" && method === "POST") {
      return this.subirPreciosBezen(await request.json());
    }
    if (url.pathname === "/margen-pedidos" && method === "POST") {
      const { pedidos } = await request.json();
      return this.margenPedidos(pedidos);
    }
    if (url.pathname === "/precios-bezen/ver" && method === "GET") {
      return this.verPreciosBezen(url.searchParams.get("id"));
    }
    if (url.pathname === "/precios-bezen/precio-nuevo" && method === "POST") {
      const { id, cambios, usuario, campo } = await request.json();
      // "black2026": Precios BLACK 2026, por SKU para todas las subidas.
      const prefijo = campo === "black2026" ? "preciosBezenBlack2026:" : "preciosBezenNuevo:" + id + ":";
      const index = await this.load("preciosBezenIndex", []);
      if (!index.some((s) => s.id === id)) return Response.json({ ok: false, error: "Subida no encontrada." }, { status: 404 });
      const ahora = new Date().toISOString();
      const puts = {};
      const borrar = [];
      for (const c of cambios || []) {
        if (!c.sku) continue;
        const key = prefijo + c.sku;
        const n = c.precio === null || c.precio === "" || c.precio === undefined ? null : Number(c.precio);
        if (n === null) borrar.push(key);
        else if (Number.isFinite(n) && n >= 0) puts[key] = { precio: Math.round(n * 100) / 100, fecha: ahora, usuario: usuario || null };
      }
      const claves = Object.keys(puts);
      for (let i = 0; i < claves.length; i += 100) await this.state.storage.put(Object.fromEntries(claves.slice(i, i + 100).map((k) => [k, puts[k]])));
      for (let i = 0; i < borrar.length; i += 100) await this.state.storage.delete(borrar.slice(i, i + 100));
      return Response.json({ ok: true, guardados: claves.length, borrados: borrar.length });
    }
    // PRECIOS FIJOS (Jennifer, 2026-10-15): la subida del 15/10 queda como
    // precio de referencia desde el que trabajar. No se puede borrar ni la
    // sustituye ninguna subida posterior (cada subida se guarda aparte).
    // Añadir filas que faltaban a una subida (Jennifer, 2026-10-21: las 80
    // variantes de tela del Initial no vinieron en el Excel del 15/10). Solo
    // SKU que no estén ya; van en trozos nuevos al final.
    if (url.pathname === "/precios-bezen/anadir-filas" && method === "POST") {
      const { id, filas } = await request.json();
      const index = await this.load("preciosBezenIndex", []);
      const s = index.find((x) => x.id === id);
      if (!s) return Response.json({ ok: false, error: "Subida no encontrada." }, { status: 404 });
      const ya = new Set((await this.leerSubidaPreciosBezen(s)).map((f) => String(f[2] || "").toUpperCase()).filter(Boolean));
      const nuevas = (filas || []).map((f) => [String(f[0] || "").trim(), String(f[1] || "").trim(), String(f[2] || "").trim(), f[3] === "" || f[3] == null ? null : Number(f[3])])
        .filter((f) => f[2] && !ya.has(f[2].toUpperCase()));
      for (let i = 0; i < nuevas.length; i += 300) {
        await this.state.storage.put("preciosBezen:" + s.id + ":" + s.chunks, nuevas.slice(i, i + 300));
        s.chunks++;
      }
      s.filas += nuevas.length;
      await this.state.storage.put("preciosBezenIndex", index);
      return Response.json({ ok: true, anadidas: nuevas.length, yaEstaban: (filas || []).length - nuevas.length });
    }
    if (url.pathname === "/precios-bezen/fijar" && method === "POST") {
      const { id, usuario } = await request.json();
      const index = await this.load("preciosBezenIndex", []);
      const s = index.find((x) => x.id === id);
      if (!s) return Response.json({ ok: false, error: "Subida no encontrada." }, { status: 404 });
      if (index.some((x) => x.fija && x.id !== id)) return Response.json({ ok: false, error: "Ya hay otra subida de precios fijos." }, { status: 409 });
      s.fija = true; s.fijadaEn = new Date().toISOString(); s.fijadaPor = usuario || null;
      await this.state.storage.put("preciosBezenIndex", index);
      return Response.json({ ok: true, subida: s });
    }
    if (url.pathname === "/precios-bezen/borrar" && method === "POST") {
      const { id } = await request.json();
      const index = await this.load("preciosBezenIndex", []);
      const s = index.find((x) => x.id === id);
      if (!s) return Response.json({ ok: false, error: "Subida no encontrada." }, { status: 404 });
      if (s.fija) return Response.json({ ok: false, error: "Son los precios fijos: no se pueden borrar." }, { status: 409 });
      const claves = [...Array(s.chunks).keys()].map((i) => "preciosBezen:" + id + ":" + i);
      claves.push(...(await this.state.storage.list({ prefix: "preciosBezenNuevo:" + id + ":" })).keys());
      for (let i = 0; i < claves.length; i += 100) await this.state.storage.delete(claves.slice(i, i + 100));
      await this.state.storage.put("preciosBezenIndex", index.filter((x) => x.id !== id));
      return Response.json({ ok: true });
    }
    // Nombre de fábrica de cada producto (Jennifer, 2026-10-20: "una
    // correlación entre el nombre que le damos en la web con el nombre de
    // fábrica", p. ej. este canapé en fábrica es CANAPÉ SPACE).
    if (url.pathname === "/tarifas/nombres-fabrica" && method === "GET") {
      const products = await this.load("products", {});
      const out = {};
      for (const p of activeProducts(products)) {
        const n = nombreFabricaProducto(p);
        if (n && !out[p.stockModel]) out[p.stockModel] = n;
      }
      for (const p of TARIFA_PRODUCTOS_SOLO_TARIFAS) out[p.stockModel] = p.nombreFabrica;
      return Response.json(out);
    }
    if (url.pathname === "/tarifas/modelos-extra" && method === "GET") {
      return Response.json(TARIFA_PRODUCTOS_SOLO_TARIFAS);
    }
    if (url.pathname === "/tarifas/tabla" && method === "GET") {
      return this.getTarifaTabla(url.searchParams.get("stockModel"));
    }
    // Migración puntual (2026-09-24): al fusionar el 23/09 las dos fichas
    // duplicadas de Zen Mandala en Shopify bajo un único stockModel nuevo
    // ("...| para alojamiento"), los precios de coste/envío ya cargados de
    // Tarifas se quedaron huérfanos bajo el stockModel ANTIGUO (con pipes,
    // sin "para alojamiento") — Jennifer: "no se muestran los precios del
    // modelo Zen Mandala". Renombra la clave en tarifasCoste/tarifasEnvio
    // sin perder los datos ya cargados. No expuesta en la UI.
    // Corrige el nombre de fichero ya guardado de un plazo (Jennifer,
    // 2026-09-24: "quiero cambiar el nombre, y que solo aparezca
    // MARKETPLACE-PLAZOS") — el nuevo nombre por defecto (ver
    // cargarPlazosMarketplace) solo aplica a la próxima vez que se cargue
    // el listado; esto corrige el ya guardado sin tener que recargarlo. No
    // expuesto en la UI.
    if (url.pathname === "/admin/renombrar-fichero-plazo" && method === "POST") {
      const { plazo, filename } = await request.json();
      if (!plazo || !filename) return Response.json({ ok: false, error: "Faltan plazo/filename." }, { status: 400 });
      const todos = await this.load("plazosExportaciones", {});
      if (!todos[plazo]) return Response.json({ ok: false, error: "No existe ese plazo." }, { status: 404 });
      todos[plazo].filename = filename;
      await this.state.storage.put("plazosExportaciones", todos);
      return Response.json({ ok: true });
    }

    if (url.pathname === "/admin/renombrar-stockmodel-tarifa" && method === "POST") {
      const { desde, hasta } = await request.json();
      if (!desde || !hasta) return Response.json({ ok: false, error: "Faltan desde/hasta." }, { status: 400 });
      let cambios = 0;
      const tarifasCoste = await this.load("tarifasCoste", {});
      for (const periodos of Object.values(tarifasCoste)) {
        for (const data of Object.values(periodos)) {
          if (data.precios && data.precios[desde] && !data.precios[hasta]) {
            data.precios[hasta] = data.precios[desde];
            delete data.precios[desde];
            cambios++;
          }
        }
      }
      await this.state.storage.put("tarifasCoste", tarifasCoste);
      const tarifasEnvio = await this.load("tarifasEnvio", {});
      let envioCambiado = false;
      if (tarifasEnvio[desde] && !tarifasEnvio[hasta]) {
        tarifasEnvio[hasta] = tarifasEnvio[desde];
        delete tarifasEnvio[desde];
        envioCambiado = true;
      }
      await this.state.storage.put("tarifasEnvio", tarifasEnvio);
      // Las filas ya cargadas de "Ficheros plataformas" y "Plazos de
      // entrega" guardan su propio `stockModel` por fila (fijado al
      // cargarlas) — si no se renombra aquí también, esas filas se quedan
      // buscando coste/stock bajo el nombre viejo silenciosamente (precio
      // congelado marcado en amarillo, o "sin stock" incorrecto en Plazos),
      // sin ningún error visible.
      let filasPlataforma = 0;
      const plataformaExportaciones = await this.load("plataformaExportaciones", {});
      for (const cfg of Object.values(plataformaExportaciones)) {
        for (const fila of cfg.filas || []) {
          if (fila.stockModel === desde) { fila.stockModel = hasta; filasPlataforma++; }
        }
      }
      await this.state.storage.put("plataformaExportaciones", plataformaExportaciones);
      let filasPlazos = 0;
      const plazosExportaciones = await this.load("plazosExportaciones", {});
      for (const cfg of Object.values(plazosExportaciones)) {
        for (const fila of cfg.filas || []) {
          if (fila.stockModel === desde) { fila.stockModel = hasta; filasPlazos++; }
        }
      }
      await this.state.storage.put("plazosExportaciones", plazosExportaciones);
      // Pendientes (backorders) ya creados con el `stockModel` viejo (caso
      // real 2026-09-25: Paris/Zen Mandala "para alojamiento" — el Catálogo
      // se corrigió el 24/09 para que esa ficha comparta el stockModel
      // limpio con su gemela normal, pero los pendientes que YA existían de
      // antes guardaron su propia copia del stockModel viejo al crearse y
      // se quedaron huérfanos: no se fusionan con "Paris"/"Mandala" en
      // pantalla y `skuDePendiente` no encuentra ficha con ese stockModel
      // exacto, así que muestra el SKU como "—"). Sin esto, cualquier
      // renombrado de stockModel deja pendientes antiguos rotos en
      // silencio, igual que ya pasaba con Tarifas/Plazos.
      let pendientesRenombrados = 0;
      const backorders = await this.load("backorders", []);
      for (const b of backorders) {
        if (b.stockModel === desde) { b.stockModel = hasta; pendientesRenombrados++; }
      }
      if (pendientesRenombrados) await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, cambiosCoste: cambios, envioCambiado, filasPlataforma, filasPlazos, pendientesRenombrados });
    }

    // Exportación de precios a plataforma (Jennifer, 2026-09-23): el
    // listado de SKU/columna se guarda una vez (cargarPlataformaExport) y
    // el .xlsx se regenera en caliente con los precios actuales cada vez
    // que se pide (exportarPlataforma) — así ella siempre descarga el
    // fichero al día, sin que nadie tenga que volver a subir nada a mano.
    if (url.pathname === "/tarifas/plataforma/cargar" && method === "POST") {
      return this.cargarPlataformaExport(await request.json());
    }
    const exportMatch = url.pathname.match(/^\/tarifas\/plataforma\/([^/]+)\/export$/);
    if (exportMatch && method === "GET") {
      return this.exportarPlataforma(decodeURIComponent(exportMatch[1]));
    }
    if (url.pathname === "/tarifas/plataforma/listar" && method === "GET") {
      return this.listarPlataformasExport();
    }
    // Ficheros plataformas COMPLETOS por cliente (Jennifer, 2026-11-04) —
    // ver ficheros-completos.js.
    const fcMatch = url.pathname.match(/^\/fichero-completo\/([A-Z_]+)(\/cargar|\/csv)?$/);
    if (fcMatch) {
      const cliente = fcMatch[1];
      if (!CLIENTES_FICHERO_COMPLETO[cliente]) return Response.json({ ok: false, error: "Cliente no configurado." }, { status: 404 });
      if (!fcMatch[2] && method === "GET") return this.verFicheroCompleto(cliente);
      if (fcMatch[2] === "/cargar" && method === "POST") return this.cargarFicheroCompleto(cliente, await request.json());
      if (fcMatch[2] === "/csv" && method === "GET") return this.csvFicheroCompleto(cliente, url.searchParams.get("usuario"));
    }

    // Tarifa REFORMAN (Jennifer, 2026-11-17) — ver reforman.js.
    if (url.pathname === "/reforman" && method === "GET") return this.verReforman();
    if (url.pathname === "/reforman/cargar" && method === "POST") return this.cargarReforman(await request.json());
    if (url.pathname === "/reforman/descargado" && method === "POST") return this.reformanDescargado(await request.json());

    // Plazos de entrega > Marketplace (Jennifer, 2026-09-23) — ver
    // cargarPlazosMarketplace/exportarPlazosMarketplace más abajo.
    if (url.pathname === "/plazos/marketplace/cargar" && method === "POST") {
      return this.cargarPlazosMarketplace(await request.json());
    }
    if (url.pathname === "/plazos/marketplace/export" && method === "GET") {
      return this.exportarPlazosMarketplace();
    }
    // Solo lectura: el listado guardado (modelo, SKU, stockModel, talla, tipo).
    if (url.pathname === "/plazos/marketplace/filas" && method === "GET") {
      const todos = await this.load("plazosExportaciones", {});
      return Response.json({ ok: true, filas: (todos.MARKETPLACE && todos.MARKETPLACE.filas) || [] });
    }
    if (url.pathname === "/plazos/listar" && method === "GET") {
      return this.listarPlazos();
    }

    if (url.pathname === "/admin/backfill-pending-decision" && method === "POST") {
      return this.backfillPendingDecision();
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
      // Igual que con el SKU: se recalcula el proveedor por defecto salvo
      // que Jennifer lo haya corregido a mano en Catálogo.
      if (!entry.proveedorManual) entry.proveedor = defaultProveedor(sp.product_type, entry.stockModel);
      if (!entry.referenciaTipoManual) entry.referenciaTipo = defaultReferenciaTipo(sp.product_type, entry.title);
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

  async updateFlags({ productId, exceptionFurniture, noStock, excluido, stockModel, skuPrefix, altSkuPrefixes, altTitleKeywords, proveedor, referenciaTipo }) {
    const products = await this.load("products", {});
    const entry = products[productId];
    if (!entry) return new Response("not found", { status: 404 });

    const oldStockModel = entry.stockModel;
    const wasNoStock = entry.noStock;
    if (exceptionFurniture !== undefined) entry.exceptionFurniture = !!exceptionFurniture;
    if (noStock !== undefined) entry.noStock = !!noStock;
    // "Excluido" (Jennifer, 2026-09-24): para fichas duplicadas de Shopify
    // (ej. la variante "para alojamiento" de Paris/Zen Mandala) que no se
    // quieren borrar de Shopify pero que no deben participar nunca en
    // búsquedas por nombre/SKU/Tarifas — evita que un mismo modelo físico
    // con dos fichas siga dando problemas de coincidencia ambigua o de
    // precios huérfanos como ya ha pasado dos veces. Reversible (checkbox).
    if (excluido !== undefined) entry.excluido = !!excluido;
    if (stockModel !== undefined && stockModel.trim()) entry.stockModel = stockModel.trim();
    if (skuPrefix !== undefined && skuPrefix.trim()) {
      entry.skuPrefix = skuPrefix.trim();
      entry.skuPrefixManual = true;
    }
    if (proveedor !== undefined) {
      entry.proveedor = proveedor || null;
      entry.proveedorManual = true;
    }
    if (referenciaTipo !== undefined) {
      entry.referenciaTipo = referenciaTipo || null;
      entry.referenciaTipoManual = true;
    }
    if (altSkuPrefixes !== undefined) {
      entry.altSkuPrefixes = altSkuPrefixes
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    }
    // Alias de nombre libre (Jennifer, 2026-09-19, al conectar Worten): a
    // diferencia de altSkuPrefixes (código de SKU), esto es para cuando el
    // marketplace no manda ningún código útil y hay que reconocer el
    // pedido por el texto del producto en portugués/otro idioma, que no
    // siempre coincide con el nombre real del catálogo (ver
    // findByTitleFallback en index.js) — ej. Worten dice "Extrasuave" para
    // lo que aquí es "Toscana Deluxe".
    if (altTitleKeywords !== undefined) {
      entry.altTitleKeywords = altTitleKeywords
        .split(",")
        .map((s) => s.trim())
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
  async applyStockUsage(stock, backorders, item, orderId, orderNumber, esPack, orderDate, proveedor, needsDecision, refSuffix, platform, orderRef, agencia) {
    // Congelado de stock (Jennifer, 2026-09-23): "vamos a dar de alta las
    // unidades... pero no quiero que se descuente nada por ahora, yo te
    // voy a decir en qué momento vas a empezar a descontar". Mientras
    // `stockCongelado` esté activo, la decisión de agencia/pendientes
    // sigue funcionando exactamente igual (lee `cantidad` normal), lo
    // único que cambia es que `cantidad` nunca baja de verdad.
    const congelado = await this.load("stockCongelado", false);
    const key = stockKey(item.product.stockModel, item.talla);
    const row = stock[key] || { stockModel: item.product.stockModel, talla: item.talla, cantidad: 0, vendidoPendiente: 0 };
    const covered = Math.min(row.cantidad, item.qty);
    if (!congelado) row.cantidad -= covered;
    if (covered > 0) {
      if (!congelado) {
        await this.logMovement({
          stockModel: item.product.stockModel,
          talla: item.talla,
          campo: "cantidad",
          delta: -covered,
          resultante: row.cantidad,
          origen: "venta",
          orderNumber,
          platform,
          orderRef,
        });
      }
      // Se registra siempre el desglose de lo que ya había en stock (no
      // solo para Furniture, ver Jennifer 2026-08-26) — Furniture lo
      // necesita para ver el pedido completo, y desde 2026-09-08 el fichero
      // de exportación de SEUR también lo usa para saber qué colchones
      // concretos (SKU/talla/cantidad) van en cada carga.
      pushBackorder(backorders, {
        id: `${orderId}-${key}-cubierto`,
        orderId,
        orderNumber,
        stockModel: item.product.stockModel,
        talla: item.talla,
        color: item.color,
        tipo: item.tipo,
        cantidad: covered,
        orderDate,
        esPack,
        proveedor,
        estado: "cubierto",
        recibidoFabrica: true,
        // Colchón que sale de stock en un pedido de Furniture (Jennifer,
        // 2026-10-06, BEZEN12286): ya está descontado y reservado en el
        // almacén, sale con la tapicería — nunca FPK ni Luso/New.
        tipoEnvio: item.tipo === "colchon" && (agencia === "FURNITURE" || esPack) ? "FUR" : undefined,
        platform,
        orderRef,
      });
    }
    const falta = item.qty - covered;
    const reviewNotes = [];
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
          platform,
          orderRef,
        });
      }
      // La referencia de Polival se genera aquí (solo cuando de verdad se
      // crea el pendiente) para no gastar números del correlativo en
      // artículos que al final sí tenían stock y no llegaron a entrar en
      // la lista de Polival.
      let referencia = null;
      let mercanciaFabrica = null;
      if (proveedor === "POLIVAL") {
        const numero = await nextReferenciaNumero(this.state);
        const vaFurniture = item.tipo === "tapiceria" || item.product.exceptionFurniture || agencia === "FURNITURE";
        const built = buildReferencia(numero, item.product.referenciaTipo, item.color, vaFurniture);
        referencia = built.referencia;
        if (built.needsReview) reviewNotes.push(built.reason);
        if (item.product.product_type === "Almohada" || item.product.product_type === "Topper") {
          const builtMercancia = buildSimpleMercancia(item.product.title, item.talla);
          mercanciaFabrica = builtMercancia.texto;
          if (builtMercancia.needsReview) reviewNotes.push(builtMercancia.reason);
        }
      }
      const idBase = refSuffix ? `${orderId}-${key}-${refSuffix}` : `${orderId}-${key}`;
      // Pedido para stock ya hecho a Luso/New (Jennifer, 2026-10-02): si hay
      // unidades pedidas para stock de este modelo y medida sin reservar, el
      // cliente se queda con una de esas en vez de pedirse otra vez a fábrica.
      // Colchón FUR (va con Furniture) en vez de FPK (independiente por SEUR):
      // excepción Furniture del modelo, o pedido de Furniture SIN tapicería
      // (Jennifer, 2026-11-17, BEZEN12417: colchón solo con subida a
      // domicilio pagada → "ese colchón no es FPK, sería FUR"). Aquí esPack =
      // el pedido lleva tapicería; con tapicería se sigue decidiendo FPK/FUR
      // por la fecha de llegada.
      const colchonFur = item.tipo === "colchon" && (item.product.exceptionFurniture || (agencia === "FURNITURE" && !esPack));
      let restante = falta;
      if (item.tipo === "colchon") {
        const pedidosStock = backorders
          .filter((b) => b.paraStock && b.estado === "pendiente" && !b.recibidoFabrica && stockKey(b.stockModel, b.talla) === key)
          .sort((a, b) => String(a.orderDate || "").localeCompare(String(b.orderDate || "")));
        let n = 0;
        for (const ps of pedidosStock) {
          if (restante <= 0) break;
          const libres = ps.cantidad - reservadasPedidoStock(ps);
          if (libres <= 0) continue;
          const tomar = Math.min(libres, restante);
          const id = `${idBase}-pstock${n ? n + 1 : ""}`;
          n++;
          pushBackorder(backorders, {
            id, orderId, orderNumber, stockModel: item.product.stockModel, talla: item.talla, color: item.color, tipo: item.tipo,
            cantidad: tomar, orderDate, esPack, proveedor: ps.proveedor, needsDecision, refSuffix, platform, orderRef,
            tipoEnvio: colchonFur ? "FUR" : undefined,
          });
          const nuevo = backorders.find((b) => b.id === id);
          nuevo.stockPedidoId = ps.id;
          nuevo.pedidoGenerado = true; // va en el pedido de stock, no se pide aparte
          nuevo.fechaPedidoFabrica = ps.fechaPedidoFabrica || null;
          ps.asignaciones = [...(ps.asignaciones || []), { backorderId: id, orderId, orderNumber, platform, orderRef, cantidad: tomar }];
          row.pedidoProveedorReservado = (row.pedidoProveedorReservado || 0) + tomar;
          restante -= tomar;
        }
      }
      if (restante > 0) {
        pushBackorder(backorders, {
          id: idBase,
          orderId,
          orderNumber,
          stockModel: item.product.stockModel,
          talla: item.talla,
          color: item.color,
          tipo: item.tipo,
          cantidad: restante,
          orderDate,
          esPack,
          proveedor,
          needsDecision,
          referencia,
          mercanciaFabrica,
          refSuffix,
          platform,
          orderRef,
          tipoEnvio: colchonFur ? "FUR" : undefined,
        });
      }
    }
    stock[key] = row;
    return { falta, covered, reviewNotes };
  }

  // === Pedidos para stock a Luso/New (Jennifer, 2026-10-02) ===
  // Un pendiente más (paraStock:true, sin pedido de cliente) que entra en el
  // pedido a fábrica como cualquier otro. stock.pedidoProveedor = unidades
  // pedidas para stock que aún no han llegado; pedidoProveedorReservado =
  // las que ya tienen cliente. Al recibirlo, lo no reservado suma al stock.
  async crearPedidoStock({ proveedor, lineas, usuario }) {
    const prov = String(proveedor || "").toUpperCase();
    if (!["LUSO", "NEW"].includes(prov)) return Response.json({ ok: false, error: "Solo para Luso o New." }, { status: 400 });
    const validas = (lineas || []).filter((l) => l && l.stockModel && l.talla && Number(l.cantidad) > 0);
    if (!validas.length) return Response.json({ ok: false, error: "No hay líneas." }, { status: 400 });
    const backorders = await this.load("backorders", []);
    const stock = await this.load("stock", {});
    const ahora = new Date();
    const ts = ahora.getTime();
    const fechaTxt = ahora.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit" });
    const creados = [];
    for (const l of validas) {
      const talla = normalizeTalla(l.talla) || String(l.talla).toUpperCase();
      const key = stockKey(l.stockModel, talla);
      const cantidad = Math.floor(Number(l.cantidad));
      const id = `STOCK-${ts}-${key}`;
      pushBackorder(backorders, {
        id, orderId: `STOCK-${ts}`, orderNumber: null, stockModel: l.stockModel, talla, tipo: "colchon", cantidad,
        orderDate: ahora.toISOString(), esPack: false, proveedor: prov, platform: "STOCK", orderRef: "PEDIDO STOCK " + fechaTxt,
      });
      const b = backorders.find((x) => x.id === id);
      b.paraStock = true;
      b.asignaciones = [];
      b.creadoPor = usuario || null;
      const row = stock[key] || { stockModel: l.stockModel, talla, cantidad: 0, vendidoPendiente: 0 };
      row.pedidoProveedor = (row.pedidoProveedor || 0) + cantidad;
      stock[key] = row;
      await this.logMovement({ stockModel: l.stockModel, talla, campo: "pedidoProveedor", delta: cantidad, resultante: row.pedidoProveedor, origen: "pedido-stock", usuario, orderRef: b.orderRef });
      creados.push(b);
    }
    await this.state.storage.put("backorders", backorders);
    await this.state.storage.put("stock", stock);
    return Response.json({ ok: true, creados });
  }

  // Llega un pedido para stock: lo reservado queda avisado en la línea de
  // cada cliente (se marca recibido como siempre, para no saltarse SEUR /
  // Furniture); lo que sobra pasa al stock real.
  async recibirPedidoStock(backorders, entry) {
    const stock = await this.load("stock", {});
    const key = stockKey(entry.stockModel, entry.talla);
    const row = stock[key] || { stockModel: entry.stockModel, talla: entry.talla, cantidad: 0, vendidoPendiente: 0 };
    const reservadas = reservadasPedidoStock(entry);
    const sobran = Math.max(0, entry.cantidad - reservadas);
    const ahora = new Date().toISOString();
    const mov = { stockModel: entry.stockModel, talla: entry.talla, origen: "pedido-stock", orderRef: entry.orderRef };
    row.pedidoProveedor = Math.max(0, (row.pedidoProveedor || 0) - entry.cantidad);
    await this.logMovement({ ...mov, campo: "pedidoProveedor", delta: -entry.cantidad, resultante: row.pedidoProveedor });
    row.pedidoProveedorReservado = Math.max(0, (row.pedidoProveedorReservado || 0) - reservadas);
    if (sobran > 0) {
      row.cantidad = (row.cantidad || 0) + sobran;
      await this.logMovement({ ...mov, campo: "cantidad", delta: sobran, resultante: row.cantidad });
    }
    stock[key] = row;
    for (const a of entry.asignaciones || []) {
      const c = backorders.find((b) => b.stockPedidoId === entry.id && b.orderId === a.orderId);
      if (c) c.llegadaPedidoStock = ahora;
    }
    entry.recibidoFabrica = true;
    entry.fechaRecibido = ahora;
    entry.estado = "servido";
    entry.sobrantesAStock = sobran;
    await this.state.storage.put("stock", stock);
    await this.state.storage.put("backorders", backorders);
    return Response.json({ ...entry, ok: true });
  }

  // Quita n unidades de reserva de un pedido para stock (cliente cancelado)
  // o, si lo que se cancela es el propio pedido para stock, devuelve a sus
  // clientes a "sin pedir" para que se pidan como siempre.
  async liberarPedidoStock(backorders, e, n) {
    const stock = await this.load("stock", {});
    if (e.stockPedidoId) {
      const ps = backorders.find((b) => b.id === e.stockPedidoId);
      if (ps && ps.paraStock && !ps.recibidoFabrica) {
        const a = (ps.asignaciones || []).find((x) => x.orderId === e.orderId && x.cantidad > 0);
        if (a) {
          const quitar = Math.min(a.cantidad, n);
          a.cantidad -= quitar;
          ps.asignaciones = ps.asignaciones.filter((x) => x.cantidad > 0);
          const key = stockKey(ps.stockModel, ps.talla);
          if (stock[key]) stock[key].pedidoProveedorReservado = Math.max(0, (stock[key].pedidoProveedorReservado || 0) - quitar);
        }
      }
    }
    if (e.paraStock && !e.recibidoFabrica) {
      const key = stockKey(e.stockModel, e.talla);
      const row = stock[key] || { stockModel: e.stockModel, talla: e.talla, cantidad: 0, vendidoPendiente: 0 };
      row.pedidoProveedor = Math.max(0, (row.pedidoProveedor || 0) - e.cantidad);
      row.pedidoProveedorReservado = Math.max(0, (row.pedidoProveedorReservado || 0) - reservadasPedidoStock(e));
      stock[key] = row;
      await this.logMovement({ stockModel: e.stockModel, talla: e.talla, campo: "pedidoProveedor", delta: -e.cantidad, resultante: row.pedidoProveedor, origen: "pedido-stock-cancelado", orderRef: e.orderRef });
      for (const c of backorders.filter((b) => b.stockPedidoId === e.id && b.estado === "pendiente")) {
        delete c.stockPedidoId;
        c.pedidoGenerado = false;
        c.fechaPedidoFabrica = null;
      }
      e.asignaciones = [];
    }
    await this.state.storage.put("stock", stock);
  }

  // Para productos "no llevamos stock" (fabricación bajo pedido siempre,
  // ej. Látex Natura): no hay fila de stock que descontar, así que cada
  // venta genera directamente un pendiente por la cantidad completa, sin
  // tocar cantidad/vendidoPendiente. La referencia de Polival ya viene
  // calculada por el llamador (aquí siempre se crea el pendiente, así que
  // no hay riesgo de desperdiciar números del correlativo).
  addNoStockBackorder(backorders, item, orderId, orderNumber, esPack, orderDate, proveedor, needsDecision, referencia, mercanciaFabrica, platform, orderRef) {
    const key = stockKey(item.product.stockModel, item.talla);
    // Mismo modelo y medida en distinto color dentro del pedido (Jennifer,
    // 2026-11-23, BEZEN12454: dos MAGNUM 105X190 Beige + Marrón): cada uno
    // su pendiente (-u2, -u3...). Antes el segundo se descartaba por id
    // repetido. Mismo color = mismo artículo ya creado (reprocesar no duplica).
    const base = `${orderId}-${key}`;
    let id = base;
    for (let n = 2; ; n++) {
      const ya = backorders.find((b) => b.id === id);
      if (!ya || String(ya.color || "").toLowerCase() === String(item.color || "").toLowerCase()) break;
      id = base + "-u" + n;
    }
    pushBackorder(backorders, {
      id,
      orderId,
      orderNumber,
      stockModel: item.product.stockModel,
      talla: item.talla,
      color: item.color,
      tipo: item.tipo,
      cantidad: item.qty,
      orderDate,
      esPack,
      proveedor,
      needsDecision,
      referencia,
      mercanciaFabrica,
      platform,
      orderRef,
      tipoEnvio: item.tipo === "colchon" && item.product.exceptionFurniture ? "FUR" : undefined,
    });
    return id;
  }

  // Cuando Shopify marca un pedido como enviado, las unidades que se habían
  // quedado en "vendidoPendiente" para ese pedido ya han salido de verdad
  // (o directas desde fábrica al cliente): se descuentan de esa columna y
  // los pendientes de fabricante asociados se cierran. El stock real no se
  // toca aquí — nunca llegó a estar disponible para descontarlo antes.
  async settleShipment({ orderId, furniturePendiente, esFurniture }) {
    const stock = await this.load("stock", {});
    const backorders = await this.load("backorders", []);
    let settled = 0;

    for (const b of backorders) {
      if (b.orderId !== orderId || b.estado === "servido") continue;
      // Lo que va por Furniture no ha salido aún (ver settleShipment en
      // orders-store.js, BEZEN12259): solo se cierra lo que sale aparte por
      // SEUR (colchón/topper que no es FUR).
      if (furniturePendiente && !((b.tipo === "colchon" || b.tipo === "topper") && b.tipoEnvio !== "FUR")) continue;
      // Lo que aún no ha llegado del proveedor no puede haber salido
      // (BEZEN12260: colchón FPK de LUSO dado por enviado).
      // Y en CUALQUIER pedido, no solo Furniture (Jennifer, 2026-11-04,
      // BEZEN12279: París 140X200 y Zen Nirvana 180X200 de LUSO, sin recibir,
      // quedaron "servidos" porque salieron por SEUR las almohadas de regalo).
      if (b.estado === "pendiente" && !b.recibidoFabrica) continue;
      // Los artículos con envío propio no salen con el pedido (Jennifer,
      // 2026-09-30: los cabeceros "enviados aparte" de BEZEN12187 y
      // BEZEN12176 quedaron como servidos al enviarse el resto sin haber
      // salido): envío aparte, reposición y gesto comercial se cierran solos.
      // Gesto comercial que va con Furniture (Jennifer, 2026-10-20): sale con
      // el pedido; nunca sumó "vendido pendiente", así que no se toca.
      if (b.gestoComercial && b.gcFurniture && !b.reposicion && !b.envioAparte) { b.estado = "servido"; settled++; continue; }
      if (b.envioAparte || b.reposicion || b.gestoComercial) continue;
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
          platform: b.platform,
          orderRef: b.orderRef,
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

  // Mantenimiento puntual (2026-08-25): rellena el campo "proveedor" en los
  // pendientes que se crearon antes de que ese campo existiera (ej. el
  // pedido de prueba BEZEN12097, procesado el 21/08). Busca el producto por
  // stockModel en el catálogo y usa su proveedor ya calculado. No expuesto
  // en la UI, solo por API.
  async backfillProveedor() {
    const products = await this.load("products", {});
    const backorders = await this.load("backorders", []);
    let actualizados = 0;
    for (const b of backorders) {
      if (b.proveedor) continue;
      const match = activeProducts(products).find((p) => p.stockModel === b.stockModel);
      if (match && match.proveedor) {
        b.proveedor = match.proveedor;
        actualizados++;
      }
    }
    if (actualizados > 0) await this.state.storage.put("backorders", backorders);
    return Response.json({ ok: true, actualizados });
  }

  // Mantenimiento puntual (2026-08-25): rellena "pendingDecision" en los
  // pendientes creados antes de que ese campo existiera. Un colchón dentro
  // de un pedido con tapicería siempre se creó con esPack:true, así que eso
  // basta para reconstruir el valor correcto sin reprocesar el pedido.
  async backfillPendingDecision() {
    const backorders = await this.load("backorders", []);
    let actualizados = 0;
    for (const b of backorders) {
      // needsDecision no existía antes de que se añadiera la duda de "SKU
      // ambiguo del pack" (2026-08-25) — para lo ya creado, la única forma
      // de necesitar decisión era el colchón de un pedido con tapicería.
      if (b.needsDecision === undefined) {
        b.needsDecision = b.tipo === "colchon" && !!b.esPack;
        actualizados++;
      }
      if (b.pendingDecision === undefined) {
        b.pendingDecision = b.needsDecision;
        actualizados++;
      } else if (!b.needsDecision && b.pendingDecision) {
        // Reparación puntual (2026-08-25): un bug en releaseDecision dejó
        // bloqueados artículos que nunca debieron estarlo (almohadas,
        // tapicería...). Solo se corrige esto — los que sí necesitan
        // decisión se dejan tal cual, respetando lo que Jennifer ya decidió.
        b.pendingDecision = false;
        actualizados++;
      }
    }
    if (actualizados > 0) await this.state.storage.put("backorders", backorders);
    return Response.json({ ok: true, actualizados });
  }

  // Colchones ABIERTOS del almacén (Jennifer, 2026-09-28): no pueden salir
  // por SEUR, solo por Furniture — se llevan aparte del stock normal
  // (enrollado) para poder gastarlos en pedidos de Furniture (tal cual o
  // cortándolos a una medida menor). Clave: stockKey(modelo, talla).
  async adjustAbiertos({ query, mode, talla, delta, nota, usuario }) {
    const products = await this.load("products", {});
    const stockModel = resolveStockModel(query, mode || "nombre", products);
    if (!stockModel) {
      return Response.json({ error: "No se ha encontrado ningún modelo que coincida con \"" + query + "\"." }, { status: 404 });
    }
    const tallaNorm = normalizeTalla(talla) || (talla || "").trim().toUpperCase();
    if (!tallaNorm) return Response.json({ error: "Indica una talla válida." }, { status: 400 });
    const abiertos = await this.load("abiertos", {});
    const key = stockKey(stockModel, tallaNorm);
    const row = abiertos[key] || { stockModel, talla: tallaNorm, cantidad: 0, nota: "" };
    row.cantidad = Math.max(0, (row.cantidad || 0) + Number(delta || 0));
    if (nota !== undefined) row.nota = String(nota || "");
    row.actualizado = new Date().toISOString();
    if (row.cantidad === 0 && !row.nota) delete abiertos[key];
    else abiertos[key] = row;
    await this.state.storage.put("abiertos", abiertos);
    if (Number(delta)) {
      await this.logMovement({
        stockModel, talla: tallaNorm, campo: "abiertos", delta: Number(delta), resultante: row.cantidad,
        origen: "manual", usuario: usuario || null,
      });
    }
    return Response.json(row);
  }

  // Un abierto sirve igual para la ficha normal y la de "LIQUIDACIÓN" del
  // mismo colchón (Jennifer, 2026-09-28: son el mismo colchón físico).
  static modeloBase(stockModel) {
    return String(stockModel || "").replace(/\s*-\s*LIQUIDACI[ÓO]N\s*$/i, "").trim();
  }
  static claveAbierto(abiertos, stockModel, talla) {
    const base = InventoryStore.modeloBase(stockModel);
    return Object.keys(abiertos).find((k) => abiertos[k].talla === talla && InventoryStore.modeloBase(abiertos[k].stockModel) === base) || null;
  }

  // "Usar el abierto" en un colchón de un pedido de Furniture: si estaba
  // pendiente de fábrica, deja de estarlo (libera el vendido pendiente); si
  // el motor ya había gastado un ENROLLADO de stock (pendiente "-cubierto"),
  // ese enrollado vuelve al stock — se guarda para SEUR, que es donde hace
  // falta. En ambos casos sale por Furniture (FUR).
  async usarAbierto(id, { usuario } = {}) {
    const backorders = await this.load("backorders", []);
    const entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });
    if (entry.tipo !== "colchon") return Response.json({ ok: false, error: "Solo para colchones." }, { status: 409 });
    if (entry.desdeAbierto) return Response.json({ ok: false, error: "Este colchón ya sale de un abierto." }, { status: 409 });
    const conEnrollado = entry.estado === "cubierto" && String(entry.id).endsWith("-cubierto") && !entry.transformadoDesde;
    if (entry.estado !== "pendiente" && !conEnrollado) {
      return Response.json({ ok: false, error: "Este colchón ya no está pendiente." }, { status: 409 });
    }
    const n = entry.cantidad || 1;
    const abiertos = await this.load("abiertos", {});
    const keyAbierto = InventoryStore.claveAbierto(abiertos, entry.stockModel, entry.talla);
    if (!keyAbierto || abiertos[keyAbierto].cantidad < n) {
      return Response.json({ ok: false, error: `No hay ${n} abierto(s) de ${entry.stockModel} ${entry.talla}.` }, { status: 409 });
    }
    const modeloAbierto = abiertos[keyAbierto].stockModel;
    // La nota del abierto (ej. "Versión anterior") viaja al email del
    // almacén para que cojan el colchón correcto.
    entry.notaAbierto = abiertos[keyAbierto].nota || "";
    abiertos[keyAbierto].cantidad -= n;
    const quedan = abiertos[keyAbierto].cantidad;
    if (quedan === 0 && !abiertos[keyAbierto].nota) delete abiertos[keyAbierto];
    await this.state.storage.put("abiertos", abiertos);
    await this.logMovement({
      stockModel: modeloAbierto, talla: entry.talla, campo: "abiertos", delta: -n,
      resultante: quedan, origen: "abierto",
      usuario: usuario || null, orderNumber: entry.orderNumber, platform: entry.platform, orderRef: entry.orderRef,
    });
    // Reposición (Jennifer, 2026-10-14, REPBEZEN12262): no sumó "vendido
    // pendiente", así que no se descuenta; queda recibida (ya está en el
    // almacén) y pendiente de meter en su carga de Furniture, como cualquier
    // reposición, y ya no se pide a fábrica.
    if (entry.reposicion) {
      entry.desdeAbierto = true;
      entry.fechaAbierto = new Date().toISOString();
      entry.recibidoFabrica = true;
      entry.fechaRecibido = entry.fechaAbierto;
      entry.pedidoGenerado = true;
      entry.fechaPedidoFabrica = null;
      entry.tipoEnvio = "FUR";
      // Un abierto solo sale por Furniture (Jennifer, 2026-09-28).
      entry.agenciaReposicion = "FURNITURE";
      entry.mercanciaFabrica = "REPOSICIÓN — sale de un colchón ABIERTO del almacén, no se pide a fábrica";
      entry.reservaEnviada = null;
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, entry });
    }
    const key = stockKey(entry.stockModel, entry.talla);
    const stock = await this.load("stock", {});
    const row = stock[key] || { stockModel: entry.stockModel, talla: entry.talla, cantidad: 0, vendidoPendiente: 0 };
    if (conEnrollado) {
      const antes = row.cantidad || 0;
      row.cantidad = antes + n;
      await this.logMovement({
        stockModel: entry.stockModel, talla: entry.talla, campo: "cantidad", delta: n, resultante: row.cantidad,
        origen: "abierto", usuario: usuario || null, orderNumber: entry.orderNumber, platform: entry.platform, orderRef: entry.orderRef,
      });
    } else {
      const antes = row.vendidoPendiente || 0;
      row.vendidoPendiente = Math.max(0, antes - n);
      await this.logMovement({
        stockModel: entry.stockModel, talla: entry.talla, campo: "vendidoPendiente", delta: row.vendidoPendiente - antes,
        resultante: row.vendidoPendiente, origen: "abierto", usuario: usuario || null,
        orderNumber: entry.orderNumber, platform: entry.platform, orderRef: entry.orderRef,
      });
    }
    stock[key] = row;
    await this.state.storage.put("stock", stock);
    entry.desdeAbierto = true;
    entry.enrolladoDevuelto = conEnrollado;
    entry.fechaAbierto = new Date().toISOString();
    entry.estado = "cubierto";
    entry.recibidoFabrica = true;
    entry.fechaRecibido = entry.fechaRecibido || entry.fechaAbierto;
    entry.tipoEnvio = "FUR";
    // La reserva (si la hubo) era del enrollado: la del abierto se manda de nuevo.
    entry.reservaEnviada = null;
    await this.state.storage.put("backorders", backorders);
    return Response.json({ ok: true, entry });
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

  async adjustStock({ stockModel, talla, delta, field, usuario, origen, orderRef }) {
    // "vendidoPendiente" añadido (Jennifer, 2026-09-22) para poder corregir
    // a mano restos huérfanos de ese contador — ej. un pendiente que se
    // reprocesó con el modelo correcto pero dejó "vendido pendiente" suelto
    // en el modelo viejo (caso real: pedido Carrefour 76349687-A, Zen
    // Mandala "para alojamiento" 120X190 con 1 unidad huérfana). No
    // expuesto en la UI, solo por API — usar con cuidado, no es una acción
    // de negocio normal.
    const targetField = field === "pedidoProveedor" ? "pedidoProveedor" : field === "vendidoPendiente" ? "vendidoPendiente" : "cantidad";
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
      // Colchón devuelto por SEUR que vuelve al stock (Jennifer, 2026-10-13).
      // "alta-a-pendiente": la unidad dada de alta se fue directa a un
      // pedido que la esperaba (Jennifer, 2026-10-13).
      origen: ["devolucion", "alta-a-pendiente"].includes(origen) ? origen : "manual",
      usuario,
      orderRef: orderRef || undefined,
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

  // Mantenimiento puntual: borra un pendiente suelto (ej. quedó un registro
  // erróneo por un fallo de emparejamiento de SKU ya corregido en Catálogo,
  // o un duplicado de pruebas). No expuesto en la UI, solo por API.
  // Pedido cancelado con un pendiente ya generado en Proveedores (Jennifer,
  // 2026-09-16, caso BEZEN12204): NO se borra — se marca "cancelado" para
  // guardar el rastro (cuándo, y si ya se había pedido a fábrica), y así
  // deja de aparecer en las listas activas de Proveedores (que filtran por
  // estado "pendiente") sin perder el historial. Ver aviso de campanita en
  // index.js (getAvisosCancelados).
  // Cancela `n` unidades de un pendiente (si son menos que las que tiene, se
  // separan en un pendiente aparte) y deja el stock como debe quedar
  // (Jennifer, 2026-09-29):
  // - pendiente de fábrica (colchón): se quita del "vendido pendiente";
  // - ya cubierto con stock o preparado para SEUR: vuelve al stock;
  // - sacado de un abierto: vuelve a los abiertos;
  // - transformado: no se devuelve nada (ya está cortado).
  async cancelarUnidadesDe(backorders, entry, n) {
    // Reposición con unidades ya sacadas del stock (Jennifer, 2026-10-07,
    // `enStock`): las canceladas vuelven primero de esas.
    const devolverStock = entry.reposicion ? Math.min(n, entry.enStock || 0) : 0;
    if (devolverStock) entry.enStock = (entry.enStock - devolverStock) || undefined;
    const e = separarUnidades(backorders, entry, n, "cx");
    if (e !== entry) e.enStock = undefined;
    // Pedido para stock: ni toca "vendido pendiente" ni stock real.
    if (e.paraStock || e.stockPedidoId) await this.liberarPedidoStock(backorders, e, e.cantidad);
    if (e.paraStock) {
      e.estadoAntesDeCancelar = e.estado;
      e.estado = "cancelado";
      e.fechaCancelado = new Date().toISOString();
      return e;
    }
    const stock = await this.load("stock", {});
    const key = stockKey(e.stockModel, e.talla);
    const row = stock[key] || { stockModel: e.stockModel, talla: e.talla, cantidad: 0, vendidoPendiente: 0 };
    const mov = { stockModel: e.stockModel, talla: e.talla, origen: "cancelacion", orderNumber: e.orderNumber, platform: e.platform, orderRef: e.orderRef };
    if (e.estado === "pendiente") {
      if (devolverStock) {
        row.cantidad = (row.cantidad || 0) + devolverStock;
        await this.logMovement({ ...mov, campo: "cantidad", delta: devolverStock, resultante: row.cantidad });
      }
      // Una reposición nunca sumó "vendido pendiente" (Jennifer, 2026-10-07).
      if (e.tipo === "colchon" && !e.reposicion) {
        const antes = row.vendidoPendiente || 0;
        row.vendidoPendiente = Math.max(0, antes - e.cantidad);
        await this.logMovement({ ...mov, campo: "vendidoPendiente", delta: row.vendidoPendiente - antes, resultante: row.vendidoPendiente });
      }
    } else if (e.desdeAbierto) {
      const abiertos = await this.load("abiertos", {});
      const k = InventoryStore.claveAbierto(abiertos, e.stockModel, e.talla) || key;
      const ab = abiertos[k] || { stockModel: e.stockModel, talla: e.talla, cantidad: 0, nota: "" };
      ab.cantidad += e.cantidad;
      abiertos[k] = ab;
      await this.state.storage.put("abiertos", abiertos);
      await this.logMovement({ ...mov, campo: "abiertos", delta: e.cantidad, resultante: ab.cantidad });
    } else if (!e.transformadoDesde && (e.estado === "cubierto" || e.estado === "listo-seur") && e.tipo !== "tapiceria") {
      row.cantidad = (row.cantidad || 0) + e.cantidad;
      await this.logMovement({ ...mov, campo: "cantidad", delta: e.cantidad, resultante: row.cantidad });
    }
    stock[key] = row;
    await this.state.storage.put("stock", stock);
    e.estadoAntesDeCancelar = e.estado;
    e.estado = "cancelado";
    e.cargaId = null;
    e.fechaCancelado = new Date().toISOString();
    return e;
  }

  async cancelBackorder(id) {
    const backorders = await this.load("backorders", []);
    const entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });
    entry.estado = "cancelado";
    entry.fechaCancelado = new Date().toISOString();
    await this.state.storage.put("backorders", backorders);
    return Response.json(entry);
  }

  async deleteBackorder(id) {
    const backorders = await this.load("backorders", []);
    const borrado = backorders.find((b) => b.id === id);
    if (borrado && (borrado.paraStock || borrado.stockPedidoId) && borrado.estado === "pendiente") await this.liberarPedidoStock(backorders, borrado, borrado.cantidad);
    const filtered = backorders.filter((b) => b.id !== id);
    const existed = filtered.length !== backorders.length;
    await this.state.storage.put("backorders", filtered);
    return Response.json({ ok: true, existed });
  }

  // Mantenimiento puntual (Jennifer, 2026-09-23, caso real Carrefour
  // 76257042-A): un pedido con VARIOS artículos comparte un único id
  // interno entre sus líneas — al importar, la última línea pisa a la(s)
  // anterior(es) en `orders`, así que un artículo puede quedar sin rastro
  // en el sistema aunque sí estuviera en el fichero real. Mientras se
  // arregla ese fallo de fondo, esta ruta crea el pendiente a mano
  // directamente (sin pasar por el motor de stock/agencia — Jennifer ya
  // sabe y dice qué falta). No expuesta en UI, mismo id que generaría
  // addNoStockBackorder si hubiera podido procesarse solo.
  // `refSuffix` (Jennifer, 2026-09-29, Conforama ES 40451996M-A: una unidad
  // ya salió y la otra queda pendiente): número pegado al final de la
  // referencia del pedido en los ficheros de envío, ej. "3".
  // Envío suelto ya listo para SEUR (Jennifer, 2026-09-30, REPBEZEN12176:
  // colchón de reposición que no pasa por proveedor ni descuenta stock):
  // `envioSeur: { cargaId, reposicion }` lo crea directamente como
  // "listo-seur" dentro de esa carga de SEUR.
  // `color`, `esPack` y `tipoEnvio` (Jennifer, 2026-09-30, BEZEN12146: dos
  // packs de canapé de madera Cerezo metidos a mano) — sin color el canapé
  // no saca bien sus piezas en Furniture.
  // `unidad` (Jennifer, 2026-09-30, BEZEN12155: dos canapés iguales con la
  // misma referencia) — distingue dos artículos iguales del mismo pedido,
  // para que cada canapé saque su propio juego de piezas en Furniture.
  async crearPendienteManual({ orderId, orderNumber, platform, orderRef, stockModel, talla, cantidad, orderDate, proveedor, referencia, tipo, refSuffix, envioSeur, color, esPack, tipoEnvio, unidad }) {
    if (!orderId || !stockModel || !talla || !proveedor) {
      return Response.json({ ok: false, error: "Faltan orderId, stockModel, talla o proveedor." }, { status: 400 });
    }
    const backorders = await this.load("backorders", []);
    const key = stockKey(stockModel, talla);
    if (envioSeur) {
      const id = `${orderId}-${key}-envio-seur-${envioSeur.cargaId}`;
      pushBackorder(backorders, {
        id, orderId, orderNumber, stockModel, talla, tipo: tipo || "colchon", cantidad: cantidad || 1, orderDate,
        esPack: false, proveedor, referencia: referencia || null, platform, orderRef, refSuffix: refSuffix ? String(refSuffix) : "",
        estado: "listo-seur", recibidoFabrica: true, reposicion: !!envioSeur.reposicion, agenciaReposicion: envioSeur.reposicion ? "SEUR" : undefined,
      });
      const b = backorders.find((x) => x.id === id);
      b.cargaId = envioSeur.cargaId;
      b.mercanciaFabrica = "ENVÍO SUELTO — no pasa por proveedor ni descuenta stock";
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, id, backorder: b });
    }
    const idNuevo = `${orderId}-${key}` + (unidad && unidad > 1 ? `-u${unidad}` : "");
    pushBackorder(backorders, {
      id: idNuevo,
      orderId,
      orderNumber,
      stockModel,
      talla,
      tipo: tipo || "colchon",
      cantidad: cantidad || 1,
      orderDate,
      esPack: !!esPack,
      proveedor,
      referencia: referencia || null,
      platform,
      orderRef,
      refSuffix: refSuffix ? String(refSuffix) : "",
      color: color || "",
      tipoEnvio: tipoEnvio || undefined,
    });
    await this.state.storage.put("backorders", backorders);
    return Response.json({ ok: true, id: idNuevo });
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

  // Mantenimiento puntual (Jennifer, 2026-09-23): "todo lo que hemos estado
  // haciendo con los pedidos eran pruebas... esto se ha tramitado ya por
  // otra vía... es más sencillo borrar la info y empezar de 0" — vacía
  // Proveedores (Luso/New/Polival) + Furniture + SEUR de una vez, porque
  // las tres pantallas son solo filtros distintos sobre `backorders`. A
  // diferencia de resetStock(), aquí el STOCK REAL (`cantidad`) NO se toca
  // — solo se limpia `vendidoPendiente` (huérfano sin backorder detrás) —,
  // y los pedidos de Shopify (`inventoryProcessed`, Estado, seguimiento)
  // tampoco se tocan a propósito, para que NO se reprocesen solos y
  // vuelvan a generar los mismos pendientes que se acaban de borrar.
  async clearBackorders() {
    const totalAntes = (await this.load("backorders", [])).length;
    await this.state.storage.put("backorders", []);
    const stock = await this.load("stock", {});
    for (const key of Object.keys(stock)) stock[key].vendidoPendiente = 0;
    await this.state.storage.put("stock", stock);
    return Response.json({ ok: true, backordersBorrados: totalAntes });
  }

  // Marca que el fabricante ya entregó ese colchón (aviso informativo para
  // el equipo). No cambia el stock ni cierra el pendiente: el pendiente se
  // cierra solo cuando el pedido del cliente se marca como enviado en
  // Shopify (ver settleShipment) — puede que lo recibido de fábrica tarde
  // en salir hacia el cliente.
  // deseado (Jennifer, 2026-11-04, REP10002269275-A: "lo marqué ayer como
  // recibido pero no ha subido a la carga"): el cliente dice el estado que
  // quiere (true/false). Antes solo alternaba, así que un doble clic, o
  // marcarlo desde dos pantallas, lo dejaba otra vez SIN recibir. Si ya está
  // en ese estado no se toca nada (ni la fecha).
  async resolveBackorder(id, deseado) {
    const backorders = await this.load("backorders", []);
    const entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });
    if (entry.paraStock) {
      if (entry.recibidoFabrica) return Response.json({ ok: false, error: "Este pedido para stock ya se recibió y sumó al stock." }, { status: 400 });
      return this.recibirPedidoStock(backorders, entry);
    }
    if (typeof deseado === "boolean" && !!entry.recibidoFabrica === deseado) return Response.json(entry);
    entry.recibidoFabrica = typeof deseado === "boolean" ? deseado : !entry.recibidoFabrica;
    // Fecha del cambio a recibido (Jennifer, 2026-08-26): la fila ya no
    // desaparece de Proveedores al marcarla, así que necesita mostrar
    // cuándo se marcó. Se borra si se desmarca por error.
    entry.fechaRecibido = entry.recibidoFabrica ? new Date().toISOString() : null;
    await this.state.storage.put("backorders", backorders);
    return Response.json(entry);
  }

  // Recepción parcial (Jennifer, 2026-11-03, BEZEN12235: "de un pedido que
  // son dos unidades he recibido una"): la línea se parte en dos. La línea
  // ORIGINAL (mismo id, misma referencia, sigue pedida a fábrica) se queda
  // pendiente con las unidades que faltan; se crea una línea nueva, copia de
  // la original, con las unidades que han llegado y marcada como recibida.
  // No toca stock: igual que el "recibido" normal de Furniture.
  async recibirParcial(id, unidades) {
    const backorders = await this.load("backorders", []);
    const entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });
    const total = Number(entry.cantidad) || 1;
    const n = Math.floor(Number(unidades));
    if (entry.paraStock) return Response.json({ ok: false, error: "Es un pedido para stock: se recibe entero." }, { status: 400 });
    if (entry.recibidoFabrica) return Response.json({ ok: false, error: "Esta línea ya está marcada como recibida." }, { status: 409 });
    if (total < 2) return Response.json({ ok: false, error: "Solo queda 1 unidad en esta línea: márcala como recibida normal." }, { status: 400 });
    if (!(n >= 1 && n < total)) return Response.json({ ok: false, error: "Unidades recibidas no válidas (entre 1 y " + (total - 1) + ")." }, { status: 400 });
    let nuevoId = id + "-rec1";
    for (let i = 2; backorders.some((b) => b.id === nuevoId); i++) nuevoId = id + "-rec" + i;
    const ahora = new Date().toISOString();
    const recibida = {
      ...entry,
      id: nuevoId,
      cantidad: n,
      recibidoFabrica: true,
      fechaRecibido: ahora,
      parcialDe: id,
    };
    delete recibida.reservaEnviada;
    entry.cantidad = total - n;
    entry.recepcionesParciales = [...(entry.recepcionesParciales || []), { fecha: ahora, unidades: n, id: nuevoId }];
    backorders.splice(backorders.indexOf(entry) + 1, 0, recibida);
    await this.state.storage.put("backorders", backorders);
    return Response.json(recibida);
  }

  // Llega el camión con el colchón que faltaba para un pedido SEUR
  // (Jennifer, 2026-09-08): NO comprueba "stock real" — ya sabíamos que no
  // había cuando se generó este pendiente, así que exigirlo obligaría a
  // darlo de alta a mano en Stock primero (y de paso lo metería en el fondo
  // común, donde un pedido nuevo podría llevárselo antes que a este cliente,
  // que lleva más tiempo esperando). Se fía de que ella lo confirma con el
  // albarán delante: descuenta directo de "vendido pendiente" (nunca de
  // "cantidad", que sigue siendo el fondo común de verdad disponible), y
  // mete el pedido en la carga de SEUR de la fecha que elija (hoy o mañana,
  // por si es un pedido atrasado que quiere que salga ya). Solo tiene
  // sentido para colchones sueltos con proveedor Luso/New (esPack:false) —
  // los de Furniture usan el flujo de "recibido de fábrica" normal.
  async resolveSeurBackorder(id, fecha) {
    // La carga (otro Durable Object) se pide ANTES de leer los pendientes
    // (Jennifer, 2026-10-09, BEZEN12264/12188/12146): mientras esperaba esa
    // respuesta entraban otras peticiones (p. ej. apuntar la reserva al
    // almacén de otro colchón) y al guardar esta lista vieja se perdían.
    const previo = (await this.load("backorders", [])).find((b) => b.id === id);
    if (!previo) return new Response("not found", { status: 404 });
    if (previo.paraStock) return Response.json({ ok: false, error: "Es un pedido para stock: se marca recibido y pasa al stock." }, { status: 400 });
    if (previo.estado !== "pendiente") {
      return Response.json({ ok: false, error: "Este pendiente ya no está pendiente." }, { status: 409 });
    }
    // Pedido cancelado / reembolsado (Jennifer, 2026-11-05, Carrefour
    // 76441060-A: al dar de alta un París entró en la carga de SEUR).
    if (!previo.reposicion && !previo.gestoComercial) {
      try {
        const stubO = this.env.ORDERS_STORE.get(this.env.ORDERS_STORE.idFromName("shopify"));
        const orders = await (await stubO.fetch("https://do/orders")).json();
        const o = orders.find((x) => String(x.id) === String(previo.orderId));
        if (o && (o.cancelado || o.shopifyCancelado || /cancelad|reembolsad|rechazad|anulad/i.test(o.estado || ""))) {
          return Response.json({ ok: false, error: "El pedido " + (previo.orderRef || previo.orderNumber || "") + " está CANCELADO" + (o.estado ? " (" + o.estado + ")" : "") + ": no entra en ninguna carga." }, { status: 409 });
        }
      } catch (e) {
        // si no se puede comprobar, se sigue como siempre
      }
    }

    // Retenido sin fecha (Jennifer, 2026-10-22): "no enviar hasta que el
    // cliente nos diga" — se da por recibido pero no entra en ninguna carga;
    // queda en SEUR > "Retenidos sin fecha" hasta que se le ponga día.
    const retenido = fecha === "retenido";
    const carga = retenido ? null : await this.getOrCreateSeurCarga(fecha);
    if (!carga && !retenido) return Response.json({ ok: false, error: "Fecha de carga no válida." }, { status: 400 });
    const backorders = await this.load("backorders", []);
    const entry = backorders.find((b) => b.id === id);
    if (!entry || entry.estado !== "pendiente") return Response.json({ ok: false, error: "Este pendiente ya no está pendiente." }, { status: 409 });

    // "vendidoPendiente" solo existe para colchones (Jennifer, 2026-08-21) —
    // un gesto comercial (almohada) nunca lo incrementó al crearse, así que
    // no hay nada que descontar aquí (Jennifer, 2026-09-22: las almohadas de
    // gesto comercial también salen por SEUR, reusando este mismo botón).
    // Una reposición tampoco lo sumó nunca (Jennifer, 2026-10-07): restarlo
    // aquí descuadraba el "vendido pendiente" de otros pedidos.
    if (entry.tipo === "colchon" && !entry.reposicion) {
      const stock = await this.load("stock", {});
      const key = stockKey(entry.stockModel, entry.talla);
      const row = stock[key] || { stockModel: entry.stockModel, talla: entry.talla, cantidad: 0, vendidoPendiente: 0 };
      const antes = row.vendidoPendiente || 0;
      row.vendidoPendiente = Math.max(0, antes - entry.cantidad);
      stock[key] = row;
      await this.logMovement({
        stockModel: entry.stockModel,
        talla: entry.talla,
        campo: "vendidoPendiente",
        delta: row.vendidoPendiente - antes,
        resultante: row.vendidoPendiente,
        origen: "camion",
        orderNumber: entry.orderNumber,
        platform: entry.platform,
        orderRef: entry.orderRef,
      });
      await this.state.storage.put("stock", stock);
    }

    entry.estado = "listo-seur";
    entry.recibidoFabrica = true;
    entry.fechaRecibido = new Date().toISOString();
    entry.cargaId = carga ? carga.id : null;
    entry.recordatorioSeur = null;
    if (retenido) entry.retenidoCliente = true;
    else delete entry.retenidoCliente;

    await this.state.storage.put("backorders", backorders);
    return Response.json({ ok: true, entry, carga });
  }

  // ¿Ya salió la tapicería (Furniture) de este pedido? (Jennifer,
  // 2026-09-18) — hace falta para decidir a dónde va un colchón de pack
  // sustituido: si la carga de Furniture de ese pedido ya está cerrada, un
  // colchón FPK se manda aparte por SEUR; si no, se deja para salir junto
  // con la tapicería en su carga de Furniture (normal, manual).
  async isFurnitureShipped(orderId) {
    const id = this.env.ORDERS_STORE.idFromName("shopify");
    const stub = this.env.ORDERS_STORE.get(id);
    const [ordersRes, cargasRes] = await Promise.all([
      stub.fetch("https://do/orders"),
      stub.fetch("https://do/cargas"),
    ]);
    const orders = await ordersRes.json();
    const cargas = await cargasRes.json();
    const order = orders.find((o) => String(o.id) === String(orderId));
    if (!order || !order.cargaId) return false;
    const carga = cargas.find((c) => c.id === order.cargaId);
    return !!(carga && carga.estado === "cerrada" && (carga.tipo || "furniture") === "furniture");
  }

  // A dónde va un pendiente sustituido (Jennifer, 2026-09-18, dictado
  // turno a turno):
  // - Colchón SUELTO (no es de pack): siempre por SEUR, con fecha a elegir.
  // - Colchón de PACK con tipoEnvio "FPK": si la tapicería de ese pedido YA
  //   salió por Furniture, sigue FPK -> por SEUR igual que uno suelto. Si
  //   la tapicería todavía NO ha salido, se deja "cubierto" para que salga
  //   junto con ella en su carga de Furniture normal (sin fecha de SEUR).
  // - Colchón de PACK con tipoEnvio "FUR" (siempre junto): nunca por SEUR
  //   — se deja "cubierto" para que se vea listo en el desglose de
  //   Furniture de ese pedido, junto con el cambio de modelo hecho.
  async decideSustitucionViaSeur(entry) {
    if (!entry.esPack) return true;
    if (entry.tipoEnvio === "FPK") return this.isFurnitureShipped(entry.orderId);
    return false;
  }

  // Alternativas con stock real de la misma talla (Jennifer, 2026-09-18):
  // para elegir el sustituto directamente desde el propio pendiente, sin
  // tener que salir a mirar Stock a mano. Solo colchones, sueltos o de
  // pack — no se ofrece el propio modelo que ya está pendiente. También
  // dice si esta sustitución en concreto va a necesitar fecha de SEUR o no
  // (ver decideSustitucionViaSeur), para que el modal de Jennifer sepa qué
  // botones enseñar.
  async listBackorderAlternatives(id) {
    const backorders = await this.load("backorders", []);
    const entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });
    const products = await this.load("products", {});
    const stock = await this.load("stock", {});
    const colchonModelos = new Set(
      Object.values(products).filter((p) => p.product_type === "Colchones").map((p) => p.stockModel)
    );
    const alternativas = Object.values(stock)
      .filter((row) => row.talla === entry.talla && row.cantidad > 0 && row.stockModel !== entry.stockModel && colchonModelos.has(row.stockModel))
      .map((row) => ({ stockModel: row.stockModel, cantidad: row.cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad);
    // Transformar (Jennifer, 2026-09-28): el MISMO modelo en otra medida con
    // stock real, que se adapta a la medida vendida (ej. un Zen Natural
    // 160x190 transformado en el 150x190 pendiente).
    // Solo medidas MAYORES (Jennifer, 2026-09-29, caso BEZEN12242): un
    // colchón se puede cortar a más pequeño, nunca agrandar.
    const tallaNum = (t) => (t || "").split("X").map(Number);
    const transformables = Object.values(stock)
      .filter((row) => row.stockModel === entry.stockModel && row.cantidad > 0 && esMedidaMayor(row.talla, entry.talla))
      .map((row) => ({ talla: row.talla, cantidad: row.cantidad }))
      .sort((a, b) => tallaNum(a.talla)[0] - tallaNum(b.talla)[0] || tallaNum(a.talla)[1] - tallaNum(b.talla)[1]);
    const viaSeur = await this.decideSustitucionViaSeur(entry);
    return Response.json({ talla: entry.talla, alternativas, transformables, viaSeur });
  }

  // Sustituir un pendiente de colchón (suelto o de pack) por otro modelo
  // que SÍ hay en stock real (Jennifer, 2026-09-18): cuando al cliente se
  // le ofrece una alternativa porque el modelo pedido no está, en vez de
  // esperar a que llegue de fábrica. Libera el "vendido pendiente" del
  // modelo original (ya no se va a servir con ese) y descuenta del stock
  // REAL del modelo sustituto (nunca negativo, igual que el resto del
  // sistema). El destino (SEUR con fecha, o "cubierto" para salir con la
  // tapicería) lo decide decideSustitucionViaSeur.
  // transformar (Jennifer, 2026-09-28): en vez de otro modelo, se usa el
  // MISMO modelo de OTRA medida (`talla` = medida de origen) y se adapta a
  // la vendida — se descuenta el stock de la medida de origen, pero el
  // pendiente sigue siendo de la medida que recibe el cliente.
  // desdeAbierto (Jennifer, 2026-09-28): la medida de origen de la
  // transformación sale de la lista de colchones ABIERTOS, no del stock
  // enrollado ("cortar" un abierto más grande).
  async substituteBackorder(id, { query, mode, talla, fecha, transformar, desdeAbierto }) {
    let backorders = await this.load("backorders", []);
    let entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });
    if (entry.paraStock) return Response.json({ ok: false, error: "Un pedido para stock no se sustituye." }, { status: 400 });
    if (entry.estado !== "pendiente") {
      return Response.json({ ok: false, error: "Este pendiente ya no está pendiente." }, { status: 409 });
    }
    if (entry.tipo !== "colchon") {
      return Response.json({ ok: false, error: "Solo se puede sustituir un colchón." }, { status: 409 });
    }
    // Mismo buscador tolerante a prefijos/alias que el alta/baja rápida de
    // Stock (resolveStockModel) — así no hace falta escribir el nombre
    // exacto del modelo sustituto.
    const products = await this.load("products", {});
    const stockModel = transformar ? entry.stockModel : resolveStockModel(query, mode, products);
    if (!stockModel) {
      return Response.json({ ok: false, error: "No se ha encontrado ningún modelo que coincida con \"" + query + "\"." }, { status: 404 });
    }
    const tallaNorm = normalizeTalla(talla) || (talla || "").trim().toUpperCase();
    if (!tallaNorm) {
      return Response.json({ ok: false, error: "Indica una talla válida." }, { status: 400 });
    }
    talla = tallaNorm;
    if (transformar && !esMedidaMayor(talla, entry.talla)) {
      return Response.json({ ok: false, error: `Solo se puede transformar un colchón MÁS GRANDE en uno más pequeño: ${talla} no sirve para ${entry.talla}.` }, { status: 400 });
    }
    const origenMovimiento = transformar ? "transformacion" : "sustitucion";

    // Un colchón transformado va abierto: sale SIEMPRE por Furniture, nunca
    // por SEUR (Jennifer, 2026-09-28).
    const viaSeur = transformar ? false : await this.decideSustitucionViaSeur(entry);
    let carga = null;
    if (viaSeur) {
      carga = await this.getOrCreateSeurCarga(fecha);
      if (!carga) return Response.json({ ok: false, error: "Fecha de carga no válida." }, { status: 400 });
    }
    // Releer tras esperar a otros Durable Objects (ver resolveSeurBackorder):
    // si no, se pisan cambios hechos entretanto en otros pendientes.
    backorders = await this.load("backorders", []);
    entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });

    const congelado = await this.load("stockCongelado", false);
    const stock = await this.load("stock", {});
    const abiertos = desdeAbierto ? await this.load("abiertos", {}) : null;
    const keyAbiertoOrigen = desdeAbierto ? InventoryStore.claveAbierto(abiertos, stockModel, talla) : null;
    if (transformar) {
      const origen = desdeAbierto ? (keyAbiertoOrigen && abiertos[keyAbiertoOrigen]) : stock[stockKey(stockModel, talla)];
      if (!origen || origen.cantidad < entry.cantidad) {
        return Response.json({ ok: false, error: `No hay ${desdeAbierto ? "abiertos" : "stock"} de ${stockModel} ${talla} para transformar.` }, { status: 409 });
      }
    }

    const oldKey = stockKey(entry.stockModel, entry.talla);
    const oldRow = stock[oldKey];
    if (oldRow) {
      const antesOld = oldRow.vendidoPendiente || 0;
      oldRow.vendidoPendiente = Math.max(0, antesOld - entry.cantidad);
      stock[oldKey] = oldRow;
      await this.logMovement({
        stockModel: entry.stockModel, talla: entry.talla, campo: "vendidoPendiente",
        delta: oldRow.vendidoPendiente - antesOld, resultante: oldRow.vendidoPendiente,
        origen: origenMovimiento, orderNumber: entry.orderNumber,
        platform: entry.platform, orderRef: entry.orderRef,
      });
    }

    const newKey = stockKey(stockModel, talla);
    if (desdeAbierto) {
      const ab = abiertos[keyAbiertoOrigen];
      entry.notaAbierto = ab.nota || "";
      ab.cantidad = Math.max(0, ab.cantidad - entry.cantidad);
      const quedan = ab.cantidad;
      if (ab.cantidad === 0 && !ab.nota) delete abiertos[keyAbiertoOrigen];
      await this.state.storage.put("abiertos", abiertos);
      await this.logMovement({
        stockModel: ab.stockModel, talla, campo: "abiertos",
        delta: -entry.cantidad, resultante: quedan,
        origen: origenMovimiento, orderNumber: entry.orderNumber,
        platform: entry.platform, orderRef: entry.orderRef,
      });
    } else {
      const newRow = stock[newKey] || { stockModel, talla, cantidad: 0, vendidoPendiente: 0 };
      const antesNew = newRow.cantidad;
      if (!congelado) newRow.cantidad = Math.max(0, newRow.cantidad - entry.cantidad);
      stock[newKey] = newRow;
      await this.logMovement({
        stockModel, talla, campo: "cantidad",
        delta: newRow.cantidad - antesNew, resultante: newRow.cantidad,
        origen: origenMovimiento, orderNumber: entry.orderNumber,
        platform: entry.platform, orderRef: entry.orderRef,
      });
    }

    if (transformar) {
      // El cliente recibe la medida que compró: el pendiente no cambia de
      // modelo ni de medida, solo se apunta de dónde salió. Va con FUR y el
      // pedido entero pasa a FURNITURE.
      entry.transformadoDesde = talla;
      entry.transformadoDesdeAbierto = !!desdeAbierto;
      entry.fechaTransformacion = new Date().toISOString();
      entry.tipoEnvio = "FUR";
      const ordersStub = this.env.ORDERS_STORE.get(this.env.ORDERS_STORE.idFromName("shopify"));
      await ordersStub.fetch("https://do/orders/pasar-a-furniture", {
        method: "POST",
        body: JSON.stringify({ orderId: entry.orderId, motivo: "transformacion" }),
      });
    } else {
      entry.stockModelOriginal = entry.stockModel;
      entry.tallaOriginal = entry.talla;
      entry.stockModel = stockModel;
      entry.talla = talla;
    }
    entry.recibidoFabrica = true;
    entry.fechaRecibido = new Date().toISOString();
    if (viaSeur) {
      entry.estado = "listo-seur";
      entry.cargaId = carga.id;
    } else {
      // Pack con FUR, o FPK cuya tapicería todavía no ha salido: se deja
      // "cubierto" (disponible) — no va a SEUR, sale con la tapicería en
      // su carga de Furniture normal, y el desglose de ese pedido en
      // Furniture ya lo mostrará con el modelo sustituto.
      entry.estado = "cubierto";
    }

    await this.state.storage.put("stock", stock);
    await this.state.storage.put("backorders", backorders);
    return Response.json({ ok: true, entry, carga, viaSeur });
  }

  // Cambiar la medida del pedido entero (Jennifer, 2026-10-14): el cliente
  // compró un pack en una medida y luego lo quiere en otra. No es una
  // sustitución desde el stock: los artículos elegidos pasan a la medida
  // nueva, se recalcula lo que se pide a fábrica (texto de Polival, formato
  // de 160...) y los contadores de stock se mueven de una medida a otra.
  // Lo que ya estaba pedido a fábrica vuelve a "sin pedir" (con aviso para
  // llamar al proveedor) y en Polival lleva referencia nueva.
  async cambiarMedidaPedido({ orderId, ids, tallaNueva, services, variantTitle, usuario }) {
    const a = normalizeTalla(tallaNueva) || String(tallaNueva || "").trim().toUpperCase();
    if (!/^\d{2,3}X\d{2,3}$/.test(a)) return Response.json({ ok: false, error: "Medida no válida: escríbela como 160X200." }, { status: 400 });
    const products = await this.load("products", {});
    const activos = activeProducts(products);
    const backorders = await this.load("backorders", []);
    const stock = await this.load("stock", {});
    const congelado = await this.load("stockCongelado", false);
    const prodDe = (b) => activos.find((p) => p.stockModel === b.stockModel) || null;
    const delPedido = backorders.filter((b) => String(b.orderId) === String(orderId) && !b.reposicion && !b.gestoComercial);
    const conInitial = delPedido.some((b) => { const p = prodDe(b); return p && p.product_type === "Canapé" && matchCanapeRecipeKey(p.title) === "initial"; });
    const fecha = new Date().toISOString();
    const cambios = [];
    const avisos = [];
    const mover = async (b, talla, campo, delta) => {
      if (!delta) return;
      const key = stockKey(b.stockModel, talla);
      const row = stock[key] || { stockModel: b.stockModel, talla, cantidad: 0, vendidoPendiente: 0 };
      const antes = row[campo] || 0;
      row[campo] = Math.max(0, antes + delta);
      stock[key] = row;
      await this.logMovement({ stockModel: b.stockModel, talla, campo, delta: row[campo] - antes, resultante: row[campo], origen: "cambio-medida", usuario, orderNumber: b.orderNumber, platform: b.platform, orderRef: b.orderRef });
    };
    for (const id of ids || []) {
      const b = delPedido.find((x) => x.id === id);
      if (!b) continue;
      const nombre = b.cantidad + "x " + b.stockModel;
      if (b.estado !== "pendiente" && b.estado !== "cubierto") { avisos.push(nombre + " (" + b.talla + "): ya " + (b.estado === "servido" ? "ha salido" : b.estado === "listo-seur" ? "está preparado para SEUR" : "está " + b.estado) + ", no se ha cambiado."); continue; }
      const de = b.talla;
      if (de === a) continue;
      const deStock = b.estado === "cubierto" && String(b.id).endsWith("-cubierto");
      if (deStock) {
        // Salía del stock: la unidad vuelve al stock de su medida y se coge
        // de la nueva si hay; si no, queda pendiente de pedir.
        if (!congelado) await mover(b, de, "cantidad", b.cantidad);
        const nueva = stock[stockKey(b.stockModel, a)];
        if (nueva && nueva.cantidad >= b.cantidad) {
          if (!congelado) await mover(b, a, "cantidad", -b.cantidad);
          avisos.push(nombre + ": salía del stock en " + de + " (vuelve al stock) y sale del stock en " + a + ".");
        } else {
          b.estado = "pendiente";
          b.recibidoFabrica = false;
          b.reservaEnviada = null;
          await mover(b, a, "vendidoPendiente", b.cantidad);
          avisos.push(nombre + ": salía del stock en " + de + " (vuelve al stock). En " + a + " NO hay stock: queda pendiente de pedir a " + (b.proveedor || "su proveedor") + ".");
        }
      } else {
        const viejo = stock[stockKey(b.stockModel, de)];
        const vp = viejo ? Math.min(viejo.vendidoPendiente || 0, b.cantidad) : 0;
        if (vp) { await mover(b, de, "vendidoPendiente", -vp); await mover(b, a, "vendidoPendiente", vp); }
        if (b.recibidoFabrica) {
          if ((b.tipo === "colchon" || b.tipo === "topper") && !congelado) {
            await mover(b, de, "cantidad", b.cantidad);
            avisos.push(nombre + " " + de + " ya estaba recibido: pasa al stock.");
          } else {
            avisos.push(nombre + " " + de + " ya estaba recibido en el almacén: queda sin pedido, decide qué hacer con esa pieza.");
          }
          b.recibidoFabrica = false;
          b.fechaRecibido = null;
          b.reservaEnviada = null;
        }
        if (b.pedidoGenerado) {
          avisos.push("⚠ " + nombre + " ya estaba PEDIDO a " + (b.proveedor || "fábrica") + (b.fechaPedidoFabrica ? " el " + new Date(b.fechaPedidoFabrica).toLocaleDateString("es-ES") : "") + " en " + de + ": llama para cambiarlo o anularlo. Vuelve a salir para pedir en " + a + ".");
          b.pedidoAnterior = { talla: de, fecha: b.fechaPedidoFabrica || null, referencia: b.referencia || null };
          b.pedidoGenerado = false;
          b.fechaPedidoFabrica = null;
          // Referencia nueva en Polival, para no confundirla con la ya pedida.
          const p = prodDe(b);
          if (b.proveedor === "POLIVAL" && b.referencia && p) {
            const built = buildReferencia(await nextReferenciaNumero(this.state), p.referenciaTipo, b.color, /FUR$/.test(b.referencia));
            if (built.referencia) b.referencia = built.referencia;
          }
        }
      }
      b.talla = a;
      // Texto para fábrica con la medida nueva (mismas recetas que al
      // tramitar el pedido).
      const p = prodDe(b);
      if (b.proveedor === "POLIVAL" && p) {
        let built = null;
        if (p.product_type === "Canapé") built = buildCanapeMercancia(p.title, b.color, a, services || "");
        else if (p.product_type === "Cabecero") built = buildCabeceroMercancia(p.title, b.color, a, variantTitle || "", conInitial);
        else if (p.product_type === "Canapé fijo") built = buildCanapeFijoMercancia(b.color, a);
        else if (p.product_type === "Colchones") built = buildColchonMercancia(p.stockModel, a);
        if (built && built.texto) {
          b.mercanciaFabrica = built.texto;
          if (built.needsReview && built.reason) avisos.push(built.reason);
        } else if (b.mercanciaFabrica) {
          b.mercanciaFabrica = b.mercanciaFabrica.replace(/MEDIDA:\s*[^·]+/i, "MEDIDA: " + a + " ");
        }
        // El FORMATO de 160 se vuelve a poner solo si sigue haciendo falta.
        b.mercanciaFabrica = String(b.mercanciaFabrica || "").replace(/(^|\s*·\s*)FORMATO:\s*(GEMELOS|PARTIDO)\s*$/i, "") || null;
        if (necesitaFormato160({ product: p, talla: a })) {
          if (b.formato160) b.mercanciaFabrica = textoConFormato160(b.mercanciaFabrica, b.formato160);
          else if (/gemelo/i.test(variantTitle || "")) { b.necesitaFormato160 = true; avisos.push("Elige GEMELOS o PARTIDO del canapé en Proveedores · Polival antes de pedirlo."); }
          else { b.formato160 = "PARTIDO"; b.mercanciaFabrica = textoConFormato160(b.mercanciaFabrica, "PARTIDO"); }
        } else {
          b.formato160 = null;
          b.necesitaFormato160 = false;
        }
      }
      b.cambioMedida = { de: (b.cambioMedida && b.cambioMedida.de) || de, a, fecha, usuario: usuario || null };
      cambios.push({ id: b.id, stockModel: b.stockModel, de, a });
    }
    await this.state.storage.put("stock", stock);
    await this.state.storage.put("backorders", backorders);
    return Response.json({ ok: true, cambios, avisos });
  }

  // Cambiar el color de la tapicería (Jennifer, 2026-10-20): el cliente ya
  // hizo el pedido y luego lo quiere en otro color. Dos colores: el de las
  // etiquetas de Furniture (b.color, el nombre de la web) y el de fábrica,
  // que es el que va en "Mercancía para pedir a fábrica" a Polival. Si no
  // se escribe el de fábrica, se saca de la receta con el color nuevo.
  // `porArticulo` (Jennifer, 2026-11-05, BEZEN12381: dos canapés y cada uno
  // cambia a su color): [{ id? | talla+de, a, fabrica }]. Con id se aplica a
  // ese pendiente; sin id (apuntado antes de tramitar) se busca por medida y
  // color comprado.
  async cambiarColorPedido({ orderId, ids, todos, colorFurniture, colorFabrica, porArticulo, services, usuario }) {
    const cfGlobal = String(colorFurniture || "").trim();
    const cfabGlobal = String(colorFabrica || "").trim();
    const listaArt = Array.isArray(porArticulo) ? porArticulo.filter((x) => x && (String(x.a || "").trim() || String(x.fabrica || "").trim())) : null;
    if (listaArt ? !listaArt.length : (!cfGlobal && !cfabGlobal)) return Response.json({ ok: false, error: "Escribe el color nuevo." }, { status: 400 });
    const products = await this.load("products", {});
    const activos = activeProducts(products);
    const backorders = await this.load("backorders", []);
    const prodDe = (b) => activos.find((p) => p.stockModel === b.stockModel) || null;
    const delPedido = backorders.filter((b) => String(b.orderId) === String(orderId) && !b.reposicion && !b.gestoComercial && b.tipo === "tapiceria");
    const conInitial = delPedido.some((b) => { const p = prodDe(b); return p && p.product_type === "Canapé" && matchCanapeRecipeKey(p.title) === "initial"; });
    const fecha = new Date().toISOString();
    const cambios = [];
    const avisos = [];
    // `todos`: cambio de color apuntado antes de tramitar el pedido, se
    // aplica a toda su tapicería al tramitarlo (OrdersStore).
    const objetivos = [];
    if (listaArt) {
      const normT = (t) => String(t || "").toUpperCase().split("CM").join("").split(" ").join("").split("*").join("X").split("×").join("X");
      const usados = new Set();
      for (const x of listaArt) {
        const a = String(x.a || "").trim(), fab = String(x.fabrica || "").trim();
        let b = null;
        if (x.id) b = delPedido.find((y) => y.id === x.id);
        else {
          const libres = delPedido.filter((y) => !usados.has(y.id) && (y.estado === "pendiente" || y.estado === "cubierto") && normT(y.talla) === normT(x.talla));
          const mismoColor = (y) => { const c1 = normalizeKey(y.color).trim(), c2 = normalizeKey(x.de).trim(); return !!(c1 && c2 && (c1 === c2 || c1.startsWith(c2) || c2.startsWith(c1))); };
          b = libres.find((y) => x.de && mismoColor(y)) || libres[0] || null;
          // Línea con cantidad>1 que quedó en un solo pendiente: ya cambiado.
          if (!b && delPedido.some((y) => usados.has(y.id) && normT(y.talla) === normT(x.talla))) continue;
          if (!b) { avisos.push("No encuentro la tapicería " + (x.talla || "") + (x.de ? " " + x.de : "") + " en Proveedores: no se ha cambiado su color."); continue; }
        }
        if (!b) continue;
        usados.add(b.id);
        objetivos.push({ b, cf: a, cfab: fab });
      }
    } else {
      const objetivo = todos ? delPedido.filter((b) => b.estado === "pendiente" || b.estado === "cubierto").map((b) => b.id) : (ids || []);
      for (const id of objetivo) {
        const b = delPedido.find((x) => x.id === id);
        if (b) objetivos.push({ b, cf: cfGlobal, cfab: cfabGlobal });
      }
    }
    for (const { b, cf, cfab } of objetivos) {
      const nombre = b.cantidad + "x " + b.stockModel + " " + b.talla;
      if (b.estado !== "pendiente" && b.estado !== "cubierto") { avisos.push(nombre + ": ya " + (b.estado === "servido" ? "ha salido" : "está " + b.estado) + ", no se ha cambiado."); continue; }
      const de = b.color || "";
      const fabricaAntes = b.mercanciaFabrica || "";
      if (cf) b.color = cf;
      const p = prodDe(b);
      if (b.proveedor === "POLIVAL" && p) {
        let texto = b.mercanciaFabrica || "";
        // Con el color nuevo de la web, la receta da el color y la rejilla de fábrica.
        if (cf) {
          let built = null;
          if (p.product_type === "Canapé") built = buildCanapeMercancia(p.title, cf, b.talla, services || "");
          else if (p.product_type === "Canapé fijo") built = buildCanapeFijoMercancia(cf, b.talla);
          else if (p.product_type === "Cabecero") {
            const k = matchCabeceroRecipeKey(p.title);
            const recipe = k ? CABECERO_RECIPES[k] : null;
            let acabado = recipe && recipe.colores ? recipe.colores[normalizeKey(cf)] : null;
            if (acabado && normalizeKey(cf) === "beige" && recipe.colores === CABECERO_ACABADOS_COMUNES) acabado = conInitial ? "Duna Lino" : "Duna Alpaca";
            if (acabado && /ACABADO:/i.test(texto)) built = { texto: texto.replace(/ACABADO:\s*[^·]+/i, "ACABADO: " + acabado).trim() };
          }
          if (built && built.texto) {
            texto = built.texto;
            if (b.formato160) texto = textoConFormato160(texto, b.formato160);
          } else if (!cfab) {
            avisos.push(nombre + ": no tengo el color \"" + cf + "\" en la receta de fábrica — escribe el color de fábrica o corrige \"Mercancía para pedir a fábrica\" a mano.");
          }
        }
        // El color de fábrica escrito a mano manda sobre la receta.
        if (cfab) {
          const m = /(COLOR|ACABADO):\s*([^·]+)/i.exec(texto);
          const viejo = m ? m[2].trim() : "";
          if (viejo) texto = texto.split(viejo).join(cfab);
          else texto = (texto ? texto + " · " : "") + "COLOR: " + cfab;
          if (p.product_type === "Canapé" || p.product_type === "Canapé fijo") avisos.push(nombre + ": revisa la rejilla en \"Mercancía para pedir a fábrica\", por si cambia con el color " + cfab + ".");
        }
        b.mercanciaFabrica = texto || null;
        // La referencia de los canapés de madera lleva la letra del color.
        const refColor = p.referenciaTipo === "zenit" || p.referenciaTipo === "astra";
        // Ya pedido (Jennifer, 2026-10-20): se avisa con la referencia de
        // fábrica para que se lo diga a Polival; sigue como pedido y con la
        // misma referencia (no se vuelve a pedir). Sin pedir: queda
        // rectificado en el pedido a proveedor.
        if (b.pedidoGenerado) {
          avisos.push("⚠ " + nombre + " YA ESTABA PEDIDO a Polival" + (b.fechaPedidoFabrica ? " el " + new Date(b.fechaPedidoFabrica).toLocaleDateString("es-ES") : "") + " con la referencia " + (b.referencia || "(sin referencia)") + " en " + (de || "su color") + ": avisa a fábrica del cambio de color.");
          b.pedidoAnterior = { color: de, mercancia: fabricaAntes, fecha: b.fechaPedidoFabrica || null, referencia: b.referencia || null };
        } else if (refColor && cf && b.referencia) {
          const num = (String(b.referencia).match(/(\d+)(FUR)?$/) || [])[1];
          if (num) {
            const built = buildReferencia(num, p.referenciaTipo, b.color, /FUR$/.test(b.referencia));
            if (built.needsReview && built.reason) avisos.push(built.reason);
            else if (built.referencia) b.referencia = built.referencia;
          }
        }
      }
      b.cambioColor = { de: (b.cambioColor && b.cambioColor.de) || de, a: b.color || de, fabrica: cfab || null, fecha, usuario: usuario || null };
      cambios.push({ id: b.id, stockModel: b.stockModel, de, a: b.color, mercanciaFabrica: b.mercanciaFabrica });
    }
    await this.state.storage.put("backorders", backorders);
    return Response.json({ ok: true, cambios, avisos });
  }

  // El albarán decía que venía, pero al descargar el camión falta ese
  // colchón (Jennifer, 2026-09-08): deshace "Preparar para SEUR" — vuelve a
  // "pendiente" en Luso/New (se le suma de nuevo a "vendido pendiente", sin
  // tocar la cantidad real, que nunca se llegó a tocar) y sale de la carga.
  // Si ya se había dado de alta este envío en la plataforma de Seur con la
  // referencia anterior, la próxima vez que salga de verdad no puede repetir
  // la misma referencia (choca en Seur) — se avanza a la siguiente (ver
  // nextRefSuffix).
  // mantenerRef (Jennifer, 2026-10-06, 012517739-A): se preparó por error y
  // no salió ninguna etiqueta, así que la referencia no lleva sufijo nuevo.
  revertirCambioModelo(entry, nota) {
    entry.cambioNoSalio = { de: entry.stockModelOriginal, tallaDe: entry.tallaOriginal || entry.talla, a: entry.stockModel, tallaA: entry.talla, nota: nota || "", fecha: new Date().toISOString() };
    entry.stockModel = entry.stockModelOriginal;
    entry.talla = entry.tallaOriginal || entry.talla;
    delete entry.stockModelOriginal;
    delete entry.tallaOriginal;
  }

  async undoSeurBackorder(id, { mantenerRef, mantenerCarga, nota } = {}) {
    const backorders = await this.load("backorders", []);
    const entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });
    if (entry.estado !== "listo-seur") {
      return Response.json({ ok: false, error: "Este pendiente no está preparado para SEUR." }, { status: 409 });
    }

    // Cambio de modelo que al final no sale (Jennifer, 2026-10-16,
    // 002-26259L13344-A: se le ofreció un Nirvana en vez de su París pero
    // no había en stock): vuelve al colchón que compró, con una nota, y así
    // se pide a fábrica el original.
    if (entry.stockModelOriginal) this.revertirCambioModelo(entry, "Se le ofreció cambio por " + nombreCortoModeloSrv(entry.stockModel) + " " + entry.talla + ", pero a la hora de salir no había en stock");

    // Igual que en resolveSeurBackorder: "vendidoPendiente" solo existe para
    // colchones (Jennifer, 2026-09-22, gestos comerciales de almohada) y
    // nunca para reposiciones (Jennifer, 2026-10-07).
    if (entry.tipo === "colchon" && !entry.reposicion) {
      const stock = await this.load("stock", {});
      const key = stockKey(entry.stockModel, entry.talla);
      const row = stock[key] || { stockModel: entry.stockModel, talla: entry.talla, cantidad: 0, vendidoPendiente: 0 };
      const antes = row.vendidoPendiente || 0;
      row.vendidoPendiente = antes + entry.cantidad;
      stock[key] = row;
      await this.logMovement({
        stockModel: entry.stockModel,
        talla: entry.talla,
        campo: "vendidoPendiente",
        delta: entry.cantidad,
        resultante: row.vendidoPendiente,
        origen: "camion",
        orderNumber: entry.orderNumber,
        platform: entry.platform,
        orderRef: entry.orderRef,
      });
      await this.state.storage.put("stock", stock);
    }

    entry.estado = "pendiente";
    entry.recibidoFabrica = false;
    entry.fechaRecibido = null;
    // Su colchón se lo queda otro pedido (Jennifer, 2026-10-20,
    // 2001801948-A): vuelve a Luso/New como ya pedido, pero sigue en su carga
    // de SEUR como recordatorio de la fecha (no entra en el fichero de SEUR
    // hasta que se vuelva a preparar). Sin etiqueta hecha: misma referencia.
    if (mantenerCarga) {
      entry.recordatorioSeur = { fecha: new Date().toISOString(), nota: nota || "" };
      entry.pedidoGenerado = true;
      if (!entry.fechaPedidoFabrica) entry.fechaPedidoFabrica = new Date().toISOString();
    } else {
      entry.cargaId = null;
      if (!mantenerRef) entry.refSuffix = nextRefSuffix(entry.refSuffix);
    }

    await this.state.storage.put("backorders", backorders);
    return Response.json({ ok: true, entry });
  }

  // Pide a OrdersStore (el dueño de las cargas) la carga de SEUR abierta
  // para esa fecha exacta, creándola si no existe todavía — puede haber
  // varias cargas de SEUR abiertas a la vez (hoy y mañana), a diferencia de
  // Furniture que solo tiene una.
  async getOrCreateSeurCarga(fecha) {
    // También un día concreto AAAA-MM-DD laborable (Jennifer, 2026-09-30:
    // programar el envío para la fecha que pida el cliente).
    const esDia = /^\d{4}-\d{2}-\d{2}$/.test(fecha || "") && ![0, 6].includes(new Date(fecha + "T12:00:00Z").getUTCDay());
    if (fecha !== "hoy" && fecha !== "manana" && fecha !== "auto" && !esDia) return null;
    const id = this.env.ORDERS_STORE.idFromName("shopify");
    const stub = this.env.ORDERS_STORE.get(id);
    const res = await stub.fetch("https://do/cargas/seur/get-or-create", {
      method: "POST",
      body: JSON.stringify({ fecha }),
    });
    if (!res.ok) return null;
    return res.json();
  }

  // Corrección manual de la referencia de Polival (Jennifer, 2026-08-25):
  // siempre editable, por si la letra de color o el tipo automático no
  // encajan para un caso concreto.
  async setBackorderReferencia(id, referencia) {
    const backorders = await this.load("backorders", []);
    const entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });
    entry.referencia = referencia || "";
    // "STOCK" = ya está en el almacén (Jennifer, 2026-10-06, BEZEN12263):
    // queda marcado como recibido solo, y no hay que pedirlo a fábrica.
    if (String(referencia || "").trim().toUpperCase() === "STOCK" && !entry.recibidoFabrica) {
      entry.recibidoFabrica = true;
      entry.fechaRecibido = new Date().toISOString();
      entry.recibidoPorStock = true;
      if (!entry.pedidoGenerado) entry.pedidoGenerado = true;
    }
    await this.state.storage.put("backorders", backorders);
    return Response.json(entry);
  }

  // Corrección manual de "Mercancía para pedir a fábrica" (Jennifer,
  // 2026-08-25) — siempre editable, tanto si se autogeneró por receta
  // (canapés) como si estaba en blanco (resto de artículos).
  async setBackorderMercancia(id, mercanciaFabrica) {
    const backorders = await this.load("backorders", []);
    const entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });
    entry.mercanciaFabrica = mercanciaFabrica || "";
    await this.state.storage.put("backorders", backorders);
    return Response.json(entry);
  }

  // Correlación "cómo se llama en Shopify" -> "cómo hay que pedirlo a
  // fábrica" (Jennifer, 2026-08-25) — por modelo (stockModel), no por
  // pendiente suelto, así que se pone una vez y sirve para todos los
  // pedidos futuros de ese mismo artículo.
  async setNombreFabricacion({ stockModel, nombre }) {
    if (!stockModel) return new Response("falta stockModel", { status: 400 });
    const fabricacion = await this.load("fabricacion", {});
    fabricacion[stockModel] = nombre || "";
    await this.state.storage.put("fabricacion", fabricacion);
    return Response.json({ ok: true });
  }

  // Al generar el PDF de pedido a fábrica con los artículos marcados, se
  // guardan como "ya pedidos" (con fecha) — siguen en la lista de
  // Proveedores para no perder el rastro, se cierran del todo solo cuando
  // el pedido del cliente se marca enviado (settleShipment), igual que
  // siempre.
  async markOrdered({ ids, unmark, sinFecha }) {
    const backorders = await this.load("backorders", []);
    const set = new Set(ids || []);
    let marcados = 0;
    const fecha = new Date().toISOString();
    for (const b of backorders) {
      if (!set.has(b.id)) continue;
      b.pedidoGenerado = !unmark;
      // `sinFecha` (Jennifer, 2026-09-23): marcar "pedido a fábrica" SIN
      // fecha a propósito, para los pendientes que ella pide ya por otra
      // vía distinta al PDF normal — así puede distinguir de un vistazo
      // los marcados a mano de los que salgan del proceso automático
      // (esos sí llevan fecha, como siempre).
      b.fechaPedidoFabrica = (unmark || sinFecha) ? null : fecha;
      marcados++;
    }
    if (marcados > 0) await this.state.storage.put("backorders", backorders);
    return Response.json({ ok: true, marcados });
  }

  // Cuando Jennifer responde a todas las preguntas de un pedido (ver
  // reviewReasons/reviewAnswers en OrdersStore), sus pendientes bloqueados
  // se sueltan y aparecen ya en su carpeta de Proveedores normal. Si más
  // tarde borra una respuesta, OrdersStore vuelve a llamar aquí con
  // relock:true para bloquearlos otra vez.
  async releaseDecision({ orderId, relock }) {
    const backorders = await this.load("backorders", []);
    let cambiados = 0;
    for (const b of backorders) {
      // Solo se tocan los que nacieron de una duda real (needsDecision,
      // fijo desde que se crearon) — nunca artículos que nunca estuvieron
      // bloqueados.
      if (b.orderId !== orderId || !b.needsDecision) continue;
      const nuevo = !!relock;
      if (b.pendingDecision !== nuevo) {
        b.pendingDecision = nuevo;
        cambiados++;
      }
    }
    if (cambiados > 0) await this.state.storage.put("backorders", backorders);
    return Response.json({ ok: true, cambiados });
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

  // Mantenimiento puntual (Jennifer, 2026-09-18, caso real BEZEN12212: las
  // almohadas de regalo no se procesaban hasta ahora): añade UN artículo
  // suelto a un pedido que YA se procesó, sin volver a tocar lo que ya se
  // descontó — a diferencia de force-process (que reprocesa todo el pedido
  // y duplicaría el descuento de los artículos ya resueltos). Reusa
  // resolveItem/applyStockUsage/addNoStockBackorder tal cual, para un solo
  // item — mismo cálculo de stock/referencia que en un pedido normal.
  async addItemToProcessedOrder({ orderId, orderNumber, platform, orderRef, orderDate, item, esPack, colorOverride, tallaOverride, services }) {
    const products = await this.load("products", {});
    const resolved = resolveItem(item, products);
    if (resolved.tipo === "pack" || resolved.tipo === "desconocido") {
      return Response.json({ ok: false, error: "No se ha podido resolver este artículo contra el Catálogo." }, { status: 400 });
    }
    // Un componente de pack (canapé/cabecero) que se añade a mano no pasa
    // por resolvePackSku, así que el color/talla que calcularía resolveItem
    // para un Cabecero SUELTO (formato "Cama X - Medida final Ycm", ver
    // parseCabeceroVariant) no vale aquí dentro de un pack — se puede
    // forzar el valor correcto explícitamente (Jennifer, 2026-09-19, caso
    // real BEZEN12207 y similares).
    if (colorOverride !== undefined) resolved.color = colorOverride;
    if (tallaOverride !== undefined) resolved.talla = tallaOverride;
    const stock = await this.load("stock", {});
    const backorders = await this.load("backorders", []);
    const proveedor = resolved.product.proveedor || null;
    const isStockTracked = STOCK_TYPES.has(resolved.tipo);

    if (!isStockTracked || resolved.product.noStock) {
      if (!proveedor) {
        return Response.json({ ok: false, error: "Este artículo no tiene proveedor asignado en el Catálogo." }, { status: 400 });
      }
      let referencia = null;
      if (proveedor === "POLIVAL") {
        const numero = await nextReferenciaNumero(this.state);
        // Sin acceso aquí al `agencia` real del pedido (herramienta manual,
        // fuera del flujo normal de processSale) — mismo criterio salvo esa
        // parte; Jennifer puede corregir la referencia a mano si hiciera falta.
        const vaFurniture = resolved.tipo === "tapiceria" || resolved.product.exceptionFurniture;
        const built = buildReferencia(numero, resolved.product.referenciaTipo, resolved.color, vaFurniture);
        referencia = built.referencia;
      }
      // Igual que hace el motor normal (processSale) para canapés/cabeceros
      // de Polival — sin esto, un componente de pack añadido a mano se
      // quedaría con "Mercancía para pedir a fábrica" en blanco.
      let mercanciaFabrica = null;
      if (proveedor === "POLIVAL" && resolved.product.product_type === "Canapé") {
        const built = buildCanapeMercancia(resolved.product.title, resolved.color, resolved.talla, services || "");
        mercanciaFabrica = built.texto;
      } else if (proveedor === "POLIVAL" && resolved.product.product_type === "Cabecero") {
        const built = buildCabeceroMercancia(resolved.product.title, resolved.color, resolved.talla, "");
        mercanciaFabrica = built.texto;
      } else if (proveedor === "POLIVAL" && resolved.product.product_type === "Canapé fijo") {
        const built = buildCanapeFijoMercancia(resolved.color, resolved.talla);
        mercanciaFabrica = built.texto;
      } else if (proveedor === "POLIVAL" && resolved.product.product_type === "Colchones") {
        const built = buildColchonMercancia(resolved.product.stockModel, resolved.talla);
        mercanciaFabrica = built.texto;
      } else if (proveedor === "POLIVAL" && resolved.product.product_type === "Base" && platform === "Groupon") {
        mercanciaFabrica = buildBaseGrouponMercancia(resolved.product.stockModel, resolved.talla).texto;
      }
      this.addNoStockBackorder(backorders, resolved, orderId, orderNumber, !!esPack, orderDate, proveedor, false, referencia, mercanciaFabrica, platform, orderRef);
      await this.state.storage.put("backorders", backorders);
    } else {
      await this.applyStockUsage(stock, backorders, resolved, orderId, orderNumber, !!esPack, orderDate, proveedor, false, "", platform, orderRef);
      await this.state.storage.put("stock", stock);
      await this.state.storage.put("backorders", backorders);
    }
    return Response.json({ ok: true });
  }

  // Preview de resolución de un artículo (Jennifer, 2026-09-21): igual que
  // resolveItem, pero sin crear ningún pendiente — solo para que index.js
  // pueda calcular el desglose real de piezas físicas (descripcionesBackorder,
  // las mismas reglas que usa la exportación a Furniture) antes de que
  // Jennifer confirme la reposición.
  async resolverItemPreview({ item, cambio }) {
    const products = await this.load("products", {});
    const resolved = resolverItemReposicion(item, cambio, products);
    if (resolved.tipo === "pack" || resolved.tipo === "desconocido") {
      return Response.json({ ok: false, error: "No se ha podido resolver este artículo contra el Catálogo." }, { status: 400 });
    }
    return Response.json({
      ok: true,
      stockModel: resolved.product.stockModel,
      talla: resolved.talla,
      color: resolved.color,
      tipo: resolved.tipo,
    });
  }

  // Reposición de una pieza rota (Jennifer, 2026-09-21, caso real: canapé
  // de 3 piezas, una llega rota, hay que pedirle a Polival solo esa pieza
  // y que acabe en Furniture cuando llegue). A diferencia de
  // addItemToProcessedOrder, para tapicería/cabecero/almohada SIEMPRE se
  // trata como pedido nuevo a proveedor — nunca descuenta stock real
  // (una reposición de garantía no es una venta nueva). `item` es el
  // artículo REAL del pedido (elegido en un desplegable en el cliente, con
  // su productId real) — se resuelve con resolveItem tal cual, igual que
  // addItemToProcessedOrder, para heredar gratis el mismo cálculo de
  // color/talla por tipo de producto (incluido el caso especial de
  // Cabecero).
  //
  // Cuando la reposición es de un COLCHÓN (Jennifer, 2026-09-22), el
  // comportamiento es distinto en dos aspectos: (1) hay que elegir agencia
  // — SEUR (el colchón se devolvió mal por SEUR, solo hay que reenviarlo)
  // o FURNITURE (incidencia real, puede hacer falta recoger el colchón
  // dañado a la vez que se entrega el nuevo — SEUR no puede hacer
  // recogidas); (2) en ambos casos SÍ se comprueba el stock real primero
  // (a diferencia de tapicería): si hay, se descuenta; si no, se genera
  // igualmente un pendiente a Luso/New. `agenciaReposicion` decide dónde
  // aparece: SEUR usa el mismo botón "Preparar para SEUR" que un colchón
  // suelto normal (ver esColchonSeur en index.js); FURNITURE usa la línea
  // independiente de Furniture, igual que una reposición de tapicería.
  async crearReposicion({ orderId, orderNumber, platform, orderRef, orderDate, item, piezaTexto, parte, agenciaReposicion, recogida, recogidaDestino, cambio, unidades, piezas, piezasIdx, canapeCompleto, services, productoTexto, piezaManual, serviciosReposicion, revisionMontaje, servicioMontaje, detalleMontaje }) {
    // Revisión de montaje (Jennifer, 2026-10-22, BEZEN11036): Furniture va a
    // casa del cliente sin llevar mercancía. Línea propia como una
    // reposición (su propia carga), referencia "REVISIÓN" + pedido, artículo
    // "REVISIÓN MONTAJE" y solo subida a piso. Sin proveedor: no se pide
    // nada a fábrica ni sale en Proveedores, y ya está "recibida".
    if (revisionMontaje) {
      if (!orderId) return Response.json({ ok: false, error: "Falta el pedido." }, { status: 400 });
      const backorders = await this.load("backorders", []);
      const id = crypto.randomUUID();
      pushBackorder(backorders, {
        id, orderId, orderNumber, stockModel: "REVISIÓN MONTAJE", talla: "", color: "", tipo: "servicio", cantidad: 1,
        orderDate: new Date().toISOString(), esPack: false, proveedor: null, needsDecision: false, referencia: null,
        mercanciaFabrica: "REVISIÓN DE MONTAJE — no se lleva mercancía ni se pide a fábrica",
        platform, orderRef, reposicion: true, piezaTexto: "REVISIÓN MONTAJE", recibidoFabrica: true, agenciaReposicion: "FURNITURE",
      });
      const b = backorders.find((x) => x.id === id);
      b.piezaManual = "REVISIÓN MONTAJE";
      b.revisionMontaje = true;
      // Servicio de montaje (Jennifer, 2026-11-04, BEZEN12278): igual que la
      // revisión (sin mercancía, sin fábrica) pero Furniture va a MONTAR:
      // sale con "SUBIDA Y MONTAJE" y referencia "MONTAJE" + pedido.
      if (servicioMontaje) {
        const detalle = String(detalleMontaje || "").trim().toUpperCase();
        b.servicioMontaje = true;
        b.detalleMontaje = detalle || null;
        b.stockModel = "SERVICIO MONTAJE" + (detalle ? " " + detalle : "");
        b.piezaTexto = "SERVICIO MONTAJE";
        b.piezaManual = "SERVICIO MONTAJE";
        b.mercanciaFabrica = "SERVICIO DE MONTAJE — no se lleva mercancía ni se pide a fábrica";
      }
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, id, enStock: 0 });
    }
    // Servicios adicionales en Furniture (Jennifer, 2026-10-20): recoger y
    // devolver a fábrica, retirada para desechar, montaje…
    const servicios = Array.isArray(serviciosReposicion) ? serviciosReposicion.map((s) => String(s || "").trim()).filter(Boolean) : [];
    // Pieza escrita a mano (Jennifer, 2026-10-14): pletinas de unión, juego
    // de hidráulicos, bisagras... Es el "modelo" de la reposición, nunca se
    // descuenta stock de colchón por ella y no lleva desglose de piezas.
    piezaManual = String(piezaManual || "").trim().toUpperCase() || null;
    if (piezaManual) { canapeCompleto = false; piezas = null; piezasIdx = null; }
    const products = await this.load("products", {});
    const resolved = resolverItemReposicion(item, cambio, products);
    // Número de unidades (Jennifer, 2026-10-07: "tengo que poder elegir el
    // número de unidades") — antes siempre 1.
    const cantidad = Math.max(1, Math.min(20, Math.floor(Number(unidades) || 1)));
    // Las piezas escritas a mano son genéricas (Jennifer, 2026-10-14,
    // BEZEN11965: "las pletinas de unión son genéricas, no tienes que asociar
    // nada con el canapé"): se piden tal cual, sin modelo/medida/color, a
    // Polival (o al proveedor del artículo si no es tapicería, ej. Luso).
    if (piezaManual) {
      if (!["FURNITURE", "SEUR", "NACEX"].includes(agenciaReposicion)) {
        return Response.json({ ok: false, error: "Indica por dónde sale: FURNITURE, SEUR o NACEX." }, { status: 400 });
      }
      const prov = (resolved.product && resolved.tipo !== "tapiceria" && resolved.product.proveedor) || "POLIVAL";
      const backorders = await this.load("backorders", []);
      const id = crypto.randomUUID();
      pushBackorder(backorders, {
        id, orderId, orderNumber, stockModel: piezaManual, talla: "", color: "", tipo: "tapiceria", cantidad,
        orderDate: new Date().toISOString(), esPack: false, proveedor: prov, needsDecision: false,
        referencia: prov === "POLIVAL" ? await nextReposicionReferencia(this.state) : null,
        mercanciaFabrica: "PIEZA A REPONER: " + (piezaTexto || piezaManual),
        platform, orderRef, reposicion: true, piezaTexto: piezaTexto || piezaManual, recibidoFabrica: false, agenciaReposicion,
      });
      backorders.find((b) => b.id === id).piezaManual = piezaManual;
      if (servicios.length && agenciaReposicion === "FURNITURE") backorders.find((b) => b.id === id).serviciosReposicion = servicios;
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, id, enStock: 0 });
    }
    if (resolved.tipo === "pack" || resolved.tipo === "desconocido") {
      return Response.json({ ok: false, error: "No se ha podido resolver este artículo contra el Catálogo." }, { status: 400 });
    }
    const { product, talla, tipo } = resolved;
    let { color } = resolved;
    const proveedor = product.proveedor || null;
    if (!proveedor) {
      return Response.json({ ok: false, error: "Este artículo no tiene proveedor asignado en el Catálogo." }, { status: 400 });
    }
    if (piezaManual && !["FURNITURE", "SEUR", "NACEX"].includes(agenciaReposicion)) {
      return Response.json({ ok: false, error: "Indica por dónde sale: FURNITURE, SEUR o NACEX." }, { status: 400 });
    }
    if (tipo === "colchon" && !piezaManual && agenciaReposicion !== "SEUR" && agenciaReposicion !== "FURNITURE") {
      return Response.json({ ok: false, error: "Falta indicar si el colchón sale por SEUR o por FURNITURE." }, { status: 400 });
    }

    // Referencia propia de reposición (Jennifer, 2026-09-21) — nunca el
    // correlativo/letra normal de Polival (MR/ASTRA/FUR...), siempre
    // "I-001", "I-002"... sea cual sea el modelo o el proveedor.
    const referencia = proveedor === "POLIVAL" ? await nextReposicionReferencia(this.state) : null;

    let mercanciaFabrica = null;
    // CANAPÉ COMPLETO (Jennifer, 2026-10-07: "que se pidieran como se piden
    // los canapés de cero, con la misma descripción"): la receta normal de
    // fábrica, con la tapa partida/reforzada del pedido, y sin añadir la
    // pieza a reponer. Si el pedido no trae color (Maison du Monde), se busca
    // en el texto del producto ("en tela beige").
    let recetaCanapeCompleto = false;
    if (canapeCompleto && product.product_type === "Canapé") {
      if (!color) color = adivinarColorCanape(product.title, productoTexto);
      const built = buildCanapeMercancia(product.title, color, talla, services || "");
      if (built.texto) {
        mercanciaFabrica = built.texto;
        recetaCanapeCompleto = true;
      }
    }
    if (mercanciaFabrica) {
      // ya resuelto arriba (canapé completo)
    } else if (product.product_type === "Canapé") {
      mercanciaFabrica = buildCanapeMercancia(product.title, color, talla, "").texto || null;
    } else if (product.product_type === "Cabecero") {
      mercanciaFabrica = buildCabeceroMercancia(product.title, color, talla, "").texto || null;
    } else if (product.product_type === "Canapé fijo") {
      mercanciaFabrica = buildCanapeFijoMercancia(color, talla).texto || null;
    } else if (product.product_type === "Colchones") {
      mercanciaFabrica = buildColchonMercancia(product.stockModel, talla).texto || null;
    }
    if (!mercanciaFabrica) {
      mercanciaFabrica = product.stockModel + (talla ? " - MEDIDA: " + talla : "") + (color ? " - COLOR: " + color : "");
    }

    // Stock real solo para colchones (Jennifer, 2026-09-22). Con varias
    // unidades (Jennifer, 2026-10-07: "no ha detectado que en el stock había
    // una"), se usa lo que haya en el fondo común y SOLO lo que falte se
    // pide a Luso/New — en UNA sola línea (Jennifer, 2026-10-07: "la línea
    // tendría que haber sido de 2 unidades y poner una en stock", porque
    // salen juntas por SEUR): `enStock` = unidades ya descontadas del stock;
    // al pedido a fábrica solo va cantidad - enStock.
    let enStock = 0;
    if (tipo === "colchon" && !piezaManual) {
      const congelado = await this.load("stockCongelado", false);
      const stock = await this.load("stock", {});
      const key = stockKey(product.stockModel, talla);
      const row = stock[key] || { stockModel: product.stockModel, talla, cantidad: 0, vendidoPendiente: 0 };
      enStock = Math.max(0, Math.min(cantidad, row.cantidad || 0));
      if (enStock > 0 && !congelado) {
        row.cantidad -= enStock;
        stock[key] = row;
        await this.state.storage.put("stock", stock);
        await this.logMovement({
          stockModel: product.stockModel, talla, campo: "cantidad", delta: -enStock, resultante: row.cantidad,
          origen: "reposicion", orderNumber, platform, orderRef,
        });
      }
    }
    if (enStock >= cantidad) {
      mercanciaFabrica = "REPOSICIÓN — ya en stock, no hace falta pedir a fábrica";
    } else if (enStock > 0) {
      mercanciaFabrica += " · " + enStock + " UD YA EN STOCK (descontada) — PEDIR " + (cantidad - enStock);
    }
    if (piezaTexto && !recetaCanapeCompleto) mercanciaFabrica += " · PIEZA A REPONER: " + piezaTexto;
    // Si va por Furniture y ya está TODO en el almacén, no hace falta
    // esperar a "Marcar recibido" — está físicamente disponible ya.
    const recibidoFabrica = enStock >= cantidad && agenciaReposicion === "FURNITURE";

    // "Modelo" de la reposición: la PIEZA elegida (ej. "TAPA"), no el
    // nombre completo del canapé (Jennifer, 2026-09-21) — medida y color se
    // conservan igual, vienen del artículo real resuelto arriba. Solo tiene
    // sentido para Canapé/Base, que de verdad se descomponen en piezas
    // físicas distintas (TAPA/CAJÓN/FONDO, BASE/PATAS) — para cabecero,
    // colchón, almohada, topper o protector NO hay una pieza más pequeña
    // que reponer: "parte" ahí solo repetiría la categoría genérica
    // (COLCHÓN/CABECERO...) y se perdería el modelo real, así que se
    // ignora y se mantiene el nombre completo del artículo.
    const tieneDesglosePiezas = product.product_type === "Canapé" || product.stockModel.toLowerCase().includes("base");
    // Varias piezas a la vez o el canapé entero (Jennifer, 2026-10-07): una
    // sola reposición (misma referencia, mismo pedido a fábrica y mismo
    // envío). El modelo es "TAPA + CAJÓN…" o el canapé completo.
    const variasPiezas = tieneDesglosePiezas && Array.isArray(piezas) && piezas.length > 1;
    const stockModelFinal = piezaManual ? piezaManual
      : !tieneDesglosePiezas || canapeCompleto ? product.stockModel
      : variasPiezas ? piezas.join(" + ")
      : (parte || product.stockModel);

    const backorders = await this.load("backorders", []);
    const id = crypto.randomUUID();
    pushBackorder(backorders, {
      id,
      orderId, orderNumber,
      stockModel: stockModelFinal,
      // Fecha de HOY, no la del pedido original (Jennifer, 2026-09-22): una
      // reposición puede pedirse semanas después de la venta, y Polival/New/
      // Furniture ordenan sus listas de pendientes por esta fecha — si se
      // usara la del pedido, una reposición de un pedido antiguo se colaría
      // al fondo del listado y se quedaría "traspapelada" en vez de
      // aparecer arriba, recién añadida. orderDate (recibido del cliente)
      // se ignora a propósito para este campo.
      talla, color, tipo, cantidad, orderDate: new Date().toISOString(),
      esPack: false, proveedor, needsDecision: false, referencia, mercanciaFabrica,
      platform, orderRef, reposicion: true, piezaTexto: piezaTexto || "",
      recibidoFabrica,
      agenciaReposicion: piezaManual || tipo === "colchon" ? agenciaReposicion : null,
      recogida: tipo === "colchon" && !piezaManual && agenciaReposicion === "FURNITURE" ? !!recogida : false,
      recogidaDestino: tipo === "colchon" && !piezaManual && agenciaReposicion === "FURNITURE" && recogida ? (recogidaDestino || null) : null,
    });
    const nuevo = backorders.find((b) => b.id === id);
    if (enStock > 0) nuevo.enStock = enStock;
    if (piezaManual) { nuevo.piezaManual = piezaManual; nuevo.stockModelArticulo = product.stockModel; }
    // Para sacar en Furniture un bulto por pieza elegida (ver
    // buildFurnitureExport): el modelo real del artículo y qué piezas son.
    if (tieneDesglosePiezas && Array.isArray(piezasIdx) && piezasIdx.length) {
      nuevo.stockModelArticulo = product.stockModel;
      nuevo.piezasIdx = piezasIdx.map(Number).filter((n) => Number.isInteger(n) && n >= 0);
      if (canapeCompleto) nuevo.canapeCompleto = true;
    }
    // Reposición que en realidad es un CAMBIO (Jennifer, 2026-10-07): se
    // apunta qué artículo tenía el pedido antes.
    if (cambio) nuevo.cambio = { de: String(cambio.de || "") };
    // Solo si sale por Furniture (tapicería siempre; colchón si se eligió).
    if (servicios.length && (tipo !== "colchon" ? (!piezaManual || agenciaReposicion === "FURNITURE") : agenciaReposicion === "FURNITURE")) nuevo.serviciosReposicion = servicios;
    await this.state.storage.put("backorders", backorders);
    // Devuelve el id (Jennifer, 2026-09-21) — hace falta para poder subir
    // fotos justificando el motivo justo después de crear la reposición
    // (ver /admin/reposicion/foto). `enStock`: cuántas salen del stock.
    return Response.json({ ok: true, id, enStock });
  }

  // Adjuntar foto(s) a una reposición ya creada (Jennifer, 2026-09-21):
  // guarda solo la clave de R2 en el backorder — el binario vive en el
  // bucket, nunca en Durable Object storage.
  async adjuntarFotoReposicion({ id, key }) {
    const backorders = await this.load("backorders", []);
    const b = backorders.find((x) => x.id === id);
    if (!b) return Response.json({ ok: false, error: "Reposición no encontrada." }, { status: 404 });
    b.fotos = [...(b.fotos || []), key];
    await this.state.storage.put("backorders", backorders);
    return Response.json({ ok: true, fotos: b.fotos });
  }

  // Gesto comercial (Jennifer, 2026-09-22): pedido ya entregado con algún
  // daño donde no compensa gestionar el cambio de la pieza, o retraso — se
  // compensa con 1-2 almohadas de regalo (cualquiera de los 4 modelos que
  // se trabajan). A diferencia de crearReposicion (que SIEMPRE pide nuevo a
  // proveedor), aquí SÍ se descuenta de stock real si lo hay, igual que una
  // venta normal — Jennifer no quiere pedir almohadas nuevas a Polival si ya
  // las tenemos en el almacén. Si falta alguna unidad, esa parte sí genera
  // un pendiente a Polival, con referencia propia "GC-XXX" (nunca la
  // numeración normal de almohadas, para reconocerlo a simple vista).
  // Al ser almohadas, salen por SEUR — no por Furniture (Jennifer,
  // 2026-09-22, corrigió mi primera versión) — así que nace siempre
  // "pendiente" con proveedor asignado, para que aparezca en Proveedores >
  // Polival con el mismo botón "Preparar para SEUR" que ya usan los
  // colchones sueltos (ver resolveSeurBackorder). Cuando ya está cubierta
  // con stock real, ese botón queda disponible de inmediato — no hace falta
  // esperar ni marcar "recibido" primero.
  // agencia "FURNITURE" (Jennifer, 2026-10-20): solo si al pedido le queda
  // mercancía por salir por Furniture — la almohada se junta con ese envío
  // (mismo pedido, sin línea propia ni carga de SEUR).
  async crearGestoComercial({ orderId, orderNumber, platform, orderRef, orderDate, productId, talla, cantidad, motivo, agencia }) {
    const porFurniture = agencia === "FURNITURE";
    if (porFurniture) {
      const bos = await this.load("backorders", []);
      const quedaFurniture = bos.some((b) => String(b.orderId) === String(orderId) && (b.estado === "pendiente" || b.estado === "cubierto")
        && !b.reposicion && !b.gestoComercial && !b.envioAparte && !b.paraStock && !((b.tipo === "colchon" || b.tipo === "topper") && b.tipoEnvio !== "FUR"));
      if (!quedaFurniture) return Response.json({ ok: false, error: "Este pedido no tiene nada pendiente de enviar por Furniture: el gesto comercial tiene que ir por SEUR." }, { status: 400 });
    }
    const cantidadNum = Number(cantidad);
    if (!Number.isInteger(cantidadNum) || cantidadNum < 1 || cantidadNum > 2) {
      return Response.json({ ok: false, error: "La cantidad debe ser 1 o 2." }, { status: 400 });
    }
    const products = await this.load("products", {});
    const product = products[productId];
    if (!product || product.product_type !== "Almohada") {
      return Response.json({ ok: false, error: "Elige una almohada real del Catálogo." }, { status: 400 });
    }
    const tallaNorm = normalizeTalla(talla) || String(talla || "").trim();
    if (!tallaNorm) return Response.json({ ok: false, error: "Falta la medida." }, { status: 400 });

    const congelado = await this.load("stockCongelado", false);
    const stock = await this.load("stock", {});
    const key = stockKey(product.stockModel, tallaNorm);
    const row = stock[key] || { stockModel: product.stockModel, talla: tallaNorm, cantidad: 0, vendidoPendiente: 0 };
    const covered = Math.min(row.cantidad, cantidadNum);
    if (!congelado) row.cantidad -= covered;
    if (covered > 0) {
      if (!congelado) await this.logMovement({
        stockModel: product.stockModel,
        talla: tallaNorm,
        campo: "cantidad",
        delta: -covered,
        resultante: row.cantidad,
        origen: "gesto_comercial",
        orderNumber,
        platform,
        orderRef,
      });
    }
    stock[key] = row;

    const falta = cantidadNum - covered;
    let referencia = null;
    let mercanciaFabrica;
    if (falta > 0) {
      referencia = await nextGestoComercialReferencia(this.state);
      const built = buildSimpleMercancia(product.title, tallaNorm);
      mercanciaFabrica = (built.texto || product.stockModel) + ` · GESTO COMERCIAL (${falta} ud. a pedir)`;
    } else {
      mercanciaFabrica = "GESTO COMERCIAL — ya en stock, no hace falta pedir a fábrica";
    }

    const backorders = await this.load("backorders", []);
    const id = crypto.randomUUID();
    pushBackorder(backorders, {
      id,
      orderId, orderNumber,
      stockModel: product.stockModel,
      talla: tallaNorm,
      color: "",
      tipo: "almohada",
      cantidad: cantidadNum,
      // Fecha de HOY, no la del pedido original (Jennifer, 2026-09-22) —
      // mismo motivo que en crearReposicion: un gesto comercial puede
      // registrarse mucho después de la venta, y si se ordenara por la
      // fecha del pedido se quedaría traspapelado al fondo de Polival/New/
      // Furniture en vez de aparecer arriba, recién añadido.
      orderDate: new Date().toISOString(),
      esPack: false,
      // Siempre POLIVAL (aunque ya esté cubierta con stock) para que la fila
      // aparezca en Proveedores > Polival y desde ahí se pueda "Preparar
      // para SEUR" — nunca queda huérfana sin pestaña donde mostrarse.
      proveedor: product.proveedor || "POLIVAL",
      needsDecision: false,
      referencia,
      mercanciaFabrica,
      estado: "pendiente",
      recibidoFabrica: false,
      platform, orderRef,
      gestoComercial: true,
      piezaTexto: motivo || "",
    });
    if (porFurniture) {
      const nb = backorders.find((x) => x.id === id);
      nb.gcFurniture = true;
      nb.tipoEnvio = "FUR";
      if (falta === 0) { nb.estado = "cubierto"; nb.recibidoFabrica = true; }
    }
    await this.state.storage.put("stock", stock);
    await this.state.storage.put("backorders", backorders);
    if (porFurniture) return Response.json({ ok: true, id, referencia, cubiertoConStock: covered, carga: null, furniture: true });
    // Todo en stock (Jennifer, 2026-10-15, GCBEZEN12211): no pasa por
    // Polival — directo a la carga de SEUR (antes de las 15:00 la de hoy,
    // después la de mañana). Solo almohadas: nunca por Furniture.
    let carga = null;
    if (falta === 0) {
      const r = await (await this.resolveSeurBackorder(id, "auto")).json().catch(() => ({}));
      if (r.ok) carga = r.carga;
    }
    return Response.json({ ok: true, id, referencia, cubiertoConStock: covered, carga });
  }

  // === TARIFAS (Jennifer, 2026-09-22) ===
  // Guarda (o amplía, nunca reemplaza el proveedor entero) una tarifa de
  // coste de un proveedor para un periodo concreto (ej. "New Mattress" /
  // "2026-07" / "Julio 2026"). `precios` = { stockModel: { talla: precio } }
  // — se hace merge por stockModel+talla, así que subir una tarifa nueva no
  // borra otros modelos ya cargados en ese mismo periodo.
  async setTarifaCoste({ proveedor, periodo, label, precios }) {
    if (!proveedor || !periodo || !precios) {
      return Response.json({ ok: false, error: "Faltan proveedor, periodo o precios." }, { status: 400 });
    }
    const tarifas = await this.load("tarifasCoste", {});
    if (!tarifas[proveedor]) tarifas[proveedor] = {};
    if (!tarifas[proveedor][periodo]) tarifas[proveedor][periodo] = { label: label || periodo, precios: {} };
    if (label) tarifas[proveedor][periodo].label = label;
    for (const [stockModel, porTalla] of Object.entries(precios)) {
      if (!tarifas[proveedor][periodo].precios[stockModel]) tarifas[proveedor][periodo].precios[stockModel] = {};
      Object.assign(tarifas[proveedor][periodo].precios[stockModel], porTalla);
    }
    await this.state.storage.put("tarifasCoste", tarifas);
    return Response.json({ ok: true });
  }

  // Precio de envío por modelo+talla+país (Jennifer, 2026-09-22, tabla de
  // transporte) — `precios` = { stockModel: { talla: { ES, FR, IT, DE } } },
  // también con merge, nunca reemplazo entero.
  async setTarifaEnvio({ precios, usuario, origen }) {
    if (!precios) return Response.json({ ok: false, error: "Faltan precios." }, { status: 400 });
    const envios = await this.load("tarifasEnvio", {});
    // Historial de cambios de porte (Jennifer, 2026-11-06): qué, de cuánto a
    // cuánto, quién y cuándo, para poder deshacerlo.
    const historial = await this.load("tarifasEnvioHistorial", []);
    const ahora = new Date().toISOString();
    for (const [stockModel, porTalla] of Object.entries(precios)) {
      if (!envios[stockModel]) envios[stockModel] = {};
      for (const [talla, porPais] of Object.entries(porTalla)) {
        const antes = envios[stockModel][talla] || {};
        for (const [pais, valor] of Object.entries(porPais || {})) {
          if (antes[pais] === valor) continue;
          historial.push({ id: crypto.randomUUID(), fecha: ahora, usuario: usuario || null, origen: origen || null, stockModel, talla, pais, antes: antes[pais] == null ? null : antes[pais], despues: valor });
        }
        envios[stockModel][talla] = { ...antes, ...porPais };
      }
    }
    await this.state.storage.put("tarifasEnvio", envios);
    await this.state.storage.put("tarifasEnvioHistorial", historial.slice(-3000));
    return Response.json({ ok: true });
  }
  async deshacerCambioEnvio({ id, usuario }) {
    const historial = await this.load("tarifasEnvioHistorial", []);
    const h = historial.find((x) => x.id === id);
    if (!h) return Response.json({ ok: false, error: "Cambio no encontrado." }, { status: 404 });
    if (h.deshecho) return Response.json({ ok: false, error: "Ese cambio ya se deshizo." }, { status: 400 });
    const envios = await this.load("tarifasEnvio", {});
    const fila = (envios[h.stockModel] && envios[h.stockModel][h.talla]) || {};
    if (fila[h.pais] !== h.despues) return Response.json({ ok: false, error: "El porte se ha vuelto a cambiar después (ahora " + fila[h.pais] + " €): deshaz primero el cambio más reciente." }, { status: 409 });
    if (!envios[h.stockModel]) envios[h.stockModel] = {};
    const nueva = { ...fila };
    if (h.antes == null) delete nueva[h.pais]; else nueva[h.pais] = h.antes;
    envios[h.stockModel][h.talla] = nueva;
    h.deshecho = { fecha: new Date().toISOString(), usuario: usuario || null };
    historial.push({ id: crypto.randomUUID(), fecha: h.deshecho.fecha, usuario: usuario || null, origen: "Deshacer", stockModel: h.stockModel, talla: h.talla, pais: h.pais, antes: h.despues, despues: h.antes });
    await this.state.storage.put("tarifasEnvio", envios);
    await this.state.storage.put("tarifasEnvioHistorial", historial.slice(-3000));
    return Response.json({ ok: true });
  }

  // Qué periodo de coste usar como "vigente" para un modelo concreto
  // (Jennifer, 2026-09-22: por defecto el más reciente que suba, pero
  // Toscana Deluxe usa Mayo porque Julio no lo incluye — excepción a mano
  // por modelo, no automática).
  async setTarifaPeriodoActivo({ stockModel, proveedor, periodo }) {
    if (!stockModel || !proveedor || !periodo) {
      return Response.json({ ok: false, error: "Faltan stockModel, proveedor o periodo." }, { status: 400 });
    }
    const activos = await this.load("tarifasPeriodoActivo", {});
    activos[stockModel] = { proveedor, periodo };
    await this.state.storage.put("tarifasPeriodoActivo", activos);
    return Response.json({ ok: true });
  }

  // Calcula las 8 columnas de venta (BEZEN, MAISON/RESTO × ES/FR/IT, RESTO
  // AL) para un modelo+talla, con el desglose paso a paso de cada una
  // (Jennifer, 2026-09-22: "quiero poder chequear cómo has sacado ese
  // cálculo"). El coste se busca en el proveedor+periodo "vigente" de ese
  // modelo (ver setTarifaPeriodoActivo) — si no hay override, el periodo
  // más reciente (orden alfabético de "AAAA-MM") del proveedor del
  // Catálogo. El envío se busca por país en tarifasEnvio.
  // Precio de envío de SEUR por país de cada pieza (Jennifer, 2026-11-06,
  // Revisión de facturas de SEUR: "lo que SEUR nos tiene que cobrar"). Mismas
  // reglas que calcularTarifaModelo (envío fijo, talla hermana, modelo
  // hermano), pero sin necesitar el precio de coste.
  async enviosDePiezas(piezas) {
    const tarifasEnvio = await this.load("tarifasEnvio", {});
    const salida = {};
    for (const { stockModel: sm0, talla } of piezas || []) {
      const k = sm0 + "|" + talla;
      if (k in salida) continue;
      const sust = TARIFA_MODELO_DESCATALOGADO_USA_PRECIO_DE[sm0];
      const stockModel = sust ? sust.modelo : sm0;
      if (TARIFA_ENVIO_FIJO_MODELO[stockModel] != null) {
        const f = envioFijoDeTalla(TARIFA_ENVIO_FIJO_MODELO[stockModel], talla);
        salida[k] = { ES: f, FR: f, IT: f, DE: f, fijo: true };
        continue;
      }
      const de = (m, t) => (tarifasEnvio[m] && tarifasEnvio[m][t]) || null;
      const tallaSust = sustitutoGeneralDeTalla(talla);
      const modeloSust = TARIFA_ENVIO_SUSTITUTO_MODELO[stockModel];
      const opciones = [de(stockModel, talla), tallaSust ? de(stockModel, tallaSust) : null, modeloSust ? de(modeloSust, talla) : null].filter(Boolean);
      const r = {};
      for (const p of ["ES", "FR", "IT", "DE", "PT"]) {
        const o = opciones.find((x) => x[p] != null);
        if (o) r[p] = o[p];
      }
      salida[k] = r;
    }
    return Response.json({ ok: true, envios: salida });
  }

  // Pack de Groupon: suma de piezas con sus costes vigentes (ver TARIFA_GROUPON_PACKS).
  async calcularTarifaPackGroupon(stockModel, talla) {
    const cfg = TARIFA_GROUPON_PACKS[stockModel];
    const tallaCama = String(talla).replace(" GEMELOS", "");
    const ancho = tallaCama.split("X")[0];
    const can = cfg.canape ? await this.calcularTarifaModelo(cfg.canape, talla) : null;
    const col = await this.calcularTarifaModelo(cfg.colchon, tallaCama);
    const tallaCab = cfg.cabecero ? cfg.cabeceroPorAncho[ancho] : null;
    const cab = tallaCab ? await this.calcularTarifaModelo(cfg.cabecero, tallaCab) : null;
    const pasoEnvioCan = can && can.columnas && can.columnas.GROUPON ? (can.columnas.GROUPON.pasos || []).find((p) => /^Precio de env/i.test(p.label)) : null;
    // Con canapé: envío de pack de Furniture (el del canapé). Colchón suelto: su envío SEUR.
    const envCan = cfg.canape ? (pasoEnvioCan ? pasoEnvioCan.valor : null) : (col && col.envios ? col.envios.ES : null);
    const envCab = cfg.cabecero ? (cab && cab.envios ? cab.envios.ES : null) : 0;
    const falta = [];
    if (cfg.canape && (!can || can.coste == null)) falta.push("coste canapé");
    if (!col || col.coste == null) falta.push("coste colchón");
    if (cfg.cabecero && (!cab || cab.coste == null)) falta.push("coste cabecero" + (tallaCab ? "" : " (no hay cabecero para cama " + ancho + ")"));
    if (envCan == null) falta.push(cfg.canape ? "envío canapé" : "envío colchón");
    if (envCab == null) falta.push("envío cabecero");
    const base = { stockModel, talla, costeProveedor: "VARIOS", costePeriodo: "suma de piezas", envios: { ES: envCan != null && envCab != null ? round2(envCan + envCab) : null } };
    if (falta.length) return { ...base, coste: null, columnas: { GROUPON: { precio: null, pasos: [{ label: "Falta: " + falta.join(", "), valor: null }] } } };
    const coste = (can ? can.coste : 0) + col.coste + (cab ? cab.coste : 0);
    const suma = coste + envCan + envCab + TARIFA_GROUPON_EXTRA;
    const pasos = [];
    if (can) pasos.push({ label: "Canapé " + talla + " (coste)", valor: round2(can.coste) });
    pasos.push({ label: "Colchón " + tallaCama + " (coste)", valor: round2(col.coste) });
    if (cab) pasos.push({ label: "Cabecero " + tallaCab + (tallaCab !== ancho ? " (cama " + ancho + ")" : "") + " (coste)", valor: round2(cab.coste) });
    pasos.push({ label: can ? "Envío Furniture canapé + colchón (precio de pack)" : "Envío SEUR del colchón", valor: round2(envCan) });
    if (cab) pasos.push({ label: "Envío cabecero (aparte)", valor: round2(envCab) });
    pasos.push(
      { label: "Gastos Groupon", valor: TARIFA_GROUPON_EXTRA },
      { label: "Coste + envíos + gastos", valor: round2(suma) },
      { label: "÷ " + String(cfg.divisor).replace(".", ",") + " (" + cfg.margenLabel + " margen)", valor: round2(suma / cfg.divisor) },
    );
    const precio = round2(suma / cfg.divisor);
    pasos.push({ label: "Precio GROUPON (sin IVA)", valor: precio });
    return { ...base, coste: round2(coste), columnas: { GROUPON: { precio, pasos } } };
  }

  async calcularTarifaModelo(stockModel, talla) {
    // Modelo descatalogado que usa el precio de OTRO modelo mientras sigue
    // apareciendo en algún fichero de plataforma (Jennifer, 2026-09-23,
    // caso real "Termorregulable con Grafeno": "ya no trabajamos ese
    // colchón... ponle el mismo precio que al 4D momentáneamente hasta que
    // lo quitemos del catálogo"). Delega el cálculo entero al modelo base
    // y solo cambia el `stockModel` de vuelta + una nota en el desglose.
    const sustitutoCompleto = TARIFA_MODELO_DESCATALOGADO_USA_PRECIO_DE[stockModel];
    if (sustitutoCompleto) {
      const base = await this.calcularTarifaModelo(sustitutoCompleto.modelo, talla);
      if (base.error) return { ...base, stockModel };
      const columnas = {};
      for (const [key, col] of Object.entries(base.columnas)) {
        const pasos = col.pasos.length
          ? [{ ...col.pasos[0], label: col.pasos[0].label + ` (precio igual a ${sustitutoCompleto.modelo}, ${sustitutoCompleto.motivo})` }, ...col.pasos.slice(1)]
          : col.pasos;
        columnas[key] = { ...col, pasos };
      }
      return { ...base, stockModel, columnas, precioIgualAModelo: sustitutoCompleto.modelo };
    }

    if (TARIFA_GROUPON_PACKS[stockModel]) return this.calcularTarifaPackGroupon(stockModel, talla);
    const products = await this.load("products", {});
    const product = productoDeTarifa(products, stockModel);
    if (!product) return { error: "Modelo no encontrado en el Catálogo." };
    const proveedorProducto = product.proveedor;

    const tarifasCoste = await this.load("tarifasCoste", {});
    const activos = await this.load("tarifasPeriodoActivo", {});
    const override = activos[stockModel];
    const proveedor = override ? override.proveedor : proveedorProducto;
    const porProveedor = tarifasCoste[proveedor] || {};
    let periodo = override ? override.periodo : null;
    if (!periodo) {
      const periodos = Object.keys(porProveedor).sort();
      periodo = periodos.length ? periodos[periodos.length - 1] : null;
    }
    const tarifaPeriodo = periodo ? porProveedor[periodo] : null;
    const preciosModelo = (tarifaPeriodo && tarifaPeriodo.precios[stockModel]) || {};
    let coste = preciosModelo[talla];
    let costeSustituto = null;
    // Sustituto de talla si no hay coste real (ver TARIFA_SUSTITUTOS_* más
    // arriba) — primero el específico de este modelo, luego el general.
    if (coste == null) {
      const sustituto = (TARIFA_SUSTITUTOS_POR_MODELO[stockModel] || {})[talla] || sustitutoGeneralDeTalla(talla);
      if (sustituto && preciosModelo[sustituto] != null) {
        coste = preciosModelo[sustituto];
        costeSustituto = sustituto;
      }
    }
    if (coste == null) {
      return { stockModel, talla, error: "Sin precio de coste guardado para esta talla (proveedor " + (proveedor || "?") + (periodo ? ", " + periodo : "") + ")." };
    }

    // La tapicería solo se envía a España (Jennifer, 2026-10-20): ni envío
    // ni columnas de Francia/Italia/Alemania. Por tipo, no por proveedor:
    // Polival también hace colchones (Látex Natura, Siberian Zen).
    const soloEspana = ["Canapé", "Canapé fijo", "Base", "Cabecero", "Somier"].includes(product.product_type) || TARIFA_SOLO_ESPANA_MODELOS.includes(stockModel);
    const paises = soloEspana ? ["ES"] : ["ES", "FR", "IT", "DE"];
    let envios;
    let faltaEnvio = [];
    let envioSustituto = null;
    let envioFijo = null;
    if (TARIFA_ENVIO_FIJO_MODELO[stockModel] != null) {
      // Solo sale por FURNITURE (Jennifer, 2026-09-23) — envío fijo, igual
      // para cualquier país/talla, no viene en la tabla de transporte (esa
      // es de SEUR).
      envioFijo = envioFijoDeTalla(TARIFA_ENVIO_FIJO_MODELO[stockModel], talla);
      envios = { ES: envioFijo, FR: envioFijo, IT: envioFijo, DE: envioFijo };
    } else {
      const tarifasEnvio = await this.load("tarifasEnvio", {});
      envios = (tarifasEnvio[stockModel] && tarifasEnvio[stockModel][talla]) || {};
      faltaEnvio = paises.filter((p) => envios[p] == null);
      // 1) Talla hermana del MISMO modelo (ver TARIFA_SUSTITUTOS_GENERALES).
      if (faltaEnvio.length) {
        const tallaSustituta = sustitutoGeneralDeTalla(talla);
        const enviosTallaSustituta = tallaSustituta ? ((tarifasEnvio[stockModel] && tarifasEnvio[stockModel][tallaSustituta]) || {}) : {};
        if (tallaSustituta && !paises.some((p) => enviosTallaSustituta[p] == null)) {
          envios = enviosTallaSustituta;
          faltaEnvio = [];
          envioSustituto = "sustituto de la talla " + tallaSustituta + " de este mismo modelo, sin envío real para " + talla;
        }
      }
      // 2) Modelo hermano, misma talla (ver TARIFA_ENVIO_SUSTITUTO_MODELO).
      if (faltaEnvio.length) {
        const modeloSustituto = TARIFA_ENVIO_SUSTITUTO_MODELO[stockModel];
        const enviosSustituto = modeloSustituto ? ((tarifasEnvio[modeloSustituto] && tarifasEnvio[modeloSustituto][talla]) || {}) : {};
        if (modeloSustituto && !paises.some((p) => enviosSustituto[p] == null)) {
          envios = enviosSustituto;
          faltaEnvio = [];
          envioSustituto = "sustituto de " + modeloSustituto + ", sin precio real para este modelo";
        }
      }
    }
    if (faltaEnvio.length) {
      return { stockModel, talla, coste, costeProveedor: proveedor, costePeriodo: periodo, envios, error: "Sin precio de envío guardado para: " + faltaEnvio.join(", ") + "." };
    }

    // Modelos de muelles (Jennifer, 2026-09-23): esquema de precios distinto
    // — BEZEN usa 32% de margen (÷0,68, no ÷0,70 como núcleo), España es
    // plano (BEZEN+5€, igual para Maison y Resto) y el resto de países usa
    // ÷0,70 (el margen del 30% de siempre) + comisión de plataforma, SIN
    // margen fijo por ancho.
    const esMuelles = TARIFA_MODELOS_MUELLES.includes(stockModel);
    const margenBezen = TARIFA_BEZEN_MARGEN_MODELO[stockModel];
    const bezenResult = TARIFA_MODELOS_A_COSTE.includes(stockModel)
      ? calcularPrecioACoste(coste, envios.ES)
      : esMuelles
      ? calcularPrecioBezen(coste, envios.ES, 0.68, "32%")
      : margenBezen
        ? calcularPrecioBezen(coste, envios.ES, margenBezen.divisor, margenBezen.label)
        : calcularPrecioBezen(coste, envios.ES);

    // BEZEN de Zen Nirvana = BEZEN de Zen Mandala + 15€, siempre (ver
    // TARIFA_BEZEN_REFERENCIA_MODELO) — se muestra el precio "de fórmula"
    // Y el final aplicado en el propio desglose, y el final aplicado es el
    // que se usa de ahí en adelante (incluida la derivación ES = BEZEN+5).
    const bezenOverride = TARIFA_BEZEN_REFERENCIA_MODELO[stockModel];
    if (bezenOverride) {
      const base = await this.calcularTarifaModelo(bezenOverride.modeloBase, talla);
      if (base && base.columnas && base.columnas.BEZEN && base.columnas.BEZEN.precio != null) {
        const precioFormula = bezenResult.precio;
        const precioFinal = round2(base.columnas.BEZEN.precio + bezenOverride.diferencia);
        bezenResult.pasos.push({ label: "Precio según fórmula (informativo)", valor: precioFormula });
        bezenResult.pasos.push({ label: `Precio final aplicado (${bezenOverride.etiquetaBase} + ${bezenOverride.diferencia}€)`, valor: precioFinal });
        bezenResult.precio = precioFinal;
      }
    }

    const margenPlat = TARIFA_PLATAFORMAS_MARGEN_MODELO[stockModel];
    const plat = (envio, comision) => calcularPrecioPlataformaMuellesResto(coste, envio, comision, margenPlat.divisor, margenPlat.label);
    const columnas = !esMuelles && margenPlat ? {
      BEZEN: bezenResult,
      MAISON_ES: plat(envios.ES, 0.77),
      RESTO_ES: plat(envios.ES, 0.80),
      MAISON_FR: plat(envios.FR, 0.77),
      RESTO_FR: plat(envios.FR, 0.80),
      MAISON_IT: plat(envios.IT, 0.77),
      RESTO_IT: plat(envios.IT, 0.80),
      RESTO_AL: plat(envios.DE, 0.80),
    } : esMuelles ? {
      BEZEN: bezenResult,
      MAISON_ES: calcularPrecioPlataformaMuellesEs(bezenResult.precio),
      RESTO_ES: calcularPrecioPlataformaMuellesEs(bezenResult.precio),
      MAISON_FR: calcularPrecioPlataformaMuellesResto(coste, envios.FR, 0.77),
      RESTO_FR: calcularPrecioPlataformaMuellesResto(coste, envios.FR, 0.80),
      MAISON_IT: calcularPrecioPlataformaMuellesResto(coste, envios.IT, 0.77),
      RESTO_IT: calcularPrecioPlataformaMuellesResto(coste, envios.IT, 0.80),
      RESTO_AL: calcularPrecioPlataformaMuellesResto(coste, envios.DE, 0.80),
    } : {
      BEZEN: bezenResult,
      MAISON_ES: calcularPrecioPlataforma(coste, envios.ES, talla, 0.77),
      RESTO_ES: calcularPrecioPlataforma(coste, envios.ES, talla, 0.80),
      MAISON_FR: calcularPrecioPlataforma(coste, envios.FR, talla, 0.77),
      RESTO_FR: calcularPrecioPlataforma(coste, envios.FR, talla, 0.80),
      MAISON_IT: calcularPrecioPlataforma(coste, envios.IT, talla, 0.77),
      RESTO_IT: calcularPrecioPlataforma(coste, envios.IT, talla, 0.80),
      RESTO_AL: calcularPrecioPlataforma(coste, envios.DE, talla, 0.80),
    };
    if (soloEspana) for (const k of ["MAISON_FR", "RESTO_FR", "MAISON_IT", "RESTO_IT", "RESTO_AL"]) delete columnas[k];
    // Canapés: la plataforma nunca más barata que nuestra web (Jennifer,
    // 2026-10-20), salvo el Space polipiel y los de madera. Se sube al
    // euro entero que no baje del precio BEZEN.
    const tipoProducto = String(product.product_type || "");
    if (/^canap/i.test(tipoProducto) && !TARIFA_CANAPE_PLATAFORMA_PUEDE_BAJAR(stockModel)) {
      const minimo = bezenResult.precio;
      for (const [k, col] of Object.entries(columnas)) {
        if (k === "BEZEN" || !col || col.precio == null || col.precio >= minimo) continue;
        const subido = Math.ceil(minimo);
        col.pasos.push({ label: "Sube a nuestro precio web: la plataforma no puede ser más barata que BEZEN (" + minimo + " €)", valor: subido });
        col.precio = subido;
      }
    }
    const maisonMas = TARIFA_MAISON_BEZEN_MAS_MODELO[stockModel];
    // También el resto de plataformas (Jennifer, 2026-10-21: "la regla de
    // Maison y del resto de plataformas va solo para el space deluxe").
    if (maisonMas != null && bezenResult.precio != null) {
      const precio = round2(bezenResult.precio + maisonMas);
      for (const [k, col] of Object.entries(columnas)) {
        if (k === "BEZEN" || !col || !col.pasos) continue;
        col.pasos.push({ label: "Precio según fórmula (informativo)", valor: col.precio });
        col.pasos.push({ label: "Precio final aplicado (BEZEN " + bezenResult.precio + " € + " + maisonMas + " €)", valor: precio });
        col.precio = precio;
      }
    }
    // GROUPON (Jennifer, 2026-10-27; por ahora solo la Base Silver): coste
    // de fábrica con 6 patas siempre + envío + 9 €, con el 25% de margen.
    if (TARIFA_GROUPON_MODELOS.includes(stockModel) && coste != null && envios.ES != null) {
      // 6 patas siempre solo en la base; el canapé, su coste tal cual.
      const esBase = /^Base tapizada/i.test(stockModel);
      const [ancho, largo] = String(talla).split("X").map(Number);
      const patasTalla = ancho < 135 || (ancho === 135 && largo <= 190) ? 4 : 6;
      const coste6 = esBase ? coste + (6 - patasTalla) * PRECIO_PATA_BASE : coste;
      const pasos = [];
      pasos.push({ label: esBase ? "Precio de coste (con 6 patas)" : "Precio de coste", valor: round2(coste6) });
      let envioG = envios.ES;
      if (TARIFA_GROUPON_ENVIO_BE.includes(stockModel)) {
        const [paisMax, envMax] = Object.entries(envios).filter(([, v]) => v != null).sort((x, y) => y[1] - x[1])[0];
        envioG = envMax;
        pasos.push({ label: "Envío Bélgica (sin tarifa: el más caro guardado, " + paisMax + ")", valor: round2(envioG) });
      } else {
        pasos.push({ label: "Precio de envío", valor: round2(envios.ES) });
      }
      pasos.push({ label: "Gastos Groupon", valor: TARIFA_GROUPON_EXTRA });
      const suma = coste6 + envioG + TARIFA_GROUPON_EXTRA;
      pasos.push({ label: "Coste + envío + gastos", valor: round2(suma) });
      const conMargen = suma / 0.75;
      pasos.push({ label: "÷ 0,75 (25% margen)", valor: round2(conMargen) });
      // Sin IVA: así va en las tarifas de Groupon (Jennifer).
      const precio = round2(conMargen);
      pasos.push({ label: "Precio GROUPON (sin IVA)", valor: precio });
      columnas.GROUPON = { precio, pasos };
    }
    // Los colchones de NEW sí siguen con ,99 en plataformas (Jennifer,
    // 2026-10-21); el resto, en euros justos.
    if (/^NEW( |$)/i.test(proveedor || "") || proveedorProducto === "NEW") {
      for (const [k, col] of Object.entries(columnas)) {
        const ult = k !== "BEZEN" && col && col.pasos ? col.pasos[col.pasos.length - 1] : null;
        if (!ult || ult.label !== "Redondeo (al alza, € entero)" || col.precio == null) continue;
        ult.label = "Redondeo (.99 escala superior, colchones NEW)";
        ult.valor = col.precio = round2(col.precio - 0.01);
      }
    }
    // Deja constancia en el propio desglose (Jennifer quiere poder revisar
    // de dónde sale cada número) cuando el coste y/o el envío no son los
    // reales de esta talla/modelo, sino un sustituto o un fijo de Furniture.
    // MAISON_ES/RESTO_ES de muelles parten directo del precio de BEZEN (ya
    // desglosado aparte), no tienen pasos de coste/envío propios que anotar.
    if (costeSustituto || envioSustituto || envioFijo != null) {
      for (const col of Object.values(columnas)) {
        if (!col.pasos || col.pasos[0]?.label === "Precio BEZEN") continue;
        if (costeSustituto && col.pasos[0]) col.pasos[0].label += " (sustituto de " + costeSustituto + ", sin precio real para " + talla + ")";
        if (envioSustituto && col.pasos[1]) col.pasos[1].label += " (" + envioSustituto + ")";
        if (envioFijo != null && col.pasos[1]) col.pasos[1].label += typeof TARIFA_ENVIO_FIJO_MODELO[stockModel] === "number" ? " (fijo FURNITURE, igual para cualquier talla/país)" : " (fijo FURNITURE sin montaje" + (envioFijo === TARIFA_ENVIO_FIJO_MODELO[stockModel].gemelos ? ", en gemelos" : "") + ")";
      }
    }
    return { stockModel, talla, coste, costeProveedor: proveedor, costePeriodo: periodo, envios, columnas, costeSustituto, envioSustituto, envioFijo };
  }

  // Tabla completa (todas las tallas del Catálogo para ese modelo) —
  // GET /tarifas/tabla?stockModel=...
  // PRECIOS BEZEN (Jennifer, 2026-10-15). Cada subida del listado de la
  // web (Producto, Variante, SKU, Precio) se guarda con su fecha, en trozos
  // (el almacenamiento no admite valores muy grandes).
  async subirPreciosBezen({ nombre, usuario, filas }) {
    if (!Array.isArray(filas) || !filas.length) return Response.json({ ok: false, error: "El fichero no trae filas." }, { status: 400 });
    const limpias = filas.map((f) => [String(f[0] || "").trim(), String(f[1] || "").trim(), String(f[2] || "").trim(), f[3] === "" || f[3] == null ? null : Number(f[3])])
      .filter((f) => f[0] || f[2]);
    const id = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14) + "-" + crypto.randomUUID().slice(0, 6);
    const TROZO = 300;
    let chunks = 0;
    for (let i = 0; i < limpias.length; i += TROZO) {
      await this.state.storage.put("preciosBezen:" + id + ":" + chunks, limpias.slice(i, i + TROZO));
      chunks++;
    }
    const index = await this.load("preciosBezenIndex", []);
    const entrada = { id, fecha: new Date().toISOString(), usuario: usuario || null, nombre: nombre || "", filas: limpias.length, chunks };
    index.push(entrada);
    await this.state.storage.put("preciosBezenIndex", index);
    return Response.json({ ok: true, subida: entrada });
  }

  async leerSubidaPreciosBezen(s) {
    const filas = [];
    for (let i = 0; i < s.chunks; i++) filas.push(...((await this.state.storage.get("preciosBezen:" + s.id + ":" + i)) || []));
    return filas;
  }

  async verPreciosBezen(id) {
    const index = (await this.load("preciosBezenIndex", [])).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    const pos = index.findIndex((s) => s.id === id);
    if (pos < 0) return Response.json({ ok: false, error: "Subida no encontrada." }, { status: 404 });
    const subida = index[pos];
    const filas = await this.leerSubidaPreciosBezen(subida);
    const anterior = pos > 0 ? index[pos - 1] : null;
    const precioAntes = new Map();
    if (anterior) for (const f of await this.leerSubidaPreciosBezen(anterior)) if (f[2]) precioAntes.set(f[2].toUpperCase(), f[3]);
    // Desde cuándo tiene la web ese precio (Jennifer, 2026-10-15): la
    // subida más antigua seguida con el mismo precio para ese SKU.
    const desde = new Map();
    const vigentes = new Map();
    for (const f of filas) if (f[2]) { desde.set(f[2].toUpperCase(), subida.fecha); vigentes.set(f[2].toUpperCase(), f[3]); }
    for (let i = pos - 1; i >= 0 && vigentes.size; i--) {
      const otra = new Map();
      for (const f of await this.leerSubidaPreciosBezen(index[i])) if (f[2]) otra.set(f[2].toUpperCase(), f[3]);
      for (const [sku, precio] of [...vigentes]) {
        if (otra.has(sku) && otra.get(sku) === precio) desde.set(sku, index[i].fecha);
        else vigentes.delete(sku);
      }
    }
    const nuevos = await this.state.storage.list({ prefix: "preciosBezenNuevo:" + id + ":" });
    const precioNuevo = new Map([...nuevos].map(([k, v]) => [k.slice(("preciosBezenNuevo:" + id + ":").length), v]));
    // Precio fijo (subida marcada como fija) de cada SKU.
    const fija = index.find((s) => s.fija) || null;
    const precioFijo = new Map();
    if (fija) for (const f of fija.id === subida.id ? filas : await this.leerSubidaPreciosBezen(fija)) if (f[2] && !precioFijo.has(f[2].toUpperCase())) precioFijo.set(f[2].toUpperCase(), f[3]);
    const blacks = await this.state.storage.list({ prefix: "preciosBezenBlack2026:" });
    const precioBlack = new Map([...blacks].map(([k, v]) => [k.slice("preciosBezenBlack2026:".length), v]));

    // Precio de Tarifas (columna BEZEN): colchones y, desde el 2026-10-20,
    // también la tapicería con tarifa (Jennifer: "hemos calculado la tarifa
    // pero no sale en los precios Bezen", canapé Space). Se cruza por SKU
    // (prefijo del Catálogo + medida) y, si no, por el nombre del producto y
    // la medida de la variante. Variante en gemelos → talla "… GEMELOS".
    const products = [...activeProducts(await this.load("products", {})), ...TARIFA_PRODUCTOS_SOLO_TARIFAS].filter((p) => ["Colchones", "Canapé", "Canapé fijo", "Base", "Cabecero", "Somier"].includes(p.product_type));
    const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
    const tallaDe = (v) => { const m = /(\d{2,3})\s*[x×]\s*(\d{2,3})/i.exec(v || ""); return m ? m[1] + "X" + m[2] : null; };
    const modeloDe = (producto, variante, sku) => {
      const s = String(sku || "").toUpperCase();
      let mejor = null;
      for (const p of products) {
        const pre = String(p.skuPrefix || "").toUpperCase();
        if (!pre || !s.startsWith(pre)) continue;
        const t = s.slice(pre.length);
        if ((p.tallas || []).some((x) => String(x).toUpperCase() === t) && (!mejor || pre.length > mejor.pre.length)) mejor = { pre, stockModel: p.stockModel, talla: t };
      }
      if (mejor) return mejor;
      const p = products.find((x) => norm(x.title) === norm(producto));
      // Cabeceros: "Cama 90 – Medida final 100cm / Beige" → talla "90".
      if (p && p.product_type === "Cabecero") {
        const mc = /cama\s*(\d{2,3})/i.exec(variante || "");
        return mc ? { stockModel: p.stockModel, talla: mc[1] } : null;
      }
      const t = tallaDe(variante) || tallaDe(sku);
      return p && t ? { stockModel: p.stockModel, talla: t } : null;
    };
    const tarifaCache = new Map();
    const salida = [];
    for (const [producto, variante, sku, precio] of filas) {
      const m0 = modeloDe(producto, variante, sku);
      const m1 = m0 && /gemelo/i.test((variante || "") + " " + (sku || "")) && (/^160X/.test(m0.talla) || TARIFA_COLCHON_GEMELOS_MODELOS.includes(m0.stockModel)) ? { ...m0, talla: m0.talla + " GEMELOS" } : m0;
      const m = m1 ? { ...m1, talla: tallaTarifaTela(m1.stockModel, m1.talla, /^tela/i.test(variante || "") || /^BDCANINI/i.test(sku || "")) } : m1;
      let tarifa = null;
      let tarifaInfo = null;
      if (m) {
        const k = m.stockModel + "|" + m.talla;
        if (!tarifaCache.has(k)) {
          let v = null;
          try {
            const t = await this.calcularTarifaModelo(m.stockModel, m.talla);
            const col = t && t.columnas && t.columnas.BEZEN;
            if (col && col.precio != null) {
              // Coste + envío y % de margen de la propia fórmula, para
              // calcular el margen que deja otro precio (precio Black).
              const base = (col.pasos || []).find((p) => p.label === "Coste + envío");
              const mm = (col.pasos || []).map((p) => /\((\d+(?:[.,]\d+)?)% margen\)/.exec(p.label)).find(Boolean);
              const env = (col.pasos || []).find((p) => p.label.startsWith("Precio de envío"));
              v = { precio: col.precio, base: base ? base.valor : null, envio: env ? env.valor : null, margenPct: mm ? Number(mm[1].replace(",", ".")) : null };
            }
          } catch (e) { v = null; }
          tarifaCache.set(k, v);
        }
        tarifaInfo = tarifaCache.get(k);
        tarifa = tarifaInfo ? tarifaInfo.precio : null;
        // Base CON montaje (SKU "MBASE…", Jennifer 2026-10-27): misma fórmula
        // con el montaje de Furniture sumado al envío (41 + 19 €).
        if (tarifa != null && /^MBASE/i.test(sku || "") && tarifaInfo.base != null && tarifaInfo.envio != null && tarifaInfo.margenPct != null) {
          const envio = tarifaInfo.envio + MONTAJE_BASE_FURNITURE;
          const r = calcularPrecioBezen(tarifaInfo.base - tarifaInfo.envio, envio, 1 - tarifaInfo.margenPct / 100, tarifaInfo.margenPct + "%");
          tarifaInfo = { ...tarifaInfo, precio: r.precio, base: round2(tarifaInfo.base + MONTAJE_BASE_FURNITURE), envio };
          tarifa = r.precio;
        }
      }
      const nuevo = sku ? precioNuevo.get(sku) : null;
      salida.push({
        producto, variante, sku, precio, precioDesde: sku ? desde.get(sku.toUpperCase()) : subida.fecha,
        precioAnterior: anterior && sku ? (precioAntes.has(sku.toUpperCase()) ? precioAntes.get(sku.toUpperCase()) : undefined) : undefined,
        tarifa: tarifa ?? null,
        // Para abrir el desglose del cálculo, como en Tarifas.
        tarifaBase: tarifaInfo ? tarifaInfo.base : null, tarifaMargenPct: tarifaInfo ? tarifaInfo.margenPct : null, tarifaEnvio: tarifaInfo ? tarifaInfo.envio : null,
        tarifaModelo: tarifa != null && m ? m.stockModel : null, tarifaTalla: tarifa != null && m ? m.talla : null,
        precioNuevo: nuevo ? nuevo.precio : null, precioNuevoFecha: nuevo ? nuevo.fecha : null,
        precioBlack: sku && precioBlack.has(sku) ? precioBlack.get(sku).precio : null,
        precioFijo: sku && precioFijo.has(sku.toUpperCase()) ? precioFijo.get(sku.toUpperCase()) : null,
      });
      if (m) Object.defineProperty(salida[salida.length - 1], "_m", { value: m, enumerable: false });
    }
    // PACKS (Jennifer, 2026-10-20): cada variante de pack se descompone en
    // sus piezas (mismas reglas que al tramitar un pedido) y a cada pieza se
    // le buscan sus precios (fijo, BLACK, nuevo, web) en su propia fila de
    // esta subida. La suma y la columna a usar se eligen en la pantalla.
    const todos = await this.load("products", {});
    const activosTodos = activeProducts(todos);
    const tipoDe = (stockModel) => { const p = activosTodos.find((x) => x.stockModel === stockModel); return p ? p.product_type : ""; };
    // La base lleva el color en el propio modelo; el cabecero va por ancho
    // de cama; los canapés de tela comparten SKU entre gamas (natural/
    // tierras/vivos), así que también se busca por "familia" sin la gama.
    const familia = (stockModel) => String(stockModel || "").replace(/\s*gama colores.*$/i, "").trim();
    const tallaPieza = (stockModel, talla) => tipoDe(stockModel) === "Cabecero" ? String(talla || "").split("X")[0] : String(talla || "").replace(",", ".").toUpperCase();
    const claveFila = (stockModel, talla, color) => {
      const t = tipoDe(stockModel);
      const conColor = TYPE_MAP[t] === "tapiceria" && t !== "Base";
      return stockModel + "|" + tallaPieza(stockModel, talla) + "|" + (conColor ? colorTapiceriaKey(color) : "");
    };
    const claveFamilia = (stockModel, talla, color) => "F|" + familia(stockModel) + "|" + tallaPieza(stockModel, talla) + "|" + colorTapiceriaKey(color);
    const porPieza = new Map();
    const porMedidas = new Map();
    const guardar = (k, f) => { if (!porPieza.has(k)) porPieza.set(k, f); };
    for (const f of salida) {
      if (/^pack/i.test(f.producto || "")) continue;
      const partes = String(f.variante || "").split("/").map((x) => x.trim());
      let sm = f._m ? f._m.stockModel : null;
      let talla = f._m ? f._m.talla : null;
      let color = partes.length > 1 ? partes[0] : "";
      // Cabecero ya cruzado con Tarifas ("Cama 90 – … / Beige"): el color va al final.
      if (sm && tipoDe(sm) === "Cabecero") color = partes.length > 1 ? partes[partes.length - 1] : "";
      if (!sm) {
        // Cabeceros ("Cama 90 – Medida final 100cm / Beige") y almohadas
        // ("67,5"), que el cruce de tarifas no reconoce.
        const p = activosTodos.find((x) => ["Cabecero", "Almohada"].includes(x.product_type) && norm(x.title) === norm(f.producto));
        if (!p) continue;
        sm = p.stockModel;
        if (p.product_type === "Cabecero") {
          const mc = /cama\s*(\d{2,3})/i.exec(f.variante || "");
          if (!mc) continue;
          talla = mc[1];
          color = partes.length > 1 ? partes[partes.length - 1] : "";
        } else {
          talla = String(f.variante || "").trim();
          color = "";
        }
      }
      guardar(claveFila(sm, talla, color), f);
      // Misma medida en cualquier color (para colores que no se venden sueltos).
      if (TYPE_MAP[tipoDe(sm)] === "tapiceria") {
        guardar("T|" + sm + "|" + tallaPieza(sm, talla), f);
        if (!porMedidas.has("T|" + sm)) porMedidas.set("T|" + sm, []);
        porMedidas.get("T|" + sm).push({ talla: tallaPieza(sm, talla), fila: f });
      }
      if (TYPE_MAP[tipoDe(sm)] === "tapiceria") guardar(claveFamilia(sm, talla, color), f);
      // Para buscar la medida más cercana por encima (ver más abajo).
      const kMed = claveFila(sm, "", color);
      if (!porMedidas.has(kMed)) porMedidas.set(kMed, []);
      porMedidas.get(kMed).push({ talla: tallaPieza(sm, talla), fila: f });
      if (TYPE_MAP[tipoDe(sm)] === "tapiceria") {
        const kF = claveFamilia(sm, "", color);
        if (!porMedidas.has(kF)) porMedidas.set(kF, []);
        porMedidas.get(kF).push({ talla: tallaPieza(sm, talla), fila: f });
      }
    }
    // Pieza en una medida que no se vende suelta (Jennifer, 2026-10-20: Space
    // 80X180): se usa la medida más cercana que sí está en la web, SIEMPRE por
    // encima (ancho y largo iguales o mayores; la de menor superficie). En
    // gemelos, solo entre gemelos.
    const medidaPorEncima = (lista, talla) => {
      // Tela (INITIAL DELUXE) solo con tela, polipiel solo con polipiel.
      const gem = / GEMELOS$/.test(talla);
      const tela = / TELA( |$)/.test(talla);
      const limpia = (t) => t.replace(/ GEMELOS$/, "").replace(/ TELA$/, "");
      const [w, l] = limpia(talla).split("X").map(Number);
      if (!w) return null;
      return (lista || [])
        .map((x) => { const g = / GEMELOS$/.test(x.talla); const [a, b] = limpia(x.talla).split("X").map(Number); return { ...x, g, tela: / TELA( |$)/.test(x.talla), a, b: b || 0 }; })
        .filter((x) => x.g === gem && x.tela === tela && x.a >= w && (l ? x.b >= l : true) && x.talla !== talla)
        .sort((x, y) => x.a * (x.b || 1) - y.a * (y.b || 1) || x.a - y.a)[0] || null;
    };
    for (const f of salida) {
      if (!/^pack/i.test(f.producto || "") || !f.sku) continue;
      const packTalla = normalizeTalla(f.variante) || normalizeTalla(f.sku);
      const r = resolvePackSku(f.sku, todos, extractColor(f.variante), packTalla);
      const gemelos = /gemelo/i.test((f.variante || "") + " " + f.sku);
      f.packPiezas = r.componentes.map((c) => {
        let talla = c.talla;
        // La base de 160 del pack "GEMELOS" usa la base de 160 normal (Jennifer, 2026-10-27).
        if (c.tipo === "tapiceria" && gemelos && /^160X/.test(talla || "") && tipoDe(c.product.stockModel) !== "Base") talla += " GEMELOS";
        if (c.tipo === "tapiceria") talla = tallaTarifaTela(c.product.stockModel, talla, /(^|\+)BDCANINI/i.test(f.sku));
        let fila = porPieza.get(claveFila(c.product.stockModel, talla, c.color))
          || (c.tipo === "tapiceria" ? porPieza.get(claveFamilia(c.product.stockModel, talla, c.color)) : null);
        let medidaUsada = null;
        if (!fila) {
          const tp = tallaPieza(c.product.stockModel, talla);
          const cerca = medidaPorEncima(porMedidas.get(claveFila(c.product.stockModel, "", c.color)), tp)
            || (c.tipo === "tapiceria" ? medidaPorEncima(porMedidas.get(claveFamilia(c.product.stockModel, "", c.color)), tp) : null);
          if (cerca) { fila = cerca.fila; medidaUsada = cerca.talla; }
        }
        // Color del pack que no se vende suelto (Jennifer, 2026-10-21: packs
        // de canapé con patas en Oliva/Oceanic/Menta/Arena): precios de la
        // misma medida en otro color (todos los colores valen lo mismo).
        let colorUsado = null;
        if (!fila && c.tipo === "tapiceria") {
          fila = porPieza.get("T|" + c.product.stockModel + "|" + tallaPieza(c.product.stockModel, talla)) || null;
          // Ni el color ni la medida (cabecero Arena de cama 80): la medida por encima en otro color.
          if (!fila) {
            const cerca = medidaPorEncima(porMedidas.get("T|" + c.product.stockModel), tallaPieza(c.product.stockModel, talla));
            if (cerca) { fila = cerca.fila; medidaUsada = cerca.talla; }
          }
          if (fila) colorUsado = String(fila.variante || "").split("/").map((x) => x.trim()).filter((x) => !/\d/.test(x))[0] || "otro color";
        }
        return {
          tipo: c.tipo, stockModel: c.product.stockModel, talla, color: c.color || "", cantidad: c.qtyOverride || 1, medidaUsada, colorUsado,
          sku: fila ? fila.sku : null, nombre: fila ? fila.producto + (fila.variante ? " · " + fila.variante : "") : null, precioFijo: fila ? fila.precioFijo : null, precioBlack: fila ? fila.precioBlack : null,
          precioNuevo: fila ? fila.precioNuevo : null, precio: fila ? fila.precio : null,
          // Coste + envío y tarifa de la pieza, para el margen en la calculadora de pack.
          // Con otra medida, el coste sigue siendo el de la medida real del pack.
          // Cabecero de cama 80: es el mismo cabecero de 90 (Jennifer, 2026-10-21), así que su tarifa vale.
          tarifa: fila && (!medidaUsada || tipoDe(c.product.stockModel) === "Cabecero") ? fila.tarifa : null, tarifaBase: fila && (!medidaUsada || tipoDe(c.product.stockModel) === "Cabecero") ? fila.tarifaBase : null, tarifaMargenPct: fila && (!medidaUsada || tipoDe(c.product.stockModel) === "Cabecero") ? fila.tarifaMargenPct : null, tarifaEnvio: fila && (!medidaUsada || tipoDe(c.product.stockModel) === "Cabecero") ? fila.tarifaEnvio : null,
        };
      });
      // Pieza que no se vende suelta en la web (Jennifer, 2026-10-20, Space
      // 80X180 del pack CANPOLBLA+COLGEZ): su precio de tarifa, si tiene costes.
      for (const p of f.packPiezas) {
        if (p.tarifa != null) continue;
        const k = p.stockModel + "|" + p.talla;
        if (!tarifaCache.has(k)) {
          let v = null;
          try {
            const t = await this.calcularTarifaModelo(p.stockModel, p.talla);
            const col = t && t.columnas && t.columnas.BEZEN;
            if (col && col.precio != null) {
              const base = (col.pasos || []).find((x) => x.label === "Coste + envío");
              const env = (col.pasos || []).find((x) => x.label.startsWith("Precio de envío"));
              v = { precio: col.precio, base: base ? base.valor : null, envio: env ? env.valor : null, margenPct: null };
            } else if (p.tipo === "almohada" && t && t.coste != null) {
              // Almohada dentro de un pack (Jennifer, 2026-10-22, Nordic): no
              // tiene envío propio (viaja con el pack), así que para el margen
              // cuenta solo su coste de fábrica.
              v = { precio: null, base: t.coste, envio: 0, margenPct: null };
            }
          } catch (e) { v = null; }
          tarifaCache.set(k, v);
        }
        const v = tarifaCache.get(k);
        if (v) { p.tarifa = v.precio; if (p.tarifaBase == null) p.tarifaBase = v.base; if (p.tarifaEnvio == null) p.tarifaEnvio = v.envio; }
      }
      if (r.needsReview || !f.packPiezas.length) f.packError = r.ambiguousNotes.join(" ") || "No he podido descomponer este pack.";
    }
    // Conjuntos somier + colchón (ver CONJUNTOS_PACK_PIEZAS): cada pieza con
    // los precios de su propia fila de la web, en la misma medida.
    for (const f of salida) {
      const piezas = CONJUNTOS_PACK_PIEZAS[f.producto];
      if (!piezas || !f.sku) continue;
      const talla = tallaDe(f.variante) || tallaDe(f.sku);
      f.packPiezas = piezas.map((c) => {
        const fila = salida.find((x) => x._m && x._m.stockModel === c.stockModel && x._m.talla === talla) || null;
        return {
          tipo: c.tipo, stockModel: c.stockModel, talla, color: "", cantidad: 1, medidaUsada: null, colorUsado: null,
          sku: fila ? fila.sku : null, nombre: fila ? fila.producto + (fila.variante ? " · " + fila.variante : "") : null, precioFijo: fila ? fila.precioFijo : null, precioBlack: fila ? fila.precioBlack : null,
          precioNuevo: fila ? fila.precioNuevo : null, precio: fila ? fila.precio : null,
          tarifa: fila ? fila.tarifa : null, tarifaBase: fila ? fila.tarifaBase : null, tarifaMargenPct: fila ? fila.tarifaMargenPct : null, tarifaEnvio: fila ? fila.tarifaEnvio : null,
        };
      });
      if (f.packPiezas.some((p) => !p.sku)) f.packError = "No encuentro en la web " + f.packPiezas.filter((p) => !p.sku).map((p) => p.stockModel + " " + talla).join(" ni ") + ".";
    }
    return Response.json({ ok: true, subida, anterior: anterior ? { id: anterior.id, fecha: anterior.fecha } : null, fija: fija ? { id: fija.id, fecha: fija.fecha } : null, filas: salida });
  }

  // MARGEN BRUTO DE CADA VENTA DE LA WEB (Jennifer, 2026-10-20): lo pagado
  // ÷ 1,04 ÷ 1,21 × 0,77 (como la fórmula BEZEN) − coste de cada pieza
  // (Tarifas) − el transporte REAL de ese pedido. El precio de la web lleva
  // el envío suelto de cada pieza; si el pedido va junto (o es de Madrid),
  // el transporte real es menor y esa diferencia es margen. Precios de
  // Furniture SIN montaje.
  async margenPedidos(pedidos) {
    const products = await this.load("products", {});
    const cache = new Map();
    const tarifaPieza = async (stockModel, talla) => {
      const k = stockModel + "|" + talla;
      if (!cache.has(k)) {
        let v = null;
        try {
          const t = await this.calcularTarifaModelo(stockModel, talla);
          const pasos = (t && t.columnas && t.columnas.BEZEN && t.columnas.BEZEN.pasos) || [];
          const coste = pasos.find((p) => p.label === "Precio de coste");
          const envio = pasos.find((p) => p.label.startsWith("Precio de envío"));
          const precioTarifa = t && t.columnas && t.columnas.BEZEN && t.columnas.BEZEN.precio != null ? t.columnas.BEZEN.precio : null;
          if (coste) v = { coste: coste.valor, envio: envio ? envio.valor : 0, precio: precioTarifa };
        } catch (e) { v = null; }
        cache.set(k, v);
      }
      return cache.get(k);
    };
    const nombreTipo = (p) => ({ "Canapé": "Canapé", "Canapé fijo": "Canapé", Base: "Base", Cabecero: "Cabecero", Colchones: "Colchón", Almohada: "Almohada" })[p.product_type] || "Otro";
    const salida = {};
    for (const ped of pedidos || []) {
      const piezas = [];
      const faltan = [];
      for (const it of ped.items || []) {
        const r = resolveItem(it, products);
        const gem = /gemelo/i.test(it.variantTitle || "");
        const add = (product, talla, qty) => {
          let t = talla || "";
          if (gem && ["Canapé"].includes(product.product_type) && /^160X/.test(t)) t += " GEMELOS";
          piezas.push({ stockModel: product.stockModel, talla: t, tipo: nombreTipo(product), qty });
        };
        if (r.tipo === "pack") {
          for (const c of r.componentes) add(c.product, c.talla, (c.qtyOverride || 1) * (it.qty || 1));
          if (r.needsReview) faltan.push("pieza de pack sin identificar (" + (it.sku || "") + ")");
        } else if (r.product) add(r.product, r.talla, it.qty || 1);
        else faltan.push("artículo sin identificar (" + (it.sku || it.variantTitle || "") + ")");
      }
      let costes = 0, enviosSueltos = 0, tarifaTotal = 0, sinPrecioTarifa = false;
      for (const p of piezas) {
        const v = await tarifaPieza(p.stockModel, p.talla);
        if (!v) { faltan.push("sin coste en Tarifas: " + p.stockModel + " " + p.talla); continue; }
        p.coste = v.coste; p.envioSuelto = v.envio;
        p.precioTarifa = v.precio;
        if (v.precio == null) sinPrecioTarifa = true; else tarifaTotal += v.precio * p.qty;
        costes += v.coste * p.qty;
        enviosSueltos += v.envio * p.qty;
      }
      // Transporte real según lo que va junto y el destino.
      const madrid = /^28/.test(String(ped.postalCode || ""));
      const n = (t) => piezas.filter((p) => p.tipo === t).reduce((s, p) => s + p.qty, 0);
      const sueltoDe = (t) => piezas.filter((p) => p.tipo === t).reduce((s, p) => s + (p.envioSuelto || 0) * p.qty, 0);
      // Tarifas de Furniture (Jennifer, 2026-10-20), sin y con montaje. El
      // cabecero no lleva montaje. El canapé suelto fuera de Madrid sin
      // montaje usa su envío de tarifa (45 €, 60 € en gemelos).
      const montaje = /montaje/i.test(ped.services || "");
      const FUR = {
        madrid: { sin: { canape: 23, canapeColchon: 28, base: 18, baseColchon: 23, cabecero: 18 }, con: { canape: 30, canapeColchon: 39, base: 22, baseColchon: 29, cabecero: 18 } },
        fuera: { sin: { canape: null, canapeColchon: 65, base: 41, baseColchon: 54, cabecero: 41 }, con: { canape: 67, canapeColchon: 82, base: 60, baseColchon: 73, cabecero: 41 } },
      }[madrid ? "madrid" : "fuera"][montaje ? "con" : "sin"];
      const gemelosCanape = piezas.some((p) => p.tipo === "Canapé" && / GEMELOS$|^(18|20)0X/.test(p.talla));
      let envio = 0;
      const detalle = [];
      const avisosEnvio = [];
      if (n("Canapé") && n("Colchón")) { envio += FUR.canapeColchon; detalle.push("canapé + colchón " + FUR.canapeColchon + " €"); }
      else if (n("Base") && n("Colchón")) { envio += FUR.baseColchon; detalle.push("base + colchón " + FUR.baseColchon + " €"); }
      else {
        if (n("Canapé")) {
          // Gemelos con montaje fuera de Madrid: 67 + 15 = 82 € (Jennifer, 2026-10-20).
          const e = FUR.canape != null ? (montaje && !madrid && gemelosCanape ? 82 : FUR.canape) * n("Canapé") : sueltoDe("Canapé");
          envio += e; detalle.push("canapé " + Math.round(e * 100) / 100 + " €");
        }
        if (n("Base")) { const e = FUR.base * n("Base"); envio += e; detalle.push("base " + e + " €"); }
        if (n("Colchón")) { envio += sueltoDe("Colchón"); detalle.push("colchón " + Math.round(sueltoDe("Colchón") * 100) / 100 + " €"); }
      }
      if (montaje) detalle.push("con montaje");
      if (n("Cabecero")) { const e = FUR.cabecero * n("Cabecero"); envio += e; detalle.push("cabecero " + e + " €"); }
      if (n("Otro")) { envio += sueltoDe("Otro"); }
      if (n("Almohada") && (n("Canapé") || n("Base"))) detalle.push("almohadas 0 €");
      else if (n("Almohada")) envio += sueltoDe("Almohada");
      const conLineas = (ped.items || []).length && (ped.items || []).every((it) => typeof it.pagado === "number");
      const ingresos = conLineas ? ped.items.reduce((s, it) => s + it.pagado, 0) : Number(ped.price || 0);
      // Montaje (Jennifer, 2026-10-20): el cliente paga 39 € (IVA incl.).
      // Ingreso aparte, sin publicidad (solo IVA y financieras). El coste del
      // montaje en Furniture aún no lo tenemos.
      const ingresoMontaje = montaje ? 39 : 0;
      // Jennifer (2026-10-20): los 39 € cuentan enteros como dinero para pagar
      // el servicio de Furniture (canapé: 45 contemplados + 39 = 84 frente a 67).
      // Corrección de Jennifer: el IVA de los 39 € no cuenta → 39 ÷ 1,21 = 32,23 €
      // (45 contemplados + 32,23 frente a 67 de Furniture).
      const netoMontaje = round2(ingresoMontaje / 1.21);
      const neto = ingresos / 1.04 / 1.21 * 0.77 + netoMontaje;
      const margen = neto - costes - envio;
      salida[ped.id] = {
        ok: !faltan.length, faltan, avisosEnvio, madrid, montaje, ingresoMontaje, aprox: !conLineas,
        ingresos: round2(ingresos), neto: round2(neto), costes: round2(costes), envioReal: round2(envio), envioIncluidoEnPrecio: round2(enviosSueltos),
        ahorroTransporte: round2(enviosSueltos + netoMontaje - envio), montajeSinIva: netoMontaje, envioDetalle: detalle.join(" + "), margen: round2(margen),
        pct: neto > 0 ? round2(margen / neto * 100) : null,
        tarifa: sinPrecioTarifa ? null : round2(tarifaTotal),
        piezas: piezas.map((p) => ({ stockModel: p.stockModel, talla: p.talla, qty: p.qty, coste: p.coste ?? null, envioSuelto: p.envioSuelto ?? null })),
      };
    }
    return Response.json(salida);
  }

  // ---- Tarifa REFORMAN (Jennifer, 2026-11-17) ----
  // El Excel del catálogo se guarda tal cual (filas como listas de valores,
  // en trozos de < 100 KB); al verlo se recalcula la columna Precio con
  // (coste + transporte ES) ÷ 0,7 (reforman.js). El Excel se lee y se
  // escribe en el navegador (SheetJS), aquí solo viajan las filas.
  async cargarReforman({ filas, usuario, nombre }) {
    if (!Array.isArray(filas) || filas.length < 2) return Response.json({ ok: false, error: "El Excel está vacío." }, { status: 400 });
    const cabeceras = filas[0].map((h) => String(h === null || h === undefined ? "" : h));
    const iPrecio = cabeceras.findIndex((h) => h.trim().toLowerCase() === "precio");
    if (iPrecio < 0) return Response.json({ ok: false, error: "No encuentro la columna Precio en la primera fila del Excel." }, { status: 400 });
    const datos = filas.slice(1).filter((r) => Array.isArray(r) && String(r[0] === null || r[0] === undefined ? "" : r[0]).trim() !== "");
    if (!datos.length) return Response.json({ ok: false, error: "El Excel no trae ningún SKU en la columna A." }, { status: 400 });
    const antes = await this.load("reforman:meta", null);
    const trozos = [];
    let actual = [], bytes = 0;
    for (const f of datos) {
      const n = JSON.stringify(f).length * 2;
      if (actual.length && bytes + n > 100000) { trozos.push(actual); actual = []; bytes = 0; }
      actual.push(f);
      bytes += n;
    }
    if (actual.length) trozos.push(actual);
    for (let i = 0; i < trozos.length; i++) await this.state.storage.put("reforman:" + i, trozos[i]);
    for (let i = trozos.length; antes && i < antes.chunks; i++) await this.state.storage.delete("reforman:" + i);
    const meta = { cabeceras, iPrecio, total: datos.length, chunks: trozos.length, cargado: new Date().toISOString(), cargadoPor: usuario || null, nombre: nombre || "", ultimaDescarga: null };
    await this.state.storage.put("reforman:meta", meta);
    return Response.json({ ok: true, meta: { total: meta.total, nombre: meta.nombre } });
  }

  async reformanDescargado({ usuario }) {
    const meta = await this.load("reforman:meta", null);
    if (!meta) return Response.json({ ok: false }, { status: 404 });
    meta.ultimaDescarga = { fecha: new Date().toISOString(), usuario: usuario || null };
    await this.state.storage.put("reforman:meta", meta);
    return Response.json({ ok: true });
  }

  async verReforman() {
    const meta = await this.load("reforman:meta", null);
    if (!meta) return Response.json({ ok: true, meta: null, filas: [] });
    const valores = [];
    for (let i = 0; i < meta.chunks; i++) valores.push(...((await this.state.storage.get("reforman:" + i)) || []));
    // Artículos de la web: si un SKU sale dos veces (ficha LIQUIDACIÓN), vale
    // la que tiene tarifa.
    const index = (await this.load("preciosBezenIndex", [])).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    const pb = new Map();
    if (index.length) {
      const d = await (await this.verPreciosBezen(index[index.length - 1].id)).json();
      for (const f of d.filas || []) {
        if (!f.sku) continue;
        const k = String(f.sku).toUpperCase();
        if (!pb.has(k) || (!pb.get(k).tarifaModelo && f.tarifaModelo)) pb.set(k, f);
      }
    }
    const tablas = new Map();
    const tabla = async (m) => {
      if (!tablas.has(m)) {
        let mapa = {};
        try {
          const j = await (await this.getTarifaTabla(m)).json();
          mapa = Object.fromEntries((j.filas || []).map((f) => [String(f.talla).replace(",", "."), anadirColumnaReforman(f)]));
        } catch (e) { mapa = {}; }
        tablas.set(m, mapa);
      }
      return tablas.get(m);
    };
    const iNombre = meta.cabeceras.findIndex((h) => /^descripci/i.test(h.trim()));
    const filas = [];
    for (const v of valores) {
      const sku = String(v[0]).trim();
      let r;
      try { r = await calcularPrecioReforman(sku, { tabla, pb }); }
      catch (e) { r = { precio: null, como: "ERROR: " + e.message, pasos: [] }; }
      const g = Number(v[meta.iPrecio]);
      filas.push({ sku, descripcion: iNombre >= 0 ? String(v[iNombre] || "") : "", precioGuardado: v[meta.iPrecio] === "" || isNaN(g) ? null : g, precio: r.precio, como: r.como, pasos: r.pasos, valores: v });
    }
    return Response.json({ ok: true, meta, filas });
  }

  // ---- Ficheros plataformas COMPLETOS (Jennifer, 2026-11-04) ----
  // meta: { cabeceras (las del fichero del market, en su orden), sep, total,
  // chunks, cargado, cargadoPor, nombre, ultimaDescarga }. Las filas se
  // guardan como listas de valores, en trozos de menos de ~100 KB (cada
  // valor del almacenamiento tiene un límite de tamaño).
  async leerFicheroCompleto(cliente) {
    const meta = await this.load("ficheroCompleto:" + cliente + ":meta", null);
    if (!meta) return { meta: null, cabeceras: [], filas: [] };
    let filas = [];
    for (let i = 0; i < meta.chunks; i++) filas.push(...((await this.state.storage.get("ficheroCompleto:" + cliente + ":" + i)) || []));
    let cabeceras = meta.cabeceras;
    // Formato del primer día (objetos con las cabeceras de Carrefour).
    if (!cabeceras) {
      cabeceras = CABECERAS_MIRAKL;
      filas = filas.map((o) => cabeceras.map((h) => (o[h] === undefined || o[h] === null ? "" : String(o[h]))));
    }
    return { meta: { ...meta, cabeceras, sep: meta.sep || CLIENTES_FICHERO_COMPLETO[cliente].sep }, cabeceras, filas };
  }

  async guardarFilasFicheroCompleto(cliente, meta, filas) {
    const antes = await this.load("ficheroCompleto:" + cliente + ":meta", null);
    const trozos = [];
    let actual = [], bytes = 0;
    for (const f of filas) {
      const n = JSON.stringify(f).length * 2;
      if (actual.length && bytes + n > 100000) { trozos.push(actual); actual = []; bytes = 0; }
      actual.push(f);
      bytes += n;
    }
    if (actual.length) trozos.push(actual);
    for (let i = 0; i < trozos.length; i++) await this.state.storage.put("ficheroCompleto:" + cliente + ":" + i, trozos[i]);
    for (let i = trozos.length; antes && i < antes.chunks; i++) await this.state.storage.delete("ficheroCompleto:" + cliente + ":" + i);
    const nuevo = { ...meta, total: filas.length, chunks: trozos.length };
    await this.state.storage.put("ficheroCompleto:" + cliente + ":meta", nuevo);
    return nuevo;
  }

  // Reemplazo completo con el CSV de importación del market (la primera vez,
  // o cuando haya artículos nuevos).
  async cargarFicheroCompleto(cliente, { csv, usuario, nombre }) {
    const r = filasDesdeCsvImport(csv, cliente);
    if (r.error) return Response.json({ ok: false, error: r.error }, { status: 400 });
    if (!r.filas.length) return Response.json({ ok: false, error: "El fichero no trae ningún artículo." }, { status: 400 });
    const meta = await this.guardarFilasFicheroCompleto(cliente, {
      cabeceras: r.cabeceras, sep: r.sep, cargado: new Date().toISOString(), cargadoPor: usuario || null, nombre: nombre || "", ultimaDescarga: null,
    }, r.filas);
    return Response.json({ ok: true, meta: { ...meta, cabeceras: undefined } });
  }

  // Precio al día de cada fila y canal (país) con las reglas de
  // ficheros-completos.js. salida = { columna: valor nuevo } para el CSV.
  async calcularFicheroCompleto(cliente, cabeceras, filas) {
    const cfg = CLIENTES_FICHERO_COMPLETO[cliente];
    const ix = new Map(cabeceras.map((h, i) => [h.toLowerCase(), i]));
    const val = (fila, col) => { const i = ix.get(col.toLowerCase()); return i === undefined ? "" : fila[i]; };
    const num = (v) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
    const decimales = filas.some((f) => cfg.canales.some((c) => /\.\d\d$/.test(val(f, c.colOferta))));
    const fmt = (n) => (decimales ? Number(n).toFixed(2) : String(n));

    const index = (await this.load("preciosBezenIndex", [])).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    const pb = new Map();
    if (index.length) {
      const d = await (await this.verPreciosBezen(index[index.length - 1].id)).json();
      for (const f of d.filas || []) if (f.sku) pb.set(String(f.sku).toUpperCase(), f);
    }
    const tablas = new Map();
    const tabla = async (m) => {
      if (!tablas.has(m)) {
        let mapa = {};
        try {
          const j = await (await this.getTarifaTabla(m)).json();
          mapa = Object.fromEntries((j.filas || []).map((f) => [String(f.talla).replace(",", "."), f]));
        } catch (e) { mapa = {}; }
        tablas.set(m, mapa);
      }
      return tablas.get(m);
    };
    const plataformas = await this.load("plataformaExportaciones", {});
    const calcCache = new Map();
    // columnaForzada: Alemania de Maison usa el listado de colchones de
    // MAISON_ES (qué modelo/medida es cada SKU) pero con la columna RESTO_AL.
    const colchonDe = (nombrePlataforma, columnaForzada) => {
      const pc = plataformas[nombrePlataforma];
      const colPrecio = columnaForzada || (pc && pc.columnaPrecio);
      const colchFilas = new Map(((pc && pc.filas) || []).map((f) => [String(f.sku || "").toUpperCase(), f]));
      return async (sku) => {
        const f = colchFilas.get(sku);
        if (!f) return null;
        if (f.stockModel && f.talla) {
          const k = f.stockModel + "|" + f.talla;
          if (!calcCache.has(k)) calcCache.set(k, await this.calcularTarifaModelo(f.stockModel, f.talla));
          const c = calcCache.get(k);
          const col = c && c.columnas && c.columnas[colPrecio];
          if (col && col.precio != null) return { precio: Number(col.precio), pasos: col.pasos || [], origen: "Fichero colchones API " + nombrePlataforma + (columnaForzada ? " (columna " + columnaForzada + ")" : "") + ": " + f.stockModel + " " + f.talla };
        }
        if (columnaForzada) return null;
        return f.precioOfertaManual != null ? { precio: Number(f.precioOfertaManual), pasos: [], origen: "Precio fijo del fichero colchones API " + nombrePlataforma + " (sin fórmula en Tarifas)" } : null;
      };
    };
    const claveColch = (c) => (c.colchonesDe ? c.colchonesDe + "|" + c.columna : c.plataformaColchones);
    const colchones = new Map(cfg.canales.map((c) => [claveColch(c), c.colchonesDe ? colchonDe(c.colchonesDe, c.columna) : colchonDe(c.plataformaColchones)]));
    const resCache = new Map();
    const salida = [];
    const colCantidad = cfg.colCantidad || "quantity";
    for (const fila of filas) {
      const skuFichero = val(fila, cfg.colSku || "sku");
      // Worten: el SKU de oferta es el EAN → nuestro código por el nombre.
      // (internal-description en Worten; si va vacía, el propio sku).
      const skuNuestro = cfg.colSkuNuestro ? (String(val(fila, cfg.colSkuNuestro) || "").trim().toUpperCase() || String(skuFichero).toUpperCase())
        : cfg.skuDesdeNombre ? skuDesdeNombreWorten(skuFichero, val(fila, cfg.colDescripcion || "description")) : null;
      // Alias a nuestro SKU (cfg.skuTarifa, ej. S14633 → COLLOU160X200).
      const alias = cfg.skuTarifa ? cfg.skuTarifa[String(skuFichero).trim().toUpperCase()] || null : null;
      const sku = alias || skuNuestro || skuFichero;
      const canales = {};
      const out = {};
      // Artículo que gestiona Jennifer a mano: se deja tal cual.
      if ((cfg.noTocar || []).includes(sku)) { salida.push({ sku: skuFichero, canales: {}, general: null, salida: {}, cambios: [], noTocar: true, stockGuardado: num(val(fila, colCantidad)) }); continue; }
      for (const c of cfg.canales) {
        // Solo los países donde la oferta ya está (Portugal sin tapicería…).
        // Con alias se calcula el canal de la oferta general aunque la fila
        // no tenga precio en ese canal (solo se escribe el general).
        const aliasSinCanal = alias && val(fila, c.colOferta) === "";
        if (cfg.canales.length > 1 && val(fila, c.colOferta) === "" && !(alias && cfg.general && c.id === cfg.general.canalOferta)) continue;
        const k = sku + "|" + c.columna + "|" + claveColch(c);
        if (!resCache.has(k)) {
          let r;
          try { r = cfg.skuDesdeNombre && !skuNuestro ? { oferta: null, tachado: null, como: "SIN TARIFA: no se reconoce el modelo por el nombre", pasos: [{ label: "No se ha podido saber qué modelo/medida es este EAN por el nombre del producto: se queda el último precio guardado", valor: null }] } : await calcularPrecioOferta(sku, { columna: c.columna, tabla, pb, colchon: colchones.get(claveColch(c)), tachado: cfg.tachado, redondeo: cfg.redondeo }); }
          catch (e) { r = { oferta: null, tachado: null, como: "ERROR: " + e.message, pasos: [] }; }
          resCache.set(k, r);
        }
        const r = { ...resCache.get(k), pasos: [...(resCache.get(k).pasos || [])] };
        const tachadoGuardado = num(val(fila, c.colTachado));
        // Nunca más barato que otros países (Jennifer, 2026-11-04: "los precios
        // de Alemania no pueden ser en ningún caso más baratos que los de
        // Francia o de Italia").
        if (r.oferta != null && c.noMenosQue) {
          const refs = c.noMenosQue.map((id) => [id, canales[id]]).filter(([, x]) => x).map(([id, x]) => [id, x.oferta != null ? x.oferta : x.ofertaGuardada]).filter(([, p]) => p != null);
          const top = refs.reduce((m, x) => (m && m[1] >= x[1] ? m : x), null);
          if (top && r.oferta < top[1]) {
            const pais = (cfg.canales.find((x) => x.id === top[0]) || {}).pais || top[0];
            r.pasos = r.pasos.filter((p) => !p.destacado);
            r.pasos.push({ label: "Tarifas da " + r.oferta + ", más barato que " + pais + ": nunca puede ser más barato que " + c.noMenosQue.map((id) => (cfg.canales.find((x) => x.id === id) || {}).pais || id).join(" ni ") + " → se iguala a " + pais, valor: top[1], destacado: true });
            r.oferta = top[1];
            r.como = (r.como || "") + " · igualado a " + pais;
          }
        }
        // Tachado según la norma actual del fichero (Leroy, Jennifer 2026-11-04).
        if (r.oferta != null && cfg.tachado === "fuera") {
          const minimo = Math.ceil(r.oferta / 0.7 - 1e-6);
          const m = /(\d{2,3})X\d{3}/i.exec(sku) || /(\d{2,3})$/.exec(sku);
          const esColchon = !/^(M?)(CAN|BASE|PACK|CAB|2?ALM|TOPPER)/i.test(sku);
          const div = (c.tachadoModo === "ancho" || (c.tachadoModo === "anchoColchones" && esColchon)) && m ? tarifaTachadoDivisor(m[1]) : null;
          if (div) {
            r.tachado = Math.max(round2(r.oferta / div), minimo);
            r.pasos.push({ label: "Precio tachado = oferta ÷ " + String(div).replace(".", ",") + " (regla por ancho, como el fichero de colchones API)" + (r.tachado === minimo && round2(r.oferta / div) < minimo ? ", subido para que la oferta quede un 30 % por debajo" : ""), valor: r.tachado, destacado: true });
          } else if (tachadoGuardado != null && tachadoGuardado >= minimo) {
            r.tachado = tachadoGuardado;
            r.pasos.push({ label: "Precio tachado: se mantiene el actual (la oferta queda un " + Math.round((1 - r.oferta / tachadoGuardado) * 100) + " % por debajo)", valor: r.tachado, destacado: true });
          } else {
            r.tachado = minimo;
            r.pasos.push({ label: "Precio tachado = oferta ÷ 0,70, redondeado al alza" + (tachadoGuardado != null ? " (el actual, " + tachadoGuardado + ", dejaba menos de un 30 % de descuento)" : ""), valor: r.tachado, destacado: true });
          }
        }
        if (skuNuestro && skuNuestro !== String(skuFichero).toUpperCase() && r.pasos.length) r.pasos = [{ label: "EAN " + skuFichero + " = " + skuNuestro + (cfg.colSkuNuestro ? " (columna " + cfg.colSkuNuestro + ")" : " (por el nombre del producto)"), valor: null }, ...r.pasos];
        canales[c.id] = { ...r, ofertaGuardada: num(val(fila, c.colOferta)), tachadoGuardado };
        if (alias && r.pasos.length) r.pasos = [{ label: "SKU " + skuFichero + " = " + alias + " (enlazado a mano a Tarifas)", valor: null }, ...r.pasos];
        if (r.oferta != null && !aliasSinCanal) {
          out[c.colTachado] = fmt(r.tachado); out[c.colOferta] = fmt(r.oferta);
          // Worten: precio por canal y de descuento = la oferta.
          for (const col of c.colIguales || []) out[col] = fmt(r.oferta);
          for (const col of c.colIgualesSiHay || []) if (val(fila, col) !== "") out[col] = fmt(r.oferta);
        }
      }
      let general = null;
      if (cfg.general) {
        const g = cfg.general;
        // Se mantiene el precio general actual; solo sube si alguna oferta
        // quedaría a menos de un 30 % por debajo.
        const ofertas = cfg.canales.filter((c) => canales[c.id]).map((c) => (canales[c.id].oferta != null ? canales[c.id].oferta : canales[c.id].ofertaGuardada)).filter((x) => x != null);
        const minimo = ofertas.length ? Math.ceil(Math.max(...ofertas) / 0.7 - 1e-6) : null;
        const tachadoGuardado = num(val(fila, g.colTachado));
        const base = canales[g.canalOferta];
        general = {
          tachadoGuardado, ofertaGuardada: num(val(fila, g.colOferta)), minimo,
          tachado: tachadoGuardado != null && (minimo == null || tachadoGuardado >= minimo) ? tachadoGuardado : minimo,
          oferta: base && base.oferta != null ? base.oferta : null,
        };
        // Conforama: el precio general es siempre el tachado de su canal.
        if (g.igualAlCanal && canales[g.igualAlCanal]) {
          const cc = canales[g.igualAlCanal];
          general.tachado = cc.oferta != null ? cc.tachado : cc.tachadoGuardado;
          general.igualAlCanal = true;
        }
        if (general.tachado != null) out[g.colTachado] = fmt(general.tachado);
        // Maison: sin oferta general (la columna va vacía en su fichero).
        if (g.sinOferta) general.oferta = null;
        // Worten: la oferta general solo donde ya la hay (almohadas sin ella).
        else if (general.oferta != null && !(g.ofertaSiHay && val(fila, g.colOferta) === "")) out[g.colOferta] = fmt(general.oferta);
        // Precio sin IVA (Maison, Jennifer 2026-11-04): "es el precio sin IVA
        // de la columna W" = price[channel=ES] ÷ 1,21. Siempre (en tapicería
        // el fichero traía valores que no cuadraban).
        if (g.colSinIva && canales.ES) {
          const tES = canales.ES.oferta != null ? canales.ES.tachado : canales.ES.tachadoGuardado;
          if (tES != null) out[g.colSinIva] = (Math.round(tES / 1.21 * 100) / 100).toFixed(2);
        }
      }
      // Stock: vivos siempre a 100, descatalogados a 0 (Jennifer, 2026-11-04).
      // stockCero: no se venden en este market aunque estén vivos en otros
      // (Conforama Francia: COLGRA a 0, como en su fichero API).
      const descatalogado = esDescatalogado(sku) || (cfg.stockCero || []).some((p) => String(sku).toUpperCase().startsWith(p));
      if (ix.has(colCantidad.toLowerCase())) out[colCantidad] = String(descatalogado ? 0 : STOCK_VIVO);
      const cambios = Object.entries(out).filter(([col, v]) => num(val(fila, col)) !== num(v)).map(([col]) => (col === colCantidad ? "quantity" : col));
      salida.push({ sku: skuFichero, skuNuestro: alias || (skuNuestro && skuNuestro !== String(skuFichero).toUpperCase() ? skuNuestro : null), canales, general, salida: out, cambios, descatalogado, stockGuardado: num(val(fila, colCantidad)) });
    }
    return salida;
  }

  async verFicheroCompleto(cliente) {
    const cfg = CLIENTES_FICHERO_COMPLETO[cliente];
    const base = { ok: true, cliente, nombre: cfg.nombre, canales: cfg.canales.map((c) => ({ id: c.id, pais: c.pais, columna: c.columna })), general: !!cfg.general };
    const { meta, cabeceras, filas } = await this.leerFicheroCompleto(cliente);
    if (!meta) return Response.json({ ...base, meta: null, filas: [] });
    const calculo = await this.calcularFicheroCompleto(cliente, cabeceras, filas);
    const colDesc = (cfg.colDescripcion || "description").toLowerCase();
    const iDesc = cabeceras.findIndex((h) => h.toLowerCase() === colDesc);
    return Response.json({
      ...base, meta: { ...meta, cabeceras: undefined }, cabeceras,
      filas: filas.map((f, i) => ({ valores: f, description: iDesc >= 0 ? f[iDesc] : "", ...calculo[i] })),
    });
  }

  // CSV de importación con los precios al día (sin tarifa → último precio
  // guardado). Lo descargado pasa a ser el "último descargado" de cada fila.
  async csvFicheroCompleto(cliente, usuario) {
    const cfg = CLIENTES_FICHERO_COMPLETO[cliente];
    const { meta, cabeceras, filas } = await this.leerFicheroCompleto(cliente);
    if (!meta) return Response.json({ ok: false, error: "Todavía no hay fichero guardado para este cliente." }, { status: 404 });
    const calculo = await this.calcularFicheroCompleto(cliente, cabeceras, filas);
    const ix = new Map(cabeceras.map((h, i) => [h.toLowerCase(), i]));
    const nuevas = filas.map((f, i) => {
      const n = f.slice();
      for (const [col, v] of Object.entries(calculo[i].salida)) { const j = ix.get(col.toLowerCase()); if (j !== undefined) n[j] = v; }
      return n;
    });
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
    await this.guardarFilasFicheroCompleto(cliente, { ...meta, ultimaDescarga: { fecha: new Date().toISOString(), usuario: usuario || null } }, nuevas);
    const nombre = cfg.nombre.toUpperCase() + " ofertas (import) " + hoy + ".csv";
    return new Response(toCsv([cabeceras, ...nuevas], meta.sep || cfg.sep), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"" + nombre + "\"" },
    });
  }

  async getTarifaTabla(stockModel) {
    const products = await this.load("products", {});
    const product = productoDeTarifa(products, stockModel);
    if (!product) return Response.json({ ok: false, error: "Modelo no encontrado." }, { status: 404 });
    // Unión con TARIFA_TALLAS_EXTRA_MODELO (tallas que no son variante real
    // de Shopify pero sí se venden en otros marketplaces, ver arriba).
    const tallas = [...new Set([...(product.tallas || []), ...(TARIFA_TALLAS_EXTRA_MODELO[stockModel] || [])])];
    const filas = [];
    for (const talla of tallas) {
      filas.push(await this.calcularTarifaModelo(stockModel, talla));
    }
    return Response.json({ ok: true, stockModel, filas });
  }

  // Guarda (reemplazo completo, es una re-subida del listado entero) el
  // listado de SKU de una plataforma + a qué columna de Tarifas corresponde
  // su "precio de oferta" (Jennifer, 2026-09-23: "necesito tener este
  // fichero en el sistema para que si hacemos alguna actualización de
  // precio, ese fichero se actualice"). Cada fila puede traer
  // stockModel+talla (se recalcula en caliente al exportar) o, si no hay
  // fórmula para ese artículo (ej. toppers), un `precioOfertaManual` fijo
  // que se conserva tal cual.
  async cargarPlataformaExport({ plataforma, columnas, columnaPrecio, filename, filas }) {
    if (!plataforma || !columnaPrecio || !Array.isArray(filas)) {
      return Response.json({ ok: false, error: "Faltan plataforma, columnaPrecio o filas." }, { status: 400 });
    }
    const todas = await this.load("plataformaExportaciones", {});
    todas[plataforma] = {
      columnas: columnas || ["SKU", "PRECIO TACHADO", "PRECIO OFERTA", "STOCK"],
      columnaPrecio,
      filename: filename || (plataforma + "_precios.xlsx"),
      filas,
      actualizado: new Date().toISOString(),
    };
    await this.state.storage.put("plataformaExportaciones", todas);
    return Response.json({ ok: true, totalFilas: filas.length });
  }

  async listarPlataformasExport() {
    const todas = await this.load("plataformaExportaciones", {});
    const plataformas = Object.entries(todas).map(([plataforma, cfg]) => ({
      plataforma,
      columnaPrecio: cfg.columnaPrecio,
      totalFilas: (cfg.filas || []).length,
      actualizado: cfg.actualizado || null,
    }));
    // Ordenado por familia de plataforma, no por orden de carga (Jennifer,
    // 2026-09-23: "que Maison estén todas juntas, Worten todas juntas,
    // Leroy Merlin todas juntas...") — el nombre ya es FAMILIA_PAÍS
    // (MAISON_ES/MAISON_FR/MAISON_IT...), así que un orden alfabético
    // simple ya agrupa por familia y además ordena ES/FR/IT/PT dentro.
    plataformas.sort((a, b) => a.plataforma.localeCompare(b.plataforma));
    return Response.json({ ok: true, plataformas });
  }

  // Regenera el .xlsx EN CALIENTE con los precios actuales de Tarifas —
  // Jennifer solo tiene que volver a descargarlo cuando haga falta, nunca
  // hay que volver a subírselo a mano tras una actualización de precio.
  async exportarPlataforma(plataforma) {
    const todas = await this.load("plataformaExportaciones", {});
    const cfg = todas[plataforma];
    if (!cfg) return Response.json({ ok: false, error: "Plataforma no cargada." }, { status: 404 });

    const cache = {};
    const rows = [];
    for (const fila of cfg.filas) {
      let precioOferta = fila.precioOfertaManual ?? null;
      // Sin fórmula/tarifa disponible (Topper, modelo descatalogado como
      // Sensei Zen, o una talla que ni la sustitución general cubre) — se
      // mantiene el último precio conocido y se marca en amarillo
      // (Jennifer, 2026-09-23: "necesito que de alguna manera lo señales
      // en el fichero, para que así yo lo pueda detectar").
      let sinRecalcular = true;
      if (fila.stockModel && fila.talla) {
        const key = fila.stockModel + "|" + fila.talla;
        if (!(key in cache)) cache[key] = await this.calcularTarifaModelo(fila.stockModel, fila.talla);
        const calculo = cache[key];
        const col = calculo && calculo.columnas && calculo.columnas[cfg.columnaPrecio];
        if (col && col.precio != null) {
          precioOferta = col.precio;
          sinRecalcular = false;
        }
      }
      // El PRECIO TACHADO se deriva del de oferta cuando este sí se ha
      // recalculado con Tarifas — si la oferta se queda con el último
      // precio manual (fila sin fórmula), el tachado tampoco se toca.
      let precioTachado = fila.precioTachado ?? null;
      if (!sinRecalcular) {
        const divisor = tarifaTachadoDivisor(fila.talla);
        if (divisor) precioTachado = round2(precioOferta / divisor);
      }
      const celdaPrecio = sinRecalcular ? { v: precioOferta, highlight: true } : precioOferta;
      rows.push([fila.sku, precioTachado, celdaPrecio, fila.stock ?? null]);
    }

    const bytes = await buildXlsxBytes(cfg.columnas, rows);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${cfg.filename}"`,
      },
    });
  }

  // Plazos de entrega > Marketplace (Jennifer, 2026-09-23): igual que la
  // exportación de precios, reemplazo completo del listado (una vez, o
  // cuando cambie el propio listado de SKU) — el .xlsx se regenera en
  // caliente cada descarga con el STOCK actual, no con el de cuando se
  // cargó. Cada fila trae `tipo` ("colchon"|"almohada"|"spring_zen"|
  // "topper") para saber qué regla de días aplicar.
  async cargarPlazosMarketplace({ filas }) {
    if (!Array.isArray(filas)) {
      return Response.json({ ok: false, error: "Faltan filas." }, { status: 400 });
    }
    const todos = await this.load("plazosExportaciones", {});
    todos.MARKETPLACE = {
      columnas: ["MODELO", "SKU", "DIAS"],
      filename: "MARKETPLACE-PLAZOS.xlsx",
      filas,
      actualizado: new Date().toISOString(),
    };
    await this.state.storage.put("plazosExportaciones", todos);
    return Response.json({ ok: true, totalFilas: filas.length });
  }

  async listarPlazos() {
    const todos = await this.load("plazosExportaciones", {});
    const plazos = Object.entries(todos).map(([plazo, cfg]) => ({
      plazo,
      totalFilas: (cfg.filas || []).length,
      actualizado: cfg.actualizado || null,
      ultimaDescarga: cfg.ultimaDescarga || null,
    }));
    return Response.json({ ok: true, plazos });
  }

  async exportarPlazosMarketplace() {
    const todos = await this.load("plazosExportaciones", {});
    const cfg = todos.MARKETPLACE;
    if (!cfg) return Response.json({ ok: false, error: "Marketplace no cargado." }, { status: 404 });
    // Fecha de la última vez que se pulsó "Descargar" (Jennifer,
    // 2026-09-24: "puedes indicar la fecha última en la que se descargó el
    // fichero de plazos de entrega") — el fichero se regenera en caliente
    // cada vez con el stock actual, así que "cargado" (cuándo se subió el
    // listado de SKU) y "descargado" (cuándo se bajó el .xlsx de verdad)
    // son fechas distintas; antes solo se guardaba la primera.
    cfg.ultimaDescarga = new Date().toISOString();
    await this.state.storage.put("plazosExportaciones", todos);

    const stock = await this.load("stock", {});
    const rows = cfg.filas.map((fila) => {
      let dias;
      if (fila.tipo === "topper") {
        dias = 7;
      } else {
        const cantidad = (stock[stockKey(fila.stockModel, fila.talla)] || {}).cantidad || 0;
        dias = calcularDiasPlazo(fila.tipo, cantidad > 0);
      }
      return [fila.modelo, fila.sku, dias];
    });

    const bytes = await buildXlsxBytes(cfg.columnas, rows);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${cfg.filename}"`,
      },
    });
  }

  async processSale({ orderId, orderNumber, platform, orderRef, items, force, orderDate, services, paymentStatus, seurSplitDecision, agenciaForzada }) {
    // Mientras el catálogo/stock no esté configurado del todo, Jennifer
    // pidió no tocar los pedidos que van entrando (ni agencia ni stock).
    // Cuando esté todo listo, un POST a /admin/resume lo reactiva y los
    // pedidos que se sincronicen a partir de ahí sí se procesan. `force`
    // permite procesar un pedido suelto a modo de prueba sin reactivar el
    // procesamiento general (usado desde /orders/force-process).
    if (!force && (await this.load("paused", false))) {
      return Response.json({ agencia: null, pendingManufacture: null, needsReview: false, reviewReasons: [], paused: true });
    }
    // Regla de negocio crítica (Jennifer, 2026-08-26): nunca generar
    // agencia/proveedor/referencia para un pedido que no esté PAGADO de
    // verdad en Shopify — si es financiación (Cetelem/SeQura) sin conceder
    // o transferencia sin marcar recibida y luego no se confirma, no
    // queremos haber fabricado ya nada para un pedido que puede no
    // llegar a venderse. A diferencia de la pausa general, esto NO se
    // salta con `force` — es una regla de seguridad, no una prueba.
    // No se marca inventoryProcessed (ver orders-store.js), así que se
    // reintenta solo en el próximo sync/webhook una vez pase a PAGADO.
    if (paymentStatus !== "PAGADO") {
      return Response.json({ agencia: null, pendingManufacture: null, needsReview: false, reviewReasons: [], paused: true, unpaid: true });
    }

    const products = await this.load("products", {});
    const stock = await this.load("stock", {});
    const backorders = await this.load("backorders", []);

    const flat = [];
    let needsReview = false;
    const reviewReasons = [];

    for (const item of items) {
      const resolved = resolveItem(item, products);
      if (resolved.tipo === "pack") {
        if (resolved.needsReview) needsReview = true;
        if (resolved.ambiguousNotes && resolved.ambiguousNotes.length) {
          needsReview = true;
          reviewReasons.push(...resolved.ambiguousNotes);
        }
        for (const c of resolved.componentes) flat.push({ ...c, qty: c.qtyOverride || resolved.qty, fromPack: true });
      } else if (resolved.tipo === "desconocido") {
        needsReview = true;
      } else {
        if (resolved.tipo === "otro") needsReview = true;
        flat.push(resolved);
      }
    }

    const hasTapiceria = flat.some((c) => c.tipo === "tapiceria");
    // El cabecero se hace a juego del canapé del mismo pedido (Jennifer,
    // 2026-09-28): con INITIAL la tela Beige es Duna Lino; con SPACE DELUXE
    // o suelto, Duna Alpaca.
    const cabeceroConInitial = flat.some((c) => c.product && c.product.product_type === "Canapé" && matchCanapeRecipeKey(c.product.title) === "initial");
    let agencia;
    let pendingManufacture = null;

    let colchonesSueltos = [];
    if (flat.length === 0) {
      agencia = "FURNITURE";
      needsReview = true;
    } else if (hasTapiceria) {
      agencia = "FURNITURE";
    } else {
      colchonesSueltos = flat.filter((c) => c.tipo === "colchon");
      agencia = colchonesSueltos.some((c) => c.product.exceptionFurniture) ? "FURNITURE" : "SEUR";
    }
    // Subida a domicilio / retirada del colchón antiguo (Jennifer,
    // 2026-10-15, BEZEN12318): ese servicio solo lo hace Furniture — "NUNCA
    // puede salir con Seur". Y los complementos (almohadas, protector) van
    // en el mismo envío, que Furniture no los cobra aparte.
    if (tieneServicioSubidaRetirada(services)) agencia = "FURNITURE";
    // Pedido de un envío conjunto (Jennifer, 2026-11-05, BEZEN12395 junto
    // con BEZEN12381): sale con el otro pedido por Furniture, así que no hay
    // decisión de SEUR (dividir/esperar) que tomar.
    if (agenciaForzada === "FURNITURE") agencia = "FURNITURE";

    // Caso sin regla fija posible (Jennifer, 2026-08-25): un colchón suelto
    // (no parte del pack) que comparte pedido con tapicería. No hay forma
    // automática de saber si debe esperar al mismo envío o salir aparte —
    // se marca para que ella decida pedido a pedido (ver reviewNote).
    // Si el colchón está en stock no hay nada que decidir (Jennifer,
    // 2026-10-06, BEZEN12286): se descuenta, se reserva y sale con la
    // tapicería.
    const enStock = (c) => c.product && ((stock[stockKey(c.product.stockModel, c.talla)] || {}).cantidad || 0) >= (c.qty || 1);
    if (hasTapiceria && flat.some((c) => c.tipo === "colchon" && !c.fromPack && !enStock(c))) {
      needsReview = true;
      reviewReasons.push("Hay un colchón suelto (no es parte del pack) en un pedido que también lleva tapicería. Decide si debe ir en el mismo envío que la tapicería o aparte.");
    }

    // Pedido de 2+ colchones sueltos por SEUR donde unos hay en stock y otros
    // no (Jennifer, 2026-09-08): "cada pedido es un mundo" — en vez de
    // decidir sola, se para sin tocar stock/pendientes y se le pregunta si
    // quiere dividir el envío ya o esperar a tenerlo completo. No aplica con
    // un solo colchón (ahí no hay nada que dividir) ni cuando ya ha
    // decidido dividir (seurSplitDecision, ver /orders/seur-dividir).
    if (agencia === "SEUR" && colchonesSueltos.length >= 2 && !seurSplitDecision) {
      const { mixto, detalle } = checkColchonesCoverage(stock, colchonesSueltos);
      if (mixto) {
        return Response.json({
          agencia: null, pendingManufacture: null, needsReview: false, reviewReasons: [],
          seurMixedPending: true, seurMixedInfo: { colchones: detalle },
        });
      }
    }

    // Colchones sueltos de un pedido SEUR (Jennifer, 2026-09-08): si ya se
    // decidió dividir, la parte que se queda pendiente en Luso/New necesita
    // una referencia distinta ("2" al final) para no chocar con la del
    // envío que ya sale ahora con lo que sí había en stock — pero solo si
    // de verdad hay una parte que sale ya (si al final no queda nada en
    // stock, no hay división real, todo va con la referencia normal).
    let seurRefSuffix = "";
    if (agencia === "SEUR" && seurSplitDecision && colchonesSueltos.length >= 2) {
      const { detalle } = checkColchonesCoverage(stock, colchonesSueltos);
      if (detalle.some((d) => d.disponible > 0) && detalle.some((d) => d.disponible < d.cantidad)) {
        seurRefSuffix = "2";
      }
    }

    // Suma de cualquier artículo con stock tracking (colchón, almohada,
    // protector, topper) que ya tenía stock real cuando se procesó — no
    // solo colchones (Jennifer, 2026-09-08: un pedido de solo almohadas
    // también va por SEUR y también tiene que prepararse solo si hay
    // stock). El "mixto" que para y pregunta sigue siendo solo de colchones
    // (colchonesSueltos, más arriba) — eso no cambia.
    let seurCubierto = 0;
    const stockTapiceria = await this.load("stockTapiceria", []);

    for (const item of flat) {
      const isStockTracked = STOCK_TYPES.has(item.tipo);
      if ((!isStockTracked && item.tipo !== "tapiceria") || !item.product) continue;
      const proveedor = item.product.proveedor || null;
      // Mientras el pedido tenga una pregunta sin responder sobre este
      // artículo (colchón suelto junto a tapicería, colchón del pack sin
      // stock, o un componente del pack cuyo SKU era ambiguo), su pendiente
      // no se asienta en ninguna carpeta de Proveedores concreta — se
      // guarda como "pendiente de decisión" hasta que Jennifer responda
      // (ver releaseDecision, llamado desde /orders/review-note).
      const needsDecision = (item.tipo === "colchon" && hasTapiceria) || !!item.ambiguousMatch;

      // La tapicería (canapé/cabecero/base) no lleva control de stock — se
      // pide a fabricar en Polival siempre, en todos los pedidos, así que
      // genera pendiente sin más (a petición de Jennifer, 2026-08-25),
      // igual que los "no llevamos stock" (ej. Látex Natura).
      if (!isStockTracked || item.product.noStock) {
        if (!proveedor) {
          // Descatalogados (Mónaco, Sensei Zen, Grafeno Premium...) no
          // tienen proveedor a propósito: Jennifer confirmó que no van a
          // ninguna carpeta porque ya no se venden. Cualquier otro caso sin
          // proveedor sí se marca para asignar a mano en Catálogo.
          if (!item.product.noStock) needsReview = true;
          continue;
        }
        // Referencia única de Polival (Jennifer, 2026-08-25): correlativo
        // 001, 002... con prefijo/sufijo según el artículo. Este camino
        // siempre crea un pendiente, así que se genera aquí sin riesgo de
        // desperdiciar números.
        let referencia = null;
        // Ya está en el almacén (stock de tapicería, Jennifer, 2026-10-20):
        // se coge esa unidad con su referencia y no se pide a fábrica.
        const deStockTap = item.tipo === "tapiceria" && item.qty === 1
          ? buscarStockTapiceria(stockTapiceria, backorders, item.product.stockModel, item.talla, item.color) : null;
        if (deStockTap) {
          const idTap = this.addNoStockBackorder(backorders, item, orderId, orderNumber, hasTapiceria, orderDate, proveedor, needsDecision, deStockTap.referencia || null, "DEL STOCK DE TAPICERÍA" + (deStockTap.referencia ? " (" + deStockTap.referencia + ")" : "") + " — ya en el almacén, no pedir a fábrica" + (deStockTap.nota ? " · " + deStockTap.nota : ""), platform, orderRef);
          const bo = backorders.find((b) => b.id === idTap);
          if (bo) {
            bo.estado = "cubierto";
            bo.recibidoFabrica = true;
            bo.fechaRecibido = new Date().toISOString();
            bo.stockTapiceriaId = deStockTap.id;
          }
          continue;
        }
        if (proveedor === "POLIVAL") {
          const numero = await nextReferenciaNumero(this.state);
          const vaFurniture = item.tipo === "tapiceria" || item.product.exceptionFurniture || agencia === "FURNITURE";
          const built = buildReferencia(numero, item.product.referenciaTipo, item.color, vaFurniture);
          referencia = built.referencia;
          if (built.needsReview) {
            needsReview = true;
            reviewReasons.push(built.reason);
          }
        }
        // "Mercancía para pedir a fábrica" (Jennifer, 2026-08-25, ampliado
        // 2026-09-25 con Canapé fijo y Colchones exceptionFurniture): se
        // calcula sola por receta para canapés, cabeceros ya clasificados
        // (Aura), Canapé fijo (Base Alpha) y Látex Natura/Premium; el resto
        // (almohadas, topper, cabeceros sin receta, bases) sigue en
        // blanco/editable a mano.
        let mercanciaFabrica = null;
        if (proveedor === "POLIVAL" && item.product.product_type === "Canapé") {
          const built = buildCanapeMercancia(item.product.title, item.color, item.talla, services);
          mercanciaFabrica = built.texto;
          if (built.needsReview) {
            needsReview = true;
            reviewReasons.push(built.reason);
          }
        } else if (proveedor === "POLIVAL" && item.product.product_type === "Cabecero") {
          const built = buildCabeceroMercancia(item.product.title, item.color, item.talla, item.variantTitle, cabeceroConInitial);
          mercanciaFabrica = built.texto;
          if (built.needsReview) {
            needsReview = true;
            reviewReasons.push(built.reason);
          }
        } else if (proveedor === "POLIVAL" && item.product.product_type === "Canapé fijo") {
          const built = buildCanapeFijoMercancia(item.color, item.talla);
          mercanciaFabrica = built.texto;
          if (built.needsReview) {
            needsReview = true;
            reviewReasons.push(built.reason);
          }
        } else if (proveedor === "POLIVAL" && item.product.product_type === "Colchones") {
          const built = buildColchonMercancia(item.product.stockModel, item.talla);
          mercanciaFabrica = built.texto;
          if (built.needsReview) {
            needsReview = true;
            reviewReasons.push(built.reason);
          }
        } else if (proveedor === "POLIVAL" && item.product.product_type === "Base" && platform === "Groupon") {
          mercanciaFabrica = buildBaseGrouponMercancia(item.product.stockModel, item.talla).texto;
        }
        const idBo = this.addNoStockBackorder(backorders, item, orderId, orderNumber, hasTapiceria, orderDate, proveedor, needsDecision, referencia, mercanciaFabrica, platform, orderRef);
        // Canapé de 160 que no es de madera: Polival necesita saber si va en
        // GEMELOS o PARTIDO (Jennifer, 2026-09-28). Si el cliente NO lo ha
        // comprado en gemelos, va PARTIDO directamente. Si lo ha comprado en
        // gemelos, se le pregunta SIEMPRE a ella (a veces el cliente cambia
        // de idea al llamarle): pregunta en la campana y el pendiente queda
        // "falta elegir" hasta que lo elige en Polival.
        if (necesitaFormato160(item)) {
          const bo = backorders.find((b) => b.id === idBo);
          if (bo && !bo.formato160) {
            if (/gemelo/i.test((item.variantTitle || "") + " " + (item.variantPack || ""))) {
              bo.necesitaFormato160 = true;
              needsReview = true;
              reviewReasons.push(`${PREGUNTA_FORMATO_160} El cliente ha comprado en GEMELOS: ${item.product.title} (${item.talla}${item.color ? ", " + item.color : ""}). Confírmalo en Proveedores · Polival.`);
            } else {
              bo.formato160 = "PARTIDO";
              bo.mercanciaFabrica = textoConFormato160(bo.mercanciaFabrica, "PARTIDO");
            }
          }
        }
        // Pieza suelta del almacén (Jennifer, 2026-10-20): se usa, se avisa
        // en el pedido y en el pedido a Polival va la nota para revisarla.
        if (item.tipo === "tapiceria" && item.qty === 1) {
          const piezas = buscarPiezasStockTapiceria(stockTapiceria, backorders, item.product.stockModel, item.talla, item.color);
          const bo = piezas.length ? backorders.find((b) => b.id === idBo) : null;
          if (bo) {
            usarPiezasStock(bo, piezas);
            needsReview = true;
            reviewReasons.push("OJO: he usado una pieza suelta del almacén para " + item.product.stockModel + " " + item.talla + (item.color ? " " + item.color : "") + ": " + bo.piezasStockTexto.join(", ") + ". En el pedido a Polival va la nota para que la revisen en fábrica y no la fabriquen si está bien.");
          }
        }
        if (item.tipo === "colchon" && item.fromPack && hasTapiceria) {
          pendingManufacture = { modelo: item.product.stockModel, talla: item.talla, cantidad: item.qty };
          needsReview = true;
          reviewReasons.push(`${item.product.stockModel} (${item.talla}) del pack sin stock (fabricación bajo pedido, faltan ${item.qty}). Dime si sale junto con la tapicería (FUR) o puede ir aparte (FPK).`);
        }
        continue;
      }

      if (!proveedor) needsReview = true;
      const refSuffix = agencia === "SEUR" && item.tipo === "colchon" ? seurRefSuffix : "";
      const { falta, covered, reviewNotes } = await this.applyStockUsage(stock, backorders, item, orderId, orderNumber, hasTapiceria, orderDate, proveedor, needsDecision, refSuffix, platform, orderRef, agencia);
      if (agencia === "SEUR") seurCubierto += covered;
      if (reviewNotes.length) {
        needsReview = true;
        reviewReasons.push(...reviewNotes);
      }
      if (item.tipo === "colchon" && item.fromPack && falta > 0 && hasTapiceria) {
        pendingManufacture = { modelo: item.product.stockModel, talla: item.talla, cantidad: falta };
        needsReview = true;
        reviewReasons.push(`${item.product.stockModel} (${item.talla}) del pack sin stock suficiente (faltan ${falta}). Dime si sale junto con la tapicería (FUR) o puede ir aparte (FPK).`);
      }
    }

    await this.state.storage.put("stock", stock);
    await this.state.storage.put("backorders", backorders);

    // Listo para SEUR ahora mismo (Jennifer, 2026-09-08): hay algo de este
    // pedido que ya tenía stock real y puede prepararse para la próxima
    // carga — se decide aquí porque solo InventoryStore sabe si de verdad se
    // ha descontado stock (OrdersStore es quien asigna la carga en sí).
    const seurReady = agencia === "SEUR" && seurCubierto > 0;

    return Response.json({ agencia, pendingManufacture, needsReview, reviewReasons, seurReady });
  }
}
