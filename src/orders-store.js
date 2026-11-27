import { montanaPendiente } from "./cp-montana.js";
import { enviarReservaAlmacen, bultosPorUnidad, lineaTextoReserva, referenciaPedidoAlmacen } from "./avisos-almacen.js";

const ORPHAN_RE = /BEZEN0*([0-9]+)/i;

// Fecha de corte para Bezen/Shopify (Jennifer, 2026-09-23), mismo mecanismo
// que PROCESAMIENTO_DESDE ya usa cada marketplace (Carrefour, etc., ver
// index.js) pero aplicado aquí a Shopify — hasta hoy no existía ninguna
// puerta de este tipo para Bezen, así que CUALQUIER pedido pagado sin
// `inventoryProcessed` (había 397, de julio y agosto, de cuando
// InventoryStore todavía estaba en pausa) podía dispararse solo en la
// siguiente sincronización/webhook y generar pendientes sorpresa en
// Polival/Luso/New — pasó dos veces el mismo día con BEZEN12122 (LUSO) y
// BEZEN12123 (Polival), Jennifer: "para que así no tengamos confusión, si
// hay que meter algo yo te aviso". A partir de aquí, cualquier pedido con
// `orderNumber` MENOR que este corte se marca `inventoryProcessed:true`
// directamente, SIN pasar por InventoryStore (sin agencia, sin pendiente,
// sin tocar stock) — se considera ya resuelto por la vía anterior. `force`
// (ver /orders/force-process) sigue permitiendo procesar uno concreto a
// mano si Jennifer lo pide explícitamente.
const SHOPIFY_PROCESAMIENTO_DESDE = 12223;

// Notas internas de Sergio (Jennifer, 2026-09-21): mismo patrón que
// mergeOrphans usa para fusionarlas en la vista (un pedido de Shopify sin
// servicios cuyo título solo referencia OTRO pedido BEZEN) — pero aquí se
// usa para decidir si hay que marcarlo como enviado en Shopify SIN
// seguimiento (no son un envío real, index.js hace la llamada real).
function esNotaSergio(order) {
  if (order.platform !== "Shopify") return false;
  const match = !order.services && (order.product || "").match(ORPHAN_RE);
  return !!match && Number(match[1]) !== order.orderNumber;
}

// Estado (color), observaciones y los datos de inventario (agencia, pendiente
// de fabricante) son datos manuales o calculados una sola vez, no vienen de
// Shopify: hay que conservarlos cuando un sync/webhook reemplaza los campos
// de la tienda con datos frescos. La agencia se fija con el stock que había
// en el momento de la venta, no se recalcula en resyncs posteriores.
// Si se cambió la medida del pedido antes de tramitarlo (Jennifer,
// 2026-10-14), se tramita ya con la medida nueva.
function itemsConCambioMedida(order) {
  const items = order.items || [];
  const cm = order.cambioMedida;
  if (!cm || !cm.de || !cm.a) return items;
  const [dw, dl] = cm.de.split("X");
  const [w, l] = cm.a.split("X");
  const re = new RegExp(dw + "\\s*[xX×]\\s*" + dl, "g");
  return items.map((it) => ({ ...it, variantTitle: String(it.variantTitle || "").replace(re, w + "x" + l), sku: String(it.sku || "").replace(re, w + "X" + l) }));
}

// Pedido cancelado / reembolsado (Jennifer, 2026-11-05, Carrefour
// 76441060-A): nunca entra en una carga.
function pedidoCancelado(o) {
  return !!(o && (o.cancelado || o.shopifyCancelado || /cancelad|reembolsad|rechazad|anulad/i.test(o.estado || "")));
}
const PRESERVED_FIELDS = ["colorTag", "observaciones", "notas", "agencia", "pendingManufacture", "needsReview", "inventoryProcessed", "reviewReasons", "reviewAnswers", "cargaId", "cancelado", "paraTenerEnCuenta", "furnitureTracking", "seurTracking", "shopifyFulfilled", "shopifyFulfillmentId", "gestionadoExterno", "vistoSinPagar", "fechaTramitacion", "pagoConfirmadoManual", "grupoEnvio", "agenciaAntesDeGrupo", "agenciaAntesDeFurniture", "motivoFurniture", "noSalioSeur", "lineasCanceladas", "retenido", "tapiceriaEnviada", "enviosSeurInfo", "direccionManual", "direccionOriginal", "recogeCliente", "agenciaAntesDeRecogida", "entregadoCliente", "sinAvisoSeguimiento", "motivoFueraCarga", "cambioMedida", "cambioColor", "suplementoMontana", "emailPenalizacion", "grouponEco", "grouponEcoRespuesta", "alertaPrecio", "servicioQuitado", "tiktokRetenido", "tiktokRevision", "montajeManual"];

// Campos que escribe processInventory al tramitar un pedido. Cuando en esta
// misma pasada se acaba de tramitar (incoming.inventoryProcessed y el
// guardado no lo estaba) mandan los valores nuevos: si no, un pedido
// "desprocesado" (inventoryProcessed:false, agencia:null guardados) pisaba
// el resultado recién calculado con los valores viejos y no se tramitaba
// nunca (visto 2026-09-28 revisando BEZEN12205).
const CAMPOS_DE_TRAMITACION = ["inventoryProcessed", "agencia", "pendingManufacture", "needsReview", "reviewReasons", "vistoSinPagar", "fechaTramitacion"];

// Cargas de Furniture (Jennifer, 2026-08-26): cargan miércoles y viernes,
// así que la "próxima carga" siempre es el miércoles o viernes más cercano
// desde hoy (incluyendo hoy mismo si hoy ya es uno de esos días).
const DIAS_CARGA = { 3: "MIÉRCOLES", 5: "VIERNES" };
function nextCargaDate(from) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  while (!(d.getDay() in DIAS_CARGA)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}
function cargaFechaKey(d) {
  return d.toISOString().slice(0, 10);
}

