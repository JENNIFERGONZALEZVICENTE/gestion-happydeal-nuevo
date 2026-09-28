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
const PRESERVED_FIELDS = ["colorTag", "observaciones", "notas", "agencia", "pendingManufacture", "needsReview", "inventoryProcessed", "reviewReasons", "reviewAnswers", "cargaId", "cancelado", "paraTenerEnCuenta", "furnitureTracking", "seurTracking", "shopifyFulfilled", "shopifyFulfillmentId", "gestionadoExterno", "vistoSinPagar", "fechaTramitacion", "pagoConfirmadoManual"];

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
function skipWeekend(d) {
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
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
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (choice === "manana") d.setDate(d.getDate() + 1);
  return skipWeekend(d);
}

async function getOrCreateCargaByFecha(storage, tipo, dateObj) {
  const cargas = (await storage.get("cargas")) || [];
  const fecha = cargaFechaKey(dateObj);
  let carga = cargas.find((c) => (c.tipo || "furniture") === tipo && c.fecha === fecha && c.estado === "abierta");
  if (!carga) {
    carga = {
      id: crypto.randomUUID(),
      tipo,
      fecha,
      dia: DIAS_SEMANA[dateObj.getDay()],
      estado: "abierta",
      fechaCreacion: new Date().toISOString(),
      fechaCierre: null,
    };
    cargas.push(carga);
    await storage.put("cargas", cargas);
  }
  return carga;
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
      for (const order of incoming) {
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
        if (esNotaSergio(order) && !merged.shopifyFulfilled) notasParaFulfillar.push(order.id);
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, notasParaFulfillar });
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

    if (url.pathname === "/orders/meta" && request.method === "POST") {
      const { id, colorTag, observaciones, notas, cancelado, paraTenerEnCuenta, needsReview } = await request.json();
      const orders = (await this.state.storage.get("orders")) || {};
      const existing = orders[id];
      if (!existing) return new Response("not found", { status: 404 });
      if (colorTag !== undefined) existing.colorTag = colorTag || null;
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
      await this.releaseInventoryDecision(existing.id, !allAnswered);
      this.broadcast();
      return new Response("ok");
    }

    // Cargas de Furniture (Jennifer, 2026-08-26): agrupan pedidos que van a
    // salir por esa agencia en la próxima carga (miércoles o viernes). Solo
    // hay una carga "abierta" a la vez — se crea sola con la fecha del
    // próximo miércoles/viernes la primera vez que se añade algo, y se
    // reutiliza hasta que Jennifer la cierra a mano.
    if (url.pathname === "/cargas" && request.method === "GET") {
      const cargas = (await this.state.storage.get("cargas")) || [];
      return Response.json(cargas);
    }

    if (url.pathname === "/cargas/add" && request.method === "POST") {
      const { orderIds } = await request.json();
      const cargas = (await this.state.storage.get("cargas")) || [];
      let abierta = cargas.find((c) => (c.tipo || "furniture") === "furniture" && c.estado === "abierta");
      if (!abierta) {
        const fecha = nextCargaDate(new Date());
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
      for (const id of orderIds || []) {
        const order = orders[id];
        if (!order || order.cargaId) continue;
        order.cargaId = abierta.id;
        añadidos++;
      }
      await this.state.storage.put("orders", orders);
      await this.state.storage.put("cargas", cargas);
      this.broadcast();
      return Response.json({ ok: true, carga: abierta, añadidos });
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

    if (url.pathname === "/cargas/close" && request.method === "POST") {
      const { cargaId } = await request.json();
      const cargas = (await this.state.storage.get("cargas")) || [];
      const carga = cargas.find((c) => c.id === cargaId);
      if (!carga) return new Response("not found", { status: 404 });
      carga.estado = "cerrada";
      carga.fechaCierre = new Date().toISOString();
      await this.state.storage.put("cargas", cargas);
      this.broadcast();
      return Response.json({ ok: true, carga });
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
      for (const e of entries || []) {
        const order = byOrderNumber.get(e.orderNumber);
        if (!order) { sinPedido++; continue; }
        const tracking = order.furnitureTracking || [];
        const idx = tracking.findIndex((t) => t.albaran === e.albaran);
        const esNuevo = idx < 0;
        const nuevaEntrada = {
          albaran: e.albaran, estado: e.estado, fechaAlmacen: e.fechaAlmacen,
          fechaPrevista: e.fechaPrevista, seguimiento: e.seguimiento, tipo: e.tipo,
          // La nota de seguimiento de "Casos a revisar" es manual, no viene
          // del fichero — se conserva al actualizar (Jennifer, 2026-09-16).
          nota: idx >= 0 ? tracking[idx].nota : undefined,
        };
        if (idx >= 0) tracking[idx] = nuevaEntrada;
        else tracking.push(nuevaEntrada);
        order.furnitureTracking = tracking;
        pedidosTocados.add(e.orderNumber);
        if (
          esNuevo && order.platform === "Shopify" &&
          !order.cancelado && order.shippingStatus !== "cancelado" &&
          order.paymentStatus === "PAGADO" && e.seguimiento
        ) {
          paraShopify.push({
            orderId: order.id, orderNumber: e.orderNumber, trackingNumber: e.albaran, trackingUrl: e.seguimiento, company: "FURNITURE",
            primerEnvio: !order.shopifyFulfilled, fulfillmentId: order.shopifyFulfillmentId || null,
          });
        }
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, actualizados: pedidosTocados.size, sinPedido, paraShopify });
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
        };
        if (idx >= 0) tracking[idx] = nuevaEntrada;
        else tracking.push(nuevaEntrada);
        order.seurTracking = tracking;
        pedidosTocados.add(e.orderNumber);
        actualizadosDetalle.push({ orderNumber: e.orderNumber, referencia: e.referencia, nombre: order.name || "", estadoSeur: e.estado, nuevo: esNuevo });
        if (
          esNuevo && order.platform === "Shopify" &&
          !order.cancelado && order.shippingStatus !== "cancelado" &&
          order.paymentStatus === "PAGADO" && e.seguimiento
        ) {
          const numero = (e.seguimiento.split("tracking=")[1] || e.numeroExpedicion || "").trim();
          paraShopify.push({
            orderId: order.id, orderNumber: e.orderNumber, trackingNumber: numero, trackingUrl: e.seguimiento, company: "SEUR",
            primerEnvio: !order.shopifyFulfilled, fulfillmentId: order.shopifyFulfillmentId || null,
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
      const esEntregado = (estado) => /ENTREGAD/i.test(estado || "") || /retirado el envío/i.test(estado || "");
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
      body: JSON.stringify({ orderId: order.id, orderNumber: order.orderNumber, platform: order.platform, orderRef: order.orderRef, items: order.items || [], force, orderDate: fechaParaTramitar, services: order.services || "", paymentStatus: pagado ? "PAGADO" : order.paymentStatus, seurSplitDecision }),
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
    // Carga automática de SEUR (Jennifer, 2026-09-08): en cuanto hay algo
    // de este pedido con stock real disponible, se prepara solo para la
    // próxima carga — sin que nadie tenga que seleccionarlo a mano, a
    // diferencia de Furniture. Corte a las 15:00 (ver nextSeurCargaDate).
    if (seurReady && !order.cargaId) {
      const carga = await getOrCreateCargaByFecha(this.state.storage, "seur", nextSeurCargaDate(new Date()));
      order.cargaId = carga.id;
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

  async settleShipment(orderId) {
    const id = this.env.INVENTORY_STORE.idFromName("main");
    const stub = this.env.INVENTORY_STORE.get(id);
    await stub.fetch("https://do/settle-shipment", {
      method: "POST",
      body: JSON.stringify({ orderId }),
    });
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