// Cargas de SEUR (Jennifer, 2026-09-08): a diferencia de Furniture (una sola
// carga abierta a la vez, miércoles/viernes), SEUR carga de lunes a viernes
// y puede haber varias cargas abiertas a la vez (la de hoy y la de mañana),
// así que se buscan/crean por fecha exacta en vez de "la abierta".
const DIAS_SEMANA = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];
// Festivos sin carga (Jennifer, 2026-10-09: "el lunes 12/10 no hay carga por
// ser festivo... si subo pedidos nuevos directamente se meterán en la carga
// del 13/10"). Lo que caiga en un festivo pasa al siguiente día laborable.
// Misma lista que FESTIVOS_SIN_CARGA en index.js.
const FESTIVOS_SIN_CARGA = ["2026-10-12", "2026-11-09", "2026-12-07", "2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01"];
function esDiaSinCargaSeur(fecha) {
  const w = new Date(fecha + "T12:00:00Z").getUTCDay();
  return w === 0 || w === 6 || FESTIVOS_SIN_CARGA.includes(fecha);
}
function skipWeekend(d) {
  while (d.getDay() === 0 || d.getDay() === 6 || FESTIVOS_SIN_CARGA.includes(cargaFechaKey(d))) d.setDate(d.getDate() + 1);
  return d;
}
// Corte a las 15:00 (Jennifer, 2026-09-08): un pedido con stock que entra
// antes de las 15:00 va a la carga de SEUR de mañana; después de las 15:00,
// a la de pasado mañana. Salta fines de semana en ambos casos.
function nextSeurCargaDate(from) {
  const d = new Date(from);
  const cutoffPassed = d.getHours() >= 15;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (cutoffPassed ? 2 : 1));
  return skipWeekend(d);
}
// Elección manual de "hoy" o "mañana" al marcar un pendiente como recibido
// para SEUR (Jennifer, 2026-09-08) — pedidos atrasados pueden necesitar
// salir el mismo día en que se marcan, así que aquí no se aplica el corte
// de las 15:00 (es una elección explícita). SÍ se saltan fines de semana
// (Jennifer, 2026-09-22: "las cargas de SEUR se hacen solo de lunes a
// viernes" — un viernes, "mañana" tiene que caer en lunes, nunca en
// sábado, que no existe como carga real).
function seurCargaDateFromChoice(choice) {
  // Fecha concreta (AAAA-MM-DD) elegida en el desplegable de días abiertos.
  if (/^\d{4}-\d{2}-\d{2}$/.test(choice || "")) {
    const d = new Date(choice + "T00:00:00Z");
    while (esDiaSinCargaSeur(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }
  // "auto" (Jennifer, 2026-09-30: "si los marco como recibidos y el colchón
  // va solo se tienen que preparar solos para SEUR"): corte de las 15:00 en
  // hora de Madrid — antes de las 15:00, la carga de HOY; después, la de
  // mañana (Jennifer, 2026-10-01: "como es antes de las 15:00 me los
  // debería meter en la carga de hoy"); sin sábados ni domingos.
  if (choice === "auto") {
    const ahora = new Date();
    const hoy = ahora.toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
    const hora = Number(ahora.toLocaleString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false }));
    const d = new Date(hoy + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + (hora >= 15 ? 1 : 0));
    while (esDiaSinCargaSeur(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (choice === "manana") d.setDate(d.getDate() + 1);
  return skipWeekend(d);
}

// Cargas de SEUR fijas (Jennifer, 2026-09-30): "se abra una carga por cada
// día de la semana... el lunes me mostrarás todos los días de lunes a
// viernes, pero el martes me mostrarás la del martes hasta el lunes
// siguiente. No hay cargas ni sábado ni domingo" — siempre abiertas las de
// los 5 próximos días laborables empezando hoy (hora de Madrid). La primera
// es la del 01/10 ("la primera que vamos a abrir es la del día de mañana").
// Un día que ya tuvo carga (abierta o cerrada) no se vuelve a crear, para
// que cerrar la de hoy no abra otra nueva del mismo día.
const SEUR_SEMANA_DESDE = "2026-10-01";
function diasCargaSeur(n = 5) {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
  const d = new Date((hoy < SEUR_SEMANA_DESDE ? SEUR_SEMANA_DESDE : hoy) + "T12:00:00Z");
  const dias = [];
  while (dias.length < n) {
    if (!esDiaSinCargaSeur(d.toISOString().slice(0, 10))) dias.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dias;
}
async function asegurarCargasSeur(storage) {
  const cargas = (await storage.get("cargas")) || [];
  let creadas = 0;
  for (const fecha of diasCargaSeur()) {
    if (cargas.some((c) => c.tipo === "seur" && c.fecha === fecha)) continue;
    cargas.push({
      id: crypto.randomUUID(),
      tipo: "seur",
      fecha,
      dia: DIAS_SEMANA[new Date(fecha + "T12:00:00Z").getUTCDay()],
      estado: "abierta",
      fechaCreacion: new Date().toISOString(),
      fechaCierre: null,
    });
    creadas++;
  }
  if (creadas) await storage.put("cargas", cargas);
  return creadas;
}

// Cargas de Furniture fijas (Jennifer, 2026-09-30: "las cargas de Furniture
// tienen que estar abiertas igual que las cargas de SEUR, pero solo dos veces
// a la semana, miércoles y viernes... ahora tenemos que tener abierta la del
// día 2 de octubre y la del miércoles 7 de octubre"): siempre abiertas las 2
// próximas de miércoles/viernes desde hoy (hora de Madrid). Un día que ya
// tuvo su carga cerrada no se vuelve a abrir.
async function asegurarCargasFurniture(storage) {
  const cargas = (await storage.get("cargas")) || [];
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
  const d = new Date(hoy + "T12:00:00Z");
  let abiertas = 0;
  let creadas = 0;
  for (let i = 0; i < 60 && abiertas < 2; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    const w = d.getUTCDay();
    if (!(w in DIAS_CARGA)) continue;
    const fecha = d.toISOString().slice(0, 10);
    if (FESTIVOS_SIN_CARGA.includes(fecha)) continue;
    const delDia = cargas.filter((c) => (c.tipo || "furniture") === "furniture" && c.fecha === fecha);
    if (delDia.some((c) => c.estado === "abierta")) { abiertas++; continue; }
    if (delDia.length) continue; // ya tuvo su carga y está cerrada
    cargas.push({ id: crypto.randomUUID(), tipo: "furniture", fecha, dia: DIAS_CARGA[w], estado: "abierta", fechaCreacion: new Date().toISOString(), fechaCierre: null });
    abiertas++;
    creadas++;
  }
  if (creadas) await storage.put("cargas", cargas);
  return creadas;
}

async function getOrCreateCargaByFecha(storage, tipo, dateObj) {
  const cargas = (await storage.get("cargas")) || [];
  if (tipo === "seur") {
    dateObj = new Date(cargaFechaKey(dateObj) + "T00:00:00Z");
    while (esDiaSinCargaSeur(cargaFechaKey(dateObj))) dateObj.setUTCDate(dateObj.getUTCDate() + 1);
  }
  const fecha = cargaFechaKey(dateObj);
  let carga = cargas.find((c) => (c.tipo || "furniture") === tipo && c.fecha === fecha && c.estado === "abierta");
  if (!carga) {
    carga = {
      id: crypto.randomUUID(),
      tipo,
      fecha,
      dia: DIAS_SEMANA[new Date(fecha + "T12:00:00Z").getUTCDay()],
      estado: "abierta",
      fechaCreacion: new Date().toISOString(),
      fechaCierre: null,
    };
    cargas.push(carga);
    await storage.put("cargas", cargas);
  }
  return carga;
}

// Dirección cambiada a mano (Jennifer, 2026-10-05): manda sobre la que
// traiga Shopify/el marketplace en cada sincronización.
const CAMPOS_DIRECCION = ["streetAddress", "postalCode", "city", "province", "phone"];
function aplicarDireccionManual(o) {
  const d = o.direccionManual;
  if (!d) return o;
  for (const c of CAMPOS_DIRECCION) if (d[c] !== undefined) o[c] = d[c];
  o.furnitureAddress = d.streetAddress;
  o.address = [d.streetAddress, d.postalCode, d.city, d.province].filter(Boolean).join(", ");
  return o;
}

function mergeCustomFields(existing, incoming) {
  const merged = existing ? { ...incoming } : incoming;
  if (existing) {
    for (const field of PRESERVED_FIELDS) {
      if (existing[field] !== undefined) merged[field] = existing[field];
    }
    if (incoming.inventoryProcessed && !existing.inventoryProcessed) {
      for (const field of CAMPOS_DE_TRAMITACION) {
        if (incoming[field] !== undefined) merged[field] = incoming[field];
      }
      if (incoming.cargaId && !existing.cargaId) merged.cargaId = incoming.cargaId;
    }
  }
  // Un pedido cancelado de verdad en Shopify (incoming.shopifyCancelado,
  // viene de order.cancelled_at) manda siempre sobre el "cancelado" manual
  // preservado — no es una decisión editable a mano, es un hecho real de
  // Shopify (Jennifer, 2026-09-16, caso BEZEN12204).
  if (incoming.shopifyCancelado) merged.cancelado = true;
  if (existing && existing.direccionManual) {
    // La original pasa a ser la que trae ahora la plataforma.
    merged.direccionOriginal = { streetAddress: incoming.streetAddress, postalCode: incoming.postalCode, city: incoming.city, province: incoming.province, phone: incoming.phone, furnitureAddress: incoming.furnitureAddress, address: incoming.address };
    aplicarDireccionManual(merged);
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

// Código del enlace público de un presupuesto: imposible de adivinar.
function tokenPresupuesto() {
  return [...crypto.getRandomValues(new Uint8Array(18))].map((b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
}
// Categorías con las que empieza Contactos de interés (Jennifer, 2026-11-12).
// Guías de partida de "Cómo se hace en Shopify" (Jennifer, 2026-11-26).
const GUIAS_SHOPIFY_INICIALES = [
  {
    id: "regalo-almohadas", creado: "2026-11-26T10:00:00.000Z", modificado: "2026-11-26T10:00:00.000Z", modificadoPor: "JENNIFER",
    titulo: "Poner o quitar la etiqueta «ALMOHADAS DE REGALO» en los packs",
    texto: "Lo explicó la agencia (26/11/2026): la etiqueta va en un METACAMPO de cada producto. Si pone exactamente «ALMOHADAS DE REGALO», sale la etiqueta en la foto y el sistema añade la opción de almohadas de regalo.\n\nQUITARLA:\n1. Shopify › Productos › abrir el pack.\n2. Bajar casi al final de la ficha, a «Metacampos».\n3. Borrar el texto «ALMOHADAS DE REGALO» (dejarlo vacío).\n4. Guardar.\n5. Repetir en cada pack que la lleve.\n\nPONERLA: escribir «ALMOHADAS DE REGALO» exactamente así en ese metacampo y guardar.\n\nSi después sigue saliendo la opción de almohadas, revisar la opción «Almohadas de regalo» en YMQ de ese pack.",
  },
  {
    id: "etiquetas-foto", creado: "2026-11-26T10:00:00.000Z", modificado: "2026-11-26T10:00:00.000Z", modificadoPor: "JENNIFER",
    titulo: "Etiquetas de la foto: PACK AHORRO, NOVEDAD, ¡ÚLTIMAS UNIDADES!…",
    texto: "Van en un metacampo de cada producto (texto libre, el «badge»).\n\n1. Shopify › Productos › abrir el producto.\n2. Sección «Metacampos», al final de la ficha.\n3. Escribir o cambiar el texto de la etiqueta (vacío = sin etiqueta).\n4. Guardar.\n\nPara muchos productos a la vez: ver la guía «Rellenar un metacampo en muchos productos a la vez».",
  },
  {
    id: "coleccion-metacampo", creado: "2026-11-26T10:00:00.000Z", modificado: "2026-11-26T10:00:00.000Z", modificadoPor: "JENNIFER",
    titulo: "Meter productos en una colección (p. ej. Black Friday): ¿se rellena solo el metacampo?",
    texto: "NO. La colección y el metacampo son independientes: meter un producto en una colección no cambia su metacampo, hay que rellenarlo aparte.\n\nDos formas de ahorrar trabajo:\n\n1. Edición en bloque: ver la guía «Rellenar un metacampo en muchos productos a la vez».\n\n2. Al revés, que el metacampo meta el producto en la colección:\n- Shopify › Productos › Colecciones › abrir (o crear) la colección.\n- Tipo de colección: AUTOMÁTICA.\n- Condición: el metacampo es igual a un texto (p. ej. BLACK FRIDAY).\n- Así basta con rellenar el metacampo y el producto entra solo; al vaciarlo, sale solo.",
  },
  {
    id: "metacampo-en-bloque", creado: "2026-11-26T10:00:00.000Z", modificado: "2026-11-26T10:00:00.000Z", modificadoPor: "JENNIFER",
    titulo: "Rellenar un metacampo en muchos productos a la vez",
    texto: "1. Shopify › Productos.\n2. Marcar las casillas de todos los productos (se puede filtrar antes por colección o buscar).\n3. Pulsar «Editar productos» (edición en bloque).\n4. Añadir la columna del metacampo (botón de columnas, apartado Metacampos).\n5. Escribir el texto en la primera fila y copiarlo hacia abajo, o escribirlo en cada una.\n6. Guardar.",
  },
  {
    id: "sku-variante", creado: "2026-11-26T10:00:00.000Z", modificado: "2026-11-26T10:00:00.000Z", modificadoPor: "JENNIFER",
    titulo: "Corregir el SKU de una variante mal puesto",
    texto: "1. Shopify › Productos › abrir el producto.\n2. Abrir la variante (medida/color) que está mal.\n3. Cambiar el SKU y guardar.\n\nOJO: los pedidos que ya entraron con el SKU malo NO cambian solos. En el programa: abrir el pedido y usar «Cambiar medida» (o avisar a Claude). Ejemplo: BEZEN12451, colchón del pack con SKU 80X200 que era 180X200 (25/11/2026).",
  },
];
const CONTACTOS_CATEGORIAS_INICIALES = ["Proveedores", "Transporte", "Marketplaces", "Contabilidad / Gestoría", "Clientes", "Otros"];
export class OrdersStore {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set();
  }

  // Códigos EAN en trozos de 500 filas (cada valor de storage < 128 KB).
  async leerEan() {
    const meta = await this.state.storage.get("ean:meta");
    if (!meta) return { meta: null, filas: [] };
    const filas = [];
    for (let i = 0; i < (meta.trozos || 0); i++) filas.push(...((await this.state.storage.get("ean:" + i)) || []));
    return { meta, filas };
  }
  async escribirEan(filas, meta) {
    const anterior = await this.state.storage.get("ean:meta");
    const T = 500;
    const trozos = Math.ceil(filas.length / T);
    for (let i = 0; i < trozos; i++) await this.state.storage.put("ean:" + i, filas.slice(i * T, (i + 1) * T));
    for (let i = trozos; i < ((anterior && anterior.trozos) || 0); i++) await this.state.storage.delete("ean:" + i);
    await this.state.storage.put("ean:meta", { ...(meta || {}), trozos, total: filas.length });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/orders" && request.method === "GET") {
      const orders = (await this.state.storage.get("orders")) || {};
      const list = mergeOrphans(Object.values(orders)).sort((a, b) => b.orderNumber - a.orderNumber);
      return Response.json(list);
    }

    // Importación simple, sin procesar inventario (Jennifer, 2026-09-16/17,
    // Fase 1 de Carrefour): a diferencia de /orders/import, NO llama a
    // processInventory ni a settleShipment — solo guarda/acumula pedidos.
    // Pensada para plataformas nuevas cuya integración empieza siendo "solo
    // tabla", antes de engancharlas al motor de agencia/stock compartido.
    if (url.pathname === "/orders/import-simple" && request.method === "POST") {
      const incoming = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      for (const order of incoming) {
        const existing = orders[order.id];
        orders[order.id] = mergeCustomFields(existing, order);
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return new Response("ok");
    }

    if (url.pathname === "/orders/import" && request.method === "POST") {
      const incoming = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const notasParaFulfillar = [];
      // Cuántos se tramitan de verdad en esta pasada (Jennifer, 2026-09-29:
      // el aviso contaba también los que ya estaban tramitados de antes).
      let tramitadosAhora = 0;
      for (const order of incoming) {
        const existing = orders[order.id];
        if (!existing || !existing.inventoryProcessed) {
          if (existing) order.vistoSinPagar = existing.vistoSinPagar;
          await this.processInventory(order);
          if (order.inventoryProcessed) tramitadosAhora++;
        }
        if (order.shippingStatus === "fulfilled" && existing?.shippingStatus !== "fulfilled") {
          await this.settleShipment(order.id);
        }
        const merged = mergeCustomFields(existing, order);
        orders[order.id] = merged;
        if (esNotaSergio(order) && !merged.shopifyFulfilled) notasParaFulfillar.push(order.id);
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, notasParaFulfillar, tramitadosAhora });
    }

    if (url.pathname === "/orders/upsert" && request.method === "POST") {
      const order = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const existing = orders[order.id];
      if (!existing || !existing.inventoryProcessed) {
        if (existing) order.vistoSinPagar = existing.vistoSinPagar;
        await this.processInventory(order);
      }
      if (order.shippingStatus === "fulfilled" && existing?.shippingStatus !== "fulfilled") {
        await this.settleShipment(order.id);
      }
      const merged = mergeCustomFields(existing, order);
      orders[order.id] = merged;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      const notasParaFulfillar = esNotaSergio(order) && !merged.shopifyFulfilled ? [order.id] : [];
      return Response.json({ ok: true, notasParaFulfillar });
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
    // Mantenimiento puntual, no expuesto en la UI (Jennifer, 2026-09-21):
    // borra pedidos por id, para limpiar pedidos de prueba/erróneos que se
    // hayan colado (ej. al verificar reglas nuevas contra la API real). NO
    // borra sus pendientes en InventoryStore — eso se hace aparte con
    // /api/inventario/pendientes/delete.
    // Poner una campana a un pedido ya tramitado (Jennifer, 2026-10-16: los
    // ECO de Groupon no salen en tapicería hasta confirmarlo en la campana).
    if (url.pathname === "/orders/admin/campana" && request.method === "POST") {
      const { id, pregunta, grouponEco } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const o = orders[id];
      if (!o) return Response.json({ ok: false, error: "no encontrado" }, { status: 404 });
      o.needsReview = true;
      o.reviewReasons = [pregunta];
      o.reviewAnswers = [];
      if (grouponEco) o.grouponEco = true;
      await this.state.storage.put("orders", orders);
      await this.releaseInventoryDecision(id, true);
      this.broadcast();
      return Response.json({ ok: true });
    }
    if (url.pathname === "/orders/admin/renombrar" && request.method === "POST") {
      const { cambios } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const hechos = [];
      for (const { from, to, orderRef, orderNumber } of cambios || []) {
        const o = orders[from];
        if (!o || orders[to]) continue;
        delete orders[from];
        orders[to] = { ...o, id: to, orderRef, orderNumber };
        hechos.push(to);
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, hechos });
    }

    if (url.pathname === "/orders/admin/delete" && request.method === "POST") {
      const { ids } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      let borrados = 0;
      for (const id of ids || []) {
        if (orders[id]) { delete orders[id]; borrados++; }
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, borrados });
    }

    // Mantenimiento puntual (Jennifer, 2026-09-22): corrige a mano el
    // productId guardado en un artículo concreto de un pedido — caso real:
    // pedidos de marketplace procesados antes del 19/09 (fix del
    // emparejamiento "para alojamiento") se quedaron con el productId del
    // catálogo equivocado grabado en el pedido para siempre (el resync no
    // lo toca si el pedido ya está fuera de la ventana de reproceso), lo
    // que arrastraba el error a cualquier pantalla que lea items[].productId
    // directamente — ej. el desplegable "Producto del pedido a reponer" de
    // Reposición. No toca stock/backorders, solo el dato guardado del
    // pedido. No expuesto en la UI, solo por API.
    if (url.pathname === "/orders/admin/fix-item-product" && request.method === "POST") {
      const { id, itemIndex, productId } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const existing = orders[id];
      if (!existing || !existing.items || !existing.items[itemIndex]) {
        return Response.json({ ok: false, error: "Pedido o artículo no encontrado." }, { status: 404 });
      }
      const antes = existing.items[itemIndex].productId;
      existing.items[itemIndex].productId = productId;
      orders[id] = existing;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, antes, ahora: productId });
    }

    // Mantenimiento puntual (Jennifer, 2026-09-23): marca de golpe como
    // "inventoryProcessed" TODOS los pedidos de Shopify pagados por debajo
    // de SHOPIFY_PROCESAMIENTO_DESDE que aún no lo estaban (397 en el
    // momento de escribir esto, de julio/agosto, de cuando InventoryStore
    // seguía en pausa) — sin pasar por InventoryStore, igual que hace ahora
    // la puerta de processInventory para cualquiera nuevo que aparezca. No
    // expuesta en UI.
    if (url.pathname === "/orders/admin/backfill-processed-cutoff" && request.method === "POST") {
      const orders = (await this.state.storage.get("orders")) || {};
      let marcados = 0;
      for (const order of Object.values(orders)) {
        if (order.platform === "Shopify" && !order.inventoryProcessed && Number(order.orderNumber) < SHOPIFY_PROCESAMIENTO_DESDE) {
          order.inventoryProcessed = true;
          marcados++;
        }
      }
      if (marcados > 0) await this.state.storage.put("orders", orders);
      return Response.json({ ok: true, marcados });
    }

    // Mantenimiento puntual (Jennifer, 2026-09-28): los pedidos de Shopify
    // que siguen PENDIENTE DE PAGO y nunca se tramitaron se marcan como
    // "vistos sin pagar" y dejan de estar dados por gestionados, para que
    // se tramiten con fecha del día en que se paguen. No toca los ya
    // tramitados (con agencia) ni los cancelados.
    if (url.pathname === "/orders/admin/marcar-sin-pagar" && request.method === "POST") {
      const orders = (await this.state.storage.get("orders")) || {};
      const marcados = [];
      for (const order of Object.values(orders)) {
        if (order.platform !== "Shopify" || order.paymentStatus !== "PENDIENTE DE PAGO") continue;
        if (order.agencia || order.cancelado || order.shopifyCancelado) continue;
        order.vistoSinPagar = true;
        delete order.inventoryProcessed;
        marcados.push(order.orderNumber);
      }
      if (marcados.length) await this.state.storage.put("orders", orders);
      return Response.json({ ok: true, marcados });
    }

    // Tramita un pedido ya pagado como si hubiera entrado en la fecha dada
    // (Jennifer, 2026-09-28, BEZEN12205: pagado hoy pero dado por gestionado
    // por el corte del 23/09 cuando aún no estaba pagado).
    if (url.pathname === "/orders/admin/tramitar-como-nuevo" && request.method === "POST") {
      const { orderId, fecha } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const existing = orders[orderId];
      if (!existing) return new Response("not found", { status: 404 });
      if (existing.agencia) return Response.json({ ok: false, error: "Ya está tramitado." }, { status: 409 });
      existing.vistoSinPagar = true;
      existing.fechaTramitacion = fecha || new Date().toISOString();
      delete existing.inventoryProcessed;
      await this.processInventory(existing);
      orders[orderId] = existing;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json(existing);
    }

    // Botón "Pagado – tramitar ya" (Jennifer, 2026-09-28): el cliente ya ha
    // pagado (transferencia) pero en Shopify sigue pendiente. Se tramita ya
    // con fecha de hoy; al marcarse luego pagado en Shopify no se repite
    // porque queda inventoryProcessed.
    if (url.pathname === "/orders/admin/tramitar-pagado-manual" && request.method === "POST") {
      const { orderId, usuario } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const existing = orders[orderId];
      if (!existing) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      if (existing.agencia || existing.inventoryProcessed && existing.paymentStatus === "PAGADO") {
        return Response.json({ ok: false, error: "Este pedido ya está tramitado." }, { status: 409 });
      }
      existing.pagoConfirmadoManual = { usuario: usuario || null, fecha: new Date().toISOString() };
      existing.vistoSinPagar = true;
      existing.fechaTramitacion = existing.pagoConfirmadoManual.fecha;
      delete existing.inventoryProcessed;
      await this.processInventory(existing);
      // 2+ colchones por SEUR y solo hay stock de parte (Jennifer,
      // 2026-11-05, BEZEN12395): el pago SÍ queda apuntado y el pedido pasa
      // a "pendientes de decidir" en SEUR (dividir ahora o esperar).
      if (!existing.inventoryProcessed && existing.seurMixedPending) {
        orders[orderId] = existing;
        await this.state.storage.put("orders", orders);
        this.broadcast();
        return Response.json({ ...existing, ok: true, decisionSeur: true });
      }
      if (!existing.inventoryProcessed) {
        // No se pudo tramitar (pausa general, etc.): se deshace la marca
        // para que el botón siga disponible.
        delete existing.pagoConfirmadoManual;
        delete existing.fechaTramitacion;
        orders[orderId] = existing;
        await this.state.storage.put("orders", orders);
        return Response.json({ ok: false, error: "El procesamiento de pedidos está en pausa o el pedido necesita revisión." }, { status: 409 });
      }
      orders[orderId] = existing;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json(existing);
    }

    // Pedidos que se envían juntos (Jennifer, 2026-09-28, caso BEZEN12205 +
    // BEZEN12233: el mismo cliente compra en días distintos y quiere
    // recibirlo todo junto). Todos los pedidos del grupo llevan
    // grupoEnvio = id del pedido principal (el más antiguo) y van por
    // FURNITURE como un único envío: misma referencia en el fichero, misma
    // carga y mismo seguimiento. Un colchón que iba por SEUR pasa a FUR.
    if (url.pathname === "/orders/grupo-envio/vincular" && request.method === "POST") {
      const { orderIds } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const seleccion = (orderIds || []).map((id) => orders[id]).filter(Boolean);
      if (seleccion.length < 2) return Response.json({ ok: false, error: "Hacen falta al menos dos pedidos." }, { status: 400 });
      // Si alguno ya está en un grupo, se añaden todos a ese grupo.
      const gruposPrevios = new Set(seleccion.map((o) => o.grupoEnvio).filter(Boolean));
      const miembros = new Map(seleccion.map((o) => [o.id, o]));
      for (const o of Object.values(orders)) {
        if (o.grupoEnvio && gruposPrevios.has(o.grupoEnvio)) miembros.set(o.id, o);
      }
      const lista = [...miembros.values()];
      for (const o of lista) {
        if (o.cancelado || o.shopifyCancelado) return Response.json({ ok: false, error: `${o.orderRef || "BEZEN" + o.orderNumber} está cancelado.` }, { status: 409 });
        if (o.shippingStatus === "fulfilled") return Response.json({ ok: false, error: `${o.orderRef || "BEZEN" + o.orderNumber} ya está enviado.` }, { status: 409 });
        // Sin tramitar pero pagado (Jennifer, 2026-11-05, BEZEN12395 parado
        // en la decisión de SEUR): se tramita ahora ya por Furniture.
        const pagadoO = o.paymentStatus === "PAGADO" || !!o.pagoConfirmadoManual;
        if ((!o.inventoryProcessed || !o.agencia) && !pagadoO) return Response.json({ ok: false, error: `${o.orderRef || "BEZEN" + o.orderNumber} todavía no está pagado: márcalo como pagado antes de juntarlo.` }, { status: 409 });
      }
      const sinTramitar = lista.filter((o) => !o.inventoryProcessed || !o.agencia);
      if (sinTramitar.length === lista.length) return Response.json({ ok: false, error: "Ninguno de los pedidos está tramitado todavía." }, { status: 409 });
      if (!lista.some((o) => o.agencia === "FURNITURE" || sinTramitar.includes(o))) {
        return Response.json({ ok: false, error: "Ninguno de los pedidos va por Furniture: juntar envíos solo está pensado para Furniture." }, { status: 409 });
      }
      const fechaDe = (o) => { const t = Date.parse(o.orderDate); return Number.isNaN(t) ? Infinity : t; };
      const principal = lista.slice().sort((a, b) => fechaDe(a) - fechaDe(b) || a.orderNumber - b.orderNumber)[0];
      const cargas = (await this.state.storage.get("cargas")) || [];
      for (const o of lista) {
        o.grupoEnvio = principal.id;
        if (o.agencia !== "FURNITURE" && !sinTramitar.includes(o)) {
          o.agenciaAntesDeGrupo = o.agencia;
          o.agencia = "FURNITURE";
        }
        // Todos vuelven a esperar juntos: si alguno ya estaba en una carga
        // abierta (de Furniture o de SEUR), sale de ella y el grupo entero
        // sube a la misma carga cuando esté todo recibido.
        const carga = o.cargaId && cargas.find((c) => c.id === o.cargaId);
        if (carga && carga.estado === "abierta") o.cargaId = null;
      }
      for (const o of sinTramitar) {
        delete o.inventoryProcessed;
        o.vistoSinPagar = true;
        if (!o.fechaTramitacion) o.fechaTramitacion = new Date().toISOString();
        await this.processInventory(o);
      }
      await this.state.storage.put("orders", orders);
      await this.planColchonesDelGrupo(lista.map((o) => o.id), "FUR");
      this.broadcast();
      return Response.json({ ok: true, principal: principal.id, miembros: lista.map((o) => o.id) });
    }

    if (url.pathname === "/orders/grupo-envio/desvincular" && request.method === "POST") {
      const { orderId } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const order = orders[orderId];
      if (!order || !order.grupoEnvio) return Response.json({ ok: false, error: "Este pedido no está en ningún envío conjunto." }, { status: 404 });
      const grupo = order.grupoEnvio;
      const miembros = Object.values(orders).filter((o) => o.grupoEnvio === grupo);
      // Si quedan menos de dos, el grupo desaparece entero.
      const salen = miembros.length <= 2 ? miembros : [order];
      const restauradosASeur = [];
      for (const o of salen) {
        delete o.grupoEnvio;
        if (o.agenciaAntesDeGrupo) {
          o.agencia = o.agenciaAntesDeGrupo;
          if (o.agencia !== "FURNITURE") restauradosASeur.push(o.id);
          delete o.agenciaAntesDeGrupo;
        }
        o.cargaId = null;
      }
      // Si sale el principal y quedan 2+, el grupo pasa a colgar del más antiguo que queda.
      const quedan = miembros.filter((o) => o.grupoEnvio === grupo);
      if (quedan.length && !quedan.some((o) => o.id === grupo)) {
        const fechaDe = (o) => { const t = Date.parse(o.orderDate); return Number.isNaN(t) ? Infinity : t; };
        const nuevo = quedan.slice().sort((a, b) => fechaDe(a) - fechaDe(b) || a.orderNumber - b.orderNumber)[0];
        for (const o of quedan) o.grupoEnvio = nuevo.id;
      }
      await this.state.storage.put("orders", orders);
      if (restauradosASeur.length) await this.planColchonesDelGrupo(restauradosASeur, "FPK");
      this.broadcast();
      return Response.json({ ok: true, desvinculados: salen.map((o) => o.id) });
    }

    // Un colchón transformado sale siempre por Furniture (Jennifer,
    // 2026-09-28): si el pedido iba por SEUR, pasa a FURNITURE (se recuerda
    // la agencia anterior) y sale de cualquier carga de SEUR abierta.
    // "Viene el cliente a recogerlo" (Jennifer, 2026-10-08): aunque lo
    // recibamos de Luso/New/Polival, no va en ninguna carga de SEUR ni de
    // Furniture. Agencia "RECOGE CLIENTE" (se guarda la de antes para poder
    // deshacerlo) y fuera de cualquier carga ABIERTA.
    if (url.pathname === "/orders/recoge-cliente" && request.method === "POST") {
      const { id, activo, usuario } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const order = orders[id];
      if (!order) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      const cargas = (await this.state.storage.get("cargas")) || [];
      if (activo) {
        if (!order.recogeCliente) {
          order.agenciaAntesDeRecogida = order.agencia || null;
          order.recogeCliente = { fecha: new Date().toISOString(), usuario: usuario || null };
        }
        order.agencia = "RECOGE CLIENTE";
        const carga = order.cargaId && cargas.find((c) => c.id === order.cargaId);
        if (carga && carga.estado === "abierta") order.cargaId = null;
      } else {
        order.agencia = order.agenciaAntesDeRecogida || null;
        order.recogeCliente = null;
        order.agenciaAntesDeRecogida = null;
        order.entregadoCliente = null;
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, agencia: order.agencia });
    }
    // Facturas de SEUR subidas para revisar (Jennifer, 2026-11-06). Cada
    // factura en su propia clave (el límite de un valor es 128 KB) y un
    // índice con la cabecera de todas.
    if (url.pathname === "/seur-facturas" && request.method === "GET") {
      const indice = (await this.state.storage.get("seurFacturasIndice")) || [];
      const id = url.searchParams.get("id");
      if (id) return Response.json((await this.state.storage.get("seurFactura:" + id)) || null);
      if (url.searchParams.get("todas")) {
        const todas = [];
        for (const f of indice) { const x = await this.state.storage.get("seurFactura:" + f.id); if (x) todas.push(x); }
        return Response.json(todas);
      }
      return Response.json(indice);
    }
    if (url.pathname === "/seur-facturas/guardar" && request.method === "POST") {
      const { factura, usuario } = await request.json();
      if (!factura || !factura.id || !Array.isArray(factura.lineas)) return Response.json({ ok: false, error: "Factura sin datos." }, { status: 400 });
      const anterior = await this.state.storage.get("seurFactura:" + factura.id);
      const nueva = { ...factura, revisiones: (anterior && anterior.revisiones) || {}, subida: new Date().toISOString(), usuario: usuario || null };
      await this.state.storage.put("seurFactura:" + factura.id, nueva);
      let indice = (await this.state.storage.get("seurFacturasIndice")) || [];
      indice = indice.filter((f) => f.id !== factura.id);
      indice.push({ id: factura.id, nombre: factura.nombre || "", fechaFactura: factura.fechaFactura || "", lineas: factura.lineas.length,
        importe: Math.round(factura.lineas.reduce((s, l) => s + (Number(l.importe) || 0), 0) * 100) / 100, subida: nueva.subida, usuario: usuario || null });
      indice.sort((a, b) => String(b.fechaFactura).localeCompare(String(a.fechaFactura)));
      await this.state.storage.put("seurFacturasIndice", indice);
      return Response.json({ ok: true, reemplazada: !!anterior });
    }
    if (url.pathname === "/seur-facturas/revision" && request.method === "POST") {
      const { id, linea, estado, nota, usuario } = await request.json();
      const f = await this.state.storage.get("seurFactura:" + id);
      if (!f) return Response.json({ ok: false, error: "Factura no encontrada." }, { status: 404 });
      f.revisiones = f.revisiones || {};
      const r = { ...(f.revisiones[linea] || {}) };
      if (estado !== undefined) r.estado = estado || null;
      if (nota !== undefined) r.nota = String(nota || "");
      r.usuario = usuario || null;
      r.fecha = new Date().toISOString();
      f.revisiones[linea] = r;
      await this.state.storage.put("seurFactura:" + id, f);
      return Response.json({ ok: true, revision: r });
    }
    if (url.pathname === "/seur-facturas/borrar" && request.method === "POST") {
      const { id } = await request.json();
      await this.state.storage.delete("seurFactura:" + id);
      const indice = ((await this.state.storage.get("seurFacturasIndice")) || []).filter((f) => f.id !== id);
      await this.state.storage.put("seurFacturasIndice", indice);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/orders/entregado-cliente" && request.method === "POST") {
      const { id, usuario } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const order = orders[id];
      if (!order) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      order.entregadoCliente = { fecha: new Date().toISOString(), usuario: usuario || null };
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true });
    }

    if (url.pathname === "/orders/pasar-a-furniture" && request.method === "POST") {
      const { orderId, motivo } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const order = orders[orderId];
      if (!order) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      if (order.agencia !== "FURNITURE") {
        order.agenciaAntesDeFurniture = order.agencia || null;
        order.agencia = "FURNITURE";
        order.motivoFurniture = motivo || null;
        const cargas = (await this.state.storage.get("cargas")) || [];
        const carga = order.cargaId && cargas.find((c) => c.id === order.cargaId);
        if (carga && carga.tipo === "seur" && carga.estado === "abierta") order.cargaId = null;
        await this.state.storage.put("orders", orders);
        this.broadcast();
      }
      return Response.json({ ok: true, agencia: order.agencia });
    }

    // Unidades canceladas de un pedido (Jennifer, 2026-09-29): se apuntan en
    // `lineasCanceladas` (se ven tachadas en el pedido). Si se cancelan
    // desde el pedido TODAS las unidades de todas sus líneas, el pedido
    // entero queda cancelado.
    // Cambio de medida del pedido entero (Jennifer, 2026-10-14). Shopify
    // sigue con la medida comprada; aquí se apunta la nueva.
    if (url.pathname === "/orders/cambio-medida" && request.method === "POST") {
      const { orderId, de, a, usuario } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const order = orders[orderId];
      if (!order) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      order.cambioMedida = { de: (order.cambioMedida && order.cambioMedida.de) || de, a, fecha: new Date().toISOString(), usuario: usuario || null };
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, cambioMedida: order.cambioMedida });
    }
    // Cambio de color de la tapicería antes de tramitar (Jennifer, 2026-10-20).
    if (url.pathname === "/orders/cambio-color" && request.method === "POST") {
      const { orderId, a, fabrica, porArticulo, usuario } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const order = orders[orderId];
      if (!order) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      order.cambioColor = { a: a || "", fabrica: fabrica || "", porArticulo: Array.isArray(porArticulo) && porArticulo.length ? porArticulo : null, fecha: new Date().toISOString(), usuario: usuario || null, aplicado: null };
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, cambioColor: order.cambioColor });
    }

    if (url.pathname === "/orders/cancelar-linea" && request.method === "POST") {
      const { orderId, itemIndex, unidades, texto, desde, usuario } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const order = orders[orderId];
      if (!order) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      order.lineasCanceladas = order.lineasCanceladas || [];
      order.lineasCanceladas.push({
        itemIndex: Number.isInteger(itemIndex) ? itemIndex : null,
        unidades: Math.max(1, Math.floor(Number(unidades) || 1)),
        texto: texto || "", desde: desde || "pedido", usuario: usuario || null, fecha: new Date().toISOString(),
      });
      const items = order.items || [];
      const canceladasPorItem = (i) => order.lineasCanceladas.filter((l) => l.itemIndex === i).reduce((s, l) => s + l.unidades, 0);
      if (items.length && items.every((it, i) => canceladasPorItem(i) >= (it.qty || 1))) order.cancelado = true;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, cancelado: !!order.cancelado, lineasCanceladas: order.lineasCanceladas });
    }

    // "No ha salido" (Jennifer, 2026-09-29): el pedido sale de su carga de
    // SEUR y las etiquetas de SEUR ya registradas quedan anuladas (no
    // cuentan como seguimiento ni salen en "Casos a revisar"). El colchón lo
    // devuelve a pendiente InventoryStore (/backorders/no-salio).
    if (url.pathname === "/orders/no-salio-seur" && request.method === "POST") {
      const { orderId } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const order = orders[orderId];
      if (!order) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      const cargas = (await this.state.storage.get("cargas")) || [];
      const carga = order.cargaId && cargas.find((c) => c.id === order.cargaId);
      if (carga && carga.tipo === "seur") order.cargaId = null;
      for (const t of order.seurTracking || []) t.anulado = true;
      order.noSalioSeur = new Date().toISOString();
      // Cuando salga de verdad, Shopify solo actualiza el seguimiento sin
      // avisar al cliente (Jennifer, 2026-10-14: "para no dar confusión").
      order.sinAvisoSeguimiento = true;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true });
    }

    // Sacar de la carga de SEUR preguntando el motivo (Jennifer, 2026-10-14,
    // BEZEN12311): el cliente lo quiere otro día (cargaId = la carga de esa
    // fecha) u otro motivo (cargaId null, queda en "fuera de carga" con la
    // nota). Las etiquetas ya registradas dejan de valer (habrá que hacer una
    // nueva) y, si ya constaba enviado en Shopify, al salir de verdad solo se
    // actualiza el seguimiento, sin avisar al cliente.
    if (url.pathname === "/orders/fuera-carga-seur" && request.method === "POST") {
      const { orderId, cargaId, motivo } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const order = orders[orderId];
      if (!order) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      const cargas = (await this.state.storage.get("cargas")) || [];
      if (cargaId && !cargas.some((c) => c.id === cargaId && c.tipo === "seur" && c.estado === "abierta")) {
        return Response.json({ ok: false, error: "La carga de destino no está abierta." }, { status: 409 });
      }
      order.cargaId = cargaId || null;
      for (const t of order.seurTracking || []) t.anulado = true;
      order.sinAvisoSeguimiento = true;
      order.motivoFueraCarga = cargaId ? null : { texto: String(motivo || "").trim(), fecha: new Date().toISOString() };
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true });
    }

    // Borrar pedidos subidos por error (Jennifer, 2026-10-06: un fichero de
    // Worten subido en Leroy Merlin creó 52 pedidos "LM-…" falsos). Solo
    // borra los ids indicados; no toca stock ni pendientes.
    if (url.pathname === "/orders/borrar" && request.method === "POST") {
      const { ids } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const borrados = [];
      for (const id of ids || []) {
        if (orders[id]) { delete orders[id]; borrados.push(id); }
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, borrados });
    }

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
    // Seguimiento del contacto con el cliente de un pedido de TikTok
    // (Jennifer, 2026-10-28): { orderId, estado: "contactado" | "compra-web"
    // | "no-interesa" | null, nota, usuario }. No tramita nada.
    if (url.pathname === "/orders/tiktok-decision" && request.method === "POST") {
      const { orderId, estado, nota, usuario } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const existing = orders[orderId];
      if (!existing) return new Response("not found", { status: 404 });
      const estados = ["contactado", "compra-web", "no-interesa"];
      existing.tiktokRevision = estado ? { estado: estados.includes(estado) ? estado : "contactado", nota: String(nota || ""), usuario: usuario || null, fecha: new Date().toISOString() } : null;
      orders[orderId] = existing;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, order: existing });
    }

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

    // Marcar "gestionado por otra vía" por plataforma (Jennifer, 2026-09-25,
    // caso real Leroy Merlin + Conforama ES: "estos pedidos no están
    // pendientes realmente porque se han tramitado por otra vía... tenerlos
    // en el listado de Furniture como pendientes solo puede hacer que los
    // vuelva a sacar por error"). NO toca `agencia`, `inventoryProcessed`,
    // `needsReview`, `cargaId` ni nada de stock/backorders — solo pone
    // `gestionadoExterno:true`, que renderFurniture() usa para no
    // enseñarlos (ver filtro `todasFurniture`). El pedido sigue existiendo
    // tal cual, con su agencia real — es puramente "no lo muestres aquí,
    // ya está resuelto". Preservado en mergeCustomFields (PRESERVED_FIELDS)
    // para que no se pierda si se vuelve a subir el fichero.
    if (url.pathname === "/orders/marcar-gestionado-externo" && request.method === "POST") {
      const { platform } = await request.json();
      if (!platform) return Response.json({ ok: false, error: "Falta platform." }, { status: 400 });
      const orders = (await this.state.storage.get("orders")) || {};
      let marcados = 0;
      for (const order of Object.values(orders)) {
        if (order.platform !== platform || order.agencia !== "FURNITURE" || order.gestionadoExterno) continue;
        order.gestionadoExterno = true;
        marcados++;
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, marcados });
    }

    // Pedidos gestionados a mano (Jennifer, 2026-09-29, Conforama ES): pone
    // la agencia y los marca como tramitados SIN pasar por el motor de stock
    // — el pendiente al proveedor se crea aparte (crear-pendiente-manual).
    // Sin agencia no entrarían en las cargas ni en el fichero de SEUR.
    if (url.pathname === "/orders/admin/set-agencia" && request.method === "POST") {
      const { ids, agencia } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const hechos = [];
      for (const id of ids || []) {
        const o = orders[id];
        if (!o) continue;
        o.agencia = agencia;
        o.inventoryProcessed = true;
        hechos.push(id);
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, hechos });
    }

    // { id, direccion: {streetAddress, postalCode, city, province, phone, motivo} | null, usuario }
    // null vuelve a la dirección original.
    if (url.pathname === "/orders/direccion" && request.method === "POST") {
      const { id, direccion, usuario } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const o = orders[id];
      if (!o) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      if (!o.direccionOriginal) {
        o.direccionOriginal = { streetAddress: o.streetAddress, postalCode: o.postalCode, city: o.city, province: o.province, phone: o.phone, furnitureAddress: o.furnitureAddress, address: o.address };
      }
      if (direccion) {
        const d = {};
        for (const c of CAMPOS_DIRECCION) d[c] = String(direccion[c] || "").trim();
        o.direccionManual = { ...d, motivo: String(direccion.motivo || "").trim(), usuario: usuario || null, fecha: new Date().toISOString() };
        aplicarDireccionManual(o);
      } else {
        Object.assign(o, o.direccionOriginal);
        delete o.direccionManual;
        delete o.direccionOriginal;
      }
      orders[id] = o;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, order: o });
    }

    if (url.pathname === "/orders/meta" && request.method === "POST") {
      const { id, colorTag, observaciones, notas, cancelado, paraTenerEnCuenta, needsReview, retenido, tapiceriaEnviada, gestionadoExterno, suplementoMontana, emailPenalizacion, alertaPrecio, servicioQuitado, montajeManual } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const existing = orders[id];
      if (!existing) return new Response("not found", { status: 404 });
      if (colorTag !== undefined) existing.colorTag = colorTag || null;
      // Montaje añadido/quitado a mano (Jennifer, 2026-11-11, Carrefour
      // 76758034-A): { valor: true|false, usuario, fecha } o null (= lo que
      // digan los servicios). Se conserva al volver a subir el fichero.
      if (montajeManual !== undefined) existing.montajeManual = montajeManual && typeof montajeManual.valor === "boolean"
        ? { valor: montajeManual.valor, usuario: montajeManual.usuario || null, fecha: new Date().toISOString() } : null;
      // Quitar la marca de "gestionado por otra vía" (Jennifer, 2026-10-08,
      // LM 002-26262L40115-A: ahora sí sale en nuestra carga de Furniture).
      if (gestionadoExterno !== undefined) existing.gestionadoExterno = !!gestionadoExterno;
      if (observaciones !== undefined) existing.observaciones = observaciones;
      // "Notas" (Jennifer, 2026-08-26): campo libre visible en Pedidos >
      // Shopify y en Furniture > Pedidos pendientes, para avisos del
      // cliente (ej. fecha de entrega concreta) — distinto de
      // "Observaciones Sergio", que solo ven los usuarios con acceso a color.
      if (notas !== undefined) existing.notas = notas;
      // Cancelar un pedido (Jennifer, 2026-08-26): el cliente no puede
      // esperar o cambia la compra. No borra nada ni lo saca de las listas
      // de Proveedores/Furniture — se queda visible en rojo para no perder
      // el rastro, pero no se puede seleccionar para pedir a fábrica ni
      // meter en una carga (ver frontend).
      if (cancelado !== undefined) existing.cancelado = !!cancelado;
      // "Pedidos para tener en cuenta" (Jennifer, 2026-08-26): recuadro
      // aparte en Furniture > Pedidos pendientes para avisos puntuales de
      // compañeros (que tiene que salir en la próxima carga, algo por
      // fechas...), sin que haga falta que la mercancía haya llegado ya.
      // No quita al pedido de ningún otro sitio, es solo una marca.
      if (paraTenerEnCuenta !== undefined) existing.paraTenerEnCuenta = !!paraTenerEnCuenta;
      // Retenido a petición del cliente (Jennifer, 2026-09-30): { hasta:
      // "AAAA-MM-DD" | null, desde } — sin fecha espera a la luz verde del
      // cliente; con fecha, sube solo a la carga de Furniture de ese día o
      // posterior. null lo quita.
      // Tapicería ya enviada por el sistema antiguo, sin seguimiento aquí
      // (Jennifer, 2026-09-30) — solo informativo en Luso/New.
      if (tapiceriaEnviada !== undefined) existing.tapiceriaEnviada = !!tapiceriaEnviada;
      // CP de montaña de Furniture (Jennifer, 2026-10-16): avisado (ya se
      // enseñó el aviso) y pagado (el cliente pagó el suplemento: puede salir).
      if (suplementoMontana !== undefined) {
        const antes = existing.suplementoMontana || {};
        existing.suplementoMontana = suplementoMontana ? { avisado: true, pagado: suplementoMontana.pagado !== undefined ? !!suplementoMontana.pagado : !!antes.pagado, fecha: new Date().toISOString(), fechaPago: suplementoMontana.pagado ? new Date().toISOString() : antes.fechaPago || null } : null;
      }
      if (emailPenalizacion !== undefined) existing.emailPenalizacion = emailPenalizacion || null;
      // Precio muy por debajo de tarifa (Jennifer, 2026-10-21): resultado de la revisión.
      if (alertaPrecio !== undefined) existing.alertaPrecio = alertaPrecio || null;
      // Servicio adicional pagado que el cliente ya no quiere (Jennifer,
      // 2026-10-23, BEZEN12350): no sale la retirada en Furniture. { fecha, usuario } | null.
      if (servicioQuitado !== undefined) existing.servicioQuitado = servicioQuitado ? { fecha: new Date().toISOString(), usuario: servicioQuitado.usuario || null } : null;
      if (retenido !== undefined) existing.retenido = retenido ? { hasta: retenido.hasta || null, desde: new Date().toISOString() } : null;
      // Marcar un aviso de revisión como resuelto a mano (Jennifer,
      // 2026-09-19: la campanita se quedaba encendida para siempre en
      // pedidos donde needsReview se puso a true sin ningún motivo de texto
      // que responder — el modal salía vacío, sin nada que hacer ni forma
      // de cerrarlo). Solo se usa cuando de verdad no hay preguntas
      // pendientes (ver botón "Marcar como revisado" en el modal).
      if (needsReview !== undefined) existing.needsReview = !!needsReview;
      orders[id] = existing;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return new Response("ok");
    }

    // Confirmación de que index.js ya mandó el fulfillment a Shopify de
    // verdad para este pedido (Jennifer, 2026-09-21) — evita volver a
    // intentarlo si llega otro seguimiento (actualización de estado, no un
    // envío físico nuevo) para el mismo pedido más adelante.
    if (url.pathname === "/orders/shopify-fulfilled" && request.method === "POST") {
      const { id, fulfillmentId } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const existing = orders[id];
      if (!existing) return new Response("not found", { status: 404 });
      existing.shopifyFulfilled = true;
      // Guardado para poder actualizar el seguimiento del MISMO fulfillment
      // más adelante si el pedido es un pack partido en dos envíos (ver
      // /orders/tracking-import) — sin esto no habría forma de mandar el
      // segundo aviso al cliente.
      if (fulfillmentId) existing.shopifyFulfillmentId = fulfillmentId;
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
      // Pedido ECO de Groupon retenido (Jennifer, 2026-10-16): al contestar se
      // tramita de verdad; la respuesta queda en las notas del pedido.
      if (existing.grouponEco && allAnswered && !existing.inventoryProcessed) {
        existing.grouponEcoRespuesta = answers.join(" / ");
        existing.notas = ((existing.notas || "") + (existing.notas ? " · " : "") + "ECO: " + existing.grouponEcoRespuesta).trim();
        await this.processInventory(existing, true);
        existing.reviewAnswers = [];
        const cp = existing.grouponDatos && existing.grouponDatos.colchonPolival;
        if (cp && existing.inventoryProcessed) {
          const inv = this.env.INVENTORY_STORE.get(this.env.INVENTORY_STORE.idFromName("main"));
          await inv.fetch("https://do/admin/crear-pendiente-polival", { method: "POST", body: JSON.stringify({ orderId: existing.id, orderNumber: existing.orderNumber, platform: existing.platform, orderRef: existing.orderRef, orderDate: existing.orderDate, stockModel: cp.stockModel, talla: cp.talla, cantidad: cp.cantidad, mercanciaFabrica: cp.mercancia }) });
        }
        orders[id] = existing;
        await this.state.storage.put("orders", orders);
        this.broadcast();
        return new Response("ok");
      }
      await this.releaseInventoryDecision(existing.id, !allAnswered);
      // Campana contestada en un pedido con tapicería de LIQUIDACIÓN (Jennifer,
      // 2026-11-27, BEZEN12475): ya está en el almacén, así que entra solo en
      // la próxima carga de Furniture. El resto de pedidos sigue a mano.
      if (allAnswered && existing.agencia === "FURNITURE" && !existing.cargaId) {
        await this.autoCargaFurnitureDeStock(existing, { soloLiquidacion: true });
        if (existing.cargaId) {
          orders[id] = existing;
          await this.state.storage.put("orders", orders);
        }
      }
      this.broadcast();
      return new Response("ok");
    }

    // Cargas de Furniture (Jennifer, 2026-08-26): agrupan pedidos que van a
    // salir por esa agencia en la próxima carga (miércoles o viernes). Solo
    // hay una carga "abierta" a la vez — se crea sola con la fecha del
    // próximo miércoles/viernes la primera vez que se añade algo, y se
    // reutiliza hasta que Jennifer la cierra a mano.
    // Gasto publicitario: un registro por día (Jennifer, 2026-10-16: "cada día
    // se registre el dato cuando yo le meta la información... para hacer un
    // histórico"). Se guardan las 6 casillas: facturación con IVA, gasto,
    // ROAS bruto (Triple Whale), ventas sin IVA (÷1,21), % gasto y ROAS neto
    // (ventas sin IVA ÷ gasto).
    // Precios de liquidación (Jennifer, 2026-11-02): clave propia, no toca
    // nada de Tarifas ni Precios BEZEN.
    // PRESUPUESTOS (Jennifer, 2026-11-03): presupuestos a clientes con su
    // formato (PDF), numerados desde el 15328 (CHARETE). Sin total por
    // defecto: suelen ser varias opciones, no un sumatorio.
    if (url.pathname === "/presupuestos" && request.method === "GET") {
      return Response.json((await this.state.storage.get("presupuestos")) || []);
    }
    if (url.pathname === "/presupuestos" && request.method === "POST") {
      const { guardar, borrar } = await request.json();
      let lista = (await this.state.storage.get("presupuestos")) || [];
      let guardado = null;
      if (borrar) lista = lista.filter((p) => p.id !== borrar);
      else if (guardar) {
        const ahora = new Date().toISOString();
        const num = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
        const limpio = {
          fecha: /^\d{4}-\d{2}-\d{2}$/.test(guardar.fecha || "") ? guardar.fecha : ahora.slice(0, 10),
          cliente: String(guardar.cliente || "").trim(),
          mostrarTotal: !!guardar.mostrarTotal,
          // Descuento para profesionales (Jennifer, 2026-11-12): un % para todo.
          profesional: !!guardar.profesional,
          descuentoPct: Math.min(100, Math.max(0, Number(guardar.descuentoPct) || 0)) || null,
          pie: String(guardar.pie || ""),
          // Página del presupuesto por WhatsApp (Jennifer, 2026-11-12).
          telefono: String(guardar.telefono || "").trim(),
          nota: String(guardar.nota || ""),
          validezDias: Math.min(365, Math.max(1, Math.floor(Number(guardar.validezDias) || 15))),
          lineas: (guardar.lineas || []).map((l) => ({ descripcion: String(l.descripcion || ""), unidades: num(l.unidades), precio: num(l.precio), handle: l.handle ? String(l.handle) : null, varianteId: num(l.varianteId), imagen: String(l.imagen || "").startsWith("https://") ? String(l.imagen) : null, titulo: l.titulo ? String(l.titulo).slice(0, 300) : null, alternativa: l.alternativa === true }))
            .filter((l) => l.descripcion.trim() || l.precio != null),
          info: (guardar.info || []).map((b) => ({ titulo: String(b.titulo || ""), puntos: String(b.puntos || "") }))
            .filter((b) => b.titulo.trim() || b.puntos.trim()),
        };
        const maxNum = lista.reduce((m, p) => Math.max(m, p.numero || 0), 15328);
        const pedido = Math.floor(Number(guardar.numero)) || null;
        const existente = guardar.id ? lista.find((p) => p.id === guardar.id) : null;
        const numero = pedido || (existente && existente.numero) || maxNum + 1;
        if (lista.some((p) => p.numero === numero && p.id !== (existente && existente.id))) {
          return Response.json({ ok: false, error: "Ya hay un presupuesto con el nº " + numero + "." }, { status: 409 });
        }
        if (existente) {
          Object.assign(existente, limpio, { numero, actualizado: ahora, actualizadoPor: String(guardar.usuario || "") });
          if (!existente.token) existente.token = tokenPresupuesto();
          guardado = existente;
        } else {
          guardado = { id: crypto.randomUUID(), numero, ...limpio, creado: ahora, creadoPor: String(guardar.usuario || "") };
          guardado.token = tokenPresupuesto();
          lista.push(guardado);
        }
      }
      lista.sort((a, b) => (b.numero || 0) - (a.numero || 0));
      await this.state.storage.put("presupuestos", lista);
      return Response.json({ ok: true, presupuesto: guardado, lista });
    }
    // Página pública del presupuesto (/p/<token>): solo lo que ve el cliente.
    if (url.pathname === "/presupuesto-publico" && request.method === "GET") {
      const token = url.searchParams.get("token") || "";
      const p = token.length >= 16 && ((await this.state.storage.get("presupuestos")) || []).find((x) => x.token === token);
      if (!p) return Response.json({ ok: false }, { status: 404 });
      const { telefono, vistas, ...publico } = p;
      return Response.json({ ok: true, presupuesto: publico });
    }
    if (url.pathname === "/presupuesto-visto" && request.method === "POST") {
      const { token } = await request.json();
      const lista = (await this.state.storage.get("presupuestos")) || [];
      const p = token && lista.find((x) => x.token === token);
      if (!p) return Response.json({ ok: false }, { status: 404 });
      p.vistas = (p.vistas || []).concat([new Date().toISOString()]).slice(-50);
      await this.state.storage.put("presupuestos", lista);
      return Response.json({ ok: true });
    }
    // Marcar como enviado por WhatsApp (fecha), para el seguimiento.
    if (url.pathname === "/presupuesto-enviado" && request.method === "POST") {
      const { id, usuario } = await request.json();
      const lista = (await this.state.storage.get("presupuestos")) || [];
      const p = lista.find((x) => x.id === id);
      if (!p) return Response.json({ ok: false }, { status: 404 });
      p.enviado = { fecha: new Date().toISOString(), usuario: String(usuario || "") };
      await this.state.storage.put("presupuestos", lista);
      return Response.json({ ok: true, presupuesto: p });
    }
    if (url.pathname === "/liquidacion" && request.method === "GET") {
      return Response.json((await this.state.storage.get("preciosLiquidacion")) || []);
    }
    if (url.pathname === "/liquidacion" && request.method === "POST") {
      const { anadir, borrar } = await request.json();
      let filas = (await this.state.storage.get("preciosLiquidacion")) || [];
      if (borrar) filas = filas.filter((f) => f.id !== borrar);
      else if (anadir) {
        const coste = Number(anadir.coste), envio = Number(anadir.envio);
        if (!anadir.modelo || !anadir.talla || !(coste >= 0) || !(envio >= 0)) return Response.json({ ok: false, error: "Faltan producto, medida, coste o envío." }, { status: 400 });
        filas.push({
          id: crypto.randomUUID(), modelo: String(anadir.modelo), talla: String(anadir.talla),
          coste, envio, sku: String(anadir.sku || ""), nota: String(anadir.nota || ""),
          usuario: String(anadir.usuario || ""), creado: new Date().toISOString(),
        });
      }
      await this.state.storage.put("preciosLiquidacion", filas);
      return Response.json({ ok: true, filas });
    }
    if (url.pathname === "/publicidad" && request.method === "GET") {
      return Response.json((await this.state.storage.get("publicidadDiaria")) || {});
    }
    if (url.pathname === "/publicidad" && request.method === "POST") {
      const { fecha, facturacion, gasto, roasBruto, usuario, borrar } = await request.json();
      if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(fecha || "")) return Response.json({ ok: false, error: "Fecha no válida." }, { status: 400 });
      const todo = (await this.state.storage.get("publicidadDiaria")) || {};
      if (borrar) delete todo[fecha];
      else {
        const fact = Number(facturacion) || 0, gas = Number(gasto) || 0;
        const ventasSinIva = Math.round(fact / 1.21 * 100) / 100;
        // Periodo (Jennifer, 2026-10-16): los datos son siempre del 1 del mes
        // al día anterior a la consulta ("si lo miro hoy día 16... del 1 al 15
        // de octubre"). Consultado el día 1 → el mes anterior entero.
        const ayer = new Date(fecha + "T12:00:00Z");
        ayer.setUTCDate(ayer.getUTCDate() - 1);
        const periodoHasta = ayer.toISOString().slice(0, 10);
        const periodoDesde = periodoHasta.slice(0, 8) + "01";
        todo[fecha] = {
          fechaConsulta: fecha, periodoDesde, periodoHasta,
          facturacion: fact, gasto: gas, roasBruto: Number(roasBruto) || 0, ventasSinIva,
          pctGasto: ventasSinIva > 0 ? Math.round(gas / ventasSinIva * 10000) / 100 : null,
          roasNeto: gas > 0 ? Math.round(ventasSinIva / gas * 100) / 100 : null,
          usuario: usuario || "", guardado: new Date().toISOString(),
        };
      }
      await this.state.storage.put("publicidadDiaria", todo);
      return Response.json({ ok: true, publicidad: todo });
    }

    if (url.pathname === "/cargas" && request.method === "GET") {
      await asegurarCargasSeur(this.state.storage);
      await asegurarCargasFurniture(this.state.storage);
      const cargas = (await this.state.storage.get("cargas")) || [];
      return Response.json(cargas);
    }

    if (url.pathname === "/cargas/add" && request.method === "POST") {
      const { orderIds, cargaId } = await request.json();
      await asegurarCargasFurniture(this.state.storage);
      const cargas = (await this.state.storage.get("cargas")) || [];
      // Con varias cargas de Furniture abiertas (Jennifer, 2026-09-30): la
      // elegida (cargaId) o, si no se dice, la más próxima.
      const abiertasFur = cargas.filter((c) => (c.tipo || "furniture") === "furniture" && c.estado === "abierta").sort((a, b) => a.fecha.localeCompare(b.fecha));
      let abierta = cargaId ? abiertasFur.find((c) => c.id === cargaId) : abiertasFur[0];
      if (cargaId && !abierta) return Response.json({ ok: false, error: "Esa carga de Furniture no está abierta." }, { status: 400 });
      if (!abierta) {
        // Sin repetir un día que ya tuvo su carga cerrada (Jennifer,
        // 2026-09-30: cerrada la del miércoles 30/09, la siguiente es la del
        // viernes 02/10, no otra vez la de hoy).
        let fecha = nextCargaDate(new Date());
        while (cargas.some((c) => (c.tipo || "furniture") === "furniture" && c.fecha === cargaFechaKey(fecha))) {
          fecha.setDate(fecha.getDate() + 1);
          fecha = nextCargaDate(fecha);
        }
        abierta = {
          id: crypto.randomUUID(),
          tipo: "furniture",
          fecha: cargaFechaKey(fecha),
          dia: DIAS_CARGA[fecha.getDay()],
          estado: "abierta",
          fechaCreacion: new Date().toISOString(),
          fechaCierre: null,
        };
        cargas.push(abierta);
      }
      const orders = (await this.state.storage.get("orders")) || {};
      let añadidos = 0;
      // CP de montaña sin suplemento pagado (Jennifer, 2026-10-16): no entra.
      const montana = [];
      for (const id of orderIds || []) {
        const order = orders[id];
        if (!order || order.cargaId || order.recogeCliente || pedidoCancelado(order)) continue;
        if (montanaPendiente(order)) { montana.push(id); continue; }
        order.cargaId = abierta.id;
        añadidos++;
      }
      await this.state.storage.put("orders", orders);
      await this.state.storage.put("cargas", cargas);
      this.broadcast();
      return Response.json({ ok: true, carga: abierta, añadidos, montana });
    }

    // Pasar pedidos de una carga de Furniture abierta a otra (Jennifer,
    // 2026-09-30). { orderIds, cargaId }
    if (url.pathname === "/cargas/furniture/mover" && request.method === "POST") {
      const { orderIds, cargaId } = await request.json();
      const cargas = (await this.state.storage.get("cargas")) || [];
      const destino = cargas.find((c) => c.id === cargaId && (c.tipo || "furniture") === "furniture" && c.estado === "abierta");
      if (!destino) return Response.json({ ok: false, error: "Esa carga de Furniture no está abierta." }, { status: 400 });
      const orders = (await this.state.storage.get("orders")) || {};
      let movidos = 0;
      for (const id of orderIds || []) {
        if (!orders[id] || pedidoCancelado(orders[id])) continue;
        orders[id].cargaId = destino.id;
        movidos++;
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, carga: destino, movidos });
    }

    // Cambiar la fecha de una carga (Jennifer, 2026-09-29: la carga abierta
    // de Furniture se quedó con fecha 25/09 por error, era la del 30/09).
    if (url.pathname === "/cargas/set-fecha" && request.method === "POST") {
      const { cargaId, fecha } = await request.json();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return Response.json({ ok: false, error: "Fecha no válida (AAAA-MM-DD)." }, { status: 400 });
      const cargas = (await this.state.storage.get("cargas")) || [];
      const carga = cargas.find((c) => c.id === cargaId);
      if (!carga) return Response.json({ ok: false, error: "Carga no encontrada." }, { status: 404 });
      carga.fechaAnterior = carga.fecha;
      carga.fecha = fecha;
      carga.dia = DIAS_SEMANA[new Date(fecha + "T12:00:00").getDay()];
      await this.state.storage.put("cargas", cargas);
      this.broadcast();
      return Response.json({ ok: true, carga });
    }

    // Volver a meter en una carga de SEUR (hoy/mañana) un pedido que se sacó
    // a mano (Jennifer, 2026-09-29: "quitar las cosas de la carga como en
    // Furniture").
    if (url.pathname === "/cargas/seur/add" && request.method === "POST") {
      const { orderIds, fecha } = await request.json();
      const carga = await getOrCreateCargaByFecha(this.state.storage, "seur", seurCargaDateFromChoice(fecha));
      const orders = (await this.state.storage.get("orders")) || {};
      let añadidos = 0;
      for (const id of orderIds || []) {
        const order = orders[id];
        if (!order || order.cargaId || order.recogeCliente || pedidoCancelado(order)) continue;
        order.cargaId = carga.id;
        añadidos++;
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, carga, añadidos });
    }

    // Borrar una carga abierta que se ha quedado vacía (Jennifer,
    // 2026-10-06: carga SEUR del 03/11 creada por error). El Worker
    // comprueba antes que ningún artículo suelto siga en ella.
    if (url.pathname === "/cargas/borrar" && request.method === "POST") {
      const { id } = await request.json();
      const cargas = (await this.state.storage.get("cargas")) || [];
      const carga = cargas.find((c) => c.id === id);
      if (!carga) return Response.json({ ok: false, error: "Carga no encontrada." }, { status: 404 });
      if (carga.estado !== "abierta") return Response.json({ ok: false, error: "Solo se puede borrar una carga abierta." }, { status: 409 });
      const orders = (await this.state.storage.get("orders")) || {};
      if (Object.values(orders).some((o) => o.cargaId === id)) return Response.json({ ok: false, error: "La carga todavía tiene pedidos." }, { status: 409 });
      await this.state.storage.put("cargas", cargas.filter((c) => c.id !== id));
      this.broadcast();
      return Response.json({ ok: true });
    }

    if (url.pathname === "/cargas/remove" && request.method === "POST") {
      const { orderId } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const order = orders[orderId];
      if (!order) return new Response("not found", { status: 404 });
      order.cargaId = null;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true });
    }

    // Envíos de la carga de Furniture ya descargados en el Excel (Jennifer,
    // 2026-10-15: va sacando las etiquetas poco a poco y necesita distinguir
    // lo nuevo). Solo informativo: la descarga no se limita. { cargaId, keys }
    if (url.pathname === "/cargas/descargas" && request.method === "POST") {
      const { cargaId, keys } = await request.json();
      const cargas = (await this.state.storage.get("cargas")) || [];
      const carga = cargas.find((c) => c.id === cargaId);
      if (!carga) return new Response("not found", { status: 404 });
      const ahora = new Date().toISOString();
      carga.descargas = carga.descargas || {};
      for (const k of keys || []) carga.descargas[k] = ahora;
      await this.state.storage.put("cargas", cargas);
      this.broadcast();
      return Response.json({ ok: true });
    }

    if (url.pathname === "/cargas/close" && request.method === "POST") {
      const { cargaId } = await request.json();
      const cargas = (await this.state.storage.get("cargas")) || [];
      const carga = cargas.find((c) => c.id === cargaId);
      if (!carga) return new Response("not found", { status: 404 });
      carga.estado = "cerrada";
      carga.fechaCierre = new Date().toISOString();
      await this.state.storage.put("cargas", cargas);
      // Pedidos de esta carga que la tienda ya daba por enviados (albarán
      // de Furniture creado antes de que saliera la carga, BEZEN12260):
      // ahora sí sale lo que iba en ella.
      if ((carga.tipo || "furniture") === "furniture") {
        const orders = (await this.state.storage.get("orders")) || {};
        let tocados = false;
        for (const o of Object.values(orders)) {
          if (o.cargaId !== carga.id) continue;
          // Ya salió: deja de estar "para tener en cuenta" (Jennifer, 2026-10-14).
          if (o.paraTenerEnCuenta) { o.paraTenerEnCuenta = false; tocados = true; }
          if (o.agencia === "FURNITURE" && o.shippingStatus === "fulfilled") await this.settleShipment(o.id);
        }
        if (tocados) {
          const actuales = (await this.state.storage.get("orders")) || {};
          for (const o of Object.values(orders)) if (o.cargaId === carga.id && actuales[o.id]) actuales[o.id].paraTenerEnCuenta = false;
          await this.state.storage.put("orders", actuales);
        }
      }
      this.broadcast();
      return Response.json({ ok: true, carga });
    }

    // Mover un pedido de una carga de SEUR a otra (Jennifer, 2026-09-30:
    // BEZEN12099 pasa del viernes 02/10 al jueves 01/10).
    if (url.pathname === "/cargas/seur/mover-pedido" && request.method === "POST") {
      const { orderId, cargaId } = await request.json();
      const cargas = (await this.state.storage.get("cargas")) || [];
      const destino = cargas.find((c) => c.id === cargaId && c.tipo === "seur" && c.estado === "abierta");
      if (!destino) return Response.json({ ok: false, error: "Esa carga de SEUR no está abierta." }, { status: 400 });
      const orders = (await this.state.storage.get("orders")) || {};
      const order = orders[orderId];
      if (!order) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      order.cargaId = destino.id;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, carga: destino });
    }

    // Llamado por InventoryStore (Jennifer, 2026-09-08) al marcar un
    // pendiente de colchón como "listo para SEUR" — hoy o mañana, elegido a
    // mano porque puede ser un pedido atrasado que quiere que salga ya.
    if (url.pathname === "/cargas/seur/get-or-create" && request.method === "POST") {
      const { fecha } = await request.json();
      const dateObj = seurCargaDateFromChoice(fecha);
      const carga = await getOrCreateCargaByFecha(this.state.storage, "seur", dateObj);
      this.broadcast();
      return Response.json(carga);
    }

    // El pedido con 2+ colchones de disponibilidad mixta ya tiene decisión
    // (Jennifer, 2026-09-08, ver InventoryStore.processSale): reprocesa con
    // el stock de ahora mismo repartiendo lo que hay y dejando el resto
    // pendiente en Luso/New con referencia "2".
    if (url.pathname === "/orders/seur-dividir" && request.method === "POST") {
      const { id } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const existing = orders[id];
      if (!existing) return new Response("not found", { status: 404 });
      await this.processInventory(existing, true, true);
      orders[id] = existing;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json(existing);
    }

    // Seguimiento de Furniture (Jennifer, 2026-09-16): sube a diario el
    // listado de notas de Furniture, ya parseado por el navegador en filas
    // {orderNumber, albaran, estado, fechaPrevista, seguimiento, tipo}. La
    // información se ACUMULA, no se reemplaza entera: cada albarán es su
    // propia entrada dentro de furnitureTracking (un pedido puede tener
    // varios — normal + BIS/INC/REP), y solo se actualiza (se "machaca") el
    // albarán que SÍ viene en la subida de hoy; si un albarán conocido no
    // aparece hoy, se deja tal cual estaba (Furniture no siempre repite
    // todo el histórico en cada listado).
    if (url.pathname === "/orders/tracking-import" && request.method === "POST") {
      const { entries } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const byOrderNumber = new Map(Object.values(orders).map((o) => [o.orderNumber, o]));
      let sinPedido = 0;
      const pedidosTocados = new Set();
      // Candidatos a fulfillar en Shopify (Jennifer, 2026-09-21): solo
      // albaranes REALMENTE nuevos (idx<0, no una actualización de estado de
      // uno ya conocido) de pedidos de Shopify pagados y sin cancelar. Un
      // pack partido en dos envíos (tapicería ahora vía Furniture, colchón
      // más adelante cuando llegue de fábrica) SÍ entra aquí las dos veces
      // — Shopify trata el pack como una sola línea de producto, así que no
      // se puede fulfillar "la mitad"; la primera vez se crea el
      // fulfillment (marca el pedido enviado), la segunda vez (pedido ya
      // fulfillado) index.js actualiza el seguimiento del mismo fulfillment
      // en vez de crear uno nuevo — eso también manda un email nuevo al
      // cliente con el segundo seguimiento (pedido explícito de Jennifer).
      // Se decide aquí porque solo aquí sabemos si el albarán es nuevo o
      // no; la llamada real a Shopify la hace index.js (aquí no hay acceso
      // a env). `primerEnvio`/`fulfillmentId` los lee index.js para saber
      // si tiene que crear o actualizar.
      const paraShopify = [];
      // Envío conjunto (Jennifer, 2026-09-28): el fichero de Furniture solo
      // trae la referencia del pedido principal, pero el seguimiento es de
      // TODOS los pedidos del grupo — si no, el otro (ej. BEZEN12233) se
      // quedaría pendiente de envío para siempre, aquí y en Shopify.
      const destinos = [];
      // Detalle para el reporte descargable (Jennifer, 2026-09-29).
      const sinPedidoDetalle = [];
      const actualizadosDetalle = [];
      for (const e of entries || []) {
        const principal = byOrderNumber.get(e.orderNumber);
        if (!principal) { sinPedido++; sinPedidoDetalle.push({ albaran: e.albaran, orderNumberDetectado: e.orderNumber, estado: e.estado }); continue; }
        const grupo = principal.grupoEnvio
          ? Object.values(orders).filter((o) => o.grupoEnvio === principal.grupoEnvio)
          : [principal];
        for (const order of grupo) destinos.push({ e: { ...e, orderNumber: order.orderNumber }, order });
      }
      for (const { e, order } of destinos) {
        const tracking = order.furnitureTracking || [];
        const idx = tracking.findIndex((t) => t.albaran === e.albaran);
        const esNuevo = idx < 0;
        // Si la vez anterior falló el envío a Shopify (Jennifer, 2026-09-29),
        // se reintenta al volver a subir el fichero aunque el albarán ya se
        // conozca.
        const errorAnterior = idx >= 0 ? tracking[idx].shopifyError : undefined;
        const estadoAnterior = idx >= 0 ? String(tracking[idx].estado || "").toUpperCase() : "";
        const nuevaEntrada = {
          albaran: e.albaran, estado: e.estado, fechaAlmacen: e.fechaAlmacen,
          fechaPrevista: e.fechaPrevista, seguimiento: e.seguimiento, tipo: e.tipo,
          shopifyError: errorAnterior,
          // La nota de seguimiento de "Casos a revisar" es manual, no viene
          // del fichero — se conserva al actualizar (Jennifer, 2026-09-16).
          nota: idx >= 0 ? tracking[idx].nota : undefined,
        };
        if (idx >= 0) tracking[idx] = nuevaEntrada;
        else tracking.push(nuevaEntrada);
        order.furnitureTracking = tracking;
        pedidosTocados.add(e.orderNumber);
        actualizadosDetalle.push({ orderNumber: e.orderNumber, albaran: e.albaran, nombre: order.name || "", estado: e.estado, nuevo: esNuevo,
          recibidoAhora: estadoAnterior === "PENDIENTE DE RECEPCION" && String(e.estado || "").toUpperCase() !== "PENDIENTE DE RECEPCION" });
        if (
          (esNuevo || errorAnterior) && order.platform === "Shopify" &&
          !order.cancelado && order.shippingStatus !== "cancelado" &&
          (order.paymentStatus === "PAGADO" || order.pagoConfirmadoManual) && e.seguimiento
        ) {
          paraShopify.push({
            orderId: order.id, orderNumber: e.orderNumber, trackingNumber: e.albaran, trackingUrl: e.seguimiento, company: "FURNITURE",
            primerEnvio: !order.shopifyFulfilled, fulfillmentId: order.shopifyFulfillmentId || null,
          });
        }
      }
      await this.state.storage.put("orders", orders);
      // Pedido que Shopify ya daba por enviado (p. ej. el colchón del pack
      // salió antes por SEUR): con el seguimiento de Furniture ya sale lo
      // que faltaba (Jennifer, 2026-10-14, BEZEN12259).
      for (const { e, order } of destinos) {
        const nuevo = actualizadosDetalle.some((x) => x.orderNumber === e.orderNumber && x.albaran === e.albaran && (x.nuevo || x.recibidoAhora));
        if (nuevo && order.shippingStatus === "fulfilled") await this.settleShipment(order.id);
      }
      this.broadcast();
      return Response.json({ ok: true, actualizados: pedidosTocados.size, sinPedido, sinPedidoDetalle, actualizadosDetalle, paraShopify });
    }

    // Resultado del envío a Shopify de un albarán de Furniture (Jennifer,
    // 2026-09-29): { orderNumber, albaran, error } — error null lo borra.
    if (url.pathname === "/orders/furniture-shopify-error" && request.method === "POST") {
      const { orderNumber, albaran, error } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const order = Object.values(orders).find((o) => o.orderNumber === orderNumber);
      const t = order && (order.furnitureTracking || []).find((x) => x.albaran === albaran);
      if (!t) return new Response("not found", { status: 404 });
      if (error) t.shopifyError = error; else delete t.shopifyError;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true });
    }

    // Seguimiento de SEUR (Jennifer, 2026-09-16): mismo mecanismo que el de
    // Furniture, pero el fichero es un .xlsx real (una sola hoja) que se lee
    // en el navegador con la librería xlsx (CDN, igual que jsPDF). La
    // columna que le importa a Jennifer para el estado es "DESCRIPCION
    // SITUACION" (columna AJ del Excel). Clave de acumulación: `localizador`
    // (identificador único de SEUR por envío) en vez del texto de la
    // referencia, porque aquí SEUR no repite sufijos como BIS/INC de forma
    // legible en la propia referencia.
    if (url.pathname === "/orders/tracking-import-seur" && request.method === "POST") {
      const { entries } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const byOrderNumber = new Map(Object.values(orders).map((o) => [o.orderNumber, o]));
      let sinPedido = 0;
      const pedidosTocados = new Set();
      // Detalle fila a fila (Jennifer, 2026-09-24: "necesito... revisar
      // cuales son los pedidos que están teniendo esos problemas" — antes
      // solo se devolvían contadores, no había forma de saber CUÁLES eran
      // sin ir a mirar a mano) — se usa para construir el reporte
      // descargable en el navegador tras cada subida (ver
      // tracking-seur-upload-input en index.js).
      const sinPedidoDetalle = [];
      const actualizadosDetalle = [];
      // Ver comentario en /orders/tracking-import (Furniture) — mismo
      // criterio de elegibilidad para fulfillar en Shopify.
      const paraShopify = [];
      for (const e of entries || []) {
        const order = byOrderNumber.get(e.orderNumber);
        if (!order) {
          sinPedido++;
          sinPedidoDetalle.push({ referencia: e.referencia, orderNumberDetectado: e.orderNumber, estadoSeur: e.estado });
          continue;
        }
        const tracking = order.seurTracking || [];
        const idx = tracking.findIndex((t) => t.localizador === e.localizador);
        const esNuevo = idx < 0;
        const nuevaEntrada = {
          localizador: e.localizador, referencia: e.referencia, numeroExpedicion: e.numeroExpedicion,
          seguimiento: e.seguimiento, codigoSituacion: e.codigoSituacion, estado: e.estado,
          fechaSituacion: e.fechaSituacion, fechaCreacion: e.fechaCreacion, infoAdicional: e.infoAdicional,
          nota: idx >= 0 ? tracking[idx].nota : undefined,
          // Una etiqueta anulada con "No ha salido" sigue anulada aunque
          // vuelva a aparecer en el fichero de SEUR.
          anulado: idx >= 0 ? tracking[idx].anulado : undefined,
        };
        if (idx >= 0) tracking[idx] = nuevaEntrada;
        else tracking.push(nuevaEntrada);
        order.seurTracking = tracking;
        pedidosTocados.add(e.orderNumber);
        actualizadosDetalle.push({ orderNumber: e.orderNumber, referencia: e.referencia, nombre: order.name || "", estadoSeur: e.estado, nuevo: esNuevo });
        // Gesto comercial (Jennifer, 2026-11-04, BEZEN12279: "no puedes dar
        // por enviado unos colchones porque hayan salido unas almohadas"):
        // la etiqueta GC... son las almohadas de regalo, NO la mercancía del
        // pedido — no se marca nada como enviado en Shopify ni se avisa al
        // cliente con ese seguimiento.
        const esEtiquetaGC = /^GC/i.test(String(e.referencia || "").trim());
        if (
          esNuevo && order.platform === "Shopify" && !esEtiquetaGC &&
          !order.cancelado && order.shippingStatus !== "cancelado" &&
          order.paymentStatus === "PAGADO" && e.seguimiento
        ) {
          const numero = (e.seguimiento.split("tracking=")[1] || e.numeroExpedicion || "").trim();
          paraShopify.push({
            orderId: order.id, orderNumber: e.orderNumber, trackingNumber: numero, trackingUrl: e.seguimiento, company: "SEUR",
            primerEnvio: !order.shopifyFulfilled, fulfillmentId: order.shopifyFulfillmentId || null,
            avisarCliente: !order.sinAvisoSeguimiento,
          });
        }
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, actualizados: pedidosTocados.size, sinPedido, sinPedidoDetalle, actualizadosDetalle, paraShopify });
    }

    // "Casos a revisar" (Jennifer, 2026-09-16): incidencias con Furniture,
    // calculadas al vuelo cada vez que se piden (no se guardan aparte) a
    // partir del seguimiento importado y las cargas. Tres reglas dictadas
    // turno a turno:
    // 1) Pendiente de recepción estancado: pasaron 2+ días naturales desde
    //    que se CERRÓ la carga de ese pedido y el estado sigue siendo
    //    "PENDIENTE DE RECEPCION".
    // 2) No entregado: el estado es "NO ENTREGADO" — se avisa al momento,
    //    sin esperar ningún margen.
    // 3) Retraso en almacén: pasaron 7+ días naturales desde F.Almacén y el
    //    estado no es "ENTREGADO OK".
    if (url.pathname === "/casos-revisar" && request.method === "GET") {
      const orders = (await this.state.storage.get("orders")) || {};
      const cargas = (await this.state.storage.get("cargas")) || [];
      const cargasById = new Map(cargas.map((c) => [c.id, c]));
      const hoy = new Date();
      const hoyUTC = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
      function diasNaturalesDesdeIso(iso) {
        if (!iso) return null;
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return null;
        const dUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        return Math.floor((hoyUTC - dUTC) / 86400000);
      }
      function diasNaturalesDesdeFurniture(str) {
        const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec((str || "").trim());
        if (!m) return null;
        const dUTC = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        return Math.floor((hoyUTC - dUTC) / 86400000);
      }
      const casos = [];
      for (const order of Object.values(orders)) {
        if (order.cancelado) continue;
        for (const t of order.furnitureTracking || []) {
          const estado = (t.estado || "").toUpperCase();
          const motivos = [];
          if (estado === "NO ENTREGADO") {
            motivos.push("No entregado por Furniture");
          }
          if (estado === "PENDIENTE DE RECEPCION") {
            const carga = order.cargaId ? cargasById.get(order.cargaId) : null;
            if (carga && carga.estado === "cerrada") {
              const dias = diasNaturalesDesdeIso(carga.fechaCierre);
              if (dias !== null && dias >= 2) {
                motivos.push(`Pendiente de recepción ${dias} días después de cerrar la carga`);
              }
            }
          }
          if (estado !== "ENTREGADO OK" && t.fechaAlmacen) {
            const dias = diasNaturalesDesdeFurniture(t.fechaAlmacen);
            if (dias !== null && dias >= 7) {
              motivos.push(`${dias} días desde que llegó a Almacén sin entregarse`);
            }
          }
          if (motivos.length) {
            casos.push({
              tipo: "furniture", orderId: order.id, orderNumber: order.orderNumber, name: order.name,
              platform: order.platform, orderRef: order.orderRef,
              key: t.albaran, albaran: t.albaran, estado: t.estado, fechaAlmacen: t.fechaAlmacen,
              seguimiento: t.seguimiento, motivos, nota: t.nota || "",
            });
          }
        }
      }
      return Response.json(casos);
    }

    // Nota de seguimiento manual sobre un caso a revisar (Jennifer,
    // 2026-09-16): "va a haber cosas que revisar a diario", necesita apuntar
    // qué gestión está haciendo sobre cada uno. Se guarda directo en la
    // propia entrada de tracking (furnitureTracking/seurTracking), no en una
    // colección aparte, para que sobreviva igual que el resto del
    // seguimiento (ACUMULA, ver /orders/tracking-import[-seur]).
    // Agenda de casos (Jennifer, 2026-10-05): casos de clientes que Jennifer
    // y Sergio siguen a diario. Cada caso: pedido, cliente, teléfono,
    // motivo, responsable, estado y un historial de notas (cada nota es un
    // seguimiento, con fecha y autor).
    // Histórico de pedidos devueltos por SEUR (Jennifer, 2026-10-13). Entran
    // solos cuando el seguimiento dice "Envío devuelto" o "se está devolviendo
    // a origen", o a mano. Es un histórico: "quitar" solo los oculta
    // (descartado), para que los automáticos no vuelvan a entrar.
    // Pedidos de marketplace que NO se tramitan (Jennifer, 2026-10-16: "cuando
    // suba el fichero de Maison el lunes no se tienen que tramitar... ni
    // enviarlos ni meterlos en el proveedor ni nada de nada"): al importar
    // el fichero se saltan por completo.
    // Colores de revisión puestos solos según el seguimiento (Jennifer,
    // 2026-10-28; ver aplicarColoresAutomaticos en index.js).
    if (url.pathname === "/orders/colores-auto" && request.method === "POST") {
      const { cambios } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      let n = 0;
      for (const c of cambios || []) {
        const o = orders[c.id];
        if (!o || !["rojo", "verde", "naranja", "morado", "amarillo", "azul"].includes(c.colorTag)) continue;
        o.colorTag = c.colorTag;
        o.colorAuto = new Date().toISOString();
        n++;
      }
      if (n) { await this.state.storage.put("orders", orders); this.broadcast(); }
      return Response.json({ ok: true, n });
    }
    // Devoluciones a fábrica añadidas a mano (Jennifer, 2026-10-28: p. ej.
    // mercancía que el cliente rechaza). Las de reposiciones van en el
    // propio pendiente (InventoryStore, devolucionFabrica).
    if (url.pathname === "/devoluciones-fabrica" && request.method === "GET") {
      return Response.json((await this.state.storage.get("devolucionesFabrica")) || []);
    }
    // Solo recogidas por Furniture (Jennifer, 2026-11-25). Cada recogida
    // crea también su línea en «Pendiente de devolución a fábrica»
    // (devolucionesFabrica, recogidaId) y, al marcarla recibida, esa línea
    // pasa a «Devuelto al almacén».
    // Códigos EAN (Jennifer, 2026-11-25). Lista grande (~3.300): se guarda
    // en trozos de 500 filas ("ean:meta" + "ean:<i>").
    if (url.pathname === "/ean" && request.method === "GET") {
      return Response.json(await this.leerEan());
    }
    if (url.pathname === "/ean/cargar" && request.method === "POST") {
      const { filas, usuario } = await request.json();
      if (!Array.isArray(filas) || !filas.length) return Response.json({ ok: false, error: "Sin filas." }, { status: 400 });
      await this.escribirEan(filas, { cargado: new Date().toISOString(), cargadoPor: usuario || null });
      return Response.json({ ok: true, total: filas.length });
    }
    if (url.pathname === "/ean/guardar" && request.method === "POST") {
      const d = await request.json();
      const ean = String(d.ean || "").trim();
      if (!/^[0-9]{13}$/.test(ean)) return Response.json({ ok: false, error: "EAN no válido." }, { status: 400 });
      const { meta, filas } = await this.leerEan();
      let fila = filas.find((x) => x.ean === ean);
      if (!fila) { fila = { ean, donde: "Añadido a mano" }; filas.push(fila); }
      for (const k of ["sku", "producto", "nota", "borrado"]) if (d[k] !== undefined) fila[k] = d[k];
      fila.editado = { usuario: d.usuario || null, fecha: new Date().toISOString() };
      await this.escribirEan(filas, meta || {});
      return Response.json({ ok: true, fila });
    }
    if (url.pathname === "/recogidas-furniture" && request.method === "GET") {
      return Response.json((await this.state.storage.get("recogidasFurniture")) || []);
    }
    if (url.pathname === "/recogidas-furniture" && request.method === "POST") {
      const { crear, id, estado, borrar, usuario } = await request.json();
      const lista = (await this.state.storage.get("recogidasFurniture")) || [];
      const devs = (await this.state.storage.get("devolucionesFabrica")) || [];
      const ahora = new Date().toISOString();
      const u = usuario || null;
      let entrada;
      if (crear) {
        const lineas = (crear.lineas || []).map((l) => String(l || "").trim().toUpperCase()).filter(Boolean)
          .map((l) => (/^RECOGIDA(\s|$)/.test(l) ? l : "RECOGIDA " + l));
        if (!crear.orderId || !crear.ref || !lineas.length) return Response.json({ ok: false, error: "Faltan el pedido o lo que hay que recoger." }, { status: 400 });
        entrada = {
          id: crypto.randomUUID(), creado: ahora, orderId: crear.orderId, ref: String(crear.ref).trim().toUpperCase(),
          cliente: String(crear.cliente || ""), ciudad: String(crear.ciudad || ""),
          motivo: crear.motivo === "devolucion" ? "devolucion" : "desistimiento",
          proveedor: String(crear.proveedor || "").trim().toUpperCase(), lineas,
          observaciones: String(crear.observaciones || "").trim(),
          estado: "pendiente", fecha: ahora, usuario: u, creadoPor: u, historial: [{ estado: "pendiente", fecha: ahora, usuario: u }],
        };
        const dev = {
          id: crypto.randomUUID(), creado: ahora, ref: entrada.ref, que: lineas.join(" + "), proveedor: entrada.proveedor,
          motivo: entrada.motivo, cliente: entrada.cliente, estado: "recoger", fecha: ahora, usuario: u, creadoPor: u,
          historial: [{ estado: "recoger", fecha: ahora, usuario: u }], recogidaId: entrada.id,
        };
        devs.push(dev);
        entrada.devfabId = dev.id;
        lista.push(entrada);
      } else {
        entrada = lista.find((x) => x.id === (id || borrar));
        if (!entrada) return Response.json({ ok: false, error: "Recogida no encontrada." }, { status: 404 });
        const dev = entrada.devfabId && devs.find((x) => x.id === entrada.devfabId);
        if (borrar) {
          entrada.borrado = true;
          if (dev) dev.borrado = true;
        } else if (["pendiente", "descargado", "recogido", "recibido"].includes(estado) && estado !== entrada.estado) {
          entrada.estado = estado;
          entrada.fecha = ahora;
          entrada.usuario = u;
          entrada.historial = [...(entrada.historial || []), { estado, fecha: ahora, usuario: u }];
          if (dev && estado === "recibido" && dev.estado !== "devuelta") {
            dev.estado = "devuelta";
            dev.fecha = ahora;
            dev.usuario = u;
            dev.historial = [...(dev.historial || []), { estado: "devuelta", fecha: ahora, usuario: u }];
          }
        }
      }
      await this.state.storage.put("recogidasFurniture", lista);
      await this.state.storage.put("devolucionesFabrica", devs);
      return Response.json({ ok: true, entrada });
    }

    if (url.pathname === "/devoluciones-fabrica/guardar" && request.method === "POST") {
      const datos = await request.json();
      const lista = (await this.state.storage.get("devolucionesFabrica")) || [];
      let entrada = datos.id ? lista.find((x) => x.id === datos.id) : null;
      if (datos.id && !entrada) return Response.json({ ok: false, error: "No encontrada." }, { status: 404 });
      if (!entrada) {
        entrada = { id: crypto.randomUUID(), creado: new Date().toISOString() };
        lista.push(entrada);
      }
      for (const k of ["ref", "que", "proveedor", "motivo", "cliente", "estado", "fecha", "usuario", "creadoPor", "historial", "nota", "borrado"]) {
        if (datos[k] !== undefined) entrada[k] = datos[k];
      }
      await this.state.storage.put("devolucionesFabrica", lista);
      return Response.json({ ok: true, entrada });
    }
    // Contactos de interés (Jennifer, 2026-11-12): { lista, categorias }.
    if (url.pathname === "/contactos" && request.method === "GET") {
      const d = (await this.state.storage.get("contactos")) || {};
      return Response.json({ lista: (d.lista || []).filter((c) => !c.borrado), categorias: d.categorias || CONTACTOS_CATEGORIAS_INICIALES });
    }
    if (url.pathname === "/contactos/guardar" && request.method === "POST") {
      const datos = await request.json();
      const d = (await this.state.storage.get("contactos")) || {};
      const lista = d.lista || [];
      const ahora = new Date().toISOString();
      let c = datos.id ? lista.find((x) => x.id === datos.id) : null;
      if (datos.id && !c) return Response.json({ ok: false, error: "Ese contacto ya no existe." }, { status: 404 });
      if (!c) {
        if (!String(datos.nombre || "").trim() && !String(datos.empresa || "").trim()) return Response.json({ ok: false, error: "Pon al menos el nombre o la empresa." }, { status: 400 });
        c = { id: crypto.randomUUID(), creado: ahora, creadoPor: datos.usuario || null };
        lista.push(c);
      }
      for (const k of ["nombre", "empresa", "categoria", "telefonos", "email", "web", "direccion", "notas"]) {
        if (datos[k] !== undefined) c[k] = String(datos[k] || "").trim().slice(0, 4000);
      }
      if (datos.borrado) { c.borrado = true; c.borradoPor = datos.usuario || null; c.fechaBorrado = ahora; }
      c.modificado = ahora;
      c.modificadoPor = datos.usuario || null;
      const categorias = d.categorias || CONTACTOS_CATEGORIAS_INICIALES.slice();
      if (c.categoria && !categorias.includes(c.categoria)) categorias.push(c.categoria);
      await this.state.storage.put("contactos", { lista, categorias });
      return Response.json({ ok: true, contacto: c, categorias });
    }
    // Ayuda · Cómo se hace en Shopify (Jennifer, 2026-11-26): guías editables.
    if (url.pathname === "/guias-shopify" && request.method === "GET") {
      const lista = (await this.state.storage.get("guiasShopify")) || GUIAS_SHOPIFY_INICIALES;
      return Response.json({ lista: lista.filter((g) => !g.borrado) });
    }
    if (url.pathname === "/guias-shopify/guardar" && request.method === "POST") {
      const datos = await request.json();
      const lista = (await this.state.storage.get("guiasShopify")) || GUIAS_SHOPIFY_INICIALES.map((g) => ({ ...g }));
      const ahora = new Date().toISOString();
      let g = datos.id ? lista.find((x) => x.id === datos.id) : null;
      if (datos.id && !g) return Response.json({ ok: false, error: "Esa guía ya no existe." }, { status: 404 });
      if (!g) {
        if (!String(datos.titulo || "").trim()) return Response.json({ ok: false, error: "Pon un título." }, { status: 400 });
        g = { id: crypto.randomUUID(), creado: ahora, creadoPor: datos.usuario || null };
        lista.push(g);
      }
      if (datos.titulo !== undefined && String(datos.titulo).trim()) g.titulo = String(datos.titulo).trim().slice(0, 300);
      if (datos.texto !== undefined) g.texto = String(datos.texto || "").trim().slice(0, 20000);
      if (datos.borrado) { g.borrado = true; g.borradoPor = datos.usuario || null; }
      g.modificado = ahora;
      g.modificadoPor = datos.usuario || null;
      await this.state.storage.put("guiasShopify", lista);
      return Response.json({ ok: true, guia: g });
    }
    if (url.pathname === "/no-tramitar" && request.method === "GET") {
      return Response.json((await this.state.storage.get("noTramitar")) || []);
    }
    if (url.pathname === "/no-tramitar" && request.method === "POST") {
      const { lista, usuario } = await request.json();
      const limpia = [...new Set((lista || []).map((x) => String(x || "").trim().toUpperCase()).filter(Boolean))];
      await this.state.storage.put("noTramitar", limpia);
      await this.state.storage.put("noTramitarCambio", { fecha: new Date().toISOString(), usuario: usuario || null });
      return Response.json({ ok: true, lista: limpia });
    }
    if (url.pathname === "/devoluciones" && request.method === "GET") {
      const orders = (await this.state.storage.get("orders")) || {};
      const devoluciones = (await this.state.storage.get("devoluciones")) || [];
      let nuevas = 0;
      for (const o of Object.values(orders)) {
        for (const t of o.seurTracking || []) {
          if (!/envío devuelto|devolviendo a origen/i.test(t.estado || "")) continue;
          const id = String(o.id) + "|" + (t.localizador || t.referencia || "");
          // Ya estaba avisada como "pendiente de devolución" (Jennifer,
          // 2026-10-19): no se duplica, se marca que SEUR ya la da devuelta.
          const prevista = devoluciones.find((d) => d.prevista && !d.descartado && String(d.orderId) === String(o.id));
          if (prevista) {
            if (!prevista.devueltoSeur) { prevista.devueltoSeur = { estado: t.estado || "", fecha: new Date().toISOString() }; nuevas++; }
            continue;
          }
          // Una sola fila por pedido aunque SEUR tenga varios seguimientos.
          if (devoluciones.some((d) => d.id === id || (d.origen === "auto" && String(d.orderId) === String(o.id)))) continue;
          devoluciones.push({ id, orderId: o.id, origen: "auto", estadoDetectado: t.estado || "", localizador: t.localizador || t.referencia || "", creado: new Date().toISOString() });
          nuevas++;
        }
      }
      if (nuevas) await this.state.storage.put("devoluciones", devoluciones);
      return Response.json(devoluciones.filter((d) => !d.descartado).map((d) => {
        const o = orders[d.orderId] || {};
        const tr = o.seurTracking || [];
        const t = tr.find((x) => (x.localizador || x.referencia || "") === d.localizador) || tr[tr.length - 1] || null;
        return { ...d, refUnidad: d.refUnidad || (t && t.referencia && t.referencia !== o.orderRef ? t.referencia : ""), orderNumber: o.orderNumber, orderRef: o.orderRef, platform: o.platform, nombre: o.name || "", producto: o.product || "", estadoSeur: t ? t.estado || "" : "", seguimiento: t ? t.seguimiento || "" : "" };
      }));
    }
    if (url.pathname === "/devoluciones/guardar" && request.method === "POST") {
      const body = await request.json();
      const devoluciones = (await this.state.storage.get("devoluciones")) || [];
      const ahora = new Date().toISOString();
      let d = body.id ? devoluciones.find((x) => x.id === body.id) : null;
      if (body.id && !d) return Response.json({ ok: false, error: "Devolución no encontrada." }, { status: 404 });
      if (!d) {
        const orders = Object.values((await this.state.storage.get("orders")) || {});
        const q = String(body.ref || "").trim().toUpperCase();
        // Desde Envíos SEUR llega el id del pedido (Jennifer, 2026-10-19:
        // botón "Va a volver devuelto").
        const o = (body.orderId != null ? orders.find((x) => String(x.id) === String(body.orderId)) : null)
          || orders.find((x) => x.orderRef && String(x.orderRef).toUpperCase() === q)
          || orders.find((x) => (!x.platform || x.platform === "Shopify") && ("BEZEN" + x.orderNumber === q || String(x.orderNumber) === q))
          // Segunda unidad con su propia referencia de envío (Jennifer,
          // 2026-10-22: 1106675270-A2 del pedido 1106675270-A): se busca el
          // pedido sin el número final del sufijo.
          || (/-[A-Z]\d+$/.test(q) ? orders.find((x) => x.orderRef && String(x.orderRef).toUpperCase() === q.replace(/\d+$/, "")) : null);
        if (!o) return Response.json({ ok: false, error: "No encuentro el pedido " + (q || body.orderId) + "." }, { status: 404 });
        // Una devolución prevista no se duplica si el pedido ya está en
        // Devoluciones.
        const yaEsta = body.prevista && devoluciones.find((x) => !x.descartado && String(x.orderId) === String(o.id));
        if (yaEsta) return Response.json({ ok: true, devolucion: yaEsta, yaEstaba: true });
        d = { id: String(o.id) + "|manual-" + Date.now(), orderId: o.id, origen: "manual", creado: ahora, creadoPor: body.usuario || null };
        // Qué unidad es, cuando se mete con la referencia de envío (…-A2).
        if (q && o.orderRef && q !== String(o.orderRef).toUpperCase() && q.startsWith(String(o.orderRef).toUpperCase())) {
          d.refUnidad = q;
          const t = (o.seurTracking || []).find((x) => String(x.referencia || "").toUpperCase() === q);
          if (t) d.localizador = t.localizador || t.referencia || "";
        }
        // Pendiente de devolución: sabemos que vuelve pero SEUR aún no lo
        // ha marcado como devuelto.
        if (body.prevista) { d.prevista = true; d.refEnvio = String(body.refEnvio || ""); }
        devoluciones.push(d);
      }
      for (const k of ["motivo", "estadoColchon", "destino", "fechaLlegada", "notas"]) if (body[k] !== undefined) d[k] = String(body[k] || "");
      if (body.alStock !== undefined) d.alStock = body.alStock || null;
      if (body.descartado !== undefined) d.descartado = !!body.descartado;
      d.actualizado = ahora;
      d.actualizadoPor = body.usuario || null;
      await this.state.storage.put("devoluciones", devoluciones);
      this.broadcast();
      return Response.json({ ok: true, devolucion: d });
    }

    if (url.pathname === "/casos" && request.method === "GET") {
      return Response.json((await this.state.storage.get("casos")) || []);
    }
    if (url.pathname === "/casos/guardar" && request.method === "POST") {
      const { id, pedidoId, pedidoRef, cliente, telefono, motivo, responsable, estado, urgente, nota, notaAutor, notaFecha, usuario } = await request.json();
      const casos = (await this.state.storage.get("casos")) || [];
      const ahora = new Date().toISOString();
      let caso = id ? casos.find((c) => c.id === id) : null;
      if (id && !caso) return Response.json({ ok: false, error: "Caso no encontrado." }, { status: 404 });
      if (!caso) {
        caso = { id: crypto.randomUUID(), creado: ahora, creadoPor: usuario || null, estado: "abierto", notas: [] };
        casos.push(caso);
      }
      if (pedidoId !== undefined) caso.pedidoId = pedidoId || null;
      if (pedidoRef !== undefined) caso.pedidoRef = pedidoRef || "";
      if (cliente !== undefined) caso.cliente = cliente || "";
      if (telefono !== undefined) caso.telefono = telefono || "";
      if (motivo !== undefined) caso.motivo = motivo || "";
      if (responsable !== undefined) caso.responsable = responsable || "AMBOS";
      if (estado !== undefined && estado !== caso.estado) {
        caso.estado = estado === "cerrado" ? "cerrado" : "abierto";
        caso.fechaCierre = caso.estado === "cerrado" ? ahora : null;
        caso.notas.push({ fecha: ahora, autor: usuario || null, texto: caso.estado === "cerrado" ? "Caso cerrado" : "Caso reabierto", sistema: true });
      }
      // Quién hizo la gestión y qué día (Jennifer, 2026-10-05): por defecto
      // quien la apunta y ahora; se puede poner otra persona u otro día
      // (ej. Sergio llamó ayer y lo apunta Jennifer hoy).
      // URGENTE — dar respuesta hoy (Jennifer, 2026-10-05): sigue saliendo
      // para revisar aunque ya se haya gestionado hoy, hasta quitarlo o
      // cerrar el caso.
      if (urgente !== undefined && !!urgente !== !!caso.urgente) {
        caso.urgente = !!urgente;
        caso.urgenteDesde = caso.urgente ? ahora : null;
        caso.notas.push({ fecha: ahora, autor: usuario || null, texto: caso.urgente ? "Marcado URGENTE — dar respuesta hoy" : "Quitada la marca de urgente", sistema: true });
      }
      if (caso.estado === "cerrado" && caso.urgente) { caso.urgente = false; caso.urgenteDesde = null; }
      if (String(nota || "").trim()) {
        const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
        const otroDia = /^\d{4}-\d{2}-\d{2}$/.test(notaFecha || "") && notaFecha !== hoy;
        caso.notas.push({ fecha: otroDia ? notaFecha + "T12:00:00.000Z" : ahora, soloDia: otroDia || undefined, autor: notaAutor || usuario || null, apuntadoPor: notaAutor && notaAutor !== usuario ? usuario : undefined, texto: String(nota).trim() });
        caso.notas.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
      }
      caso.actualizado = ahora;
      await this.state.storage.put("casos", casos);
      this.broadcast();
      return Response.json({ ok: true, caso });
    }
    if (url.pathname === "/casos/borrar" && request.method === "POST") {
      const { id } = await request.json();
      const casos = (await this.state.storage.get("casos")) || [];
      await this.state.storage.put("casos", casos.filter((c) => c.id !== id));
      this.broadcast();
      return Response.json({ ok: true });
    }

    // Tareas con fecha (Jennifer, 2026-10-05): "cosas para hacer en fechas
    // determinadas", distintas de los casos. { texto, fecha AAAA-MM-DD,
    // pedidoId/pedidoRef opcionales, para AMBOS|JENNIFER|SERGIO, hecha }.
    if (url.pathname === "/tareas" && request.method === "GET") {
      return Response.json((await this.state.storage.get("tareas")) || []);
    }
    if (url.pathname === "/tareas/guardar" && request.method === "POST") {
      const { id, texto, fecha, pedidoId, pedidoRef, para, hecha, nota, usuario, pospuestaTarde, grupo } = await request.json();
      const tareas = (await this.state.storage.get("tareas")) || [];
      const ahora = new Date().toISOString();
      let t = id ? tareas.find((x) => x.id === id) : null;
      if (id && !t) return Response.json({ ok: false, error: "Tarea no encontrada." }, { status: 404 });
      if (!t) {
        if (!String(texto || "").trim() || !/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return Response.json({ ok: false, error: "Falta qué hay que hacer o la fecha." }, { status: 400 });
        t = { id: crypto.randomUUID(), creado: ahora, creadoPor: usuario || null, hecha: false };
        tareas.push(t);
      }
      if (texto !== undefined) t.texto = String(texto || "").trim();
      if (fecha !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) t.fecha = fecha;
      // "Posponer a la tarde" desde el aviso (Jennifer, 2026-10-22): el día
      // (AAAA-MM-DD) en que no sale en la ronda de la mañana, solo a las 16:00.
      if (pospuestaTarde !== undefined) t.pospuestaTarde = /^\d{4}-\d{2}-\d{2}$/.test(pospuestaTarde || "") ? pospuestaTarde : null;
      if (pedidoId !== undefined) t.pedidoId = pedidoId || null;
      if (pedidoRef !== undefined) t.pedidoRef = pedidoRef || "";
      if (para !== undefined) t.para = ["JENNIFER", "SERGIO"].includes(para) ? para : "AMBOS";
      // Grupo de la tarea (Jennifer, 2026-11-04): "FURNITURE/POLIVAL/FERNANDO/
      // SEUR/TRABAJO PERSONAL, por ahora esos grupos". null = sin grupo.
      if (grupo !== undefined) t.grupo = ["FURNITURE", "POLIVAL", "LUSO", "FERNANDO", "SERGIO", "JENNIFER", "CONTABILIDAD", "SEUR", "WORTEN", "TRABAJO PERSONAL"].includes(grupo) ? grupo : null;
      if (hecha !== undefined && !!hecha !== !!t.hecha) {
        t.hecha = !!hecha;
        t.hechaPor = t.hecha ? usuario || null : null;
        t.fechaHecha = t.hecha ? ahora : null;
      }
      // Notas de la tarea (Jennifer, 2026-10-06): "ir rellenando información
      // adicional" — historial con fecha y autor.
      if (String(nota || "").trim()) {
        t.notas = t.notas || [];
        t.notas.push({ fecha: ahora, autor: usuario || null, texto: String(nota).trim() });
      }
      t.actualizado = ahora;
      await this.state.storage.put("tareas", tareas);
      this.broadcast();
      return Response.json({ ok: true, tarea: t });
    }
    if (url.pathname === "/tareas/borrar" && request.method === "POST") {
      const { id } = await request.json();
      const tareas = (await this.state.storage.get("tareas")) || [];
      await this.state.storage.put("tareas", tareas.filter((x) => x.id !== id));
      this.broadcast();
      return Response.json({ ok: true });
    }

    // Directorio de contraseñas cifrado (Jennifer, 2026-11-10: "que se cifre
    // ese apartado, el resto no"). Cifrado de extremo a extremo en el
    // navegador: aquí SOLO llega texto cifrado (AES-GCM) y nunca la
    // contraseña maestra. De la maestra el navegador deriva (PBKDF2) una
    // clave de cifrado, que no sale de él, y una clave de acceso, de la que
    // guardamos solo su SHA-256 para exigirla en cada lectura/escritura (así
    // nadie sin la maestra puede descargar el cifrado ni borrar/sobrescribir).
    // Claves: "boveda" {salt, iter, authHash, creado, creadoPor},
    // "bovedaEntradas" [{id, iv, ct, creado, actualizado, por}],
    // "bovedaFallos" {n, hasta} (bloqueo tras intentos fallidos).
    if (url.pathname.startsWith("/boveda")) {
      return this.bovedaRoute(url, request);
    }
    // Día en que ya se mandó el email de recordatorio (uno por día).
    // Solicitud de material a SEUR (Jennifer, 2026-11-11): texto del email,
    // último día enviado e historial de envíos.
    if (url.pathname === "/seur/material" && request.method === "GET") {
      return Response.json((await this.state.storage.get("seurMaterial")) || { texto: null, ultimoDia: null, historial: [] });
    }
    if (url.pathname === "/seur/material" && request.method === "POST") {
      const { texto, envio } = await request.json();
      const actual = (await this.state.storage.get("seurMaterial")) || { texto: null, ultimoDia: null, historial: [] };
      if (typeof texto === "string") actual.texto = texto.slice(0, 5000);
      if (envio) {
        actual.historial = [envio, ...(actual.historial || [])].slice(0, 200);
        if (envio.ok) actual.ultimoDia = envio.dia;
      }
      await this.state.storage.put("seurMaterial", actual);
      return Response.json({ ok: true, ...actual });
    }
    if (url.pathname === "/nacex/informe-mes" && request.method === "GET") {
      return Response.json({ mes: (await this.state.storage.get("nacexInformeMes")) || null });
    }
    if (url.pathname === "/nacex/informe-mes" && request.method === "POST") {
      const { mes } = await request.json();
      await this.state.storage.put("nacexInformeMes", mes);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/tareas/email-dia" && request.method === "GET") {
      return Response.json({ dia: (await this.state.storage.get("tareasEmailDia")) || null });
    }
    if (url.pathname === "/tareas/email-dia" && request.method === "POST") {
      const { dia } = await request.json();
      await this.state.storage.put("tareasEmailDia", dia);
      return Response.json({ ok: true });
    }

    // Notas y "Reclamado a SEUR" por línea enviada (Jennifer, 2026-10-01),
    // guardado en el pedido por referencia de SEUR.
    // Facturas de indemnización a SEUR (Jennifer, 2026-10-22): no hay otro
    // almacén de ficheros, se guardan aparte en el storage del objeto
    // (clave "factura:<id>", base64, máx. ~1,3 MB por fichero).
    if (url.pathname === "/orders/factura" && request.method === "POST") {
      const { nombre, tipo, base64 } = await request.json();
      if (!base64 || base64.length > 1800000) return Response.json({ ok: false, error: "El fichero es demasiado grande (máx. 1,3 MB)." }, { status: 400 });
      const id = crypto.randomUUID();
      await this.state.storage.put("factura:" + id, { nombre: String(nombre || "factura"), tipo: String(tipo || "application/octet-stream"), base64, fecha: new Date().toISOString() });
      return Response.json({ ok: true, id });
    }
    if (url.pathname === "/orders/factura" && request.method === "GET") {
      const f = await this.state.storage.get("factura:" + (url.searchParams.get("id") || ""));
      if (!f) return new Response("Factura no encontrada", { status: 404 });
      const bin = Uint8Array.from(atob(f.base64), (ch) => ch.charCodeAt(0));
      return new Response(bin, { headers: { "content-type": f.tipo, "content-disposition": 'inline; filename="' + f.nombre.replace(/[^\x20-\x7E]|"/g, "_") + '"' } });
    }

    if (url.pathname === "/orders/envio-seur-info" && request.method === "POST") {
      const { orderId, ref, nota, reclamado, archivado, correo, manual, refSeur, casoCerrado, indemnizacion, facturaReclamacion, notaCaso, documentacionCaso, adjuntosCaso, portesContabilidad, portesCobrados } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const order = orders[orderId];
      if (!order || !ref) return new Response("not found", { status: 404 });
      const info = (order.enviosSeurInfo = order.enviosSeurInfo || {});
      const e = (info[ref] = info[ref] || {});
      if (nota !== undefined) e.nota = String(nota);
      // Referencia con la que se subió de verdad a SEUR (Jennifer,
      // 2026-10-09: "la he tenido que modificar y subirla con la referencia
      // terminada en dos"). El seguimiento se busca con esta.
      if (refSeur !== undefined) e.refSeur = String(refSeur || "").trim().toUpperCase() || null;
      if (reclamado !== undefined) {
        e.reclamado = !!reclamado;
        e.fechaReclamado = reclamado ? new Date().toISOString() : null;
      }
      // Archivar (Jennifer, 2026-10-01): no hay nada más que revisar
      // aunque SEUR no lo haya pasado a entregado.
      if (archivado !== undefined) {
        e.archivado = !!archivado;
        e.fechaArchivado = archivado ? new Date().toISOString() : null;
      }
      // Conversación por email con SEUR (Jennifer, 2026-10-02): se mezcla
      // con lo que ya hubiera (threadIds, destino, asunto, mensajes, vistoHasta).
      if (correo !== undefined) e.correo = correo ? { ...(e.correo || {}), ...correo } : null;
      // Añadido a mano a Envíos SEUR (Jennifer, 2026-10-05, 002-26208L28658-A:
      // envío anterior a las cargas del sistema que hay que reclamar).
      // Reclamación de SEUR cerrada a mano (Jennifer, 2026-10-22):
      // { numero, cerrado }. Los casos se detectan solos en los correos.
      if (casoCerrado && casoCerrado.numero) {
        e.casosCerrados = e.casosCerrados || {};
        if (casoCerrado.cerrado) e.casosCerrados[String(casoCerrado.numero)] = new Date().toISOString();
        else delete e.casosCerrados[String(casoCerrado.numero)];
      }
      // Indemnización pedida a SEUR por un caso de reclamación (Jennifer,
      // 2026-10-22): { clave, tipo: "portes" | "extravio-portes", importe,
      // facturaId, facturaNombre, usuario } o { clave, borrar: true }.
      if (indemnizacion && indemnizacion.clave) {
        e.indemnizaciones = e.indemnizaciones || {};
        const k = String(indemnizacion.clave);
        if (indemnizacion.borrar) delete e.indemnizaciones[k];
        else e.indemnizaciones[k] = {
          tipo: indemnizacion.tipo === "extravio-portes" ? "extravio-portes" : "portes",
          importe: Number(indemnizacion.importe) || 0,
          facturaId: indemnizacion.facturaId || null,
          facturaNombre: indemnizacion.facturaNombre || null,
          usuario: indemnizacion.usuario || null,
          fecha: new Date().toISOString(),
        };
      }
      // Factura con el precio real para un caso de reclamación (Jennifer,
      // 2026-10-28): lleva el número que le da el sistema oficial de
      // facturación (lo escribe Jennifer). Sin número, serie propia "S"
      // con un contador por año. El caso conserva su número.
      if (facturaReclamacion && facturaReclamacion.clave) {
        e.facturasReclamacion = e.facturasReclamacion || {};
        const k = String(facturaReclamacion.clave);
        const numeroOficial = String(facturaReclamacion.numero || "").trim();
        if (facturaReclamacion.borrar) {
          delete e.facturasReclamacion[k];
        } else if (numeroOficial) {
          e.facturasReclamacion[k] = { numero: numeroOficial, oficial: true, fecha: new Date().toISOString() };
        } else if (!e.facturasReclamacion[k]) {
          const anio = new Date().getFullYear();
          const claveContador = "facturaReclamacionContador:" + anio;
          const n = ((await this.state.storage.get(claveContador)) || 0) + 1;
          await this.state.storage.put(claveContador, n);
          e.facturasReclamacion[k] = { numero: "S" + String(anio).slice(2) + "-" + String(n).padStart(4, "0"), fecha: new Date().toISOString() };
        }
      }
      // Documentación aportada a SEUR en un caso (Jennifer, 2026-10-28):
      // { clave, subida, usuario }. Se guarda cuándo y quién la marcó.
      if (documentacionCaso && documentacionCaso.clave) {
        e.documentacionCaso = e.documentacionCaso || {};
        const k = String(documentacionCaso.clave);
        // "Recordar mañana" (Jennifer, 2026-10-28): el aviso se aparta hasta
        // esa fecha. { clave, posponerHasta: ISO | null, usuario }.
        if (documentacionCaso.posponerHasta !== undefined) {
          e.documentacionPospuesta = e.documentacionPospuesta || {};
          if (documentacionCaso.posponerHasta) e.documentacionPospuesta[k] = { hasta: documentacionCaso.posponerHasta, usuario: documentacionCaso.usuario || null, fecha: new Date().toISOString() };
          else delete e.documentacionPospuesta[k];
        } else if (documentacionCaso.subida) e.documentacionCaso[k] = { fecha: new Date().toISOString(), usuario: documentacionCaso.usuario || null };
        else delete e.documentacionCaso[k];
      }
      // Fotos y documentos de un caso (Jennifer, 2026-10-28): { clave,
      // agregar: [{ id, nombre, fecha, usuario, origen }] }. Los ficheros
      // están en "factura:<id>"; aquí solo la lista.
      if (adjuntosCaso && adjuntosCaso.clave && Array.isArray(adjuntosCaso.agregar)) {
        e.adjuntosCaso = e.adjuntosCaso || {};
        const k = String(adjuntosCaso.clave);
        e.adjuntosCaso[k] = [...(e.adjuntosCaso[k] || []), ...adjuntosCaso.agregar.filter((a) => a && a.id).map((a) => ({
          id: String(a.id), nombre: String(a.nombre || "archivo"), fecha: a.fecha || new Date().toISOString(), usuario: a.usuario || null, origen: a.origen || null,
        }))];
      }
      // Portes que SEUR abona (Jennifer, 2026-10-28): email automático a
      // contabilidad ya mandado ({ mensajeId, caso, fechaEmail }) y cobro
      // confirmado a mano ({ clave, cobrado, importe, usuario }).
      if (portesContabilidad && portesContabilidad.mensajeId) {
        e.portesContabilidad = e.portesContabilidad || {};
        e.portesContabilidad[String(portesContabilidad.mensajeId)] = { caso: portesContabilidad.caso || "", fechaEmail: portesContabilidad.fechaEmail || null, avisado: new Date().toISOString() };
      }
      if (portesCobrados && portesCobrados.clave) {
        e.portesCobrados = e.portesCobrados || {};
        const k = String(portesCobrados.clave);
        if (portesCobrados.cobrado) e.portesCobrados[k] = { fecha: new Date().toISOString(), usuario: portesCobrados.usuario || null, importe: Number(portesCobrados.importe) || null };
        else delete e.portesCobrados[k];
      }
      // Notas de un caso de reclamación (Jennifer, 2026-10-28): { clave, texto }.
      if (notaCaso && notaCaso.clave) {
        e.notasCaso = e.notasCaso || {};
        e.notasCaso[String(notaCaso.clave)] = String(notaCaso.texto || "");
      }
      if (manual !== undefined) {
        e.manual = !!manual;
        e.fechaManual = manual ? new Date().toISOString() : null;
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, info: e });
    }

    // Varias conversaciones con SEUR a la vez (refresco de correos).
    if (url.pathname === "/orders/envios-seur-correos" && request.method === "POST") {
      const { cambios } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      let n = 0;
      for (const c of cambios || []) {
        const order = orders[c.orderId];
        if (!order || !c.ref) continue;
        const info = (order.enviosSeurInfo = order.enviosSeurInfo || {});
        const e = (info[c.ref] = info[c.ref] || {});
        e.correo = { ...(e.correo || {}), ...c.correo };
        if (c.reclamado && !e.reclamado) { e.reclamado = true; e.fechaReclamado = new Date().toISOString(); }
        n++;
      }
      if (n) { await this.state.storage.put("orders", orders); this.broadcast(); }
      return Response.json({ ok: true, n });
    }

    // Foto de las líneas enviadas de una carga de SEUR al cerrarla, para la
    // lista "Envíos SEUR" (los artículos pasan luego a "servido").
    if (url.pathname === "/cargas/seur/envios-guardar" && request.method === "POST") {
      const { cargaId, envios } = await request.json();
      const cargas = (await this.state.storage.get("cargas")) || [];
      const carga = cargas.find((c) => c.id === cargaId && c.tipo === "seur");
      if (!carga) return new Response("not found", { status: 404 });
      carga.envios = envios || [];
      await this.state.storage.put("cargas", cargas);
      return Response.json({ ok: true });
    }

    if (url.pathname === "/orders/casos-revisar/nota" && request.method === "POST") {
      const { orderId, tipo, key, nota } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const order = orders[orderId];
      if (!order) return new Response("not found", { status: 404 });
      const campo = tipo === "seur" ? "seurTracking" : "furnitureTracking";
      const claveCampo = tipo === "seur" ? "localizador" : "albaran";
      const tracking = order[campo] || [];
      const entry = tracking.find((t) => t[claveCampo] === key);
      if (!entry) return new Response("not found", { status: 404 });
      entry.nota = nota;
      orders[orderId] = order;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return new Response("ok");
    }

    // "Casos a revisar" de SEUR (Jennifer, 2026-09-16), reglas dictadas
    // turno a turno — algunas inmediatas por el estado exacto, otras con
    // margen de días:
    // 1) "El envío está retenido. pendiente de recibir instrucciones para
    //    poder realizar la entrega." — inmediato.
    // 2) "El envío se está devolviendo a origen." — inmediato.
    // 3) "El envío ha sido registrado." + 3 días naturales desde
    //    "FECHA CREACION" (columna D del Excel — el día en que Jennifer
    //    crea el envío en SEUR, normalmente un día antes de que lo
    //    recojan; corregido de 2 a 3 días y de "fecha de la carga" a esta
    //    fecha real de SEUR, 2026-09-16).
    // 4) "El envío está disponible para recoger en el punto seur pickup."
    //    — inmediato.
    // 5) "Los datos del envío han sido modificados y se entregará en un
    //    punto seur pickup." — inmediato.
    // 6) 3+ días naturales sin cambiar de estado (fechaSituacion, la que da
    //    el propio SEUR) y no está entregado — para detectar que no avanza.
    //    Regla aparte de la 3, no la sustituye (confirmado por Jennifer).
    // 7) "El envío se ha anulado por estar duplicado o no haber sido
    //    recibido por seur." — inmediato.
    // 8) "Envío devuelto" — inmediato.
    // Equivalencia: "El destinatario ha retirado el envío de la tienda seur
    // pickup seleccionada." cuenta como entregado en todo lo demás (no
    // dispara la regla 6).
    if (url.pathname === "/casos-revisar-seur" && request.method === "GET") {
      const orders = (await this.state.storage.get("orders")) || {};
      const hoy = new Date();
      const hoyUTC = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
      // fechaSituacion/fechaCreacion se guardan ya formateadas "dd/mm/aaaa" (es-ES, ver
      // excelSerialToFecha en el frontend).
      function diasNaturalesDesdeSeur(str) {
        const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((str || "").trim());
        if (!m) return null;
        const dUTC = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        return Math.floor((hoyUTC - dUTC) / 86400000);
      }
      const esEntregado = (estado) => (/ENTREGAD|entrega efectuada|retirado el envío/i.test(estado || "") && !/NO ENTREGAD|SERÁ ENTREGAD|SERA ENTREGAD|NO SE HA ENTREGAD|NO HA PODIDO|NO SE HA PODIDO/i.test(estado || ""));
      const ESTADOS_INMEDIATOS = [
        "El envío está retenido. pendiente de recibir instrucciones para poder realizar la entrega.",
        "El envío se está devolviendo a origen.",
        "El envío está disponible para recoger en el punto seur pickup.",
        "Los datos del envío han sido modificados y se entregará en un punto seur pickup.",
        "El envío se ha anulado por estar duplicado o no haber sido recibido por seur.",
        "Envío devuelto",
      ];
      const casos = [];
      for (const order of Object.values(orders)) {
        if (order.cancelado) continue;
        for (const t of order.seurTracking || []) {
          if (t.anulado) continue; // envío que no llegó a salir ("No ha salido")
          const motivos = [];
          const estadoNorm = (t.estado || "").trim();
          if (ESTADOS_INMEDIATOS.some((e) => e.toLowerCase() === estadoNorm.toLowerCase())) {
            motivos.push(estadoNorm);
          }
          if (estadoNorm.toLowerCase() === "el envío ha sido registrado.") {
            const dias = diasNaturalesDesdeSeur(t.fechaCreacion);
            if (dias !== null && dias >= 3) {
              motivos.push(`Registrado hace ${dias} días sin avanzar`);
            }
          }
          if (!esEntregado(estadoNorm)) {
            const dias = diasNaturalesDesdeSeur(t.fechaSituacion);
            if (dias !== null && dias >= 3) {
              motivos.push(`${dias} días en el mismo estado sin avanzar`);
            }
          }
          if (motivos.length) {
            casos.push({
              tipo: "seur", orderId: order.id, orderNumber: order.orderNumber, name: order.name,
              platform: order.platform, orderRef: order.orderRef,
              key: t.localizador, referencia: t.referencia, estado: t.estado, fechaSituacion: t.fechaSituacion,
              seguimiento: t.seguimiento, motivos, nota: t.nota || "",
            });
          }
        }
      }
      return Response.json(casos);
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

  async processInventory(order, force, seurSplitDecision) {
    // Pedido visto sin pagar (Jennifer, 2026-09-28, caso BEZEN12205:
    // transferencia de un pedido del 16/09 recibida el 28/09): cuando pase a
    // PAGADO se tramita como si hubiera entrado ese día, para que no se
    // cuele entre lo ya pedido a fábrica con su fecha antigua.
    // pagoConfirmadoManual: Jennifer confirmó el pago a mano desde la app
    // (transferencia recibida sin marcar aún en Shopify) — cuenta como pagado.
    const pagado = order.paymentStatus === "PAGADO" || !!order.pagoConfirmadoManual;
    if (!pagado) order.vistoSinPagar = true;
    // Pedidos de TikTok Shop (Jennifer, 2026-10-28: "literalmente no quiero
    // que se tramite ningún pedido de TikTok, pero tener los datos nos ayuda
    // para contactar con el cliente y que lo compre por nuestra web"): nunca
    // se tramitan solos. Se quedan con sus datos y un seguimiento del
    // contacto (tiktokRevision). Solo `force` (acción a mano) los procesa.
    if (!force && order.paymentMethod === "TIKTOK_SHOP") {
      if (!order.tiktokRetenido) order.tiktokRetenido = new Date().toISOString();
      return;
    }
    // Ver SHOPIFY_PROCESAMIENTO_DESDE arriba del fichero — solo aplica a
    // Shopify (los marketplaces ya tienen su propia puerta, PROCESAMIENTO_
    // DESDE en index.js, con otro esquema de numeración). Un pedido antiguo
    // SIN PAGAR no se da por gestionado (antes sí, y al pagarse ya no se
    // tramitaba nunca); si se paga más tarde, se tramita con fecha de ese día.
    if (!force && order.platform === "Shopify" && Number(order.orderNumber) < SHOPIFY_PROCESAMIENTO_DESDE) {
      if (!pagado) return;
      if (!order.vistoSinPagar) {
        order.inventoryProcessed = true;
        return;
      }
    }
    let fechaParaTramitar = order.orderDate;
    if (pagado && order.vistoSinPagar) {
      if (!order.fechaTramitacion) order.fechaTramitacion = new Date().toISOString();
      fechaParaTramitar = order.fechaTramitacion;
    }
    const id = this.env.INVENTORY_STORE.idFromName("main");
    const stub = this.env.INVENTORY_STORE.get(id);
    const res = await stub.fetch("https://do/process-sale", {
      method: "POST",
      body: JSON.stringify({ orderId: order.id, orderNumber: order.orderNumber, platform: order.platform, orderRef: order.orderRef, items: itemsConCambioMedida(order), force, orderDate: fechaParaTramitar, services: order.services || "", paymentStatus: pagado ? "PAGADO" : order.paymentStatus, seurSplitDecision, agenciaForzada: order.grupoEnvio ? "FURNITURE" : undefined }),
    });
    const { agencia, pendingManufacture, needsReview, reviewReasons, paused, seurMixedPending, seurMixedInfo, seurReady } = await res.json();
    // Pedido de 2+ colchones SEUR con disponibilidad mixta (Jennifer,
    // 2026-09-08): se para sin marcar inventoryProcessed (se reintenta solo
    // en el próximo sync/webhook, por si con el tiempo queda todo cubierto)
    // hasta que ella decida dividir desde /orders/seur-dividir.
    if (seurMixedPending) {
      order.seurMixedPending = true;
      order.seurMixedInfo = seurMixedInfo;
      return;
    }
    order.seurMixedPending = false;
    order.seurMixedInfo = null;
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
    // Color cambiado antes de tramitar (Jennifer, 2026-10-20): se aplica
    // ahora a la tapicería recién creada en Proveedores.
    const cc = order.cambioColor;
    if (cc && !cc.aplicado) {
      await stub.fetch("https://do/backorders/cambiar-color", {
        method: "POST",
        body: JSON.stringify({ orderId: order.id, todos: true, colorFurniture: cc.a || "", colorFabrica: cc.fabrica || "", porArticulo: cc.porArticulo || null, services: order.services || "", usuario: cc.usuario || null }),
      }).catch(() => null);
      cc.aplicado = new Date().toISOString();
    }
    if (agencia === "FURNITURE") await this.reservarStockCubierto(order);
    if (agencia === "FURNITURE") await this.autoCargaFurnitureDeStock(order);
    // Carga automática de SEUR (Jennifer, 2026-09-08): en cuanto hay algo
    // de este pedido con stock real disponible, se prepara solo para la
    // próxima carga — sin que nadie tenga que seleccionarlo a mano, a
    // diferencia de Furniture. Corte a las 15:00 (ver nextSeurCargaDate).
    if (seurReady && !order.cargaId) {
      const carga = await getOrCreateCargaByFecha(this.state.storage, "seur", nextSeurCargaDate(new Date()));
      order.cargaId = carga.id;
    }
  }

  // Reserva automática (Jennifer, 2026-09-28, caso BEZEN12235 con un topper
  // V5 de stock): lo que el motor cubre con stock real en un pedido que sale
  // por Furniture se queda físicamente en el almacén hasta la carga, así que
  // el almacén tiene que apartarlo — email con una etiqueta por unidad. Solo
  // los pendientes "-cubierto" que crea el propio motor, una vez cada uno.
  // Si el email falla no se bloquea nada: queda sin reservaEnviada.
  async reservarStockCubierto(order) {
    try {
      const stub = this.env.INVENTORY_STORE.get(this.env.INVENTORY_STORE.idFromName("main"));
      const backorders = await (await stub.fetch("https://do/backorders")).json();
      const cubiertos = backorders.filter((b) => String(b.orderId) === String(order.id)
        && b.estado === "cubierto" && String(b.id).endsWith("-cubierto")
        && !b.reservaEnviada && !b.reposicion && !b.gestoComercial);
      if (!cubiertos.length) return;
      const r = await enviarReservaAlmacen(this.env, {
        pedido: referenciaPedidoAlmacen(order),
        cliente: order.name || "",
        lineasTexto: cubiertos.map(lineaTextoReserva),
        bultos: cubiertos.flatMap(bultosPorUnidad),
      });
      if (!r.ok) return;
      for (const b of cubiertos) {
        await stub.fetch("https://do/backorders/" + encodeURIComponent(b.id) + "/reserva-enviada", { method: "POST", body: "{}" });
      }
    } catch (e) {
      // el aviso nunca debe romper la tramitación del pedido
    }
  }

  // Pedido de Furniture que sale todo del stock (Jennifer, 2026-10-23,
  // BEZEN12350: "está descontado del stock y no lo has metido en la carga"):
  // nunca pasa por "Marcar recibido", así que entra aquí en la próxima carga
  // de Furniture abierta. Con notas, retenido, envío conjunto, CP de montaña
  // o para revisar se deja a mano (misma regla que la subida automática).
  async autoCargaFurnitureDeStock(order, { soloLiquidacion = false } = {}) {
    try {
      // soloLiquidacion: la campana ya está contestada; solo entra si lleva
      // tapicería de liquidación (referencia STOCK que pone el motor).
      if (order.cargaId || pedidoCancelado(order) || order.recogeCliente || order.retenido || order.grupoEnvio || order.notas || (order.needsReview && !soloLiquidacion) || montanaPendiente(order)) return;
      const stub = this.env.INVENTORY_STORE.get(this.env.INVENTORY_STORE.idFromName("main"));
      const backorders = await (await stub.fetch("https://do/backorders")).json();
      const items = backorders.filter((b) => String(b.orderId) === String(order.id) && !b.reposicion && !b.gestoComercial
        && (b.estado === "pendiente" || b.estado === "cubierto") && !(b.tipo === "colchon" && b.tipoEnvio === "FPK"));
      if (!items.length || !items.every((b) => b.recibidoFabrica)) return;
      if (soloLiquidacion && !items.some((b) => /^LIQUIDACI[OÓ]N/i.test(b.mercanciaFabrica || ""))) return;
      const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
      const cargas = (await this.state.storage.get("cargas")) || [];
      const proxima = cargas.filter((c) => (c.tipo || "furniture") === "furniture" && c.estado === "abierta" && c.fecha > hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
      if (proxima) order.cargaId = proxima.id;
    } catch (e) {
      // nunca debe romper la tramitación del pedido
    }
  }

  // Colchones pendientes de los pedidos de un envío conjunto: FUR al juntar
  // (salen con la tapicería por Furniture), FPK al separar (vuelven a SEUR).
  async planColchonesDelGrupo(orderIds, tipoEnvio) {
    const stub = this.env.INVENTORY_STORE.get(this.env.INVENTORY_STORE.idFromName("main"));
    const backorders = await (await stub.fetch("https://do/backorders")).json();
    const ids = new Set(orderIds);
    for (const b of backorders) {
      if (!ids.has(b.orderId) || b.tipo !== "colchon" || b.reposicion || b.gestoComercial) continue;
      if (b.estado !== "pendiente" && b.estado !== "cubierto") continue;
      if (b.tipoEnvio === tipoEnvio) continue;
      await stub.fetch("https://do/backorders/" + encodeURIComponent(b.id) + "/plan", {
        method: "POST",
        body: JSON.stringify({ tipoEnvio }),
      });
    }
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

  // furniturePendiente (Jennifer, 2026-10-14, BEZEN12259): pack con el
  // colchón por SEUR y el resto por Furniture. La etiqueta de SEUR marca el
  // pack entero como enviado en Shopify (es una sola línea), pero lo que va
  // por Furniture no ha salido hasta que hay seguimiento de Furniture o su
  // carga se cierra — eso no se puede dar por servido todavía.
  // BEZEN12260 (Jennifer, 2026-10-14): un albarán de Furniture en
  // "PENDIENTE DE RECEPCION" no es que haya salido — Furniture aún no tiene
  // la mercancía (la carga es el viernes). Solo cuenta un seguimiento con
  // otro estado o con fecha de almacén, o la carga ya cerrada. Y en un
  // pedido de Furniture nunca se da por enviado lo que no ha llegado del
  // proveedor (el colchón FPK de LUSO).
  async settleShipment(orderId) {
    const orders = (await this.state.storage.get("orders")) || {};
    const o = orders[orderId];
    let furniturePendiente = false;
    const esFurniture = !!(o && o.agencia === "FURNITURE" && !o.entregadoCliente);
    if (esFurniture) {
      const cargas = (await this.state.storage.get("cargas")) || [];
      const carga = o.cargaId && cargas.find((c) => c.id === o.cargaId);
      const recibidoPorFurniture = (o.furnitureTracking || []).some((t) => t.fechaAlmacen || (t.estado && String(t.estado).toUpperCase() !== "PENDIENTE DE RECEPCION"));
      const salioPorFurniture = recibidoPorFurniture || !!(carga && (carga.tipo || "furniture") === "furniture" && carga.estado === "cerrada");
      furniturePendiente = !salioPorFurniture;
    }
    const id = this.env.INVENTORY_STORE.idFromName("main");
    const stub = this.env.INVENTORY_STORE.get(id);
    await stub.fetch("https://do/settle-shipment", {
      method: "POST",
      body: JSON.stringify({ orderId, furniturePendiente, esFurniture }),
    });
  }

  async bovedaRoute(url, request) {
    const st = this.state.storage;
    const cfg = await st.get("boveda");
    const json = (o, status) => Response.json(o, { status: status || 200 });
    const okB64 = (s, max) => typeof s === "string" && s.length > 0 && s.length <= max && /^[A-Za-z0-9+/=]+$/.test(s);
    const sha = async (b64) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      let s = "";
      for (const b of h) s += String.fromCharCode(b);
      return btoa(s);
    };
    const iguales = (a, b) => {
      if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
      let d = 0;
      for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
      return d === 0;
    };
    // Comprueba la clave de acceso con bloqueo: 10 fallos → 15 min.
    const autorizar = async (auth) => {
      if (!cfg) return json({ ok: false, error: "El directorio todavía no está creado." }, 404);
      const f = (await st.get("bovedaFallos")) || { n: 0, hasta: 0 };
      if (f.hasta && Date.now() < f.hasta) {
        return json({ ok: false, bloqueado: true, error: "Demasiados intentos fallidos. Prueba de nuevo dentro de " + Math.ceil((f.hasta - Date.now()) / 60000) + " min." }, 429);
      }
      if (!okB64(auth, 100) || !iguales(await sha(auth), cfg.authHash)) {
        f.n = (f.n || 0) + 1;
        if (f.n >= 10) { f.hasta = Date.now() + 15 * 60000; f.n = 0; }
        await st.put("bovedaFallos", f);
        return json({ ok: false, error: "Contraseña maestra incorrecta." }, 401);
      }
      if (f.n || f.hasta) await st.put("bovedaFallos", { n: 0, hasta: 0 });
      return null;
    };
    const entradaValida = (e) => e && okB64(e.iv, 40) && okB64(e.ct, 200000);

    // Público: solo si existe y los parámetros para derivar (la sal no es secreta).
    if (url.pathname === "/boveda/info" && request.method === "GET") {
      return json(cfg ? { existe: true, salt: cfg.salt, iter: cfg.iter } : { existe: false });
    }
    if (request.method !== "POST") return json({ ok: false, error: "Método no permitido." }, 405);
    const body = await request.json().catch(() => ({}));

    if (url.pathname === "/boveda/crear") {
      if (cfg) return json({ ok: false, error: "El directorio ya existe." }, 409);
      const iter = Number(body.iter);
      if (!okB64(body.salt, 64) || !okB64(body.authHash, 100) || !(iter >= 100000 && iter <= 5000000)) {
        return json({ ok: false, error: "Datos no válidos." }, 400);
      }
      await st.put("boveda", { salt: body.salt, iter, authHash: body.authHash, creado: new Date().toISOString(), creadoPor: body.usuario || null });
      await st.put("bovedaEntradas", []);
      return json({ ok: true });
    }

    const denegado = await autorizar(body.auth);
    if (denegado) return denegado;
    const entradas = (await st.get("bovedaEntradas")) || [];

    if (url.pathname === "/boveda/abrir") {
      return json({ ok: true, entradas });
    }
    if (url.pathname === "/boveda/guardar") {
      if (!entradaValida(body)) return json({ ok: false, error: "Datos no válidos." }, 400);
      const ahora = new Date().toISOString();
      let e = body.id ? entradas.find((x) => x.id === body.id) : null;
      if (body.id && !e) return json({ ok: false, error: "Entrada no encontrada." }, 404);
      if (!e) {
        e = { id: crypto.randomUUID(), creado: ahora };
        entradas.push(e);
      }
      e.iv = body.iv;
      e.ct = body.ct;
      e.actualizado = ahora;
      e.por = body.usuario || null;
      await st.put("bovedaEntradas", entradas);
      return json({ ok: true, entrada: e });
    }
    if (url.pathname === "/boveda/borrar") {
      await st.put("bovedaEntradas", entradas.filter((x) => x.id !== body.id));
      return json({ ok: true });
    }
    // Cambiar la contraseña maestra: el navegador vuelve a cifrar todo con la
    // nueva y lo sustituimos de golpe (mismos ids, ninguna entrada perdida).
    if (url.pathname === "/boveda/cambiar") {
      const n = body.nuevo || {};
      const iter = Number(n.iter);
      const nuevas = Array.isArray(body.entradas) ? body.entradas : null;
      if (!okB64(n.salt, 64) || !okB64(n.authHash, 100) || !(iter >= 100000 && iter <= 5000000) || !nuevas) {
        return json({ ok: false, error: "Datos no válidos." }, 400);
      }
      const porId = new Map(nuevas.map((x) => [x.id, x]));
      if (porId.size !== entradas.length || entradas.some((x) => !entradaValida(porId.get(x.id)))) {
        return json({ ok: false, error: "Faltan entradas por volver a cifrar; no se ha cambiado nada." }, 409);
      }
      for (const e of entradas) { const x = porId.get(e.id); e.iv = x.iv; e.ct = x.ct; }
      await st.put("bovedaEntradas", entradas);
      await st.put("boveda", { ...cfg, salt: n.salt, iter, authHash: n.authHash, cambiado: new Date().toISOString(), cambiadoPor: body.usuario || null });
      return json({ ok: true });
    }
    return json({ ok: false, error: "Ruta no encontrada." }, 404);
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
