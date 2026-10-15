var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/etiqueta-pdf.js
var MM = 72 / 25.4;
var NL = String.fromCharCode(10);
var ANCHO = 150 * MM;
var ALTO = 100 * MM;
function anchoTexto(texto, tam, negrita = true) {
  let total = 0;
  for (const c of texto) {
    if ("il.,:;|!'".includes(c)) total += 280;
    else if ("mwMW".includes(c)) total += 890;
    else if (c === " ") total += 280;
    else if (c >= "A" && c <= "Z") total += 722;
    else if (c >= "0" && c <= "9") total += 556;
    else total += 611;
  }
  return total / 1e3 * tam * (negrita ? 1 : 0.9);
}
__name(anchoTexto, "anchoTexto");
function partirLineas(texto, tam, maxAncho, negrita) {
  const palabras = String(texto || "").split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? actual + " " + p : p;
    if (anchoTexto(prueba, tam, negrita) <= maxAncho || !actual) actual = prueba;
    else {
      lineas.push(actual);
      actual = p;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}
__name(partirLineas, "partirLineas");
function cadenaPdf(texto) {
  let out = "";
  for (const c of String(texto)) {
    const code = c.charCodeAt(0);
    if (c === "(" || c === ")" || c === "\\") out += "\\" + c;
    else if (code < 128) out += c;
    else if (code <= 255) out += "\\" + code.toString(8).padStart(3, "0");
    else if (c === "\u2014" || c === "\u2013") out += "-";
    else if (c === "\u2192") out += "->";
    else out += "?";
  }
  return "(" + out + ")";
}
__name(cadenaPdf, "cadenaPdf");
function lienzo() {
  const margen = 8 * MM;
  const util = ANCHO - 2 * margen;
  const ops = ["1.5 w", `${margen / 2} ${margen / 2} ${ANCHO - margen} ${ALTO - margen} re S`];
  const c = { ops, y: ALTO - margen - 4 };
  c.linea = (texto, tam, negrita = true) => {
    const fuente = negrita ? "/F2" : "/F1";
    for (const l of partirLineas(texto, tam, util, negrita)) {
      c.y -= tam * 0.74;
      const x = (ANCHO - anchoTexto(l, tam, negrita)) / 2;
      ops.push(`BT ${fuente} ${tam} Tf ${x.toFixed(1)} ${c.y.toFixed(1)} Td ${cadenaPdf(l)} Tj ET`);
      c.y -= tam * 0.38;
    }
  };
  c.separador = () => {
    c.y -= 5;
    ops.push("0.6 w", `${margen} ${c.y.toFixed(1)} m ${ANCHO - margen} ${c.y.toFixed(1)} l S`);
    c.y -= 9;
  };
  c.pie = (texto) => {
    c.y = margen + 16;
    c.linea(texto, 11, false);
  };
  return c;
}
__name(lienzo, "lienzo");
function paginaTransformacion(datos) {
  const c = lienzo();
  c.linea("TRANSFORMACI\xD3N DE COLCH\xD3N", 15);
  c.separador();
  c.linea(datos.pedido, 32);
  if (datos.cliente) c.linea(datos.cliente, 13, false);
  c.separador();
  c.linea(String(datos.modelo || "").toUpperCase(), 22);
  c.y -= 6;
  c.linea(`DE ${datos.desde}  A  ${datos.hasta}`, 30);
  if ((datos.unidades || 1) > 1) c.linea(`${datos.unidades} UNIDADES`, 18);
  c.pie(`${datos.fecha || ""}   \xB7   Sale por FURNITURE`);
  return c.ops.join("\n");
}
__name(paginaTransformacion, "paginaTransformacion");
function paginaReserva(datos) {
  const c = lienzo();
  c.linea("RESERVADO", 30);
  c.separador();
  c.linea(datos.pedido, 28);
  if (datos.cliente) c.linea(datos.cliente, 13, false);
  c.separador();
  c.linea(String(datos.articulo || "").toUpperCase(), 17);
  if (datos.parte) {
    c.y -= 4;
    c.linea(String(datos.parte).toUpperCase(), 22);
  }
  if (datos.totalBultos > 1) {
    c.y -= 2;
    c.linea(`BULTO ${datos.bulto} DE ${datos.totalBultos}`, 14);
  }
  c.pie(`${datos.fecha || ""}   \xB7   Sale por FURNITURE`);
  return c.ops.join("\n");
}
__name(paginaReserva, "paginaReserva");
function paginasResumenSeur(resumen) {
  const MARGEN = 8 * MM;
  const HUECO = 10;
  const COL = (ANCHO - 2 * MARGEN - 8 - HUECO) / 2;
  const TAM = 10;
  const SALTO = 12.5;
  const ARRIBA = ALTO - MARGEN - 4 - 14 * 0.74 - 7 - SALTO - 1;
  const paginas = [];
  let ops, y, col = 0, num = 0;
  const nueva = /* @__PURE__ */ __name(() => {
    num++;
    col = 0;
    ops = ["1.5 w", `${MARGEN / 2} ${MARGEN / 2} ${ANCHO - MARGEN} ${ALTO - MARGEN} re S`];
    paginas.push(ops);
    const yCab = ALTO - MARGEN - 4 - 14 * 0.74;
    const cab = resumen.titulo + (num > 1 ? "  (sigue)" : "");
    ops.push(`BT /F2 14 Tf ${((ANCHO - anchoTexto(cab, 14)) / 2).toFixed(1)} ${yCab.toFixed(1)} Td ${cadenaPdf(cab)} Tj ET`);
    ops.push("0.6 w", `${MARGEN} ${(yCab - 7).toFixed(1)} m ${ANCHO - MARGEN} ${(yCab - 7).toFixed(1)} l S`);
    y = ARRIBA;
  }, "nueva");
  nueva();
  for (const r of resumen.lineas) {
    const partes = partirLineas(`${r.cantidad > 1 ? r.cantidad : 1} x ${r.producto}`, TAM, COL - 8, true);
    if (y - (partes.length - 1) * SALTO < MARGEN + 2) {
      if (col === 0) {
        col = 1;
        y = ARRIBA;
      } else nueva();
    }
    const x = MARGEN + 4 + col * (COL + HUECO);
    partes.forEach((l, i) => {
      ops.push(`BT /F2 ${TAM} Tf ${(x + (i ? 8 : 0)).toFixed(1)} ${y.toFixed(1)} Td ${cadenaPdf(l)} Tj ET`);
      y -= SALTO;
    });
  }
  return paginas.map((pg) => pg.join(NL));
}
__name(paginasResumenSeur, "paginasResumenSeur");
function resumenSeurPdf(resumen) {
  return pdfDePaginas(paginasResumenSeur(resumen));
}
__name(resumenSeurPdf, "resumenSeurPdf");
function pdfDePaginas(contenidos) {
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    null,
    // Pages: se rellena al final, cuando se conocen los números de página
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
  ];
  const kids = [];
  for (const contenido of contenidos) {
    objetos.push(`<< /Length ${contenido.length} >>
stream
${contenido}
endstream`);
    const idContenido = objetos.length;
    objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO.toFixed(2)} ${ALTO.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idContenido} 0 R >>`);
    kids.push(`${objetos.length} 0 R`);
  }
  objetos[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objetos.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj
${obj}
endobj
`;
  });
  const xref = pdf.length;
  pdf += `xref
0 ${objetos.length + 1}
0000000000 65535 f 
`;
  for (const off of offsets) pdf += String(off).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer
<< /Size ${objetos.length + 1} /Root 1 0 R >>
startxref
${xref}
%%EOF`;
  return new TextEncoder().encode(pdf);
}
__name(pdfDePaginas, "pdfDePaginas");
function etiquetaTransformacionPdf(datos) {
  return pdfDePaginas([paginaTransformacion(datos)]);
}
__name(etiquetaTransformacionPdf, "etiquetaTransformacionPdf");
function etiquetasReservaPdf(etiquetas) {
  return pdfDePaginas(etiquetas.map(paginaReserva));
}
__name(etiquetasReservaPdf, "etiquetasReservaPdf");
function base64DeBytes(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
__name(base64DeBytes, "base64DeBytes");

// src/avisos-almacen.js
async function llamarScriptSeur(env, accion, datos) {
  if (!env.ALMACEN_AVISO_URL || !env.ALMACEN_AVISO_SECRET) return { ok: false, error: "sin_configurar" };
  try {
    let res = await fetch(env.ALMACEN_AVISO_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      redirect: "manual",
      // Seguro: si el script de Google sigue siendo la versión antigua (solo
      // almacén), ese adjunto inválido le hace fallar ANTES de mandar nada,
      // así nunca le llega al almacén un correo pensado para SEUR. El
      // script nuevo ignora el adjunto en las acciones de SEUR.
      body: JSON.stringify({ secreto: env.ALMACEN_AVISO_SECRET, accion, ...datos, adjunto: { nombre: "x.pdf", base64: "%%%no-es-base64%%%" } })
    });
    const destino = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (destino) res = await fetch(destino);
    const r = await res.json().catch(() => null);
    if (!r) return { ok: false, error: "respuesta_no_json_status_" + res.status };
    if (r.ok && accion === "seur-enviar" && !r.threadId) return { ok: false, error: "script_sin_actualizar" };
    if (r.ok && accion === "seur-leer" && !r.hilos) return { ok: false, error: "script_sin_actualizar" };
    if (r.ok && accion === "recordatorio" && !r.recordatorio) return { ok: false, error: "script_sin_actualizar" };
    return r;
  } catch (e) {
    return { ok: false, error: "error_red" };
  }
}
__name(llamarScriptSeur, "llamarScriptSeur");
async function enviarEmailAlmacen(env, { asunto, texto, pdf, nombrePdf }) {
  if (!env.ALMACEN_AVISO_URL || !env.ALMACEN_AVISO_SECRET) return { ok: false, reason: "sin_configurar" };
  const cuerpo = { secreto: env.ALMACEN_AVISO_SECRET, asunto, texto };
  if (pdf) cuerpo.adjunto = { nombre: nombrePdf || "etiqueta.pdf", base64: base64DeBytes(pdf) };
  try {
    let res = await fetch(env.ALMACEN_AVISO_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      redirect: "manual",
      body: JSON.stringify(cuerpo)
    });
    const destino = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (destino) res = await fetch(destino);
    const r = await res.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, reason: r.error || "status_" + res.status };
  } catch (e) {
    return { ok: false, reason: "error_red" };
  }
}
__name(enviarEmailAlmacen, "enviarEmailAlmacen");
function fechaHoyEs() {
  return (/* @__PURE__ */ new Date()).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
}
__name(fechaHoyEs, "fechaHoyEs");
function referenciaPedidoAlmacen(x) {
  return x.platform && x.platform !== "Shopify" && x.orderRef ? x.orderRef : "BEZEN" + x.orderNumber;
}
__name(referenciaPedidoAlmacen, "referenciaPedidoAlmacen");
function modeloCorto(stockModel) {
  const partes = (stockModel || "").split("|").map((s) => s.trim()).filter(Boolean);
  return partes[partes.length - 1] || stockModel || "";
}
__name(modeloCorto, "modeloCorto");
var TIPO_ETIQUETA = { colchon: "Colch\xF3n", almohada: "Almohada", topper: "Topper", protector: "Protector" };
async function enviarReservaAlmacen(env, { pedido, cliente, lineasTexto, bultos, agencia, fechaSalida }) {
  const fecha = fechaHoyEs();
  const pdf = etiquetasReservaPdf(bultos.map((b, i) => ({
    pedido,
    cliente,
    articulo: b.articulo,
    parte: b.parte,
    bulto: i + 1,
    totalBultos: bultos.length,
    fecha
  })));
  const texto = [
    fechaSalida ? `Hay que RESERVAR en el almac\xE9n para este pedido: sale por ${agencia || "SEUR"} en la carga del ${fechaSalida.slice(8, 10)}/${fechaSalida.slice(5, 7)}/${fechaSalida.slice(0, 4)} (NO antes, el cliente no puede recibirlo hasta entonces).` : `Hay que RESERVAR en el almac\xE9n para este pedido (sale por ${agencia || "Furniture"}):`,
    "",
    ...lineasTexto.map((l) => "- " + l),
    "",
    `Pedido: ${pedido}${cliente ? " \u2014 " + cliente : ""}`,
    "",
    `Se adjuntan ${bultos.length} ${bultos.length === 1 ? "etiqueta" : "etiquetas"} (una por bulto) para pegar en cada parte.`
  ].join("\n");
  const sale = fechaSalida ? ` (sale el ${fechaSalida.slice(8, 10)}/${fechaSalida.slice(5, 7)})` : "";
  return enviarEmailAlmacen(env, { asunto: `Reserva de stock \u2014 ${pedido}${sale}`, texto, pdf, nombrePdf: `Reserva ${pedido}.pdf` });
}
__name(enviarReservaAlmacen, "enviarReservaAlmacen");
function bultosPorUnidad(b) {
  const modelo = modeloCorto(b.stockModel);
  const tipo = TIPO_ETIQUETA[b.tipo] || "";
  const conTipo = tipo && !modelo.toLowerCase().includes(tipo.toLowerCase().slice(0, 5)) ? tipo + " " : "";
  const articulo = `${conTipo}${modelo} ${b.talla || ""}`.replace(/\s+/g, " ").trim();
  const n = b.cantidad || 1;
  return Array.from({ length: n }, () => ({ articulo, parte: "" }));
}
__name(bultosPorUnidad, "bultosPorUnidad");
function lineaTextoReserva(b) {
  const n = b.cantidad || 1;
  return `${modeloCorto(b.stockModel)} ${b.talla || ""}${b.color ? " " + b.color : ""} \u2014 ${n} ${n > 1 ? "unidades" : "unidad"}`;
}
__name(lineaTextoReserva, "lineaTextoReserva");

// src/orders-store.js
var ORPHAN_RE = /BEZEN0*([0-9]+)/i;
var SHOPIFY_PROCESAMIENTO_DESDE = 12223;
function esNotaSergio(order) {
  if (order.platform !== "Shopify") return false;
  const match = !order.services && (order.product || "").match(ORPHAN_RE);
  return !!match && Number(match[1]) !== order.orderNumber;
}
__name(esNotaSergio, "esNotaSergio");
var PRESERVED_FIELDS = ["colorTag", "observaciones", "notas", "agencia", "pendingManufacture", "needsReview", "inventoryProcessed", "reviewReasons", "reviewAnswers", "cargaId", "cancelado", "paraTenerEnCuenta", "furnitureTracking", "seurTracking", "shopifyFulfilled", "shopifyFulfillmentId", "gestionadoExterno", "vistoSinPagar", "fechaTramitacion", "pagoConfirmadoManual", "grupoEnvio", "agenciaAntesDeGrupo", "agenciaAntesDeFurniture", "motivoFurniture", "noSalioSeur", "lineasCanceladas", "retenido", "tapiceriaEnviada", "enviosSeurInfo", "direccionManual", "direccionOriginal", "recogeCliente", "agenciaAntesDeRecogida", "entregadoCliente"];
var CAMPOS_DE_TRAMITACION = ["inventoryProcessed", "agencia", "pendingManufacture", "needsReview", "reviewReasons", "vistoSinPagar", "fechaTramitacion"];
var DIAS_CARGA = { 3: "MI\xC9RCOLES", 5: "VIERNES" };
function nextCargaDate(from) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  while (!(d.getDay() in DIAS_CARGA)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}
__name(nextCargaDate, "nextCargaDate");
function cargaFechaKey(d) {
  return d.toISOString().slice(0, 10);
}
__name(cargaFechaKey, "cargaFechaKey");
var DIAS_SEMANA = ["DOMINGO", "LUNES", "MARTES", "MI\xC9RCOLES", "JUEVES", "VIERNES", "S\xC1BADO"];
var FESTIVOS_SIN_CARGA = ["2026-10-12", "2026-11-09", "2026-12-07", "2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01"];
function esDiaSinCargaSeur(fecha) {
  const w = (/* @__PURE__ */ new Date(fecha + "T12:00:00Z")).getUTCDay();
  return w === 0 || w === 6 || FESTIVOS_SIN_CARGA.includes(fecha);
}
__name(esDiaSinCargaSeur, "esDiaSinCargaSeur");
function skipWeekend(d) {
  while (d.getDay() === 0 || d.getDay() === 6 || FESTIVOS_SIN_CARGA.includes(cargaFechaKey(d))) d.setDate(d.getDate() + 1);
  return d;
}
__name(skipWeekend, "skipWeekend");
function nextSeurCargaDate(from) {
  const d = new Date(from);
  const cutoffPassed = d.getHours() >= 15;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (cutoffPassed ? 2 : 1));
  return skipWeekend(d);
}
__name(nextSeurCargaDate, "nextSeurCargaDate");
function seurCargaDateFromChoice(choice) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(choice || "")) {
    const d2 = /* @__PURE__ */ new Date(choice + "T00:00:00Z");
    while (esDiaSinCargaSeur(d2.toISOString().slice(0, 10))) d2.setUTCDate(d2.getUTCDate() + 1);
    return d2;
  }
  if (choice === "auto") {
    const ahora = /* @__PURE__ */ new Date();
    const hoy = ahora.toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
    const hora = Number(ahora.toLocaleString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false }));
    const d2 = /* @__PURE__ */ new Date(hoy + "T00:00:00Z");
    d2.setUTCDate(d2.getUTCDate() + (hora >= 15 ? 1 : 0));
    while (esDiaSinCargaSeur(d2.toISOString().slice(0, 10))) d2.setUTCDate(d2.getUTCDate() + 1);
    return d2;
  }
  const d = /* @__PURE__ */ new Date();
  d.setHours(0, 0, 0, 0);
  if (choice === "manana") d.setDate(d.getDate() + 1);
  return skipWeekend(d);
}
__name(seurCargaDateFromChoice, "seurCargaDateFromChoice");
var SEUR_SEMANA_DESDE = "2026-10-01";
function diasCargaSeur(n = 5) {
  const hoy = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
  const d = /* @__PURE__ */ new Date((hoy < SEUR_SEMANA_DESDE ? SEUR_SEMANA_DESDE : hoy) + "T12:00:00Z");
  const dias = [];
  while (dias.length < n) {
    if (!esDiaSinCargaSeur(d.toISOString().slice(0, 10))) dias.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dias;
}
__name(diasCargaSeur, "diasCargaSeur");
async function asegurarCargasSeur(storage) {
  const cargas = await storage.get("cargas") || [];
  let creadas = 0;
  for (const fecha of diasCargaSeur()) {
    if (cargas.some((c) => c.tipo === "seur" && c.fecha === fecha)) continue;
    cargas.push({
      id: crypto.randomUUID(),
      tipo: "seur",
      fecha,
      dia: DIAS_SEMANA[(/* @__PURE__ */ new Date(fecha + "T12:00:00Z")).getUTCDay()],
      estado: "abierta",
      fechaCreacion: (/* @__PURE__ */ new Date()).toISOString(),
      fechaCierre: null
    });
    creadas++;
  }
  if (creadas) await storage.put("cargas", cargas);
  return creadas;
}
__name(asegurarCargasSeur, "asegurarCargasSeur");
async function asegurarCargasFurniture(storage) {
  const cargas = await storage.get("cargas") || [];
  const hoy = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
  const d = /* @__PURE__ */ new Date(hoy + "T12:00:00Z");
  let abiertas = 0;
  let creadas = 0;
  for (let i = 0; i < 60 && abiertas < 2; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    const w = d.getUTCDay();
    if (!(w in DIAS_CARGA)) continue;
    const fecha = d.toISOString().slice(0, 10);
    if (FESTIVOS_SIN_CARGA.includes(fecha)) continue;
    const delDia = cargas.filter((c) => (c.tipo || "furniture") === "furniture" && c.fecha === fecha);
    if (delDia.some((c) => c.estado === "abierta")) {
      abiertas++;
      continue;
    }
    if (delDia.length) continue;
    cargas.push({ id: crypto.randomUUID(), tipo: "furniture", fecha, dia: DIAS_CARGA[w], estado: "abierta", fechaCreacion: (/* @__PURE__ */ new Date()).toISOString(), fechaCierre: null });
    abiertas++;
    creadas++;
  }
  if (creadas) await storage.put("cargas", cargas);
  return creadas;
}
__name(asegurarCargasFurniture, "asegurarCargasFurniture");
async function getOrCreateCargaByFecha(storage, tipo, dateObj) {
  const cargas = await storage.get("cargas") || [];
  if (tipo === "seur") {
    dateObj = /* @__PURE__ */ new Date(cargaFechaKey(dateObj) + "T00:00:00Z");
    while (esDiaSinCargaSeur(cargaFechaKey(dateObj))) dateObj.setUTCDate(dateObj.getUTCDate() + 1);
  }
  const fecha = cargaFechaKey(dateObj);
  let carga = cargas.find((c) => (c.tipo || "furniture") === tipo && c.fecha === fecha && c.estado === "abierta");
  if (!carga) {
    carga = {
      id: crypto.randomUUID(),
      tipo,
      fecha,
      dia: DIAS_SEMANA[(/* @__PURE__ */ new Date(fecha + "T12:00:00Z")).getUTCDay()],
      estado: "abierta",
      fechaCreacion: (/* @__PURE__ */ new Date()).toISOString(),
      fechaCierre: null
    };
    cargas.push(carga);
    await storage.put("cargas", cargas);
  }
  return carga;
}
__name(getOrCreateCargaByFecha, "getOrCreateCargaByFecha");
var CAMPOS_DIRECCION = ["streetAddress", "postalCode", "city", "province", "phone"];
function aplicarDireccionManual(o) {
  const d = o.direccionManual;
  if (!d) return o;
  for (const c of CAMPOS_DIRECCION) if (d[c] !== void 0) o[c] = d[c];
  o.furnitureAddress = d.streetAddress;
  o.address = [d.streetAddress, d.postalCode, d.city, d.province].filter(Boolean).join(", ");
  return o;
}
__name(aplicarDireccionManual, "aplicarDireccionManual");
function mergeCustomFields(existing, incoming) {
  const merged = existing ? { ...incoming } : incoming;
  if (existing) {
    for (const field of PRESERVED_FIELDS) {
      if (existing[field] !== void 0) merged[field] = existing[field];
    }
    if (incoming.inventoryProcessed && !existing.inventoryProcessed) {
      for (const field of CAMPOS_DE_TRAMITACION) {
        if (incoming[field] !== void 0) merged[field] = incoming[field];
      }
      if (incoming.cargaId && !existing.cargaId) merged.cargaId = incoming.cargaId;
    }
  }
  if (incoming.shopifyCancelado) merged.cancelado = true;
  if (existing && existing.direccionManual) {
    merged.direccionOriginal = { streetAddress: incoming.streetAddress, postalCode: incoming.postalCode, city: incoming.city, province: incoming.province, phone: incoming.phone, furnitureAddress: incoming.furnitureAddress, address: incoming.address };
    aplicarDireccionManual(merged);
  }
  return merged;
}
__name(mergeCustomFields, "mergeCustomFields");
function mergeOrphans(list) {
  const byNumber = new Map(list.map((o) => [o.orderNumber, o]));
  const result = [];
  for (const order of list) {
    const match = !order.services && (order.product || "").match(ORPHAN_RE);
    const refNumber = match ? Number(match[1]) : null;
    const target = refNumber && refNumber !== order.orderNumber ? byNumber.get(refNumber) : null;
    if (target) {
      const desc = order.product.replace(ORPHAN_RE, "").trim();
      const note = /\d/.test(desc) ? desc : `${desc} (${order.price}\u20AC)`;
      target.services = [target.services, note].filter(Boolean).join(" \xB7 ");
      continue;
    }
    result.push(order);
  }
  return result;
}
__name(mergeOrphans, "mergeOrphans");
var OrdersStore = class {
  static {
    __name(this, "OrdersStore");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = /* @__PURE__ */ new Set();
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/orders" && request.method === "GET") {
      const orders = await this.state.storage.get("orders") || {};
      const list = mergeOrphans(Object.values(orders)).sort((a, b) => b.orderNumber - a.orderNumber);
      return Response.json(list);
    }
    if (url.pathname === "/orders/import-simple" && request.method === "POST") {
      const incoming = await request.json();
      const orders = await this.state.storage.get("orders") || {};
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
      const orders = await this.state.storage.get("orders") || {};
      const notasParaFulfillar = [];
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
      const orders = await this.state.storage.get("orders") || {};
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
    if (url.pathname === "/orders/admin/delete" && request.method === "POST") {
      const { ids } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      let borrados = 0;
      for (const id of ids || []) {
        if (orders[id]) {
          delete orders[id];
          borrados++;
        }
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, borrados });
    }
    if (url.pathname === "/orders/admin/fix-item-product" && request.method === "POST") {
      const { id, itemIndex, productId } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const existing = orders[id];
      if (!existing || !existing.items || !existing.items[itemIndex]) {
        return Response.json({ ok: false, error: "Pedido o art\xEDculo no encontrado." }, { status: 404 });
      }
      const antes = existing.items[itemIndex].productId;
      existing.items[itemIndex].productId = productId;
      orders[id] = existing;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, antes, ahora: productId });
    }
    if (url.pathname === "/orders/admin/backfill-processed-cutoff" && request.method === "POST") {
      const orders = await this.state.storage.get("orders") || {};
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
    if (url.pathname === "/orders/admin/marcar-sin-pagar" && request.method === "POST") {
      const orders = await this.state.storage.get("orders") || {};
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
    if (url.pathname === "/orders/admin/tramitar-como-nuevo" && request.method === "POST") {
      const { orderId, fecha } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const existing = orders[orderId];
      if (!existing) return new Response("not found", { status: 404 });
      if (existing.agencia) return Response.json({ ok: false, error: "Ya est\xE1 tramitado." }, { status: 409 });
      existing.vistoSinPagar = true;
      existing.fechaTramitacion = fecha || (/* @__PURE__ */ new Date()).toISOString();
      delete existing.inventoryProcessed;
      await this.processInventory(existing);
      orders[orderId] = existing;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json(existing);
    }
    if (url.pathname === "/orders/admin/tramitar-pagado-manual" && request.method === "POST") {
      const { orderId, usuario } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const existing = orders[orderId];
      if (!existing) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      if (existing.agencia || existing.inventoryProcessed && existing.paymentStatus === "PAGADO") {
        return Response.json({ ok: false, error: "Este pedido ya est\xE1 tramitado." }, { status: 409 });
      }
      existing.pagoConfirmadoManual = { usuario: usuario || null, fecha: (/* @__PURE__ */ new Date()).toISOString() };
      existing.vistoSinPagar = true;
      existing.fechaTramitacion = existing.pagoConfirmadoManual.fecha;
      delete existing.inventoryProcessed;
      await this.processInventory(existing);
      if (!existing.inventoryProcessed) {
        delete existing.pagoConfirmadoManual;
        delete existing.fechaTramitacion;
        orders[orderId] = existing;
        await this.state.storage.put("orders", orders);
        return Response.json({ ok: false, error: "El procesamiento de pedidos est\xE1 en pausa o el pedido necesita revisi\xF3n." }, { status: 409 });
      }
      orders[orderId] = existing;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json(existing);
    }
    if (url.pathname === "/orders/grupo-envio/vincular" && request.method === "POST") {
      const { orderIds } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const seleccion = (orderIds || []).map((id) => orders[id]).filter(Boolean);
      if (seleccion.length < 2) return Response.json({ ok: false, error: "Hacen falta al menos dos pedidos." }, { status: 400 });
      const gruposPrevios = new Set(seleccion.map((o) => o.grupoEnvio).filter(Boolean));
      const miembros = new Map(seleccion.map((o) => [o.id, o]));
      for (const o of Object.values(orders)) {
        if (o.grupoEnvio && gruposPrevios.has(o.grupoEnvio)) miembros.set(o.id, o);
      }
      const lista = [...miembros.values()];
      for (const o of lista) {
        if (o.cancelado || o.shopifyCancelado) return Response.json({ ok: false, error: `${o.orderRef || "BEZEN" + o.orderNumber} est\xE1 cancelado.` }, { status: 409 });
        if (o.shippingStatus === "fulfilled") return Response.json({ ok: false, error: `${o.orderRef || "BEZEN" + o.orderNumber} ya est\xE1 enviado.` }, { status: 409 });
        if (!o.inventoryProcessed || !o.agencia) return Response.json({ ok: false, error: `${o.orderRef || "BEZEN" + o.orderNumber} todav\xEDa no est\xE1 tramitado (\xBFsin pagar?).` }, { status: 409 });
      }
      if (!lista.some((o) => o.agencia === "FURNITURE")) {
        return Response.json({ ok: false, error: "Ninguno de los pedidos va por Furniture: juntar env\xEDos solo est\xE1 pensado para Furniture." }, { status: 409 });
      }
      const fechaDe = /* @__PURE__ */ __name((o) => {
        const t = Date.parse(o.orderDate);
        return Number.isNaN(t) ? Infinity : t;
      }, "fechaDe");
      const principal = lista.slice().sort((a, b) => fechaDe(a) - fechaDe(b) || a.orderNumber - b.orderNumber)[0];
      const cargas = await this.state.storage.get("cargas") || [];
      for (const o of lista) {
        o.grupoEnvio = principal.id;
        if (o.agencia !== "FURNITURE") {
          o.agenciaAntesDeGrupo = o.agencia;
          o.agencia = "FURNITURE";
        }
        const carga = o.cargaId && cargas.find((c) => c.id === o.cargaId);
        if (carga && carga.estado === "abierta") o.cargaId = null;
      }
      await this.state.storage.put("orders", orders);
      await this.planColchonesDelGrupo(lista.map((o) => o.id), "FUR");
      this.broadcast();
      return Response.json({ ok: true, principal: principal.id, miembros: lista.map((o) => o.id) });
    }
    if (url.pathname === "/orders/grupo-envio/desvincular" && request.method === "POST") {
      const { orderId } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const order = orders[orderId];
      if (!order || !order.grupoEnvio) return Response.json({ ok: false, error: "Este pedido no est\xE1 en ning\xFAn env\xEDo conjunto." }, { status: 404 });
      const grupo = order.grupoEnvio;
      const miembros = Object.values(orders).filter((o) => o.grupoEnvio === grupo);
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
      const quedan = miembros.filter((o) => o.grupoEnvio === grupo);
      if (quedan.length && !quedan.some((o) => o.id === grupo)) {
        const fechaDe = /* @__PURE__ */ __name((o) => {
          const t = Date.parse(o.orderDate);
          return Number.isNaN(t) ? Infinity : t;
        }, "fechaDe");
        const nuevo = quedan.slice().sort((a, b) => fechaDe(a) - fechaDe(b) || a.orderNumber - b.orderNumber)[0];
        for (const o of quedan) o.grupoEnvio = nuevo.id;
      }
      await this.state.storage.put("orders", orders);
      if (restauradosASeur.length) await this.planColchonesDelGrupo(restauradosASeur, "FPK");
      this.broadcast();
      return Response.json({ ok: true, desvinculados: salen.map((o) => o.id) });
    }
    if (url.pathname === "/orders/recoge-cliente" && request.method === "POST") {
      const { id, activo, usuario } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const order = orders[id];
      if (!order) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      const cargas = await this.state.storage.get("cargas") || [];
      if (activo) {
        if (!order.recogeCliente) {
          order.agenciaAntesDeRecogida = order.agencia || null;
          order.recogeCliente = { fecha: (/* @__PURE__ */ new Date()).toISOString(), usuario: usuario || null };
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
    if (url.pathname === "/orders/entregado-cliente" && request.method === "POST") {
      const { id, usuario } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const order = orders[id];
      if (!order) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      order.entregadoCliente = { fecha: (/* @__PURE__ */ new Date()).toISOString(), usuario: usuario || null };
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true });
    }
    if (url.pathname === "/orders/pasar-a-furniture" && request.method === "POST") {
      const { orderId, motivo } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const order = orders[orderId];
      if (!order) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      if (order.agencia !== "FURNITURE") {
        order.agenciaAntesDeFurniture = order.agencia || null;
        order.agencia = "FURNITURE";
        order.motivoFurniture = motivo || null;
        const cargas = await this.state.storage.get("cargas") || [];
        const carga = order.cargaId && cargas.find((c) => c.id === order.cargaId);
        if (carga && carga.tipo === "seur" && carga.estado === "abierta") order.cargaId = null;
        await this.state.storage.put("orders", orders);
        this.broadcast();
      }
      return Response.json({ ok: true, agencia: order.agencia });
    }
    if (url.pathname === "/orders/cancelar-linea" && request.method === "POST") {
      const { orderId, itemIndex, unidades, texto, desde, usuario } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const order = orders[orderId];
      if (!order) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      order.lineasCanceladas = order.lineasCanceladas || [];
      order.lineasCanceladas.push({
        itemIndex: Number.isInteger(itemIndex) ? itemIndex : null,
        unidades: Math.max(1, Math.floor(Number(unidades) || 1)),
        texto: texto || "",
        desde: desde || "pedido",
        usuario: usuario || null,
        fecha: (/* @__PURE__ */ new Date()).toISOString()
      });
      const items = order.items || [];
      const canceladasPorItem = /* @__PURE__ */ __name((i) => order.lineasCanceladas.filter((l) => l.itemIndex === i).reduce((s, l) => s + l.unidades, 0), "canceladasPorItem");
      if (items.length && items.every((it, i) => canceladasPorItem(i) >= (it.qty || 1))) order.cancelado = true;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, cancelado: !!order.cancelado, lineasCanceladas: order.lineasCanceladas });
    }
    if (url.pathname === "/orders/no-salio-seur" && request.method === "POST") {
      const { orderId } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const order = orders[orderId];
      if (!order) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      const cargas = await this.state.storage.get("cargas") || [];
      const carga = order.cargaId && cargas.find((c) => c.id === order.cargaId);
      if (carga && carga.tipo === "seur") order.cargaId = null;
      for (const t of order.seurTracking || []) t.anulado = true;
      order.noSalioSeur = (/* @__PURE__ */ new Date()).toISOString();
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true });
    }
    if (url.pathname === "/orders/borrar" && request.method === "POST") {
      const { ids } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const borrados = [];
      for (const id of ids || []) {
        if (orders[id]) {
          delete orders[id];
          borrados.push(id);
        }
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, borrados });
    }
    if (url.pathname === "/orders/unprocess" && request.method === "POST") {
      const { ids } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
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
      const orders = await this.state.storage.get("orders") || {};
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
    if (url.pathname === "/orders/force-process" && request.method === "POST") {
      const { orderId } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
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
    if (url.pathname === "/orders/marcar-gestionado-externo" && request.method === "POST") {
      const { platform } = await request.json();
      if (!platform) return Response.json({ ok: false, error: "Falta platform." }, { status: 400 });
      const orders = await this.state.storage.get("orders") || {};
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
    if (url.pathname === "/orders/admin/set-agencia" && request.method === "POST") {
      const { ids, agencia } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
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
    if (url.pathname === "/orders/direccion" && request.method === "POST") {
      const { id, direccion, usuario } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const o = orders[id];
      if (!o) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      if (!o.direccionOriginal) {
        o.direccionOriginal = { streetAddress: o.streetAddress, postalCode: o.postalCode, city: o.city, province: o.province, phone: o.phone, furnitureAddress: o.furnitureAddress, address: o.address };
      }
      if (direccion) {
        const d = {};
        for (const c of CAMPOS_DIRECCION) d[c] = String(direccion[c] || "").trim();
        o.direccionManual = { ...d, motivo: String(direccion.motivo || "").trim(), usuario: usuario || null, fecha: (/* @__PURE__ */ new Date()).toISOString() };
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
      const { id, colorTag, observaciones, notas, cancelado, paraTenerEnCuenta, needsReview, retenido, tapiceriaEnviada, gestionadoExterno } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const existing = orders[id];
      if (!existing) return new Response("not found", { status: 404 });
      if (colorTag !== void 0) existing.colorTag = colorTag || null;
      if (gestionadoExterno !== void 0) existing.gestionadoExterno = !!gestionadoExterno;
      if (observaciones !== void 0) existing.observaciones = observaciones;
      if (notas !== void 0) existing.notas = notas;
      if (cancelado !== void 0) existing.cancelado = !!cancelado;
      if (paraTenerEnCuenta !== void 0) existing.paraTenerEnCuenta = !!paraTenerEnCuenta;
      if (tapiceriaEnviada !== void 0) existing.tapiceriaEnviada = !!tapiceriaEnviada;
      if (retenido !== void 0) existing.retenido = retenido ? { hasta: retenido.hasta || null, desde: (/* @__PURE__ */ new Date()).toISOString() } : null;
      if (needsReview !== void 0) existing.needsReview = !!needsReview;
      orders[id] = existing;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return new Response("ok");
    }
    if (url.pathname === "/orders/shopify-fulfilled" && request.method === "POST") {
      const { id, fulfillmentId } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const existing = orders[id];
      if (!existing) return new Response("not found", { status: 404 });
      existing.shopifyFulfilled = true;
      if (fulfillmentId) existing.shopifyFulfillmentId = fulfillmentId;
      orders[id] = existing;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return new Response("ok");
    }
    if (url.pathname === "/orders/review-note" && request.method === "POST") {
      const { id, reviewAnswers } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const existing = orders[id];
      if (!existing) return new Response("not found", { status: 404 });
      const answers = Array.isArray(reviewAnswers) ? reviewAnswers : [];
      existing.reviewAnswers = answers;
      orders[id] = existing;
      await this.state.storage.put("orders", orders);
      const reasons = existing.reviewReasons || [];
      const allAnswered = reasons.length > 0 && reasons.every((r, i) => (answers[i] || "").trim());
      await this.releaseInventoryDecision(existing.id, !allAnswered);
      this.broadcast();
      return new Response("ok");
    }
    if (url.pathname === "/cargas" && request.method === "GET") {
      await asegurarCargasSeur(this.state.storage);
      await asegurarCargasFurniture(this.state.storage);
      const cargas = await this.state.storage.get("cargas") || [];
      return Response.json(cargas);
    }
    if (url.pathname === "/cargas/add" && request.method === "POST") {
      const { orderIds, cargaId } = await request.json();
      await asegurarCargasFurniture(this.state.storage);
      const cargas = await this.state.storage.get("cargas") || [];
      const abiertasFur = cargas.filter((c) => (c.tipo || "furniture") === "furniture" && c.estado === "abierta").sort((a, b) => a.fecha.localeCompare(b.fecha));
      let abierta = cargaId ? abiertasFur.find((c) => c.id === cargaId) : abiertasFur[0];
      if (cargaId && !abierta) return Response.json({ ok: false, error: "Esa carga de Furniture no est\xE1 abierta." }, { status: 400 });
      if (!abierta) {
        let fecha = nextCargaDate(/* @__PURE__ */ new Date());
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
          fechaCreacion: (/* @__PURE__ */ new Date()).toISOString(),
          fechaCierre: null
        };
        cargas.push(abierta);
      }
      const orders = await this.state.storage.get("orders") || {};
      let a\u00F1adidos = 0;
      for (const id of orderIds || []) {
        const order = orders[id];
        if (!order || order.cargaId || order.recogeCliente) continue;
        order.cargaId = abierta.id;
        a\u00F1adidos++;
      }
      await this.state.storage.put("orders", orders);
      await this.state.storage.put("cargas", cargas);
      this.broadcast();
      return Response.json({ ok: true, carga: abierta, a\u00F1adidos });
    }
    if (url.pathname === "/cargas/furniture/mover" && request.method === "POST") {
      const { orderIds, cargaId } = await request.json();
      const cargas = await this.state.storage.get("cargas") || [];
      const destino = cargas.find((c) => c.id === cargaId && (c.tipo || "furniture") === "furniture" && c.estado === "abierta");
      if (!destino) return Response.json({ ok: false, error: "Esa carga de Furniture no est\xE1 abierta." }, { status: 400 });
      const orders = await this.state.storage.get("orders") || {};
      let movidos = 0;
      for (const id of orderIds || []) {
        if (!orders[id]) continue;
        orders[id].cargaId = destino.id;
        movidos++;
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, carga: destino, movidos });
    }
    if (url.pathname === "/cargas/set-fecha" && request.method === "POST") {
      const { cargaId, fecha } = await request.json();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return Response.json({ ok: false, error: "Fecha no v\xE1lida (AAAA-MM-DD)." }, { status: 400 });
      const cargas = await this.state.storage.get("cargas") || [];
      const carga = cargas.find((c) => c.id === cargaId);
      if (!carga) return Response.json({ ok: false, error: "Carga no encontrada." }, { status: 404 });
      carga.fechaAnterior = carga.fecha;
      carga.fecha = fecha;
      carga.dia = DIAS_SEMANA[(/* @__PURE__ */ new Date(fecha + "T12:00:00")).getDay()];
      await this.state.storage.put("cargas", cargas);
      this.broadcast();
      return Response.json({ ok: true, carga });
    }
    if (url.pathname === "/cargas/seur/add" && request.method === "POST") {
      const { orderIds, fecha } = await request.json();
      const carga = await getOrCreateCargaByFecha(this.state.storage, "seur", seurCargaDateFromChoice(fecha));
      const orders = await this.state.storage.get("orders") || {};
      let a\u00F1adidos = 0;
      for (const id of orderIds || []) {
        const order = orders[id];
        if (!order || order.cargaId || order.recogeCliente) continue;
        order.cargaId = carga.id;
        a\u00F1adidos++;
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, carga, a\u00F1adidos });
    }
    if (url.pathname === "/cargas/borrar" && request.method === "POST") {
      const { id } = await request.json();
      const cargas = await this.state.storage.get("cargas") || [];
      const carga = cargas.find((c) => c.id === id);
      if (!carga) return Response.json({ ok: false, error: "Carga no encontrada." }, { status: 404 });
      if (carga.estado !== "abierta") return Response.json({ ok: false, error: "Solo se puede borrar una carga abierta." }, { status: 409 });
      const orders = await this.state.storage.get("orders") || {};
      if (Object.values(orders).some((o) => o.cargaId === id)) return Response.json({ ok: false, error: "La carga todav\xEDa tiene pedidos." }, { status: 409 });
      await this.state.storage.put("cargas", cargas.filter((c) => c.id !== id));
      this.broadcast();
      return Response.json({ ok: true });
    }
    if (url.pathname === "/cargas/remove" && request.method === "POST") {
      const { orderId } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const order = orders[orderId];
      if (!order) return new Response("not found", { status: 404 });
      order.cargaId = null;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true });
    }
    if (url.pathname === "/cargas/close" && request.method === "POST") {
      const { cargaId } = await request.json();
      const cargas = await this.state.storage.get("cargas") || [];
      const carga = cargas.find((c) => c.id === cargaId);
      if (!carga) return new Response("not found", { status: 404 });
      carga.estado = "cerrada";
      carga.fechaCierre = (/* @__PURE__ */ new Date()).toISOString();
      await this.state.storage.put("cargas", cargas);
      this.broadcast();
      return Response.json({ ok: true, carga });
    }
    if (url.pathname === "/cargas/seur/mover-pedido" && request.method === "POST") {
      const { orderId, cargaId } = await request.json();
      const cargas = await this.state.storage.get("cargas") || [];
      const destino = cargas.find((c) => c.id === cargaId && c.tipo === "seur" && c.estado === "abierta");
      if (!destino) return Response.json({ ok: false, error: "Esa carga de SEUR no est\xE1 abierta." }, { status: 400 });
      const orders = await this.state.storage.get("orders") || {};
      const order = orders[orderId];
      if (!order) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
      order.cargaId = destino.id;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, carga: destino });
    }
    if (url.pathname === "/cargas/seur/get-or-create" && request.method === "POST") {
      const { fecha } = await request.json();
      const dateObj = seurCargaDateFromChoice(fecha);
      const carga = await getOrCreateCargaByFecha(this.state.storage, "seur", dateObj);
      this.broadcast();
      return Response.json(carga);
    }
    if (url.pathname === "/orders/seur-dividir" && request.method === "POST") {
      const { id } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const existing = orders[id];
      if (!existing) return new Response("not found", { status: 404 });
      await this.processInventory(existing, true, true);
      orders[id] = existing;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json(existing);
    }
    if (url.pathname === "/orders/tracking-import" && request.method === "POST") {
      const { entries } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const byOrderNumber = new Map(Object.values(orders).map((o) => [o.orderNumber, o]));
      let sinPedido = 0;
      const pedidosTocados = /* @__PURE__ */ new Set();
      const paraShopify = [];
      const destinos = [];
      const sinPedidoDetalle = [];
      const actualizadosDetalle = [];
      for (const e of entries || []) {
        const principal = byOrderNumber.get(e.orderNumber);
        if (!principal) {
          sinPedido++;
          sinPedidoDetalle.push({ albaran: e.albaran, orderNumberDetectado: e.orderNumber, estado: e.estado });
          continue;
        }
        const grupo = principal.grupoEnvio ? Object.values(orders).filter((o) => o.grupoEnvio === principal.grupoEnvio) : [principal];
        for (const order of grupo) destinos.push({ e: { ...e, orderNumber: order.orderNumber }, order });
      }
      for (const { e, order } of destinos) {
        const tracking = order.furnitureTracking || [];
        const idx = tracking.findIndex((t) => t.albaran === e.albaran);
        const esNuevo = idx < 0;
        const errorAnterior = idx >= 0 ? tracking[idx].shopifyError : void 0;
        const nuevaEntrada = {
          albaran: e.albaran,
          estado: e.estado,
          fechaAlmacen: e.fechaAlmacen,
          fechaPrevista: e.fechaPrevista,
          seguimiento: e.seguimiento,
          tipo: e.tipo,
          shopifyError: errorAnterior,
          // La nota de seguimiento de "Casos a revisar" es manual, no viene
          // del fichero — se conserva al actualizar (Jennifer, 2026-09-16).
          nota: idx >= 0 ? tracking[idx].nota : void 0
        };
        if (idx >= 0) tracking[idx] = nuevaEntrada;
        else tracking.push(nuevaEntrada);
        order.furnitureTracking = tracking;
        pedidosTocados.add(e.orderNumber);
        actualizadosDetalle.push({ orderNumber: e.orderNumber, albaran: e.albaran, nombre: order.name || "", estado: e.estado, nuevo: esNuevo });
        if ((esNuevo || errorAnterior) && order.platform === "Shopify" && !order.cancelado && order.shippingStatus !== "cancelado" && (order.paymentStatus === "PAGADO" || order.pagoConfirmadoManual) && e.seguimiento) {
          paraShopify.push({
            orderId: order.id,
            orderNumber: e.orderNumber,
            trackingNumber: e.albaran,
            trackingUrl: e.seguimiento,
            company: "FURNITURE",
            primerEnvio: !order.shopifyFulfilled,
            fulfillmentId: order.shopifyFulfillmentId || null
          });
        }
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, actualizados: pedidosTocados.size, sinPedido, sinPedidoDetalle, actualizadosDetalle, paraShopify });
    }
    if (url.pathname === "/orders/furniture-shopify-error" && request.method === "POST") {
      const { orderNumber, albaran, error } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const order = Object.values(orders).find((o) => o.orderNumber === orderNumber);
      const t = order && (order.furnitureTracking || []).find((x) => x.albaran === albaran);
      if (!t) return new Response("not found", { status: 404 });
      if (error) t.shopifyError = error;
      else delete t.shopifyError;
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true });
    }
    if (url.pathname === "/orders/tracking-import-seur" && request.method === "POST") {
      const { entries } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const byOrderNumber = new Map(Object.values(orders).map((o) => [o.orderNumber, o]));
      let sinPedido = 0;
      const pedidosTocados = /* @__PURE__ */ new Set();
      const sinPedidoDetalle = [];
      const actualizadosDetalle = [];
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
          localizador: e.localizador,
          referencia: e.referencia,
          numeroExpedicion: e.numeroExpedicion,
          seguimiento: e.seguimiento,
          codigoSituacion: e.codigoSituacion,
          estado: e.estado,
          fechaSituacion: e.fechaSituacion,
          fechaCreacion: e.fechaCreacion,
          infoAdicional: e.infoAdicional,
          nota: idx >= 0 ? tracking[idx].nota : void 0,
          // Una etiqueta anulada con "No ha salido" sigue anulada aunque
          // vuelva a aparecer en el fichero de SEUR.
          anulado: idx >= 0 ? tracking[idx].anulado : void 0
        };
        if (idx >= 0) tracking[idx] = nuevaEntrada;
        else tracking.push(nuevaEntrada);
        order.seurTracking = tracking;
        pedidosTocados.add(e.orderNumber);
        actualizadosDetalle.push({ orderNumber: e.orderNumber, referencia: e.referencia, nombre: order.name || "", estadoSeur: e.estado, nuevo: esNuevo });
        if (esNuevo && order.platform === "Shopify" && !order.cancelado && order.shippingStatus !== "cancelado" && order.paymentStatus === "PAGADO" && e.seguimiento) {
          const numero = (e.seguimiento.split("tracking=")[1] || e.numeroExpedicion || "").trim();
          paraShopify.push({
            orderId: order.id,
            orderNumber: e.orderNumber,
            trackingNumber: numero,
            trackingUrl: e.seguimiento,
            company: "SEUR",
            primerEnvio: !order.shopifyFulfilled,
            fulfillmentId: order.shopifyFulfillmentId || null
          });
        }
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, actualizados: pedidosTocados.size, sinPedido, sinPedidoDetalle, actualizadosDetalle, paraShopify });
    }
    if (url.pathname === "/casos-revisar" && request.method === "GET") {
      let diasNaturalesDesdeIso = function(iso) {
        if (!iso) return null;
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return null;
        const dUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        return Math.floor((hoyUTC - dUTC) / 864e5);
      }, diasNaturalesDesdeFurniture = function(str) {
        const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec((str || "").trim());
        if (!m) return null;
        const dUTC = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        return Math.floor((hoyUTC - dUTC) / 864e5);
      };
      __name(diasNaturalesDesdeIso, "diasNaturalesDesdeIso");
      __name(diasNaturalesDesdeFurniture, "diasNaturalesDesdeFurniture");
      const orders = await this.state.storage.get("orders") || {};
      const cargas = await this.state.storage.get("cargas") || [];
      const cargasById = new Map(cargas.map((c) => [c.id, c]));
      const hoy = /* @__PURE__ */ new Date();
      const hoyUTC = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
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
                motivos.push(`Pendiente de recepci\xF3n ${dias} d\xEDas despu\xE9s de cerrar la carga`);
              }
            }
          }
          if (estado !== "ENTREGADO OK" && t.fechaAlmacen) {
            const dias = diasNaturalesDesdeFurniture(t.fechaAlmacen);
            if (dias !== null && dias >= 7) {
              motivos.push(`${dias} d\xEDas desde que lleg\xF3 a Almac\xE9n sin entregarse`);
            }
          }
          if (motivos.length) {
            casos.push({
              tipo: "furniture",
              orderId: order.id,
              orderNumber: order.orderNumber,
              name: order.name,
              platform: order.platform,
              orderRef: order.orderRef,
              key: t.albaran,
              albaran: t.albaran,
              estado: t.estado,
              fechaAlmacen: t.fechaAlmacen,
              seguimiento: t.seguimiento,
              motivos,
              nota: t.nota || ""
            });
          }
        }
      }
      return Response.json(casos);
    }
    if (url.pathname === "/devoluciones" && request.method === "GET") {
      const orders = await this.state.storage.get("orders") || {};
      const devoluciones = await this.state.storage.get("devoluciones") || [];
      let nuevas = 0;
      for (const o of Object.values(orders)) {
        for (const t of o.seurTracking || []) {
          if (!/envío devuelto|devolviendo a origen/i.test(t.estado || "")) continue;
          const id = String(o.id) + "|" + (t.localizador || t.referencia || "");
          if (devoluciones.some((d) => d.id === id || d.origen === "auto" && String(d.orderId) === String(o.id))) continue;
          devoluciones.push({ id, orderId: o.id, origen: "auto", estadoDetectado: t.estado || "", localizador: t.localizador || t.referencia || "", creado: (/* @__PURE__ */ new Date()).toISOString() });
          nuevas++;
        }
      }
      if (nuevas) await this.state.storage.put("devoluciones", devoluciones);
      return Response.json(devoluciones.filter((d) => !d.descartado).map((d) => {
        const o = orders[d.orderId] || {};
        const tr = o.seurTracking || [];
        const t = tr.find((x) => (x.localizador || x.referencia || "") === d.localizador) || tr[tr.length - 1] || null;
        return { ...d, orderNumber: o.orderNumber, orderRef: o.orderRef, platform: o.platform, nombre: o.name || "", producto: o.product || "", estadoSeur: t ? t.estado || "" : "", seguimiento: t ? t.seguimiento || "" : "" };
      }));
    }
    if (url.pathname === "/devoluciones/guardar" && request.method === "POST") {
      const body = await request.json();
      const devoluciones = await this.state.storage.get("devoluciones") || [];
      const ahora = (/* @__PURE__ */ new Date()).toISOString();
      let d = body.id ? devoluciones.find((x) => x.id === body.id) : null;
      if (body.id && !d) return Response.json({ ok: false, error: "Devoluci\xF3n no encontrada." }, { status: 404 });
      if (!d) {
        const orders = Object.values(await this.state.storage.get("orders") || {});
        const q = String(body.ref || "").trim().toUpperCase();
        const o = orders.find((x) => x.orderRef && String(x.orderRef).toUpperCase() === q) || orders.find((x) => (!x.platform || x.platform === "Shopify") && ("BEZEN" + x.orderNumber === q || String(x.orderNumber) === q));
        if (!o) return Response.json({ ok: false, error: "No encuentro el pedido " + q + "." }, { status: 404 });
        d = { id: String(o.id) + "|manual-" + Date.now(), orderId: o.id, origen: "manual", creado: ahora, creadoPor: body.usuario || null };
        devoluciones.push(d);
      }
      for (const k of ["motivo", "estadoColchon", "destino", "fechaLlegada", "notas"]) if (body[k] !== void 0) d[k] = String(body[k] || "");
      if (body.alStock !== void 0) d.alStock = body.alStock || null;
      if (body.descartado !== void 0) d.descartado = !!body.descartado;
      d.actualizado = ahora;
      d.actualizadoPor = body.usuario || null;
      await this.state.storage.put("devoluciones", devoluciones);
      this.broadcast();
      return Response.json({ ok: true, devolucion: d });
    }
    if (url.pathname === "/casos" && request.method === "GET") {
      return Response.json(await this.state.storage.get("casos") || []);
    }
    if (url.pathname === "/casos/guardar" && request.method === "POST") {
      const { id, pedidoId, pedidoRef, cliente, telefono, motivo, responsable, estado, urgente, nota, notaAutor, notaFecha, usuario } = await request.json();
      const casos = await this.state.storage.get("casos") || [];
      const ahora = (/* @__PURE__ */ new Date()).toISOString();
      let caso = id ? casos.find((c) => c.id === id) : null;
      if (id && !caso) return Response.json({ ok: false, error: "Caso no encontrado." }, { status: 404 });
      if (!caso) {
        caso = { id: crypto.randomUUID(), creado: ahora, creadoPor: usuario || null, estado: "abierto", notas: [] };
        casos.push(caso);
      }
      if (pedidoId !== void 0) caso.pedidoId = pedidoId || null;
      if (pedidoRef !== void 0) caso.pedidoRef = pedidoRef || "";
      if (cliente !== void 0) caso.cliente = cliente || "";
      if (telefono !== void 0) caso.telefono = telefono || "";
      if (motivo !== void 0) caso.motivo = motivo || "";
      if (responsable !== void 0) caso.responsable = responsable || "AMBOS";
      if (estado !== void 0 && estado !== caso.estado) {
        caso.estado = estado === "cerrado" ? "cerrado" : "abierto";
        caso.fechaCierre = caso.estado === "cerrado" ? ahora : null;
        caso.notas.push({ fecha: ahora, autor: usuario || null, texto: caso.estado === "cerrado" ? "Caso cerrado" : "Caso reabierto", sistema: true });
      }
      if (urgente !== void 0 && !!urgente !== !!caso.urgente) {
        caso.urgente = !!urgente;
        caso.urgenteDesde = caso.urgente ? ahora : null;
        caso.notas.push({ fecha: ahora, autor: usuario || null, texto: caso.urgente ? "Marcado URGENTE \u2014 dar respuesta hoy" : "Quitada la marca de urgente", sistema: true });
      }
      if (caso.estado === "cerrado" && caso.urgente) {
        caso.urgente = false;
        caso.urgenteDesde = null;
      }
      if (String(nota || "").trim()) {
        const hoy = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
        const otroDia = /^\d{4}-\d{2}-\d{2}$/.test(notaFecha || "") && notaFecha !== hoy;
        caso.notas.push({ fecha: otroDia ? notaFecha + "T12:00:00.000Z" : ahora, soloDia: otroDia || void 0, autor: notaAutor || usuario || null, apuntadoPor: notaAutor && notaAutor !== usuario ? usuario : void 0, texto: String(nota).trim() });
        caso.notas.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
      }
      caso.actualizado = ahora;
      await this.state.storage.put("casos", casos);
      this.broadcast();
      return Response.json({ ok: true, caso });
    }
    if (url.pathname === "/casos/borrar" && request.method === "POST") {
      const { id } = await request.json();
      const casos = await this.state.storage.get("casos") || [];
      await this.state.storage.put("casos", casos.filter((c) => c.id !== id));
      this.broadcast();
      return Response.json({ ok: true });
    }
    if (url.pathname === "/tareas" && request.method === "GET") {
      return Response.json(await this.state.storage.get("tareas") || []);
    }
    if (url.pathname === "/tareas/guardar" && request.method === "POST") {
      const { id, texto, fecha, pedidoId, pedidoRef, para, hecha, nota, usuario } = await request.json();
      const tareas = await this.state.storage.get("tareas") || [];
      const ahora = (/* @__PURE__ */ new Date()).toISOString();
      let t = id ? tareas.find((x) => x.id === id) : null;
      if (id && !t) return Response.json({ ok: false, error: "Tarea no encontrada." }, { status: 404 });
      if (!t) {
        if (!String(texto || "").trim() || !/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return Response.json({ ok: false, error: "Falta qu\xE9 hay que hacer o la fecha." }, { status: 400 });
        t = { id: crypto.randomUUID(), creado: ahora, creadoPor: usuario || null, hecha: false };
        tareas.push(t);
      }
      if (texto !== void 0) t.texto = String(texto || "").trim();
      if (fecha !== void 0 && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) t.fecha = fecha;
      if (pedidoId !== void 0) t.pedidoId = pedidoId || null;
      if (pedidoRef !== void 0) t.pedidoRef = pedidoRef || "";
      if (para !== void 0) t.para = ["JENNIFER", "SERGIO"].includes(para) ? para : "AMBOS";
      if (hecha !== void 0 && !!hecha !== !!t.hecha) {
        t.hecha = !!hecha;
        t.hechaPor = t.hecha ? usuario || null : null;
        t.fechaHecha = t.hecha ? ahora : null;
      }
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
      const tareas = await this.state.storage.get("tareas") || [];
      await this.state.storage.put("tareas", tareas.filter((x) => x.id !== id));
      this.broadcast();
      return Response.json({ ok: true });
    }
    if (url.pathname === "/tareas/email-dia" && request.method === "GET") {
      return Response.json({ dia: await this.state.storage.get("tareasEmailDia") || null });
    }
    if (url.pathname === "/tareas/email-dia" && request.method === "POST") {
      const { dia } = await request.json();
      await this.state.storage.put("tareasEmailDia", dia);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/orders/envio-seur-info" && request.method === "POST") {
      const { orderId, ref, nota, reclamado, archivado, correo, manual, refSeur } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      const order = orders[orderId];
      if (!order || !ref) return new Response("not found", { status: 404 });
      const info = order.enviosSeurInfo = order.enviosSeurInfo || {};
      const e = info[ref] = info[ref] || {};
      if (nota !== void 0) e.nota = String(nota);
      if (refSeur !== void 0) e.refSeur = String(refSeur || "").trim().toUpperCase() || null;
      if (reclamado !== void 0) {
        e.reclamado = !!reclamado;
        e.fechaReclamado = reclamado ? (/* @__PURE__ */ new Date()).toISOString() : null;
      }
      if (archivado !== void 0) {
        e.archivado = !!archivado;
        e.fechaArchivado = archivado ? (/* @__PURE__ */ new Date()).toISOString() : null;
      }
      if (correo !== void 0) e.correo = correo ? { ...e.correo || {}, ...correo } : null;
      if (manual !== void 0) {
        e.manual = !!manual;
        e.fechaManual = manual ? (/* @__PURE__ */ new Date()).toISOString() : null;
      }
      await this.state.storage.put("orders", orders);
      this.broadcast();
      return Response.json({ ok: true, info: e });
    }
    if (url.pathname === "/orders/envios-seur-correos" && request.method === "POST") {
      const { cambios } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
      let n = 0;
      for (const c of cambios || []) {
        const order = orders[c.orderId];
        if (!order || !c.ref) continue;
        const info = order.enviosSeurInfo = order.enviosSeurInfo || {};
        const e = info[c.ref] = info[c.ref] || {};
        e.correo = { ...e.correo || {}, ...c.correo };
        if (c.reclamado && !e.reclamado) {
          e.reclamado = true;
          e.fechaReclamado = (/* @__PURE__ */ new Date()).toISOString();
        }
        n++;
      }
      if (n) {
        await this.state.storage.put("orders", orders);
        this.broadcast();
      }
      return Response.json({ ok: true, n });
    }
    if (url.pathname === "/cargas/seur/envios-guardar" && request.method === "POST") {
      const { cargaId, envios } = await request.json();
      const cargas = await this.state.storage.get("cargas") || [];
      const carga = cargas.find((c) => c.id === cargaId && c.tipo === "seur");
      if (!carga) return new Response("not found", { status: 404 });
      carga.envios = envios || [];
      await this.state.storage.put("cargas", cargas);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/orders/casos-revisar/nota" && request.method === "POST") {
      const { orderId, tipo, key, nota } = await request.json();
      const orders = await this.state.storage.get("orders") || {};
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
    if (url.pathname === "/casos-revisar-seur" && request.method === "GET") {
      let diasNaturalesDesdeSeur = function(str) {
        const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((str || "").trim());
        if (!m) return null;
        const dUTC = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        return Math.floor((hoyUTC - dUTC) / 864e5);
      };
      __name(diasNaturalesDesdeSeur, "diasNaturalesDesdeSeur");
      const orders = await this.state.storage.get("orders") || {};
      const hoy = /* @__PURE__ */ new Date();
      const hoyUTC = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
      const esEntregado = /* @__PURE__ */ __name((estado) => /ENTREGAD|entrega efectuada|retirado el envío/i.test(estado || "") && !/NO ENTREGAD|NO SE HA ENTREGAD|NO HA PODIDO|NO SE HA PODIDO/i.test(estado || ""), "esEntregado");
      const ESTADOS_INMEDIATOS = [
        "El env\xEDo est\xE1 retenido. pendiente de recibir instrucciones para poder realizar la entrega.",
        "El env\xEDo se est\xE1 devolviendo a origen.",
        "El env\xEDo est\xE1 disponible para recoger en el punto seur pickup.",
        "Los datos del env\xEDo han sido modificados y se entregar\xE1 en un punto seur pickup.",
        "El env\xEDo se ha anulado por estar duplicado o no haber sido recibido por seur.",
        "Env\xEDo devuelto"
      ];
      const casos = [];
      for (const order of Object.values(orders)) {
        if (order.cancelado) continue;
        for (const t of order.seurTracking || []) {
          if (t.anulado) continue;
          const motivos = [];
          const estadoNorm = (t.estado || "").trim();
          if (ESTADOS_INMEDIATOS.some((e) => e.toLowerCase() === estadoNorm.toLowerCase())) {
            motivos.push(estadoNorm);
          }
          if (estadoNorm.toLowerCase() === "el env\xEDo ha sido registrado.") {
            const dias = diasNaturalesDesdeSeur(t.fechaCreacion);
            if (dias !== null && dias >= 3) {
              motivos.push(`Registrado hace ${dias} d\xEDas sin avanzar`);
            }
          }
          if (!esEntregado(estadoNorm)) {
            const dias = diasNaturalesDesdeSeur(t.fechaSituacion);
            if (dias !== null && dias >= 3) {
              motivos.push(`${dias} d\xEDas en el mismo estado sin avanzar`);
            }
          }
          if (motivos.length) {
            casos.push({
              tipo: "seur",
              orderId: order.id,
              orderNumber: order.orderNumber,
              name: order.name,
              platform: order.platform,
              orderRef: order.orderRef,
              key: t.localizador,
              referencia: t.referencia,
              estado: t.estado,
              fechaSituacion: t.fechaSituacion,
              seguimiento: t.seguimiento,
              motivos,
              nota: t.nota || ""
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
    const pagado = order.paymentStatus === "PAGADO" || !!order.pagoConfirmadoManual;
    if (!pagado) order.vistoSinPagar = true;
    if (!force && order.platform === "Shopify" && Number(order.orderNumber) < SHOPIFY_PROCESAMIENTO_DESDE) {
      if (!pagado) return;
      if (!order.vistoSinPagar) {
        order.inventoryProcessed = true;
        return;
      }
    }
    let fechaParaTramitar = order.orderDate;
    if (pagado && order.vistoSinPagar) {
      if (!order.fechaTramitacion) order.fechaTramitacion = (/* @__PURE__ */ new Date()).toISOString();
      fechaParaTramitar = order.fechaTramitacion;
    }
    const id = this.env.INVENTORY_STORE.idFromName("main");
    const stub = this.env.INVENTORY_STORE.get(id);
    const res = await stub.fetch("https://do/process-sale", {
      method: "POST",
      body: JSON.stringify({ orderId: order.id, orderNumber: order.orderNumber, platform: order.platform, orderRef: order.orderRef, items: order.items || [], force, orderDate: fechaParaTramitar, services: order.services || "", paymentStatus: pagado ? "PAGADO" : order.paymentStatus, seurSplitDecision })
    });
    const { agencia, pendingManufacture, needsReview, reviewReasons, paused, seurMixedPending, seurMixedInfo, seurReady } = await res.json();
    if (seurMixedPending) {
      order.seurMixedPending = true;
      order.seurMixedInfo = seurMixedInfo;
      return;
    }
    order.seurMixedPending = false;
    order.seurMixedInfo = null;
    if (paused) return;
    order.agencia = agencia;
    order.pendingManufacture = pendingManufacture;
    order.needsReview = needsReview;
    order.reviewReasons = reviewReasons || [];
    order.inventoryProcessed = true;
    if (agencia === "FURNITURE") await this.reservarStockCubierto(order);
    if (seurReady && !order.cargaId) {
      const carga = await getOrCreateCargaByFecha(this.state.storage, "seur", nextSeurCargaDate(/* @__PURE__ */ new Date()));
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
      const cubiertos = backorders.filter((b) => String(b.orderId) === String(order.id) && b.estado === "cubierto" && String(b.id).endsWith("-cubierto") && !b.reservaEnviada && !b.reposicion && !b.gestoComercial);
      if (!cubiertos.length) return;
      const r = await enviarReservaAlmacen(this.env, {
        pedido: referenciaPedidoAlmacen(order),
        cliente: order.name || "",
        lineasTexto: cubiertos.map(lineaTextoReserva),
        bultos: cubiertos.flatMap(bultosPorUnidad)
      });
      if (!r.ok) return;
      for (const b of cubiertos) {
        await stub.fetch("https://do/backorders/" + encodeURIComponent(b.id) + "/reserva-enviada", { method: "POST", body: "{}" });
      }
    } catch (e) {
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
        body: JSON.stringify({ tipoEnvio })
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
      body: JSON.stringify({ orderId, relock })
    });
  }
  async settleShipment(orderId) {
    const id = this.env.INVENTORY_STORE.idFromName("main");
    const stub = this.env.INVENTORY_STORE.get(id);
    await stub.fetch("https://do/settle-shipment", {
      method: "POST",
      body: JSON.stringify({ orderId })
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
};

// src/inventory-store.js
var TYPE_MAP = {
  Colchones: "colchon",
  Almohada: "almohada",
  "Protector de colch\xF3n": "protector",
  Topper: "topper",
  Canap\u00E9: "tapiceria",
  "Canap\xE9 fijo": "tapiceria",
  Base: "tapiceria",
  Cabecero: "tapiceria"
};
var STOCK_TYPES = /* @__PURE__ */ new Set(["colchon", "almohada", "protector", "topper"]);
var PROVEEDOR_FIXED_TYPES = {
  Almohada: "POLIVAL",
  Topper: "POLIVAL",
  Canap\u00E9: "POLIVAL",
  "Canap\xE9 fijo": "POLIVAL",
  Base: "POLIVAL",
  Cabecero: "POLIVAL"
};
var PROVEEDOR_LUSO_KEYWORDS = [
  "zen mandala",
  "zen nirvana",
  "spring zen",
  "generacion z",
  "paris",
  "origin zen",
  "supreme zen",
  "zen natural",
  "natural zen"
];
var PROVEEDOR_NEW_KEYWORDS = [
  "murano",
  "4d",
  "ergo-relax",
  "ergo relax",
  "louvre",
  "fitness",
  "toscana deluxe",
  "bellagio deluxe",
  "latex gel",
  "pharma-therapy soja",
  "pharmatherapy soja",
  "bambu deluxe",
  "pharma slim"
];
var PROVEEDOR_POLIVAL_COLCHON_KEYWORDS = ["latex natura", "siberian zen"];
var PESOS_SEUR_DEFAULT = {
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
  "TOPPERV5_90X200": 2
};
function pesoSeurPorUnidad(sku, overrides) {
  if (overrides && overrides[sku] != null) return overrides[sku];
  return PESOS_SEUR_DEFAULT[sku] != null ? PESOS_SEUR_DEFAULT[sku] : null;
}
__name(pesoSeurPorUnidad, "pesoSeurPorUnidad");
function normalizeKey(text) {
  return (text || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
__name(normalizeKey, "normalizeKey");
function defaultProveedor(productType, stockModel) {
  if (PROVEEDOR_FIXED_TYPES[productType]) return PROVEEDOR_FIXED_TYPES[productType];
  if (productType !== "Colchones") return null;
  const name = normalizeKey(stockModel);
  if (PROVEEDOR_LUSO_KEYWORDS.some((k) => name.includes(normalizeKey(k)))) return "LUSO";
  if (PROVEEDOR_NEW_KEYWORDS.some((k) => name.includes(normalizeKey(k)))) return "NEW";
  if (PROVEEDOR_POLIVAL_COLCHON_KEYWORDS.some((k) => name.includes(normalizeKey(k)))) return "POLIVAL";
  return null;
}
__name(defaultProveedor, "defaultProveedor");
var REFERENCIA_COLOR_LETTERS = { roble: "R", wengue: "W", cerezo: "C", blanco: "B", nordico: "N" };
function defaultReferenciaTipo(productType, title) {
  const t = normalizeKey(title);
  if (t.includes("esquinas curvas")) return "zenit";
  if (t.includes("esquinas rectas")) return "astra";
  if (productType === "Almohada" || productType === "Topper") return "numero";
  if (productType === "Canap\xE9" || productType === "Cabecero" || productType === "Base" || productType === "Canap\xE9 fijo") return "fur";
  return null;
}
__name(defaultReferenciaTipo, "defaultReferenciaTipo");
async function nextReferenciaNumero(state) {
  const actual = await state.storage.get("polivalReferenciaCounter") || 0;
  const siguiente = actual + 1;
  await state.storage.put("polivalReferenciaCounter", siguiente);
  return String(siguiente).padStart(3, "0");
}
__name(nextReferenciaNumero, "nextReferenciaNumero");
async function nextReposicionReferencia(state) {
  const actual = await state.storage.get("reposicionReferenciaCounter") || 0;
  const siguiente = actual + 1;
  await state.storage.put("reposicionReferenciaCounter", siguiente);
  return "I-" + String(siguiente).padStart(3, "0");
}
__name(nextReposicionReferencia, "nextReposicionReferencia");
async function nextGestoComercialReferencia(state) {
  const actual = await state.storage.get("gestoComercialReferenciaCounter") || 0;
  const siguiente = actual + 1;
  await state.storage.put("gestoComercialReferenciaCounter", siguiente);
  return "GC-" + String(siguiente).padStart(3, "0");
}
__name(nextGestoComercialReferencia, "nextGestoComercialReferencia");
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
        reason: `No s\xE9 qu\xE9 letra de color usar para "${color || "(sin color)"}" en la referencia de Polival (n\xBA ${numero}) \u2014 dime la letra o corrige la referencia a mano.`
      };
    }
    const prefijo = referenciaTipo === "zenit" ? "M" : "ASTRA";
    return { referencia: "N" + prefijo + letra + numero + "FUR", needsReview: false };
  }
  return {
    referencia: "N" + numero + fur,
    needsReview: true,
    reason: `No tengo clasificado c\xF3mo referenciar este art\xEDculo para Polival (n\xBA ${numero}) \u2014 dime si sigue el n\xFAmero solo, "FUR", o el patr\xF3n de canap\xE9 de madera, o corrige la referencia a mano.`
  };
}
__name(buildReferencia, "buildReferencia");
var CANAPE_RECIPES = {
  zenit: {
    modelo: "ZENIT",
    tapaBase: "Tapa entera en rejilla",
    tirador: "Habitual",
    colores: {
      roble: { color: "Roble", rejilla: "Beige" },
      cerezo: { color: "Cerezo", rejilla: "Marr\xF3n" },
      wengue: { color: "Wengu\xE9", rejilla: "Wengu\xE9" },
      blanco: { color: "Blanco", rejilla: "Blanca" },
      nordico: { color: "N\xF3rdico", rejilla: "Gris Grafito" },
      // "Gris" es el mismo color que "Nórdico" para el Zenit (Jennifer, 2026-08-26).
      gris: { color: "N\xF3rdico", rejilla: "Gris Grafito" }
    }
  },
  astra: {
    modelo: "ASTRA",
    tapaBase: "Tapa entera en rejilla",
    tirador: "Habitual",
    colores: {
      roble: { color: "Roble", rejilla: "Beige" },
      cerezo: { color: "Cerezo", rejilla: "Marr\xF3n" },
      wengue: { color: "Wengu\xE9", rejilla: "Wengu\xE9" },
      blanco: { color: "Blanco", rejilla: "Blanca" },
      nordico: { color: "N\xF3rdico", rejilla: "Gris Grafito" }
    }
  },
  space_extra: {
    modelo: "SPACE GRAN CAPACIDAD",
    tapaBase: "Tapa entera en rejilla",
    tirador: null,
    colores: {
      blanco: { color: "Argos Blanco", rejilla: "Blanca" },
      beige: { color: "Argos Hielo", rejilla: "Beige" },
      marron: { color: "Argos Cuero", rejilla: "Marr\xF3n" },
      negro: { color: "Argos Negro", rejilla: "Negra" }
    }
  },
  space_apertura_lateral: {
    modelo: "SPACE APERTURA LATERAL",
    tapaBase: "Tapa entera en rejilla",
    tirador: "Habitual",
    colores: {
      blanco: { color: "Argos Blanco", rejilla: "Blanca" },
      beige: { color: "Argos Hielo", rejilla: "Beige" },
      marron: { color: "Argos Cuero", rejilla: "Marr\xF3n" },
      negro: { color: "Argos Negro", rejilla: "Negra" }
    }
  },
  space: {
    modelo: "SPACE",
    tapaBase: "Tapa entera en rejilla",
    tirador: "Habitual",
    colores: {
      blanco: { color: "Argos Blanco", rejilla: "Blanca" },
      beige: { color: "Argos Hielo", rejilla: "Beige" },
      marron: { color: "Argos Cuero", rejilla: "Marr\xF3n" },
      negro: { color: "Argos Negro", rejilla: "Negra" },
      gris: { color: "Argos Marengo", rejilla: "Grafito" }
    }
  },
  space_deluxe: {
    modelo: "SPACE DELUXE",
    tapaBase: "Tapa con borde Deluxe en rejilla",
    tirador: "Habitual",
    extra: ["BORDE DELUXE"],
    colores: {
      blanco: { color: "Argos Blanco", rejilla: "Blanca" },
      beige: { color: "Argos Hielo", rejilla: "Beige" },
      marron: { color: "Argos Cuero", rejilla: "Marr\xF3n" },
      negro: { color: "Argos Negro", rejilla: "Negra" },
      gris: { color: "Argos Marengo", rejilla: "Grafito" }
    }
  },
  magnum: {
    modelo: "MAGNUM",
    // "{color}" se sustituye por el color de fábrica real (Jennifer,
    // 2026-09-28: no "mismo color elegido", sino p. ej. "Argos Negro").
    tapaBase: "Tapa con borde Deluxe {color}",
    tirador: "Dos tirador natural",
    extra: ["BORDE DELUXE", "SISTEMA M\xD3VIL"],
    colores: {
      blanco: { color: "Argos Blanco", rejilla: "Blanca" },
      beige: { color: "Argos Hielo", rejilla: "Beige" },
      marron: { color: "Argos Cuero", rejilla: "Marr\xF3n" },
      negro: { color: "Argos Negro", rejilla: "Negra" },
      gris: { color: "Argos Polar", rejilla: "Grafito" }
    }
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
      marron: { color: "Argos Cuero", rejilla: "Marr\xF3n", modelo: "INITIAL" },
      "polipiel marron": { color: "Argos Cuero", rejilla: "Marr\xF3n", modelo: "INITIAL" },
      negro: { color: "Argos Negro", rejilla: "Negra", modelo: "INITIAL" },
      "polipiel negro": { color: "Argos Negro", rejilla: "Negra", modelo: "INITIAL" },
      gris: { color: "Argos Polar", rejilla: "Gris Antracita", modelo: "INITIAL" },
      "polipiel gris": { color: "Argos Polar", rejilla: "Gris Antracita", modelo: "INITIAL" },
      "polipiel beige": { color: "Argos Hielo", rejilla: "Beige", modelo: "INITIAL" },
      beige: { color: "Duna Lino", rejilla: "Tierra", modelo: "INITIAL DELUXE" },
      "tela beige": { color: "Duna Lino", rejilla: "Tierra", modelo: "INITIAL DELUXE" },
      cacao: { color: "Tela Duna Cocoa", rejilla: "Wengu\xE9", modelo: "INITIAL DELUXE" },
      "tela cacao": { color: "Tela Duna Cocoa", rejilla: "Wengu\xE9", modelo: "INITIAL DELUXE" },
      "gris antracita": { color: "Duna Onix", rejilla: "Grafito", modelo: "INITIAL DELUXE" },
      "tela gris antracita": { color: "Duna Onix", rejilla: "Grafito", modelo: "INITIAL DELUXE" },
      "gris niebla": { color: "Duna Koala", rejilla: "Grafito", modelo: "INITIAL DELUXE" },
      "tela gris niebla": { color: "Duna Koala", rejilla: "Grafito", modelo: "INITIAL DELUXE" }
    }
  }
};
var TELA_COLORES_UNIFICADOS = {
  cacao: { color: "Tela Duna Cocoa", rejilla: "Wengu\xE9" },
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
  star: { color: "Duna Dij\xF3n", rejilla: "Negra" }
};
var TELA_RECIPE_BASE = {
  modelo: "SPACE DELUXE",
  tapaBase: "Tapa con borde Deluxe",
  extra: ["BORDE DELUXE"],
  tiradorDefault: "U\xF1ero",
  tiradorTapaPartida: "Normal",
  colores: TELA_COLORES_UNIFICADOS
};
var CANAPE_RECIPES_TELA = {
  tela_tierra: TELA_RECIPE_BASE,
  tela_natural: TELA_RECIPE_BASE,
  tela_vivos: TELA_RECIPE_BASE
};
Object.assign(CANAPE_RECIPES, CANAPE_RECIPES_TELA);
var PREGUNTA_FORMATO_160 = "\xBFGEMELOS o PARTIDO?";
function necesitaFormato160(item) {
  if (!item || !item.product || item.product.product_type !== "Canap\xE9") return false;
  const key = matchCanapeRecipeKey(item.product.title);
  if (key === "zenit" || key === "astra" || /madera/i.test(item.product.title || "")) return false;
  return item.talla === "160X190" || item.talla === "160X200";
}
__name(necesitaFormato160, "necesitaFormato160");
function textoConFormato160(texto, formato) {
  const limpio = String(texto || "").replace(/\s*·\s*FORMATO:\s*(GEMELOS|PARTIDO)\s*$/i, "");
  return formato ? `${limpio}${limpio ? " \xB7 " : ""}FORMATO: ${formato}` : limpio;
}
__name(textoConFormato160, "textoConFormato160");
function esMedidaMayor(grande, pequena) {
  const dims = /* @__PURE__ */ __name((t) => {
    const m = String(t || "").toUpperCase().match(/^(\d+)X(\d+)$/);
    return m ? [Number(m[1]), Number(m[2])] : null;
  }, "dims");
  const g = dims(grande), p = dims(pequena);
  return !!(g && p && g[0] >= p[0] && g[1] >= p[1] && (g[0] > p[0] || g[1] > p[1]));
}
__name(esMedidaMayor, "esMedidaMayor");
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
__name(matchCanapeRecipeKey, "matchCanapeRecipeKey");
function detectTapaExtra(servicesText) {
  const t = normalizeKey(servicesText);
  const extras = [];
  if (t.includes("tapa partida")) extras.push("TAPA PARTIDA");
  if (t.includes("tapa reforzada")) extras.push("TAPA REFORZADA");
  return extras;
}
__name(detectTapaExtra, "detectTapaExtra");
function normalizeColorKey(color) {
  return normalizeKey(color).replace(/-/g, " ").replace(/\s+/g, " ").trim();
}
__name(normalizeColorKey, "normalizeColorKey");
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
__name(adivinarColorCanape, "adivinarColorCanape");
function buildCanapeMercancia(title, colorRaw, talla, servicesText) {
  const recipeKey = matchCanapeRecipeKey(title);
  if (!recipeKey) {
    return { texto: "", needsReview: true, reason: `No tengo la receta de fabricaci\xF3n para "${title}" \u2014 dime c\xF3mo pedirlo (modelo, color, tapa, tirador) o rellena "Mercanc\xEDa para pedir a f\xE1brica" a mano.` };
  }
  const recipe = CANAPE_RECIPES[recipeKey];
  const colorKey = normalizeColorKey(colorRaw);
  const entry = recipe.colores[colorKey];
  if (!entry) {
    return { texto: "", needsReview: true, reason: `No tengo mapeado el color "${colorRaw || "(sin color)"}" para "${title}" en la receta de f\xE1brica \u2014 dime el nombre de f\xE1brica, la rejilla y corrige "Mercanc\xEDa para pedir a f\xE1brica" a mano.` };
  }
  const modelo = entry.modelo || recipe.modelo;
  const extras = [...recipe.extra || []];
  const tapaExtras = detectTapaExtra(servicesText);
  extras.push(...tapaExtras);
  let tirador = recipe.tirador;
  if (recipe.tiradorDefault) {
    tirador = tapaExtras.includes("TAPA PARTIDA") ? recipe.tiradorTapaPartida : recipe.tiradorDefault;
  }
  if (modelo === "INITIAL DELUXE") extras.push("BORDE DELUXE");
  const tapa = modelo === "INITIAL DELUXE" ? "Tapa con borde Deluxe + rejilla" : modelo === "INITIAL" ? "Tapa entera en rejilla" : recipe.tapaBase.replace("{color}", entry.color);
  const partes = [
    `MODELO: ${modelo}`,
    `MEDIDA: ${talla || "(seg\xFAn SKU)"}`,
    `COLOR: ${entry.color}`,
    `TAPA: ${tapa} \u2014 Rejilla ${entry.rejilla}`
  ];
  if (tirador) partes.push(`TIRADOR: ${tirador}`);
  if (extras.length) partes.push(`EXTRA: ${extras.join(" + ")}`);
  if (recipeKey === "initial") partes.push("PATAS A 12.5CM COLOR NATURAL");
  return { texto: partes.join(" \xB7 "), needsReview: false };
}
__name(buildCanapeMercancia, "buildCanapeMercancia");
function parseCabeceroVariant(variantTitle) {
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
__name(parseCabeceroVariant, "parseCabeceroVariant");
var CABECERO_ACABADOS_COMUNES = {
  beige: "Duna Lino",
  cacao: "Duna Cocoa",
  "gris antracita": "Duna Onix",
  "gris niebla": "Duna Koala",
  oliva: "Duna Oliva",
  menta: "Duna Salvia",
  oceanic: "Duna Tulum",
  rosa: "Duna Flamingo",
  lavanda: "Duna Lavanda",
  star: "Duna Dij\xF3n"
};
var CABECERO_RECIPES = {
  aura: {
    modelo: "SIENNA",
    offset: 30,
    colores: {
      blanco: "Argos Blanco",
      beige: "Argos Hielo",
      gris: "Argos Polar",
      marron: "Argos Cuero",
      wengue: "Argos Wengu\xE9",
      negro: "Argos Negro"
    }
  },
  aria: { modelo: "ASHLEY", offset: 10, colores: CABECERO_ACABADOS_COMUNES },
  atenea: { modelo: "MERYL", offset: 10, colores: CABECERO_ACABADOS_COMUNES },
  iris: { modelo: "MARGOT", offset: 10, colores: CABECERO_ACABADOS_COMUNES },
  gaia: { modelo: "GRETA", offset: 10, colores: CABECERO_ACABADOS_COMUNES }
};
function matchCabeceroRecipeKey(title) {
  const t = normalizeKey(title);
  if (t.includes("aura")) return "aura";
  if (t.includes("aria")) return "aria";
  if (t.includes("atenea")) return "atenea";
  if (t.includes("iris")) return "iris";
  if (t.includes("gaia")) return "gaia";
  return null;
}
__name(matchCabeceroRecipeKey, "matchCabeceroRecipeKey");
function buildCabeceroMercancia(title, colorResuelto, tallaResuelta, rawVariantTitle, conInitial = false) {
  const recipeKey = matchCabeceroRecipeKey(title);
  if (!recipeKey) {
    return { texto: "", needsReview: true, reason: `No tengo la receta de fabricaci\xF3n para "${title}" \u2014 dime el modelo/acabado de f\xE1brica o rellena "Mercanc\xEDa para pedir a f\xE1brica" a mano.` };
  }
  const recipe = CABECERO_RECIPES[recipeKey];
  let color = colorResuelto;
  let medidaTexto = null;
  const parsed = parseCabeceroVariant(rawVariantTitle);
  if (parsed.medida) {
    medidaTexto = `${parsed.medida.ancho}cm/${parsed.medida.final}cm`;
    color = parsed.color || colorResuelto;
  } else {
    const anchoMatch = (tallaResuelta || "").match(/^(\d{2,3})/);
    if (anchoMatch) {
      const ancho = Number(anchoMatch[1]);
      medidaTexto = `${ancho}cm/${ancho + recipe.offset}cm`;
    }
  }
  const colorKey = normalizeKey(color);
  let acabado = recipe.colores ? recipe.colores[colorKey] : null;
  if (colorKey === "beige" && recipe.colores === CABECERO_ACABADOS_COMUNES) {
    acabado = conInitial ? "Duna Lino" : "Duna Alpaca";
  }
  if (!acabado) {
    return { texto: "", needsReview: true, reason: `No tengo mapeado el acabado "${color || "(sin color)"}" para "${title}" en la receta de f\xE1brica \u2014 dime el nombre de f\xE1brica y corrige "Mercanc\xEDa para pedir a f\xE1brica" a mano.` };
  }
  if (!medidaTexto) {
    return { texto: "", needsReview: true, reason: `No he podido calcular la medida de "${title}" (talla "${tallaResuelta}") \u2014 corrige "Mercanc\xEDa para pedir a f\xE1brica" a mano.` };
  }
  return { texto: `MODELO: ${recipe.modelo} \xB7 MEDIDA: ${medidaTexto} \xB7 ACABADO: ${acabado}`, needsReview: false };
}
__name(buildCabeceroMercancia, "buildCabeceroMercancia");
var SIMPLE_FABRICA_NOMBRES = [
  { match: "v5", nombre: "TOPPER V5" },
  { match: "seafoam", nombre: "SEA FOAM" },
  { match: "nordic", nombre: "NORDIC" },
  { match: "copos", nombre: "COPITOS" },
  { match: "cotton feather", nombre: "NUBE" },
  { match: "latex natural", nombre: "ALMOHADA DE LATEX" }
];
function buildSimpleMercancia(title, talla) {
  const t = normalizeKey(title);
  const found = SIMPLE_FABRICA_NOMBRES.find((r) => t.includes(r.match));
  if (!found) {
    return { texto: "", needsReview: true, reason: `No tengo el nombre de f\xE1brica para "${title}" \u2014 dime c\xF3mo se pide o rellena "Mercanc\xEDa para pedir a f\xE1brica" a mano.` };
  }
  return { texto: `${found.nombre}${talla ? " \xB7 MEDIDA: " + talla : ""}`, needsReview: false };
}
__name(buildSimpleMercancia, "buildSimpleMercancia");
var COLCHON_FABRICA_NOMBRES = {
  "Colch\xF3n de L\xE1tex Natural Natura": "LATEX NATURA N15 H18",
  "Colch\xF3n de L\xE1tex Natural Natura Premium": "LATEX NATURA N18 H21"
};
function buildColchonMercancia(stockModel, talla) {
  const nombre = COLCHON_FABRICA_NOMBRES[stockModel];
  if (!nombre) {
    return { texto: "", needsReview: true, reason: `No tengo el nombre de f\xE1brica para "${stockModel}" \u2014 dime c\xF3mo se pide o rellena "Mercanc\xEDa para pedir a f\xE1brica" a mano.` };
  }
  return { texto: `${nombre}${talla ? " \xB7 MEDIDA: " + talla : ""}`, needsReview: false };
}
__name(buildColchonMercancia, "buildColchonMercancia");
var CANAPE_FIJO_MODELO = "BASE ALPHA";
function buildCanapeFijoMercancia(colorRaw, talla) {
  const entry = TELA_COLORES_UNIFICADOS[normalizeColorKey(colorRaw)];
  if (!entry) {
    return { texto: "", needsReview: true, reason: `No tengo la correlaci\xF3n de color de f\xE1brica para "${colorRaw || "(sin color)"}" en Canap\xE9 Fijo \u2014 dime el color de f\xE1brica o rellena "Mercanc\xEDa para pedir a f\xE1brica" a mano.` };
  }
  return { texto: `MODELO - ${CANAPE_FIJO_MODELO} \xB7 MEDIDA: ${talla} \xB7 COLOR: ${entry.color} \xB7 REJILLA: ${entry.rejilla}`, needsReview: false };
}
__name(buildCanapeFijoMercancia, "buildCanapeFijoMercancia");
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
__name(longestCommonPrefix, "longestCommonPrefix");
function normalizeTalla(text) {
  if (!text) return "";
  const m = text.match(/(\d{2,3})\s*[xX]\s*(\d{2,3})/);
  if (m) return `${m[1]}X${m[2]}`;
  const bare = text.trim().match(/^\d{2,3}(\.\d+)?$/);
  if (bare) return text.trim();
  return "";
}
__name(normalizeTalla, "normalizeTalla");
function extractColor(text) {
  if (!text) return "";
  const m = text.match(/\d{2,3}\s*[xX]\s*\d{2,3}/);
  if (!m || m.index === 0) return "";
  return text.slice(0, m.index).replace(/[/\-\s]+$/, "").trim();
}
__name(extractColor, "extractColor");
function stockKey(stockModel, talla) {
  return `${stockModel}|${talla}`;
}
__name(stockKey, "stockKey");
function reservadasPedidoStock(ps) {
  return (ps.asignaciones || []).reduce((n, a) => n + (a.cantidad || 0), 0);
}
__name(reservadasPedidoStock, "reservadasPedidoStock");
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
__name(checkColchonesCoverage, "checkColchonesCoverage");
var ESTADOS_ACTIVOS = /* @__PURE__ */ new Set(["pendiente", "cubierto", "listo-seur"]);
function separarUnidades(backorders, entry, n, etiqueta) {
  if (n >= entry.cantidad) return entry;
  entry.cantidad -= n;
  const nuevo = { ...entry, id: `${String(entry.id).replace(/-cubierto$/, "")}-${etiqueta}${Date.now()}${Math.floor(Math.random() * 1e3)}`, cantidad: n };
  backorders.push(nuevo);
  return nuevo;
}
__name(separarUnidades, "separarUnidades");
function nextRefSuffix(current) {
  const n = parseInt(current, 10);
  return Number.isFinite(n) ? String(n + 1) : "2";
}
__name(nextRefSuffix, "nextRefSuffix");
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
    fecha: orderDate || (/* @__PURE__ */ new Date()).toISOString(),
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
    recogidaDestino: recogidaDestino || null
  });
}
__name(pushBackorder, "pushBackorder");
function activeProducts(products) {
  return Object.values(products).filter((p) => !p.excluido);
}
__name(activeProducts, "activeProducts");
function findBestPrefixMatch(segmentRaw, products) {
  const segment = segmentRaw.toUpperCase();
  const matches = [];
  for (const p of activeProducts(products)) {
    if (p.product_type === "Pack") continue;
    const candidates = [p.skuPrefix, ...p.altSkuPrefixes || []].filter((c) => c && c.length >= 4);
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
  const esLiquidacion = /* @__PURE__ */ __name((m) => /LIQUIDACI[OÓ]N/i.test(m.product.stockModel || m.product.title || ""), "esLiquidacion");
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
    candidates: ambiguous ? matches.map((m) => `${m.product.stockModel} (${m.prefix})`) : []
  };
}
__name(findBestPrefixMatch, "findBestPrefixMatch");
var NOR_PILLOW_RE = /^(\d*)NOR(\d+)$/i;
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
      componentes.push({ tipo: "almohada", product: nordic, talla: normalizeTalla(norMatch[2]), ambiguousMatch: false, color: "", qtyOverride: norMatch[1] ? Number(norMatch[1]) : 1 });
      continue;
    }
    const match = findBestPrefixMatch(seg, products);
    if (match) {
      const tipo = TYPE_MAP[match.product.product_type] || "otro";
      componentes.push({ tipo, product: match.product, talla: match.talla || packTalla || "", ambiguousMatch: !!match.ambiguous, color: tipo === "tapiceria" ? packColor : "" });
      if (match.ambiguous) {
        ambiguousNotes.push(`El c\xF3digo "${seg}" del pack coincide con varios art\xEDculos del cat\xE1logo: ${match.candidates.join(" / ")}. He elegido "${match.product.stockModel}" por defecto \u2014 conf\xEDrmame si es correcto o dime cu\xE1l es el que corresponde.`);
      }
    } else {
      unresolved++;
      ambiguousNotes.push(`El c\xF3digo "${seg}" del pack no coincide con ning\xFAn art\xEDculo del cat\xE1logo \u2014 este componente del pack NO se ha a\xF1adido a ning\xFAn pendiente. Rev\xEDsalo a mano y dime qu\xE9 modelo es (o a\xF1ade el alias que falta en el Cat\xE1logo) para poder incluirlo.`);
    }
  }
  return { componentes, needsReview: unresolved > 0 || componentes.length === 0, ambiguousNotes };
}
__name(resolvePackSku, "resolvePackSku");
function resolveItem(item, products) {
  const product = item.productId != null ? products[item.productId] : null;
  if (!product) return { tipo: "desconocido" };
  if (product.product_type === "Pack") {
    const { componentes, needsReview, ambiguousNotes } = resolvePackSku(item.sku, products, extractColor(item.variantTitle), normalizeTalla(item.variantTitle));
    for (const c of componentes) c.variantPack = item.variantTitle;
    return { tipo: "pack", componentes, needsReview, ambiguousNotes, qty: item.qty };
  }
  const tipo = TYPE_MAP[product.product_type] || "otro";
  if (product.product_type === "Cabecero") {
    const { medida, color } = parseCabeceroVariant(item.variantTitle);
    return { tipo, product, talla: medida ? medida.ancho : normalizeTalla(item.variantTitle), color: color || "", variantTitle: item.variantTitle, qty: item.qty };
  }
  return { tipo, product, talla: normalizeTalla(item.variantTitle), color: tipo === "tapiceria" ? extractColor(item.variantTitle) : "", variantTitle: item.variantTitle, qty: item.qty };
}
__name(resolveItem, "resolveItem");
function resolverItemReposicion(item, cambio, products) {
  if (!cambio) return resolveItem(item, products);
  const product = products[cambio.productId];
  if (!product || product.product_type === "Pack") return { tipo: "desconocido" };
  const tipo = TYPE_MAP[product.product_type] || "otro";
  const talla = String(cambio.talla || "").trim().toUpperCase();
  const color = tipo === "tapiceria" ? String(cambio.color || "").trim() : "";
  return { tipo, product, talla, color, variantTitle: [color, talla].filter(Boolean).join(" / "), qty: 1 };
}
__name(resolverItemReposicion, "resolverItemReposicion");
function resolveStockModel(query, mode, products) {
  const q = (query || "").trim().toUpperCase();
  if (!q) return null;
  if (mode === "sku") {
    let best = null;
    let bestLen = 0;
    for (const p of activeProducts(products)) {
      if (p.product_type === "Pack") continue;
      const candidates = [p.skuPrefix, ...p.altSkuPrefixes || []].filter((c) => c && c.length >= 3);
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
__name(resolveStockModel, "resolveStockModel");
var TARIFA_MARGEN_TRAMOS = [
  { anchos: [67, 80, 90], margen: 12 },
  { anchos: [105, 120], margen: 15 },
  { anchos: [135, 140, 150], margen: 18 },
  { anchos: [160, 180], margen: 25 },
  { anchos: [200], margen: 35 }
];
function tarifaMargenPorTalla(talla) {
  const ancho = Number(String(talla || "").split("X")[0]);
  const tramo = TARIFA_MARGEN_TRAMOS.find((t) => t.anchos.includes(ancho));
  return tramo ? tramo.margen : null;
}
__name(tarifaMargenPorTalla, "tarifaMargenPorTalla");
function round2(n) {
  return Math.round(n * 100) / 100;
}
__name(round2, "round2");
var TARIFA_SUSTITUTOS_GENERALES = { "67X180": "80X180" };
function sustitutoGeneralDeTalla(talla) {
  if (TARIFA_SUSTITUTOS_GENERALES[talla]) return TARIFA_SUSTITUTOS_GENERALES[talla];
  const m = /^(\d+)X180$/.exec(talla || "");
  return m ? m[1] + "X190" : null;
}
__name(sustitutoGeneralDeTalla, "sustitutoGeneralDeTalla");
var TARIFA_MODELO_DESCATALOGADO_USA_PRECIO_DE = {
  "Colch\xF3n Viscoel\xE1stico | 20cm | Termorregulable con Grafeno": { modelo: "4D", motivo: "descatalogado, precio temporal" }
};
var PLAZO_DIAS_REGLAS = {
  colchon: { enStock: 2, sinStock: 12 },
  almohada: { enStock: 2, sinStock: 7 },
  spring_zen: { enStock: 8, sinStock: 25 }
};
function calcularDiasPlazo(tipo, enStock) {
  if (tipo === "topper") return 7;
  const regla = PLAZO_DIAS_REGLAS[tipo] || PLAZO_DIAS_REGLAS.colchon;
  return enStock ? regla.enStock : regla.sinStock;
}
__name(calcularDiasPlazo, "calcularDiasPlazo");
var TARIFA_TALLAS_EXTRA_MODELO = {
  "Colch\xF3n Muelles Ensacados | 24cm | Una Cara | Generaci\xF3n Zen": ["160X180", "180X180"],
  "Colch\xF3n Muelles Ensacados | 27cm | Doble Cara | Par\xEDs Zen": ["67X180", "140X180", "160X180", "180X180"],
  "Colch\xF3n Muelles Ensacados | 30cm | Doble Cara | Zen Mandala Gran Hotel": ["140X180", "150X180", "160X180", "180X180"],
  "Colch\xF3n Muelles Ensacados | 30cm | Doble Cara | Zen Nirvana Gran Hotel": ["140X180", "150X180", "160X180", "180X180"],
  "Colch\xF3n Viscoel\xE1stico | 20cm | L\xE1tex Gel": ["160X180"],
  "4D": ["67X180", "140X180"],
  "Colch\xF3n Viscoel\xE1stico | 24cm | Doble cara | Ergo-Relax Plus": ["67X180"],
  "Colch\xF3n Viscoel\xE1stico | 20cm | Pharma-Therapy Soja": ["67X180", "200X200"],
  "Colch\xF3n Viscoel\xE1stico | 21cm | Bellagio Deluxe": ["200X200"],
  "Colch\xF3n Muelles Ensacados | 31cm | Doble Cara | Zen Natural": ["105X180", "120X180", "140X180", "150X180", "160X180", "180X180"],
  "Colch\xF3n Muelles Ensacados | 33cm | Doble Cara | Efecto Nube | Spring Zen": ["105X180", "120X180", "140X180", "150X180", "160X180", "180X180"]
};
var TARIFA_SUSTITUTOS_POR_MODELO = {
  "Colch\xF3n Viscoel\xE1stico | 15cm | Pharma-Therapy Soja Slim - Cama Nido": {
    "80X180": "90X180",
    "80X190": "90X190",
    "80X200": "90X200"
  }
};
var TARIFA_ENVIO_SUSTITUTO_MODELO = {
  "Colch\xF3n Viscoel\xE1stico | 15cm | Pharma-Therapy Soja Slim - Cama Nido": "Colch\xF3n Viscoel\xE1stico | 20cm | Pharma-Therapy Soja"
};
var TARIFA_ENVIO_FIJO_MODELO = {
  "Colch\xF3n Muelles Ensacados | 33cm | Doble Cara | Efecto Nube | Spring Zen": 42
};
function calcularPrecioBezen(coste, envio, divisorMargen = 0.7, margenLabel = "30%") {
  const pasos = [];
  pasos.push({ label: "Precio de coste", valor: round2(coste) });
  pasos.push({ label: "Precio de env\xEDo", valor: round2(envio) });
  const suma = coste + envio;
  pasos.push({ label: "Coste + env\xEDo", valor: round2(suma) });
  const conMargen = suma / divisorMargen;
  pasos.push({ label: `\xF7 ${divisorMargen} (${margenLabel} margen)`, valor: round2(conMargen) });
  const conPublicidad = conMargen / 0.77;
  pasos.push({ label: "\xF7 0,77 (23% publicidad)", valor: round2(conPublicidad) });
  const conIva = conPublicidad * 1.21;
  pasos.push({ label: "\xD7 1,21 (IVA)", valor: round2(conIva) });
  const final = conIva * 1.04;
  pasos.push({ label: "\xD7 1,04 (coste financieras)", valor: round2(final) });
  const redondeado = Math.ceil(final);
  pasos.push({ label: "Redondeo (al alza, \u20AC entero)", valor: redondeado });
  return { precio: redondeado, pasos };
}
__name(calcularPrecioBezen, "calcularPrecioBezen");
function calcularPrecioPlataforma(coste, envio, talla, divisorComision) {
  const pasos = [];
  const margen = tarifaMargenPorTalla(talla);
  if (margen == null) {
    return { precio: null, pasos: [], error: "Sin tramo de margen definido para la talla " + talla + "." };
  }
  pasos.push({ label: "Precio de coste", valor: round2(coste) });
  pasos.push({ label: "Precio de env\xEDo", valor: round2(envio) });
  const suma = coste + envio;
  pasos.push({ label: "Coste + env\xEDo", valor: round2(suma) });
  const conMargen = suma + margen;
  pasos.push({ label: `+ ${margen}\u20AC margen`, valor: round2(conMargen) });
  const conComision = conMargen / divisorComision;
  pasos.push({ label: `\xF7 ${divisorComision} (comisi\xF3n plataforma)`, valor: round2(conComision) });
  const final = conComision * 1.21;
  pasos.push({ label: "\xD7 1,21 (IVA)", valor: round2(final) });
  const redondeado = round2(Math.ceil(final) - 0.01);
  pasos.push({ label: "Redondeo (.99 escala superior)", valor: redondeado });
  return { precio: redondeado, pasos };
}
__name(calcularPrecioPlataforma, "calcularPrecioPlataforma");
var TARIFA_MODELOS_MUELLES = [
  "Colch\xF3n Muelles Ensacados | 24cm | Una Cara | Generaci\xF3n Zen",
  "Colch\xF3n Viscoel\xE1stico | 30cm | Origin Zen",
  "Colch\xF3n Muelles Ensacados | 27cm | Doble Cara | Par\xEDs Zen",
  "Colch\xF3n Muelles Ensacados | 33cm | Doble Cara | Efecto Nube | Spring Zen",
  "Colch\xF3n Muelles Ensacados | 29cm | Doble Cara | Supreme Zen",
  "Colch\xF3n Muelles Ensacados | 30cm | Doble Cara | Zen Mandala Gran Hotel",
  "Colch\xF3n Muelles Ensacados | 31cm | Doble Cara | Zen Natural",
  "Colch\xF3n Muelles Ensacados | 30cm | Doble Cara | Zen Nirvana Gran Hotel"
];
function tarifaTachadoDivisor(talla) {
  const ancho = Number(String(talla || "").split("X")[0]);
  if ([67, 80, 90, 105].includes(ancho)) return 0.6;
  if ([120, 135, 140, 150].includes(ancho)) return 0.5;
  if ([160, 180, 200].includes(ancho)) return 0.4;
  return null;
}
__name(tarifaTachadoDivisor, "tarifaTachadoDivisor");
function calcularPrecioPlataformaMuellesEs(precioBezen) {
  const pasos = [];
  pasos.push({ label: "Precio BEZEN", valor: precioBezen });
  const final = round2(precioBezen + 5);
  pasos.push({ label: "+ 5\u20AC (plataformas Espa\xF1a)", valor: final });
  return { precio: final, pasos };
}
__name(calcularPrecioPlataformaMuellesEs, "calcularPrecioPlataformaMuellesEs");
var TARIFA_BEZEN_REFERENCIA_MODELO = {
  "Colch\xF3n Muelles Ensacados | 30cm | Doble Cara | Zen Nirvana Gran Hotel": {
    modeloBase: "Colch\xF3n Muelles Ensacados | 30cm | Doble Cara | Zen Mandala Gran Hotel",
    etiquetaBase: "Zen Mandala",
    diferencia: 15
  }
};
function calcularPrecioPlataformaMuellesResto(coste, envio, divisorComision) {
  const pasos = [];
  pasos.push({ label: "Precio de coste", valor: round2(coste) });
  pasos.push({ label: "Precio de env\xEDo", valor: round2(envio) });
  const suma = coste + envio;
  pasos.push({ label: "Coste + env\xEDo", valor: round2(suma) });
  const conMargen = suma / 0.7;
  pasos.push({ label: "\xF7 0,70 (30% margen)", valor: round2(conMargen) });
  const conComision = conMargen / divisorComision;
  pasos.push({ label: `\xF7 ${divisorComision} (comisi\xF3n plataforma)`, valor: round2(conComision) });
  const final = conComision * 1.21;
  pasos.push({ label: "\xD7 1,21 (IVA)", valor: round2(final) });
  const redondeado = round2(Math.ceil(final) - 0.01);
  pasos.push({ label: "Redondeo (.99 escala superior)", valor: redondeado });
  return { precio: redondeado, pasos };
}
__name(calcularPrecioPlataformaMuellesResto, "calcularPrecioPlataformaMuellesResto");
var CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let c = 4294967295;
  for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
__name(crc32, "crc32");
async function deflateRawBytes(bytes) {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const full = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  return full.slice(2, full.length - 4);
}
__name(deflateRawBytes, "deflateRawBytes");
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
    lv.setUint32(0, 67324752, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 8, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 33, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBuf.length, true);
    lv.setUint16(28, 0, true);
    localParts.push(local, nameBuf, compressed);
    const central = new Uint8Array(46);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 33639248, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 8, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 33, true);
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
  ev.setUint32(0, 101010256, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralBuf.length, true);
  ev.setUint32(16, centralDirStart, true);
  ev.setUint16(20, 0, true);
  return concatBytes([...localParts, centralBuf, eocd]);
}
__name(buildZip, "buildZip");
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
__name(concatBytes, "concatBytes");
function xmlEscape(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(xmlEscape, "xmlEscape");
async function buildXlsxBytes(headers, rows) {
  const encoder = new TextEncoder();
  const colLetter = /* @__PURE__ */ __name((i) => String.fromCharCode(65 + i), "colLetter");
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
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/></cellXfs></styleSheet>`;
  return buildZip([
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { name: "_rels/.rels", data: encoder.encode(rootRels) },
    { name: "xl/workbook.xml", data: encoder.encode(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels) },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(sheetXml) },
    { name: "xl/styles.xml", data: encoder.encode(stylesXml) }
  ]);
}
__name(buildXlsxBytes, "buildXlsxBytes");
var InventoryStore = class _InventoryStore {
  static {
    __name(this, "InventoryStore");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async load(key, fallback) {
    const value = await this.state.storage.get(key);
    return value === void 0 ? fallback : value;
  }
  // Historial de movimientos de stock: tanto altas/bajas manuales como los
  // descuentos automáticos por venta y las liberaciones al enviar un
  // pedido. Se guarda con lo justo para poder auditar quién/qué lo generó,
  // recortando a los últimos MAX_MOVEMENTS para no crecer sin límite.
  async logMovement({ stockModel, talla, campo, delta, resultante, origen, usuario, orderNumber, platform, orderRef }) {
    const movements = await this.load("movements", []);
    movements.push({
      id: crypto.randomUUID(),
      fecha: (/* @__PURE__ */ new Date()).toISOString(),
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
      orderRef: orderRef || null
    });
    const MAX_MOVEMENTS = 1e3;
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
    const usarAbiertoMatch = url.pathname.match(/^\/backorders\/([^/]+)\/usar-abierto$/);
    if (usarAbiertoMatch && method === "POST") {
      return this.usarAbierto(decodeURIComponent(usarAbiertoMatch[1]), await request.json().catch(() => ({})));
    }
    if (url.pathname === "/stock/adjust-by-lookup" && method === "POST") {
      return this.adjustStockByLookup(await request.json());
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
      return this.resolveBackorder(decodeURIComponent(resolveMatch[1]));
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
    if (url.pathname === "/backorders/no-salio" && method === "POST") {
      const { orderId, seleccion } = await request.json();
      const backorders = await this.load("backorders", []);
      const stock = await this.load("stock", {});
      const esDeSeur = /* @__PURE__ */ __name((b) => String(b.orderId) === String(orderId) && b.tipo === "colchon" && !b.reposicion && !b.gestoComercial && (b.estado === "listo-seur" || b.estado === "cubierto" && String(b.id).endsWith("-cubierto")), "esDeSeur");
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
      if (!afectados.length) return Response.json({ ok: false, error: "Este pedido no tiene ning\xFAn colch\xF3n preparado o cubierto con stock para SEUR." }, { status: 409 });
      for (const entry of afectados) {
        const key = stockKey(entry.stockModel, entry.talla);
        const row = stock[key] || { stockModel: entry.stockModel, talla: entry.talla, cantidad: 0, vendidoPendiente: 0 };
        row.vendidoPendiente = (row.vendidoPendiente || 0) + entry.cantidad;
        stock[key] = row;
        await this.logMovement({
          stockModel: entry.stockModel,
          talla: entry.talla,
          campo: "vendidoPendiente",
          delta: entry.cantidad,
          resultante: row.vendidoPendiente,
          origen: "no-salio",
          orderNumber: entry.orderNumber,
          platform: entry.platform,
          orderRef: entry.orderRef
        });
        entry.estado = "pendiente";
        entry.cargaId = null;
        entry.recibidoFabrica = false;
        entry.fechaRecibido = null;
        entry.refSuffix = nextRefSuffix(entry.refSuffix);
        entry.noSalio = (/* @__PURE__ */ new Date()).toISOString();
      }
      await this.state.storage.put("stock", stock);
      await this.state.storage.put("backorders", backorders);
      const quedanEnCarga = backorders.some(esDeSeur);
      return Response.json({ ok: true, afectados, quedanEnCarga });
    }
    if (url.pathname === "/admin/cargar-furniture-manual" && method === "POST") {
      const { orderId, orderNumber, platform, orderRef, orderDate, articulos } = await request.json();
      if (!orderId || !Array.isArray(articulos) || !articulos.length) return Response.json({ ok: false, error: "Faltan orderId o art\xEDculos." }, { status: 400 });
      const backorders = await this.load("backorders", []);
      const creados = [];
      for (const a of articulos) {
        const id = `${orderId}-${stockKey(a.stockModel, a.talla)}-manual`;
        if (backorders.some((b2) => b2.id === id)) continue;
        pushBackorder(backorders, {
          id,
          orderId,
          orderNumber,
          platform,
          orderRef,
          orderDate,
          stockModel: a.stockModel,
          talla: a.talla,
          color: a.color || "",
          tipo: a.tipo,
          cantidad: a.cantidad || 1,
          esPack: !!a.esPack,
          proveedor: a.proveedor || null,
          referencia: a.referencia || null,
          estado: "cubierto",
          recibidoFabrica: true,
          tipoEnvio: a.tipo === "colchon" ? "FUR" : void 0
        });
        const b = backorders.find((x) => x.id === id);
        b.cargaManual = true;
        creados.push(b);
      }
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, creados });
    }
    const cancelarUnidadesMatch = url.pathname.match(/^\/backorders\/([^/]+)\/cancelar-unidades$/);
    if (cancelarUnidadesMatch && method === "POST") {
      const { unidades } = await request.json().catch(() => ({}));
      const backorders = await this.load("backorders", []);
      const entry = backorders.find((b) => b.id === decodeURIComponent(cancelarUnidadesMatch[1]));
      if (!entry) return new Response("not found", { status: 404 });
      if (!ESTADOS_ACTIVOS.has(entry.estado)) return Response.json({ ok: false, error: "Este pendiente ya no est\xE1 activo." }, { status: 409 });
      const n = Math.min(Math.max(1, Math.floor(Number(unidades) || entry.cantidad)), entry.cantidad);
      const cancelado = await this.cancelarUnidadesDe(backorders, entry, n);
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, cancelado });
    }
    if (url.pathname === "/backorders/cancelar-por-item" && method === "POST") {
      const { orderId, item, unidades } = await request.json();
      const products = await this.load("products", {});
      const backorders = await this.load("backorders", []);
      const resolved = resolveItem(item || {}, products);
      const objetivos = resolved.tipo === "pack" ? resolved.componentes.map((c) => ({ stockModel: c.product.stockModel, talla: c.talla })) : resolved.product ? [{ stockModel: resolved.product.stockModel, talla: resolved.talla }] : [];
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
      const { referencia } = await request.json();
      return this.setBackorderReferencia(decodeURIComponent(referenciaMatch[1]), referencia);
    }
    const formatoMatch = url.pathname.match(/^\/backorders\/([^/]+)\/formato160$/);
    if (formatoMatch && method === "POST") {
      const { formato } = await request.json();
      if (formato !== "GEMELOS" && formato !== "PARTIDO") return Response.json({ ok: false, error: "Formato no v\xE1lido." }, { status: 400 });
      const backorders = await this.load("backorders", []);
      const entry = backorders.find((b) => b.id === decodeURIComponent(formatoMatch[1]));
      if (!entry) return new Response("not found", { status: 404 });
      entry.formato160 = formato;
      entry.necesitaFormato160 = false;
      entry.formato160Elegido = (/* @__PURE__ */ new Date()).toISOString();
      entry.mercanciaFabrica = textoConFormato160(entry.mercanciaFabrica, formato);
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, entry });
    }
    const reservaMatch = url.pathname.match(/^\/backorders\/([^/]+)\/reserva-enviada$/);
    if (reservaMatch && method === "POST") {
      const backorders = await this.load("backorders", []);
      const entry = backorders.find((b) => b.id === decodeURIComponent(reservaMatch[1]));
      if (!entry) return new Response("not found", { status: 404 });
      const { fecha } = await request.json().catch(() => ({}));
      entry.reservaEnviada = fecha && !isNaN(Date.parse(fecha)) ? new Date(fecha).toISOString() : (/* @__PURE__ */ new Date()).toISOString();
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
    if (url.pathname === "/pesos" && method === "GET") {
      const overrides = await this.load("pesosSeurOverrides", {});
      const skus = /* @__PURE__ */ new Set([...Object.keys(PESOS_SEUR_DEFAULT), ...Object.keys(overrides)]);
      const lista = [...skus].sort().map((sku) => ({
        sku,
        peso: pesoSeurPorUnidad(sku, overrides),
        esManual: overrides[sku] != null
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
    if (url.pathname === "/admin/reset-polival-counter" && method === "POST") {
      await this.state.storage.put("polivalReferenciaCounter", 0);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/admin/set-polival-counter" && method === "POST") {
      const { valor } = await request.json();
      if (!Number.isInteger(valor) || valor < 0) return new Response("valor inv\xE1lido", { status: 400 });
      await this.state.storage.put("polivalReferenciaCounter", valor);
      return Response.json({ ok: true, valor });
    }
    if (url.pathname === "/backorders/pedido-stock" && method === "POST") {
      return this.crearPedidoStock(await request.json());
    }
    if (url.pathname === "/backorders/set-campo" && method === "POST") {
      const { id, referencia, mercanciaFabrica, tapaStock, estado, recibidoFabrica, revision, cuarentena, previsionEntrega, cantidad, enStock } = await request.json();
      const backorders = await this.load("backorders", []);
      const entry = backorders.find((b) => b.id === id);
      if (!entry) return new Response("not found", { status: 404 });
      if (estado !== void 0 && ["pendiente", "cubierto", "servido"].includes(estado)) entry.estado = estado;
      if (recibidoFabrica !== void 0) entry.recibidoFabrica = !!recibidoFabrica;
      if (cantidad !== void 0 && Number(cantidad) >= 1) entry.cantidad = Math.floor(Number(cantidad));
      if (enStock !== void 0) entry.enStock = Math.max(0, Math.floor(Number(enStock) || 0)) || void 0;
      if (revision !== void 0) entry.revision = revision ? { motivo: String(revision.motivo || ""), desde: (/* @__PURE__ */ new Date()).toISOString() } : null;
      if (cuarentena !== void 0) entry.cuarentena = cuarentena ? { motivo: String(cuarentena.motivo || ""), usuario: cuarentena.usuario || null, desde: (/* @__PURE__ */ new Date()).toISOString() } : null;
      if (referencia !== void 0) entry.referencia = referencia;
      if (mercanciaFabrica !== void 0) entry.mercanciaFabrica = mercanciaFabrica;
      if (tapaStock !== void 0) entry.tapaStock = !!tapaStock;
      if (previsionEntrega !== void 0) entry.previsionEntrega = previsionEntrega || null;
      await this.state.storage.put("backorders", backorders);
      return Response.json(entry);
    }
    if (url.pathname === "/backorders/set-carga" && method === "POST") {
      const { id, cargaId } = await request.json();
      const backorders = await this.load("backorders", []);
      const entry = backorders.find((b) => b.id === id);
      if (!entry) return Response.json({ ok: false, error: "Art\xEDculo no encontrado." }, { status: 404 });
      entry.cargaId = cargaId;
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, backorder: entry });
    }
    if (url.pathname === "/admin/crear-pendiente-manual" && method === "POST") {
      return this.crearPendienteManual(await request.json());
    }
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
    if (url.pathname === "/admin/reposicion/preview" && method === "POST") {
      return this.resolverItemPreview(await request.json());
    }
    if (url.pathname === "/admin/reposicion/foto" && method === "POST") {
      return this.adjuntarFotoReposicion(await request.json());
    }
    const envioAparteMatch = url.pathname.match(/^\/backorders\/([^/]+)\/envio-aparte$/);
    if (envioAparteMatch && method === "POST") {
      const { aparte } = await request.json();
      const backorders = await this.load("backorders", []);
      const b = backorders.find((x) => x.id === decodeURIComponent(envioAparteMatch[1]));
      if (!b) return Response.json({ ok: false, error: "Art\xEDculo no encontrado." }, { status: 404 });
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
      if (!b) return Response.json({ ok: false, error: "Reposici\xF3n no encontrada." }, { status: 404 });
      if (b.cargaId) return Response.json({ ok: false, error: "Ya est\xE1 en una carga." }, { status: 400 });
      b.cargaId = cargaId;
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/admin/reposicion/carga-remove" && method === "POST") {
      const { id } = await request.json();
      const backorders = await this.load("backorders", []);
      const b = backorders.find((x) => x.id === id);
      if (!b) return Response.json({ ok: false, error: "Reposici\xF3n no encontrada." }, { status: 404 });
      b.cargaId = null;
      await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/admin/gesto-comercial" && method === "POST") {
      return this.crearGestoComercial(await request.json());
    }
    if (url.pathname === "/tarifas/coste" && method === "POST") {
      return this.setTarifaCoste(await request.json());
    }
    if (url.pathname === "/tarifas/envio" && method === "POST") {
      return this.setTarifaEnvio(await request.json());
    }
    if (url.pathname === "/tarifas/periodo-activo" && method === "POST") {
      return this.setTarifaPeriodoActivo(await request.json());
    }
    if (url.pathname === "/tarifas/costes" && method === "POST") {
      const { items } = await request.json();
      const vistos = /* @__PURE__ */ new Map();
      for (const it of items || []) {
        const k = it.stockModel + "|" + it.talla;
        if (vistos.has(k)) continue;
        const t = await this.calcularTarifaModelo(it.stockModel, it.talla);
        vistos.set(k, { stockModel: it.stockModel, talla: it.talla, coste: t.coste ?? null, sustituto: t.costeSustituto || null, proveedor: t.costeProveedor || null, periodo: t.costePeriodo || null });
      }
      return Response.json({ ok: true, costes: [...vistos.values()] });
    }
    if (url.pathname === "/tarifas/tabla" && method === "GET") {
      return this.getTarifaTabla(url.searchParams.get("stockModel"));
    }
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
      let filasPlataforma = 0;
      const plataformaExportaciones = await this.load("plataformaExportaciones", {});
      for (const cfg of Object.values(plataformaExportaciones)) {
        for (const fila of cfg.filas || []) {
          if (fila.stockModel === desde) {
            fila.stockModel = hasta;
            filasPlataforma++;
          }
        }
      }
      await this.state.storage.put("plataformaExportaciones", plataformaExportaciones);
      let filasPlazos = 0;
      const plazosExportaciones = await this.load("plazosExportaciones", {});
      for (const cfg of Object.values(plazosExportaciones)) {
        for (const fila of cfg.filas || []) {
          if (fila.stockModel === desde) {
            fila.stockModel = hasta;
            filasPlazos++;
          }
        }
      }
      await this.state.storage.put("plazosExportaciones", plazosExportaciones);
      let pendientesRenombrados = 0;
      const backorders = await this.load("backorders", []);
      for (const b of backorders) {
        if (b.stockModel === desde) {
          b.stockModel = hasta;
          pendientesRenombrados++;
        }
      }
      if (pendientesRenombrados) await this.state.storage.put("backorders", backorders);
      return Response.json({ ok: true, cambiosCoste: cambios, envioCambiado, filasPlataforma, filasPlazos, pendientesRenombrados });
    }
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
    if (url.pathname === "/plazos/marketplace/cargar" && method === "POST") {
      return this.cargarPlazosMarketplace(await request.json());
    }
    if (url.pathname === "/plazos/marketplace/export" && method === "GET") {
      return this.exportarPlazosMarketplace();
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
        noStock: false
      };
      entry.title = sp.title;
      entry.product_type = sp.product_type;
      if (!entry.skuPrefixManual) entry.skuPrefix = longestCommonPrefix(skus);
      entry.tallas = [...new Set((sp.variants || []).map((v) => normalizeTalla(v.title)).filter(Boolean))];
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
    if (exceptionFurniture !== void 0) entry.exceptionFurniture = !!exceptionFurniture;
    if (noStock !== void 0) entry.noStock = !!noStock;
    if (excluido !== void 0) entry.excluido = !!excluido;
    if (stockModel !== void 0 && stockModel.trim()) entry.stockModel = stockModel.trim();
    if (skuPrefix !== void 0 && skuPrefix.trim()) {
      entry.skuPrefix = skuPrefix.trim();
      entry.skuPrefixManual = true;
    }
    if (proveedor !== void 0) {
      entry.proveedor = proveedor || null;
      entry.proveedorManual = true;
    }
    if (referenciaTipo !== void 0) {
      entry.referenciaTipo = referenciaTipo || null;
      entry.referenciaTipoManual = true;
    }
    if (altSkuPrefixes !== void 0) {
      entry.altSkuPrefixes = altSkuPrefixes.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    }
    if (altTitleKeywords !== void 0) {
      entry.altTitleKeywords = altTitleKeywords.split(",").map((s) => s.trim()).filter(Boolean);
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
            stock[key] = stock[oldKey] ? { ...stock[oldKey], stockModel: entry.stockModel } : { stockModel: entry.stockModel, talla, cantidad: 0, vendidoPendiente: 0 };
          }
        }
      }
      if (entry.noStock && !wasNoStock || entry.stockModel !== oldStockModel) {
        const stillNeeded = /* @__PURE__ */ new Set();
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
          orderRef
        });
      }
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
        tipoEnvio: item.tipo === "colchon" && (agencia === "FURNITURE" || esPack) ? "FUR" : void 0,
        platform,
        orderRef
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
          orderRef
        });
      }
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
      let restante = falta;
      if (item.tipo === "colchon") {
        const pedidosStock = backorders.filter((b) => b.paraStock && b.estado === "pendiente" && !b.recibidoFabrica && stockKey(b.stockModel, b.talla) === key).sort((a, b) => String(a.orderDate || "").localeCompare(String(b.orderDate || "")));
        let n = 0;
        for (const ps of pedidosStock) {
          if (restante <= 0) break;
          const libres = ps.cantidad - reservadasPedidoStock(ps);
          if (libres <= 0) continue;
          const tomar = Math.min(libres, restante);
          const id = `${idBase}-pstock${n ? n + 1 : ""}`;
          n++;
          pushBackorder(backorders, {
            id,
            orderId,
            orderNumber,
            stockModel: item.product.stockModel,
            talla: item.talla,
            color: item.color,
            tipo: item.tipo,
            cantidad: tomar,
            orderDate,
            esPack,
            proveedor: ps.proveedor,
            needsDecision,
            refSuffix,
            platform,
            orderRef,
            tipoEnvio: item.product.exceptionFurniture ? "FUR" : void 0
          });
          const nuevo = backorders.find((b) => b.id === id);
          nuevo.stockPedidoId = ps.id;
          nuevo.pedidoGenerado = true;
          nuevo.fechaPedidoFabrica = ps.fechaPedidoFabrica || null;
          ps.asignaciones = [...ps.asignaciones || [], { backorderId: id, orderId, orderNumber, platform, orderRef, cantidad: tomar }];
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
          tipoEnvio: item.tipo === "colchon" && item.product.exceptionFurniture ? "FUR" : void 0
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
    if (!validas.length) return Response.json({ ok: false, error: "No hay l\xEDneas." }, { status: 400 });
    const backorders = await this.load("backorders", []);
    const stock = await this.load("stock", {});
    const ahora = /* @__PURE__ */ new Date();
    const ts = ahora.getTime();
    const fechaTxt = ahora.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit" });
    const creados = [];
    for (const l of validas) {
      const talla = normalizeTalla(l.talla) || String(l.talla).toUpperCase();
      const key = stockKey(l.stockModel, talla);
      const cantidad = Math.floor(Number(l.cantidad));
      const id = `STOCK-${ts}-${key}`;
      pushBackorder(backorders, {
        id,
        orderId: `STOCK-${ts}`,
        orderNumber: null,
        stockModel: l.stockModel,
        talla,
        tipo: "colchon",
        cantidad,
        orderDate: ahora.toISOString(),
        esPack: false,
        proveedor: prov,
        platform: "STOCK",
        orderRef: "PEDIDO STOCK " + fechaTxt
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
    const ahora = (/* @__PURE__ */ new Date()).toISOString();
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
    pushBackorder(backorders, {
      id: `${orderId}-${key}`,
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
      tipoEnvio: item.tipo === "colchon" && item.product.exceptionFurniture ? "FUR" : void 0
    });
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
          orderRef: b.orderRef
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
      if (b.needsDecision === void 0) {
        b.needsDecision = b.tipo === "colchon" && !!b.esPack;
        actualizados++;
      }
      if (b.pendingDecision === void 0) {
        b.pendingDecision = b.needsDecision;
        actualizados++;
      } else if (!b.needsDecision && b.pendingDecision) {
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
      return Response.json({ error: 'No se ha encontrado ning\xFAn modelo que coincida con "' + query + '".' }, { status: 404 });
    }
    const tallaNorm = normalizeTalla(talla) || (talla || "").trim().toUpperCase();
    if (!tallaNorm) return Response.json({ error: "Indica una talla v\xE1lida." }, { status: 400 });
    const abiertos = await this.load("abiertos", {});
    const key = stockKey(stockModel, tallaNorm);
    const row = abiertos[key] || { stockModel, talla: tallaNorm, cantidad: 0, nota: "" };
    row.cantidad = Math.max(0, (row.cantidad || 0) + Number(delta || 0));
    if (nota !== void 0) row.nota = String(nota || "");
    row.actualizado = (/* @__PURE__ */ new Date()).toISOString();
    if (row.cantidad === 0 && !row.nota) delete abiertos[key];
    else abiertos[key] = row;
    await this.state.storage.put("abiertos", abiertos);
    if (Number(delta)) {
      await this.logMovement({
        stockModel,
        talla: tallaNorm,
        campo: "abiertos",
        delta: Number(delta),
        resultante: row.cantidad,
        origen: "manual",
        usuario: usuario || null
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
    const base = _InventoryStore.modeloBase(stockModel);
    return Object.keys(abiertos).find((k) => abiertos[k].talla === talla && _InventoryStore.modeloBase(abiertos[k].stockModel) === base) || null;
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
    if (entry.desdeAbierto) return Response.json({ ok: false, error: "Este colch\xF3n ya sale de un abierto." }, { status: 409 });
    const conEnrollado = entry.estado === "cubierto" && String(entry.id).endsWith("-cubierto") && !entry.transformadoDesde;
    if (entry.estado !== "pendiente" && !conEnrollado) {
      return Response.json({ ok: false, error: "Este colch\xF3n ya no est\xE1 pendiente." }, { status: 409 });
    }
    const n = entry.cantidad || 1;
    const abiertos = await this.load("abiertos", {});
    const keyAbierto = _InventoryStore.claveAbierto(abiertos, entry.stockModel, entry.talla);
    if (!keyAbierto || abiertos[keyAbierto].cantidad < n) {
      return Response.json({ ok: false, error: `No hay ${n} abierto(s) de ${entry.stockModel} ${entry.talla}.` }, { status: 409 });
    }
    const modeloAbierto = abiertos[keyAbierto].stockModel;
    entry.notaAbierto = abiertos[keyAbierto].nota || "";
    abiertos[keyAbierto].cantidad -= n;
    const quedan = abiertos[keyAbierto].cantidad;
    if (quedan === 0 && !abiertos[keyAbierto].nota) delete abiertos[keyAbierto];
    await this.state.storage.put("abiertos", abiertos);
    await this.logMovement({
      stockModel: modeloAbierto,
      talla: entry.talla,
      campo: "abiertos",
      delta: -n,
      resultante: quedan,
      origen: "abierto",
      usuario: usuario || null,
      orderNumber: entry.orderNumber,
      platform: entry.platform,
      orderRef: entry.orderRef
    });
    const key = stockKey(entry.stockModel, entry.talla);
    const stock = await this.load("stock", {});
    const row = stock[key] || { stockModel: entry.stockModel, talla: entry.talla, cantidad: 0, vendidoPendiente: 0 };
    if (conEnrollado) {
      const antes = row.cantidad || 0;
      row.cantidad = antes + n;
      await this.logMovement({
        stockModel: entry.stockModel,
        talla: entry.talla,
        campo: "cantidad",
        delta: n,
        resultante: row.cantidad,
        origen: "abierto",
        usuario: usuario || null,
        orderNumber: entry.orderNumber,
        platform: entry.platform,
        orderRef: entry.orderRef
      });
    } else {
      const antes = row.vendidoPendiente || 0;
      row.vendidoPendiente = Math.max(0, antes - n);
      await this.logMovement({
        stockModel: entry.stockModel,
        talla: entry.talla,
        campo: "vendidoPendiente",
        delta: row.vendidoPendiente - antes,
        resultante: row.vendidoPendiente,
        origen: "abierto",
        usuario: usuario || null,
        orderNumber: entry.orderNumber,
        platform: entry.platform,
        orderRef: entry.orderRef
      });
    }
    stock[key] = row;
    await this.state.storage.put("stock", stock);
    entry.desdeAbierto = true;
    entry.enrolladoDevuelto = conEnrollado;
    entry.fechaAbierto = (/* @__PURE__ */ new Date()).toISOString();
    entry.estado = "cubierto";
    entry.recibidoFabrica = true;
    entry.fechaRecibido = entry.fechaRecibido || entry.fechaAbierto;
    entry.tipoEnvio = "FUR";
    entry.reservaEnviada = null;
    await this.state.storage.put("backorders", backorders);
    return Response.json({ ok: true, entry });
  }
  async adjustStockByLookup({ query, mode, talla, delta, usuario }) {
    const products = await this.load("products", {});
    const stockModel = resolveStockModel(query, mode, products);
    if (!stockModel) {
      return Response.json({ error: 'No se ha encontrado ning\xFAn modelo que coincida con "' + query + '".' }, { status: 404 });
    }
    const normalizedTalla = normalizeTalla(talla) || (talla || "").trim().toUpperCase();
    if (!normalizedTalla) {
      return Response.json({ error: "Indica una talla v\xE1lida." }, { status: 400 });
    }
    return this.adjustStock({ stockModel, talla: normalizedTalla, delta, usuario });
  }
  async adjustStock({ stockModel, talla, delta, field, usuario, origen, orderRef }) {
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
      orderRef: orderRef || void 0
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
    const devolverStock = entry.reposicion ? Math.min(n, entry.enStock || 0) : 0;
    if (devolverStock) entry.enStock = entry.enStock - devolverStock || void 0;
    const e = separarUnidades(backorders, entry, n, "cx");
    if (e !== entry) e.enStock = void 0;
    if (e.paraStock || e.stockPedidoId) await this.liberarPedidoStock(backorders, e, e.cantidad);
    if (e.paraStock) {
      e.estadoAntesDeCancelar = e.estado;
      e.estado = "cancelado";
      e.fechaCancelado = (/* @__PURE__ */ new Date()).toISOString();
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
      if (e.tipo === "colchon" && !e.reposicion) {
        const antes = row.vendidoPendiente || 0;
        row.vendidoPendiente = Math.max(0, antes - e.cantidad);
        await this.logMovement({ ...mov, campo: "vendidoPendiente", delta: row.vendidoPendiente - antes, resultante: row.vendidoPendiente });
      }
    } else if (e.desdeAbierto) {
      const abiertos = await this.load("abiertos", {});
      const k = _InventoryStore.claveAbierto(abiertos, e.stockModel, e.talla) || key;
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
    e.fechaCancelado = (/* @__PURE__ */ new Date()).toISOString();
    return e;
  }
  async cancelBackorder(id) {
    const backorders = await this.load("backorders", []);
    const entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });
    entry.estado = "cancelado";
    entry.fechaCancelado = (/* @__PURE__ */ new Date()).toISOString();
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
        id,
        orderId,
        orderNumber,
        stockModel,
        talla,
        tipo: tipo || "colchon",
        cantidad: cantidad || 1,
        orderDate,
        esPack: false,
        proveedor,
        referencia: referencia || null,
        platform,
        orderRef,
        refSuffix: refSuffix ? String(refSuffix) : "",
        estado: "listo-seur",
        recibidoFabrica: true,
        reposicion: !!envioSeur.reposicion,
        agenciaReposicion: envioSeur.reposicion ? "SEUR" : void 0
      });
      const b = backorders.find((x) => x.id === id);
      b.cargaId = envioSeur.cargaId;
      b.mercanciaFabrica = "ENV\xCDO SUELTO \u2014 no pasa por proveedor ni descuenta stock";
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
      tipoEnvio: tipoEnvio || void 0
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
  async resolveBackorder(id) {
    const backorders = await this.load("backorders", []);
    const entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });
    if (entry.paraStock) {
      if (entry.recibidoFabrica) return Response.json({ ok: false, error: "Este pedido para stock ya se recibi\xF3 y sum\xF3 al stock." }, { status: 400 });
      return this.recibirPedidoStock(backorders, entry);
    }
    entry.recibidoFabrica = !entry.recibidoFabrica;
    entry.fechaRecibido = entry.recibidoFabrica ? (/* @__PURE__ */ new Date()).toISOString() : null;
    await this.state.storage.put("backorders", backorders);
    return Response.json(entry);
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
    const previo = (await this.load("backorders", [])).find((b) => b.id === id);
    if (!previo) return new Response("not found", { status: 404 });
    if (previo.paraStock) return Response.json({ ok: false, error: "Es un pedido para stock: se marca recibido y pasa al stock." }, { status: 400 });
    if (previo.estado !== "pendiente") {
      return Response.json({ ok: false, error: "Este pendiente ya no est\xE1 pendiente." }, { status: 409 });
    }
    const carga = await this.getOrCreateSeurCarga(fecha);
    if (!carga) return Response.json({ ok: false, error: "Fecha de carga no v\xE1lida." }, { status: 400 });
    const backorders = await this.load("backorders", []);
    const entry = backorders.find((b) => b.id === id);
    if (!entry || entry.estado !== "pendiente") return Response.json({ ok: false, error: "Este pendiente ya no est\xE1 pendiente." }, { status: 409 });
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
        orderRef: entry.orderRef
      });
      await this.state.storage.put("stock", stock);
    }
    entry.estado = "listo-seur";
    entry.recibidoFabrica = true;
    entry.fechaRecibido = (/* @__PURE__ */ new Date()).toISOString();
    entry.cargaId = carga.id;
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
      stub.fetch("https://do/cargas")
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
    const alternativas = Object.values(stock).filter((row) => row.talla === entry.talla && row.cantidad > 0 && row.stockModel !== entry.stockModel && colchonModelos.has(row.stockModel)).map((row) => ({ stockModel: row.stockModel, cantidad: row.cantidad })).sort((a, b) => b.cantidad - a.cantidad);
    const tallaNum = /* @__PURE__ */ __name((t) => (t || "").split("X").map(Number), "tallaNum");
    const transformables = Object.values(stock).filter((row) => row.stockModel === entry.stockModel && row.cantidad > 0 && esMedidaMayor(row.talla, entry.talla)).map((row) => ({ talla: row.talla, cantidad: row.cantidad })).sort((a, b) => tallaNum(a.talla)[0] - tallaNum(b.talla)[0] || tallaNum(a.talla)[1] - tallaNum(b.talla)[1]);
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
      return Response.json({ ok: false, error: "Este pendiente ya no est\xE1 pendiente." }, { status: 409 });
    }
    if (entry.tipo !== "colchon") {
      return Response.json({ ok: false, error: "Solo se puede sustituir un colch\xF3n." }, { status: 409 });
    }
    const products = await this.load("products", {});
    const stockModel = transformar ? entry.stockModel : resolveStockModel(query, mode, products);
    if (!stockModel) {
      return Response.json({ ok: false, error: 'No se ha encontrado ning\xFAn modelo que coincida con "' + query + '".' }, { status: 404 });
    }
    const tallaNorm = normalizeTalla(talla) || (talla || "").trim().toUpperCase();
    if (!tallaNorm) {
      return Response.json({ ok: false, error: "Indica una talla v\xE1lida." }, { status: 400 });
    }
    talla = tallaNorm;
    if (transformar && !esMedidaMayor(talla, entry.talla)) {
      return Response.json({ ok: false, error: `Solo se puede transformar un colch\xF3n M\xC1S GRANDE en uno m\xE1s peque\xF1o: ${talla} no sirve para ${entry.talla}.` }, { status: 400 });
    }
    const origenMovimiento = transformar ? "transformacion" : "sustitucion";
    const viaSeur = transformar ? false : await this.decideSustitucionViaSeur(entry);
    let carga = null;
    if (viaSeur) {
      carga = await this.getOrCreateSeurCarga(fecha);
      if (!carga) return Response.json({ ok: false, error: "Fecha de carga no v\xE1lida." }, { status: 400 });
    }
    backorders = await this.load("backorders", []);
    entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });
    const congelado = await this.load("stockCongelado", false);
    const stock = await this.load("stock", {});
    const abiertos = desdeAbierto ? await this.load("abiertos", {}) : null;
    const keyAbiertoOrigen = desdeAbierto ? _InventoryStore.claveAbierto(abiertos, stockModel, talla) : null;
    if (transformar) {
      const origen = desdeAbierto ? keyAbiertoOrigen && abiertos[keyAbiertoOrigen] : stock[stockKey(stockModel, talla)];
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
        stockModel: entry.stockModel,
        talla: entry.talla,
        campo: "vendidoPendiente",
        delta: oldRow.vendidoPendiente - antesOld,
        resultante: oldRow.vendidoPendiente,
        origen: origenMovimiento,
        orderNumber: entry.orderNumber,
        platform: entry.platform,
        orderRef: entry.orderRef
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
        stockModel: ab.stockModel,
        talla,
        campo: "abiertos",
        delta: -entry.cantidad,
        resultante: quedan,
        origen: origenMovimiento,
        orderNumber: entry.orderNumber,
        platform: entry.platform,
        orderRef: entry.orderRef
      });
    } else {
      const newRow = stock[newKey] || { stockModel, talla, cantidad: 0, vendidoPendiente: 0 };
      const antesNew = newRow.cantidad;
      if (!congelado) newRow.cantidad = Math.max(0, newRow.cantidad - entry.cantidad);
      stock[newKey] = newRow;
      await this.logMovement({
        stockModel,
        talla,
        campo: "cantidad",
        delta: newRow.cantidad - antesNew,
        resultante: newRow.cantidad,
        origen: origenMovimiento,
        orderNumber: entry.orderNumber,
        platform: entry.platform,
        orderRef: entry.orderRef
      });
    }
    if (transformar) {
      entry.transformadoDesde = talla;
      entry.transformadoDesdeAbierto = !!desdeAbierto;
      entry.fechaTransformacion = (/* @__PURE__ */ new Date()).toISOString();
      entry.tipoEnvio = "FUR";
      const ordersStub = this.env.ORDERS_STORE.get(this.env.ORDERS_STORE.idFromName("shopify"));
      await ordersStub.fetch("https://do/orders/pasar-a-furniture", {
        method: "POST",
        body: JSON.stringify({ orderId: entry.orderId, motivo: "transformacion" })
      });
    } else {
      entry.stockModelOriginal = entry.stockModel;
      entry.tallaOriginal = entry.talla;
      entry.stockModel = stockModel;
      entry.talla = talla;
    }
    entry.recibidoFabrica = true;
    entry.fechaRecibido = (/* @__PURE__ */ new Date()).toISOString();
    if (viaSeur) {
      entry.estado = "listo-seur";
      entry.cargaId = carga.id;
    } else {
      entry.estado = "cubierto";
    }
    await this.state.storage.put("stock", stock);
    await this.state.storage.put("backorders", backorders);
    return Response.json({ ok: true, entry, carga, viaSeur });
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
  async undoSeurBackorder(id, { mantenerRef } = {}) {
    const backorders = await this.load("backorders", []);
    const entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });
    if (entry.estado !== "listo-seur") {
      return Response.json({ ok: false, error: "Este pendiente no est\xE1 preparado para SEUR." }, { status: 409 });
    }
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
        orderRef: entry.orderRef
      });
      await this.state.storage.put("stock", stock);
    }
    entry.estado = "pendiente";
    entry.cargaId = null;
    entry.recibidoFabrica = false;
    entry.fechaRecibido = null;
    if (!mantenerRef) entry.refSuffix = nextRefSuffix(entry.refSuffix);
    await this.state.storage.put("backorders", backorders);
    return Response.json({ ok: true, entry });
  }
  // Pide a OrdersStore (el dueño de las cargas) la carga de SEUR abierta
  // para esa fecha exacta, creándola si no existe todavía — puede haber
  // varias cargas de SEUR abiertas a la vez (hoy y mañana), a diferencia de
  // Furniture que solo tiene una.
  async getOrCreateSeurCarga(fecha) {
    const esDia = /^\d{4}-\d{2}-\d{2}$/.test(fecha || "") && ![0, 6].includes((/* @__PURE__ */ new Date(fecha + "T12:00:00Z")).getUTCDay());
    if (fecha !== "hoy" && fecha !== "manana" && fecha !== "auto" && !esDia) return null;
    const id = this.env.ORDERS_STORE.idFromName("shopify");
    const stub = this.env.ORDERS_STORE.get(id);
    const res = await stub.fetch("https://do/cargas/seur/get-or-create", {
      method: "POST",
      body: JSON.stringify({ fecha })
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
    if (String(referencia || "").trim().toUpperCase() === "STOCK" && !entry.recibidoFabrica) {
      entry.recibidoFabrica = true;
      entry.fechaRecibido = (/* @__PURE__ */ new Date()).toISOString();
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
    const fecha = (/* @__PURE__ */ new Date()).toISOString();
    for (const b of backorders) {
      if (!set.has(b.id)) continue;
      b.pedidoGenerado = !unmark;
      b.fechaPedidoFabrica = unmark || sinFecha ? null : fecha;
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
    if (tipoEnvio !== void 0) {
      entry.tipoEnvio = tipoEnvio === "FUR" ? "FUR" : "FPK";
    } else if (fechaEstimadaLlegada !== void 0) {
      entry.fechaEstimadaLlegada = fechaEstimadaLlegada || null;
      if (entry.fechaEstimadaLlegada) {
        const limite = /* @__PURE__ */ new Date();
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
      return Response.json({ ok: false, error: "No se ha podido resolver este art\xEDculo contra el Cat\xE1logo." }, { status: 400 });
    }
    if (colorOverride !== void 0) resolved.color = colorOverride;
    if (tallaOverride !== void 0) resolved.talla = tallaOverride;
    const stock = await this.load("stock", {});
    const backorders = await this.load("backorders", []);
    const proveedor = resolved.product.proveedor || null;
    const isStockTracked = STOCK_TYPES.has(resolved.tipo);
    if (!isStockTracked || resolved.product.noStock) {
      if (!proveedor) {
        return Response.json({ ok: false, error: "Este art\xEDculo no tiene proveedor asignado en el Cat\xE1logo." }, { status: 400 });
      }
      let referencia = null;
      if (proveedor === "POLIVAL") {
        const numero = await nextReferenciaNumero(this.state);
        const vaFurniture = resolved.tipo === "tapiceria" || resolved.product.exceptionFurniture;
        const built = buildReferencia(numero, resolved.product.referenciaTipo, resolved.color, vaFurniture);
        referencia = built.referencia;
      }
      let mercanciaFabrica = null;
      if (proveedor === "POLIVAL" && resolved.product.product_type === "Canap\xE9") {
        const built = buildCanapeMercancia(resolved.product.title, resolved.color, resolved.talla, services || "");
        mercanciaFabrica = built.texto;
      } else if (proveedor === "POLIVAL" && resolved.product.product_type === "Cabecero") {
        const built = buildCabeceroMercancia(resolved.product.title, resolved.color, resolved.talla, "");
        mercanciaFabrica = built.texto;
      } else if (proveedor === "POLIVAL" && resolved.product.product_type === "Canap\xE9 fijo") {
        const built = buildCanapeFijoMercancia(resolved.color, resolved.talla);
        mercanciaFabrica = built.texto;
      } else if (proveedor === "POLIVAL" && resolved.product.product_type === "Colchones") {
        const built = buildColchonMercancia(resolved.product.stockModel, resolved.talla);
        mercanciaFabrica = built.texto;
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
      return Response.json({ ok: false, error: "No se ha podido resolver este art\xEDculo contra el Cat\xE1logo." }, { status: 400 });
    }
    return Response.json({
      ok: true,
      stockModel: resolved.product.stockModel,
      talla: resolved.talla,
      color: resolved.color,
      tipo: resolved.tipo
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
  async crearReposicion({ orderId, orderNumber, platform, orderRef, orderDate, item, piezaTexto, parte, agenciaReposicion, recogida, recogidaDestino, cambio, unidades, piezas, piezasIdx, canapeCompleto, services, productoTexto }) {
    const products = await this.load("products", {});
    const resolved = resolverItemReposicion(item, cambio, products);
    const cantidad = Math.max(1, Math.min(20, Math.floor(Number(unidades) || 1)));
    if (resolved.tipo === "pack" || resolved.tipo === "desconocido") {
      return Response.json({ ok: false, error: "No se ha podido resolver este art\xEDculo contra el Cat\xE1logo." }, { status: 400 });
    }
    const { product, talla, tipo } = resolved;
    let { color } = resolved;
    const proveedor = product.proveedor || null;
    if (!proveedor) {
      return Response.json({ ok: false, error: "Este art\xEDculo no tiene proveedor asignado en el Cat\xE1logo." }, { status: 400 });
    }
    if (tipo === "colchon" && agenciaReposicion !== "SEUR" && agenciaReposicion !== "FURNITURE") {
      return Response.json({ ok: false, error: "Falta indicar si el colch\xF3n sale por SEUR o por FURNITURE." }, { status: 400 });
    }
    const referencia = proveedor === "POLIVAL" ? await nextReposicionReferencia(this.state) : null;
    let mercanciaFabrica = null;
    let recetaCanapeCompleto = false;
    if (canapeCompleto && product.product_type === "Canap\xE9") {
      if (!color) color = adivinarColorCanape(product.title, productoTexto);
      const built = buildCanapeMercancia(product.title, color, talla, services || "");
      if (built.texto) {
        mercanciaFabrica = built.texto;
        recetaCanapeCompleto = true;
      }
    }
    if (mercanciaFabrica) {
    } else if (product.product_type === "Canap\xE9") {
      mercanciaFabrica = buildCanapeMercancia(product.title, color, talla, "").texto || null;
    } else if (product.product_type === "Cabecero") {
      mercanciaFabrica = buildCabeceroMercancia(product.title, color, talla, "").texto || null;
    } else if (product.product_type === "Canap\xE9 fijo") {
      mercanciaFabrica = buildCanapeFijoMercancia(color, talla).texto || null;
    } else if (product.product_type === "Colchones") {
      mercanciaFabrica = buildColchonMercancia(product.stockModel, talla).texto || null;
    }
    if (!mercanciaFabrica) {
      mercanciaFabrica = product.stockModel + (talla ? " - MEDIDA: " + talla : "") + (color ? " - COLOR: " + color : "");
    }
    let enStock = 0;
    if (tipo === "colchon") {
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
          stockModel: product.stockModel,
          talla,
          campo: "cantidad",
          delta: -enStock,
          resultante: row.cantidad,
          origen: "reposicion",
          orderNumber,
          platform,
          orderRef
        });
      }
    }
    if (enStock >= cantidad) {
      mercanciaFabrica = "REPOSICI\xD3N \u2014 ya en stock, no hace falta pedir a f\xE1brica";
    } else if (enStock > 0) {
      mercanciaFabrica += " \xB7 " + enStock + " UD YA EN STOCK (descontada) \u2014 PEDIR " + (cantidad - enStock);
    }
    if (piezaTexto && !recetaCanapeCompleto) mercanciaFabrica += " \xB7 PIEZA A REPONER: " + piezaTexto;
    const recibidoFabrica = enStock >= cantidad && agenciaReposicion === "FURNITURE";
    const tieneDesglosePiezas = product.product_type === "Canap\xE9" || product.stockModel.toLowerCase().includes("base");
    const variasPiezas = tieneDesglosePiezas && Array.isArray(piezas) && piezas.length > 1;
    const stockModelFinal = !tieneDesglosePiezas || canapeCompleto ? product.stockModel : variasPiezas ? piezas.join(" + ") : parte || product.stockModel;
    const backorders = await this.load("backorders", []);
    const id = crypto.randomUUID();
    pushBackorder(backorders, {
      id,
      orderId,
      orderNumber,
      stockModel: stockModelFinal,
      // Fecha de HOY, no la del pedido original (Jennifer, 2026-09-22): una
      // reposición puede pedirse semanas después de la venta, y Polival/New/
      // Furniture ordenan sus listas de pendientes por esta fecha — si se
      // usara la del pedido, una reposición de un pedido antiguo se colaría
      // al fondo del listado y se quedaría "traspapelada" en vez de
      // aparecer arriba, recién añadida. orderDate (recibido del cliente)
      // se ignora a propósito para este campo.
      talla,
      color,
      tipo,
      cantidad,
      orderDate: (/* @__PURE__ */ new Date()).toISOString(),
      esPack: false,
      proveedor,
      needsDecision: false,
      referencia,
      mercanciaFabrica,
      platform,
      orderRef,
      reposicion: true,
      piezaTexto: piezaTexto || "",
      recibidoFabrica,
      agenciaReposicion: tipo === "colchon" ? agenciaReposicion : null,
      recogida: tipo === "colchon" && agenciaReposicion === "FURNITURE" ? !!recogida : false,
      recogidaDestino: tipo === "colchon" && agenciaReposicion === "FURNITURE" && recogida ? recogidaDestino || null : null
    });
    const nuevo = backorders.find((b) => b.id === id);
    if (enStock > 0) nuevo.enStock = enStock;
    if (tieneDesglosePiezas && Array.isArray(piezasIdx) && piezasIdx.length) {
      nuevo.stockModelArticulo = product.stockModel;
      nuevo.piezasIdx = piezasIdx.map(Number).filter((n) => Number.isInteger(n) && n >= 0);
      if (canapeCompleto) nuevo.canapeCompleto = true;
    }
    if (cambio) nuevo.cambio = { de: String(cambio.de || "") };
    await this.state.storage.put("backorders", backorders);
    return Response.json({ ok: true, id, enStock });
  }
  // Adjuntar foto(s) a una reposición ya creada (Jennifer, 2026-09-21):
  // guarda solo la clave de R2 en el backorder — el binario vive en el
  // bucket, nunca en Durable Object storage.
  async adjuntarFotoReposicion({ id, key }) {
    const backorders = await this.load("backorders", []);
    const b = backorders.find((x) => x.id === id);
    if (!b) return Response.json({ ok: false, error: "Reposici\xF3n no encontrada." }, { status: 404 });
    b.fotos = [...b.fotos || [], key];
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
  async crearGestoComercial({ orderId, orderNumber, platform, orderRef, orderDate, productId, talla, cantidad, motivo }) {
    const cantidadNum = Number(cantidad);
    if (!Number.isInteger(cantidadNum) || cantidadNum < 1 || cantidadNum > 2) {
      return Response.json({ ok: false, error: "La cantidad debe ser 1 o 2." }, { status: 400 });
    }
    const products = await this.load("products", {});
    const product = products[productId];
    if (!product || product.product_type !== "Almohada") {
      return Response.json({ ok: false, error: "Elige una almohada real del Cat\xE1logo." }, { status: 400 });
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
        orderRef
      });
    }
    stock[key] = row;
    const falta = cantidadNum - covered;
    let referencia = null;
    let mercanciaFabrica;
    if (falta > 0) {
      referencia = await nextGestoComercialReferencia(this.state);
      const built = buildSimpleMercancia(product.title, tallaNorm);
      mercanciaFabrica = (built.texto || product.stockModel) + ` \xB7 GESTO COMERCIAL (${falta} ud. a pedir)`;
    } else {
      mercanciaFabrica = "GESTO COMERCIAL \u2014 ya en stock, no hace falta pedir a f\xE1brica";
    }
    const backorders = await this.load("backorders", []);
    const id = crypto.randomUUID();
    pushBackorder(backorders, {
      id,
      orderId,
      orderNumber,
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
      orderDate: (/* @__PURE__ */ new Date()).toISOString(),
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
      platform,
      orderRef,
      gestoComercial: true,
      piezaTexto: motivo || ""
    });
    await this.state.storage.put("stock", stock);
    await this.state.storage.put("backorders", backorders);
    return Response.json({ ok: true, id, referencia, cubiertoConStock: covered });
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
  async setTarifaEnvio({ precios }) {
    if (!precios) return Response.json({ ok: false, error: "Faltan precios." }, { status: 400 });
    const envios = await this.load("tarifasEnvio", {});
    for (const [stockModel, porTalla] of Object.entries(precios)) {
      if (!envios[stockModel]) envios[stockModel] = {};
      for (const [talla, porPais] of Object.entries(porTalla)) {
        envios[stockModel][talla] = { ...envios[stockModel][talla] || {}, ...porPais };
      }
    }
    await this.state.storage.put("tarifasEnvio", envios);
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
  async calcularTarifaModelo(stockModel, talla) {
    const sustitutoCompleto = TARIFA_MODELO_DESCATALOGADO_USA_PRECIO_DE[stockModel];
    if (sustitutoCompleto) {
      const base = await this.calcularTarifaModelo(sustitutoCompleto.modelo, talla);
      if (base.error) return { ...base, stockModel };
      const columnas2 = {};
      for (const [key, col] of Object.entries(base.columnas)) {
        const pasos = col.pasos.length ? [{ ...col.pasos[0], label: col.pasos[0].label + ` (precio igual a ${sustitutoCompleto.modelo}, ${sustitutoCompleto.motivo})` }, ...col.pasos.slice(1)] : col.pasos;
        columnas2[key] = { ...col, pasos };
      }
      return { ...base, stockModel, columnas: columnas2, precioIgualAModelo: sustitutoCompleto.modelo };
    }
    const products = await this.load("products", {});
    const product = activeProducts(products).find((p) => p.stockModel === stockModel);
    if (!product) return { error: "Modelo no encontrado en el Cat\xE1logo." };
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
    const preciosModelo = tarifaPeriodo && tarifaPeriodo.precios[stockModel] || {};
    let coste = preciosModelo[talla];
    let costeSustituto = null;
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
    const paises = ["ES", "FR", "IT", "DE"];
    let envios;
    let faltaEnvio = [];
    let envioSustituto = null;
    let envioFijo = null;
    if (TARIFA_ENVIO_FIJO_MODELO[stockModel] != null) {
      envioFijo = TARIFA_ENVIO_FIJO_MODELO[stockModel];
      envios = { ES: envioFijo, FR: envioFijo, IT: envioFijo, DE: envioFijo };
    } else {
      const tarifasEnvio = await this.load("tarifasEnvio", {});
      envios = tarifasEnvio[stockModel] && tarifasEnvio[stockModel][talla] || {};
      faltaEnvio = paises.filter((p) => envios[p] == null);
      if (faltaEnvio.length) {
        const tallaSustituta = sustitutoGeneralDeTalla(talla);
        const enviosTallaSustituta = tallaSustituta ? tarifasEnvio[stockModel] && tarifasEnvio[stockModel][tallaSustituta] || {} : {};
        if (tallaSustituta && !paises.some((p) => enviosTallaSustituta[p] == null)) {
          envios = enviosTallaSustituta;
          faltaEnvio = [];
          envioSustituto = "sustituto de la talla " + tallaSustituta + " de este mismo modelo, sin env\xEDo real para " + talla;
        }
      }
      if (faltaEnvio.length) {
        const modeloSustituto = TARIFA_ENVIO_SUSTITUTO_MODELO[stockModel];
        const enviosSustituto = modeloSustituto ? tarifasEnvio[modeloSustituto] && tarifasEnvio[modeloSustituto][talla] || {} : {};
        if (modeloSustituto && !paises.some((p) => enviosSustituto[p] == null)) {
          envios = enviosSustituto;
          faltaEnvio = [];
          envioSustituto = "sustituto de " + modeloSustituto + ", sin precio real para este modelo";
        }
      }
    }
    if (faltaEnvio.length) {
      return { stockModel, talla, coste, costeProveedor: proveedor, costePeriodo: periodo, envios, error: "Sin precio de env\xEDo guardado para: " + faltaEnvio.join(", ") + "." };
    }
    const esMuelles = TARIFA_MODELOS_MUELLES.includes(stockModel);
    const bezenResult = esMuelles ? calcularPrecioBezen(coste, envios.ES, 0.68, "32%") : calcularPrecioBezen(coste, envios.ES);
    const bezenOverride = TARIFA_BEZEN_REFERENCIA_MODELO[stockModel];
    if (bezenOverride) {
      const base = await this.calcularTarifaModelo(bezenOverride.modeloBase, talla);
      if (base && base.columnas && base.columnas.BEZEN && base.columnas.BEZEN.precio != null) {
        const precioFormula = bezenResult.precio;
        const precioFinal = round2(base.columnas.BEZEN.precio + bezenOverride.diferencia);
        bezenResult.pasos.push({ label: "Precio seg\xFAn f\xF3rmula (informativo)", valor: precioFormula });
        bezenResult.pasos.push({ label: `Precio final aplicado (${bezenOverride.etiquetaBase} + ${bezenOverride.diferencia}\u20AC)`, valor: precioFinal });
        bezenResult.precio = precioFinal;
      }
    }
    const columnas = esMuelles ? {
      BEZEN: bezenResult,
      MAISON_ES: calcularPrecioPlataformaMuellesEs(bezenResult.precio),
      RESTO_ES: calcularPrecioPlataformaMuellesEs(bezenResult.precio),
      MAISON_FR: calcularPrecioPlataformaMuellesResto(coste, envios.FR, 0.77),
      RESTO_FR: calcularPrecioPlataformaMuellesResto(coste, envios.FR, 0.8),
      MAISON_IT: calcularPrecioPlataformaMuellesResto(coste, envios.IT, 0.77),
      RESTO_IT: calcularPrecioPlataformaMuellesResto(coste, envios.IT, 0.8),
      RESTO_AL: calcularPrecioPlataformaMuellesResto(coste, envios.DE, 0.8)
    } : {
      BEZEN: bezenResult,
      MAISON_ES: calcularPrecioPlataforma(coste, envios.ES, talla, 0.77),
      RESTO_ES: calcularPrecioPlataforma(coste, envios.ES, talla, 0.8),
      MAISON_FR: calcularPrecioPlataforma(coste, envios.FR, talla, 0.77),
      RESTO_FR: calcularPrecioPlataforma(coste, envios.FR, talla, 0.8),
      MAISON_IT: calcularPrecioPlataforma(coste, envios.IT, talla, 0.77),
      RESTO_IT: calcularPrecioPlataforma(coste, envios.IT, talla, 0.8),
      RESTO_AL: calcularPrecioPlataforma(coste, envios.DE, talla, 0.8)
    };
    if (costeSustituto || envioSustituto || envioFijo != null) {
      for (const col of Object.values(columnas)) {
        if (!col.pasos || col.pasos[0]?.label === "Precio BEZEN") continue;
        if (costeSustituto && col.pasos[0]) col.pasos[0].label += " (sustituto de " + costeSustituto + ", sin precio real para " + talla + ")";
        if (envioSustituto && col.pasos[1]) col.pasos[1].label += " (" + envioSustituto + ")";
        if (envioFijo != null && col.pasos[1]) col.pasos[1].label += " (fijo FURNITURE, igual para cualquier talla/pa\xEDs)";
      }
    }
    return { stockModel, talla, coste, costeProveedor: proveedor, costePeriodo: periodo, envios, columnas, costeSustituto, envioSustituto, envioFijo };
  }
  // Tabla completa (todas las tallas del Catálogo para ese modelo) —
  // GET /tarifas/tabla?stockModel=...
  async getTarifaTabla(stockModel) {
    const products = await this.load("products", {});
    const product = activeProducts(products).find((p) => p.stockModel === stockModel);
    if (!product) return Response.json({ ok: false, error: "Modelo no encontrado." }, { status: 404 });
    const tallas = [.../* @__PURE__ */ new Set([...product.tallas || [], ...TARIFA_TALLAS_EXTRA_MODELO[stockModel] || []])];
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
      filename: filename || plataforma + "_precios.xlsx",
      filas,
      actualizado: (/* @__PURE__ */ new Date()).toISOString()
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
      actualizado: cfg.actualizado || null
    }));
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
        "Content-Disposition": `attachment; filename="${cfg.filename}"`
      }
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
      actualizado: (/* @__PURE__ */ new Date()).toISOString()
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
      ultimaDescarga: cfg.ultimaDescarga || null
    }));
    return Response.json({ ok: true, plazos });
  }
  async exportarPlazosMarketplace() {
    const todos = await this.load("plazosExportaciones", {});
    const cfg = todos.MARKETPLACE;
    if (!cfg) return Response.json({ ok: false, error: "Marketplace no cargado." }, { status: 404 });
    cfg.ultimaDescarga = (/* @__PURE__ */ new Date()).toISOString();
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
        "Content-Disposition": `attachment; filename="${cfg.filename}"`
      }
    });
  }
  async processSale({ orderId, orderNumber, platform, orderRef, items, force, orderDate, services, paymentStatus, seurSplitDecision }) {
    if (!force && await this.load("paused", false)) {
      return Response.json({ agencia: null, pendingManufacture: null, needsReview: false, reviewReasons: [], paused: true });
    }
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
    const cabeceroConInitial = flat.some((c) => c.product && c.product.product_type === "Canap\xE9" && matchCanapeRecipeKey(c.product.title) === "initial");
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
    const enStock = /* @__PURE__ */ __name((c) => c.product && ((stock[stockKey(c.product.stockModel, c.talla)] || {}).cantidad || 0) >= (c.qty || 1), "enStock");
    if (hasTapiceria && flat.some((c) => c.tipo === "colchon" && !c.fromPack && !enStock(c))) {
      needsReview = true;
      reviewReasons.push("Hay un colch\xF3n suelto (no es parte del pack) en un pedido que tambi\xE9n lleva tapicer\xEDa. Decide si debe ir en el mismo env\xEDo que la tapicer\xEDa o aparte.");
    }
    if (agencia === "SEUR" && colchonesSueltos.length >= 2 && !seurSplitDecision) {
      const { mixto, detalle } = checkColchonesCoverage(stock, colchonesSueltos);
      if (mixto) {
        return Response.json({
          agencia: null,
          pendingManufacture: null,
          needsReview: false,
          reviewReasons: [],
          seurMixedPending: true,
          seurMixedInfo: { colchones: detalle }
        });
      }
    }
    let seurRefSuffix = "";
    if (agencia === "SEUR" && seurSplitDecision && colchonesSueltos.length >= 2) {
      const { detalle } = checkColchonesCoverage(stock, colchonesSueltos);
      if (detalle.some((d) => d.disponible > 0) && detalle.some((d) => d.disponible < d.cantidad)) {
        seurRefSuffix = "2";
      }
    }
    let seurCubierto = 0;
    for (const item of flat) {
      const isStockTracked = STOCK_TYPES.has(item.tipo);
      if (!isStockTracked && item.tipo !== "tapiceria" || !item.product) continue;
      const proveedor = item.product.proveedor || null;
      const needsDecision = item.tipo === "colchon" && hasTapiceria || !!item.ambiguousMatch;
      if (!isStockTracked || item.product.noStock) {
        if (!proveedor) {
          if (!item.product.noStock) needsReview = true;
          continue;
        }
        let referencia = null;
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
        let mercanciaFabrica = null;
        if (proveedor === "POLIVAL" && item.product.product_type === "Canap\xE9") {
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
        } else if (proveedor === "POLIVAL" && item.product.product_type === "Canap\xE9 fijo") {
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
        }
        this.addNoStockBackorder(backorders, item, orderId, orderNumber, hasTapiceria, orderDate, proveedor, needsDecision, referencia, mercanciaFabrica, platform, orderRef);
        if (necesitaFormato160(item)) {
          const bo = backorders.find((b) => b.id === `${orderId}-${stockKey(item.product.stockModel, item.talla)}`);
          if (bo && !bo.formato160) {
            if (/gemelo/i.test((item.variantTitle || "") + " " + (item.variantPack || ""))) {
              bo.necesitaFormato160 = true;
              needsReview = true;
              reviewReasons.push(`${PREGUNTA_FORMATO_160} El cliente ha comprado en GEMELOS: ${item.product.title} (${item.talla}${item.color ? ", " + item.color : ""}). Conf\xEDrmalo en Proveedores \xB7 Polival.`);
            } else {
              bo.formato160 = "PARTIDO";
              bo.mercanciaFabrica = textoConFormato160(bo.mercanciaFabrica, "PARTIDO");
            }
          }
        }
        if (item.tipo === "colchon" && item.fromPack && hasTapiceria) {
          pendingManufacture = { modelo: item.product.stockModel, talla: item.talla, cantidad: item.qty };
          needsReview = true;
          reviewReasons.push(`${item.product.stockModel} (${item.talla}) del pack sin stock (fabricaci\xF3n bajo pedido, faltan ${item.qty}). Dime si sale junto con la tapicer\xEDa (FUR) o puede ir aparte (FPK).`);
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
        reviewReasons.push(`${item.product.stockModel} (${item.talla}) del pack sin stock suficiente (faltan ${falta}). Dime si sale junto con la tapicer\xEDa (FUR) o puede ir aparte (FPK).`);
      }
    }
    await this.state.storage.put("stock", stock);
    await this.state.storage.put("backorders", backorders);
    const seurReady = agencia === "SEUR" && seurCubierto > 0;
    return Response.json({ agencia, pendingManufacture, needsReview, reviewReasons, seurReady });
  }
};

// src/index.js
var PROCESAMIENTO_DESDE = {
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
  "Leroy Merlin": "2026-09-28"
};
var MARKETPLACE_ID_PREFIX = {
  Carrefour: "CF",
  "Maison Du Monde": "MDM",
  Worten: "WT",
  Conforama: "CFM",
  "Conforama ES": "CFES",
  "Leroy Merlin": "LM"
};
var MARKETPLACE_PLATFORM_BY_ID = {
  carrefour: "Carrefour",
  "maison-du-monde": "Maison Du Monde",
  worten: "Worten",
  conforama: "Conforama",
  "conforama-es": "Conforama ES",
  "leroy-merlin": "Leroy Merlin"
};
function marketplaceFechaDesde(orderDateStr, cutoffIso) {
  const m = String(orderDateStr || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return false;
  const [, d, mo, y] = m;
  const fecha = y + "-" + mo.padStart(2, "0") + "-" + d.padStart(2, "0");
  return fecha >= cutoffIso;
}
__name(marketplaceFechaDesde, "marketplaceFechaDesde");
var MARKETPLACE_ESTADOS_ELEGIBLES = {
  "Conforama ES": /* @__PURE__ */ new Set(["Recibido", "Enviado", "Esperando env\xEDo"])
};
function marketplaceEstadoElegible(order) {
  const permitidos = MARKETPLACE_ESTADOS_ELEGIBLES[order.platform];
  if (!permitidos) return true;
  return permitidos.has(order.estado);
}
__name(marketplaceEstadoElegible, "marketplaceEstadoElegible");
var SHOPIFY_FULFILL_DESDE = "2026-09-23";
function shopifyFulfillActivo() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) >= SHOPIFY_FULFILL_DESDE;
}
__name(shopifyFulfillActivo, "shopifyFulfillActivo");
function normalizePaymentMethod(gatewayNames) {
  const joined = (gatewayNames || []).join(", ").toLowerCase();
  if (!joined) return "\u2014";
  if (joined.includes("cetelem")) return "CETELEM";
  if (joined.includes("sequra")) return "SEQURA";
  if (joined.includes("transferencia")) return "TRANSFERENCIA BANCARIA";
  if (joined.includes("bizum") || joined.includes("monei")) return "BIZUM";
  if (joined.includes("shopify_payments")) return "VISA";
  return (gatewayNames || []).join(", ").toUpperCase();
}
__name(normalizePaymentMethod, "normalizePaymentMethod");
function mapOrder(order, catalogMap) {
  const productTitles = [];
  const serviceParts = [];
  const items = [];
  for (const item of order.line_items || []) {
    if (item.title) {
      const variant = (item.variant_title || "").trim();
      const yaIncluida = !variant || variant.toLowerCase() === "default title" || item.title.toLowerCase().includes(variant.toLowerCase());
      const titulo = yaIncluida ? item.title : `${item.title} - ${variant}`;
      productTitles.push(`${item.quantity || 1}x ${titulo}`);
    }
    for (const prop of item.properties || []) {
      if (!prop.name || !prop.value) continue;
      if (prop.name.startsWith("_")) continue;
      serviceParts.push(`${prop.name}: ${prop.value}`);
      if (prop.name === "Almohadas de regalo" && catalogMap) {
        const m = prop.value.match(/^(\d+)\s*x\s*.*\(([^)]+)\)\s*$/i);
        if (m) {
          const qty = Number(m[1]) || 1;
          const skuRegalo = m[2].replace(",", ".");
          const match = findBestPrefixMatch(skuRegalo, catalogMap);
          if (match) {
            items.push({
              productId: match.product.productId,
              sku: skuRegalo,
              variantTitle: match.talla || "",
              qty
            });
          }
        }
      }
    }
    if (item.product_id != null) {
      items.push({
        productId: item.product_id,
        sku: item.sku || "",
        variantTitle: item.variant_title || "",
        qty: item.quantity || 1
      });
    }
  }
  const products = productTitles.filter(
    (title, i) => !productTitles.some((other, j) => j !== i && other.length > title.length && other.startsWith(title))
  );
  const uniqueProducts = [...new Set(products)];
  const address = order.shipping_address || {};
  const addressStr = [address.address1, address.address2, address.city, address.zip, address.province].filter(Boolean).join(", ");
  const customerName = address.name || `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();
  const furnitureAddress = [address.company, address.address1, address.address2].filter(Boolean).join(", ");
  const shopifyCancelado = !!order.cancelled_at && !!order.closed_at || order.financial_status === "refunded";
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
    services: serviceParts.join(" \xB7 "),
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
    paymentStatus: order.financial_status === "paid" ? "PAGADO" : order.financial_status === "refunded" ? "REEMBOLSADO" : "PENDIENTE DE PAGO",
    // Si el pedido está cancelado/reembolsado, "Situación de envío" pasa a
    // decir "cancelado" en vez de arrastrar el fulfillment_status normal de
    // Shopify (Jennifer, 2026-09-16: un reembolsado no puede seguir
    // pareciendo "Pendiente" de enviar).
    shippingStatus: shopifyCancelado ? "cancelado" : order.fulfillment_status || "pendiente",
    // Ver mergeCustomFields en orders-store.js: si esto es true, manda
    // sobre el "cancelado" manual preservado (Jennifer, 2026-09-16, caso
    // real BEZEN12204).
    shopifyCancelado,
    price: order.total_price,
    currency: order.currency,
    items
  };
}
__name(mapOrder, "mapOrder");
async function fetchShopifyOrders(env) {
  const orders = [];
  const createdAtMin = /* @__PURE__ */ new Date();
  createdAtMin.setUTCMonth(createdAtMin.getUTCMonth() - 4);
  let url = `https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/orders.json?limit=250&status=any&created_at_min=${createdAtMin.toISOString()}`;
  while (url) {
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN }
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
__name(fetchShopifyOrders, "fetchShopifyOrders");
var RELEVANT_PRODUCT_TYPES = /* @__PURE__ */ new Set([
  "Colchones",
  "Almohada",
  "Protector de colch\xF3n",
  "Topper",
  "Canap\xE9",
  "Canap\xE9 fijo",
  "Base",
  "Cabecero",
  "Pack"
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
__name(fetchShopifyProducts, "fetchShopifyProducts");
function inventoryStub(env) {
  const id = env.INVENTORY_STORE.idFromName("main");
  return env.INVENTORY_STORE.get(id);
}
__name(inventoryStub, "inventoryStub");
async function fetchOrderLineItemsInfo(env, orderId) {
  const res = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/orders/${orderId}.json?fields=line_items`, {
    headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN }
  });
  if (!res.ok) return /* @__PURE__ */ new Map();
  const { order } = await res.json();
  return new Map((order.line_items || []).map((li) => [li.id, { sku: li.sku || "", productId: li.product_id, esFantasma: li.product_id == null }]));
}
__name(fetchOrderLineItemsInfo, "fetchOrderLineItemsInfo");
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
__name(fulfillmentOrdersFantasmaDe, "fulfillmentOrdersFantasmaDe");
var TAPICERIA_PRODUCT_TYPES = /* @__PURE__ */ new Set(["Canap\xE9", "Canap\xE9 fijo", "Base", "Cabecero", "Pack"]);
var STOCK_PRODUCT_TYPES = /* @__PURE__ */ new Set(["Colchones", "Almohada", "Protector de colch\xF3n", "Topper"]);
async function fetchProductTypes(env, productIds) {
  const ids = [...new Set(productIds)].filter(Boolean);
  if (!ids.length) return /* @__PURE__ */ new Map();
  const res = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/products.json?ids=${ids.join(",")}&fields=id,product_type`, {
    headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN }
  });
  if (!res.ok) return /* @__PURE__ */ new Map();
  const { products } = await res.json();
  return new Map(products.map((p) => [p.id, p.product_type]));
}
__name(fetchProductTypes, "fetchProductTypes");
async function seleccionarLineasReales(env, realLineItems, lineItemsInfo, company) {
  if (realLineItems.length <= 1) return realLineItems;
  const productIds = realLineItems.map((li) => lineItemsInfo.get(li.line_item_id).productId);
  if (new Set(productIds).size <= 1) return realLineItems;
  const tipos = await fetchProductTypes(env, productIds);
  const deseado = company === "FURNITURE" ? TAPICERIA_PRODUCT_TYPES : company === "SEUR" ? STOCK_PRODUCT_TYPES : null;
  if (!deseado) return realLineItems;
  const seleccion = realLineItems.filter((li) => deseado.has(tipos.get(lineItemsInfo.get(li.line_item_id).productId)));
  return seleccion.length ? seleccion : realLineItems;
}
__name(seleccionarLineasReales, "seleccionarLineasReales");
async function shopifyFulfillOrder(env, { orderId, trackingNumber, trackingUrl, company, primerEnvio, fulfillmentId }) {
  if (!primerEnvio) {
    if (!fulfillmentId) return { ok: false, orderId, reason: "sin_fulfillment_previo_guardado" };
    const res2 = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/fulfillments/${fulfillmentId}/update_tracking.json`, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({
        fulfillment: { tracking_info: { number: trackingNumber, url: trackingUrl, company }, notify_customer: true }
      })
    });
    if (!res2.ok) return { ok: false, orderId, reason: "update_tracking_error", detail: await res2.text() };
    return { ok: true, orderId, fulfillmentId };
  }
  const foRes = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/orders/${orderId}/fulfillment_orders.json`, {
    headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN }
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
  const entradaPrincipal = seleccionadas.length === realLineItems.length ? { fulfillment_order_id: abierto.id } : { fulfillment_order_id: abierto.id, fulfillment_order_line_items: seleccionadas.map((li) => ({ id: li.id, quantity: li.quantity })) };
  const lineItemsByFo = [entradaPrincipal, ...fantasmaIds.map((id) => ({ fulfillment_order_id: id }))];
  const res = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/fulfillments.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN, "content-type": "application/json" },
    body: JSON.stringify({
      fulfillment: {
        line_items_by_fulfillment_order: lineItemsByFo,
        tracking_info: { number: trackingNumber, url: trackingUrl, company },
        notify_customer: true
      }
    })
  });
  if (!res.ok) return { ok: false, orderId, reason: "fulfillment_create_error", detail: await res.text() };
  const { fulfillment } = await res.json();
  return { ok: true, orderId, fulfillmentId: fulfillment && fulfillment.id };
}
__name(shopifyFulfillOrder, "shopifyFulfillOrder");
async function procesarFulfillmentsShopify(env, paraShopify) {
  const activo = shopifyFulfillActivo();
  if (!activo || !paraShopify || !paraShopify.length) {
    return { activo, enviados: 0, errores: [] };
  }
  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  let enviados = 0;
  const errores = [];
  const fulfillmentIdsEnEsteLote = /* @__PURE__ */ new Map();
  for (const c of paraShopify) {
    const yaEnEsteLote = fulfillmentIdsEnEsteLote.get(c.orderId);
    const candidato = yaEnEsteLote ? { ...c, primerEnvio: false, fulfillmentId: yaEnEsteLote } : c;
    const resultado = await shopifyFulfillOrder(env, candidato);
    if (resultado.ok) {
      if (candidato.primerEnvio) {
        fulfillmentIdsEnEsteLote.set(c.orderId, resultado.fulfillmentId);
        await stub.fetch("https://do/orders/shopify-fulfilled", {
          method: "POST",
          body: JSON.stringify({ id: c.orderId, fulfillmentId: resultado.fulfillmentId })
        });
      }
      enviados++;
    } else {
      errores.push({ orderNumber: c.orderNumber, albaran: c.trackingNumber, reason: resultado.reason, detail: resultado.detail });
    }
  }
  return { activo: true, enviados, errores };
}
__name(procesarFulfillmentsShopify, "procesarFulfillmentsShopify");
async function marcarErroresShopifyFurniture(env, candidatos, errores) {
  const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
  for (const c of candidatos || []) {
    const err = (errores || []).find((x) => x.orderNumber === c.orderNumber && x.albaran === c.trackingNumber);
    await stub.fetch("https://do/orders/furniture-shopify-error", {
      method: "POST",
      body: JSON.stringify({ orderNumber: c.orderNumber, albaran: c.trackingNumber, error: err ? [err.reason, err.detail].filter(Boolean).join(": ").slice(0, 500) : null })
    });
  }
}
__name(marcarErroresShopifyFurniture, "marcarErroresShopifyFurniture");
async function shopifyFulfillSinSeguimiento(env, orderId) {
  const foRes = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/orders/${orderId}/fulfillment_orders.json`, {
    headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN }
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
        notify_customer: false
      }
    })
  });
  if (!res.ok) return { ok: false, reason: "fulfillment_create_error" };
  return { ok: true };
}
__name(shopifyFulfillSinSeguimiento, "shopifyFulfillSinSeguimiento");
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
__name(procesarNotasFulfillar, "procesarNotasFulfillar");
function findByTitleFallback(detalles, products) {
  const normalize = /* @__PURE__ */ __name((s) => (s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, ""), "normalize");
  const detallesNorm = normalize(detalles);
  if (!detallesNorm) return null;
  let best = null;
  for (const p of Object.values(products)) {
    if (p.product_type === "Pack" || !p.title) continue;
    const parts = p.title.split("|").map((s) => s.trim()).filter(Boolean);
    const candidates = [parts[parts.length - 1], ...p.altTitleKeywords || []];
    for (const candidate of candidates) {
      if (candidate && candidate.length >= 4 && detallesNorm.includes(normalize(candidate))) {
        if (!best || candidate.length > best.matchLength) best = { product: p, matchLength: candidate.length };
      }
    }
  }
  return best ? { product: best.product, talla: null } : null;
}
__name(findByTitleFallback, "findByTitleFallback");
function extractTallaFromText(text) {
  const m = String(text || "").match(/(\d{2,3})\s*[xX]\s*(\d{2,3})/);
  return m ? `${m[1]}X${m[2]}` : "";
}
__name(extractTallaFromText, "extractTallaFromText");
function extractColorFromText(text) {
  const m = String(text || "").match(/\|\s*Color\s+([^|]+?)\s*\|/i);
  return m ? m[1].trim() : "";
}
__name(extractColorFromText, "extractColorFromText");
function referenceDigits(ref) {
  const truncado = String(ref || "").slice(-15);
  const digits = truncado.replace(/\D/g, "");
  return Number(digits) || 0;
}
__name(referenceDigits, "referenceDigits");
function resolveMarketplaceItem(e, catalogMap) {
  let match = e.sku ? findBestPrefixMatch(e.sku, catalogMap) : null;
  let skuUsado = match ? e.sku : null;
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
  const skuMostrado = viaFallback && match ? `${match.product.skuPrefix || ""}${match.talla || ""}` : skuUsado || e.sku;
  const colorTexto = match ? extractColorFromText(e.product) : "";
  const variantTitle = colorTexto ? `${colorTexto} / ${match.talla || ""}` : match ? match.talla || "" : "";
  const item = match ? { productId: match.product.productId, sku: skuMostrado || "", variantTitle, qty: e.qty || 1 } : { productId: null, sku: e.sku || "", variantTitle: "", qty: e.qty || 1 };
  const TAPICERIA_TYPES_MARKETPLACE = /* @__PURE__ */ new Set(["Canap\xE9", "Canap\xE9 fijo", "Base", "Cabecero"]);
  const montaje = !!(match && TAPICERIA_TYPES_MARKETPLACE.has(match.product.product_type) && /^M/i.test(String(skuUsado || e.sku || "").trim()));
  return { item, skuMostrado, matched: !!match, montaje };
}
__name(resolveMarketplaceItem, "resolveMarketplaceItem");
function formaPedidoMarketplace(ref) {
  const r = String(ref || "").trim().toUpperCase().replace(/-[A-Z]$/, "-X");
  return r.slice(0, 1) + "|" + r.replace(/\d+/g, (m) => "#" + m.length);
}
__name(formaPedidoMarketplace, "formaPedidoMarketplace");
function comprobarTiendaFichero(orders, platform, existentes) {
  const formas = /* @__PURE__ */ new Map();
  const refs = /* @__PURE__ */ new Map();
  for (const o of existentes) {
    if (!o.platform || o.platform === "Shopify" || !o.orderRef) continue;
    const f = formaPedidoMarketplace(o.orderRef);
    if (!formas.has(f)) formas.set(f, /* @__PURE__ */ new Set());
    formas.get(f).add(o.platform);
    if (o.platform !== platform) refs.set(String(o.orderRef).toUpperCase(), o.platform);
  }
  const votos = {};
  let ajenos = 0;
  let ejemplo = "";
  for (const o of orders) {
    const ref = String(o.orderRef || "").toUpperCase();
    const enOtra = refs.get(ref);
    const f = formas.get(formaPedidoMarketplace(ref));
    const otraPorForma = f && !f.has(platform) ? [...f][0] : null;
    const otra = enOtra || otraPorForma;
    if (otra) {
      ajenos++;
      votos[otra] = (votos[otra] || 0) + 1;
      if (!ejemplo) ejemplo = o.orderRef;
    }
  }
  if (!orders.length || ajenos < Math.max(1, Math.ceil(orders.length / 2))) return null;
  const probable = Object.entries(votos).sort((a, b) => b[1] - a[1])[0][0];
  return {
    probable,
    ajenos,
    total: orders.length,
    ejemplo,
    mensaje: "Este fichero no parece de " + platform + ": " + ajenos + " de " + orders.length + " pedidos tienen el formato de " + probable + " (ej. " + ejemplo + "). No se ha subido nada."
  };
}
__name(comprobarTiendaFichero, "comprobarTiendaFichero");
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
    services: serviceParts.join(" \xB7 "),
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
    limiteEnvio: first.limiteEnvio || ""
  };
}
__name(mapMarketplaceOrder, "mapMarketplaceOrder");
async function handleSyncCatalog(env) {
  const products = await fetchShopifyProducts(env);
  const stub = inventoryStub(env);
  const res = await stub.fetch("https://do/catalog/sync", {
    method: "POST",
    body: JSON.stringify(products)
  });
  return new Response(await res.text(), { headers: { "content-type": "application/json" } });
}
__name(handleSyncCatalog, "handleSyncCatalog");
async function loadCatalogMap(env) {
  const catalogRes = await inventoryStub(env).fetch("https://do/catalog");
  const catalogList = await catalogRes.json();
  return Object.fromEntries(catalogList.map((p) => [p.productId, p]));
}
__name(loadCatalogMap, "loadCatalogMap");
async function handleSync(env) {
  const rawOrders = await fetchShopifyOrders(env);
  const catalogMap = await loadCatalogMap(env);
  const mapped = rawOrders.map((o) => mapOrder(o, catalogMap));
  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  const res = await stub.fetch("https://do/orders/import", {
    method: "POST",
    body: JSON.stringify(mapped)
  });
  const { notasParaFulfillar } = await res.json();
  await procesarNotasFulfillar(env, notasParaFulfillar);
  return Response.json({ synced: mapped.length });
}
__name(handleSync, "handleSync");
async function handleUpsertOrder(rawOrder, env) {
  const catalogMap = await loadCatalogMap(env);
  const mapped = mapOrder(rawOrder, catalogMap);
  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  const res = await stub.fetch("https://do/orders/upsert", {
    method: "POST",
    body: JSON.stringify(mapped)
  });
  const { notasParaFulfillar } = await res.json();
  await procesarNotasFulfillar(env, notasParaFulfillar);
}
__name(handleUpsertOrder, "handleUpsertOrder");
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
__name(verifyShopifyWebhook, "verifyShopifyWebhook");
async function handleWebhook(request, env) {
  const rawBody = await verifyShopifyWebhook(request, env);
  if (!rawBody) {
    return new Response("Invalid signature", { status: 401 });
  }
  const order = JSON.parse(rawBody);
  await handleUpsertOrder(order, env);
  return new Response("ok");
}
__name(handleWebhook, "handleWebhook");
async function handleUpdateMeta(request, env) {
  const body = await request.json();
  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  return stub.fetch("https://do/orders/meta", {
    method: "POST",
    body: JSON.stringify(body)
  });
}
__name(handleUpdateMeta, "handleUpdateMeta");
async function handleReviewNote(request, env) {
  const body = await request.json();
  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  return stub.fetch("https://do/orders/review-note", {
    method: "POST",
    body: JSON.stringify(body)
  });
}
__name(handleReviewNote, "handleReviewNote");
async function pedidoDeBackorder(env, entry) {
  try {
    const orders = await (await env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify")).fetch("https://do/orders")).json();
    return orders.find((x) => String(x.id) === String(entry.orderId)) || null;
  } catch (e) {
    return null;
  }
}
__name(pedidoDeBackorder, "pedidoDeBackorder");
async function avisarAlmacenTransformacion(env, entry) {
  const o = await pedidoDeBackorder(env, entry);
  const cliente = o && o.name || "";
  const pedido = referenciaPedidoAlmacen(entry);
  const unidades = entry.cantidad || 1;
  const lineas = [
    "Hay que subir a f\xE1brica para transformar:",
    "",
    `${entry.stockModel}`,
    `De ${entry.transformadoDesde}${entry.transformadoDesdeAbierto ? " (el colch\xF3n ABIERTO" + (entry.notaAbierto ? " \u2014 " + entry.notaAbierto : "") + ")" : ""} a ${entry.talla} \u2014 ${unidades} ${unidades > 1 ? "unidades" : "unidad"}`,
    "",
    `Pedido: ${pedido}${cliente ? " \u2014 " + cliente : ""}`,
    "",
    "Sale por Furniture (colch\xF3n abierto).",
    "",
    "Se adjunta la etiqueta para imprimir y pegar en el colch\xF3n."
  ];
  const pdf = etiquetaTransformacionPdf({
    pedido,
    cliente,
    modelo: modeloCorto(entry.stockModel) + (entry.transformadoDesdeAbierto ? " \xB7 ABIERTO" + (entry.notaAbierto ? " \xB7 " + entry.notaAbierto : "") : ""),
    desde: entry.transformadoDesde,
    hasta: entry.talla,
    unidades,
    fecha: fechaHoyEs()
  });
  return enviarEmailAlmacen(env, { asunto: `Transformaci\xF3n de colch\xF3n \u2014 ${pedido}`, texto: lineas.join("\n"), pdf, nombrePdf: `Etiqueta transformacion ${pedido}.pdf` });
}
__name(avisarAlmacenTransformacion, "avisarAlmacenTransformacion");
async function reservarStockManual(env, entry, { agencia, fechaSalida } = {}) {
  const o = await pedidoDeBackorder(env, entry);
  const cliente = o && o.name || "";
  const pedido = referenciaPedidoAlmacen(entry);
  let bultos;
  if (entry.tipo === "tapiceria") {
    let piezas = piezasBackorder(entry, o && o.product || "", tapaPartidaFurniture(o && o.services || ""), o && o.services || "");
    if (Array.isArray(entry.piezasIdx) && entry.piezasIdx.length && entry.stockModelArticulo) {
      const todas = piezasBackorder({ ...entry, stockModel: entry.stockModelArticulo }, o && o.product || "", tapaPartidaFurniture(o && o.services || ""), o && o.services || "");
      piezas = entry.canapeCompleto ? todas : entry.piezasIdx.map((i) => todas[i]).filter(Boolean);
    }
    bultos = piezas.map((p) => {
      let resto = p.texto;
      if (entry.referencia && resto.startsWith(entry.referencia + " ")) resto = resto.slice(entry.referencia.length + 1);
      if (p.parte && resto.startsWith(p.parte + " ")) resto = resto.slice(p.parte.length + 1);
      return { articulo: resto, parte: p.parte === "REVISAR" ? "" : p.parte };
    });
  } else {
    bultos = bultosPorUnidad(entry);
  }
  return enviarReservaAlmacen(env, { pedido, cliente, lineasTexto: [lineaTextoReserva(entry)], bultos, agencia, fechaSalida });
}
__name(reservarStockManual, "reservarStockManual");
async function proxyInventory(env, path, request) {
  const stub = inventoryStub(env);
  const init = request.method === "GET" ? void 0 : { method: request.method, body: await request.text() };
  const res = await stub.fetch("https://do" + path, init);
  return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
}
__name(proxyInventory, "proxyInventory");
async function getAvisosCancelados(env) {
  const ordersId = env.ORDERS_STORE.idFromName("shopify");
  const ordersStub = env.ORDERS_STORE.get(ordersId);
  const invStub = inventoryStub(env);
  const [orders, backorders] = await Promise.all([
    ordersStub.fetch("https://do/orders").then((r) => r.json()),
    invStub.fetch("https://do/backorders").then((r) => r.json())
  ]);
  const canceladosById = new Map(orders.filter((o) => o.cancelado).map((o) => [o.id, o]));
  const autoCancelar = backorders.filter((b) => canceladosById.has(b.orderId) && b.estado === "pendiente" && !b.pedidoGenerado);
  await Promise.all(autoCancelar.map((b) => invStub.fetch(`https://do/backorders/${encodeURIComponent(b.id)}/cancelar`, { method: "POST" })));
  const fechaAuto = (/* @__PURE__ */ new Date()).toISOString();
  for (const b of autoCancelar) {
    b.estado = "cancelado";
    b.fechaCancelado = fechaAuto;
  }
  const pendientes = [];
  const resueltos = [];
  for (const b of backorders) {
    const order = canceladosById.get(b.orderId);
    if (!order || b.estado !== "pendiente" && b.estado !== "cancelado") continue;
    const item = {
      backorderId: b.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      name: order.name,
      platform: order.platform,
      orderRef: order.orderRef,
      proveedor: b.proveedor,
      stockModel: b.stockModel,
      talla: b.talla,
      cantidad: b.cantidad,
      pedidoGenerado: !!b.pedidoGenerado,
      fechaPedidoFabrica: b.fechaPedidoFabrica || null,
      fechaCancelado: b.fechaCancelado || null
    };
    if (b.estado === "pendiente") pendientes.push(item);
    else resueltos.push(item);
  }
  return { pendientes, resueltos };
}
__name(getAvisosCancelados, "getAvisosCancelados");
async function handleGetOrders(env) {
  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  return stub.fetch("https://do/orders");
}
__name(handleGetOrders, "handleGetOrders");
async function handleWebSocket(request, env) {
  const id = env.ORDERS_STORE.idFromName("shopify");
  const stub = env.ORDERS_STORE.get(id);
  return stub.fetch("https://do/ws", request);
}
__name(handleWebSocket, "handleWebSocket");
var PLATFORMS = [
  { id: "shopify", label: "Shopify", ready: true },
  { id: "carrefour", label: "Carrefour", ready: true },
  { id: "maison-du-monde", label: "Maison du Monde", ready: true },
  { id: "worten", label: "Worten", ready: true },
  { id: "conforama-es", label: "Conforama ES", ready: true },
  // Jennifer, 2026-09-21: "la tienda de Conforama Francia, que para ti es
  // CONFORAMA a secas" — Conforama ES queda aparcada, así que la francesa
  // se llama simplemente "Conforama", sin sufijo, para no crear confusión.
  { id: "conforama", label: "Conforama", ready: true },
  { id: "leroy-merlin", label: "Leroy Merlin", ready: true }
];
var USERS = ["JENNIFER", "SERGIO"];
var COLOR_ACCESS_USERS = ["SERGIO"];
var PAGO_MANUAL_USERS = ["JENNIFER"];
var COLOR_META = {
  rojo: { label: "Cancelado", bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
  verde: { label: "Entregado", bg: "#dcfce7", text: "#146138", dot: "#22c55e" },
  naranja: { label: "Enviado", bg: "#ffedd5", text: "#9a3412", dot: "#f97316" },
  amarillo: { label: "No enviado", bg: "#fef9c3", text: "#854d0e", dot: "#eab308" },
  azul: { label: "Pendiente de pago", bg: "#dbeafe", text: "#1e40af", dot: "#3b82f6" }
};
function renderPage() {
  const navItems = PLATFORMS.map(
    (p) => `<li>
        <a href="#" class="nav-link${p.ready ? " active" : ""}" data-platform="${p.id}">
          ${p.label}${p.ready ? "" : '<span class="soon">pr\xF3x.</span>'}${p.id !== "shopify" ? `<span id="plazo-badge-${p.id}" class="plazo-badge" style="display:none" title="Pedidos que vencen ma\xF1ana, hoy o ya vencidos sin seguimiento"></span>` : ""}
        </a>
      </li>`
  ).join("");
  const userButtons = USERS.map((u) => `<button class="user-btn" data-user="${u}">${u}</button>`).join("");
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Gesti\xF3n HappyDeal \xB7 Pedidos</title>
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
  /* Rat\xF3n encima: azul gris\xE1ceo, distinto del verde de "ya pedido" (Jennifer, 2026-10-08). */
  tbody tr:hover { background: #e6eef8; }
  #payment-filter, #estado-filter { text-transform: none; font-size: 11px; margin-top: 4px; padding: 2px 4px; font-weight: 400; letter-spacing: normal; }
  #carrefour-table td:first-child, #maison-du-monde-table td:first-child, #worten-table td:first-child, #conforama-table td:first-child, #conforama-es-table td:first-child, #leroy-merlin-table td:first-child { white-space: nowrap; }
  /* Tabla de Pedidos > Shopify m\xE1s compacta (Jennifer, 2026-09-16): filas
     m\xE1s estrechas para ver m\xE1s pedidos de un vistazo sin scroll. */
  #orders th, #orders td { padding: 4px 12px; }
  #orders td { font-size: 13px; }
  /* Mismo motivo en Proveedores (Luso/New/Polival), Jennifer, 2026-09-23:
     "solo me entran 5 l\xEDneas y hay que hacer demasiado scroll" \u2014 filas m\xE1s
     estrechas, y el textarea de "Mercanc\xEDa para pedir a f\xE1brica" (el que
     m\xE1s alto hac\xEDa la fila) m\xE1s bajo por defecto \u2014 sigue siendo
     redimensionable a mano (resize:vertical) si hace falta m\xE1s texto. */
  #pendientes-table th, #pendientes-table td { padding: 2px 8px; }
  #pendientes-table td { font-size: 12px; }
  #pendientes-table .fabricacion-input { min-height: 22px; padding: 3px 6px; }
  #pendientes-table input, #pendientes-table select, #pendientes-table textarea { font-size: 12px; }
  #pendientes-table .resolver-btn, #pendientes-table .resolver-seur-btn, #pendientes-table .sustituir-btn { padding: 3px 8px; font-size: 12px; }
  /* Proveedores (Jennifer, 2026-10-01: "necesito una fila de scroll... para
     poder ir de izquierda a derecha porque la lista ahora es muy larga"): la
     tabla ocupa como mucho el alto de la pantalla, as\xED la barra horizontal
     de abajo siempre se ve, y hay otra barra igual encima de la tabla. */
  #pendientes-wrap { max-height: calc(100vh - 200px); margin-top: 0; border-top-left-radius: 0; border-top-right-radius: 0; }
  .scroll-arriba { margin: 0 2rem; overflow-x: auto; overflow-y: hidden; height: 16px; border: 1px solid var(--border); border-bottom: none; border-radius: 12px 12px 0 0; background: var(--panel); }
  .scroll-arriba > div { height: 1px; }
  /* La caja de la tabla se limita a la altura visible de la pantalla, para
     que su barra de scroll horizontal quede siempre a mano sin tener que
     bajar hasta el final de la p\xE1gina (Jennifer, 2026-09-16). */
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
  /* Fecha l\xEDmite de env\xEDo de marketplaces (2026-09-29) */
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
     "ya tenemos muchos iconos... ponerlos en dos l\xEDneas"). */
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
  .caso-campo { display: block; font-size: 13px; margin: 8px 0; }
  .caso-campo input, .caso-campo textarea, .caso-campo select { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; }
  .caso-pedido-info { font-size: 12px; color: var(--muted); margin: -2px 0 6px; }
  .caso-historial { margin: 10px 0; padding: 8px 10px; border: 1px solid var(--border, #e5e7eb); border-radius: 8px; max-height: 220px; overflow-y: auto; font-size: 12.5px; }
  .caso-historial-item { padding: 4px 0; border-bottom: 1px dashed var(--border, #e5e7eb); }
  .caso-historial-item:last-child { border-bottom: 0; }
  .caso-historial-item .meta { color: var(--muted); font-size: 11px; }
  .caso-tag { display: inline-block; margin-left: 4px; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; font-weight: 600; background: #ccfbf1; color: #115e59; cursor: pointer; }
  .tareas-dia { margin: 8px 0; background: var(--panel, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 8px; padding: 0 12px; }
  .tareas-dia summary { cursor: pointer; padding: 10px 0; font-size: 14px; }
  .tareas-dia[open] summary { border-bottom: 1px solid var(--border, #e5e7eb); margin-bottom: 6px; }
  .tareas-dia .table-wrap { margin-bottom: 10px; }
  .dir-edit-btn { padding: 0 4px; font-size: 12px; background: transparent; border: 1px solid var(--border, #e5e7eb); border-radius: 4px; cursor: pointer; }
  .caso-atrasado { color: #b91c1c; font-weight: 600; }
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
  #buscador-general { width: 230px; padding: 7px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.4); font: inherit; font-size: 13px; }
  .buscador-datos { font-size: 13px; line-height: 1.5; margin: 6px 0 10px; }
  .buscador-aviso { margin: 8px 0 10px; padding: 12px 16px; border: 2px solid #f59e0b; border-radius: 10px; background: #fef3c7; color: #92400e; font-size: 22px; font-weight: 800; text-align: center; letter-spacing: 0.5px; }
  .buscador-nota { margin-top: 4px; padding: 4px 8px; background: #fef9c3; border-radius: 6px; }
  .buscador-seg { margin: 8px 0 10px; padding: 10px 14px; border: 2px solid #dc2626; border-radius: 10px; background: #fef2f2; font-size: 18px; font-weight: 700; }
  .buscador-seg a { color: #dc2626; text-decoration: underline; }
  .buscador-seg-tit { font-size: 12px; letter-spacing: 1px; color: #dc2626; margin-bottom: 2px; }
  .buscador-seg-estado { color: #7f1d1d; font-weight: 600; font-size: 15px; }
  .buscador-agenda { margin: 8px 0 10px; padding: 8px 14px; border: 2px solid #7c3aed; border-radius: 10px; background: #f5f3ff; }
  .buscador-agenda ul { margin: 0; padding-left: 18px; }
  .modal-box h4 { margin: 12px 0 4px; color: var(--brand-dark); }
  .buscador-donde { margin: 0 0 0 18px; padding: 0; font-size: 13px; line-height: 1.6; }
  .buscador-historico { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .buscador-historico td { padding: 4px 6px; border-bottom: 1px dashed var(--border, #e5e7eb); vertical-align: top; }
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
  .todo-junto-tag { margin: 2px 0 4px 22px; font-size: 11.5px; font-weight: 700; color: #b91c1c; }
  .fpk-tag { display: inline-block; margin-left: 4px; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; font-weight: 600; background: #fef3c7; color: #92400e; }
  .furniture-ya-salio-tag { display: block; margin-top: 4px; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; font-weight: 600; background: #dbeafe; color: #1e40af; }
  .furniture-pendiente-tag { display: block; margin-top: 4px; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; font-weight: 600; background: #fef3c7; color: #92400e; }
  .carga-abierta-box .toolbar { padding: 1rem 1rem 0.25rem; }
  .carga-abierta-box .table-wrap { max-height: 320px; }
  /* Cargas de SEUR (Jennifer, 2026-09-29: "el cuadro se corta"): la tabla
     solo tiene 6 columnas, as\xED que se ajusta al ancho del cuadro en vez del
     m\xEDnimo general de 1100px, y el texto largo pasa a la l\xEDnea de abajo. Si
     aun as\xED algo no cabe, el cuadro se puede desplazar en horizontal. */
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
  /* Jennifer, 2026-09-29: "que toda la informaci\xF3n entre a golpe de vista" \u2014
     las cargas de SEUR se ven enteras, sin l\xEDmite de alto ni scroll interno,
     y los botones de quitar pueden partirse en dos l\xEDneas. */
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
  .recoge-cliente-tag { display: inline-block; margin-top: 4px; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; font-weight: 700; background: #e0e7ff; color: #3730a3; }
  .gesto-comercial-tag { display: inline-block; margin-top: 4px; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; font-weight: 700; background: #f3e8ff; color: #6b21a8; }
  /* Ya pedido a f\xE1brica: verde m\xE1s oscuro y raya verde a la izquierda (Jennifer, 2026-10-08). */
  tr.fila-pedido-generado { background: #cdeed9; }
  tr.fila-pedido-generado td:first-child { box-shadow: inset 4px 0 0 #1f8a4c; }
  tr.fila-pedido-generado:hover { background: #b5e3c6; }
  tr.fila-cuarentena, tr.fila-cuarentena.fila-pedido-generado { background: #fef3c7; }
  tr.fila-cuarentena td:first-child { box-shadow: inset 4px 0 0 #ea580c; }
  tr.fila-cuarentena:hover, tr.fila-cuarentena.fila-pedido-generado:hover { background: #fde68a; }
  .cuarentena-tag { display: inline-block; margin: 2px 0; padding: 2px 6px; border-radius: 4px; background: #ea580c; color: #fff; font-size: 12px; font-weight: 600; }
  @media (prefers-color-scheme: dark) { tr.fila-cuarentena, tr.fila-cuarentena.fila-pedido-generado { background: #451a03; } tr.fila-cuarentena:hover, tr.fila-cuarentena.fila-pedido-generado:hover { background: #78350f; } }
  tr.fila-grupo-inicio td, tr.fila-grupo-medio td, tr.fila-grupo-fin td { border-left: 2px solid var(--brand); border-right: 2px solid var(--brand); }
  tr.fila-grupo-inicio td { border-top: 2px solid var(--brand); }
  tr.fila-grupo-fin td { border-bottom: 2px solid var(--brand); }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"><\/script>
</head>
<body>
<div id="user-gate" class="user-gate">
  <div class="user-gate-card">
    <h2>\xBFQui\xE9n eres?</h2>
    <div class="user-gate-options">${userButtons}</div>
  </div>
</div>
<nav class="sidebar">
  <div class="brand">Gesti\xF3n HappyDeal</div>
  <button class="section-title" id="agenda-toggle">
    <span>Agenda de casos</span>
    <span class="chevron">\u25B6</span>
  </button>
  <ul id="agenda-list">
    <li><a href="#" class="nav-link" data-agenda="casos">Casos abiertos <span id="casos-badge" class="abiertos-badge" style="display:none;background:#0d9488"></span></a></li>
    <li><a href="#" class="nav-link" data-agenda="tareas">Tareas <span id="tareas-badge" class="abiertos-badge" style="display:none;background:#0d9488"></span></a></li>
  </ul>
  <button class="section-title" id="pedidos-toggle">
    <span>Pedidos</span>
    <span class="chevron">\u25B6</span>
  </button>
  <ul id="pedidos-list">${navItems}</ul>
  <button class="section-title" id="inventario-toggle">
    <span>Inventario</span>
    <span class="chevron">\u25B6</span>
  </button>
  <ul id="inventario-list">
    <li><a href="#" class="nav-link" data-inventario="catalogo">Cat\xE1logo</a></li>
    <li><a href="#" class="nav-link" data-inventario="stock">Stock</a></li>
    <li><a href="#" class="nav-link" data-inventario="abiertos">Colchones abiertos <span id="abiertos-badge" class="abiertos-badge" style="display:none" title="Pedidos de Furniture que pueden usar un colch\xF3n abierto"></span></a></li>
    <li><a href="#" class="nav-link" data-inventario="historial">Historial de stock</a></li>
    <li><a href="#" class="nav-link" data-inventario="pesos">Pesos SEUR</a></li>
  </ul>
  <button class="section-title" id="proveedores-toggle">
    <span>Proveedores</span>
    <span class="chevron">\u25B6</span>
  </button>
  <ul id="proveedores-list">
    <li><a href="#" class="nav-link" data-proveedores="polival">Polival</a></li>
    <li><a href="#" class="nav-link" data-proveedores="luso">Luso</a></li>
    <li><a href="#" class="nav-link" data-proveedores="new">New</a></li>
    <li><a href="#" class="nav-link" data-proveedores="decision">Pendiente de decisi\xF3n</a></li>
    <li><a href="#" class="nav-link" data-proveedores="revisar">Sin proveedor</a></li>
  </ul>
  <button class="section-title" id="logistica-toggle">
    <span>Log\xEDstica</span>
    <span class="chevron">\u25B6</span>
  </button>
  <ul id="logistica-list">
    <li class="sublista-header">FURNITURE</li>
    <li><a href="#" class="nav-link sublink" data-logistica="furniture">Pedidos pendientes</a></li>
    <li><a href="#" class="nav-link sublink" data-logistica="historial-cargas">Historial de cargas</a></li>
    <li><a href="#" class="nav-link sublink" data-logistica="casos-revisar">Casos a revisar</a></li>
    <li class="sublista-header">SEUR</li>
    <li><a href="#" class="nav-link sublink" data-logistica="seur">Pedidos pendientes</a></li>
    <li><a href="#" class="nav-link sublink" data-logistica="historial-cargas-seur">Historial de cargas</a></li>
    <li><a href="#" class="nav-link sublink" data-logistica="casos-revisar-seur">Env\xEDos SEUR</a></li>
    <li><a href="#" class="nav-link sublink" data-logistica="devoluciones-seur">Devueltos</a></li>
  </ul>
  <button class="section-title" id="historico-toggle">
    <span>Hist\xF3rico</span>
    <span class="chevron">\u25B6</span>
  </button>
  <ul id="historico-list">
    <li><a href="#" class="nav-link" data-historico="rep-gc">Hist\xF3rico reposiciones y gestos comerciales</a></li>
  </ul>
  <button class="section-title" id="tarifas-toggle">
    <span>Tarifas</span>
    <span class="chevron">\u25B6</span>
  </button>
  <ul id="tarifas-list">
    <li><a href="#" class="nav-link" data-tarifas="consultar">Consultar tarifas</a></li>
    <li><a href="#" class="nav-link" data-tarifas="plataformas">Ficheros plataformas</a></li>
  </ul>
  <button class="section-title" id="plazos-toggle">
    <span>Plazos de entrega</span>
    <span class="chevron">\u25B6</span>
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
      <h1 id="view-title">Pedidos \xB7 Shopify</h1>
      <p>Vista en vivo sincronizada con tu tienda</p>
    </div>
    <div style="display:flex;align-items:center;gap:14px">
      <input type="search" id="buscador-general" placeholder="\u{1F50E} Buscar pedido (n\xBA, nombre, tel\xE9fono\u2026)" title="Escribe y pulsa Intro: todo lo del pedido en la app y su hist\xF3rico" />
      <button type="button" id="avisos-cancelados-btn" class="avisos-bell-btn" title="Pedidos cancelados con pendiente en Proveedores">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a1 1 0 0 1 1 1v1.06A7.002 7.002 0 0 1 19 11v3.586l1.707 1.707A1 1 0 0 1 20 18H4a1 1 0 0 1-.707-1.707L5 14.586V11a7.002 7.002 0 0 1 6-6.94V3a1 1 0 0 1 1-1zm0 20a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22z"/></svg>
        <span id="avisos-cancelados-count" class="avisos-bell-count" style="display:none">0</span>
      </button>
      <div class="user-badge" id="user-badge"></div>
    </div>
  </div>
</header>

<div class="modal-overlay" id="buscador-modal-overlay">
  <div class="modal-box modal-box-wide">
    <h3 id="buscador-titulo">Buscar pedido</h3>
    <div id="buscador-resultado"></div>
    <div class="modal-actions">
      <button type="button" class="secondary" id="buscador-cerrar-btn">Cerrar</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="avisos-cancelados-modal-overlay">
  <div class="modal-box modal-box-wide">
    <h3>Pedidos cancelados con pendiente en Proveedores</h3>
    <p style="margin:0 0 0.75rem;color:var(--muted);font-size:13px">Si ya se pidi\xF3 a f\xE1brica, llama al proveedor para cancelarlo antes de marcarlo aqu\xED.</p>
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
    <input id="search" type="text" placeholder="Buscar por n\xBA de pedido o nombre..." />
    <span class="color-filter-wrap" id="color-filter-wrap" style="display:none">
      <label for="color-filter">Filtrar por estado:</label>
      <select id="color-filter">
        <option value="">Todos</option>
        <option value="rojo">\u{1F534} Cancelado</option>
        <option value="verde">\u{1F7E2} Entregado</option>
        <option value="naranja">\u{1F7E0} Enviado</option>
        <option value="amarillo">\u{1F7E1} No enviado</option>
        <option value="azul">\u{1F535} Pendiente de pago</option>
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
    <input id="carrefour-search" type="text" placeholder="Buscar por n\xBA de pedido o nombre..." />
    <label class="ocultar-recibidos-label"><input type="checkbox" id="carrefour-orden-limite"> Primero los que vencen antes</label>
    <button type="button" id="carrefour-upload-btn" class="secondary">Subir fichero de Carrefour</button>
    <input type="file" id="carrefour-upload-input" accept=".xlsx" style="display:none" />
    <span id="carrefour-upload-status" class="inventario-count" style="padding:0"></span>
  </div>
  <div id="carrefour-sku-aviso" class="inventario-count" style="display:none;color:#991b1b;font-weight:600"></div>
  <div id="carrefour-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="carrefour-table">
      <thead><tr><th></th><th>N\xBA Pedido</th><th>Fecha pedido</th><th>L\xEDmite env\xEDo</th><th>Nombre</th><th>Direcci\xF3n</th><th>CP</th><th>Poblaci\xF3n</th><th>Provincia</th><th>Pa\xEDs</th><th>Tel\xE9fono</th><th>Producto</th><th>Cantidad</th><th>SKU</th><th>Precio</th><th>Seguimiento</th><th>Notas</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-maison-du-monde" style="display:none">
  <div class="toolbar">
    <input id="maison-du-monde-search" type="text" placeholder="Buscar por n\xBA de pedido o nombre..." />
    <label class="ocultar-recibidos-label"><input type="checkbox" id="maison-du-monde-orden-limite"> Primero los que vencen antes</label>
    <button type="button" id="maison-du-monde-upload-btn" class="secondary">Subir fichero de Maison Du Monde</button>
    <input type="file" id="maison-du-monde-upload-input" accept=".xlsx" style="display:none" />
    <span id="maison-du-monde-upload-status" class="inventario-count" style="padding:0"></span>
  </div>
  <div id="maison-du-monde-sku-aviso" class="inventario-count" style="display:none;color:#991b1b;font-weight:600"></div>
  <div id="maison-du-monde-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="maison-du-monde-table">
      <thead><tr><th></th><th>N\xBA Pedido</th><th>Fecha pedido</th><th>L\xEDmite env\xEDo</th><th>Nombre</th><th>Direcci\xF3n</th><th>CP</th><th>Poblaci\xF3n</th><th>Provincia</th><th>Pa\xEDs</th><th>Tel\xE9fono</th><th>Producto</th><th>Cantidad</th><th>SKU</th><th>Precio</th><th>Seguimiento</th><th>Notas</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-worten" style="display:none">
  <div class="toolbar">
    <input id="worten-search" type="text" placeholder="Buscar por n\xBA de pedido o nombre..." />
    <label class="ocultar-recibidos-label"><input type="checkbox" id="worten-orden-limite"> Primero los que vencen antes</label>
    <button type="button" id="worten-upload-btn" class="secondary">Subir fichero de Worten</button>
    <input type="file" id="worten-upload-input" accept=".xlsx" style="display:none" />
    <span id="worten-upload-status" class="inventario-count" style="padding:0"></span>
  </div>
  <div id="worten-sku-aviso" class="inventario-count" style="display:none;color:#991b1b;font-weight:600"></div>
  <div id="worten-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="worten-table">
      <thead><tr><th></th><th>N\xBA Pedido</th><th>Fecha pedido</th><th>L\xEDmite env\xEDo</th><th>Nombre</th><th>Direcci\xF3n</th><th>CP</th><th>Poblaci\xF3n</th><th>Provincia</th><th>Pa\xEDs</th><th>Tel\xE9fono</th><th>Producto</th><th>Cantidad</th><th>SKU</th><th>Precio</th><th>Seguimiento</th><th>Notas</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-conforama" style="display:none">
  <div class="toolbar">
    <input id="conforama-search" type="text" placeholder="Buscar por n\xBA de pedido o nombre..." />
    <label class="ocultar-recibidos-label"><input type="checkbox" id="conforama-orden-limite"> Primero los que vencen antes</label>
    <button type="button" id="conforama-upload-btn" class="secondary">Subir fichero de Conforama</button>
    <input type="file" id="conforama-upload-input" accept=".xlsx" style="display:none" />
    <span id="conforama-upload-status" class="inventario-count" style="padding:0"></span>
  </div>
  <div id="conforama-sku-aviso" class="inventario-count" style="display:none;color:#991b1b;font-weight:600"></div>
  <div id="conforama-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="conforama-table">
      <thead><tr><th></th><th>N\xBA Pedido</th><th>Fecha pedido</th><th>L\xEDmite env\xEDo</th><th>Nombre</th><th>Direcci\xF3n</th><th>CP</th><th>Poblaci\xF3n</th><th>Provincia</th><th>Pa\xEDs</th><th>Tel\xE9fono</th><th>Producto</th><th>Cantidad</th><th>SKU</th><th>Precio</th><th>Seguimiento</th><th>Notas</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-conforama-es" style="display:none">
  <div class="toolbar">
    <input id="conforama-es-search" type="text" placeholder="Buscar por n\xBA de pedido o nombre..." />
    <label class="ocultar-recibidos-label"><input type="checkbox" id="conforama-es-orden-limite"> Primero los que vencen antes</label>
    <button type="button" id="conforama-es-upload-btn" class="secondary">Subir fichero de Conforama ES</button>
    <input type="file" id="conforama-es-upload-input" accept=".xlsx" style="display:none" />
    <span id="conforama-es-upload-status" class="inventario-count" style="padding:0"></span>
  </div>
  <div id="conforama-es-sku-aviso" class="inventario-count" style="display:none;color:#991b1b;font-weight:600"></div>
  <div id="conforama-es-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="conforama-es-table">
      <thead><tr><th></th><th>N\xBA Pedido</th><th>Fecha pedido</th><th>L\xEDmite env\xEDo</th><th>Nombre</th><th>Direcci\xF3n</th><th>CP</th><th>Poblaci\xF3n</th><th>Provincia</th><th>Pa\xEDs</th><th>Tel\xE9fono</th><th>Producto</th><th>Cantidad</th><th>SKU</th><th>Precio</th><th>Seguimiento</th><th>Notas</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-leroy-merlin" style="display:none">
  <div class="toolbar">
    <input id="leroy-merlin-search" type="text" placeholder="Buscar por n\xBA de pedido o nombre..." />
    <label class="ocultar-recibidos-label"><input type="checkbox" id="leroy-merlin-orden-limite"> Primero los que vencen antes</label>
    <button type="button" id="leroy-merlin-upload-btn" class="secondary">Subir fichero de Leroy Merlin</button>
    <input type="file" id="leroy-merlin-upload-input" accept=".xlsx" style="display:none" />
    <span id="leroy-merlin-upload-status" class="inventario-count" style="padding:0"></span>
  </div>
  <div id="leroy-merlin-sku-aviso" class="inventario-count" style="display:none;color:#991b1b;font-weight:600"></div>
  <div id="leroy-merlin-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="leroy-merlin-table">
      <thead><tr><th></th><th>N\xBA Pedido</th><th>Fecha pedido</th><th>L\xEDmite env\xEDo</th><th>Nombre</th><th>Direcci\xF3n</th><th>CP</th><th>Poblaci\xF3n</th><th>Provincia</th><th>Pa\xEDs</th><th>Tel\xE9fono</th><th>Producto</th><th>Cantidad</th><th>SKU</th><th>Precio</th><th>Seguimiento</th><th>Notas</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-catalogo" style="display:none">
  <div class="toolbar">
    <button id="sync-catalogo">Sincronizar cat\xE1logo</button>
    <span id="catalogo-count" class="inventario-count"></span>
  </div>
  <div class="table-wrap">
    <table id="catalogo-table">
      <thead>
        <tr><th>Producto</th><th>Modelo de stock</th><th>SKU (Shopify)</th><th>SKU alternativos (otras plataformas)</th><th>Proveedor</th><th>Excepci\xF3n FURNITURE</th><th>No llevamos stock</th><th>Excluido (ficha duplicada)</th></tr>
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
      <button id="quick-baja" type="button">Dar de baja (\u2212)</button>
    </div>
    <div id="quick-result" class="inventario-count"></div>
  </div>
  <div class="toolbar">
    <input id="stock-model-select" type="text" list="stock-models-datalist" placeholder="Escribe o elige un modelo..." autocomplete="off" />
    <input id="stock-talla-select" type="text" list="stock-tallas-datalist" placeholder="Medida (ej. 150x190)" autocomplete="off" style="width:170px" />
    <datalist id="stock-tallas-datalist"></datalist>
    <label style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap"><input type="checkbox" id="stock-solo-con-stock" /> Solo con stock real</label>
    <datalist id="stock-models-datalist"></datalist>
    <datalist id="stock-skus-datalist"></datalist>
  </div>
  <div id="stock-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="stock-table">
      <thead><tr><th id="stock-modelo-head" style="display:none">Modelo</th><th>Talla</th><th>Stock real</th><th>Vendido pendiente</th><th title="Pedidos para stock a Luso/New que a\xFAn no han llegado">Pedido para stock (en camino)</th><th title="Lo pedido para stock que todav\xEDa no tiene cliente: pasar\xE1 al stock al llegar">Libre al llegar</th><th>Ajustar</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-abiertos" style="display:none">
  <div class="abiertos-oportunidades-box">
    <h3 style="margin:0 0 6px">\u2702\uFE0F Pedidos que pueden usar un colch\xF3n abierto</h3>
    <div id="abiertos-oportunidades-count" class="inventario-count" style="padding:0 0 6px"></div>
    <div class="table-wrap">
      <table id="abiertos-oportunidades-table">
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Colch\xF3n del pedido</th><th>Abierto disponible</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
  <div class="quickform">
    <h3>Dar de alta / baja un colch\xF3n abierto</h3>
    <div class="toolbar">
      <input id="abiertos-query" type="text" list="abiertos-models-datalist" placeholder="Modelo de colch\xF3n..." autocomplete="off" />
      <datalist id="abiertos-models-datalist"></datalist>
      <input id="abiertos-talla" type="text" placeholder="Talla (ej. 150x190)" autocomplete="off" />
      <input id="abiertos-qty" type="number" min="1" value="1" />
      <input id="abiertos-nota" type="text" placeholder="Nota (opcional)" autocomplete="off" />
      <button id="abiertos-alta" type="button">Dar de alta (+)</button>
      <button id="abiertos-baja" type="button">Dar de baja (\u2212)</button>
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
    <label class="ocultar-recibidos-label"><input type="checkbox" id="pendientes-ocultar-recibidos"> Ocultar ya recibidos de f\xE1brica</label>
    <label class="ocultar-recibidos-label"><input type="checkbox" id="pendientes-mostrar-cancelados"> Mostrar cancelados</label>
    <button type="button" id="descargar-excel-pendientes-btn" class="secondary">Descargar Excel (todos los proveedores)</button>
    <span class="ocultar-recibidos-label" title="Lo que se ha marcado como recibido y se ha mandado apartar al almac\xE9n ese d\xEDa">Reservas al almac\xE9n del <input type="date" id="reservas-almacen-fecha"></span>
    <button type="button" id="descargar-reservas-almacen-btn" class="secondary">Descargar listado de reservas</button>
  </div>
  <div class="carga-abierta-box revision-box" id="revision-box" style="display:none">
    <div class="toolbar"><h3 style="margin:0">Pendientes de revisi\xF3n antes de pedir</h3></div>
    <div id="revision-count" class="inventario-count"></div>
    <div class="table-wrap">
      <table id="revision-table">
        <thead><tr><th>Pedido</th><th>Proveedor</th><th>Modelo</th><th>Talla</th><th>Cantidad</th><th>Coste tarifa</th><th>Motivo</th><th>Notas</th><th>Fecha del pedido</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
  <div class="toolbar" id="pendientes-toolbar" style="display:none">
    <button type="button" id="generar-pedido-btn" disabled>Generar pedido a f\xE1brica (PDF)</button>
    <button type="button" id="generar-pedido-excel-btn" disabled>Generar pedido a f\xE1brica (Excel)</button>
    <button type="button" id="marcar-ya-pedido-btn" class="secondary" disabled title="Ya se ha pedido a f\xE1brica por otra v\xEDa: se marca como pedido sin descargar nada">Marcar como ya pedido</button>
    <button type="button" id="pedido-stock-btn" class="secondary" style="display:none" title="Pedir colchones a este proveedor para tener en stock, sin pedido de cliente detr\xE1s">\u{1F4E6} Pedido para stock</button>
    <span id="seleccion-count" class="inventario-count" style="padding:0"></span>
  </div>
  <div id="pendientes-count" class="inventario-count"></div>
  <div class="scroll-arriba" id="pendientes-scroll-arriba"><div></div></div>
  <div class="table-wrap" id="pendientes-wrap">
    <table id="pendientes-table">
      <thead>
        <tr><th id="pendientes-check-head" style="display:none"></th><th>Pedido</th><th>Plataforma</th><th>Modelo</th><th>Color</th><th>Talla</th><th id="pendientes-sku-head">SKU</th><th>Cantidad</th><th id="pendientes-coste-head" title="Coste seg\xFAn la tarifa vigente del proveedor (precio unidad \xD7 unidades)">Coste tarifa</th><th id="pendientes-refpolival-head" style="display:none">Ref. Polival</th><th>Mercanc\xEDa para pedir a f\xE1brica</th><th>Notas</th><th>Fecha del pedido</th><th id="pendientes-furfpk-head">FUR/FPK</th><th id="pendientes-camion-head" title="Cu\xE1ndo se prev\xE9 que llegue del proveedor (para consultarlo). En colchones de pack es tambi\xE9n el cami\xF3n que decide FUR/FPK.">Previsi\xF3n de entrega</th><th>Recibido de f\xE1brica</th></tr>
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
      <button type="button" id="listado-almacen-btn" class="secondary listado-almacen-btn" disabled>Listado almac\xE9n</button>
      <button type="button" id="cerrar-carga-btn" disabled>Cerrar carga</button>
      <button type="button" id="tracking-upload-btn" class="secondary">Actualizar seguimiento Furniture</button>
      <input type="file" id="tracking-upload-input" accept=".xls,.htm,.html" style="display:none" />
      <span id="tracking-upload-status" class="inventario-count" style="padding:0"></span>
      <button type="button" id="tracking-report-btn" class="secondary" style="display:none">Descargar reporte de esta subida</button>
    </div>
    <div id="carga-abierta-count" class="inventario-count"></div>
    <div class="table-wrap">
      <table id="carga-abierta-table">
        <thead><tr><th><input type="checkbox" id="sel-todos-furniture" title="Marcar / desmarcar todos" /></th><th>Pedido</th><th>Plataforma</th><th>Nombre</th><th>Producto comprado</th><th>Servicios adicionales</th><th>Art\xEDculos / Llegada</th><th>Notas</th><th></th></tr></thead>
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
        <thead><tr><th>Pedido</th><th>Plataforma</th><th>Nombre</th><th>Producto comprado</th><th>Servicios adicionales</th><th>Art\xEDculos / Llegada</th><th>Notas</th><th></th></tr></thead>
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
        <thead><tr><th>Pedido</th><th>Plataforma</th><th>Nombre</th><th>Producto comprado</th><th>Servicios adicionales</th><th>Art\xEDculos / Llegada</th><th>Notas</th><th>Retenci\xF3n</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>

  <div class="toolbar" id="furniture-pendientes-toolbar">
    <button type="button" id="anadir-carga-btn" disabled>A\xF1adir a la carga</button>
    <button type="button" id="anadir-tener-en-cuenta-btn" disabled>A\xF1adir a "tener en cuenta"</button>
    <button type="button" id="retener-btn" class="secondary" disabled>Retener (el cliente lo quiere m\xE1s adelante)</button>
    <span id="furniture-seleccion-count" class="inventario-count" style="padding:0"></span>
  </div>
  <div id="furniture-pendientes-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="furniture-pendientes-table">
      <thead>
        <tr><th></th><th>Pedido</th><th>Plataforma</th><th>Nombre</th><th>Producto comprado</th><th>Servicios adicionales</th><th>Art\xEDculos / Llegada</th><th>Notas</th></tr>
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
  <div class="toolbar">
    <select id="casos-revisar-estado"><option value="">Todos los estados de Furniture</option></select>
    <input id="casos-revisar-search" type="text" placeholder="Buscar por pedido, nombre o albar\xE1n..." style="min-width:260px" />
  </div>
  <div id="casos-revisar-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="casos-revisar-table">
      <thead><tr><th>Pedido</th><th>Nombre</th><th>Albar\xE1n</th><th>Estado Furniture</th><th>Motivo</th><th>Seguimiento</th><th>Notas</th></tr></thead>
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
    <button type="button" id="envios-seur-anadir-btn" title="Meter en esta lista un env\xEDo por SEUR que no sali\xF3 en ninguna carga del sistema (ej. para reclamarlo)">+ A\xF1adir pedido</button>
    <input id="envios-seur-search" type="text" placeholder="Buscar por referencia, nombre u observaciones..." style="min-width:280px" />
    <select id="envios-seur-estado"><option value="">Todos los estados de SEUR</option></select>
    <select id="envios-seur-reclamado">
      <option value="">Reclamados y no reclamados</option>
      <option value="si">Solo reclamados a SEUR</option>
      <option value="no">Solo no reclamados</option>
      <option value="respuesta">\u{1F4AC} Con respuesta de SEUR sin leer</option>
      <option value="conversacion">\u2709 Con conversaci\xF3n con SEUR</option>
    </select>
    <label style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;color:#b91c1c;font-weight:600"><input type="checkbox" id="envios-seur-solo-avisos" /> \u26A0 Solo para reclamar (registrado +24 h)</label>
    <label style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;color:#1e40af;font-weight:600"><input type="checkbox" id="envios-seur-solo-punto" /> \u{1F4CD} Solo en punto de recogida</label>
    <label style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;color:#c2410c;font-weight:600"><input type="checkbox" id="envios-seur-solo-ausencia" /> \u{1F4DE} Solo ausencia o cierre (avisar al cliente)</label>
    <select id="envios-seur-pais"><option value="">Todos los pa\xEDses</option></select>
    <label style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap"><input type="checkbox" id="envios-seur-ocultar-entregados" checked /> Ocultar entregados</label>
    <label style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap"><input type="checkbox" id="envios-seur-ocultar-archivados" checked /> Ocultar archivados</label>
  </div>
  <div id="envios-seur-aviso" style="display:none;background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;border-radius:8px;padding:10px 14px;margin:6px 0;font-weight:600"></div>
  <div id="envios-seur-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="envios-seur-table">
      <thead><tr><th>Fecha de carga</th><th>Referencia pedido</th><th>Nombre</th><th>Pa\xEDs</th><th>Observaciones</th><th>Estado en SEUR</th><th>Reclamado a SEUR</th><th style="min-width:320px">Notas</th><th>Archivar</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-devoluciones-seur" style="display:none">
  <div class="toolbar">
    <button type="button" id="devoluciones-anadir-btn" title="Meter a mano un pedido devuelto que no ha entrado solo por el seguimiento de SEUR">+ A\xF1adir devoluci\xF3n</button>
    <input id="devoluciones-search" type="text" placeholder="Buscar por referencia, nombre o notas..." style="min-width:260px" />
    <select id="devoluciones-filtro">
      <option value="">Todas</option>
      <option value="sin-llegar">Sin llegar al almac\xE9n</option>
      <option value="sin-decidir">Llegadas, sin decidir qu\xE9 se hace</option>
      <option value="resueltas">Resueltas</option>
    </select>
  </div>
  <div id="devoluciones-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="devoluciones-table">
      <thead><tr><th>Detectado</th><th>Pedido</th><th>Nombre</th><th>Producto</th><th>Estado en SEUR</th><th>Motivo</th><th>Llegada al almac\xE9n</th><th>Estado del colch\xF3n</th><th>Qu\xE9 se hace</th><th>Stock</th><th style="min-width:220px">Notas</th><th></th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-historico-rep" style="display:none">
  <div class="toolbar">
    <input id="historico-pedido-search" type="text" placeholder="Buscar por n\xBA de pedido..." />
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

<div id="view-casos" style="display:none">
  <div class="toolbar">
    <button type="button" id="caso-nuevo-btn">+ Nuevo caso</button>
    <input id="casos-search" type="text" placeholder="Buscar por pedido, cliente, tel\xE9fono o motivo..." style="min-width:280px" />
    <select id="casos-responsable-filter">
      <option value="">M\xEDas y de los dos</option>
      <option value="todas">Todas (tambi\xE9n las del compa\xF1ero)</option>
      <option value="JENNIFER">Solo de Jennifer</option>
      <option value="SERGIO">Solo de Sergio</option>
      <option value="AMBOS">Solo de los dos</option>
    </select>
    <select id="casos-vista">
      <option value="revisar">Para revisar hoy</option>
      <option value="revisados">Ya revisados hoy</option>
      <option value="abiertos">Todos los abiertos</option>
      <option value="cerrados">Cerrados</option>
    </select>
  </div>
  <div id="casos-count" class="inventario-count"></div>
  <div class="table-wrap">
    <table id="casos-table">
      <thead><tr><th>Pedido</th><th>Cliente</th><th>Tel\xE9fono</th><th>Motivo</th><th>Responsable</th><th>\xDAltima gesti\xF3n</th><th style="min-width:260px">\xDAltimo seguimiento</th><th></th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="view-tareas" style="display:none">
  <div class="toolbar">
    <button type="button" id="tarea-nueva-btn">+ Nueva tarea</button>
    <input id="tareas-search" type="text" placeholder="Buscar por tarea o pedido..." style="min-width:240px" />
    <select id="tareas-para-filter">
      <option value="">M\xEDas y de los dos</option>
      <option value="todas">Todas (tambi\xE9n las del compa\xF1ero)</option>
      <option value="JENNIFER">Solo de Jennifer</option>
      <option value="SERGIO">Solo de Sergio</option>
    </select>
    <select id="tareas-vista">
      <option value="pendientes">Pendientes</option>
      <option value="hechas">Hechas</option>
    </select>
    <button type="button" class="secondary" id="tareas-email-prueba-btn" title="Manda ahora el email de recordatorio con las tareas de hoy">\u2709 Enviarme el recordatorio ahora</button>
  </div>
  <div id="tareas-count" class="inventario-count"></div>
  <div id="tareas-dias"></div>
</div>

<div id="view-plazos-marketplace" style="display:none">
  <div id="plazos-marketplace-lista" class="inventario-count">Cargando...</div>
</div>

<div class="modal-overlay" id="tarifas-desglose-overlay">
  <div class="modal-box">
    <h3 id="tarifas-desglose-titulo">Desglose del c\xE1lculo</h3>
    <div id="tarifas-desglose-pasos"></div>
    <div class="modal-actions">
      <button type="button" class="secondary" id="tarifas-desglose-cerrar">Cerrar</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="pedido-stock-overlay">
  <div class="modal-box modal-box-wide">
    <h3 id="pedido-stock-titulo">Pedido para stock</h3>
    <p style="margin:0 0 8px;color:var(--muted);font-size:13px">Se a\xF1ade a los pendientes de este proveedor y entra en el pedido a f\xE1brica como los de clientes. Si entra un pedido de cliente de lo mismo, se queda con una de estas unidades y no se vuelve a pedir. Al recibirlo, lo que no tenga cliente pasa al stock.</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <input id="pedido-stock-modelo" list="pedido-stock-modelos" placeholder="Modelo (escribe para buscar)" style="flex:1;min-width:260px" />
      <datalist id="pedido-stock-modelos"></datalist>
      <input id="pedido-stock-talla" list="pedido-stock-tallas" placeholder="Medida (ej. 150X190)" style="width:140px" />
      <datalist id="pedido-stock-tallas"></datalist>
      <input id="pedido-stock-cantidad" type="number" min="1" value="1" style="width:70px" />
      <button type="button" class="secondary" id="pedido-stock-anadir">A\xF1adir l\xEDnea</button>
    </div>
    <table style="width:100%;margin-top:10px"><thead><tr><th style="text-align:left">Modelo</th><th>Medida</th><th>Unidades</th><th></th></tr></thead><tbody id="pedido-stock-lineas"></tbody></table>
    <div class="modal-actions">
      <button type="button" class="secondary" id="pedido-stock-cerrar">Cancelar</button>
      <button type="button" id="pedido-stock-crear">Crear pedido para stock</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="seur-correo-overlay">
  <div class="modal-box modal-box-wide">
    <h3 id="seur-correo-titulo">Conversaci\xF3n con SEUR</h3>
    <div id="seur-correo-destino" style="color:var(--muted);font-size:12px;margin-bottom:8px"></div>
    <div id="seur-correo-mensajes" style="display:flex;flex-direction:column;gap:8px;max-height:45vh;overflow-y:auto;margin-bottom:10px"></div>
    <textarea id="seur-correo-texto" rows="6" style="width:100%;resize:vertical" placeholder="Escribe aqu\xED el problema o la duda para SEUR..."></textarea>
    <div style="color:var(--muted);font-size:11px;margin-top:4px">Se env\xEDa desde tu Gmail (jennifer@colchonesbezen.com). La referencia, el n\xBA de expedici\xF3n y el destinatario se a\xF1aden solos arriba del mensaje.</div>
    <div class="modal-actions">
      <button type="button" class="secondary" id="seur-correo-cerrar">Cerrar</button>
      <button type="button" id="seur-correo-enviar">Enviar a SEUR</button>
    </div>
  </div>
</div>

<div id="view-seur" style="display:none">
  <div id="seur-decision-box"class="carga-abierta-box" style="display:none">
    <div class="toolbar">
      <h3 style="margin:0">Pedidos con disponibilidad mixta \u2014 pendientes de decidir</h3>
    </div>
    <p style="margin:0 1rem 0.75rem;color:var(--muted);font-size:13px">Tienen 2 o m\xE1s colchones sueltos y solo hay stock real de alguno. Si no decides nada, se quedan esperando a que haya stock de todos.</p>
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
    <h3>Reposici\xF3n de pieza</h3>
    <p id="reposicion-modal-texto" style="color:var(--muted);font-size:13px"></p>
    <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">Producto del pedido a reponer:</label>
    <select id="reposicion-item-select" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px"></select>
    <button type="button" id="reposicion-cambio-toggle" style="background:none;border:none;padding:4px 0;margin:2px 0 0;color:var(--muted);font-size:11.5px;text-decoration:underline;cursor:pointer">\u2194 \xBFEs un cambio de modelo o medida?</button>
    <div id="reposicion-cambio-block" style="display:none;margin-top:6px;padding:10px 12px;border:1px dashed #d97706;border-radius:8px;background:rgba(217,119,6,0.06)">
      <div style="font-size:12px;color:#b45309;font-weight:600;margin-bottom:6px">CAMBIO \u2014 se repone otro modelo/medida en lugar del del pedido</div>
      <label style="display:block;font-size:12.5px;color:var(--muted);margin:4px 0 4px">Modelo nuevo:</label>
      <select id="reposicion-cambio-modelo" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px"></select>
      <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">Medida nueva:</label>
      <input id="reposicion-cambio-talla" type="text" list="reposicion-cambio-tallas" placeholder="ej. 150X190" autocomplete="off" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px" />
      <datalist id="reposicion-cambio-tallas"></datalist>
      <div id="reposicion-cambio-color-block">
        <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">Color:</label>
        <input id="reposicion-cambio-color" type="text" placeholder="ej. Beige" autocomplete="off" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px" />
      </div>
      <button type="button" class="secondary" id="reposicion-cambio-quitar" style="margin-top:8px;font-size:12px">Quitar el cambio (reponer lo mismo del pedido)</button>
    </div>
    <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">Pieza exacta a reponer:</label>
    <select id="reposicion-pieza-select" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px"></select>
    <div id="reposicion-piezas-checks" style="display:none;border:1px solid var(--border);border-radius:8px;padding:8px 12px;max-height:220px;overflow:auto"></div>
    <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">Unidades:</label>
    <input id="reposicion-unidades" type="number" min="1" max="20" step="1" value="1" style="width:100px;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px" />
    <div id="reposicion-colchon-agencia-block" style="display:none">
      <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">Es un colch\xF3n \u2014 \xBFsale por SEUR o por FURNITURE?</label>
      <select id="reposicion-agencia-select" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px">
        <option value="">Elige una opci\xF3n...</option>
        <option value="SEUR">SEUR (reenv\xEDo directo, sin recogida)</option>
        <option value="FURNITURE">FURNITURE (incidencia, puede llevar recogida)</option>
      </select>
    </div>
    <div id="reposicion-colchon-recogida-block" style="display:none">
      <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">\xBFTiene recogida del colch\xF3n antiguo?</label>
      <select id="reposicion-recogida-select" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px">
        <option value="">Elige una opci\xF3n...</option>
        <option value="si">S\xED</option>
        <option value="no">No</option>
      </select>
    </div>
    <div id="reposicion-colchon-destino-block" style="display:none">
      <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">El colch\xF3n recogido, \xBFvuelve a nuestras instalaciones o es para desechar?</label>
      <select id="reposicion-destino-select" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px">
        <option value="">Elige una opci\xF3n...</option>
        <option value="instalaciones">Vuelve a nuestras instalaciones</option>
        <option value="desechar">Para desechar</option>
      </select>
    </div>
    <label style="display:block;font-size:12.5px;color:var(--muted);margin:8px 0 4px">Nota adicional (opcional):</label>
    <input id="reposicion-motivo" type="text" placeholder="ej. lleg\xF3 con un ara\xF1azo" autocomplete="off" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px" />
    <div id="reposicion-modal-result" class="inventario-count"></div>
    <div class="modal-actions">
      <button type="button" class="secondary" id="reposicion-modal-cancel">Cancelar</button>
      <button type="button" id="reposicion-modal-confirmar">Registrar reposici\xF3n</button>
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
    <input id="gesto-comercial-motivo" type="text" placeholder="ej. lleg\xF3 con un ara\xF1azo, no compensa cambiar la pieza" autocomplete="off" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px" />
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
      <button type="button" class="secondary" id="sustituir-hoy-btn" disabled style="display:none">Sustituir \u2014 carga de hoy</button>
      <button type="button" id="sustituir-manana-btn" disabled style="display:none">Sustituir \u2014 carga de ma\xF1ana</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="caso-modal-overlay">
  <div class="modal-box" style="width:min(680px,94vw)">
    <h3 id="caso-modal-titulo">Nuevo caso</h3>
    <label class="caso-campo">Pedido
      <input type="text" id="caso-pedido" list="caso-pedidos-datalist" placeholder="BEZEN12276 o referencia de marketplace" autocomplete="off" />
    </label>
    <datalist id="caso-pedidos-datalist"></datalist>
    <div id="caso-pedido-info" class="caso-pedido-info"></div>
    <label class="caso-campo">Cliente <input type="text" id="caso-cliente" /></label>
    <label class="caso-campo">Tel\xE9fono <input type="text" id="caso-telefono" /></label>
    <label class="caso-campo">Motivo <textarea id="caso-motivo" rows="2"></textarea></label>
    <label class="caso-campo" style="color:#b91c1c;font-weight:700"><input type="checkbox" id="caso-urgente" style="display:inline-block;width:auto;margin-right:6px" />\u{1F534} URGENTE \u2014 dar respuesta hoy</label>
    <label class="caso-campo">Responsable
      <select id="caso-responsable"><option value="AMBOS">Los dos</option><option value="JENNIFER">Jennifer</option><option value="SERGIO">Sergio</option></select>
    </label>
    <div id="caso-historial" class="caso-historial"></div>
    <label class="caso-campo">Nuevo seguimiento <textarea id="caso-nota" rows="3" placeholder="Qu\xE9 se ha hecho o hablado con el cliente..."></textarea></label>
    <div style="display:flex;gap:12px">
      <label class="caso-campo" style="flex:1">Gesti\xF3n hecha por
        <select id="caso-gestion-autor"><option value="JENNIFER">Jennifer</option><option value="SERGIO">Sergio</option></select>
      </label>
      <label class="caso-campo" style="flex:1">Fecha de la gesti\xF3n <input type="date" id="caso-gestion-fecha" /></label>
    </div>
    <div class="modal-actions">
      <button type="button" class="secondary" id="caso-cerrar-btn" style="margin-right:auto">Cerrar caso</button>
      <button type="button" class="secondary" id="caso-modal-cancel">Cancelar</button>
      <button type="button" id="caso-modal-ok">Guardar</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="tarea-modal-overlay">
  <div class="modal-box" style="width:min(560px,94vw)">
    <h3 id="tarea-modal-titulo">Nueva tarea</h3>
    <label class="caso-campo">Qu\xE9 hay que hacer <textarea id="tarea-texto" rows="3" placeholder="Ej.: darle al cliente el n\xFAmero de seguimiento"></textarea></label>
    <div style="display:flex;gap:12px">
      <label class="caso-campo" style="flex:1">Fecha <input type="date" id="tarea-fecha" /></label>
      <label class="caso-campo" style="flex:1">Para
        <select id="tarea-para"><option value="AMBOS">Los dos</option><option value="JENNIFER">Jennifer</option><option value="SERGIO">Sergio</option></select>
      </label>
    </div>
    <label class="caso-campo">Pedido (opcional)
      <input type="text" id="tarea-pedido" list="caso-pedidos-datalist" placeholder="BEZEN12276 o referencia de marketplace" autocomplete="off" />
    </label>
    <div id="tarea-pedido-info" class="caso-pedido-info"></div>
    <div id="tarea-historial" class="caso-historial"></div>
    <label class="caso-campo">A\xF1adir nota <textarea id="tarea-nota" rows="3" placeholder="Informaci\xF3n adicional, lo que se ha hecho, a qui\xE9n se ha llamado..."></textarea></label>
    <div class="modal-actions">
      <button type="button" class="secondary" id="tarea-borrar-btn" style="margin-right:auto;color:#b91c1c">Borrar</button>
      <button type="button" class="secondary" id="tarea-modal-cancel">Cancelar</button>
      <button type="button" id="tarea-modal-ok">Guardar</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="dir-modal-overlay">
  <div class="modal-box" style="width:min(560px,94vw)">
    <h3 id="dir-modal-titulo">Cambiar direcci\xF3n de entrega</h3>
    <div id="dir-modal-aviso" style="display:none;background:#fef3c7;border:1px solid #fcd34d;color:#92400e;border-radius:8px;padding:8px 10px;font-size:12.5px;margin-bottom:8px"></div>
    <label class="caso-campo">Direcci\xF3n (calle, n\xFAmero, piso, puerta, c\xF3digo de portal...) <textarea id="dir-calle" rows="2"></textarea></label>
    <div style="display:flex;gap:12px">
      <label class="caso-campo" style="flex:1">C\xF3digo postal <input type="text" id="dir-cp" /></label>
      <label class="caso-campo" style="flex:2">Poblaci\xF3n <input type="text" id="dir-ciudad" /></label>
    </div>
    <div style="display:flex;gap:12px">
      <label class="caso-campo" style="flex:1">Provincia <input type="text" id="dir-provincia" /></label>
      <label class="caso-campo" style="flex:1">Tel\xE9fono <input type="text" id="dir-telefono" /></label>
    </div>
    <label class="caso-campo">Motivo del cambio (opcional) <input type="text" id="dir-motivo" placeholder="Ej.: faltaba el piso / el cliente cambia la direcci\xF3n" /></label>
    <div id="dir-original" class="caso-pedido-info" style="margin-top:8px"></div>
    <div class="modal-actions">
      <button type="button" class="secondary" id="dir-restaurar-btn" style="margin-right:auto">Volver a la direcci\xF3n original</button>
      <button type="button" class="secondary" id="dir-modal-cancel">Cancelar</button>
      <button type="button" id="dir-modal-ok">Guardar direcci\xF3n</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="retener-modal-overlay">
  <div class="modal-box">
    <h3>Retener hasta que el cliente lo pida</h3>
    <p id="retener-modal-texto" style="color:var(--muted);font-size:13px"></p>
    <label style="display:block;font-size:13px;margin:8px 0"><input type="radio" name="retener-tipo" value="sin-fecha" checked /> Sin fecha: a falta de que el cliente d\xE9 luz verde al env\xEDo</label>
    <label style="display:block;font-size:13px;margin:8px 0"><input type="radio" name="retener-tipo" value="fecha" /> Enviar en la carga de este d\xEDa o la siguiente:
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
    <h3 id="seur-fecha-modal-titulo">\xBFEn qu\xE9 carga de SEUR sale?</h3>
    <p id="seur-fecha-modal-texto" style="color:var(--muted);font-size:13px"></p>
    <label style="font-size:13px">D\xEDa de la carga (cualquier d\xEDa laborable, aunque sea dentro de varias semanas):
      <input type="date" id="seur-fecha-input" style="display:block;margin-top:6px" />
    </label>
    <div class="modal-actions">
      <button type="button" class="secondary" id="seur-fecha-quitar-btn" style="margin-right:auto;display:none">Quitar fecha</button>
      <button type="button" class="secondary" id="seur-fecha-modal-cancel">Cancelar</button>
      <button type="button" id="seur-fecha-ok-btn">Preparar para ese d\xEDa</button>
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
const BASE_HEAD = ["","N\xBA Pedido","Fecha","Nombre","Direcci\xF3n de entrega","Tel\xE9fono","Producto comprado","Servicios adicionales","M\xE9todo de pago","Estado de pago","Situaci\xF3n de env\xEDo","Agencia","Seguimiento","Precio","Notas"];

let currentUser = localStorage.getItem("hd_user");
let editing = false;
let pendingRefresh = false;

function hasColorAccess() {
  return COLOR_ACCESS_USERS.includes(currentUser);
}

function escapeAttr(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// "BEZEN" es una convenci\xF3n de Shopify \u2014 Carrefour (y cualquier otra
// plataforma futura) usa su propia referencia real, sin ning\xFAn prefijo
// (Jennifer, 2026-09-17). Acepta un pedido, un pendiente o un caso/aviso \u2014
// cualquier objeto con orderNumber y, si no es de Shopify, platform +
// orderRef.
function refLabel(o) {
  const base = o && o.platform && o.platform !== "Shopify" && o.orderRef ? o.orderRef : "BEZEN" + o.orderNumber;
  // Reposici\xF3n de pieza rota (Jennifer, 2026-09-21): la referencia con la
  // que se graba SIEMPRE lleva "REP" delante de la del pedido original
  // (ej. BEZEN12215 -> REPBEZEN12215), para distinguirla a simple vista de
  // un pedido normal \u2014 nunca se confunde con la referencia real del pedido.
  if (o && o.reposicion) return "REP" + base;
  // Gesto comercial (Jennifer, 2026-09-22): mismo patr\xF3n, "GC" delante.
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
// orderNumber enorme \u2014 sacado de su referencia, no un correlativo \u2014 que se
// cuela por delante de pedidos de Shopify mucho m\xE1s recientes, como el
// caso real BEZEN12215/reposici\xF3n, que qued\xF3 enterrado entre 73 pendientes
// de Polival). Nunca se usa Date.parse/new Date directo con el formato
// "DD/MM/YYYY..." de los marketplaces: con d\xEDa y mes ambos \u226412 el
// navegador lo interpretar\xEDa en silencio como MM/DD, dando una fecha
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

// Fecha l\xEDmite de env\xEDo de los marketplaces (Jennifer, 2026-09-29): hasta
// cu\xE1ndo hay que dar el seguimiento al cliente. Solo cuenta mientras el
// pedido sigue pendiente de env\xEDo y sin seguimiento. Colores: verde (2+
// d\xEDas), naranja (vence ma\xF1ana), rojo (vence hoy), rojo oscuro (vencido).
// Corte por plataforma (Jennifer, 2026-09-29): solo cuenta la fecha l\xEDmite
// de los pedidos con l\xEDmite a partir de esta fecha, para que no salga nada
// antiguo. Una plataforma que no est\xE9 aqu\xED NO muestra fecha l\xEDmite todav\xEDa
// ("para el resto de plataformas te ir\xE9 diciendo seg\xFAn las vayamos
// trabajando"). Formato AAAA-MM-DD.
const PLAZO_LIMITE_DESDE = { "Carrefour": "2026-09-29" };
// Corte por FECHA DEL PEDIDO en vez de por fecha l\xEDmite (Jennifer,
// 2026-09-29, Conforama ES: "que el aviso sobre el vencimiento sea solo
// visible en los pedidos a partir del d\xEDa 24/09").
// Worten desde 83706555-A (18/09, \xFAnico pedido de ese d\xEDa).
// Leroy Merlin desde el 23/09 (Jennifer, 2026-10-01: "en Leroy tambi\xE9n me
// tienes que avisar de la fecha l\xEDmite"; lo anterior ya tiene el plazo
// vencido hace semanas).
// Maison du Monde desde el 22/09 (Jennifer, 2026-10-01: "el primer pedido
// que pone esperando env\xEDo", 10002308790-A).
// Conforama (Francia) desde el 28/09, igual que su tramitaci\xF3n (Jennifer,
// 2026-10-01: "todos ya deben estar activos en ese sentido").
const PLAZO_PEDIDOS_DESDE = { "Conforama ES": "2026-09-24", "Worten": "2026-09-18", "Leroy Merlin": "2026-09-23", "Maison Du Monde": "2026-09-22", "Conforama": "2026-09-28" };
function plazoEnvioActivo(o) {
  if (!o || !o.limiteEnvio) return false;
  // Sin aviso mientras el cliente no ha pagado (Jennifer, 2026-09-29:
  // "si est\xE1 en pendiente de verificaci\xF3n de fraude no me tienes que
  // informar... solo cuando est\xE1 pendiente de env\xEDo").
  if (/fraude|pago|d[e\xE9]bito/i.test(o.estado || "")) return false;
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
  if (!plazoEnvioPendiente(o)) return { nivel: "hecho", texto: fecha + " \u2713" };
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = new Date(limite); dia.setHours(0, 0, 0, 0);
  const dias = Math.round((dia - hoy) / 86400000);
  // Vencido en rojo OSCURO, distinto del rojo de "vence hoy" (Jennifer, 2026-09-29).
  if (Date.now() > t) return { nivel: "vencido", texto: "VENCIDO " + fecha, dias };
  if (dias <= 0) return { nivel: "rojo", texto: "VENCE HOY", dias };
  if (dias === 1) return { nivel: "naranja", texto: "VENCE MA\xD1ANA", dias };
  return { nivel: "verde", texto: fecha + " \xB7 " + dias + " d\xEDas", dias };
}
function plazoEnvioCell(o) {
  const p = plazoEnvio(o);
  if (!p) return "\u2014";
  return \`<span class="plazo-envio plazo-\${p.nivel}" title="Fecha l\xEDmite de env\xEDo: \${escapeAttr(o.limiteEnvio)}">\${p.texto}</span>\`;
}
// N\xFAmero rojo en el men\xFA, por marketplace: pedidos que vencen ma\xF1ana, hoy
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
// a\xFAn sin marcar como pagada en Shopify \u2014 se tramita ya, con fecha de hoy.
// Cuando luego se marque pagado en Shopify no se vuelve a tramitar.
function pagoManualCell(o) {
  let html = paymentStatusBadge(o.paymentStatus);
  if (o.pagoConfirmadoManual) {
    const p = o.pagoConfirmadoManual;
    html += \`<br><span class="badge pago-manual-tag" title="Tramitado por \${escapeAttr(p.usuario || "")} el \${new Date(p.fecha).toLocaleString("es-ES")}">Pago confirmado a mano</span>\`;
  } else if (o.paymentStatus === "PENDIENTE DE PAGO" && !o.agencia && !o.cancelado && PAGO_MANUAL_USERS.includes(currentUser)) {
    html += \`<br><button type="button" class="pago-manual-btn" data-pago-manual-id="\${o.id}" title="El cliente ya ha pagado (p. ej. por transferencia) aunque no est\xE9 marcado en Shopify: tramitar ya con fecha de hoy">Pagado \u2013 tramitar ya</button>\`;
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
  const title = answered ? "Ya tiene instrucciones \u2014 clic para ver/editar" : "Este pedido necesita una decisi\xF3n \u2014 clic para revisar";
  const icon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a1 1 0 0 1 1 1v1.06A7.002 7.002 0 0 1 19 11v3.586l1.707 1.707A1 1 0 0 1 20 18H4a1 1 0 0 1-.707-1.707L5 14.586V11a7.002 7.002 0 0 1 6-6.94V3a1 1 0 0 1 1-1zm0 20a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22z"/></svg>';
  return \`<button type="button" class="\${cls}" data-review-id="\${order.id}" title="\${escapeAttr(title)}">\${icon}</button>\`;
}

const CANCEL_ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const CANCEL_ICON_UNDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11a8 8 0 1 1 2.6 5.9"/><path d="M3 5v6h6"/></svg>';

// Sustituir un colch\xF3n pendiente de este pedido por otro modelo con stock
// (Jennifer, 2026-09-18) \u2014 accesible desde la propia ficha del pedido
// (Shopify o Carrefour), sin tener que ir a Proveedores. Busca al vuelo si
// aplica (ver abrirSustituirDesdePedido), as\xED que el icono sale siempre \u2014
// si no hay nada que sustituir, avisa en vez de no hacer nada.
const SUSTITUIR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 21l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
function sustituirPedidoButton(order) {
  return \`<button type="button" class="sustituir-pedido-btn" data-sustituir-order-id="\${order.id}" title="Sustituir un colch\xF3n pendiente por otro modelo">\${SUSTITUIR_ICON}</button>\`;
}

// Aviso a simple vista de que este pedido YA tiene una reposici\xF3n pedida
// (Jennifer, 2026-09-21: "no soy capaz de ver si de ese pedido ya he
// pedido la reposici\xF3n") \u2014 cualquier estado (pendiente, cubierto, servido)
// cuenta, no solo las que siguen sin resolver: lo que importa es que ya se
// pidi\xF3, no si ya lleg\xF3. backorders puede estar vac\xEDo si Proveedores no
// se ha cargado todav\xEDa en esta sesi\xF3n \u2014 se recarga desde onUserReady.
function reposicionButton(order) {
  const reposicionesDelPedido = backorders.filter(b => b.reposicion && b.orderId === order.id);
  const cls = "reposicion-pedido-btn" + (reposicionesDelPedido.length ? " reposicion-pedido-btn-activa" : "");
  // Al pasar el rat\xF3n se ve QU\xC9 se pidi\xF3, no solo que se pidi\xF3 algo
  // (Jennifer, 2026-09-21) \u2014 una l\xEDnea por reposici\xF3n, con su referencia
  // (ej. "I-002") y el texto completo de la pieza/motivo.
  const title = reposicionesDelPedido.length
    ? reposicionesDelPedido.map(b => (b.referencia ? b.referencia + ": " : "") + (b.piezaTexto || b.stockModel)).join("\\n")
    : "Reponer una pieza rota de este pedido";
  return \`<button type="button" class="\${cls}" data-reposicion-order-id="\${order.id}" title="\${escapeAttr(title)}">REP</button>\`;
}

// Bot\xF3n "GC" (gesto comercial, Jennifer, 2026-09-22): mismo patr\xF3n que REP
// \u2014 se pinta activo si este pedido ya tiene alg\xFAn gesto comercial pedido
// (cualquier estado), y el tooltip ense\xF1a qu\xE9 se dio sin tener que abrir
// nada.
function gestoComercialButton(order) {
  const gestosDelPedido = backorders.filter(b => b.gestoComercial && b.orderId === order.id);
  const cls = "gesto-comercial-btn" + (gestosDelPedido.length ? " gesto-comercial-btn-activa" : "");
  const title = gestosDelPedido.length
    ? gestosDelPedido.map(b => (b.referencia ? b.referencia + ": " : "") + b.cantidad + "x " + b.stockModel + " (" + b.talla + ")").join("\\n")
    : "Gesto comercial (almohada de regalo) por da\xF1o o retraso en este pedido";
  return \`<button type="button" class="\${cls}" data-gesto-comercial-order-id="\${order.id}" title="\${escapeAttr(title)}">GC</button>\`;
}

// Env\xEDo conjunto (Jennifer, 2026-09-28): mismo cliente, pedidos distintos,
// quiere recibirlo todo junto.
const JUNTAR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg>';
function juntarEnvioButton(order) {
  const cls = "juntar-envio-btn" + (order.grupoEnvio ? " juntar-envio-btn-activa" : "");
  const title = order.grupoEnvio
    ? "Se env\xEDa junto con " + pedidosDelGrupo(order).filter(o => o.id !== order.id).map(refLabel).join(", ") + " \u2014 clic para separarlo"
    : "Enviar junto con otro pedido del mismo cliente (un solo env\xEDo por Furniture)";
  return \`<button type="button" class="\${cls}" data-juntar-id="\${order.id}" title="\${escapeAttr(title)}">\${JUNTAR_ICON}</button>\`;
}

// "No ha salido" (Jennifer, 2026-09-29, caso Carrefour 76393184-A): el
// colch\xF3n iba por SEUR pero no sali\xF3 \u2014 vuelve a pendiente en su proveedor
// con referencia "\u20262". Solo si hay un colch\xF3n cubierto con stock o ya
// preparado para SEUR.
function colchonesSeurDelPedido(order) {
  return backorders.filter(b => String(b.orderId) === String(order.id) && b.tipo === "colchon" && !b.reposicion && !b.gestoComercial
    && (b.estado === "listo-seur" || (b.estado === "cubierto" && String(b.id).endsWith("-cubierto"))));
}
function noSalioButton(order) {
  if (order.agencia !== "SEUR" || order.shippingStatus === "fulfilled" || order.cancelado) return "";
  if (!colchonesSeurDelPedido(order).length) return "";
  return \`<button type="button" class="no-salio-btn" data-no-salio-id="\${escapeAttr(String(order.id))}" title="El colch\xF3n NO ha salido: vuelve a pendiente en su proveedor con la referencia siguiente (\u20262)">\u21A9</button>\`;
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
  // Qu\xE9 unidades NO han salido (el resto sigue en la carga).
  const elegidas = await elegirUnidades({
    titulo: "\xBFQu\xE9 no ha salido? \xB7 " + refLabel(order),
    texto: "Marca lo que NO ha salido: vuelve a pendiente en su proveedor con la referencia siguiente (\u20262). Lo que no marques sigue en la carga de SEUR. El stock no se devuelve (se entiende que no estaba).",
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

// Cancelar unidades (Jennifer, 2026-09-29): desde el pedido (\u2298, eligiendo
// qu\xE9 art\xEDculo y cu\xE1ntas unidades) o desde el pendiente del proveedor
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
  return \`<button type="button" class="cancelar-linea-btn" data-cancelar-linea-id="\${escapeAttr(String(order.id))}" title="Cancelar una o varias unidades de este pedido (no el pedido entero)">\u2298</button>\`;
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
      titulo: "Cancelar unidades \xB7 " + refLabel(order),
      texto: "Marca lo que ha cancelado el cliente. Si tiene un pendiente en el proveedor, tambi\xE9n se cancela all\xED. Si cancelas todo, el pedido queda cancelado.",
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
    alert("Cancelado." + (pendientes ? " Tambi\xE9n se ha quitado del proveedor." : " No ten\xEDa pendiente en ning\xFAn proveedor.") + (pedidoCancelado ? " El pedido entero queda CANCELADO." : ""));
    await recargarTrasCancelar();
    return;
  }
  const b = backorders.find(x => x.id === btnPend.dataset.cancelarPendiente);
  if (!b) return;
  let unidades = b.cantidad || 1;
  if (unidades > 1) {
    const elegidas = await elegirUnidades({
      titulo: "Cancelar \xB7 " + refLabel(b),
      texto: "\xBFCu\xE1ntas unidades ha cancelado el cliente?",
      filas: [{ key: b.id, label: nombreCortoModelo(b.stockModel) + " " + b.talla, max: unidades }],
      boton: "Cancelar unidades", peligro: true,
    });
    if (!elegidas) return;
    unidades = elegidas[0].unidades;
  }
  const aviso = b.pedidoGenerado ? "\\n\\nOJO: esto YA estaba pedido a f\xE1brica" + (b.fechaPedidoFabrica ? " (" + new Date(b.fechaPedidoFabrica).toLocaleDateString("es-ES") + ")" : "") + ". Avisa a la f\xE1brica." : "";
  if (!confirm("\xBFCancelar " + unidades + "x " + nombreCortoModelo(b.stockModel) + " " + b.talla + " de " + refLabel(b) + "?\\n\\nSe quita del proveedor y queda como CANCELADA en el pedido." + aviso)) return;
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
    return '<span class="badge agencia-pendiente" title="Tiene 2+ colchones sueltos, solo hay stock de alguno \u2014 decide en Log\xEDstica \xB7 SEUR">Elegir SEUR</span>';
  }
  if (!order.agencia) return "";
  const cls = order.agencia === "FURNITURE" ? "agencia-furniture" : "agencia-seur";
  let html = \`<span class="badge \${cls}">\${order.agencia}</span>\`;
  if (order.pendingManufacture) {
    html += \`<br><span class="badge agencia-pendiente" title="\${order.pendingManufacture.modelo} \${order.pendingManufacture.talla}">Colch\xF3n pendiente</span>\`;
  }
  return html;
}

// Seguimiento de Furniture (Jennifer, 2026-09-16): un pedido puede tener
// varios albaranes relacionados (normal + BIS/INC/REP por incidencias),
// cada uno con su propio enlace de seguimiento \u2014 se muestran todos, uno
// debajo del otro, etiquetados por tipo.
const TRACKING_TIPO_LABEL = { BIS: "BIS", INC: "Incidencia", REP: "Reposici\xF3n" };
function esEstadoEntregado(estado) {
  return (/ENTREGAD|entrega efectuada|retirado el env\xEDo/i.test(estado || "") && !/NO ENTREGAD|NO SE HA ENTREGAD|NO HA PODIDO|NO SE HA PODIDO/i.test(estado || ""));
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
// Conforama ES (Jennifer, 2026-09-25): un pedido "Pendiente de verificaci\xF3n
// de fraude" o "Cancelado" nunca pasa por el motor (ver
// MARKETPLACE_ESTADOS_ELEGIBLES en el Worker) y por tanto nunca tiene
// seguimiento real de Furniture/SEUR que mostrar aqu\xED \u2014 en vez de dejar la
// columna vac\xEDa ("\u2014"), se ense\xF1a el estado real de Mirakl tal cual, para
// saber de un vistazo por qu\xE9 no hay seguimiento sin tener que abrir el
// pedido. El pedido cancelado NUNCA se quita del listado (solo se marca
// as\xED en esta columna) \u2014 sigue vi\xE9ndose en Pedidos como cualquier otro.
function estadoSeguimientoEspecial(estado) {
  const e = String(estado || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036F]/g, "");
  if (e.includes("cancelad")) return "CANCELADO";
  if (e.includes("verificacion de fraude")) return "VERIFICACI\xD3N DE FRAUDE";
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
  // Un pedido con varios art\xEDculos sueltos por SEUR puede tener cada uno en
  // un env\xEDo distinto (Jennifer, 2026-09-16, caso real BEZEN12076: almohada
  // ya entregada, colch\xF3n sin enviar todav\xEDa) \u2014 mostrar "entregado" a nivel
  // de pedido entero confund\xEDa. Se desglosa por art\xEDculo (order.items),
  // cruzando por SKU contra la "INFORMACI\xD3N ADICIONAL" (columna AR) de cada
  // env\xEDo de SEUR; el que no tenga env\xEDo encontrado sale como pendiente.
  if (order.agencia === "SEUR" && (order.items || []).length) {
    const usados = new Set();
    seur = order.items.map(item => {
      const entry = (order.seurTracking || []).find(t =>
        !usados.has(t.localizador) && item.sku && (t.infoAdicional || "").toUpperCase().includes(item.sku.toUpperCase())
      );
      const etiqueta = "SEUR" + (order.items.length > 1 ? " \xB7 " + (item.sku || item.variantTitle || "") : "");
      if (entry) {
        usados.add(entry.localizador);
        const title = escapeAttr(entry.fechaSituacion ? "Fecha: " + entry.fechaSituacion : "");
        return trackingEntryHtml(etiqueta, entry.seguimiento, entry.estado, title);
      }
      return trackingEntryHtml(etiqueta, null, "Pendiente de enviar a SEUR", "");
    });
    // Por si queda alg\xFAn env\xEDo de SEUR sin cruzar con ning\xFAn art\xEDculo (SKU
    // no coincide) \u2014 no se oculta, para no perder informaci\xF3n real.
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
  return all.length ? all.join("") : "\u2014";
}

// Filtros metidos en la propia cabecera de columna (Jennifer, 2026-09-16),
// en vez de en la barra de herramientas \u2014 para encontrar r\xE1pido lo que hace
// falta desde la columna que ya se est\xE1 mirando.
const PAYMENT_FILTER_HEADER = \`Estado de pago<br><select id="payment-filter" onclick="event.stopPropagation()">
  <option value="">Todos</option>
  <option value="PAGADO">Pagado</option>
  <option value="PENDIENTE">Pendiente de pago</option>
  <option value="REEMBOLSADO">Reembolsado</option>
</select>\`;
const ESTADO_FILTER_HEADER = \`Situaci\xF3n de env\xEDo<br><select id="estado-filter" onclick="event.stopPropagation()">
  <option value="todos">Todos</option>
  <option value="pendientes">Pendientes (env\xEDo o pago)</option>
</select>\`;
const HEADER_FILTERS = { "Estado de pago": PAYMENT_FILTER_HEADER, "Situaci\xF3n de env\xEDo": ESTADO_FILTER_HEADER };
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
      <td>BEZEN\${o.orderNumber}\${grupoEnvioTag(o)}\${casoTag(o)}</td>
      <td>\${formatOrderDate(o.orderDate)}</td>
      <td>\${o.name}</td>
      <td>\${o.address}\${direccionButton(o)}</td>
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
          <option value="">\u2014 Sin estado \u2014</option>
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
// llevan siempre este texto fijo al final \u2014 se usa para detectarlas y
// mostrar un selector real en vez de un textarea libre, y para poder
// aplicar la respuesta directamente al tipoEnvio del pendiente
// correspondiente (Jennifer, 2026-09-24, caso real BEZEN12224: contest\xF3
// "FUR. SALE JUNTO" en la campana pero el pendiente de Luso se qued\xF3 en
// FPK porque el texto libre nunca se aplicaba al pendiente).
const FUR_FPK_MARKER = "Dime si sale junto con la tapicer\xEDa (FUR) o puede ir aparte (FPK).";
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
            <option value="FUR"\${sel === "FUR" ? " selected" : ""}>FUR \u2014 Sale junto con la tapicer\xEDa</option>
            <option value="FPK"\${sel === "FPK" ? " selected" : ""}>FPK \u2014 Va aparte</option>
          </select>
        </div>
      \`;
        }
        return \`
        <div class="review-question">
          <p>\${r}</p>
          <textarea class="review-answer-input" data-index="\${i}" placeholder="Tu decisi\xF3n para esto...">\${escapeAttr(answers[i] || "")}</textarea>
        </div>
      \`;
      }).join("")
    // Un pedido puede quedar marcado "para revisar" sin ning\xFAn motivo de
    // texto asociado (ej. un fallo ya corregido a mano) \u2014 sin esto el
    // modal sal\xEDa vac\xEDo y sin ninguna acci\xF3n posible (Jennifer, 2026-09-19,
    // caso real BEZEN12207: "me ha salido un pop up... pero no me deja
    // hacer nada").
    : '<p>Este pedido est\xE1 marcado para revisar, pero no hay ning\xFAn motivo de texto guardado (puede que ya est\xE9 solucionado a mano).</p><button type="button" id="review-modal-marcar-revisado">Marcar como revisado</button>';
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
    if (!confirm("\xBFSeparar " + refLabel(order) + " del env\xEDo conjunto con " + otros + "?\\n\\nVolver\xE1 a salir por su cuenta (un colch\xF3n volver\xE1 a SEUR).")) return;
    const res = await fetch("/api/pedidos/shopify/grupo-envio/desvincular", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: order.id }),
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) alert("No se ha podido separar: " + (r.error || res.status));
  } else {
    const texto = prompt("\xBFCon qu\xE9 pedido se env\xEDa junto " + refLabel(order) + "?\\nEscribe el n\xFAmero (ej. BEZEN12233 o 12233):");
    if (!texto) return;
    const limpio = texto.trim().toUpperCase();
    const numero = Number(limpio.replace(/^BEZEN/, ""));
    const otro = allOrders.find(o => o.id !== order.id && ((numero && o.platform === "Shopify" && o.orderNumber === numero) || (o.orderRef || "").toUpperCase() === limpio));
    if (!otro) { alert("No encuentro el pedido " + texto + "."); return; }
    const nombreLimpio = s => (s || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").trim().toLowerCase();
    if (nombreLimpio(otro.name) !== nombreLimpio(order.name)
      && !confirm("Ojo: los nombres no coinciden (" + order.name + " / " + otro.name + "). \xBFJuntarlos igualmente?")) return;
    const res = await fetch("/api/pedidos/shopify/grupo-envio/vincular", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderIds: [order.id, otro.id] }),
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) { alert("No se han podido juntar: " + (r.error || res.status)); return; }
    alert(refLabel(order) + " y " + refLabel(otro) + " saldr\xE1n juntos por Furniture, en un solo env\xEDo.");
  }
  await loadOrders();
  loadPendientes();
});
document.querySelector("#orders tbody").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-pago-manual-id]");
  if (!btn) return;
  const order = allOrders.find(o => String(o.id) === btn.dataset.pagoManualId);
  if (!order) return;
  if (!confirm("\xBFConfirmas que el cliente ya ha pagado " + refLabel(order) + "?\\n\\nSe tramitar\xE1 ahora con fecha de hoy y aparecer\xE1 en Proveedores para pedirlo a f\xE1brica. Cuando se marque como pagado en Shopify no se volver\xE1 a tramitar.")) return;
  btn.disabled = true;
  btn.textContent = "Tramitando\u2026";
  const res = await fetch("/api/pedidos/shopify/admin/tramitar-pagado-manual", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: order.id, usuario: currentUser }),
  });
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.inventoryProcessed) {
    alert("No se ha podido tramitar: " + (r.error || "revisa el pedido (quiz\xE1 el procesamiento est\xE1 en pausa)."));
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
  if (nuevoEstado && !confirm("\xBFCancelar el pedido " + refLabel(order) + "?")) return;
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
  if (patch.notas !== undefined && notaTodoJunto(patch.notas)) await aplicarTodoJunto(id);
}

// "LO QUIERE TODO JUNTO" en las notas (Jennifer, 2026-10-05): el colch\xF3n
// pasa solo de FPK a FUR y en Furniture se avisa de no sacarlo por separado.
function notaTodoJunto(texto) {
  return /TODO\\s+JUNTO/.test(String(texto || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toUpperCase());
}
function pedidoQuiereTodoJunto(order) {
  return !!order && pedidosDelGrupo(order).some(p => notaTodoJunto(p.notas));
}
// Solo colchones que pueden ir con Furniture (de pack, con tapicer\xEDa en el
// pedido o pedido ya de Furniture) \u2014 un colch\xF3n que va solo por SEUR tambi\xE9n
// lleva FPK por defecto y ese no se toca.
async function aplicarTodoJunto(orderId) {
  const order = allOrders.find(o => String(o.id) === String(orderId));
  if (!order) return;
  if (!backorders.length) backorders = await (await fetch("/api/inventario/pendientes")).json();
  const grupo = pedidosDelGrupo(order);
  const vaConFurniture = grupo.some(p => p.agencia === "FURNITURE") || ordenTieneTapiceria(order.orderNumber);
  const colchones = backorders.filter(b => grupo.some(p => p.id === b.orderId)
    && b.tipo === "colchon" && b.tipoEnvio === "FPK"
    && (b.estado === "pendiente" || b.estado === "cubierto")
    && !b.reposicion && !b.gestoComercial
    && (b.esPack || vaConFurniture));
  if (!colchones.length) return;
  for (const b of colchones) {
    await fetch("/api/inventario/pendientes/" + encodeURIComponent(b.id) + "/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipoEnvio: "FUR" }),
    });
    b.tipoEnvio = "FUR";
  }
  mostrarAvisoBreve("Todo junto: " + colchones.map(b => b.stockModel + (b.talla ? " (" + b.talla + ")" : "")).join(", ") + " de " + refLabel(order) + " pasa de FPK a FUR.");
  loadPendientes();
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
  // necesitan as\xED) \u2014 la tabla de Pedidos > Shopify se queda solo con los
  // suyos (Jennifer, 2026-09-17: pantallas separadas por plataforma;
  // generalizado 2026-09-19 al a\xF1adir Maison Du Monde).
  let filtered = allOrders.filter(o => o.platform === "Shopify" || !o.platform);
  if (q) {
    filtered = filtered.filter(o => ("bezen" + o.orderNumber).includes(q) || (o.name || "").toLowerCase().includes(q));
  }
  if (colorFilter) {
    filtered = filtered.filter(o => o.colorTag === colorFilter);
  }
  // "Solo pendientes" (Jennifer, 2026-09-16): oculta los pedidos ya
  // terminados (enviados Y pagados) para que la lista no crezca sin l\xEDmite
  // \u2014 se queda solo con los que a\xFAn necesitan atenci\xF3n por env\xEDo o pago.
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
// "Ocultar ya recibidos de f\xE1brica" marcado por defecto y recordado en este
// navegador (Jennifer, 2026-10-08): al marcar un colch\xF3n como recibido (y
// mandarse la reserva al almac\xE9n) la fila segu\xEDa a la vista, y al volver a
// pulsar se desmarcaba sin querer.
(() => {
  const chk = document.getElementById("pendientes-ocultar-recibidos");
  try { chk.checked = localStorage.getItem("hd_ocultar_recibidos") !== "0"; } catch (e) { chk.checked = true; }
  chk.addEventListener("change", () => {
    try { localStorage.setItem("hd_ocultar_recibidos", chk.checked ? "1" : "0"); } catch (e) { /* sin localStorage */ }
    renderPendientes();
  });
})();
// "Mostrar cancelados" se recuerda en este navegador (Jennifer, 2026-09-29).
(() => {
  const chk = document.getElementById("pendientes-mostrar-cancelados");
  try { chk.checked = localStorage.getItem("hd_mostrar_cancelados") === "1"; } catch (e) { /* sin localStorage */ }
  chk.addEventListener("change", () => {
    try { localStorage.setItem("hd_mostrar_cancelados", chk.checked ? "1" : "0"); } catch (e) { /* sin localStorage */ }
    renderPendientes();
  });
})();
// Si la ventana cambia de tama\xF1o el texto de la cabecera puede pasar a 1 o 2
// l\xEDneas y cambiar de alto \u2014 se re-mide (Jennifer, 2026-09-25, ver
// sincronizarTopFilaFiltro).
window.addEventListener("resize", () => {
  sincronizarTopFilaFiltro("pendientes-table", "pendientes-filter-row");
  sincronizarTopFilaFiltro("furniture-pendientes-table", "furniture-filter-row");
});
// Excel de todos los pendientes de proveedor (Jennifer, 2026-09-25): "por si
// tengo que hacer algo con ellos con el excel" \u2014 descarga TODOS los
// pendientes de Polival/Luso/New de golpe, sin importar la pesta\xF1a o los
// filtros de texto que haya puestos en pantalla ahora mismo (a diferencia de
// la tabla, que s\xED filtra). Mismas columnas que ya se ven en pantalla, m\xE1s
// "Proveedor" para poder distinguirlos una vez mezclados en una sola hoja.
document.getElementById("descargar-excel-pendientes-btn").addEventListener("click", async () => {
  const lista = backorders
    .filter(b => b.estado === "pendiente" && ["POLIVAL", "LUSO", "NEW"].includes(b.proveedor))
    .sort((a, b) => (a.proveedor === b.proveedor ? parseFechaGenerica(a.fecha) - parseFechaGenerica(b.fecha) : a.proveedor.localeCompare(b.proveedor)));
  // Coste de tarifa de los colchones de Luso/New (Jennifer, 2026-09-30:
  // "cuando descargue la tabla de proveedores esos precios se puedan
  // descargar en la columna tambi\xE9n") \u2014 como n\xFAmero, para poder sumar.
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
      // Solo tiene sentido para lo que hay que pedir (Jennifer, 2026-10-06): un
      // colch\xF3n que sale de stock no lleva FUR ni FPK.
      "FUR/FPK": b.esPack && b.tipo === "colchon" && b.estado !== "cubierto" ? (b.tipoEnvio || "") : "",
      "Mercanc\xEDa para pedir a f\xE1brica": b.mercanciaFabrica || "",
      "Fecha del pedido": b.fecha || "",
      "Previsi\xF3n de entrega": (b.fechaEstimadaLlegada || b.previsionEntrega) ? new Date((b.fechaEstimadaLlegada || b.previsionEntrega).slice(0, 10) + "T12:00:00").toLocaleDateString("es-ES") : "",
      "En revisi\xF3n":b.revision ? (b.revision.motivo || "S\xED") : "",
      "Cuarentena": b.cuarentena ? (b.cuarentena.motivo || "S\xED") : "",
      Notas: (allOrders.find(o => String(o.id) === String(b.orderId)) || {}).notas || "",
      "Pedido a f\xE1brica": b.pedidoGenerado ? "S\xED" + (b.fechaPedidoFabrica ? " (" + new Date(b.fechaPedidoFabrica).toLocaleDateString("es-ES") + ")" : "") : "No",
      "Recibido de f\xE1brica": b.recibidoFabrica ? "S\xED" + (b.fechaRecibido ? " (" + new Date(b.fechaRecibido).toLocaleDateString("es-ES") + ")" : "") : "No",
    }));
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pendientes proveedor");
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, "Pendientes_Proveedores_" + fecha + ".xlsx");
});
// Listado de lo mandado a apartar al almac\xE9n un d\xEDa concreto (Jennifer,
// 2026-10-09: "cuando venga el cami\xF3n, para que sea m\xE1s sencillo") \u2014 todo
// pendiente con reservaEnviada ese d\xEDa (hora de Madrid), agrupado por
// modelo y medida para cotejarlo con lo descargado.
(() => {
  const inp = document.getElementById("reservas-almacen-fecha");
  inp.value = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
})();
document.getElementById("descargar-reservas-almacen-btn").addEventListener("click", () => {
  const dia = document.getElementById("reservas-almacen-fecha").value;
  if (!dia) { alert("Elige el d\xEDa."); return; }
  const diaMadrid = iso => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
  const lista = backorders
    .filter(b => b.reservaEnviada && diaMadrid(b.reservaEnviada) === dia && b.estado !== "cancelado")
    .sort((a, b) => (a.stockModel + "|" + a.talla).localeCompare(b.stockModel + "|" + b.talla) || a.reservaEnviada.localeCompare(b.reservaEnviada));
  const diaEs = new Date(dia + "T12:00:00").toLocaleDateString("es-ES");
  if (!lista.length) { alert("No hay reservas al almac\xE9n del " + diaEs + "."); return; }
  const filas = lista.map(b => {
    const o = allOrders.find(x => String(x.id) === String(b.orderId)) || {};
    return {
      "Hora reserva": new Date(b.reservaEnviada).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }),
      Pedido: (b.tipo === "colchon" && b.tipoEnvio === "FUR" ? "FUR" : "") + refLabel(b) + (b.refSuffix || ""),
      Cliente: o.name || "",
      Tipo: b.tipo || "",
      Modelo: b.stockModel,
      Medida: b.talla,
      Color: b.color || "",
      Cantidad: b.cantidad,
      Proveedor: b.proveedor || "",
      "Ref. Polival": b.referencia || "",
      Env\xEDo: o.agencia || "",
      Estado: b.estado === "servido" ? "Ya sali\xF3" : b.cargaId || o.cargaId ? "En carga" : "Apartado",
    };
  });
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reservas almac\xE9n");
  XLSX.writeFile(wb, "Reservas_almacen_" + dia + ".xlsx");
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
  // Cargado tambi\xE9n aqu\xED (no solo al entrar en Cat\xE1logo) porque Proveedores
  // pendientes lo necesita para calcular la columna SKU (Jennifer,
  // 2026-09-21) sin depender de que se haya visitado antes esa pantalla.
  loadCatalogo();
  // Igual que arriba con el cat\xE1logo (Jennifer, 2026-09-21): el aviso de
  // "ya tiene una reposici\xF3n pedida" en el bot\xF3n REP de Pedidos necesita
  // backorders cargado desde el principio, sin depender de haber entrado
  // antes en Proveedores/Furniture. Se vuelve a pintar la tabla de Pedidos
  // en cuanto llega, por si ya se hab\xEDa pintado sin esta informaci\xF3n.
  fetch("/api/inventario/pendientes").then(r => r.json()).then(data => {
    backorders = data;
    applyFilter();
  });
  // Colchones abiertos: el contador morado del men\xFA tiene que verse nada
  // m\xE1s entrar, sin haber abierto antes esa pantalla (Jennifer, 2026-09-28).
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

const ALL_VIEWS = ["view-shopify", "view-carrefour", "view-maison-du-monde", "view-worten", "view-conforama", "view-conforama-es", "view-leroy-merlin", "view-placeholder", "view-catalogo", "view-stock", "view-abiertos", "view-pendientes", "view-historial", "view-furniture", "view-historial-cargas", "view-casos-revisar", "view-seur", "view-historial-cargas-seur", "view-casos-revisar-seur", "view-devoluciones-seur", "view-pesos", "view-historico-rep", "view-tarifas", "view-tarifas-plataformas", "view-plazos-marketplace", "view-casos", "view-tareas"];
function hideAllViews() {
  ALL_VIEWS.forEach(id => { document.getElementById(id).style.display = "none"; });
}

function selectPlatform(id) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.platform === id));
  const platform = platforms.find(p => p.id === id);
  document.getElementById("view-title").textContent = "Pedidos \xB7 " + platform.label;
  hideAllViews();

  if (id === "shopify") {
    document.getElementById("view-shopify").style.display = "block";
  } else if (id === "carrefour" || id === "maison-du-monde" || id === "worten" || id === "conforama" || id === "conforama-es" || id === "leroy-merlin") {
    document.getElementById("view-" + id).style.display = "block";
    loadMarketplacePedidos(id);
  } else {
    const ph = document.getElementById("view-placeholder");
    ph.style.display = "block";
    ph.textContent = platform.label + " todav\xEDa no est\xE1 conectado. Lo a\xF1adiremos pr\xF3ximamente.";
  }
}

function selectPlazos(id) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.plazos === id));
  hideAllViews();
  if (id === "marketplace") {
    document.getElementById("view-title").textContent = "Plazos de entrega \xB7 Marketplace";
    document.getElementById("view-plazos-marketplace").style.display = "block";
    cargarPlazosMarketplace();
    return;
  }
  document.getElementById("view-title").textContent = "Plazos de entrega \xB7 Bezen";
  const ph = document.getElementById("view-placeholder");
  ph.style.display = "block";
  ph.textContent = "Plazos de entrega para Bezen todav\xEDa no est\xE1 definido. Lo a\xF1adiremos cuando Jennifer d\xE9 la regla.";
}
// Fichero de plazos de entrega para Marketplace (Jennifer, 2026-09-23):
// mismo patr\xF3n que "Ficheros plataformas" de Tarifas \u2014 el .xlsx se
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
      el.textContent = "Todav\xEDa no hay ning\xFAn fichero de plazos de Marketplace cargado.";
      return;
    }
    const fecha = cfg.actualizado ? new Date(cfg.actualizado).toLocaleString("es-ES") : "\u2014";
    const fechaDescarga = cfg.ultimaDescarga ? new Date(cfg.ultimaDescarga).toLocaleString("es-ES") : "todav\xEDa no se ha descargado";
    el.innerHTML = \`<div>
      <a href="/api/plazos/marketplace/export" class="secondary" style="display:inline-block;padding:6px 12px;border-radius:6px;text-decoration:none">
        Descargar Marketplace (\${cfg.totalFilas} SKU)
      </a>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">actualizado al cargar: \${fecha}</span>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">\xB7 \xFAltima descarga: \${fechaDescarga}</span>
    </div>\`;
    // El enlace es una descarga real (Content-Disposition attachment), no
    // navega fuera de la p\xE1gina \u2014 tras pulsarlo se refresca este bloque
    // para que "\xFAltima descarga" se actualice sin tener que salir y volver
    // a entrar en la secci\xF3n (Jennifer, 2026-09-24).
    const enlace = el.querySelector("a");
    if (enlace) enlace.addEventListener("click", () => setTimeout(cargarPlazosMarketplace, 800));
  } catch (e) {
    el.textContent = "No se pudo cargar el fichero de plazos.";
  }
}

const INVENTARIO_LABELS = { catalogo: "Cat\xE1logo", stock: "Stock", abiertos: "Colchones abiertos", historial: "Historial de stock", pesos: "Pesos SEUR" };
function selectInventario(id) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.inventario === id));
  document.getElementById("view-title").textContent = "Inventario \xB7 " + INVENTARIO_LABELS[id];
  hideAllViews();
  document.getElementById("view-" + id).style.display = "block";
  if (id === "catalogo") loadCatalogo();
  if (id === "stock") loadStock();
  if (id === "abiertos") loadAbiertos();
  if (id === "historial") loadHistorial();
  if (id === "pesos") loadPesos();
}

const PROVEEDORES_LABELS = { polival: "Polival", luso: "Luso", new: "New", decision: "Pendiente de decisi\xF3n", revisar: "Sin proveedor asignado" };
let currentProveedorFilter = "polival";
function selectProveedores(id) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.proveedores === id));
  document.getElementById("view-title").textContent = "Proveedores \xB7 " + PROVEEDORES_LABELS[id];
  hideAllViews();
  document.getElementById("view-pendientes").style.display = "block";
  currentProveedorFilter = id;
  loadPendientes();
}

const LOGISTICA_LABELS = { furniture: "Furniture \xB7 Pedidos pendientes", "historial-cargas": "Furniture \xB7 Historial de cargas", "casos-revisar": "Furniture \xB7 Casos a revisar", seur: "SEUR \xB7 Pedidos pendientes", "historial-cargas-seur": "SEUR \xB7 Historial de cargas", "casos-revisar-seur": "SEUR \xB7 Env\xEDos SEUR", "devoluciones-seur": "SEUR \xB7 Devueltos" };
function selectLogistica(id) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.logistica === id));
  document.getElementById("view-title").textContent = "Log\xEDstica \xB7 " + LOGISTICA_LABELS[id];
  hideAllViews();
  document.getElementById("view-" + id).style.display = "block";
  if (id === "furniture") loadFurniture();
  if (id === "historial-cargas") loadHistorialCargas();
  if (id === "casos-revisar") loadCasosRevisar();
  if (id === "seur") loadSeur();
  if (id === "historial-cargas-seur") loadHistorialCargasSeur();
  if (id === "casos-revisar-seur") loadCasosRevisarSeur();
  if (id === "devoluciones-seur") loadDevoluciones();
}

// Hist\xF3rico de reposiciones y gestos comerciales (Jennifer, 2026-09-22):
// "un sitio donde yo vaya sola a buscar esas reposiciones y esos gestos
// comerciales" \u2014 TODOS, cualquier estado (pendiente, ya enviado por SEUR/
// Furniture, cancelado...), no solo los que siguen activos. Reusa el mismo
// array backorders ya cargado en el resto de pantallas de Proveedores/
// Furniture/SEUR (que ya trae cualquier estado, no solo "pendiente").
function selectHistorico(id) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.historico === id));
  document.getElementById("view-title").textContent = "Hist\xF3rico reposiciones y gestos comerciales";
  hideAllViews();
  document.getElementById("view-historico-rep").style.display = "block";
  loadHistoricoRepGc();
}

// TARIFAS (Jennifer, 2026-09-22): consulta el precio de venta calculado
// (BEZEN/MAISON/RESTO \xD7 ES/FR/IT/AL) para cada talla de un modelo, con
// desglose paso a paso de la f\xF3rmula al pulsar sobre cada precio \u2014 "quiero
// poder chequear c\xF3mo has sacado ese c\xE1lculo". Solo modelos de tipo
// Colchones (por ahora, empezando por Toscana Deluxe).
function selectTarifas(id) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.tarifas === id));
  hideAllViews();
  if (id === "plataformas") {
    document.getElementById("view-title").textContent = "Tarifas \xB7 Ficheros plataformas";
    document.getElementById("view-tarifas-plataformas").style.display = "block";
    cargarPlataformasExport();
    return;
  }
  document.getElementById("view-title").textContent = "Tarifas \xB7 Consultar";
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
    else if (a.dataset.agenda === "tareas") selectTareas();
    else if (a.dataset.agenda) selectAgenda();
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

// Hist\xF3rico de reposiciones y gestos comerciales (Jennifer, 2026-09-22):
// TODOS, sin importar el estado \u2014 pendiente, ya salido por SEUR/Furniture,
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
  // Pantalla de "ir a buscar algo" \u2014 m\xE1s reciente arriba, como Polival.
  items = [...items].sort((a, b) => parseFechaGenerica(b.fecha) - parseFechaGenerica(a.fecha));
  document.getElementById("historico-rep-count").textContent = items.length + " registrados";
  document.querySelector("#historico-rep-table tbody").innerHTML = items.map(b => {
    const o = allOrders.find(x => x.id === b.orderId) || {};
    const tipoLabel = b.gestoComercial ? "GC" : "REP";
    const pedidoBase = o.platform && o.platform !== "Shopify" && o.orderRef ? o.orderRef : "BEZEN" + b.orderNumber;
    const agencia = b.agenciaReposicion || (b.gestoComercial ? "SEUR" : "");
    let recogida = "\u2014";
    if (b.tipo === "colchon" && b.agenciaReposicion === "FURNITURE") {
      recogida = b.recogida ? ("S\xED \u2014 " + (b.recogidaDestino === "desechar" ? "desechar" : "instalaciones")) : "No";
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
// SKU real de un pendiente de Luso/New (Jennifer, 2026-09-21) \u2014 el
// backorder no guarda su propio SKU, as\xED que se busca el producto del
// Cat\xE1logo por stockModel y se construye prefijo+talla, igual que ya se
// hace para el SKU calculado de los pedidos de marketplace.
function skuDePendiente(b) {
  const p = catalogoProducts.find(x => x.stockModel === b.stockModel);
  if (!p || !p.skuPrefix) return "\u2014";
  return p.skuPrefix + (b.talla || "");
}

// \xBFEl pedido de este colch\xF3n SUELTO (no pack) lleva tambi\xE9n tapicer\xEDa como
// art\xEDculo aparte? (Jennifer, 2026-09-25, caso real BEZEN12173/12133): antes
// esto solo se ve\xEDa yendo a Log\xEDstica > Furniture \u2014 un colch\xF3n suelto
// "siempre por SEUR" (regla dictada 2026-09-18) no ten\xEDa ni aviso ni forma de
// decidir mandarlo junto con la tapicer\xEDa. Mismos tipos de producto que ya
// usa InventoryStore (TYPE_MAP en inventory-store.js) para no inventar una
// clasificaci\xF3n nueva.
const TAPICERIA_PRODUCT_TYPES_FRONT = new Set(["Canap\xE9", "Canap\xE9 fijo", "Base", "Cabecero"]);
function ordenTieneTapiceria(orderNumber) {
  const order = allOrders.find(o => o.orderNumber === orderNumber);
  if (!order) return false;
  // Env\xEDo conjunto (Jennifer, 2026-09-28): la tapicer\xEDa puede estar en otro
  // pedido del mismo grupo \u2014 cuenta igual, el colch\xF3n sale con ella (FUR).
  const pedidos = order.grupoEnvio ? pedidosDelGrupo(order) : [order];
  return pedidos.some(p => (p.items || []).some(it => {
    const cp = catalogoProducts.find(c => c.productId === it.productId);
    return cp && TAPICERIA_PRODUCT_TYPES_FRONT.has(cp.product_type);
  }));
}

// Pedidos que se env\xEDan juntos (Jennifer, 2026-09-28): todos llevan
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
  return \`<div class="grupo-envio-tag" title="Un solo env\xEDo por Furniture con la referencia \${escapeAttr(principal ? refLabel(principal) : "")}">\u{1F4E6} Junto con \${escapeAttr(otros)}</div>\`;
}

// La fila de filtros (Pendientes/Furniture) va sticky justo debajo de la
// cabecera de columnas, tambi\xE9n sticky \u2014 un "top" fijo en CSS (34px) no
// siempre coincide con la altura REAL de la cabecera (depende de si el
// texto de alguna columna ocupa 1 o 2 l\xEDneas, fuente ya cargada o no, etc.),
// y si se queda corto la fila de filtros tapa un poco la fila de datos justo
// debajo, cortando el texto (Jennifer, 2026-09-25, caso real: "Modelo" en la
// primera fila de Luso/New). Se mide la altura real de la cabecera despu\xE9s
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
// cada plataforma/pa\xEDs, con desglose paso a paso de la f\xF3rmula al pulsar
// sobre el precio (quiere poder comprobar que el c\xE1lculo est\xE1 bien).
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
  return v == null ? "\u2014" : v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "\u20AC";
}
// Buscador con autocompletado (Jennifer, 2026-09-23) en vez de un
// desplegable \u2014 mismo patr\xF3n que ya usa Inventario > Stock (input +
// <datalist>, sin resultados hasta que el texto coincide EXACTO con un
// modelo real, sea escrito a mano o elegido de la lista).
async function loadTarifas() {
  // catalogoProducts ya se carga al arrancar la sesi\xF3n (ver onUserReady) \u2014
  // no hace falta volver a pedirlo aqu\xED. Varias fichas de Shopify pueden
  // compartir el mismo stockModel a prop\xF3sito (mismo colch\xF3n f\xEDsico, ej.
  // "4D"/"4D 2026"/"4D - LIQUIDACI\xD3N" son 3 productId distintos con
  // stockModel:"4D" \u2014 Jennifer, 2026-09-23, vio "4D" repetido 3 veces en
  // el buscador) \u2014 hay que quedarse con un solo nombre por stockModel.
  // Los modelos "LIQUIDACI\xD3N" con stockModel propio (ej. "Siberian Zen -
  // LIQUIDACION") no interesan en Tarifas (Jennifer, 2026-09-23) \u2014 se
  // excluyen del buscador aunque sigan en el Cat\xE1logo normal.
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
// que si hacemos alguna actualizaci\xF3n de precio, ese fichero se
// actualice, yo me lo descargue de aqu\xED") \u2014 el .xlsx se regenera en el
// servidor con los precios actuales cada vez que se pulsa el enlace, no
// es un fichero est\xE1tico guardado de una vez.
async function cargarPlataformasExport() {
  const el = document.getElementById("tarifas-plataformas-lista");
  try {
    const res = await fetch("/api/tarifas/plataforma/listar");
    const data = await res.json();
    const plataformas = (data && data.plataformas) || [];
    if (!plataformas.length) {
      el.textContent = "Todav\xEDa no hay ning\xFAn fichero de plataforma cargado.";
      return;
    }
    // Agrupado visualmente por familia de plataforma (Jennifer, 2026-09-23:
    // "puedes dividir un poco m\xE1s con l\xEDneas... para que sea m\xE1s f\xE1cil
    // visiblemente") \u2014 la familia es el nombre sin el sufijo de pa\xEDs
    // (MAISON_ES/MAISON_FR/MAISON_IT -> "MAISON"); un separador+t\xEDtulo
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
      const fecha = p.actualizado ? new Date(p.actualizado).toLocaleString("es-ES") : "\u2014";
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
    document.getElementById("tarifas-count").textContent = "No hay ning\xFAn modelo que coincida exactamente con \\"" + typed + "\\".";
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
  // Orden num\xE9rico de talla (Jennifer, 2026-09-23): 80X180, 80X190, 80X200,
  // 90X180... hasta 200X200 \u2014 nunca el orden en que vengan del Cat\xE1logo.
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
    avisoEl.textContent = sinDatos.length + " talla(s) sin datos completos: " + sinDatos.map(f => f.talla + " (" + f.error + ")").join(" \xB7 ");
  }
  const primeraConCoste = filas.find(f => f.costeProveedor);
  document.getElementById("tarifas-count").textContent = filas.length + " tallas"
    + (primeraConCoste ? " \u2014 coste de " + primeraConCoste.costeProveedor + " (" + primeraConCoste.costePeriodo + ")" : "");
  document.querySelector("#tarifas-table tbody").innerHTML = filas.map(f => {
    if (!f.columnas) {
      return \`<tr><td>\${f.talla}</td><td colspan="9" style="color:#991b1b">\${escapeAttr(f.error || "Sin datos")}</td></tr>\`;
    }
    const cells = TARIFAS_COLUMNAS.map(c => {
      const col = f.columnas[c.key];
      if (!col || col.precio == null) return "<td>\u2014</td>";
      return \`<td><button type="button" class="secondary tarifa-precio-btn" data-talla="\${escapeAttr(f.talla)}" data-col="\${c.key}">\${fmtPrecio(col.precio)}</button></td>\`;
    }).join("");
    // Aviso visible (Jennifer, 2026-09-23) cuando el coste y/o el env\xEDo son
    // un sustituto (de otra talla, o de otro modelo hermano) \u2014 para que se
    // vea a simple vista sin tener que abrir cada desglose.
    const marcas = [];
    if (f.costeSustituto) marcas.push(\`<span title="Coste sustituto de \${escapeAttr(f.costeSustituto)}" style="color:#a855f7;font-weight:700">*</span>\`);
    if (f.envioSustituto) marcas.push(\`<span title="Env\xEDo sustituto de \${escapeAttr(f.envioSustituto)}" style="color:#0ea5e9;font-weight:700">\u2020</span>\`);
    if (f.envioFijo != null) marcas.push(\`<span title="Env\xEDo fijo FURNITURE (\${fmtPrecio(f.envioFijo)}), igual para cualquier talla/pa\xEDs" style="color:#ea580c;font-weight:700">\u2021</span>\`);
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
  document.getElementById("tarifas-desglose-titulo").textContent = fila.talla + " \u2014 " + colLabel;
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
          <option value=""\${!p.proveedor ? " selected" : ""}>\u2014 sin asignar \u2014</option>
          <option value="POLIVAL"\${p.proveedor === "POLIVAL" ? " selected" : ""}>Polival</option>
          <option value="LUSO"\${p.proveedor === "LUSO" ? " selected" : ""}>Luso</option>
          <option value="NEW"\${p.proveedor === "NEW" ? " selected" : ""}>New</option>
        </select>
      </td>
      <td><input type="checkbox" class="exception-check" data-id="\${p.productId}"\${p.exceptionFurniture ? " checked" : ""}></td>
      <td><input type="checkbox" class="nostock-check" data-id="\${p.productId}"\${p.noStock ? " checked" : ""}></td>
      <td><input type="checkbox" class="excluido-check" data-id="\${p.productId}"\${p.excluido ? " checked" : ""} title="No participa en b\xFAsquedas por nombre/SKU ni en Tarifas (pero la ficha sigue existiendo en Shopify)"></td>
    </tr>
  \`).join("");
  document.getElementById("catalogo-count").textContent = colchones.length + " modelos de colch\xF3n";

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
// (distinto de la campana): un colch\xF3n de un pedido de Furniture que se
// puede cubrir con un abierto de la misma medida ("Usar el abierto") o
// cortando uno abierto M\xC1S GRANDE del mismo modelo ("Cortar").
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
// Colch\xF3n que podr\xEDa salir de un abierto: de un pedido que va por
// Furniture, pendiente de f\xE1brica o cubierto con un ENROLLADO de stock (que
// se puede devolver para SEUR). Nunca uno ya sacado de un abierto,
// transformado, de reposici\xF3n o de gesto comercial.
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
  // La ficha normal y la de "LIQUIDACI\xD3N" son el mismo colch\xF3n.
  const base = s => String(s || "").replace(/\\s*-\\s*LIQUIDACI[\xD3O]N\\s*$/i, "").trim();
  const delModelo = abiertosRows.filter(a => base(a.stockModel) === base(b.stockModel) && a.cantidad >= n);
  const mismo = delModelo.find(a => a.talla === b.talla) || null;
  // Cortar solo aplica a lo que sigue pendiente (lo cubierto con enrollado
  // ya tiene la medida exacta: ah\xED solo tiene sentido "usar el abierto").
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
// Etiqueta morada con sus botones, para pintar junto al colch\xF3n.
function abiertoTagHtml(b) {
  const op = abiertosParaBackorder(b);
  if (!op) return "";
  let html = "";
  if (op.mismo) {
    html += \`<span class="abierto-tag">\u{1F7E3} ABIERTO disponible: \${escapeAttr(nombreCortoModelo(b.stockModel))} \${b.talla} (\${op.mismo.cantidad})\${op.mismo.nota ? " \xB7 " + escapeAttr(op.mismo.nota) : ""}</span> <button type="button" class="abierto-btn" data-usar-abierto="\${escapeAttr(b.id)}">Usar el abierto</button>\`;
  }
  for (const a of op.cortar) {
    html += \`\${html ? "<br>" : ""}<span class="abierto-tag">\u{1F7E3}\u2702\uFE0F Se puede CORTAR: abierto \${a.talla} \u2192 \${b.talla} (\${a.cantidad})\${a.nota ? " \xB7 " + escapeAttr(a.nota) : ""}</span> <button type="button" class="abierto-btn" data-cortar-abierto="\${escapeAttr(b.id)}" data-talla="\${escapeAttr(a.talla)}">Cortar</button>\`;
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
  if (!confirm("\xBFUsar un colch\xF3n ABIERTO " + nombreCortoModelo(b.stockModel) + " " + b.talla + " para " + refLabel(b) + "?\\n\\n"
    + (conEnrollado ? "El enrollado que se hab\xEDa descontado vuelve al stock (para SEUR). " : "Deja de estar pendiente de f\xE1brica. ")
    + "Sale por FURNITURE y se manda la reserva del abierto al almac\xE9n.")) return;
  const res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(id) + "/usar-abierto", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usuario: currentUser }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) { alert(data.error || "No se ha podido usar el abierto."); return; }
  alert(data.avisoReserva && data.avisoReserva.ok
    ? "Hecho: sale del abierto. Se ha enviado la reserva al almac\xE9n."
    : "Hecho: sale del abierto, pero NO se ha podido enviar la reserva al almac\xE9n (" + ((data.avisoReserva && data.avisoReserva.reason) || "error") + "). Av\xEDsales t\xFA, por favor.");
  await recargarTrasAbierto(b.orderId);
}
async function cortarAbierto(id, tallaAbierto) {
  const b = backorders.find(x => x.id === id);
  if (!b) return;
  if (!confirm("\xBFCortar un colch\xF3n ABIERTO " + nombreCortoModelo(b.stockModel) + " " + tallaAbierto + " a " + b.talla + " para " + refLabel(b) + "?\\n\\nSe manda al almac\xE9n el aviso de transformaci\xF3n con su etiqueta, y sale por FURNITURE.")) return;
  const res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(id) + "/sustituir", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ transformar: true, desdeAbierto: true, talla: tallaAbierto, fecha: null }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) { alert(data.error || "No se ha podido cortar."); return; }
  alert(data.avisoAlmacen && data.avisoAlmacen.ok
    ? "Hecho: se corta el abierto. Se ha enviado el aviso al almac\xE9n."
    : "Hecho: se corta el abierto, pero NO se ha podido enviar el email al almac\xE9n (" + ((data.avisoAlmacen && data.avisoAlmacen.reason) || "error") + "). Av\xEDsales t\xFA, por favor.");
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
    try { catalogoProducts = await (await fetch("/api/inventario/catalogo")).json(); } catch (e) { /* sin cat\xE1logo, el datalist queda vac\xEDo */ }
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
    ? ops.length + (ops.length === 1 ? " colch\xF3n de Furniture puede salir de un abierto" : " colchones de Furniture pueden salir de un abierto")
    : "Ahora mismo ning\xFAn pedido de Furniture puede aprovechar un abierto.";
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
  document.getElementById("abiertos-count").textContent = total + (total === 1 ? " colch\xF3n abierto" : " colchones abiertos") + " en el almac\xE9n";
  document.querySelector("#abiertos-table tbody").innerHTML = filas.map(r => \`<tr>
    <td>\${escapeAttr(r.stockModel)}</td>
    <td>\${r.talla}</td>
    <td>\${r.cantidad}</td>
    <td>\${escapeAttr(r.nota || "")}</td>
    <td><span class="adjust-form">
      <button type="button" class="abiertos-adjust" data-model="\${escapeAttr(r.stockModel)}" data-talla="\${escapeAttr(r.talla)}" data-delta="-1">\u2212</button>
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

// Consulta solo por medida (Jennifer, 2026-10-13: "no me gusta no poder
// consultar solo por medida"): con medida y sin modelo salen todos los
// modelos de esa medida; con los dos, solo esa medida del modelo. La
// medida vale a medias ("150" saca 150X190, 150X200...).
function normTalla(t) {
  return String(t || "").toUpperCase().split(" ").join("").split("*").join("X");
}
function renderStock() {
  const typed = document.getElementById("stock-model-select").value.trim();
  const tallaTxt = normTalla(document.getElementById("stock-talla-select").value);
  const soloConStock = document.getElementById("stock-solo-con-stock").checked;
  const tbody = document.querySelector("#stock-table tbody");
  document.getElementById("stock-tallas-datalist").innerHTML = [...new Set(stockRows.map(r => normTalla(r.talla)))]
    .sort(compareTalla).map(t => '<option value="' + escapeAttr(t) + '"></option>').join("");

  if (!typed && !tallaTxt) {
    tbody.innerHTML = "";
    document.getElementById("stock-modelo-head").style.display = "none";
    document.getElementById("stock-count").textContent = "Escribe o elige un modelo, una medida o las dos cosas para ver el stock.";
    return;
  }

  const model = !typed ? null : stockRows.find(r => r.stockModel === typed) ? typed
    : (stockRows.find(r => r.stockModel.toLowerCase() === typed.toLowerCase())?.stockModel || null);

  if (typed && !model) {
    tbody.innerHTML = "";
    document.getElementById("stock-count").textContent = "No hay ning\xFAn modelo que coincida exactamente con \\"" + typed + "\\".";
    return;
  }

  const porMedida = !model;
  document.getElementById("stock-modelo-head").style.display = porMedida ? "" : "none";
  const sorted = stockRows.filter(r => (!model || r.stockModel === model)
      && (!tallaTxt || normTalla(r.talla).includes(tallaTxt))
      && (!soloConStock || r.cantidad > 0))
    .sort((a, b) => porMedida
      ? (compareTalla(a.talla, b.talla) || nombreCortoModelo(a.stockModel).localeCompare(nombreCortoModelo(b.stockModel)))
      : compareTalla(a.talla, b.talla));
  tbody.innerHTML = sorted.map(r => {
    // Pedidos para stock (Jennifer, 2026-10-02): lo en camino y lo que de
    // eso ya tiene cliente.
    const pedido = r.pedidoProveedor || 0;
    const reservado = r.pedidoProveedorReservado || 0;
    const disponible = pedido - reservado;
    return \`
    <tr>
      \${porMedida ? '<td title="' + escapeAttr(r.stockModel) + '">' + escapeAttr(nombreCortoModelo(r.stockModel)) + '</td>' : ""}
      <td>\${r.talla}</td>
      <td class="\${r.cantidad <= 0 ? "cantidad-baja" : ""}">\${r.cantidad}</td>
      <td class="\${r.vendidoPendiente > 0 ? "cantidad-baja" : ""}">\${r.vendidoPendiente || 0}</td>
      <td>\${pedido}\${reservado ? ' <span style="color:var(--muted);font-size:11px">(' + reservado + ' con cliente)</span>' : ""}</td>
      <td class="\${disponible < 0 ? "cantidad-baja" : ""}">\${disponible}</td>
      <td>
        <span class="adjust-form">
          <button type="button" class="stock-adjust" data-field="cantidad" data-model="\${escapeAttr(r.stockModel)}" data-talla="\${escapeAttr(r.talla)}" data-delta="-1">\u2212</button>
          <button type="button" class="stock-adjust" data-field="cantidad" data-model="\${escapeAttr(r.stockModel)}" data-talla="\${escapeAttr(r.talla)}" data-delta="1">+</button>
        </span>
      </td>
    </tr>
  \`;
  }).join("");
  const totalReal = sorted.reduce((n, r) => n + Math.max(0, r.cantidad || 0), 0);
  document.getElementById("stock-count").textContent = porMedida
    ? (sorted.length ? sorted.length + " modelos/medidas que coinciden con " + tallaTxt + " \xB7 " + totalReal + " unidades en stock real" : "No hay nada con la medida " + tallaTxt + (soloConStock ? " con stock real." : "."))
    : sorted.length + " tallas de " + model + (tallaTxt ? " (medida " + tallaTxt + ")" : "");

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
  if (delta > 0 && (!field || field === "cantidad")) await asignarAltaAPendientes(stockModel, talla, delta);
  loadStock();
}

// "Marcar recibido" de un pendiente de SEUR (mismo comportamiento que el
// bot\xF3n de Proveedores): a la carga de hoy/ma\xF1ana, o a la fecha programada
// con email de reserva al almac\xE9n.
async function marcarRecibidoSeur(bo) {
  const programada = bo.orderId !== undefined ? fechaProgramadaSeur(bo) : null;
  const res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(bo.id) + "/resolver-seur", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fecha: programada || "auto" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) return { ok: false, error: data.error };
  if (programada) {
    // La fecha programada solo se quita cuando ya no queda nada m\xE1s de
    // ese pedido por llegar (Jennifer, 2026-10-09, BEZEN12279: al marcar
    // GC-003 se borr\xF3 y GC-002, marcado justo despu\xE9s, se fue a la carga
    // de hoy sin email de reserva).
    const idsGrupo = new Set(pedidosDelGrupo(allOrders.find(o => o.id === bo.orderId) || { id: bo.orderId }).map(p => p.id));
    const quedan = backorders.some(x => idsGrupo.has(x.orderId) && x.id !== bo.id && x.estado === "pendiente" && !x.recibidoFabrica);
    if (!quedan) await guardarRetencion([bo.orderId], null);
    // Aviso al almac\xE9n para que lo aparte hasta esa carga (Jennifer, 2026-10-06).
    const rr = await fetch("/api/inventario/pendientes/" + encodeURIComponent(bo.id) + "/reservar-almacen?forzar=1", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agencia: "SEUR", fechaSalida: programada }),
    });
    const dr = await rr.json().catch(() => ({}));
    return { ok: true, programada, emailOk: !!dr.ok };
  }
  return { ok: true, carga: data.carga };
}

// Alta en Stock con pedidos esperando ese colch\xF3n (Jennifer, 2026-10-13: "si
// doy algo de alta en el stock y hay alg\xFAn colch\xF3n pendiente de salir como
// ese, lo suyo es que me avisaras de que lo has metido en la carga de
// SEUR"). Del m\xE1s antiguo al m\xE1s nuevo: cada pendiente de SEUR que quepa en
// las unidades dadas de alta se marca recibido (como el bot\xF3n) y esa unidad
// no se queda en el stock. Los que no van por SEUR (Furniture, recogida,
// cuarentena, revisi\xF3n...) no se tocan, solo se avisa.
async function asignarAltaAPendientes(stockModel, talla, unidades) {
  if (!(unidades > 0)) return;
  try { backorders = await (await fetch("/api/inventario/pendientes")).json(); } catch (e) { return; }
  const tallaU = String(talla).toUpperCase();
  const todos = backorders.filter(b => b.estado === "pendiente" && !b.recibidoFabrica && !b.paraStock && b.tipo === "colchon"
    && b.stockModel === stockModel && String(b.talla).toUpperCase() === tallaU)
    .sort((a, b) => parseFechaGenerica(a.fecha) - parseFechaGenerica(b.fecha));
  if (!todos.length) return;
  const recoge = b => { const o = allOrders.find(x => String(x.id) === String(b.orderId)); return !!(o && o.recogeCliente); };
  const motivoNoSeur = b => b.cuarentena ? "en cuarentena" : b.revision ? "en revisi\xF3n" : recoge(b) ? "lo recoge el cliente"
    : (b.transformadoDesde || b.tipoEnvio === "FUR" || (b.reposicion && b.agenciaReposicion === "FURNITURE")) ? "va por Furniture"
    : b.stockPedidoId ? "esperando un pedido para stock" : "";
  let restante = unidades;
  const metidos = [];
  const otros = [];
  for (const b of todos) {
    const ref = refLabel(b) + (b.refSuffix || "");
    const motivo = motivoNoSeur(b);
    if (!motivo && restante >= b.cantidad) {
      const r = await marcarRecibidoSeur(b);
      if (r.ok) {
        await fetch("/api/inventario/stock", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ stockModel, talla, delta: -b.cantidad, field: "cantidad", usuario: currentUser, origen: "alta-a-pendiente", orderRef: ref }) });
        restante -= b.cantidad;
        metidos.push(ref + " \u2192 " + (r.programada
          ? "carga de SEUR del " + r.programada.slice(8, 10) + "/" + r.programada.slice(5, 7) + (r.emailOk ? " (email de reserva enviado al almac\xE9n)" : " (\xA1NO se pudo mandar el email de reserva, avisa t\xFA al almac\xE9n!)")
          : r.carga ? formatSeurCargaTitulo(r.carga) : "carga de SEUR"));
        continue;
      }
      otros.push(ref + " (no se ha podido meter en SEUR: " + (r.error || "error") + ")");
      continue;
    }
    otros.push(ref + (motivo ? " (" + motivo + ")" : b.cantidad > 1 ? " (necesita " + b.cantidad + " unidades)" : ""));
  }
  const NL = String.fromCharCode(10);
  let txt = "";
  if (metidos.length) txt += "Hab\xEDa " + (metidos.length === 1 ? "un pedido esperando" : "pedidos esperando") + " " + nombreCortoModelo(stockModel) + " " + talla
    + ", as\xED que " + (metidos.length === 1 ? "lo he metido" : "los he metido") + " en la carga de SEUR (esa unidad no se queda en el stock):" + NL + metidos.map(m => "\u2022 " + m).join(NL);
  if (otros.length) txt += (txt ? NL + NL : "") + "Ojo: " + (otros.length === 1 ? "hay otro pendiente" : "hay otros pendientes") + " de este colch\xF3n que no he tocado:" + NL + otros.map(m => "\u2022 " + m).join(NL);
  if (txt) alert(txt);
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
    resultEl.textContent = body.error || "No se ha encontrado el art\xEDculo.";
    return;
  }

  resultEl.textContent = "Actualizado: " + body.stockModel + " " + body.talla + " \u2192 " + body.cantidad + " unidades.";
  if (sign > 0) await asignarAltaAPendientes(body.stockModel, body.talla, qty);
  document.getElementById("quick-query").value = "";
  document.getElementById("quick-talla").value = "";
  document.getElementById("quick-qty").value = "1";
  document.getElementById("stock-model-select").value = body.stockModel;
  await loadStock();
}

document.getElementById("quick-alta").addEventListener("click", () => quickAdjust(1));
document.getElementById("quick-baja").addEventListener("click", () => quickAdjust(-1));

document.getElementById("stock-model-select").addEventListener("input", renderStock);
document.getElementById("stock-talla-select").addEventListener("input", renderStock);
document.getElementById("stock-solo-con-stock").addEventListener("change", renderStock);

let backorders = [];
async function loadPendientes() {
  const res = await fetch("/api/inventario/pendientes");
  backorders = await res.json();
  loadCargas();
  renderPendientes();
}

// Coste de tarifa de cada colch\xF3n en Luso/New (Jennifer, 2026-09-30: "al
// lado de los pedidos de proveedores me pongas el importe que tiene cada
// colch\xF3n con la tarifa del proveedor"). Se piden al servidor solo los
// modelo+medida que a\xFAn no se tienen; al llegar se vuelve a pintar.
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
  // Si ya hay una petici\xF3n en marcha, se espera a que acabe y se reintenta
  // (la descarga del Excel necesita los precios s\xED o s\xED).
  while (costesTarifaPidiendo) await new Promise(r => setTimeout(r, 150));
  if (faltan.every(f => costesTarifa.has(f.stockModel + "|" + f.talla))) return;
  costesTarifaPidiendo = true;
  try {
    const res = await fetch("/api/tarifas/costes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: faltan }) });
    const data = await res.json();
    for (const c of data.costes || []) costesTarifa.set(c.stockModel + "|" + c.talla, c);
    for (const f of faltan) if (!costesTarifa.has(f.stockModel + "|" + f.talla)) costesTarifa.set(f.stockModel + "|" + f.talla, { coste: null });
  } catch (e) { /* sin tarifa: la celda queda en "\u2014" */ }
  costesTarifaPidiendo = false;
  renderPendientes();
}
function formatoEuros(n) {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20AC";
}
function costeTarifaCell(b) {
  const c = costesTarifa.get(b.stockModel + "|" + b.talla);
  if (!c) return '<td class="coste-tarifa">\u2026</td>';
  if (c.coste == null) return '<td class="coste-tarifa" title="Sin precio en la tarifa del proveedor">\u2014</td>';
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
// pedidos tengan un apartado de notas para poder [a\xF1adir] informaci\xF3n
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
// Bot\xF3n "Revisar" en cualquier pendiente (Jennifer, 2026-10-01: "por si hay
// algo que ver"): pide el motivo y lo pasa al recuadro de revisi\xF3n.
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-revisar-pendiente]");
  if (!btn) return;
  const b = backorders.find(x => x.id === btn.dataset.revisarPendiente);
  if (!b) return;
  const motivo = prompt("\xBFQu\xE9 hay que revisar de " + refLabel(b) + (b.refSuffix || "") + " (" + b.stockModel + " " + b.talla + ") antes de pedirlo?");
  if (motivo === null) return;
  const res = await fetch("/api/inventario/pendientes/set-campo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: b.id, revision: { motivo: motivo.trim() || "Revisar antes de pedir" } }) });
  if (!res.ok) { alert("No se ha podido pasar a revisi\xF3n."); return; }
  b.revision = { motivo: motivo.trim() || "Revisar antes de pedir" };
  pedidoFabricaSeleccion.delete(b.id);
  renderPendientes();
});

// Cuarentena (Jennifer, 2026-10-13): el cliente avisa de que quiz\xE1 cancela.
// Se queda en la lista en naranja y no se puede pedir a f\xE1brica hasta pulsar
// "Sigue adelante" (o cancelarlo con el bot\xF3n de siempre).
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-cuarentena-pendiente]");
  if (!btn) return;
  const b = backorders.find(x => x.id === btn.dataset.cuarentenaPendiente);
  if (!b) return;
  const poner = btn.dataset.activo === "1";
  let valor = null;
  if (poner) {
    const motivo = prompt("\xBFPor qu\xE9 pasa a cuarentena " + refLabel(b) + (b.refSuffix || "") + " (" + b.stockModel + " " + b.talla + ")?", "El cliente avisa de que quiz\xE1 cancela");
    if (motivo === null) return;
    valor = { motivo: motivo.trim() || "El cliente avisa de que quiz\xE1 cancela", usuario: currentUser };
  } else if (!confirm("\xBF" + refLabel(b) + (b.refSuffix || "") + " sale de cuarentena? Sigue adelante normal y se podr\xE1 pedir a f\xE1brica.")) return;
  const res = await fetch("/api/inventario/pendientes/set-campo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: b.id, cuarentena: valor }) });
  if (!res.ok) { alert("No se ha podido guardar."); return; }
  b.cuarentena = valor ? { ...valor, desde: new Date().toISOString() } : null;
  if (valor) pedidoFabricaSeleccion.delete(b.id);
  renderPendientes();
});

// Pendientes de revisi\xF3n antes de pedir (Jennifer, 2026-10-01: pedidos que
// entraron con un precio incorrecto, a la espera de que el cliente pague la
// diferencia). No salen en la lista normal ni se pueden pedir a f\xE1brica
// hasta pulsar "Revisado: se puede pedir".
function renderRevision() {
  // Solo los del proveedor de la pesta\xF1a abierta (Jennifer, 2026-10-01: "solo
  // estar\xE1n en el apartado del proveedor que le corresponda").
  const enRevision = backorders.filter(b => b.revision && b.estado === "pendiente" && b.proveedor === String(currentProveedorFilter || "").toUpperCase())
    .sort((a, b) => parseFechaGenerica(a.fecha) - parseFechaGenerica(b.fecha));
  document.getElementById("revision-box").style.display = enRevision.length ? "" : "none";
  if (!enRevision.length) return;
  cargarCostesTarifa(enRevision.filter(b => b.proveedor === "LUSO" || b.proveedor === "NEW"));
  document.getElementById("revision-count").textContent = enRevision.length + " art\xEDculo(s) en revisi\xF3n: no se pueden pedir a f\xE1brica hasta marcarlos como revisados.";
  document.querySelector("#revision-table tbody").innerHTML = enRevision.map(b => "<tr>"
    + "<td>" + refLabel(b) + (b.refSuffix || "") + "</td>"
    + "<td>" + escapeAttr(b.proveedor || "") + "</td>"
    + "<td>" + escapeAttr(b.stockModel) + "</td>"
    + "<td>" + escapeAttr(b.talla) + "</td>"
    + "<td>" + b.cantidad + "</td>"
    + ((b.proveedor === "LUSO" || b.proveedor === "NEW") ? costeTarifaCell(b) : "<td>\u2014</td>")
    + '<td class="revision-motivo">' + escapeAttr(b.revision.motivo || "") + "</td>"
    + "<td>" + notasPedidoInput(b) + "</td>"
    + "<td>" + new Date(parseFechaGenerica(b.fecha)).toLocaleDateString("es-ES") + "</td>"
    + '<td><button type="button" class="revision-ok-btn" data-id="' + escapeAttr(b.id) + '">Revisado: se puede pedir</button>'
    // Cancelar tambi\xE9n desde aqu\xED (Jennifer, 2026-10-01: si el cliente no
    // paga la diferencia) \u2014 mismo bot\xF3n y comportamiento que en la lista.
    + ' <button type="button" class="cancelar-pendiente-btn" data-cancelar-pendiente="' + escapeAttr(b.id) + '" title="El cliente ha cancelado: se quita del proveedor y queda cancelado en el pedido">\u2715 Cancelar</button></td>'
    + "</tr>").join("");
  document.querySelectorAll(".revision-ok-btn").forEach(btn => btn.addEventListener("click", async () => {
    const b = backorders.find(x => x.id === btn.dataset.id);
    if (!b || !confirm("\xBF" + refLabel(b) + (b.refSuffix || "") + " ya est\xE1 revisado? Pasar\xE1 a la lista normal de " + b.proveedor + " para pedirlo a f\xE1brica.")) return;
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
  // mercanc\xEDa de f\xE1brica, necesita encontrar r\xE1pido los pedidos pendientes
  // de ese modelo+medida exactos \u2014 el SKU ya es prefijo+talla pegados
  // (ver skuDePendiente), as\xED que un \xFAnico cuadro de texto sirve para
  // filtrar por modelo solo, por medida sola, o por los dos juntos.
  const busquedaSku = document.getElementById("pendientes-sku-search").value.trim().toLowerCase();
  const ocultarRecibidos = document.getElementById("pendientes-ocultar-recibidos").checked;
  const mostrarCancelados = document.getElementById("pendientes-mostrar-cancelados").checked;
  renderRevision();
  const pendientes = backorders.filter(b => {
    if (b.estado !== "pendiente" && !(mostrarCancelados && b.estado === "cancelado")) return false;
    if (b.revision && b.estado === "pendiente") return false; // en su propio recuadro, no se puede pedir todav\xEDa
    if (ocultarRecibidos && b.recibidoFabrica) return false;
    if (busquedaReferencia && !(b.referencia || "").toLowerCase().includes(busquedaReferencia)) return false;
    if (busquedaSku && !skuDePendiente(b).toLowerCase().includes(busquedaSku)) return false;
    // El buscador de "N\xBA de pedido" asum\xEDa siempre el formato BEZEN+n\xFAmero
    // de Shopify \u2014 un pedido de marketplace (Carrefour/Maison/Worten) tiene
    // su propia referencia real (ej. "1106707668-A"), que no encaja ah\xED si
    // se busca tal cual como se ve en su propia tabla (Jennifer, 2026-09-21,
    // caso real: buscaba "1106707668-A" en Luso y no sal\xEDa, aunque el
    // pendiente s\xED estaba creado). Se comprueba tambi\xE9n contra orderRef.
    // refLabel(b) ya cubre BEZEN+n\xFAmero, la referencia real de marketplace,
    // Y el prefijo "REP" de una reposici\xF3n (Jennifer, 2026-09-21) \u2014 buscar
    // solo bezen+n\xFAmero/orderRef no encontraba "REP..." al escribirlo.
    // Con el n\xFAmero final incluido (Jennifer, 2026-09-30: buscaba
    // "BEZEN121022" y no sal\xEDa, solo con "BEZEN12102"), y admitiendo FPK/FUR
    // delante, tal como se ve en el selector de env\xEDo.
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
  document.getElementById("pedido-stock-btn").style.display = ["luso", "new"].includes(currentProveedorFilter) ? "" : "none";
  // En Polival nunca hay colchones de pack (esos van en Luso/New), as\xED que
  // "Cami\xF3n estimado" (que solo aplica a esos) siempre saldr\xEDa vac\xEDo ah\xED \u2014
  // Jennifer pidi\xF3 quitarla directamente en esa pesta\xF1a.
  const showCamionCol = currentProveedorFilter !== "polival";
  document.getElementById("pendientes-camion-head").style.display = showCamionCol ? "" : "none";
  const showRefPolivalCol = currentProveedorFilter === "polival";
  document.getElementById("pendientes-refpolival-head").style.display = showRefPolivalCol ? "" : "none";
  document.getElementById("pendientes-refpolival-filter").style.display = showRefPolivalCol ? "" : "none";
  // En Polival la tapicer\xEDa siempre sale por FUR (nunca hay colch\xF3n de pack
  // ah\xED, eso va en Luso/New), as\xED que esta columna no aporta nada \u2014 Jennifer
  // pidi\xF3 quitarla en esa pesta\xF1a.
  const showFurFpkCol = currentProveedorFilter !== "polival";
  document.getElementById("pendientes-furfpk-head").style.display = showFurFpkCol ? "" : "none";
  document.getElementById("pendientes-furfpk-filter").style.display = showFurFpkCol ? "" : "none";
  // Columna SKU (Jennifer, 2026-09-21): solo tiene sentido en Luso/New
  // (colchones), no en Polival, donde ya se ve el modelo + color + tapa +
  // tirador con todo el detalle de fabricaci\xF3n.
  const showSkuCol = ["luso", "new"].includes(currentProveedorFilter);
  document.getElementById("pendientes-sku-head").style.display = showSkuCol ? "" : "none";
  document.getElementById("pendientes-sku-filter").style.display = showSkuCol ? "" : "none";
  // Coste de tarifa (Jennifer, 2026-09-30), tambi\xE9n solo en Luso/New.
  document.getElementById("pendientes-coste-head").style.display = showSkuCol ? "" : "none";
  document.getElementById("pendientes-coste-filter").style.display = showSkuCol ? "" : "none";
  if (showSkuCol) cargarCostesTarifa(pendientes);

  // Varios art\xEDculos del mismo pedido se agrupan visualmente en un mismo
  // recuadro (Jennifer, 2026-08-25) \u2014 cada uno sigue en su fila (para
  // poder editarlos por separado) pero con un borde que los rodea juntos.
  // En Polival, Jennifer selecciona los pedidos m\xE1s recientes para armar el
  // pedido a f\xE1brica, as\xED que prefiere verlos arriba (2026-09-16). El resto
  // de pesta\xF1as se quedan como estaban (m\xE1s antiguo arriba). Se ordena por
  // FECHA real (parseFechaGenerica), no por orderNumber \u2014 un orderNumber de
  // marketplace no es un correlativo cronol\xF3gico y puede colar un pedido
  // antiguo por delante de uno de Shopify mucho m\xE1s reciente (o al rev\xE9s).
  // En Polival, lo que a\xFAn no est\xE1 pedido a f\xE1brica va SIEMPRE arriba del
  // todo (Jennifer, 2026-10-08: un re-pedido con fecha antigua, BEZEN122132,
  // quedaba intercalado entre los ya pedidos).
  const pendientesOrdenadas = currentProveedorFilter === "polival"
    ? [...pendientes].sort((a, b) => (!!a.pedidoGenerado - !!b.pedidoGenerado) || (parseFechaGenerica(b.fecha) - parseFechaGenerica(a.fecha)))
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
    // Colch\xF3n SUELTO (no pack) cuyo pedido tambi\xE9n lleva tapicer\xEDa aparte
    // (Jennifer, 2026-09-25): misma decisi\xF3n que ya exist\xEDa para el colch\xF3n
    // de un pack (\xBFjunto con Furniture o independiente por SEUR?), ahora
    // tambi\xE9n disponible aqu\xED \u2014 antes un colch\xF3n suelto iba "siempre por
    // SEUR" sin poder elegir. Reusa el mismo campo/selector/ruta (tipoEnvio),
    // sin inventar un mecanismo nuevo.
    const esColchonSueltoConTapiceria = b.tipo === "colchon" && !b.esPack && ordenTieneTapiceria(b.orderNumber);
    const mostrarSelectorEnvio = esPackColchon || esColchonSueltoConTapiceria;
    // Colch\xF3n suelto que sale por Furniture (Jennifer, 2026-09-30): sin
    // tapicer\xEDa no hay nada que elegir, pero se ve la referencia FUR.
    const tipoEnvioSelect = mostrarSelectorEnvio
      ? \`<select class="tipo-envio-select" data-id="\${b.id}">
           <option value="FPK"\${b.tipoEnvio === "FPK" ? " selected" : ""}>FPK\${refLabel(b)}\${b.refSuffix || ""} (independiente)</option>
           <option value="FUR"\${b.tipoEnvio === "FUR" ? " selected" : ""}>FUR\${refLabel(b)}\${b.refSuffix || ""} (junto)</option>
         </select>\`
      : (b.tipo === "colchon" && b.tipoEnvio === "FUR" ? \`<strong>FUR\${refLabel(b)}\${b.refSuffix || ""}</strong> (Furniture)\` : "");
    // Estado de la tapicer\xEDa de este mismo pedido en Furniture (Jennifer,
    // 2026-08-27, ampliado 2026-09-25): antes solo avisaba cuando la
    // tapicer\xEDa YA hab\xEDa salido con el colch\xF3n todav\xEDa marcado FPK aqu\xED
    // (para detectar un FPK que se qued\xF3 descolgado). Jennifer pidi\xF3
    // tambi\xE9n lo contrario \u2014 verlo desde Luso/New cuando la tapicer\xEDa
    // TODAV\xCDA no ha salido, para poder decidir si esperar y mandarlo junto
    // (FUR) o dejarlo independiente (FPK) sin tener que irse a mirar
    // Log\xEDstica > Furniture aparte (casos reales BEZEN12225, BEZEN12173).
    // Se cubren los 3 estados posibles: ya enviada (carga cerrada),
    // programada pero sin enviar todav\xEDa (carga abierta), o ni siquiera
    // programada en ninguna carga (sin cargaId).
    const pedidoDelColchon = mostrarSelectorEnvio ? allOrders.find(o => o.orderNumber === b.orderNumber) : null;
    const cargaDelColchon = pedidoDelColchon?.cargaId ? allCargas.find(c => c.id === pedidoDelColchon.cargaId) : null;
    // Pedidos del sistema antiguo (Jennifer, 2026-09-30, BEZEN12137): la
    // tapicer\xEDa sali\xF3 sin pasar por una carga de aqu\xED \u2014 cuenta como enviada
    // si ya tiene seguimiento de Furniture o est\xE1 marcada a mano.
    const seguimientoFur = pedidoDelColchon && (pedidoDelColchon.furnitureTracking || []).filter(t => t.estado);
    const tapiceriaYaEnviada = !cargaDelColchon && pedidoDelColchon && (pedidoDelColchon.tapiceriaEnviada || (seguimientoFur && seguimientoFur.length));
    const furnitureEstadoTag = !mostrarSelectorEnvio ? ""
      : tapiceriaYaEnviada
      ? \`<span class="furniture-ya-salio-tag">\u2139 Tapicer\xEDa ya enviada\${seguimientoFur && seguimientoFur.length ? " (" + seguimientoFur.map(t => t.albaran + ": " + t.estado).join(", ") + ")" : ""}</span>\`
      : cargaDelColchon?.estado === "cerrada"
      ? \`<span class="furniture-ya-salio-tag">\u2139 Furniture de este pedido ya sali\xF3 (\${new Date(cargaDelColchon.fechaCierre).toLocaleDateString("es-ES")})</span>\`
      : cargaDelColchon?.estado === "abierta"
      ? \`<span class="furniture-pendiente-tag">\u23F3 Tapicer\xEDa en carga de Furniture del \${new Date(cargaDelColchon.fecha + "T00:00:00Z").toLocaleDateString("es-ES")}, todav\xEDa sin enviar</span>\`
      : \`<span class="furniture-pendiente-tag">\u23F3 Tapicer\xEDa sin programar todav\xEDa en ninguna carga de Furniture</span>\`;
    // En "Pendiente de decisi\xF3n" se puede corregir directamente lo que
    // aplique (FUR/FPK si es un colch\xF3n de pack) y adem\xE1s responder a la
    // pregunta de texto (ej. confirmar qu\xE9 art\xEDculo era del cat\xE1logo).
    const referenciaCell = isDecisionTab
      ? \`\${tipoEnvioSelect}\${furnitureEstadoTag}<button type="button" class="responder-btn" data-order="\${b.orderNumber}">Responder dudas</button>\`
      : (tipoEnvioSelect ? tipoEnvioSelect + furnitureEstadoTag : "\u2014");
    const fechaCell = !showCamionCol
      ? ""
      : mostrarSelectorEnvio
      ? \`<td><input type="date" class="fecha-camion-input" data-id="\${b.id}" value="\${b.fechaEstimadaLlegada ? b.fechaEstimadaLlegada.slice(0, 10) : ""}"></td>\`
      // Previsi\xF3n de entrega en el resto (Jennifer, 2026-10-02: "por si hay
      // que consultarlo Sergio o yo"). Campo propio: no toca FUR/FPK.
      : b.recibidoFabrica || b.estado !== "pendiente"
      ? "<td>\u2014</td>"
      : \`<td><input type="date" class="prevision-entrega-input" data-id="\${b.id}" value="\${b.previsionEntrega ? b.previsionEntrega.slice(0, 10) : ""}" title="Previsi\xF3n de entrega del proveedor"></td>\`;
    // Un pedido cancelado (Jennifer, 2026-08-26) se queda visible en rojo
    // para no perder el rastro, pero no se puede seleccionar para pedir a
    // f\xE1brica.
    const pedidoCancelado = !!allOrders.find(o => o.orderNumber === b.orderNumber)?.cancelado;
    // Canap\xE9 de 160 comprado en GEMELOS (Jennifer, 2026-09-28): hasta que
    // ella confirme GEMELOS o PARTIDO no se puede pedir a f\xE1brica.
    const faltaFormato = b.necesitaFormato160 && !b.formato160;
    const enCuarentena = !!b.cuarentena && b.estado === "pendiente";
    const checkCell = showCheckbox
      ? \`<td><input type="checkbox" class="pendiente-check" data-id="\${b.id}"\${pedidoFabricaSeleccion.has(b.id) && !faltaFormato && !enCuarentena ? " checked" : ""}\${pedidoCancelado || faltaFormato || enCuarentena ? " disabled" : ""}\${faltaFormato ? ' title="Falta elegir GEMELOS o PARTIDO"' : enCuarentena ? ' title="En cuarentena: no se puede pedir a f\xE1brica hasta que siga adelante"' : ""}></td>\`
      : "<td></td>";
    const formatoHtml = b.necesitaFormato160 || b.formato160
      ? \`<div class="formato160-box">\${faltaFormato ? '<span class="formato160-falta">\u26A0 Falta elegir: el cliente lo compr\xF3 en GEMELOS</span><br>' : ""}<select class="formato160-select" data-id="\${escapeAttr(b.id)}"><option value="">\xBFGemelos o partido?</option><option value="GEMELOS"\${b.formato160 === "GEMELOS" ? " selected" : ""}>GEMELOS</option><option value="PARTIDO"\${b.formato160 === "PARTIDO" ? " selected" : ""}>PARTIDO</option></select></div>\`
      : "";
    // Sin fecha a prop\xF3sito (Jennifer, 2026-09-23): pendientes marcados
    // "pedido a f\xE1brica" a mano por fuera del PDF normal, para distinguir
    // de los que s\xED llevan fecha real (ver markOrdered/sinFecha).
    const pedidoTag = b.pedidoGenerado
      ? \`<span class="pedido-generado-tag">\u2713 Pedido a f\xE1brica\${b.fechaPedidoFabrica ? " " + new Date(b.fechaPedidoFabrica).toLocaleDateString("es-ES") : ""}</span>\`
      : "";
    const refPolivalCell = showRefPolivalCol
      ? \`<td><input type="text" class="referencia-input" data-id="\${b.id}" value="\${escapeAttr(b.referencia || "")}" placeholder="ref.">\${avisoRefDuplicada(b)}</td>\`
      : "";
    // Columna SKU en Luso/New (Jennifer, 2026-09-21) \u2014 mismo c\xE1lculo que ya
    // se usa para mostrar el SKU de los pedidos de marketplace: prefijo del
    // Cat\xE1logo + talla, buscando el producto por su stockModel.
    const skuCell = showSkuCol
      ? \`<td>\${skuDePendiente(b)}</td>\`
      : "";
    // Colch\xF3n suelto (sin pack) con proveedor Luso/New = pista de SEUR: al
    // llegar el cami\xF3n no basta con marcarlo informativo (como hace
    // Furniture) \u2014 hay que descontar stock de verdad y meterlo en una carga
    // de SEUR con fecha (Jennifer, 2026-09-08). Ver resolveSeurBackorder.
    // Un gesto comercial (almohada de regalo) tambi\xE9n sale por SEUR, nunca
    // por Furniture (Jennifer, 2026-09-22) \u2014 mismo bot\xF3n, mismo flujo. Una
    // reposici\xF3n de colch\xF3n por FURNITURE es la excepci\xF3n: aunque sea tipo
    // "colchon", NO debe mostrar este bot\xF3n \u2014 va por la l\xEDnea independiente
    // de Furniture (con posible recogida), con el bot\xF3n normal "Marcar
    // recibido" en su lugar. Un colch\xF3n suelto marcado FUR (Jennifer,
    // 2026-09-25: quiere poder mandarlo junto con la tapicer\xEDa de su mismo
    // pedido) tampoco va por SEUR \u2014 se trata igual que el colch\xF3n de un pack
    // en FUR, "Marcar recibido" normal para que luego lo recoja
    // buildFurnitureExport en la carga de Furniture de ese pedido.
    // Un colch\xF3n transformado va abierto: siempre Furniture, nunca SEUR
    // (Jennifer, 2026-09-28).
    // Un colch\xF3n suelto marcado FUR (con o sin tapicer\xEDa, Jennifer,
    // 2026-09-30) sale por Furniture: "Marcar recibido", no SEUR. Y al rev\xE9s,
    // un colch\xF3n de pack en FPK sale independiente por SEUR (Jennifer,
    // 2026-09-30, BEZEN12117: la tapicer\xEDa ya sali\xF3 y los colchones "cuando
    // vengan saldr\xE1n por SEUR") \u2014 antes no ten\xEDa forma de prepararse para SEUR.
    const esColchonSeur = !b.paraStock && ((((b.tipo === "colchon" && !b.transformadoDesde && b.tipoEnvio !== "FUR") || esTopperSeur(b)) && !(b.reposicion && b.agenciaReposicion === "FURNITURE")) || b.gestoComercial);
    // Sustituir por otro modelo que s\xED hay en stock (Jennifer, 2026-09-18):
    // vale tanto para colch\xF3n suelto como de pack, mientras siga
    // "pendiente" \u2014 una vez preparado o sustituido ya no aplica. El propio
    // modal decide si hace falta fecha de SEUR o si sale con la tapicer\xEDa
    // (ver decideSustitucionViaSeur en inventory-store.js).
    const sustituirBtnHtml = b.tipo === "colchon" && b.estado === "pendiente" && !b.paraStock
      ? \`<button type="button" class="secondary sustituir-btn" data-id="\${b.id}" style="margin-left:4px">Sustituir modelo</button>\`
      : "";
    // Cancelado (Jennifer, 2026-09-29): se ve solo con "Mostrar cancelados",
    // en gris y sin botones.
    const esCancelado = b.estado === "cancelado";
    // "Viene el cliente a recogerlo" (Jennifer, 2026-10-08): sin cargas; al
    // llegar se marca recibido y, cuando se lo lleva, "Entregado al cliente".
    const pedidoFila = allOrders.find(o => String(o.id) === String(b.orderId));
    const recoge = !!(pedidoFila && pedidoFila.recogeCliente) && !b.paraStock;
    const recogeCell = !recoge ? "" : (pedidoFila.entregadoCliente
      ? '<span class="pedido-generado-tag">\u2705 Entregado al cliente ' + new Date(pedidoFila.entregadoCliente.fecha).toLocaleDateString("es-ES") + "</span>"
      : \`<button type="button" class="resolver-btn" data-id="\${b.id}">\${b.recibidoFabrica ? "\u2713 Recibido" + (b.fechaRecibido ? " \u2014 " + new Date(b.fechaRecibido).toLocaleDateString("es-ES") : "") : "Marcar recibido"}</button>\`
        + (b.recibidoFabrica ? ' <button type="button" class="entregado-cliente-btn" data-entregado-cliente="' + escapeAttr(String(b.orderId)) + '" title="El cliente ya se lo ha llevado: el pedido queda servido">\u2705 Entregado al cliente</button>' : ""));
    const resolverCell = recoge && !esCancelado ? recogeCell
      : b.paraStock && !esCancelado
      ? (b.recibidoFabrica
          ? '<span class="pedido-generado-tag">\u2713 Recibido ' + (b.fechaRecibido ? new Date(b.fechaRecibido).toLocaleDateString("es-ES") : "") + '</span>'
          : '<button type="button" class="recibir-stock-btn" data-id="' + escapeAttr(b.id) + '" title="Ha llegado del proveedor: lo que no tiene cliente pasa al stock">Marcar recibido (al stock)</button>')
      : esCancelado
      ?\`<span class="cancelado-tag">\u2715 CANCELADO\${b.fechaCancelado ? " " + new Date(b.fechaCancelado).toLocaleDateString("es-ES") : ""}</span>\`
      : esColchonSeur
      ? \`<button type="button" class="recibido-seur-btn" data-id="\${b.id}" title="Recibido: entra solo en la carga de SEUR (antes de las 15:00, la de hoy; despu\xE9s, la de ma\xF1ana)">Marcar recibido</button> <button type="button" class="secondary resolver-seur-btn" data-id="\${b.id}" title="Recibido y programado para el d\xEDa que pida el cliente">\u{1F4C5} Otro d\xEDa</button> <button type="button" class="secondary programar-seur-btn" data-id="\${b.id}" title="Todav\xEDa no ha llegado: cuando lo marques recibido ir\xE1 a la carga de SEUR de este d\xEDa">\u23F3 Programar fecha</button>\${fechaProgramadaSeurTag(b)}\${sustituirBtnHtml}\`
      : \`<button type="button" class="resolver-btn" data-id="\${b.id}">\${b.recibidoFabrica ? "\u2713 Recibido" + (b.fechaRecibido ? " \u2014 " + new Date(b.fechaRecibido).toLocaleDateString("es-ES") : "") : "Marcar recibido"}</button>\${reservaAlmacenHtml(b)}\${sustituirBtnHtml}\`;
    const cancelarBtnHtml = esCancelado ? "" : \`<div><button type="button" class="cancelar-pendiente-btn" data-cancelar-pendiente="\${escapeAttr(b.id)}" title="El cliente ha cancelado esta unidad: se quita del proveedor y queda cancelada en el pedido">\u2715 Cancelar</button> <button type="button" class="secondary revisar-pendiente-btn" data-revisar-pendiente="\${escapeAttr(b.id)}" title="Hay algo que ver antes de pedirlo: pasa al recuadro de revisi\xF3n y no se puede pedir hasta marcarlo revisado">\u{1F50D} Revisar</button> \${b.cuarentena ? '<button type="button" class="secondary" data-cuarentena-pendiente="' + escapeAttr(b.id) + '" data-activo="0" title="El cliente sigue adelante: sale de cuarentena">\u25B6 Sigue adelante</button>' : '<button type="button" class="secondary" data-cuarentena-pendiente="' + escapeAttr(b.id) + '" data-activo="1" title="El cliente avisa de que quiz\xE1 cancela: se queda en la lista marcado y no se puede pedir a f\xE1brica">\u23F8 Cuarentena</button>'}\${b.paraStock || !pedidoFila ? "" : (recoge
        ? ' <button type="button" class="secondary recoge-cliente-btn" data-recoge-cliente="' + escapeAttr(String(b.orderId)) + '" data-activo="0" title="El cliente ya no viene: vuelve a su agencia de antes">\u21A9 Ya no lo recoge</button>'
        : ' <button type="button" class="secondary recoge-cliente-btn" data-recoge-cliente="' + escapeAttr(String(b.orderId)) + '" data-activo="1" title="El cliente viene a recogerlo al almac\xE9n: no va en ninguna carga de SEUR ni de Furniture">\u{1F3EC} Recoge el cliente</button>')}</div>\`;
    return \`
    <tr class="\${[b.pedidoGenerado ? "fila-pedido-generado" : "", enCuarentena ? "fila-cuarentena" : "", pedidoCancelado || esCancelado ? "fila-cancelada" : "", esCancelado ? "fila-pendiente-cancelada" : "", grupoClass].filter(Boolean).join(" ")}">
      \${esCancelado ? "<td></td>" : checkCell}
      <td>\${refLabel(b)}\${b.refSuffix || ""}\${b.reposicion ? (b.cambio ? '<span class="reposicion-tag" title="Antes: ' + escapeAttr(b.cambio.de || "") + '">REPOSICI\xD3N POR CAMBIO</span>' : '<span class="reposicion-tag">REPOSICI\xD3N</span>') : ""}\${b.gestoComercial ? '<span class="gesto-comercial-tag">GESTO COMERCIAL</span>' : ""}\${valdemoroTag(allOrders.find(o => String(o.id) === String(b.orderId)))}\${preferenteTag(b)}\${pedidoStockTag(b)}\${recoge ? '<span class="recoge-cliente-tag">\u{1F3EC} RECOGE EL CLIENTE</span>' : ""}\${enCuarentena ? '<br><span class="cuarentena-tag" title="' + escapeAttr(b.cuarentena.motivo || "") + '">\u23F8 CUARENTENA' + (b.cuarentena.desde ? " " + new Date(b.cuarentena.desde).toLocaleDateString("es-ES") : "") + '</span><br><small>' + escapeAttr(b.cuarentena.motivo || "") + (b.cuarentena.usuario ? " (" + escapeAttr(b.cuarentena.usuario) + ")" : "") + '</small>' : ""}</td>
      <td>\${escapeAttr(b.platform || "Shopify")}</td>
      <td>\${b.stockModel}\${pedidoTag}\${esCancelado ? "" : abiertoTagHtml(b)}\${esCancelado ? "" : formatoHtml}\${cancelarBtnHtml}</td>
      <td>\${b.color || "\u2014"}</td>
      <td>\${b.talla}\${b.transformadoDesde ? '<br><span class="transformado-tag" title="Transformado de un colch\xF3n de otra medida que hab\xEDa en stock">Transformado desde ' + b.transformadoDesde + '</span>' : ""}</td>
      \${skuCell}
      <td>\${b.cantidad}\${b.enStock ? '<br><span class="reposicion-tag" title="Unidades que ya se han sacado del stock: al pedido a f\xE1brica solo va el resto">' + b.enStock + ' ya en stock \xB7 pedir ' + Math.max(0, b.cantidad - b.enStock) + '</span>' : ""}</td>
      \${showSkuCol ? costeTarifaCell(b) : ""}
      \${refPolivalCell}
      <td><textarea class="fabricacion-input" data-id="\${b.id}" placeholder="c\xF3mo pedirlo a f\xE1brica...">\${escapeAttr(b.mercanciaFabrica != null ? b.mercanciaFabrica : (b.nombreFabricacion || ""))}</textarea></td>
      <td>\${notasPedidoInput(b)}</td>
      <td>\${new Date(parseFechaGenerica(b.fecha)).toLocaleDateString("es-ES")}</td>
      \${showFurFpkCol ? \`<td>\${referenciaCell}</td>\` : ""}
      \${fechaCell}
      <td>\${resolverCell}</td>
    </tr>
  \`;
  }).join("");
  const nCancelados = pendientes.filter(b => b.estado === "cancelado").length;
  const nCuarentena = pendientes.filter(b => b.cuarentena && b.estado === "pendiente").length;
  // Total de coste de tarifa de lo que se ve, y de lo que falta por pedir.
  let textoCoste = "";
  if (showSkuCol) {
    const activos = pendientes.filter(b => b.estado !== "cancelado");
    const todo = totalCostesTarifa(activos);
    const porPedir = totalCostesTarifa(activos.filter(b => !b.pedidoGenerado));
    textoCoste = " \xB7 Coste tarifa: " + formatoEuros(todo.total) + " (por pedir: " + formatoEuros(porPedir.total) + ")" + (todo.sinPrecio ? " \xB7 " + todo.sinPrecio + " sin precio en tarifa" : "");
  }
  document.getElementById("pendientes-count").textContent = (pendientes.length - nCancelados) + " art\xEDculos pendientes en " + PROVEEDORES_LABELS[currentProveedorFilter] + " (se cierran solos al marcarse el pedido como enviado)" + (nCuarentena ? " \xB7 \u23F8 " + nCuarentena + " en cuarentena" : "") + (nCancelados ? " \xB7 " + nCancelados + " cancelados a la vista" : "") + textoCoste;
  actualizarSeleccionUI();
  sincronizarTopFilaFiltro("pendientes-table", "pendientes-filter-row");
  ajustarScrollArriba();

  tbody.querySelectorAll(".pendiente-check").forEach(chk => {
    chk.addEventListener("change", () => {
      if (chk.checked) {
        // Aviso si ya se pidi\xF3 antes (Jennifer, 2026-09-21: "si lo vuelvo a
        // seleccionar por error, quiero que me avises") \u2014 no bloquea, solo
        // pide confirmar, por si de verdad hace falta repetir el pedido.
        const b = backorders.find(x => x.id === chk.dataset.id);
        if (b && b.pedidoGenerado) {
          const fecha = b.fechaPedidoFabrica ? new Date(b.fechaPedidoFabrica).toLocaleDateString("es-ES") : "";
          const aviso = "Este " + b.stockModel + " (" + b.talla + ") ya se pidi\xF3 a f\xE1brica" + (fecha ? " el " + fecha : "") + ". \xBFSeguro que quieres volver a seleccionarlo?";
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
  tbody.querySelectorAll(".recibir-stock-btn").forEach(btn => {
    btn.addEventListener("click", () => recibirPedidoStock(btn.dataset.id, btn));
  });
  tbody.querySelectorAll(".resolver-seur-btn").forEach(btn => {
    btn.addEventListener("click", () => abrirModalFechaSeur(btn.dataset.id));
  });
  tbody.querySelectorAll(".programar-seur-btn").forEach(btn => {
    btn.addEventListener("click", () => abrirModalFechaSeur(btn.dataset.id, "programar"));
  });
  // Colch\xF3n que va solo: al marcarlo recibido entra en la pr\xF3xima carga de
  // SEUR (Jennifer, 2026-09-30).
  tbody.querySelectorAll(".recibido-seur-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const bo = backorders.find(x => x.id === btn.dataset.id);
      const r = await marcarRecibidoSeur(bo || { id: btn.dataset.id });
      if (!r.ok) { alert(r.error || "No se pudo preparar para SEUR."); btn.disabled = false; return; }
      if (r.programada) {
        if (!r.emailOk) alert("Recibido y programado para la carga del " + r.programada.slice(8, 10) + "/" + r.programada.slice(5, 7) + ", pero NO se ha podido mandar el email de reserva al almac\xE9n. Av\xEDsales t\xFA, por favor.");
        else mostrarAvisoBreve("Recibido: sale en la carga de SEUR del " + r.programada.slice(8, 10) + "/" + r.programada.slice(5, 7) + ". Email de reserva enviado al almac\xE9n.");
      } else if (r.carga) mostrarAvisoBreve("Recibido. Sale en la " + formatSeurCargaTitulo(r.carga) + " (se puede mover de d\xEDa en SEUR).");
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
  tbody.querySelectorAll(".prevision-entrega-input").forEach(inp => {
    inp.addEventListener("change", async () => {
      const b = backorders.find(x => x.id === inp.dataset.id);
      if (b) b.previsionEntrega = inp.value || null;
      await fetch("/api/inventario/pendientes/set-campo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: inp.dataset.id, previsionEntrega: inp.value || null }) });
    });
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
  // En Luso/New, lo que costar\xEDa el pedido a f\xE1brica seleccionado.
  let costeSel = "";
  if (n > 0 && ["luso", "new"].includes(currentProveedorFilter)) {
    const t = totalCostesTarifa(backorders.filter(b => pedidoFabricaSeleccion.has(b.id)));
    costeSel = " \xB7 " + formatoEuros(t.total) + (t.sinPrecio ? " (" + t.sinPrecio + " sin precio)" : "");
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
  // "STOCK" manda la reserva al almac\xE9n con sus etiquetas (Jennifer, 2026-09-28).
  const data = await res.json().catch(() => ({}));
  // STOCK = ya est\xE1 en el almac\xE9n (Jennifer, 2026-10-06): el servidor lo
  // marca recibido; si con eso el pedido ya est\xE1 completo, sube a la carga.
  if (b && data.recibidoPorStock) {
    b.recibidoFabrica = true;
    b.pedidoGenerado = true;
    await checkAutoAddCarga(b.orderId);
    await checkAutoAddEnvioAparte(b.id);
  }
  if (data.avisoReserva) {
    if (data.avisoReserva.ok && b) b.reservaEnviada = new Date().toISOString();
    alert(data.avisoReserva.ok
      ? "Marcado como STOCK. Se ha enviado al almac\xE9n el email de reserva con sus etiquetas."
      : "Marcado como STOCK, pero NO se ha podido enviar la reserva al almac\xE9n (" + (data.avisoReserva.reason || "error") + "). Av\xEDsales t\xFA, por favor.");
  }
}

// Nombre limpio de modelo + talla para un colch\xF3n suelto de Luso/New (a
// diferencia de canap\xE9s/cabeceros de Polival, no tiene "mercanciaFabrica"/
// "nombreFabricacion") \u2014 antes el PDF ca\xEDa al nombre crudo del cat\xE1logo
// ("Colch\xF3n Muelles Ensacados | 30cm | Doble Cara | Zen Nirvana Gran
// Hotel"), poco pr\xE1ctico para pedir por tel\xE9fono/email. El modelo es el
// \xFAltimo trozo del nombre del cat\xE1logo (el mismo patr\xF3n que ya usa
// findByTitleFallback para leer el nombre real del modelo).
function modeloConTalla(b) {
  const partes = (b.stockModel || "").split("|").map(s => s.trim()).filter(Boolean);
  const modelo = (partes[partes.length - 1] || b.stockModel || "").toUpperCase();
  return modelo + " " + b.talla;
}
// Jennifer, 2026-09-21, caso real (pedido 1106707668-A): formato de una
// sola l\xEDnea "MODELO TALLA - N UNIDAD(ES)" \u2014 usado como \xFAltimo recurso si
// alguna vez hiciera falta un texto de una sola celda (ver
// formatMercanciaSinReceta); la tabla real de Luso/New ahora usa columnas
// separadas "Modelo"/"Cantidad" en vez de esto (ver generar-pedido-btn).
function formatMercanciaSinReceta(b) {
  const unidad = (b.cantidad || 1) > 1 ? "UNIDADES" : "UNIDAD";
  return modeloConTalla(b) + " - " + (b.cantidad || 1) + " " + unidad;
}
// Cabecera + filas del pedido a f\xE1brica, compartidas por el PDF y el Excel
// (Jennifer, 2026-09-28: el PDF no se puede editar si algo sale mal, quiere
// tambi\xE9n un Excel editable con el mismo contenido).
function filasPedidoFabrica(seleccionados) {
  // Luso/New (colchones sueltos, sin referencia de Polival): tabla propia
  // de "Modelo" + "Cantidad", sin columna Referencia \u2014 Jennifer,
  // 2026-09-21: "no necesito que aparezca la columna referencia". Polival
  // sigue con Referencia + el texto completo de fabricaci\xF3n, que s\xED lo
  // necesita (modelo/medida/color/tapa/tirador).
  if (currentProveedorFilter === "polival") {
    // Una fila por ART\xCDCULO, con su referencia a la izquierda (Jennifer,
    // 2026-09-28: con "N001FUR / N002FUR" en una sola celda no se ve\xEDa qu\xE9
    // referencia iba con cada art\xEDculo). Los art\xEDculos del mismo pedido van
    // seguidos (antes, 2026-08-25, compart\xEDan recuadro) \u2014 grupoDeFila
    // permite al PDF sombrear cada pedido por igual.
    const grupos = new Map();
    seleccionados.forEach(b => {
      if (!grupos.has(b.orderNumber)) grupos.set(b.orderNumber, []);
      grupos.get(b.orderNumber).push(b);
    });
    const filas = [];
    const grupoDeFila = [];
    // Qu\xE9 l\xEDneas de cada fila van en negrita y rojo: "N UNIDADES" (Jennifer,
    // 2026-09-28) y las extras de tapa \u2014 TAPA PARTIDA / TAPA REFORZADA / SIN
    // TAPA (Jennifer, 2026-09-30: "hab\xEDa que ponerlo en negrita y color rojo
    // para que llamara la atenci\xF3n").
    const resaltadas = [];
    // Los pedidos PREFERENTES (seQura) van primero y con "PREFERENTE" en
    // rojo como primera l\xEDnea de cada art\xEDculo.
    const gruposOrdenados = [...grupos.values()].sort((a, b) => (a.some(esPreferenteSequra) ? 0 : 1) - (b.some(esPreferenteSequra) ? 0 : 1));
    gruposOrdenados.forEach((items, g) => {
      items.forEach(b => {
        // Producto primero y referencia a la DERECHA (Jennifer, 2026-09-28:
        // "la referencia siempre tiene que ir en la parte de la derecha").
        // El texto de fabricaci\xF3n no lleva la cantidad (Jennifer, 2026-09-28,
        // caso BEZEN12239: 2 almohadas sal\xEDan como una) \u2014 se a\xF1ade si hay
        // m\xE1s de una unidad. formatMercanciaSinReceta ya la incluye.
        const cantidad = b.cantidad || 1;
        const texto = b.mercanciaFabrica || b.nombreFabricacion;
        // Cada dato en su l\xEDnea (MODELO / MEDIDA / COLOR / TAPA / TIRADOR /
        // EXTRA...) para que Polival lo lea m\xE1s ordenado (Jennifer,
        // 2026-09-29). Solo en el PDF/Excel: el texto guardado no cambia.
        const mercancia = ((esPreferenteSequra(b) ? "PREFERENTE \xB7 " : "") + (texto
          ? (cantidad > 1 ? texto + " \xB7 " + cantidad + " UNIDADES" : texto)
          : formatMercanciaSinReceta(b))).split(" \xB7 ").join("\\n");
        filas.push([mercancia, b.referencia || "\u2014"]);
        grupoDeFila.push(g);
        resaltadas.push(mercancia.split("\\n").map(l => /^PREFERENTE$|TAPA PARTIDA|TAPA REFORZADA|SIN TAPA|\\d+ UNIDADES$/i.test(l)));
      });
    });
    return { head: ["Mercanc\xEDa para pedir a f\xE1brica", "Referencia"], filas, grupoDeFila, resaltadas };
  }
  // Agrupado por MODELO+TALLA en vez de por pedido (Jennifer, 2026-09-21:
  // "si varios de esos pedidos son del mismo modelo, \xBFhabr\xEDa opci\xF3n de
  // que lo agrupes?") \u2014 al proveedor le da igual de qu\xE9 cliente venga
  // cada colch\xF3n, as\xED que se suman las cantidades en una sola l\xEDnea.
  const grupos = new Map();
  seleccionados.forEach(b => {
    // Reposici\xF3n con unidades ya sacadas del stock (Jennifer, 2026-10-07):
    // a f\xE1brica solo va lo que falta.
    const aPedir = (b.cantidad || 1) - (b.enStock || 0);
    if (aPedir <= 0) return;
    const clave = modeloConTalla(b);
    if (!grupos.has(clave)) grupos.set(clave, 0);
    grupos.set(clave, grupos.get(clave) + aPedir);
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
  // Sin el nombre del proveedor en el t\xEDtulo (Jennifer, 2026-09-21: "no
  // quiero que ponga luso") \u2014 se mantiene gen\xE9rico "Pedido a f\xE1brica" para
  // cualquier proveedor.
  // Letra m\xE1s grande (Jennifer, 2026-09-28: en Polival la ve\xEDan muy peque\xF1a).
  doc.setFontSize(17);
  doc.text("Pedido a f\xE1brica", 14, 17);
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
      // Mismo sombreado para todos los art\xEDculos de un mismo pedido,
      // alternando entre pedidos.
      didParseCell: data => {
        if (data.section === "body" && grupoDeFila[data.row.index] % 2 === 1) {
          data.cell.styles.fillColor = [234, 244, 238];
        }
      },
      // autoTable no admite estilos distintos dentro de una celda: si alguna
      // l\xEDnea va resaltada, la celda se escribe a mano l\xEDnea a l\xEDnea (las
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
      // Cuadr\xEDcula completa (borde en todas las celdas), a petici\xF3n de
      // Jennifer, 2026-09-21 ("hazlo en modo tabla") \u2014 el tema por defecto
      // de autoTable solo raya filas alternas, no pone borde por celda.
      theme: "grid",
      styles: { fontSize: 13, cellPadding: 3.5, valign: "middle" },
      headStyles: { fillColor: [31, 138, 76], fontSize: 13 },
      columnStyles: { 1: { cellWidth: 34, halign: "center" } },
    });
  }

  doc.save("pedido-" + currentProveedorFilter + "-" + new Date().toISOString().slice(0, 10) + ".pdf");
}

// ExcelJS solo se carga al descargar el pedido a f\xE1brica en Excel: SheetJS
// (el XLSX que ya usa la p\xE1gina) no escribe formato de celda, y aqu\xED hace
// falta ajuste de texto, bordes y configuraci\xF3n de impresi\xF3n.
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
// varias l\xEDneas dentro de la celda y todo el ancho cabe en un A4 vertical.
async function descargarPedidoFabricaExcel(seleccionados) {
  const { head, filas, grupoDeFila, resaltadas } = filasPedidoFabrica(seleccionados);
  const ExcelJS = await cargarExcelJs();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pedido a f\xE1brica", {
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

  ws.getCell("A1").value = "Pedido a f\xE1brica";
  // Letra m\xE1s grande (Jennifer, 2026-09-28: en Polival la ve\xEDan muy peque\xF1a).
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
  // La cabecera se repite arriba en cada p\xE1gina impresa.
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
      // L\xEDneas resaltadas (unidades y extras de tapa) en negrita y rojo, el
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
    alert("Falta elegir GEMELOS o PARTIDO en: " + sinFormato.map(b => refLabel(b)).join(", ") + ". El\xEDgelo antes de pedirlo a f\xE1brica.");
    return;
  }

  if (formato === "excel") {
    // Si falla la descarga, no se marcan como pedidos a f\xE1brica.
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
// Ya pedido a f\xE1brica por otra v\xEDa (Jennifer, 2026-09-28): se marca como
// pedido sin generar PDF/Excel, para que no se vuelva a pedir.
document.getElementById("marcar-ya-pedido-btn").addEventListener("click", async () => {
  const seleccionados = backorders.filter(b => pedidoFabricaSeleccion.has(b.id));
  if (!seleccionados.length) return;
  const refs = seleccionados.map(b => b.referencia || refLabel(b)).join(", ");
  if (!confirm("\xBFMarcar como ya pedidos a f\xE1brica (" + seleccionados.length + "): " + refs + "?\\n\\nNo se descarga nada.")) return;
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
  if (entry && entry.recibidoFabrica) await checkAutoAddEnvioAparte(id);
}

// Env\xEDo aparte recibido (Jennifer, 2026-10-08, cabecero 1341FUR de
// BEZEN12031: "lo marco recibido pero no sube solo a la carga"): va en su
// propia l\xEDnea, as\xED que checkAutoAddCarga (por pedido) no lo ve\xEDa. En cuanto
// se marca recibido, sube solo a la pr\xF3xima carga de Furniture.
async function checkAutoAddEnvioAparte(backorderId) {
  const b = backorders.find(x => x.id === backorderId);
  if (!b || !b.envioAparte || b.cargaId || !b.recibidoFabrica || (b.estado !== "pendiente" && b.estado !== "cubierto")) return;
  const o = allOrders.find(x => String(x.id) === String(b.orderId));
  if (o && (o.cancelado || o.recogeCliente)) return;
  if (o && (o.notas || "").trim() && !confirm(refLabel(b) + (b.refSuffix || "") + ' tiene una nota: "' + o.notas.trim() + '". \xBFA\xF1adir el env\xEDo aparte a la pr\xF3xima carga igualmente?')) return;
  await anadirReposicionesACarga([b.id]);
  const carga = allCargas.find(c => c.id === b.cargaId);
  mostrarAvisoBreve(refLabel(b) + (b.refSuffix || "") + ": env\xEDo aparte recibido \u2014 a\xF1adido a la carga" + (carga ? " del " + fechaCortaEs(carga.fecha) : "") + ".");
}

// Subida autom\xE1tica a la carga (Jennifer, 2026-08-26): en cuanto TODOS los
// art\xEDculos del pedido (uno o varios) est\xE1n marcados como recibidos, sube
// solo a la pr\xF3xima carga \u2014 salvo que el pedido tenga una nota, en cuyo caso
// se pregunta primero (la nota puede indicar una fecha de entrega concreta
// que no encaje con la pr\xF3xima carga). Compartida entre los dos sitios donde
// se puede marcar un art\xEDculo como recibido \u2014 la casilla de Furniture y el
// bot\xF3n "Marcar recibido" de Proveedores pendientes (Jennifer, 2026-09-18:
// "los he marcado como recibidos pero no se ponen autom\xE1ticamente en
// Furniture para las cargas" \u2014 solo estaba conectada en un sitio).
// Topper suelto pendiente de f\xE1brica (Jennifer, 2026-10-13: "todos los
// topper siempre se meten en SEUR porque se tratan como colchones"): sale
// independiente por SEUR, como un colch\xF3n FPK \u2014 nunca bloquea ni entra en
// la carga de Furniture del resto del pedido. Salvo si va en un pack o en
// un pedido con tapicer\xEDa (Furniture): entonces sale todo junto por
// Furniture, igual que las almohadas (Jennifer, 2026-10-13).
function esTopperSeur(i) {
  if (i.tipo !== "topper" || i.esPack || i.paraStock || i.estado === "cubierto") return false;
  const o = allOrders.find(x => String(x.id) === String(i.orderId));
  return !(o && o.agencia === "FURNITURE");
}
function soloFaltanAlmohadas(items) {
  const faltan = items.filter(i => !i.recibidoFabrica);
  return faltan.length > 0 && faltan.every(i => i.tipo === "almohada") && items.some(i => i.tipo !== "almohada");
}
async function checkAutoAddCarga(orderId) {
  const order = allOrders.find(o => o.id === orderId);
  // Si viene el cliente a recogerlo, nunca sube a una carga (Jennifer, 2026-10-08).
  if (!order || order.cargaId || order.cancelado || order.recogeCliente) return;
  // Env\xEDo conjunto (Jennifer, 2026-09-28): el grupo entero espera hasta que
  // TODOS sus pedidos est\xE9n recibidos, y entonces sube junto a la carga.
  const grupo = pedidosDelGrupo(order).filter(o => !o.cancelado);
  const items = grupo.flatMap(o => backordersPorPedido(o.id));
  // Un colch\xF3n de pack marcado FPK sale independiente por SEUR, no junto con
  // la tapicer\xEDa \u2014 no debe bloquear que el resto del pedido (tapicer\xEDa,
  // almohadas...) suba solo a la carga de Furniture en cuanto est\xE9 listo.
  // Tambi\xE9n el colch\xF3n SUELTO marcado FPK (Jennifer, 2026-10-08, BEZEN12219:
  // todo recibido salvo el Par\xEDs de Luso en FPK y no sub\xEDa a la carga).
  const esFpkPendiente = i => (i.tipo === "colchon" && i.tipoEnvio === "FPK") || esTopperSeur(i);
  const itemsFurniture = items.filter(i => !esFpkPendiente(i));
  const todosRecibidos = itemsFurniture.length > 0 && itemsFurniture.every(i => i.recibidoFabrica);
  const colchonFpkPendiente = items.some(i => esFpkPendiente(i) && i.estado === "pendiente");
  if (!todosRecibidos) {
    // Solo faltan almohadas (Jennifer, 2026-10-05, BEZEN12276: Spring Zen
    // recibido y "no me hab\xEDa dado cuenta" de las almohadas) \u2014 se pueden
    // pedir urgentes, as\xED que a "tener en cuenta" para gestionarlas r\xE1pido.
    if (soloFaltanAlmohadas(itemsFurniture) && !order.paraTenerEnCuenta) {
      await saveMeta(order.id, { paraTenerEnCuenta: true });
      order.paraTenerEnCuenta = true;
      mostrarAvisoBreve(refLabel(order) + ": todo recibido salvo las almohadas \u2014 pasa a \xABPedidos para tener en cuenta\xBB.");
    }
    return;
  }
  // Pedido que va por SEUR (Jennifer, 2026-10-13, topper N079 de BEZEN12283:
  // "lo he marcado como recibido y no me sale en ning\xFAn sitio de las cargas
  // de Seur" \u2014 se met\xEDa en la carga de Furniture del viernes). Va a la carga
  // de SEUR: antes de las 15:00 la de hoy, despu\xE9s la de ma\xF1ana; si est\xE1
  // retenido con fecha, la de ese d\xEDa cuando ya est\xE9 a la vista.
  if (grupo.every(o => o.agencia === "SEUR")) {
    const ret = retencionDe(order);
    let fecha = "auto";
    if (ret) {
      if (!ret.hasta || ret.hasta > finVentanaSeur()) return;
      if (ret.hasta > hoyMadrid()) fecha = ret.hasta;
      await guardarRetencion([order.id], null);
    }
    const notaSeur = grupo.map(o => (o.notas || "").trim()).filter(Boolean).join(" / ");
    if (notaSeur && !confirm(grupo.map(refLabel).join(" + ") + ' tiene una nota: "' + notaSeur + '". \xBFA\xF1adirlo a la carga de SEUR igualmente?')) return;
    const rs = await fetch("/api/cargas/seur/add", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderIds: grupo.map(o => o.id), fecha }),
    });
    const ds = await rs.json().catch(() => ({}));
    if (!rs.ok || !ds.ok) { alert(refLabel(order) + ": todo recibido, pero no se ha podido meter en la carga de SEUR. M\xE9telo t\xFA desde SEUR, por favor."); return; }
    grupo.forEach(o => { o.cargaId = ds.carga.id; });
    if (!allCargas.some(c => c.id === ds.carga.id)) allCargas.push(ds.carga);
    mostrarAvisoBreve(grupo.map(refLabel).join(" + ") + ": todo recibido \u2014 sale en la " + formatSeurCargaTitulo(ds.carga) + ".");
    return;
  }
  // Retenido por el cliente (Jennifer, 2026-09-30): no sube solo salvo que
  // ya le toque por fecha.
  if (retencionDe(order) && !retencionCumplida(order)) return;
  const cargaRetencion = cargaParaRetencion(order);
  if (retencionDe(order)) await guardarRetencion([order.id], null);
  const notaTexto = grupo.map(o => (o.notas || "").trim()).filter(Boolean).join(" / ");
  const confirmar = notaTexto
    ? confirm(grupo.map(refLabel).join(" + ") + ' tiene una nota: "' + notaTexto + '". \xBFA\xF1adirlo a la pr\xF3xima carga igualmente?')
    : true;
  if (confirmar) {
    await anadirPedidosACarga(grupo.map(o => o.id), cargaRetencion && cargaRetencion.id);
  } else if (!order.paraTenerEnCuenta) {
    // Si Jennifer dice que NO lo a\xF1ada (ej. el cliente pidi\xF3 recibirlo m\xE1s
    // adelante), que no se pierda de vista entre el resto de pendientes \u2014
    // se marca solo "para tener en cuenta", mismo recuadro que ya usan para
    // avisos puntuales.
    await fetch("/api/pedidos/shopify/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: order.id, paraTenerEnCuenta: true }),
    });
    order.paraTenerEnCuenta = true;
  }
  // Aunque la tapicer\xEDa ya suba a su carga, si a este mismo pedido le sigue
  // quedando un colch\xF3n de pack pendiente en Luso/New con FPK, que no se
  // pierda de vista \u2014 se marca "para tener en cuenta" tambi\xE9n.
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

const HISTORIAL_ORIGEN_LABELS = { manual: "Manual", venta: "Venta", envio: "Env\xEDo", camion: "Cami\xF3n (proveedor)", sustitucion: "Sustituci\xF3n", transformacion: "Transformaci\xF3n", "pedido-stock": "Pedido para stock", "pedido-stock-cancelado": "Pedido para stock cancelado" };
const HISTORIAL_CAMPO_LABELS = { cantidad: "Stock real", vendidoPendiente: "Vendido pendiente", pedidoProveedor: "Pedido para stock" };

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
      ? (m.usuario || "\u2014")
      : (m.orderNumber ? refLabel(m) : "\u2014");
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
  document.getElementById("historial-count").textContent = historialMovimientos.length + " movimientos (los \xFAltimos 1000)";
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
      <td>\${p.esManual ? "Manual" : "Por defecto (hist\xF3rico)"}</td>
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

// ---- Log\xEDstica > Furniture ----
// Todo pedido con agencia FURNITURE (calculado ya en Pedidos/Proveedores)
// tiene que aparecer aqu\xED, est\xE9 o no tambi\xE9n esperando fabricarse en
// Polival/Luso/New \u2014 son dos listas independientes (qu\xE9 hay que pedir a
// f\xE1brica vs qu\xE9 sale por esta agencia).
let cargaAbierta = null;
let furnitureSeleccion = new Set();
// Selecci\xF3n de reposiciones pendientes (Jennifer, 2026-09-21) \u2014 aparte de
// furnitureSeleccion porque son backorder.id, no order.id, y se a\xF1aden a
// la carga por su propia ruta independiente.
let reposicionSeleccion = new Set();
// Todas las cargas (abiertas y cerradas) \u2014 se necesita tambi\xE9n fuera de
// Furniture, para avisar en Proveedores si el pedido de un colch\xF3n FPK ya
// sali\xF3 por Furniture (Jennifer, 2026-08-27).
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
  if (!carga) return "No hay carga abierta todav\xEDa";
  const fecha = new Date(carga.fecha + "T00:00:00");
  return "Carga " + carga.dia + " \xB7 " + fecha.toLocaleDateString("es-ES");
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
// pr\xF3ximas de mi\xE9rcoles/viernes). cargaAbierta es la de la pesta\xF1a
// elegida: la tabla, descargar, listado, cerrar y "A\xF1adir a la carga"
// trabajan con ella. Por defecto, la m\xE1s pr\xF3xima.
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
  return allOrders.filter(o => o.agencia === "FURNITURE" && o.cargaId === cargaId && !esMiembroSecundario(o)).length
    + backorders.filter(b => (b.envioAparte || b.reposicion) && b.cargaId === cargaId && (b.estado === "pendiente" || b.estado === "cubierto")).length;
}
function renderPestanasFurniture() {
  const abiertas = cargasFurnitureAbiertas();
  const cont = document.getElementById("furniture-cargas-tabs");
  // Carga con la fecha ya pasada y sin cerrar (Jennifer, 2026-10-01): aviso
  // arriba y su pesta\xF1a en rojo, para revisarla y cerrarla.
  const sinCerrar = abiertas.filter(c => c.fecha < hoyMadrid());
  cont.innerHTML = (sinCerrar.length
      ? '<div class="aviso-sin-cerrar" style="flex-basis:100%">\u26A0 <strong>Pendiente de cerrar:</strong> ' + sinCerrar.map(c => formatCargaTitulo(c) + " (" + pedidosEnCargaFurniture(c.id) + " pedidos)").join(", ") + ". \xC1brela en su pesta\xF1a, rev\xEDsala y pulsa \xABCerrar carga\xBB si ya sali\xF3.</div>"
      : "")
    + abiertas.map(c => '<button type="button" class="carga-tab' + (cargaAbierta && c.id === cargaAbierta.id ? " activa" : "") + (c.fecha < hoyMadrid() ? " vencida" : "") + '" data-carga-tab="' + c.id + '">'
    + (c.fecha < hoyMadrid() ? "\u26A0 " : "") + formatCargaTitulo(c) + ' \xB7 ' + pedidosEnCargaFurniture(c.id) + ' pedidos</button>').join("");
  cont.querySelectorAll("[data-carga-tab]").forEach(btn => btn.addEventListener("click", () => {
    cargaFurnitureElegidaId = btn.dataset.cargaTab;
    elegirCargaFurniture();
    renderFurniture();
  }));
}
// Desplegable "Mover a\u2026" con las otras cargas de Furniture abiertas.
function moverFurnitureHtml(attrs) {
  const otras = cargasFurnitureAbiertas().filter(c => !cargaAbierta || c.id !== cargaAbierta.id);
  if (!otras.length) return "";
  return '<div class="mover-seur"><select class="mover-fur-destino">' + otras.map(c => '<option value="' + c.id + '">' + formatCargaTitulo(c) + '</option>').join("")
    + '</select><button type="button" class="secondary mover-fur-btn" ' + attrs + '>Mover</button></div>';
}

// Un pedido de Furniture puede tener varios art\xEDculos (ej. BEZEN12117:
// almohada + colch\xF3n + canap\xE9 de madera) que no llegan todos al almac\xE9n el
// mismo d\xEDa \u2014 Jennifer necesita ir marcando cada uno seg\xFAn va llegando, sin
// salir de Furniture. Reutiliza el mismo "recibidoFabrica" que ya existe en
// Proveedores (mismo dato, dos sitios donde marcarlo).
// Nunca incluye reposiciones (Jennifer, 2026-09-21): tienen su propia l\xEDnea
// y su propia carga independiente (ver reposicionRowCells/renderFurniture),
// as\xED que no deben aparecer dentro de la fila del pedido original ni
// bloquear su auto-a\xF1adido a carga en checkAutoAddCarga.
function backordersPorPedido(orderId) {
  return backorders.filter(b => b.orderId === orderId && (b.estado === "pendiente" || b.estado === "cubierto") && !b.reposicion && !b.gestoComercial && !b.envioAparte);
}

// Id de pedido le\xEDdo de un data-id (Jennifer, 2026-10-05: 10002300804-A no
// entraba en "tener en cuenta"): Shopify usa ids num\xE9ricos, pero los de
// marketplace son texto ("MDM-10002300804-A") y Number() los dejaba en NaN.
function idPedido(v) {
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}

// Env\xEDo conjunto (Jennifer, 2026-09-28): en Furniture el grupo es UNA sola
// l\xEDnea, la del pedido principal, con los art\xEDculos de todos sus pedidos
// ("el colch\xF3n no aparece en la l\xEDnea del pedido BEZEN12205"). Los dem\xE1s
// pedidos del grupo no salen como l\xEDnea propia mientras el principal siga
// pendiente de env\xEDo.
function esMiembroSecundario(o) {
  return !!o.grupoEnvio && o.grupoEnvio !== o.id
    && allOrders.some(p => p.id === o.grupoEnvio && p.shippingStatus !== "fulfilled");
}

// Aviso tras marcar recibido un colch\xF3n FUR que se reserv\xF3 solo (ver la ruta
// /resolver en el servidor).
function avisarReservaAutomatica(entry) {
  if (!entry || !entry.avisoReserva) return;
  if (entry.avisoReserva.ok) mostrarAvisoBreve("Recibido y reservado: email de reserva enviado al almac\xE9n (" + refLabel(entry) + ").");
  else alert("Recibido, pero NO se ha podido mandar el email de reserva al almac\xE9n" + (entry.avisoReserva.reason ? " (" + entry.avisoReserva.reason + ")" : "") + ". Av\xEDsales a mano o usa el bot\xF3n \xABReservar en almac\xE9n\xBB.");
}

// Reserva en almac\xE9n (Jennifer, 2026-10-01): art\xEDculo recibido de un pedido
// de Furniture que todav\xEDa espera a otra cosa \u2014 bot\xF3n para mandar el email
// con sus etiquetas, o la fecha si ya se mand\xF3. Lo decide ella en cada caso
// (BEZEN12211 no la llev\xF3 porque sal\xEDa al d\xEDa siguiente).
function reservaAlmacenHtml(b) {
  if (!b || b.estado === "cancelado" || b.estado === "servido") return "";
  // Si ya se mand\xF3 se ve SIEMPRE, est\xE9 o no marcado como recibido
  // (Jennifer, 2026-10-02: para no mandarlo por duplicado).
  if (b.reservaEnviada) return ' <span class="reserva-tag" title="Email de reserva YA enviado al almac\xE9n \u2014 no hace falta volver a mandarlo">\u2705 YA RESERVADO EN ALMAC\xC9N \xB7 ' + new Date(b.reservaEnviada).toLocaleDateString("es-ES") + "</span>";
  if (!b.recibidoFabrica) return "";
  const o = allOrders.find(x => String(x.id) === String(b.orderId));
  if (!o || o.agencia !== "FURNITURE") return "";
  const resto = backordersPorPedido(o.id).filter(x => x.id !== b.id && !(x.tipo === "colchon" && x.tipoEnvio === "FPK") && !esTopperSeur(x));
  if (!resto.some(x => !x.recibidoFabrica)) return ""; // ya est\xE1 todo: sale en la carga
  return ' <button type="button" class="secondary reservar-almacen-btn" data-reservar-almacen="' + escapeAttr(b.id) + '" title="Manda al almac\xE9n el email con las etiquetas de reserva para que lo aparten para este cliente">\u{1F4E6} Reservar en almac\xE9n</button>';
}
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-reservar-almacen]");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const b = backorders.find(x => x.id === btn.dataset.reservarAlmacen);
  if (!b || !confirm("\xBFMandar al almac\xE9n el email de reserva de " + b.cantidad + "x " + b.stockModel + " " + b.talla + " (" + refLabel(b) + ")?")) return;
  btn.disabled = true;
  let res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(b.id) + "/reservar-almacen", { method: "POST" });
  let data = await res.json().catch(() => ({}));
  if (data.yaEnviada) {
    // Se mand\xF3 desde otra pantalla o de forma autom\xE1tica y esta a\xFAn no lo sab\xEDa.
    b.reservaEnviada = data.yaEnviada;
    if (!confirm("El email de reserva de este art\xEDculo YA se mand\xF3 al almac\xE9n el " + new Date(data.yaEnviada).toLocaleString("es-ES") + ".\\n\\n\xBFSeguro que quieres mandarlo OTRA VEZ?")) {
      if (document.getElementById("view-furniture").style.display !== "none") renderFurniture(); else renderPendientes();
      return;
    }
    res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(b.id) + "/reservar-almacen?forzar=1", { method: "POST" });
    data = await res.json().catch(() => ({}));
  }
  if (!res.ok || !data.ok) { alert("No se ha podido mandar el email de reserva" + (data.avisoReserva && data.avisoReserva.reason ? " (" + data.avisoReserva.reason + ")" : "") + ". Avisa al almac\xE9n a mano."); btn.disabled = false; return; }
  b.reservaEnviada = new Date().toISOString();
  mostrarAvisoBreve("Reserva enviada al almac\xE9n: " + refLabel(b));
  if (document.getElementById("view-furniture").style.display !== "none") renderFurniture(); else renderPendientes();
}, true);

// "Viene el cliente a recogerlo" / "Entregado al cliente" (Jennifer,
// 2026-10-08): ver /api/pedidos/recoge-cliente y /api/pedidos/entregado-cliente.
document.addEventListener("click", async (e) => {
  const btnRecoge = e.target.closest("[data-recoge-cliente]");
  const btnEntregado = e.target.closest("[data-entregado-cliente]");
  if (!btnRecoge && !btnEntregado) return;
  e.preventDefault();
  e.stopPropagation();
  const id = (btnRecoge || btnEntregado).dataset.recogeCliente || (btnRecoge || btnEntregado).dataset.entregadoCliente;
  const order = allOrders.find(o => String(o.id) === String(id));
  const ref = order ? refLabel(order) : id;
  const orderId = order ? order.id : id;
  let res;
  if (btnRecoge) {
    const activo = btnRecoge.dataset.activo === "1";
    if (!confirm(activo
      ? "\xBFEl cliente viene a recoger " + ref + "?\\n\\nSe saca de cualquier carga abierta de SEUR o Furniture y ya no entrar\xE1 en ninguna."
      : "\xBF" + ref + " ya NO lo recoge el cliente?\\n\\nVuelve a su agencia de antes.")) return;
    res = await fetch("/api/pedidos/recoge-cliente", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: orderId, activo, usuario: currentUser }) });
  } else {
    if (!confirm("\xBFEl cliente ya se ha llevado " + ref + "?\\n\\nEl pedido queda como servido.")) return;
    res = await fetch("/api/pedidos/entregado-cliente", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: orderId, usuario: currentUser }) });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) { alert(data.error || "No se ha podido guardar."); return; }
  await loadOrders();
  loadPendientes();
}, true);

// Entregas en Valdemoro (Jennifer, 2026-09-30: "cuando un pedido sea para
// entregar en Valdemoro por Furniture o por SEUR siempre me tendr\xE1s que
// avisar o poner una nota por si lo entregamos por nuestros medios").
// Por poblaci\xF3n o por c\xF3digo postal de Valdemoro (28340-28343): hay
// pedidos con poblaci\xF3n "Madrid" y CP de Valdemoro.
// Solo para los pedidos nuevos (Jennifer, 2026-09-30: los de Maison du Monde
// a Valdemoro son de prueba; "se los ponemos a los nuevos que vayan
// entrando a partir de ahora", m\xE1s el cabecero pendiente de BEZEN12035).
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
// marca como enviado, as\xED que la tapicer\xEDa de los pedidos pagados con
// seQura se pide a Polival como preferente para que la hagan antes.
function esPreferenteSequra(b) {
  if (!b || b.proveedor !== "POLIVAL") return false;
  const o = allOrders.find(x => String(x.id) === String(b.orderId));
  if (!o || o.paymentMethod !== "SEQURA") return false;
  return b.tipo === "tapiceria" || backorders.some(x => String(x.orderId) === String(b.orderId) && x.proveedor === "POLIVAL" && x.tipo === "tapiceria");
}
// Pedidos para stock a Luso/New (Jennifer, 2026-10-02).
function pedidoStockTag(b) {
  if (!b) return "";
  if (b.paraStock) {
    const asig = b.asignaciones || [];
    const reservadas = asig.reduce((n, a) => n + (a.cantidad || 0), 0);
    const quienes = asig.map(a => (a.platform && a.platform !== "Shopify" && a.orderRef ? a.orderRef : "BEZEN" + a.orderNumber) + (a.cantidad > 1 ? " x" + a.cantidad : "")).join(", ");
    return '<span class="preferente-tag" style="background:#e0f2fe;color:#075985;border-color:#38bdf8" title="' + escapeAttr(quienes ? "Reservadas para: " + quienes : "Sin clientes todav\xEDa") + '">\u{1F4E6} PARA STOCK \xB7 ' + reservadas + ' de ' + b.cantidad + ' reservadas</span>' +
      (b.recibidoFabrica && b.sobrantesAStock != null ? '<span class="preferente-tag" style="background:#dcfce7;color:#166534;border-color:#22c55e">+' + b.sobrantesAStock + ' al stock</span>' : "");
  }
  if (b.stockPedidoId) {
    const ps = backorders.find(x => x.id === b.stockPedidoId);
    if (b.llegadaPedidoStock) return '<span class="preferente-tag" style="background:#dcfce7;color:#166534;border-color:#22c55e" title="La unidad de este cliente ha llegado con el pedido para stock: m\xE1rcalo recibido para que siga su camino">\u2705 Lleg\xF3 con el pedido de stock ' + new Date(b.llegadaPedidoStock).toLocaleDateString("es-ES") + ' \u2014 m\xE1rcalo recibido</span>';
    return '<span class="preferente-tag" style="background:#e0f2fe;color:#075985;border-color:#38bdf8" title="No se pide aparte: va en un pedido para stock ya hecho a ' + escapeAttr(b.proveedor || "") + '">\u23F3 Cubierto por ' + escapeAttr(ps ? ps.orderRef : "un pedido para stock") + '</span>';
  }
  return "";
}
async function recibirPedidoStock(id, btn) {
  const b = backorders.find(x => x.id === id);
  if (!b) return;
  const reservadas = (b.asignaciones || []).reduce((n, a) => n + (a.cantidad || 0), 0);
  const sobran = b.cantidad - reservadas;
  if (!confirm("\xBFHa llegado el pedido para stock de " + b.cantidad + "x " + b.stockModel + " " + b.talla + "?\\n\\n" +
    (reservadas ? reservadas + " ya tienen cliente: quedar\xE1n avisadas en su l\xEDnea para que las marques recibidas como siempre.\\n" : "") +
    (sobran > 0 ? sobran + " pasan al stock real." : "No sobra ninguna para el stock."))) return;
  btn.disabled = true;
  const res = await fetch("/api/inventario/pendientes/" + encodeURIComponent(id) + "/resolver", { method: "POST" });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.ok === false) { alert(d.error || "No se pudo marcar recibido."); btn.disabled = false; return; }
  mostrarAvisoBreve("Pedido para stock recibido" + (d.sobrantesAStock ? ": +" + d.sobrantesAStock + " al stock." : "."));
  loadPendientes();
}
let pedidoStockLineas = [];
let pedidoStockFilas = [];
function pintarLineasPedidoStock() {
  const tbody = document.getElementById("pedido-stock-lineas");
  tbody.innerHTML = pedidoStockLineas.length
    ? pedidoStockLineas.map((l, i) => '<tr><td>' + escapeAttr(l.stockModel) + '</td><td style="text-align:center">' + escapeAttr(l.talla) + '</td><td style="text-align:center">' + l.cantidad + '</td><td><button type="button" class="secondary pedido-stock-quitar" data-i="' + i + '" style="padding:2px 8px">\u2715</button></td></tr>').join("")
    : '<tr><td colspan="4" style="color:var(--muted)">A\xF1ade modelo, medida y unidades.</td></tr>';
  tbody.querySelectorAll(".pedido-stock-quitar").forEach(btn => btn.addEventListener("click", () => { pedidoStockLineas.splice(Number(btn.dataset.i), 1); pintarLineasPedidoStock(); }));
}
document.getElementById("pedido-stock-btn").addEventListener("click", async () => {
  pedidoStockLineas = [];
  document.getElementById("pedido-stock-titulo").textContent = "Pedido para stock \u2014 " + currentProveedorFilter.toUpperCase();
  pintarLineasPedidoStock();
  document.getElementById("pedido-stock-overlay").classList.add("open");
  try {
    pedidoStockFilas = await (await fetch("/api/inventario/stock")).json();
    const modelos = [...new Set(pedidoStockFilas.filter(r => /colch/i.test(r.stockModel)).map(r => r.stockModel))].sort();
    document.getElementById("pedido-stock-modelos").innerHTML = modelos.map(m => '<option value="' + escapeAttr(m) + '"></option>').join("");
  } catch (err) {}
});
document.getElementById("pedido-stock-modelo").addEventListener("change", () => {
  const m = document.getElementById("pedido-stock-modelo").value;
  const tallas = pedidoStockFilas.filter(r => r.stockModel === m).map(r => r.talla).sort(compareTalla);
  document.getElementById("pedido-stock-tallas").innerHTML = tallas.map(t => '<option value="' + escapeAttr(t) + '"></option>').join("");
});
document.getElementById("pedido-stock-anadir").addEventListener("click", () => {
  const stockModel = document.getElementById("pedido-stock-modelo").value.trim();
  const talla = document.getElementById("pedido-stock-talla").value.trim().toUpperCase().replace(/\\s+/g, "");
  const cantidad = Math.floor(Number(document.getElementById("pedido-stock-cantidad").value));
  if (!pedidoStockFilas.some(r => r.stockModel === stockModel)) { alert("Elige un modelo de la lista."); return; }
  if (!talla || !(cantidad > 0)) { alert("Pon la medida y las unidades."); return; }
  if (!pedidoStockFilas.some(r => r.stockModel === stockModel && r.talla === talla) && !confirm("La medida " + talla + " no existe todav\xEDa en el stock de este modelo. \xBFA\xF1adirla igualmente?")) return;
  pedidoStockLineas.push({ stockModel, talla, cantidad });
  document.getElementById("pedido-stock-talla").value = "";
  document.getElementById("pedido-stock-cantidad").value = "1";
  pintarLineasPedidoStock();
});
document.getElementById("pedido-stock-cerrar").addEventListener("click", () => document.getElementById("pedido-stock-overlay").classList.remove("open"));
document.getElementById("pedido-stock-crear").addEventListener("click", async () => {
  if (!pedidoStockLineas.length) { alert("A\xF1ade al menos una l\xEDnea."); return; }
  const total = pedidoStockLineas.reduce((n, l) => n + l.cantidad, 0);
  if (!confirm("\xBFCrear el pedido para stock a " + currentProveedorFilter.toUpperCase() + " (" + total + " colchones)? Quedar\xE1 en pendientes para meterlo en el pedido a f\xE1brica.")) return;
  const btn = document.getElementById("pedido-stock-crear");
  btn.disabled = true;
  try {
    const res = await fetch("/api/inventario/pendientes/pedido-stock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proveedor: currentProveedorFilter.toUpperCase(), lineas: pedidoStockLineas, usuario: currentUser }) });
    const d = await res.json().catch(() => ({}));
    if (!d.ok) { alert(d.error || "No se pudo crear."); return; }
    document.getElementById("pedido-stock-overlay").classList.remove("open");
    mostrarAvisoBreve("Pedido para stock creado: " + d.creados.length + " l\xEDnea(s). Ya est\xE1n en pendientes.");
    loadPendientes();
  } finally {
    btn.disabled = false;
  }
});
function preferenteTag(b) {
  return esPreferenteSequra(b) ? '<span class="preferente-tag" title="Pagado con seQura: no cobramos hasta enviarlo. Sale como PREFERENTE en el pedido a f\xE1brica.">\u26A1 PREFERENTE (seQura)</span>' : "";
}
function valdemoroTag(o) {
  return esValdemoro(o) ? '<span class="valdemoro-tag" title="Entrega en Valdemoro: \xBFlo llevamos nosotros en vez de Furniture/SEUR?">\u{1F4CD} VALDEMORO \u2014 \xBFlo entregamos nosotros?</span>' : "";
}

// Misma referencia de f\xE1brica en pedidos distintos (Jennifer, 2026-09-30:
// MB251FUR se puso por error a BEZEN12188 y BEZEN12178 \u2014 "estar\xEDa bien poner
// una se\xF1al de advertencia para que lo vea cuando venga esa referencia de
// f\xE1brica"). Dentro del mismo pedido (dos canap\xE9s iguales) no avisa.
function avisoRefDuplicada(b) {
  const ref = (b.referencia || "").trim().toUpperCase();
  if (!ref) return "";
  const otros = backorders.filter(x => x.id !== b.id && x.orderNumber !== b.orderNumber
    && (x.referencia || "").trim().toUpperCase() === ref && x.estado !== "cancelado" && x.estado !== "servido");
  if (!otros.length) return "";
  const texto = otros.map(x => refLabel(x) + (x.refSuffix || "") + " (" + x.talla + (x.color ? " " + x.color : "") + ")").join(", ");
  return ' <span class="ref-duplicada" title="Dos pedidos distintos comparten esta referencia de f\xE1brica: al llegar, mira la medida para saber de cu\xE1l es">\u26A0 ' + escapeAttr(ref) + " tambi\xE9n en " + escapeAttr(texto) + "</span>";
}

function furnitureRowCells(o) {
  const grupo = pedidosDelGrupo(o);
  const items = grupo.flatMap(p => backordersPorPedido(p.id));
  const refDeOtroPedido = b => b.orderId !== o.id ? '<span class="grupo-envio-item-ref">' + refLabel(allOrders.find(p => p.id === b.orderId) || {}) + '</span> ' : "";
  const productoGrupo = grupo.length > 1
    ? grupo.map(p => (p.id !== o.id ? '<span class="grupo-envio-item-ref">' + refLabel(p) + '</span> ' : "") + p.product).join("<br>")
    : o.product;
  const serviciosGrupo = grupo.map(p => p.services).filter(Boolean).join(" \xB7 ");
  const todoJunto = pedidoQuiereTodoJunto(o);
  const itemsHtml = items.length
    ? items.map(b => {
        // Colch\xF3n marcado FPK (Jennifer, 2026-08-27, ampliado 2026-09-25 a
        // colch\xF3n suelto adem\xE1s de pack): por defecto sale independiente
        // por SEUR, sin esperar a la tapicer\xEDa \u2014 pero se sigue mostrando
        // aqu\xED (en vez de ocultarlo) para que quede claro que ese pedido lo
        // tiene, por si al final coincide con la tapicer\xEDa y le interesa
        // mandarlo junto en la carga.
        const deStock = b.tipo === "colchon" && b.estado === "cubierto" && String(b.id).endsWith("-cubierto");
        const esFpk = !deStock && b.tipo === "colchon" && b.tipoEnvio === "FPK";
        return \`
        <label class="furniture-item-check\${esFpk ? " furniture-item-fpk" : ""}">
          <input type="checkbox" class="item-recibido-check" data-id="\${b.id}"\${b.recibidoFabrica ? " checked" : ""}>
          \${refDeOtroPedido(b)}\${b.referencia ? b.referencia + avisoRefDuplicada(b) + " \u2014 " : ""}\${b.cantidad}x \${b.stockModel}\${b.talla ? " (" + b.talla + ")" : ""}\${esFpk ? ' <span class="fpk-tag">FPK \xB7 en ' + b.proveedor + ', sale independiente</span>' : ""}\${deStock ?' <span class="pedido-generado-tag">\u2713 Descontado de stock</span>' : ""}\${b.transformadoDesde ? ' <span class="transformado-tag" title="Transformado de un ' + b.transformadoDesde + ' que hab\xEDa en stock">\u{1F527} Subido a transformar (desde ' + b.transformadoDesde + (b.fechaTransformacion ? ", " + new Date(b.fechaTransformacion).toLocaleDateString("es-ES") : "") + ')</span>' : ""}\${b.desdeAbierto ? ' <span class="abierto-tag">\u{1F7E3} Sale de un colch\xF3n ABIERTO</span>' : ""}
        </label>\${todoJunto && b.tipo === "colchon" ? '<div class="todo-junto-tag">Ha solicitado enviarlo todo junto \u2014 NO SACAR POR SEPARADO</div>' : ""}\${reservaAlmacenHtml(b)}\${items.length > 1 ? \`<button type="button" class="envio-aparte-btn" data-envio-aparte="\${escapeAttr(b.id)}" data-aparte="1" title="Sacar este art\xEDculo del env\xEDo: se queda pendiente como l\xEDnea propia con la referencia terminada en 2">Enviar aparte</button>\` : ""}\${abiertoTagHtml(b)}
      \`;
      }).join("")
    : "<em>Todo en stock</em>";
  return \`
    <td>\${refLabel(o)}\${grupoEnvioTag(o)}\${valdemoroTag(o)}\${casoTag(o)}\${direccionButton(o)}\${soloFaltanAlmohadas(items.filter(b => !(b.tipo === "colchon" && b.tipoEnvio === "FPK"))) ? '<div class="todo-junto-tag" style="margin-left:0">Solo faltan las almohadas</div>' : ""}</td>
    <td>\${o.platform || "Shopify"}</td>
    <td>\${o.name}</td>
    <td>\${productoGrupo}</td>
    <td class="services">\${serviciosGrupo}</td>
    <td class="furniture-items-cell">\${itemsHtml}</td>
    <td><input type="text" class="notas-input" data-id="\${o.id}" value="\${escapeAttr(o.notas)}" placeholder="Notas..."></td>
  \`;
}

// L\xEDnea independiente para una reposici\xF3n de pieza rota (Jennifer,
// 2026-09-21): "tengo que poder sacarlo de manera independiente" \u2014 no
// depende de si el resto del pedido original ya se envi\xF3 o est\xE1 en otra
// carga, absorbe el nombre/direcci\xF3n/tel\xE9fono del pedido original pero
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
    ? "\xBFEnviar aparte " + b.cantidad + "x " + b.stockModel + " (" + b.talla + ") de " + refLabel(o) + "?\\n\\nSale de este env\xEDo y se queda pendiente como l\xEDnea propia con la referencia " + refLabel(o) + ((b.refSuffix ? Number(b.refSuffix) + 1 : 2)) + ", para a\xF1adirla a una carga cuando quieras."
    : "\xBFVolver a juntar " + b.stockModel + " (" + b.talla + ") con el resto de " + refLabel(o) + "?")) return;
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
    // Art\xEDculo enviado aparte (Jennifer, 2026-09-29): referencia del
    // pedido terminada en su sufijo ("\u20262") y opci\xF3n de volver a juntarlo.
    return \`
    <td>\${refLabel(o.id ? o : b)}\${b.refSuffix || ""}<span class="envio-aparte-tag">ENV\xCDO APARTE</span>\${valdemoroTag(o)}</td>
    <td>\${o.platform || "Shopify"}</td>
    <td>\${o.name || ""}</td>
    <td>\${b.cantidad}x \${b.stockModel}\${b.talla ? " (" + b.talla + ")" : ""}\${b.color ? " " + escapeAttr(b.color) : ""}</td>
    <td class="services">\${o.services || ""}</td>
    <td class="furniture-items-cell">
      <label class="furniture-item-check">
        <input type="checkbox" class="item-recibido-check" data-id="\${b.id}"\${b.recibidoFabrica ? " checked" : ""}>
        \${b.referencia ? b.referencia + " \u2014 " : ""}\${b.cantidad}x \${b.stockModel}\${b.talla ? " (" + b.talla + ")" : ""}
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
        \${b.referencia ? b.referencia + " \u2014 " : ""}1x \${b.stockModel}\${b.talla ? " (" + b.talla + ")" : ""}
      </label>
      \${b.piezaTexto ? '<div class="reposicion-tag">REPOSICI\xD3N' + (b.cambio ? " POR CAMBIO (antes: " + escapeAttr(b.cambio.de || "") + ")" : "") + ': ' + escapeAttr(b.piezaTexto) + '</div>' : ""}
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
  // Todo lo que est\xE1 en la carga abierta se ve en ella, aunque en Shopify ya
  // figure como enviado (Jennifer, 2026-09-29, caso BEZEN12194: marcado como
  // enviado en el sistema antiguo pero sale en esta carga).
  const enCarga = cargaAbierta
    ? // Un pedido "gestionado por otra v\xEDa" que S\xCD se ha metido en una carga
    // nuestra se ve en ella (Jennifer, 2026-10-08, LM 002-26262L40115-A).
    allOrders.filter(o => o.agencia === "FURNITURE" && o.cargaId === cargaAbierta.id && !esMiembroSecundario(o))
    : [];
  const busquedaPedido = document.getElementById("furniture-pedido-search").value.trim().toLowerCase();
  const busquedaReferencia = document.getElementById("furniture-referencia-search").value.trim().toLowerCase();
  // Al rev\xE9s que Polival: aqu\xED Jennifer quiere los m\xE1s antiguos arriba, para
  // detectar de un vistazo los pedidos m\xE1s retrasados y atenderlos primero
  // (2026-09-16). allOrders llega del backend ya ordenado m\xE1s reciente
  // primero, as\xED que aqu\xED se invierte. Se ordena por FECHA real
  // (parseFechaGenerica), no por orderNumber \u2014 mismo fallo real que en
  // Proveedores pendientes (Jennifer, 2026-09-21): un orderNumber de
  // marketplace no es un correlativo cronol\xF3gico.
  const pendientes = todasFurniture.filter(o => {
    if (o.cargaId) return false;
    if (retencionDe(o)) return false; // van en su propio recuadro
    // Mismo arreglo que en Proveedores pendientes (Jennifer, 2026-09-21):
    // buscar por la referencia real del marketplace, no solo BEZEN+n\xFAmero.
    // En un env\xEDo conjunto se busca en todos sus pedidos (la l\xEDnea es una).
    const grupo = pedidosDelGrupo(o);
    if (busquedaPedido) {
      const encaja = grupo.some(p => ("bezen" + p.orderNumber).toLowerCase().includes(busquedaPedido)
        || (p.orderRef || "").toLowerCase().includes(busquedaPedido));
      if (!encaja) return false;
    }
    if (busquedaReferencia && !grupo.some(p => referenciasPorPedido(p.id).toLowerCase().includes(busquedaReferencia))) return false;
    return true;
  }).sort((a, b) => parseFechaGenerica(a.orderDate) - parseFechaGenerica(b.orderDate));

  // Reposiciones de pieza rota (Jennifer, 2026-09-21): l\xEDnea independiente
  // del resto del pedido, con su propia carga (backorder.cargaId, no
  // order.cargaId) \u2014 as\xED se pueden sacar/a\xF1adir sin tocar el estado del
  // pedido original, est\xE9 o no ya enviado. Una reposici\xF3n de COLCH\xD3N por
  // SEUR (Jennifer, 2026-09-22) NO entra aqu\xED \u2014 esa va por Luso/New +
  // "Preparar para SEUR", nunca por esta l\xEDnea de Furniture.
  const esRepoColchonSeur = b => b.tipo === "colchon" && b.agenciaReposicion === "SEUR";
  // Los art\xEDculos "enviados aparte" (Jennifer, 2026-09-29) van por este
  // mismo camino que las reposiciones: l\xEDnea propia, su propia carga.
  const esLineaPropia = b => (b.reposicion && b.estado === "pendiente" && !esRepoColchonSeur(b))
    || (b.envioAparte && (b.estado === "pendiente" || b.estado === "cubierto"));
  const reposicionesEnCarga = cargaAbierta ? backorders.filter(b => esLineaPropia(b) && b.cargaId === cargaAbierta.id) : [];
  const reposicionesPendientes = backorders.filter(b => esLineaPropia(b) && !b.cargaId).filter(b => {
    if (!busquedaPedido) return true;
    // refLabel(b) ya incluye el prefijo "REP" (Jennifer, 2026-09-21) \u2014
    // buscar solo bezen+n\xFAmero/orderRef no lo encontraba si se escrib\xEDa
    // "REP" o la referencia completa con REP delante.
    return (refLabel(b) + (b.refSuffix || "")).toLowerCase().includes(busquedaPedido);
  }).sort((a, b) => parseFechaGenerica(a.fecha) - parseFechaGenerica(b.fecha));

  document.getElementById("carga-abierta-count").textContent = (enCarga.length + reposicionesEnCarga.length) + " pedidos en esta carga";
  document.querySelector("#carga-abierta-table tbody").innerHTML = enCarga.map(o => \`
    <tr\${o.cancelado ? ' class="fila-cancelada"' : ""}>
      <td><input type="checkbox" class="sel-envio-fur" data-keys="\${escapeAttr(pedidosDelGrupo(o).map(p => "o:" + p.id).join(","))}" /></td>
      \${furnitureRowCells(o)}
      <td><button type="button" class="sacar-carga-btn" data-id="\${o.id}">Sacar de la carga</button>\${moverFurnitureHtml('data-order-id="' + o.id + '"')}</td>
    </tr>
  \`).join("") + reposicionesEnCarga.map(b => \`
    <tr>
      <td><input type="checkbox" class="sel-envio-fur" data-keys="\${escapeAttr("b:" + b.id)}" /></td>
      \${reposicionRowCells(b)}
      <td><button type="button" class="sacar-carga-reposicion-btn" data-repo-id="\${b.id}">Sacar de la carga</button>\${moverFurnitureHtml('data-backorder-id="' + escapeAttr(b.id) + '"')}</td>
    </tr>
  \`).join("");
  document.getElementById("sel-todos-furniture").checked = false;
  etiquetaDescargaFurniture();
  document.querySelectorAll(".sel-envio-fur").forEach(chk => chk.addEventListener("change", etiquetaDescargaFurniture));
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
      // Env\xEDo conjunto: sale el grupo entero de la carga.
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
        \${!o.cargaId && !o.cancelado ? \`<button type="button" class="anadir-carga-tener-btn" data-id="\${o.id}">A\xF1adir a la carga</button>\` : ""}
        <button type="button" class="quitar-tener-en-cuenta-btn" data-id="\${o.id}">Quitar</button>
      </td>
    </tr>
  \`).join("");
  document.querySelectorAll(".quitar-tener-en-cuenta-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await fetch("/api/pedidos/shopify/meta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: idPedido(btn.dataset.id), paraTenerEnCuenta: false }),
      });
      const order = allOrders.find(o => String(o.id) === btn.dataset.id);
      if (order) order.paraTenerEnCuenta = false;
      renderFurniture();
    });
  });
  document.querySelectorAll(".anadir-carga-tener-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = idPedido(btn.dataset.id);
      // A\xF1adir manualmente desde "para tener en cuenta" (Jennifer,
      // 2026-09-18: "no tengo opci\xF3n de a\xF1adirlo a la carga") \u2014 una vez en
      // la carga ya no hace falta seguir teni\xE9ndolo a golpe de vista aqu\xED.
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

  document.getElementById("furniture-pendientes-count").textContent = (pendientes.length + reposicionesPendientes.length) + " pedidos pendientes de env\xEDo por Furniture";
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
      const id = idPedido(chk.dataset.id);
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
      if (chk.checked && b) await checkAutoAddEnvioAparte(b.id);
      renderFurniture();
    });
  });

  document.querySelectorAll("#view-furniture .notas-input").forEach(inp => {
    inp.addEventListener("focus", () => { editing = true; });
    inp.addEventListener("blur", () => {
      editing = false;
      const order = allOrders.find(o => o.id === idPedido(inp.dataset.id));
      if (order) order.notas = inp.value;
      saveMeta(inp.dataset.id, { notas: inp.value });
    });
  });
}

// Pedidos retenidos a petici\xF3n del cliente (Jennifer, 2026-09-30): "habr\xEDa
// que habilitar una casilla donde pongamos RETENIDO A FALTA DE QUE EL
// CLIENTE DIGA QUE SE ENV\xCDE... o bien, si el cliente ya da una fecha a un
// mes vista, poderlo meter en la carga que queramos". order.retenido =
// { hasta: "AAAA-MM-DD" | null }. En un env\xEDo conjunto basta con que uno
// del grupo est\xE9 retenido.
function retencionDe(o) {
  const p = o && pedidosDelGrupo(o).find(x => x.retenido);
  return p ? p.retenido : null;
}
function todoRecibidoFurniture(o) {
  const items = pedidosDelGrupo(o).filter(p => !p.cancelado).flatMap(p => backordersPorPedido(p.id))
    .filter(i => !(i.tipo === "colchon" && i.tipoEnvio === "FPK") && !esTopperSeur(i));
  return items.length > 0 && items.every(i => i.recibidoFabrica);
}
function fechaCortaEs(f) {
  return new Date(f + "T00:00:00").toLocaleDateString("es-ES");
}
// \xBFLe toca ya salir? Solo con fecha: la primera carga de Furniture abierta de
// ese d\xEDa o posterior (con las 2 pr\xF3ximas siempre abiertas, un retenido
// para una fecha cercana entra ya en la carga de su d\xEDa).
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
    ? retenidos.length + " pedido(s) retenidos. No suben solos a la carga hasta que el cliente d\xE9 luz verde o llegue su fecha."
    : "No hay pedidos retenidos.";
  document.querySelector("#retenidos-table tbody").innerHTML = retenidos.map(o => {
    const r = retencionDe(o);
    const listo = todoRecibidoFurniture(o);
    const toca = retencionCumplida(o);
    const retTxt = (r.hasta ? "Enviar en la carga del " + fechaCortaEs(r.hasta) + " o la siguiente" : "Sin fecha: a falta de luz verde del cliente")
      + '<br><span class="' + (listo ? "retenido-listo" : "retenido-falta") + '">' + (listo ? "\u2713 Todo en stock" : "Falta mercanc\xEDa") + "</span>"
      + (toca ? '<br><span class="retenido-toca">TOCA EN ESTA CARGA</span>' : "");
    return '<tr' + (o.cancelado ? ' class="fila-cancelada"' : "") + ">" + furnitureRowCells(o)
      + "<td>" + retTxt + "</td><td>"
      + '<button type="button" class="luz-verde-btn" data-id="' + o.id + '">Luz verde: a la carga</button> '
      + '<button type="button" class="secondary cambiar-retencion-btn" data-id="' + o.id + '">Cambiar</button> '
      + '<button type="button" class="secondary quitar-retencion-btn" data-id="' + o.id + '">Quitar retenci\xF3n</button>'
      + "</td></tr>";
  }).join("");
  document.querySelectorAll(".luz-verde-btn").forEach(btn => btn.addEventListener("click", async () => {
    const o = allOrders.find(x => String(x.id) === btn.dataset.id);
    if (!o) return;
    if (todoRecibidoFurniture(o)) {
      if (!confirm("\xBFEl cliente da luz verde? " + refLabel(o) + " entra ahora en la carga de Furniture.")) return;
      await guardarRetencion([o.id], null);
      await anadirPedidosACarga([o.id]);
    } else {
      if (!confirm(refLabel(o) + " todav\xEDa no tiene toda la mercanc\xEDa. Se quita la retenci\xF3n y subir\xE1 solo a la carga cuando llegue todo. \xBFSeguir?")) return;
      await guardarRetencion([o.id], null);
    }
    renderFurniture();
  }));
  document.querySelectorAll(".quitar-retencion-btn").forEach(btn => btn.addEventListener("click", async () => {
    await guardarRetencion([idPedido(btn.dataset.id)], null);
    renderFurniture();
  }));
  document.querySelectorAll(".cambiar-retencion-btn").forEach(btn => btn.addEventListener("click", () => abrirModalRetener([idPedido(btn.dataset.id)])));
}
// Con fecha: al abrir Furniture, lo que ya toca y est\xE1 todo recibido entra
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
  // "Tener en cuenta" no aplica a reposiciones (Jennifer no lo ha pedido) \u2014
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

// cargaId opcional (Jennifer, 2026-09-30): sin \xE9l va a la carga de
// Furniture m\xE1s pr\xF3xima (subidas autom\xE1ticas); el bot\xF3n "A\xF1adir a la carga"
// manda la de la pesta\xF1a elegida.
async function anadirPedidosACarga(orderIds, cargaId) {
  // Un pedido de un env\xEDo conjunto nunca entra solo: arrastra a su grupo.
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
// carga independiente (backorder.cargaId) \u2014 si no hay carga abierta
// todav\xEDa, se crea/reusa la misma que usar\xEDan los pedidos normales
// (anadirPedidosACarga con orderIds vac\xEDo ya la crea sin tocar ning\xFAn
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

// Listado para el almac\xE9n (Jennifer, 2026-09-29): Excel imprimible con solo
// pedido, referencia de f\xE1brica, producto, unidades y montaje.
async function descargarListadoAlmacen(cargaId) {
  const res = await fetch("/api/cargas/almacen?cargaId=" + encodeURIComponent(cargaId));
  if (!res.ok) { alert("No se pudo sacar el listado: " + await res.text()); return; }
  const { carga, filas } = await res.json();
  const ExcelJS = await cargarExcelJs();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Almac\xE9n", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });
  const TAM = 13;
  const anchos = [16, 13, 52, 7, 11, 18];
  ws.columns = anchos.map(width => ({ width }));
  ws.getCell("A1").value = "Carga Furniture \u2014 " + formatCargaTitulo(carga);
  ws.getCell("A1").font = { bold: true, size: 18 };
  ws.getCell("A2").value = filas.length + " art\xEDculos \xB7 " + new Set(filas.map(f => f.pedido)).size + " pedidos";
  ws.getCell("A2").font = { size: 12 };
  ws.addRow([]);
  const borde = { style: "thin", color: { argb: "FF999999" } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };
  const cabecera = ws.addRow(["Pedido", "Ref. f\xE1brica", "Producto", "Uds", "Montaje", "Reserva"]);
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
    const row = ws.addRow([f.pedido, f.referencia, f.producto, f.cantidad, f.montaje ? "S\xCD" : "NO", reserva]);
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

// Listado para el almac\xE9n de una carga de SEUR (Jennifer, 2026-10-01): qu\xE9
// sale y de d\xF3nde (STOCK / RECIBIDO HOY / APARTADO), para que lo busquen en
// el sitio correcto.
async function descargarListadoAlmacenSeur(cargaId) {
  const res = await fetch("/api/cargas/seur/almacen?cargaId=" + encodeURIComponent(cargaId));
  if (!res.ok) { alert("No se pudo sacar el listado: " + await res.text()); return; }
  const { carga, filas } = await res.json();
  const ExcelJS = await cargarExcelJs();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Almac\xE9n SEUR", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });
  const TAM = 13;
  const anchos = [20, 46, 7, 28];
  ws.columns = anchos.map(width => ({ width }));
  ws.getCell("A1").value = "Carga SEUR \u2014 " + formatSeurCargaTitulo(carga);
  ws.getCell("A1").font = { bold: true, size: 18 };
  ws.getCell("A2").value = filas.reduce((n, f) => n + f.cantidad, 0) + " bultos \xB7 " + new Set(filas.map(f => f.pedido)).size + " env\xEDos";
  ws.getCell("A2").font = { size: 12 };
  ws.addRow([]);
  const borde = { style: "thin", color: { argb: "FF999999" } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };
  const cabecera = ws.addRow(["Pedido", "Producto", "Uds", "De d\xF3nde sale"]);
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
  if (!confirm("\xBFEnviar al email del almac\xE9n el resumen de " + btn.dataset.titulo + " (etiqueta 15\xD710)?")) return;
  btn.disabled = true;
  try {
    const res = await fetch("/api/cargas/seur/almacen-email?cargaId=" + encodeURIComponent(btn.dataset.id), { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (d.ok) alert("Resumen enviado al almac\xE9n.");
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

// Descargar solo los env\xEDos marcados (Jennifer, 2026-10-09); sin marcar
// nada, la carga entera.
function etiquetaDescargaFurniture() {
  const n = document.querySelectorAll(".sel-envio-fur:checked").length;
  document.getElementById("descargar-carga-btn").textContent = n ? "Descargar Excel Furniture (" + n + " marcado" + (n > 1 ? "s" : "") + ")" : "Descargar Excel Furniture";
}
document.getElementById("sel-todos-furniture").addEventListener("change", e => {
  document.querySelectorAll("#carga-abierta-table tbody tr").forEach(tr => { if (tr.style.display !== "none") { const c = tr.querySelector(".sel-envio-fur"); if (c) c.checked = e.target.checked; } });
  etiquetaDescargaFurniture();
});
document.getElementById("descargar-carga-btn").addEventListener("click", () => {
  if (!cargaAbierta) return;
  const sel = [...document.querySelectorAll(".sel-envio-fur:checked")].flatMap(c => c.dataset.keys.split(","));
  window.location.href = "/api/cargas/export?cargaId=" + encodeURIComponent(cargaAbierta.id) + (sel.length ? "&sel=" + encodeURIComponent(sel.join(",")) : "");
});

document.getElementById("cerrar-carga-btn").addEventListener("click", async () => {
  if (!cargaAbierta) return;
  if (!confirm("\xBFCerrar " + formatCargaTitulo(cargaAbierta) + "? Pasar\xE1 al historial de cargas.")) return;
  await fetch("/api/cargas/close", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cargaId: cargaAbierta.id }),
  });
  // Al cerrar se abre sola la siguiente de mi\xE9rcoles/viernes (servidor).
  cargaAbierta = null;
  cargaFurnitureElegidaId = null;
  await loadFurniture();
});

// Seguimiento de Furniture (Jennifer, 2026-09-16): sube a diario el
// "Listado de Notas" que descarga de la web de Furniture (fichero .xls que
// en realidad es una tabla HTML de una sola hoja) \u2014 se lee tal cual con
// DOMParser, sin depender de dependencias npm. La acumulaci\xF3n por albar\xE1n
// (no reemplazo entero) vive en el backend, ver /orders/tracking-import en
// orders-store.js.
const BEZEN_NUM_RE = /BEZEN0*([0-9]+)/i;
// Carrefour/Maison/Worten/Conforama dentro de estos ficheros (Jennifer,
// 2026-09-19, ampliado 2026-09-21): usan su propia referencia real, sin
// prefijo BEZEN. Algunas (Conforama ES, ej. "MP6172617500191839-A") llevan
// letras pegadas a los d\xEDgitos, as\xED que ya no vale un patr\xF3n con \b (no
// hay l\xEDmite de palabra entre una letra y un d\xEDgito) \u2014 se cogen
// simplemente TODOS los d\xEDgitos del texto (se ignoran letras/guiones) y se
// quedan los \xFAltimos 15, igual que referenceDigits() en el servidor, para
// que el n\xFAmero calculado aqu\xED coincida con el que se guard\xF3 al importar
// el pedido.
// Un pedido SEUR con colchones sueltos que se divide en dos env\xEDos a\xF1ade
// un sufijo num\xE9rico pegado sin separador a la referencia (refSuffix "2",
// "3"... ver seurRefSuffix/nextRefSuffix en inventory-store.js) \u2014 ej. el
// pedido BEZEN11996 con sufijo "2" se manda a SEUR como "BEZEN119962". Al
// releer el fichero de seguimiento de SEUR, el n\xFAmero completo de d\xEDgitos
// ("119962") no es ning\xFAn pedido real, as\xED que si no coincide con ninguno
// se prueba a recortar 1 o 2 d\xEDgitos del final (el sufijo) hasta encontrar
// un n\xFAmero que S\xCD sea un pedido conocido \u2014 as\xED el seguimiento se aplica
// al pedido correcto en vez de descartarse en silencio como "sin pedido"
// (Jennifer, 2026-09-24: "no ha machacado la informaci\xF3n del env\xEDo
// anterior", el fichero nunca lleg\xF3 a tocar el pedido).
function resolveKnownOrderNumber(digitsStr, knownOrderNumbers) {
  const full = Number(digitsStr);
  if (!knownOrderNumbers || knownOrderNumbers.has(full)) return full || null;
  for (const cut of [1, 2]) {
    if (digitsStr.length <= cut) break;
    const candidato = Number(digitsStr.slice(0, digitsStr.length - cut));
    if (knownOrderNumbers.has(candidato)) return candidato;
  }
  // Referencia recortada POR DELANTE para que quepa en 15 caracteres
  // (Jennifer, 2026-10-07, REP6236L38574-A = reposici\xF3n de Leroy Merlin
  // 002-26236L38574-A, pedido 22623638574): al poner "REP"/"GC" delante se
  // pierden los primeros d\xEDgitos, as\xED que el n\xFAmero no es ning\xFAn pedido.
  // Se busca el pedido cuyo n\xFAmero TERMINA en esos d\xEDgitos (con y sin el
  // sufijo de env\xEDo), solo si hay uno y solo uno.
  for (const cut of [0, 1, 2]) {
    if (digitsStr.length - cut < 6) break;
    const cola = digitsStr.slice(0, digitsStr.length - cut);
    const coinciden = [...knownOrderNumbers].filter((n) => String(n).endsWith(cola));
    if (coinciden.length === 1) return coinciden[0];
  }
  return full || null;
}
function extractTrackingOrderNumber(text, knownOrderNumbers) {
  const t = (text || "").trim();
  const bezen = t.match(BEZEN_NUM_RE);
  if (bezen) return resolveKnownOrderNumber(bezen[1], knownOrderNumbers);
  // Mismo orden de operaciones que referenceDigits() en el servidor:
  // recortar primero a los \xFAltimos 15 caracteres, luego quitar letras \u2014
  // as\xED coincide con lo que trunca SEUR (ver esa funci\xF3n para el porqu\xE9).
  const truncado = t.slice(-15);
  // Doble barra: est\xE1 dentro de renderPage y una sola se perd\xEDa (sal\xEDa
  // /D/g), as\xED que no casaban las referencias de Leroy Merlin ni las que
  // llevan sufijo (\u2026-A2) \u2014 Jennifer, 2026-10-02.
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
  update_tracking_error: "Shopify no dej\xF3 actualizar el seguimiento del env\xEDo que ya exist\xEDa",
  fulfillment_create_error: "Shopify no dej\xF3 marcar el pedido como enviado",
  sin_fulfillment_order_abierto: "En Shopify el pedido no tiene nada pendiente de enviar (\xBFya marcado como enviado a mano?)",
  sin_fulfillment_previo_guardado: "El pedido ya estaba enviado en Shopify, pero no tenemos guardado ese env\xEDo para a\xF1adirle el seguimiento",
  fulfillment_orders_error: "No se pudo leer el pedido en Shopify",
};
function construirFilasReporteFurniture(sinMatchDetalle, data) {
  const filas = [];
  const errores = (data.shopify && data.shopify.errores) || [];
  for (const r of errores) {
    const pedido = allOrders.find(o => o.orderNumber === r.orderNumber);
    filas.push({ Estado: "ERROR AL ENVIAR A SHOPIFY", "Albar\xE1n": r.albaran || "", "N\xBA Pedido": r.orderNumber, Cliente: pedido ? pedido.name : "",
      Motivo: MOTIVOS_SHOPIFY[r.reason] || r.reason || "", "Detalle de Shopify": r.detail || "" });
  }
  for (const a of sinMatchDetalle || []) {
    filas.push({ Estado: "SIN REFERENCIA RECONOCIBLE", "Albar\xE1n": a, "N\xBA Pedido": "", Cliente: "", Motivo: "No se pudo sacar ning\xFAn n\xFAmero de pedido de este albar\xE1n", "Detalle de Shopify": "" });
  }
  for (const r of data.sinPedidoDetalle || []) {
    filas.push({ Estado: "SIN PEDIDO CORRESPONDIENTE", "Albar\xE1n": r.albaran, "N\xBA Pedido": r.orderNumberDetectado ?? "", Cliente: "", Motivo: "No existe ning\xFAn pedido con ese n\xFAmero en el sistema", "Detalle de Shopify": "" });
  }
  for (const r of data.actualizadosDetalle || []) {
    if (errores.some(x => x.orderNumber === r.orderNumber && x.albaran === r.albaran)) continue;
    filas.push({ Estado: "ACTUALIZADO", "Albar\xE1n": r.albaran, "N\xBA Pedido": r.orderNumber, Cliente: r.nombre || "", Motivo: (r.nuevo ? "Env\xEDo nuevo" : "Actualizaci\xF3n de un env\xEDo ya conocido") + (r.estado ? " \xB7 " + r.estado : ""), "Detalle de Shopify": "" });
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
    statusEl.textContent = "No se reconoci\xF3 ninguna referencia de pedido en el archivo.";
    return;
  }
  statusEl.textContent = "Subiendo " + entries.length + " filas...";
  const res = await fetch("/api/furniture/tracking-import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  const data = await res.json();
  let msg = data.actualizados + " pedidos actualizados" + (sinMatch ? " \xB7 " + sinMatch + " filas sin referencia reconocible" : "") + (data.sinPedido ? " \xB7 " + data.sinPedido + " albaranes sin pedido correspondiente" : "");
  if (data.shopify && data.shopify.activo) {
    msg += " \xB7 " + data.shopify.enviados + " enviados a Shopify";
    if (data.shopify.errores && data.shopify.errores.length) msg += " \xB7 " + data.shopify.errores.length + " con error al enviar a Shopify";
  }
  statusEl.textContent = msg;
  ultimoReporteFurniture = construirFilasReporteFurniture(sinMatchDetalle, data);
  reportBtn.style.display = ultimoReporteFurniture.length ? "" : "none";
  await loadOrders();
});

// Seguimiento de SEUR (Jennifer, 2026-09-16): sube a diario el .xlsx real
// que descarga de SEUR ("Envios_todos") \u2014 a diferencia del de Furniture, es
// un solo fichero binario, as\xED que se lee con la librer\xEDa xlsx (CDN) en vez
// de DOMParser. La columna que le importa para el estado es "DESCRIPCION
// SITUACION" (columna AJ). Por ahora se ignoran las filas sin "BEZEN" en la
// referencia (otras plataformas/clientes) \u2014 Jennifer confirm\xF3 que se
// tendr\xE1n en cuenta m\xE1s adelante cuando configure esos otros clientes, no
// es un fallo del parseo.
// Enlace de seguimiento de SEUR (dictado por Jennifer, 2026-09-16, con
// ejemplo real verificado \u2014 BEZEN119143 -> n\xBA expedici\xF3n 4156186 ->
// https://www.seur.com/miseur/mis-envios?tracking=4156186): la base es
// siempre "https://www.seur.com/miseur/mis-envios?tracking=", y el n\xFAmero
// que se a\xF1ade depende de si el env\xEDo es nacional o internacional seg\xFAn la
// cuenta usada (columna T, "CCC CUENTA" \u2014 mismo c\xF3digo 63235/48297 que ya
// se usa en la exportaci\xF3n a SEUR, ver referenciaSeur/CODREMITENTE):
// nacional (63235) -> n\xFAmero de expedici\xF3n (columna C); internacional
// (48297) -> "parcel number" (columna L, suele empezar por "07"). Un mismo
// env\xEDo con varios bultos puede traer varios "parcel number" separados por
// ";" \u2014 se usa solo el primero para el enlace.
const SEUR_TRACKING_BASE = "https://www.seur.com/miseur/mis-envios?tracking=";
// Las fechas de este fichero a veces llegan como n\xFAmero de serie de Excel
// crudo (ej. "46270.441...") en vez de formateadas, seg\xFAn si la celda ten\xEDa
// o no formato de fecha aplicado en origen \u2014 se convierte a mano por si
// acaso, con el mismo c\xE1lculo que usa Excel (d\xEDa 0 = 1899-12-30).
function excelSerialToFecha(v) {
  const s = String(v || "").trim();
  if (!/^d+(.d+)?$/.test(s)) return s;
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
    // Columna AR: trae el SKU de lo que va en ese env\xEDo concreto (ej.
    // "ALMANT90 - SOLO TRANSPORTE", "COLTOSD80X180") \u2014 Jennifer,
    // 2026-09-16: con esto se puede saber qu\xE9 art\xEDculo concreto de un
    // pedido con varios productos sueltos se ha enviado.
    infoAdicional: header.indexOf("INFORMACI\xD3N ADICIONAL") >= 0 ? header.indexOf("INFORMACI\xD3N ADICIONAL") : header.findIndex(h => h.includes("ADICIONAL")),
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
// Reporte descargable de la \xFAltima subida de SEUR (Jennifer, 2026-09-24:
// "necesito... revisar cuales son los pedidos que est\xE1n teniendo esos
// problemas" \u2014 el resumen de texto solo daba contadores, no permit\xEDa ver
// CU\xC1LES eran los pedidos concretos de cada categor\xEDa). Se guarda en esta
// variable tras cada subida y se genera el .xlsx solo al pulsar el bot\xF3n
// (con SheetJS, ya cargado en la p\xE1gina para leer los ficheros de origen).
let ultimoReporteSeur = null;
function construirFilasReporteSeur(sinMatchDetalle, data) {
  const filas = [];
  for (const r of sinMatchDetalle || []) {
    filas.push({ Estado: "SIN REFERENCIA RECONOCIBLE", Referencia: r.referencia, "N\xBA Pedido": "", Cliente: "", "Estado SEUR": r.estado || "", Detalle: "No se pudo extraer ning\xFAn n\xFAmero de pedido de esta referencia" });
  }
  for (const r of (data.sinPedidoDetalle || [])) {
    filas.push({ Estado: "SIN PEDIDO CORRESPONDIENTE", Referencia: r.referencia, "N\xBA Pedido": r.orderNumberDetectado ?? "", Cliente: "", "Estado SEUR": r.estadoSeur || "", Detalle: "Se detect\xF3 un n\xBA de pedido pero no existe ning\xFAn pedido as\xED en el sistema" });
  }
  for (const r of ((data.shopify && data.shopify.errores) || [])) {
    const pedido = allOrders.find(o => o.orderNumber === r.orderNumber);
    filas.push({ Estado: "ERROR AL ENVIAR A SHOPIFY", Referencia: pedido ? refLabel(pedido) : ("BEZEN" + r.orderNumber), "N\xBA Pedido": r.orderNumber, Cliente: pedido ? pedido.name : "", "Estado SEUR": "", Detalle: [r.reason, r.detail].filter(Boolean).join(": ") });
  }
  for (const r of (data.actualizadosDetalle || [])) {
    filas.push({ Estado: "ACTUALIZADO", Referencia: r.referencia, "N\xBA Pedido": r.orderNumber, Cliente: r.nombre || "", "Estado SEUR": r.estadoSeur || "", Detalle: r.nuevo ? "Env\xEDo nuevo" : "Actualizaci\xF3n de un env\xEDo ya conocido" });
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
    statusEl.textContent = "No se reconoci\xF3 ninguna referencia de pedido en el archivo.";
    return;
  }
  statusEl.textContent = "Subiendo " + entries.length + " filas...";
  const res = await fetch("/api/seur/tracking-import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  const data = await res.json();
  let msg = data.actualizados + " pedidos actualizados" + (sinMatch ? " \xB7 " + sinMatch + " filas sin referencia reconocible" : "") + (data.sinPedido ? " \xB7 " + data.sinPedido + " referencias sin pedido correspondiente" : "");
  if (data.shopify && data.shopify.activo) {
    msg += " \xB7 " + data.shopify.enviados + " enviados a Shopify";
    if (data.shopify.errores && data.shopify.errores.length) msg += " \xB7 " + data.shopify.errores.length + " con error al enviar a Shopify";
  }
  statusEl.textContent = msg;
  ultimoReporteSeur = construirFilasReporteSeur(sinMatchDetalle, data);
  reportBtn.style.display = ultimoReporteSeur.length ? "" : "none";
  await loadOrders();
  // El bot\xF3n est\xE1 en "Env\xEDos SEUR": se refresca la lista con los estados nuevos.
  await loadCasosRevisarSeur();
});

// Ficheros de "marketplace" tipo Mirakl Connect (Carrefour, Fase 1,
// Jennifer 2026-09-16/17; generalizado 2026-09-19 al a\xF1adir Maison Du
// Monde con el mismo formato exacto de fichero \u2014 "el funcionamiento aqu\xED es
// exactamente igual que en Carrefour"): sube el fichero bruto que se
// descarga de Mirakl Connect (no una plantilla propia hecha a mano). El
// mapeo se hace SIEMPRE por nombre de columna (nunca por letra), porque
// Jennifer avis\xF3 que la posici\xF3n de las columnas puede variar de una tienda
// a otra \u2014 confirmado real: en Carrefour la direcci\xF3n empieza en AX/AY,
// en Maison Du Monde una columna de m\xE1s ("Direcci\xF3n de entrega: empresa")
// desplaza todo ese bloque una posici\xF3n a la derecha (AY/AZ). Buscar por
// nombre evita tener que tocar nada al a\xF1adir una tienda nueva con este
// mismo formato.
function parseMiraklFile(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  // La columna de importe viene con un formato de celda que deja el texto
  // formateado (.w) vac\xEDo aunque el valor num\xE9rico (.v) s\xED est\xE1 \u2014 se lee
  // aparte "en bruto" solo para esta columna (Jennifer, 2026-09-19: "no soy
  // capaz de verlo" \u2014 con raw:false sal\xEDa siempre vac\xEDo).
  const rowsRaw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  const header = rows[0].map(h => String(h).trim());
  const idx = {
    fechaCreacion: header.indexOf("Fecha de creaci\xF3n"),
    orderNumber: header.indexOf("N\xFAmero de pedido"),
    cantidad: header.indexOf("Cantidad"),
    detalles: header.indexOf("Detalles"),
    estado: header.indexOf("Estado"),
    importe: header.indexOf("Importe total del pedido con IVA (gastos de env\xEDo incluidos)"),
    // Conforama Espa\xF1a llama a esta columna "SKU de Seller" en vez de "SKU
    // de Tienda" (Jennifer, 2026-09-21) \u2014 mismo campo, nombre distinto.
    sku: header.indexOf("SKU de Tienda") >= 0 ? header.indexOf("SKU de Tienda") : header.indexOf("SKU de Seller"),
    // Respaldo (Jennifer, 2026-09-21, Conforama): "SKU de Tienda" a veces
    // trae un identificador interno del marketplace sin relaci\xF3n con
    // nuestro c\xF3digo real (igual que pasaba con Worten), mientras que "SKU
    // de la oferta" S\xCD trae el c\xF3digo real nuestro de forma fiable en
    // Conforama (verificado contra 19 pedidos reales, 19/19 coincide) \u2014 se
    // prueba como segundo intento en mapMarketplaceOrder antes de caer al
    // reconocimiento por texto.
    skuOferta: header.indexOf("SKU de la oferta"),
    email: header.indexOf("Direcci\xF3n de entrega: correo electr\xF3nico"),
    nombre: header.indexOf("Direcci\xF3n de entrega: nombre de pila"),
    apellido: header.indexOf("Direcci\xF3n de entrega: apellido"),
    calle1: header.indexOf("Direcci\xF3n de entrega: calle 1"),
    calle2: header.indexOf("Direcci\xF3n de entrega: calle 2"),
    cp: header.indexOf("Direcci\xF3n de entrega: c\xF3digo postal"),
    poblacion: header.indexOf("Direcci\xF3n de entrega: ciudad"),
    provincia: header.indexOf("Direcci\xF3n de entrega: provincia"),
    telefono: header.indexOf("Direcci\xF3n de entrega: tel\xE9fono"),
    // Ausente en el fichero de Carrefour (siempre Espa\xF1a) \u2014 si no existe la
    // columna, header.indexOf da -1 y row[-1] sale undefined sin romper
    // nada, quedando countryCode sin definir (mapMarketplaceOrder cae a
    // "ES" por defecto).
    pais: header.indexOf("Direcci\xF3n de entrega: pa\xEDs"),
    // Fecha m\xE1xima para dar el seguimiento al cliente (Jennifer, 2026-09-29).
    limiteEnvio: header.indexOf("Fecha l\xEDmite de env\xEDo"),
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
// Maison Du Monde vende a Espa\xF1a, Francia e Italia (fichero real,
// 2026-09-19: "Espagne"/"France"/"Italie" en franc\xE9s) \u2014 de momento solo
// estos 3, se ampl\xEDa si aparece alguno nuevo en un fichero futuro.
const PAIS_A_COUNTRY_CODE = {
  "espa\xF1a": "ES", "espagne": "ES", "spain": "ES",
  "francia": "FR", "france": "FR",
  "italia": "IT", "italie": "IT", "italy": "IT",
  "portugal": "PT",
};
function paisToCountryCode(pais) {
  const raw = String(pais || "").trim();
  // Worten manda ya el c\xF3digo ISO de 2 letras tal cual ("PT", "ES") en vez
  // del nombre completo del pa\xEDs como hace Maison Du Monde ("Portugal",
  // "Espagne") \u2014 Jennifer, 2026-09-19, caso real: sin esto TODOS los
  // pedidos de Worten (en su mayor\xEDa a Portugal) sal\xEDan como Espa\xF1a por
  // defecto, con el c\xF3digo de servicio de SEUR nacional en vez del
  // internacional que les corresponde.
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  const key = raw.toLowerCase();
  return PAIS_A_COUNTRY_CODE[key] || undefined;
}
// Marketplaces tipo Mirakl (Carrefour, Fase 1/2; generalizado 2026-09-19 al
// a\xF1adir Maison Du Monde con "exactamente el mismo funcionamiento que
// Carrefour"): una sola implementaci\xF3n gen\xE9rica para todos, parametrizada
// por platformId (prefijo de los ids del DOM y de las rutas /api/) \u2014
// initMarketplacePlatform() se llama una vez por tienda, m\xE1s abajo.
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
      statusEl.textContent = "No se reconoci\xF3 ning\xFAn pedido en el archivo.";
      return;
    }
    statusEl.textContent = "Subiendo " + entries.length + " pedidos...";
    const subir = forzar => fetch("/api/" + platformId + "/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries, forzar }),
    });
    let res = await subir(false);
    let data = await res.json();
    // Fichero de otra tienda (Jennifer, 2026-10-06): no se sube nada salvo
    // que confirme que es correcto.
    if (res.status === 409 && data.tiendaIncorrecta) {
      statusEl.textContent = "\u26A0 " + data.mensaje;
      if (!confirm("\u26A0 FICHERO INCORRECTO \u2014 " + data.mensaje + " \xBFQuiz\xE1 quer\xEDas subirlo en " + data.probable + "? Pulsa Cancelar para no subir nada. Pulsa Aceptar SOLO si est\xE1s segura de que es el fichero correcto y quieres subirlo igualmente.")) return;
      statusEl.textContent = "Subiendo " + entries.length + " pedidos...";
      res = await subir(true);
      data = await res.json();
    }
    statusEl.textContent = data.actualizados + " pedidos actualizados \xB7 " + data.procesados + " tramitados ahora (nuevos, con descuento de stock)" + (data.sinMatch ? " \xB7 " + data.sinMatch + " con SKU sin reconocer" : "");
    await loadMarketplacePedidos(platformId);
    loadOrders(); // refresca el aviso rojo de fecha l\xEDmite del men\xFA
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
  // referencias que NO son un correlativo cronol\xF3gico (ej. "40630979H-B"
  // puede ser num\xE9ricamente menor que pedidos bastante m\xE1s antiguos) \u2014
  // mismo fallo real ya conocido en Polival/Furniture (Jennifer,
  // 2026-09-21/25: "estos pedidos no se ordenan por n\xFAmero de pedido, sino
  // por la fecha de realizaci\xF3n"). Se reordena aqu\xED por la fecha real,
  // m\xE1s reciente primero (misma convenci\xF3n que la tabla de Shopify).
  const porLimite = document.getElementById(platformId + "-orden-limite").checked;
  // "Primero los que vencen antes" (Jennifer, 2026-09-29): los pendientes de
  // env\xEDo por fecha l\xEDmite (el m\xE1s urgente arriba), y el resto detr\xE1s.
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
    avisoEl.textContent = "\u26A0 " + sinMatch.length + " pedido(s) con SKU sin reconocer en el Cat\xE1logo \u2014 revisar: " + sinMatch.map(o => o.orderRef + " (" + o.sku + ")").join(", ");
  } else {
    avisoEl.style.display = "none";
  }
  document.querySelector("#" + platformId + "-table tbody").innerHTML = filtered.map(o => \`
    <tr\${(o.cancelado || estadoSeguimientoEspecial(o.estado) === "CANCELADO") ? ' class="fila-cancelada"' : ""}>
      <td class="bell-cell"><div class="iconos-pedido">\${cancelButton(o)}\${sustituirPedidoButton(o)}\${reposicionButton(o)}\${gestoComercialButton(o)}\${noSalioButton(o)}\${cancelarLineaButton(o)}</div></td>
      <td>\${o.orderRef}\${casoTag(o)}</td>
      <td>\${o.orderDate || ""}</td>
      <td>\${plazoEnvioCell(o)}</td>
      <td>\${o.name || ""}</td>
      <td>\${o.address || ""}\${direccionButton(o)}</td>
      <td>\${o.postalCode || ""}</td>
      <td>\${o.city || ""}</td>
      <td>\${o.province || ""}</td>
      <td>\${o.countryCode || ""}</td>
      <td>\${o.phone || ""}</td>
      <td>\${o.product || ""}\${lineasCanceladasHtml(o)}</td>
      <td>\${o.qty || 1}</td>
      <td\${o.skuMatched ? "" : ' style="color:#991b1b;font-weight:600"'}>\${o.sku || ""}\${o.skuMatched ? "" : " \u26A0"}</td>
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
      saveMeta(inp.dataset.id, { notas: inp.value });
    });
  });
  document.querySelectorAll("#" + platformId + "-table [data-cancel-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const order = orders.find(o => String(o.id) === btn.dataset.cancelId);
      if (!order) return;
      const nuevoEstado = !order.cancelado;
      if (nuevoEstado && !confirm("\xBFCancelar el pedido " + order.orderRef + "?")) return;
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

// ---- Log\xEDstica > Historial de cargas ----
// "Casos a revisar" (Jennifer, 2026-09-16): incidencias con Furniture \u2014 se
// recalculan en el backend cada vez que se abre esta pantalla (ver
// /casos-revisar en orders-store.js), no hay que marcar nada a mano: en
// cuanto Furniture actualiza el estado en una subida de seguimiento, el
// caso desaparece solo.
// Nota de seguimiento manual por caso (Jennifer, 2026-09-16): un textarea
// por fila, se guarda al perder el foco \u2014 igual que "Notas"/"Observaciones"
// en otras tablas del sistema (ver editing/pendingRefresh m\xE1s arriba).
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
        <td>\${c.motivos.join(" \xB7 ")}</td>
        <td>\${c.seguimiento ? \`<a href="\${escapeAttr(c.seguimiento)}" target="_blank" rel="noopener" class="tracking-link">Ver</a>\` : "\u2014"}</td>
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
// Filtro por estado de Furniture (Jennifer, 2026-10-02: "para revisar los
// pedidos").
let casosFurniture = [];
async function loadCasosRevisar() {
  const res = await fetch("/api/furniture/casos-revisar");
  casosFurniture = await res.json();
  const sel = document.getElementById("casos-revisar-estado");
  const actual = sel.value;
  const estados = [...new Set(casosFurniture.map(c => c.estado || "(sin estado)"))].sort();
  sel.innerHTML = '<option value="">Todos los estados de Furniture</option>' + estados.map(e => '<option value="' + escapeAttr(e) + '">' + escapeAttr(e) + ' (' + casosFurniture.filter(c => (c.estado || "(sin estado)") === e).length + ')</option>').join("");
  if (estados.includes(actual)) sel.value = actual;
  renderCasosFurnitureFiltrados();
}
function renderCasosFurnitureFiltrados() {
  const estado = document.getElementById("casos-revisar-estado").value;
  const q = document.getElementById("casos-revisar-search").value.trim().toLowerCase();
  const casos = casosFurniture.filter(c =>
    (!estado || (c.estado || "(sin estado)") === estado) &&
    (!q || [c.orderNumber, c.name, c.albaran, c.nota].join(" ").toLowerCase().includes(q)));
  document.getElementById("casos-revisar-count").textContent = casos.length + (casos.length === casosFurniture.length ? "" : " de " + casosFurniture.length) + " casos a revisar";
  renderCasosRevisarTable(casos, "#casos-revisar-table tbody", 7, "albaran");
}
document.getElementById("casos-revisar-estado").addEventListener("change", renderCasosFurnitureFiltrados);
document.getElementById("casos-revisar-search").addEventListener("input", renderCasosFurnitureFiltrados);

// "Env\xEDos SEUR" (Jennifer, 2026-10-01): sustituye a "Casos a revisar".
// Todas las l\xEDneas de las cargas de SEUR ya cerradas, filtrables por estado
// en SEUR para ir revisando, con notas amplias y bot\xF3n "Reclamado a SEUR".
let enviosSeur = [];
async function loadCasosRevisarSeur(sinCorreo) {
  const res = await fetch("/api/seur/envios");
  enviosSeur = await res.json();
  const rellenar = (id, valores, primera) => {
    const sel = document.getElementById(id);
    const actual = sel.value;
    sel.innerHTML = '<option value="">' + primera + '</option>' + valores.map(v => '<option value="' + escapeAttr(v) + '">' + escapeAttr(v === "__sin__" ? "Sin estado (a\xFAn no hay seguimiento)" : v) + '</option>').join("");
    if (valores.includes(actual)) sel.value = actual;
  };
  const estados = [...new Set(enviosSeur.map(e => e.estadoSeur || "__sin__"))].sort();
  rellenar("envios-seur-estado", estados, "Todos los estados de SEUR");
  rellenar("envios-seur-pais", [...new Set(enviosSeur.map(e => e.pais).filter(Boolean))].sort(), "Todos los pa\xEDses");
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
  const esEntregado = e => (/ENTREGAD|entrega efectuada|retirado el env\xEDo/i.test(e.estadoSeur || "") && !/NO ENTREGAD|NO SE HA ENTREGAD|NO HA PODIDO|NO SE HA PODIDO/i.test(e.estadoSeur || ""));
  const ocultarArchivados = document.getElementById("envios-seur-ocultar-archivados").checked;
  const soloAvisos = document.getElementById("envios-seur-solo-avisos").checked;
  const soloPunto = document.getElementById("envios-seur-solo-punto").checked;
  // Ausencia o cierre (Jennifer, 2026-10-13): "hay que estar muy pendientes
  // porque hay que avisar al cliente de la situaci\xF3n".
  const soloAusencia = document.getElementById("envios-seur-solo-ausencia").checked;
  const esAusencia = e => /ausencia o cierre/i.test(e.estadoSeur || "") && !e.archivado;
  const filas = enviosSeur.filter(e =>
    (!soloAvisos || (e.aviso24h && !e.reclamado && !e.archivado)) &&
    (!soloAusencia || esAusencia(e)) &&
    (!soloPunto || (e.enPunto && !e.archivado)) &&
    (!ocultarEntregados || !esEntregado(e)) &&
    (!ocultarArchivados || !e.archivado) &&
    (!q ||[e.ref, e.refSeur, e.nombre, e.observaciones, e.nota].join(" ").toLowerCase().includes(q)) &&
    (!estado || (e.estadoSeur || "__sin__") === estado) &&
    (!reclamado || (reclamado === "si" ? e.reclamado : reclamado === "no" ? !e.reclamado : reclamado === "respuesta" ? e.correoNoLeidos > 0 : !!(e.correo && e.correo.mensajes && e.correo.mensajes.length))) &&
    (!pais || e.pais === pais));
  document.getElementById("envios-seur-count").textContent = filas.length + " de " + enviosSeur.length + " l\xEDneas enviadas por SEUR";
  const pendientesReclamar = enviosSeur.filter(e => e.aviso24h && !e.reclamado && !e.archivado).length;
  const avisoEl = document.getElementById("envios-seur-aviso");
  const enPunto = enviosSeur.filter(e => e.enPunto && !e.archivado).length;
  const avisos = [];
  if (pendientesReclamar) avisos.push("\u26A0 " + pendientesReclamar + (pendientesReclamar === 1 ? " env\xEDo sigue" : " env\xEDos siguen") + " como \xABEl env\xEDo ha sido registrado\xBB m\xE1s de 24 h despu\xE9s de cerrar la carga \u2014 hay que reclamarlos a SEUR. Marca \xAB\u26A0 Solo para reclamar\xBB para verlos.");
  const nAusencia = enviosSeur.filter(esAusencia).length;
  if (nAusencia) avisos.push("\u{1F4DE} " + nAusencia + (nAusencia === 1 ? " env\xEDo no se ha entregado" : " env\xEDos no se han entregado") + " por ausencia o cierre \u2014 hay que avisar al cliente. Marca \xAB\u{1F4DE} Solo ausencia o cierre\xBB para verlos.");
  if (enPunto) avisos.push("\u{1F4CD} " + enPunto + (enPunto === 1 ? " env\xEDo se ha quedado" : " env\xEDos se han quedado") + " en un punto de recogida de SEUR sin retirar \u2014 rev\xEDsalos. Marca \xAB\u{1F4CD} Solo en punto de recogida\xBB para verlos.");
  avisoEl.style.display = avisos.length ? "" : "none";
  avisoEl.innerHTML = avisos.map(escapeAttr).join("<br>");
  actualizarAvisoMenuSeur(pendientesReclamar, undefined, enPunto);
  const diaSemana = iso => iso ? ["DOMINGO", "LUNES", "MARTES", "MI\xC9RCOLES", "JUEVES", "VIERNES", "S\xC1BADO"][new Date(iso + "T12:00:00Z").getUTCDay()] : "";
  const fechaCorta = iso => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "";
  const tbody = document.querySelector("#envios-seur-table tbody");
  tbody.innerHTML = filas.length ? filas.map(e => {
    const i = enviosSeur.indexOf(e);
    const estadoTxt = e.estadoSeur
      ? escapeAttr(e.estadoSeur) + (e.fechaSituacion ? '<br><span style="color:var(--muted);font-size:11px">' + escapeAttr(e.fechaSituacion) + '</span>' : "")
      : '<span style="color:var(--muted)">Sin seguimiento</span>';
    const avisoCelda = e.aviso24h && !e.archivado ? '<br><span class="badge" style="background:' + (e.reclamado ? "#fde68a;color:#78350f" : "#fee2e2;color:#b91c1c") + '">\u26A0 Sin recoger ' + Math.floor(e.horasDesdeCierre / 24) + ' d\xEDa(s) tras cerrar la carga' + (e.reclamado ? " (reclamado)" : " \u2014 reclamar") + '</span>' : "";
    const ausenciaCelda = esAusencia(e) ? '<br><span class="badge" style="background:#ffedd5;color:#c2410c">\u{1F4DE} Ausencia o cierre \u2014 avisar al cliente</span>' : "";
    const puntoCelda = e.enPunto && !e.archivado ? '<br><span class="badge" style="background:#dbeafe;color:#1e40af">\u{1F4CD} En punto de recogida \u2014 revisar</span>' : "";
    const seguimiento = avisoCelda + ausenciaCelda + puntoCelda + (e.seguimiento ? ' <a href="' + escapeAttr(e.seguimiento) + '" target="_blank" rel="noopener" class="tracking-link">Ver en SEUR</a>' : "");
    const recl = e.reclamado
      ? '<span class="badge" style="background:#fde68a;color:#78350f">\u2714 Reclamado ' + (e.fechaReclamado ? new Date(e.fechaReclamado).toLocaleDateString("es-ES") : "") + '</span><br><button type="button" class="secondary envio-seur-reclamar" data-i="' + i + '" data-valor="0" style="margin-top:4px;padding:2px 8px;font-size:11px">Quitar</button>'
      : '<button type="button" class="secondary envio-seur-reclamar" data-i="' + i + '" data-valor="1">Reclamado a SEUR</button>';
    // Correo con SEUR (Jennifer, 2026-10-02).
    const nMsg = e.correo && e.correo.mensajes ? e.correo.mensajes.length : 0;
    const correoBtn = '<br><button type="button" class="secondary envio-seur-correo" data-i="' + i + '" style="margin-top:4px;padding:2px 8px;font-size:11px' + (e.correoNoLeidos ? ';background:#dc2626;color:#fff;border-color:#dc2626' : '') + '">' +
      (e.correoNoLeidos ? "\u{1F4AC} SEUR ha respondido (" + e.correoNoLeidos + ")" : nMsg ? "\u{1F4AC} Ver conversaci\xF3n (" + nMsg + ")" : "\u2709 Escribir a SEUR") + '</button>';
    return '<tr' + (esAusencia(e) ? ' style="background:rgba(251,146,60,.18)"' : e.reclamado ? ' style="background:rgba(253,230,138,.25)"' : '') + '>' +
      '<td style="white-space:nowrap">' + (e.sinCarga ? "" : '<span style="font-size:11px;color:var(--muted)">' + escapeAttr(e.diaCarga || diaSemana(e.fechaCarga)) + '</span><br>') + '<strong>' + escapeAttr(fechaCorta(e.fechaCarga)) + '</strong>' + (e.sinCarga ? '<br><span style="color:var(--muted);font-size:11px" title="Env\xEDo anterior a las cargas del sistema: sale aqu\xED porque tiene conversaci\xF3n con SEUR">anterior a las cargas</span>' : '') + '</td>' +
      '<td>' + (e.refSeur && e.refSeur !== e.ref
        ? '<strong>' + escapeAttr(e.refSeur) + '</strong><br><span style="color:var(--muted);font-size:11px">antes ' + escapeAttr(e.ref) + '</span>'
        : '<strong>' + escapeAttr(e.ref) + '</strong>') +
        '<br><button type="button" class="secondary envio-seur-ref" data-i="' + i + '" style="margin-top:4px;padding:2px 8px;font-size:11px" title="Si la etiqueta se subi\xF3 a SEUR con otra referencia (ej. terminada en 2)">\u270E Cambiar referencia</button></td>' +
      '<td>' + escapeAttr(e.nombre || "") + '</td>' +
      '<td>' + escapeAttr(e.pais || "") + '</td>' +
      '<td>' + escapeAttr(e.observaciones || "") + '</td>' +
      '<td>' + estadoTxt + seguimiento + '</td>' +
      '<td>' + recl + correoBtn + '</td>' +
      '<td><textarea class="envio-seur-nota" data-i="' + i + '" rows="3" style="width:100%;min-width:320px;resize:vertical" placeholder="Notas...">' + escapeAttr(e.nota || "") + '</textarea></td>' +
      '<td>' + (e.archivado
        ? '<span class="badge" style="background:#e5e7eb;color:#374151">Archivado ' + (e.fechaArchivado ? new Date(e.fechaArchivado).toLocaleDateString("es-ES") : "") + '</span><br><button type="button" class="secondary envio-seur-archivar" data-i="' + i + '" data-valor="0" style="margin-top:4px;padding:2px 8px;font-size:11px">Desarchivar</button>'
        : '<button type="button" class="secondary envio-seur-archivar" data-i="' + i + '" data-valor="1" title="No hay nada m\xE1s que revisar en este env\xEDo">Archivar</button>') + '</td>' +
      '</tr>';
  }).join("") : '<tr><td colspan="9" style="color:var(--muted)">No hay l\xEDneas con estos filtros.</td></tr>';
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
  // Referencia con la que se subi\xF3 de verdad (Jennifer, 2026-10-09).
  tbody.querySelectorAll(".envio-seur-ref").forEach(btn => {
    btn.addEventListener("click", async () => {
      const e = enviosSeur[Number(btn.dataset.i)];
      const nueva = prompt("Referencia con la que est\xE1 subida en SEUR (d\xE9jalo vac\xEDo para volver a " + e.ref + "):", e.refSeur || e.ref);
      if (nueva === null) return;
      const valor = nueva.trim().toUpperCase();
      const res = await fetch("/api/seur/envios/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: e.orderId, ref: e.ref, refSeur: valor && valor !== e.ref ? valor : null }) });
      if (!res.ok) { alert("No se pudo guardar la referencia."); return; }
      await loadCasosRevisarSeur(true);
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
// Conversaci\xF3n por email con SEUR de una l\xEDnea (Jennifer, 2026-10-02): se
// escribe y se contesta desde aqu\xED; sale desde su Gmail y las respuestas de
// SEUR se leen del mismo Gmail (cada hora y al abrir Env\xEDos SEUR).
let correoSeurAbierto = null;
function pintarCorreoSeur() {
  const e = correoSeurAbierto;
  const mensajes = (e.correo && e.correo.mensajes) || [];
  document.getElementById("seur-correo-titulo").textContent = "SEUR \xB7 " + e.ref + " \xB7 " + (e.nombre || "");
  document.getElementById("seur-correo-destino").textContent = "Para: " + (["ES", "PT"].includes(String(e.pais || "").toUpperCase()) ? "atencionalcliente@seur.com (63235, nacional)" : "customerservice@seur.com (48297, internacional)") + (e.numeroExpedicion ? " \xB7 Expedici\xF3n " + e.numeroExpedicion : "") + (e.estadoSeur ? " \xB7 Estado: " + e.estadoSeur : "");
  document.getElementById("seur-correo-mensajes").innerHTML = mensajes.length
    ? mensajes.map(m => '<div style="border-radius:8px;padding:8px 10px;' + (m.deSeur ? "background:#fef3c7;border:1px solid #f59e0b;margin-right:40px" : "background:#ecfdf5;border:1px solid #34d399;margin-left:40px") + '">' +
        '<div style="font-size:11px;color:var(--muted);margin-bottom:4px"><strong>' + (m.deSeur ? "SEUR" : "Nosotros") + '</strong> \xB7 ' + escapeAttr(m.de || "") + ' \xB7 ' + new Date(m.fecha).toLocaleString("es-ES") + '</div>' +
        '<div style="white-space:pre-wrap;font-size:13px">' + escapeAttr(m.texto || "") + '</div></div>').join("")
    : '<div style="color:var(--muted)">Todav\xEDa no has escrito a SEUR por este env\xEDo.</div>';
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
  if (!confirm((primera ? "\xBFEnviar este email a SEUR" : "\xBFResponder a SEUR") + " por el env\xEDo " + e.ref + "?")) return;
  const btn = document.getElementById("seur-correo-enviar");
  btn.disabled = true;
  try {
    const res = await fetch(primera ? "/api/seur/envios/escribir" : "/api/seur/envios/responder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: e.orderId, ref: e.ref, texto }) });
    const d = await res.json().catch(() => ({}));
    if (!d.ok) {
      alert("No se ha podido enviar: " + (d.error === "script_sin_actualizar" || /no_json/.test(d.error || "") ? "falta actualizar el script de Google (Aviso almac\xE9n) a la versi\xF3n nueva." : (d.error || res.status)));
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
document.getElementById("envios-seur-solo-punto").addEventListener("change", renderEnviosSeur);
document.getElementById("envios-seur-solo-ausencia").addEventListener("change", renderEnviosSeur);
document.getElementById("envios-seur-anadir-btn").addEventListener("click", async () => {
  const txt = prompt("Referencia del pedido que quieres a\xF1adir a Env\xEDos SEUR (ej. 002-26208L28658-A o BEZEN12276):");
  if (!txt) return;
  const o = buscarPedidoCaso(txt);
  if (!o) { alert("No encuentro el pedido " + txt.trim() + "."); return; }
  const ref = refLabel(o);
  if (enviosSeur.some(e => String(e.orderId) === String(o.id) && e.ref === ref)) { alert(ref + " ya est\xE1 en la lista."); return; }
  const res = await fetch("/api/seur/envios/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: o.id, ref, manual: true }) });
  if (!res.ok) { alert("No se ha podido a\xF1adir."); return; }
  document.getElementById("envios-seur-ocultar-archivados").checked = true;
  await loadCasosRevisarSeur(true);
  document.getElementById("envios-seur-search").value = ref;
  renderEnviosSeur();
  mostrarAvisoBreve(ref + " a\xF1adido a Env\xEDos SEUR.");
});
// Aviso en el men\xFA "Env\xEDos SEUR" con los env\xEDos por reclamar, visible
// desde cualquier pantalla (se calcula al abrir la app y cada hora).
function actualizarAvisoMenuSeur(n, respuestas, enPunto) {
  const link = document.querySelector('[data-logistica="casos-revisar-seur"]');
  if (!link) return;
  if (respuestas === undefined) respuestas = enviosSeur.filter(e => e.correoNoLeidos > 0).length;
  link.innerHTML = "Env\xEDos SEUR" + (n ? ' <span class="badge" style="background:#dc2626;color:#fff;padding:1px 6px">\u26A0 ' + n + '</span>' : "") +
    (enPunto ? ' <span class="badge" style="background:#2563eb;color:#fff;padding:1px 6px" title="En punto de recogida sin retirar">\u{1F4CD} ' + enPunto + '</span>' : "") +
    (respuestas ? ' <span class="badge" style="background:#f59e0b;color:#fff;padding:1px 6px" title="Respuestas de SEUR sin leer">\u{1F4AC} ' + respuestas + '</span>' : "");
}
async function comprobarAvisosSeur() {
  try {
    const res = await fetch("/api/seur/envios");
    const lista = await res.json();
    actualizarAvisoMenuSeur(lista.filter(e => e.aviso24h && !e.reclamado && !e.archivado).length, lista.filter(e => e.correoNoLeidos > 0).length, lista.filter(e => e.enPunto && !e.archivado).length);
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
    cont.innerHTML = '<p style="margin:0 2rem;color:var(--muted)">Todav\xEDa no se ha cerrado ninguna carga.</p>';
    return;
  }
  cont.innerHTML = cargas.map(c => {
    const pedidos = allOrders.filter(o => o.cargaId === c.id);
    const filas = pedidos.map(o => \`<tr\${o.cancelado ? ' class="fila-cancelada"' : ""}>\${furnitureRowCells(o)}<td><button type="button" class="secondary sacar-carga-historial-btn" data-id="\${o.id}">Sacar de la carga</button></td></tr>\`).join("");
    return \`
    <details class="carga-historial-card">
      <summary>\${formatCargaTitulo(c)} \u2014 \${pedidos.length} pedidos \u2014 cerrada el \${new Date(c.fechaCierre).toLocaleDateString("es-ES")}</summary>
      <div class="toolbar" style="padding:0 1rem 0.5rem">
        <a class="secondary" href="/api/cargas/export?cargaId=\${encodeURIComponent(c.id)}" style="text-decoration:none">Descargar Excel Furniture</a>
        <button type="button" class="secondary listado-almacen-btn" data-id="\${c.id}">Listado almac\xE9n</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Pedido</th><th>Plataforma</th><th>Nombre</th><th>Producto comprado</th><th>Servicios adicionales</th><th>Art\xEDculos / Llegada</th><th>Notas</th><th>Acciones</th></tr></thead>
          <tbody>\${filas}</tbody>
        </table>
      </div>
    </details>
  \`;
  }).join("");

  // Sacar un pedido de una carga YA CERRADA (Jennifer, 2026-09-18: meti\xF3
  // BEZEN12212 en una carga como prueba y no ten\xEDa forma de revertirlo, ya
  // que "Sacar de la carga" solo exist\xEDa para la carga abierta). Pide
  // confirmaci\xF3n porque, a diferencia de "para tener en cuenta", esto puede
  // afectar a un pedido que ya se consideraba listo para salir.
  document.querySelectorAll("#historial-cargas-list .sacar-carga-historial-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = idPedido(btn.dataset.id);
      const order = allOrders.find(o => o.id === id);
      if (!confirm("\xBFSacar " + (order ? refLabel(order) : "este pedido") + " de esta carga cerrada? Volver\xE1 a la lista de pendientes de Furniture.")) return;
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
      const order = allOrders.find(o => o.id === idPedido(inp.dataset.id));
      if (order) order.notas = inp.value;
      saveMeta(inp.dataset.id, { notas: inp.value });
    });
  });
}

// ---- Log\xEDstica > SEUR ----
// A diferencia de Furniture (selecci\xF3n manual), aqu\xED el sistema mete el
// pedido solo en cuanto detecta stock real (ver processInventory en
// orders-store.js) \u2014 esta pantalla es solo para ver las cargas ya formadas,
// cerrarlas, y resolver los pocos casos que s\xED necesitan una decisi\xF3n
// manual (pedidos de 2+ colchones con disponibilidad mixta).
function formatSeurCargaTitulo(carga) {
  const fecha = new Date(carga.fecha + "T00:00:00");
  return "Carga " + carga.dia + " \xB7 " + fecha.toLocaleDateString("es-ES");
}

function seurOrderRowCells(o, refSuffix) {
  return \`
    <td>\${refLabel(o)}\${refSuffix || ""}\${valdemoroTag(o)}</td>
    <td>\${o.name}</td>
    <td>\${o.furnitureAddress || o.address || ""}\${direccionButton(o)}</td>
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
        <strong>\${refLabel(o)}</strong> \u2014 \${o.name}
        <ul>\${detalle}</ul>
        <button type="button" class="seur-dividir-btn" data-id="\${o.id}">Dividir ahora (sale ya lo que hay en stock)</button>
      </div>
    \`;
  }).join("");
  document.querySelectorAll(".seur-dividir-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const order = allOrders.find(o => String(o.id) === btn.dataset.id);
      if (!order) return;
      if (!confirm('\xBFDividir ' + refLabel(order) + '? Lo que hay en stock sale ya por SEUR; el resto se queda pendiente en Luso/New con referencia "2".')) return;
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
// que en Furniture, se quedan aqu\xED para volver a meterlos en la carga de
// hoy o de ma\xF1ana, o marcar que no han salido (\u21A9, vuelven al proveedor).
function pedidosSeurFueraDeCarga() {
  return allOrders.filter(o => o.agencia === "SEUR" && !o.cargaId && !o.cancelado && o.shippingStatus !== "fulfilled"
    && backorders.some(b => String(b.orderId) === String(o.id) && b.estado === "cubierto" && String(b.id).endsWith("-cubierto")));
}
// Ventana de cargas de SEUR a la vista (Jennifer, 2026-09-30): los 5
// pr\xF3ximos d\xEDas laborables desde hoy (primera, el 01/10). Las cargas
// programadas m\xE1s all\xE1 se ven aparte, plegadas. Mismo c\xE1lculo que
// diasCargaSeur en orders-store.js.
function hoyMadrid() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
}
// Festivos sin carga (Jennifer, 2026-10-09: el lunes 12/10 no hay carga).
const FESTIVOS_SIN_CARGA = ["2026-10-12", "2026-11-09", "2026-12-07", "2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01"];
function finVentanaSeur() {
  const hoy = hoyMadrid();
  const d = new Date((hoy < "2026-10-01" ? "2026-10-01" : hoy) + "T12:00:00Z");
  let n = 0, ultimo = "";
  while (n < 5) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6 && !FESTIVOS_SIN_CARGA.includes(d.toISOString().slice(0, 10))) { n++; ultimo = d.toISOString().slice(0, 10); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return ultimo;
}
function errorFechaSeur(fecha) {
  if (!fecha) return "Elige primero el d\xEDa.";
  const w = new Date(fecha + "T12:00:00Z").getUTCDay();
  if (w === 0 || w === 6) return "No hay cargas de SEUR ni s\xE1bado ni domingo.";
  if (FESTIVOS_SIN_CARGA.includes(fecha)) return "Ese d\xEDa es festivo: no hay carga.";
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
  // Cualquier d\xEDa laborable, aunque su carga a\xFAn no se vea (Jennifer,
  // 2026-09-30).
  const diaPorDefecto = primerDiaSeur();
  cont.innerHTML = \`
    <div class="carga-abierta-box tener-en-cuenta-box">
      <div class="toolbar"><h3 style="margin:0">Pedidos de SEUR fuera de carga</h3></div>
      <div class="inventario-count">\${pedidos.length} pedido(s) listos para SEUR que no est\xE1n en ninguna carga</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Pedido</th><th>Nombre</th><th>Direcci\xF3n</th><th>Tel\xE9fono</th><th>Producto</th><th></th></tr></thead>
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
      if (!res.ok) { alert("No se ha podido a\xF1adir a la carga."); return; }
      await loadOrders();
      loadSeur();
    });
  });
}

const busquedaCargaSeur = {};
function renderSeurCargas() {
  renderSeurFueraCarga();
  const cargasAbiertas = allCargas.filter(c => c.tipo === "seur" && c.estado === "abierta").sort((a, b) => a.fecha.localeCompare(b.fecha));
  const cont = document.getElementById("seur-cargas-list");
  if (!cargasAbiertas.length) {
    cont.innerHTML = '<p style="margin:1rem 2rem;color:var(--muted)">No hay ninguna carga de SEUR abierta todav\xEDa.</p>';
    return;
  }
  // Las cargas m\xE1s all\xE1 de los 5 d\xEDas laborables a la vista (programadas a
  // petici\xF3n del cliente, Jennifer, 2026-09-30) van aparte, plegadas.
  const fin = finVentanaSeur();
  const aLaVista = cargasAbiertas.filter(c => c.fecha <= fin);
  const programadas = cargasAbiertas.filter(c => c.fecha > fin && seurEnviosDeCarga(c.id).length);
  const tarjeta = carga => {
    const filas = seurEnviosDeCarga(carga.id);
    const filasHtml = filas.map(({ o, refSuffix, backorderId, backorder }) => {
      const cells = backorder && (backorder.gestoComercial || backorder.reposicion) ? seurBackorderRowCells(backorder) : seurOrderRowCells(o, refSuffix);
      const quitarLabel = backorder && backorder.gestoComercial ? "El gesto comercial no vino: quitar" : (backorder && backorder.reposicion ? "La reposici\xF3n no vino: quitar" : "El colch\xF3n no vino: quitar");
      // Mover a cualquier d\xEDa laborable (Jennifer, 2026-09-30).
      const moverHtml = \`<div class="mover-seur"><input type="date" class="mover-seur-fecha" min="\${hoyMadrid()}" /><button type="button" class="secondary mover-seur-btn" data-order-id="\${backorderId ? "" : escapeAttr(String(o.id))}" data-backorder-id="\${backorderId ? escapeAttr(backorderId) : ""}">Mover a ese d\xEDa</button></div>\`;
      return \`
      <tr\${o.cancelado ? ' class="fila-cancelada"' : ""}>
        <td><input type="checkbox" class="sel-envio-seur" data-order-id="\${escapeAttr(String(o.id))}" /></td>
        \${cells}
        <td class="seur-envio-notas" data-carga-id="\${carga.id}" data-order-id="\${escapeAttr(String(o.id))}" data-suffix="\${escapeAttr(refSuffix || "")}" data-backorder="\${backorderId ? "1" : ""}"><span style="color:var(--muted);font-size:11px">\u2026</span></td>
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
          <button type="button" class="secondary listado-almacen-seur-btn" data-id="\${carga.id}">Listado almac\xE9n</button>
          <button type="button" class="secondary resumen-almacen-seur-btn" data-id="\${carga.id}" data-titulo="\${escapeAttr(formatCargaTitulo(carga))}" title="Manda al email del almac\xE9n el listado de esta carga en una etiqueta 15\xD710 para imprimir">\u{1F4E7} Enviar resumen al almac\xE9n (15\xD710)</button>
          <button type="button" class="cerrar-carga-seur-btn" data-id="\${carga.id}">Cerrar carga</button>
          <input type="search" class="buscar-carga-seur" data-id="\${carga.id}" placeholder="\u{1F50E} Buscar en esta carga (pedido, nombre, producto\u2026)" style="min-width:280px" />
        </div>
        <div class="inventario-count">\${filas.length} pedidos en esta carga</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th><input type="checkbox" class="sel-todos-seur" title="Marcar / desmarcar todos" /></th><th>Pedido</th><th>Nombre</th><th>Direcci\xF3n</th><th>Tel\xE9fono</th><th>Producto</th><th style="min-width:260px">Ref. en SEUR \xB7 Notas</th><th></th></tr></thead>
            <tbody>\${filasHtml}</tbody>
          </table>
        </div>
      </div>
    \`;
  };
  const nProgramados = programadas.reduce((n, c) => n + seurEnviosDeCarga(c.id).length, 0);
  // Aviso de cargas con la fecha ya pasada y sin cerrar (Jennifer,
  // 2026-10-01: "si una carga no se ha cerrado, me salga un aviso como que
  // est\xE1 pendiente de cerrar para poderla revisar y que se cierre").
  const sinCerrar = cargasAbiertas.filter(c => c.fecha < hoyMadrid());
  const avisoSinCerrar = sinCerrar.length
    ? '<div class="aviso-sin-cerrar">\u26A0 <strong>Carga' + (sinCerrar.length > 1 ? "s" : "") + " de SEUR pendiente" + (sinCerrar.length > 1 ? "s" : "") + " de cerrar:</strong> "
      + sinCerrar.map(c => formatSeurCargaTitulo(c) + " (" + seurEnviosDeCarga(c.id).length + " env\xEDos)").join(", ")
      + ". Rev\xEDsala" + (sinCerrar.length > 1 ? "s" : "") + " abajo y ci\xE9rrala" + (sinCerrar.length > 1 ? "s" : "") + " si ya sali\xF3.</div>"
    : "";
  cont.innerHTML = avisoSinCerrar + aLaVista.map(tarjeta).join("") + (programadas.length ? \`
    <details class="seur-programados">
      <summary>Env\xEDos programados m\xE1s adelante \u2014 \${nProgramados} env\xEDo(s) en \${programadas.length} carga(s): \${programadas.map(c => new Date(c.fecha + "T00:00:00").toLocaleDateString("es-ES")).join(", ")}</summary>
      \${programadas.map(tarjeta).join("")}
    </details>\` : "");
  document.querySelectorAll(".cerrar-carga-seur-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const carga = allCargas.find(c => c.id === btn.dataset.id);
      if (!carga) return;
      if (!confirm("\xBFCerrar " + formatSeurCargaTitulo(carga) + "? Pasar\xE1 al historial.")) return;
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
      if (!confirm("\xBFSacar " + (order ? refLabel(order) : "este pedido") + " de la carga de SEUR?\\n\\nQuedar\xE1 en \\"Pedidos de SEUR fuera de carga\\", abajo, para volver a meterlo en otra carga cuando quieras.")) return;
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
        ? "\xBFEste gesto comercial se ha quedado sin preparar? Se saca de esta carga y vuelve a pendiente en Polival, con referencia nueva para cuando salga de verdad."
        : "\xBFEl colch\xF3n no vino en el cami\xF3n? Se saca de esta carga y vuelve a pendiente en Luso/New, con referencia nueva para cuando salga de verdad.";
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
  // Descargar solo los env\xEDos marcados (Jennifer, 2026-10-09: "en ocasiones
  // se modifican y no quiero tener que descargarlo todo"). Sin marcar nada
  // baja la carga entera, como siempre.
  const seleccionSeur = caja => [...caja.querySelectorAll(".sel-envio-seur:checked")].map(chk => {
    const td = chk.closest("tr").querySelector(".seur-envio-notas");
    return { orderId: chk.dataset.orderId, refs: td && td.dataset.refs ? td.dataset.refs.split("|") : [] };
  });
  const etiquetaDescargaSeur = caja => {
    const n = caja.querySelectorAll(".sel-envio-seur:checked").length;
    const btn = caja.querySelector(".descargar-seur-btn");
    if (btn) btn.textContent = n ? "Descargar fichero SEUR (" + n + " marcado" + (n > 1 ? "s" : "") + ")" : "Descargar fichero SEUR";
  };
  document.querySelectorAll(".sel-envio-seur").forEach(chk => chk.addEventListener("change", () => etiquetaDescargaSeur(chk.closest(".carga-abierta-box"))));
  document.querySelectorAll(".sel-todos-seur").forEach(chk => chk.addEventListener("change", () => {
    const caja = chk.closest(".carga-abierta-box");
    caja.querySelectorAll("tbody tr").forEach(tr => { if (tr.style.display !== "none") { const c = tr.querySelector(".sel-envio-seur"); if (c) c.checked = chk.checked; } });
    etiquetaDescargaSeur(caja);
  }));
  document.querySelectorAll(".descargar-seur-btn").forEach(btn => {
    btn.addEventListener("click", () => descargarFicheroSeur(btn.dataset.id, seleccionSeur(btn.closest(".carga-abierta-box"))));
  });
  [...aLaVista, ...programadas].forEach(c => rellenarNotasCargaSeur(c.id));
  // Buscador dentro de cada carga (Jennifer, 2026-10-09: "hay veces que las
  // listas son muy largas"). Se recuerda lo escrito al repintar.
  document.querySelectorAll(".buscar-carga-seur").forEach(inp => {
    inp.value = busquedaCargaSeur[inp.dataset.id] || "";
    const aplicar = () => {
      busquedaCargaSeur[inp.dataset.id] = inp.value;
      const q = inp.value.trim().toLowerCase();
      const caja = inp.closest(".carga-abierta-box");
      let visibles = 0;
      caja.querySelectorAll("tbody tr").forEach(tr => {
        const texto = (tr.textContent + " " + [...tr.querySelectorAll("textarea")].map(t => t.value).join(" ")).toLowerCase();
        const ver = !q || texto.includes(q);
        tr.style.display = ver ? "" : "none";
        if (ver) visibles++;
      });
      const cuenta = caja.querySelector(".inventario-count");
      if (cuenta) cuenta.textContent = q ? visibles + " de " + caja.querySelectorAll("tbody tr").length + " pedidos en esta carga" : caja.querySelectorAll("tbody tr").length + " pedidos en esta carga";
    };
    inp.addEventListener("input", aplicar);
    if (inp.value) aplicar();
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

// Ref. en SEUR y notas de cada env\xEDo de la carga (Jennifer, 2026-10-09).
// Las celdas de un mismo pedido se reparten sus env\xEDos: las de un art\xEDculo
// suelto se quedan los que acaban en su sufijo; la fila del pedido, el resto.
async function rellenarNotasCargaSeur(cargaId) {
  const data = await fetch("/api/cargas/seur/envios-carga?cargaId=" + encodeURIComponent(cargaId)).then(r => r.json()).catch(() => ({}));
  const celdas = [...document.querySelectorAll('.seur-envio-notas[data-carga-id="' + cargaId + '"]')];
  if (!data.ok) { celdas.forEach(td => { td.innerHTML = ""; }); return; }
  const usados = new Set();
  const pintar = (td, envs) => {
    envs.forEach(e => usados.add(e));
    td.dataset.refs = envs.map(e => e.ref).join("|");
    td.innerHTML = envs.map(e => {
      const i = data.envios.indexOf(e);
      return '<div style="margin-bottom:6px">' +
        (e.refSeur ? '<strong>' + escapeAttr(e.refSeur) + '</strong> <span style="color:var(--muted);font-size:11px">(antes ' + escapeAttr(e.ref) + ')</span>' : '<strong>' + escapeAttr(e.ref) + '</strong>') +
        ' <button type="button" class="secondary carga-seur-ref-btn" data-i="' + i + '" style="padding:1px 6px;font-size:11px" title="Si la etiqueta se subi\xF3 a SEUR con otra referencia (ej. terminada en 2)">\u270E</button>' +
        '<textarea class="carga-seur-nota" data-i="' + i + '" rows="2" style="display:block;width:100%;min-width:240px;margin-top:3px;font:inherit;font-size:12px;resize:vertical" placeholder="Notas del env\xEDo...">' + escapeAttr(e.nota || "") + '</textarea></div>';
    }).join("") || '<span style="color:var(--muted);font-size:11px">\u2014</span>';
    td.querySelectorAll(".carga-seur-nota").forEach(ta => {
      ta.addEventListener("focus", () => { editing = true; });
      ta.addEventListener("blur", async () => {
        editing = false;
        const e = data.envios[Number(ta.dataset.i)];
        if (ta.value === (e.nota || "")) return;
        e.nota = ta.value;
        await fetch("/api/seur/envios/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: e.orderId, ref: e.ref, nota: ta.value }) });
      });
    });
    td.querySelectorAll(".carga-seur-ref-btn").forEach(btn => btn.addEventListener("click", async () => {
      const e = data.envios[Number(btn.dataset.i)];
      const nueva = prompt("Referencia con la que est\xE1 subida en SEUR (d\xE9jalo vac\xEDo para volver a " + e.ref + "):", e.refSeur || e.ref);
      if (nueva === null) return;
      const valor = nueva.trim().toUpperCase();
      const res = await fetch("/api/seur/envios/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: e.orderId, ref: e.ref, refSeur: valor && valor !== e.ref ? valor : null }) });
      if (!res.ok) { alert("No se pudo guardar la referencia."); return; }
      rellenarNotasCargaSeur(cargaId);
    }));
  };
  const deOrden = td => data.envios.filter(e => String(e.orderId) === td.dataset.orderId && !usados.has(e));
  // Primero los art\xEDculos sueltos con sufijo, luego el resto.
  celdas.filter(td => td.dataset.backorder && td.dataset.suffix).forEach(td => pintar(td, deOrden(td).filter(e => e.ref.endsWith(td.dataset.suffix)).slice(0, 1)));
  celdas.filter(td => !td.dataset.backorder).forEach(td => pintar(td, deOrden(td)));
  celdas.filter(td => td.dataset.backorder && !td.dataset.suffix).forEach(td => pintar(td, deOrden(td)));
}

// Antes de descargar avisa si alg\xFAn art\xEDculo no tiene un peso conocido
// (tabla de Pesos SEUR) \u2014 el fichero se genera igualmente con esa casilla
// en blanco, pero mejor saberlo antes de subirlo a Seur.
async function descargarFicheroSeur(cargaId, seleccion) {
  const res = await fetch("/api/cargas/seur/export-avisos?cargaId=" + encodeURIComponent(cargaId));
  const data = await res.json();
  const parcial = seleccion && seleccion.length;
  if (data.avisos && data.avisos.length) {
    const seguir = confirm(data.avisos.length + " aviso(s):\\n\\n" + data.avisos.join("\\n") + "\\n\\n\xBFDescargar igualmente?");
    if (!seguir) return;
  }
  // En .xlsx (Jennifer, 2026-10-01). Todas las casillas van como texto
  // salvo los n\xFAmeros de verdad, para que el CP y el tel\xE9fono no pierdan
  // ceros a la izquierda.
  const r = await fetch("/api/cargas/seur/export?formato=json&cargaId=" + encodeURIComponent(cargaId));
  if (!r.ok) { alert("No se pudo generar el fichero: " + (await r.text())); return; }
  const d = await r.json();
  let filasTodas = d.filas;
  if (parcial) {
    // Por referencia del env\xEDo; si a\xFAn no se hab\xEDa cargado, por pedido.
    const refs = new Set(seleccion.flatMap(x => x.refs));
    const pedidos = new Set(seleccion.filter(x => !x.refs.length).map(x => x.orderId));
    filasTodas = d.filas.filter((f, i) => refs.has(f[0]) || pedidos.has(String((d.rowOrderIds || [])[i])));
    if (!filasTodas.length) { alert("No se ha encontrado ninguna l\xEDnea de los env\xEDos marcados."); return; }
  }
  const filas = filasTodas.map(f => f.map((v, i) => ((i === 7 || i === 8) && v !== "" && !isNaN(Number(v)) ? Number(v) : v)));
  // Un fichero por c\xF3digo de remitente (63235 nacional, 48297
  // internacional): en SEUR se suben por separado (Jennifer, 2026-10-01).
  const porRemitente = {};
  for (const f of filas) (porRemitente[f[9] || "SIN_REMITENTE"] = porRemitente[f[9] || "SIN_REMITENTE"] || []).push(f);
  const codigos = Object.keys(porRemitente).sort();
  for (let i = 0; i < codigos.length; i++) {
    if (i) await new Promise(ok => setTimeout(ok, 800));
    const ws = XLSX.utils.aoa_to_sheet([d.cabeceras, ...porRemitente[codigos[i]]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
    XLSX.writeFile(wb, "SEUR_" + d.fecha + "_" + codigos[i] + (parcial ? "_seleccion" : "") + ".xlsx");
  }
  if (codigos.length > 1) alert("Se han descargado " + codigos.length + " ficheros, uno por remitente (" + codigos.join(" y ") + "). S\xFAbelos a SEUR por separado.");
}

// Une los dos or\xEDgenes de env\xEDo de una carga de SEUR: pedidos que se
// asignaron solos al procesarse (order.cargaId) y colchones que se quedaron
// pendientes en Luso/New y se asignaron al marcarlos "listo para SEUR"
// (backorder.cargaId) \u2014 un pedido dividido puede aparecer en ambos, con
// referencias distintas (ver refSuffix). Los gestos comerciales (almohada
// de regalo, Jennifer, 2026-09-22) entran por el mismo camino que un
// colch\xF3n suelto "listo para SEUR" \u2014 se expone el backorder completo
// (no solo su id) para que el renderer sepa mostrar la almohada de regalo
// en vez del producto real del pedido original.
function seurEnviosDeCarga(cargaId) {
  const directos = allOrders.filter(o => o.agencia === "SEUR" && o.cargaId === cargaId)
    .map(o => ({ o, refSuffix: "", backorderId: null, backorder: null }));
  const divididos = backorders.filter(b => (b.tipo === "colchon" || b.tipo === "topper" || b.gestoComercial) && b.cargaId === cargaId)
    .map(b => {
      const o = allOrders.find(x => x.orderNumber === b.orderNumber);
      return o ? { o, refSuffix: b.refSuffix || "", backorderId: b.id, backorder: b } : null;
    }).filter(Boolean);
  return [...directos, ...divididos];
}

// Fila de un gesto comercial o de una reposici\xF3n de colch\xF3n por SEUR
// dentro de una carga de SEUR (Jennifer, 2026-09-22) \u2014 misma forma que
// seurOrderRowCells, pero la referencia (con su prefijo GC/REP) y el
// "producto" vienen del backorder (la almohada de regalo, o el colch\xF3n de
// reposici\xF3n), no del pedido original (que puede llevar un art\xEDculo
// totalmente distinto, o ya estar entregado/cancelado).
function seurBackorderRowCells(b) {
  const o = allOrders.find(x => x.orderNumber === b.orderNumber) || {};
  return \`
    <td>\${refLabel(b)}\${valdemoroTag(o)}</td>
    <td>\${o.name || ""}</td>
    <td>\${o.furnitureAddress || o.address || ""}\${direccionButton(o)}</td>
    <td>\${o.phone || ""}</td>
    <td>\${b.cantidad}x \${b.stockModel} (\${b.talla})\${b.piezaTexto ? " \u2014 " + escapeAttr(b.piezaTexto) : ""}</td>
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
    cont.innerHTML = '<p style="margin:0 2rem;color:var(--muted)">Todav\xEDa no se ha cerrado ninguna carga de SEUR.</p>';
    return;
  }
  cont.innerHTML = cargas.map(c => {
    const filas = seurEnviosDeCarga(c.id);
    const filasHtml = filas.map(({ o, refSuffix, backorder }) => \`<tr\${o.cancelado ? ' class="fila-cancelada"' : ""}>\${backorder && (backorder.gestoComercial || backorder.reposicion) ? seurBackorderRowCells(backorder) : seurOrderRowCells(o, refSuffix)}</tr>\`).join("");
    return \`
    <details class="carga-historial-card">
      <summary>\${formatSeurCargaTitulo(c)} \u2014 \${filas.length} pedidos \u2014 cerrada el \${new Date(c.fechaCierre).toLocaleDateString("es-ES")}</summary>
      <div class="toolbar" style="padding:0 1rem 0.5rem">
        <button type="button" class="secondary descargar-seur-historial-btn" data-id="\${c.id}">Descargar fichero SEUR</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Pedido</th><th>Nombre</th><th>Direcci\xF3n</th><th>Tel\xE9fono</th><th>Producto</th></tr></thead>
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

// Modal "\xBFCarga de hoy o de ma\xF1ana?" al marcar un pendiente de colch\xF3n
// (Luso/New, sin pack) como "listo para SEUR" \u2014 ver resolveSeurBackorder en
// inventory-store.js.
let seurFechaModalBackorderId = null;
// "Sustituir modelo" (Jennifer, 2026-09-18): ofrece directamente los
// colchones con stock real de la misma talla, para no tener que salir del
// pedido a mirar Stock a mano. Recibe el objeto del pendiente ya cargado
// (desde Proveedores, o desde el propio pedido de Shopify/Carrefour, que lo
// busca al vuelo \u2014 ver abrirSustituirDesdePedido).
let sustituirBackorder = null;
let sustituirViaSeur = true;
// Transformar (Jennifer, 2026-09-28): medida de origen elegida (mismo
// modelo), o null si se sustituye por otro modelo.
let sustituirTransformarTalla = null;
async function abrirModalSustituir(b) {
  sustituirBackorder = b;
  sustituirTransformarTalla = null;
  const esPackTexto = b.esPack ? " (dentro de un pack, va " + b.tipoEnvio + ")" : "";
  document.getElementById("sustituir-modal-texto").textContent = refLabel(b) + " \u2014 pedido: " + b.cantidad + "x " + b.stockModel + " (" + b.talla + ")" + esPackTexto + ". Elige el sustituto:";
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
  // Colch\xF3n de pack con FUR, o FPK cuya tapicer\xEDa a\xFAn no ha salido: no
  // hace falta elegir fecha de SEUR, sale junto con la tapicer\xEDa (Jennifer,
  // 2026-09-18) \u2014 se ense\xF1a un \xFAnico bot\xF3n "Sustituir" en vez de hoy/ma\xF1ana.
  mostrarBotonesSustituir(false);
  const alternativas = data.alternativas || [];
  listEl.innerHTML = alternativas.length
    ? alternativas.map(a => \`<button type="button" class="alternativa-opcion" data-modelo="\${escapeAttr(a.stockModel)}"><span>\${a.stockModel}</span><span class="alternativa-stock">\${a.cantidad} en stock</span></button>\`).join("")
    : '<p style="color:var(--muted);font-size:13px">No hay otro colch\xF3n con stock real en esta talla ahora mismo.</p>';
  const transEl = document.getElementById("sustituir-transformar-list");
  const transformables = data.transformables || [];
  transEl.innerHTML = transformables.length
    ? transformables.map(t => \`<button type="button" class="alternativa-opcion transformar-opcion" data-talla="\${escapeAttr(t.talla)}"><span>\${escapeAttr(b.stockModel)} \${t.talla} \u2192 \${b.talla}</span><span class="alternativa-stock">\${t.cantidad} en stock</span></button>\`).join("")
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
// Un colch\xF3n transformado sale siempre por Furniture (Jennifer, 2026-09-28):
// nunca se elige carga de SEUR, solo un bot\xF3n "Transformar".
function mostrarBotonesSustituir(transformando) {
  const directoBtn = document.getElementById("sustituir-directo-btn");
  const conSeur = !transformando && sustituirViaSeur;
  directoBtn.textContent = transformando ? "Transformar" : "Sustituir";
  directoBtn.style.display = conSeur ? "none" : "";
  document.getElementById("sustituir-hoy-btn").style.display = conSeur ? "" : "none";
  document.getElementById("sustituir-manana-btn").style.display = conSeur ? "" : "none";
}
// Desde la ficha de un pedido (Shopify o Carrefour), Jennifer pidi\xF3 poder
// sustituir sin salir a Proveedores \u2014 se busca al vuelo si ese pedido tiene
// alg\xFAn colch\xF3n pendiente, suelto o de pack (2026-09-18).
async function abrirSustituirDesdePedido(orderId) {
  const res = await fetch("/api/inventario/pendientes");
  const todos = await res.json();
  const candidatos = todos.filter(b => String(b.orderId) === String(orderId) && b.tipo === "colchon" && b.estado === "pendiente");
  if (!candidatos.length) {
    alert("Este pedido no tiene ning\xFAn colch\xF3n pendiente de proveedor para sustituir.");
    return;
  }
  if (candidatos.length === 1) {
    abrirModalSustituir(candidatos[0]);
    return;
  }
  const opciones = candidatos.map((b, i) => (i + 1) + ") " + b.stockModel + " (" + b.talla + ")").join("\\n");
  const elegido = prompt("Este pedido tiene varios colchones pendientes. \xBFCu\xE1l quieres sustituir?\\n" + opciones);
  const idx = Number(elegido) - 1;
  if (candidatos[idx]) abrirModalSustituir(candidatos[idx]);
}

// Reposici\xF3n de pieza rota (Jennifer, 2026-09-21): bot\xF3n en cada pedido de
// cualquier canal de venta \u2014 abre un desplegable con los art\xEDculos reales
// de ESE pedido (resueltos contra el Cat\xE1logo por productId, igual que
// hace el motor normal) para elegir cu\xE1l hay que reponer, m\xE1s un motivo
// libre. Crea un pendiente nuevo en Proveedores (Polival/Luso/New seg\xFAn
// el art\xEDculo) marcado como reposici\xF3n \u2014 ver crearReposicion en
// inventory-store.js.
let reposicionOrderActual = null;
function abrirReposicionDesdePedido(orderId) {
  const order = allOrders.find(o => String(o.id) === String(orderId));
  if (!order || !order.items || !order.items.length) {
    alert("Este pedido no tiene art\xEDculos reconocidos para reponer.");
    return;
  }
  reposicionOrderActual = order;
  document.getElementById("reposicion-modal-texto").textContent = refLabel(order) + " \u2014 " + (order.name || "");
  document.getElementById("reposicion-item-select").innerHTML = order.items.map((item, i) => {
    const prod = catalogoProducts.find(p => p.productId === item.productId);
    const label = (prod ? prod.stockModel : (item.sku || "Art\xEDculo")) + (item.variantTitle ? " (" + item.variantTitle + ")" : "");
    return \`<option value="\${i}">\${escapeAttr(label)}</option>\`;
  }).join("");
  document.getElementById("reposicion-motivo").value = "";
  document.getElementById("reposicion-unidades").value = "1";
  document.getElementById("reposicion-modal-result").textContent = "";
  document.getElementById("reposicion-agencia-select").value = "";
  document.getElementById("reposicion-recogida-select").value = "";
  document.getElementById("reposicion-destino-select").value = "";
  document.getElementById("reposicion-colchon-agencia-block").style.display = "none";
  document.getElementById("reposicion-colchon-recogida-block").style.display = "none";
  document.getElementById("reposicion-colchon-destino-block").style.display = "none";
  activarCambioReposicion(false);
  cargarPiezasReposicion();
  document.getElementById("reposicion-modal-overlay").classList.add("open");
}
// Reposici\xF3n por CAMBIO de modelo/medida (Jennifer, 2026-10-07): "no es lo
// habitual", as\xED que va escondida tras un enlace peque\xF1o. Con el cambio
// activo, el art\xEDculo a reponer es el elegido aqu\xED (modelo del Cat\xE1logo +
// medida + color) en vez del del pedido \u2014 ver resolverItemReposicion en
// inventory-store.js. Todo lo dem\xE1s (piezas, SEUR/FURNITURE, recogida)
// funciona igual que una reposici\xF3n normal.
let reposicionCambioActivo = false;
const TIPOS_CON_COLOR_CAMBIO = ["Canap\xE9", "Canap\xE9 fijo", "Base", "Cabecero"];
function etiquetaItemReposicion(item) {
  const prod = catalogoProducts.find(p => p.productId === item.productId);
  return (prod ? prod.stockModel : (item.sku || "Art\xEDculo")) + (item.variantTitle ? " (" + item.variantTitle + ")" : "");
}
function rellenarTallasCambioReposicion() {
  const prod = catalogoProducts.find(p => String(p.productId) === document.getElementById("reposicion-cambio-modelo").value);
  document.getElementById("reposicion-cambio-tallas").innerHTML = ((prod && prod.tallas) || []).map(t => '<option value="' + escapeAttr(t) + '">').join("");
  document.getElementById("reposicion-cambio-color-block").style.display = prod && TIPOS_CON_COLOR_CAMBIO.includes(prod.product_type) ? "" : "none";
}
async function activarCambioReposicion(activo) {
  reposicionCambioActivo = activo;
  document.getElementById("reposicion-cambio-block").style.display = activo ? "" : "none";
  document.getElementById("reposicion-cambio-toggle").style.display = activo ? "none" : "";
  if (!activo) return;
  if (!catalogoProducts.length) {
    try { catalogoProducts = await (await fetch("/api/inventario/catalogo")).json(); } catch (e) { /* sin cat\xE1logo no hay modelos que elegir */ }
  }
  const item = reposicionOrderActual && reposicionOrderActual.items[Number(document.getElementById("reposicion-item-select").value)];
  const modelos = catalogoProducts.filter(p => p.product_type !== "Pack" && !p.excluido && p.stockModel)
    .sort((a, b) => (a.product_type || "").localeCompare(b.product_type || "") || a.stockModel.localeCompare(b.stockModel));
  const tipos = [...new Set(modelos.map(p => p.product_type || "Otros"))];
  document.getElementById("reposicion-cambio-modelo").innerHTML = tipos.map(t =>
    '<optgroup label="' + escapeAttr(t) + '">' + modelos.filter(p => (p.product_type || "Otros") === t)
      .map(p => '<option value="' + p.productId + '"' + (item && p.productId === item.productId ? " selected" : "") + ">" + escapeAttr(p.stockModel) + "</option>").join("") + "</optgroup>"
  ).join("");
  // Color de partida: el del art\xEDculo del pedido ("Beige / 160x200 cm").
  const partes = String((item && item.variantTitle) || "").split("/");
  document.getElementById("reposicion-cambio-color").value = partes.length > 1 ? partes[0].trim() : "";
  document.getElementById("reposicion-cambio-talla").value = "";
  rellenarTallasCambioReposicion();
  cargarPiezasReposicion();
}
function datosCambioReposicion() {
  if (!reposicionCambioActivo || !reposicionOrderActual) return null;
  const item = reposicionOrderActual.items[Number(document.getElementById("reposicion-item-select").value)];
  return {
    productId: Number(document.getElementById("reposicion-cambio-modelo").value),
    talla: document.getElementById("reposicion-cambio-talla").value.trim().toUpperCase(),
    color: document.getElementById("reposicion-cambio-color").value.trim(),
    de: item ? etiquetaItemReposicion(item) : "",
  };
}
document.getElementById("reposicion-cambio-toggle").addEventListener("click", () => activarCambioReposicion(true));
document.getElementById("reposicion-cambio-quitar").addEventListener("click", () => { activarCambioReposicion(false); cargarPiezasReposicion(); });
document.getElementById("reposicion-cambio-modelo").addEventListener("change", () => { rellenarTallasCambioReposicion(); cargarPiezasReposicion(); });
document.getElementById("reposicion-cambio-talla").addEventListener("change", cargarPiezasReposicion);
document.getElementById("reposicion-cambio-color").addEventListener("change", cargarPiezasReposicion);
// Al elegir el producto del pedido, se piden al servidor las piezas f\xEDsicas
// reales de ESE art\xEDculo (mismas reglas que la exportaci\xF3n a Furniture \u2014
// TAPA/CAJ\xD3N/FONDO/etc. para un canap\xE9, una sola opci\xF3n para lo dem\xE1s),
// en vez de dejar que Jennifer tenga que escribirlo a mano (Jennifer,
// 2026-09-21). Tambi\xE9n trae el "tipo" del art\xEDculo (Jennifer, 2026-09-22):
// si es "colchon", hay que ense\xF1ar la pregunta SEUR/FURNITURE \u2014 para
// cualquier otro tipo esa pregunta no aplica (siempre ha sido Furniture).
let ultimasPiezasReposicion = [];
let ultimoTipoReposicion = "";
async function cargarPiezasReposicion() {
  const piezaSelect = document.getElementById("reposicion-pieza-select");
  if (!reposicionOrderActual) return;
  const idx = Number(document.getElementById("reposicion-item-select").value);
  const item = reposicionOrderActual.items[idx];
  if (!item) return;
  piezaSelect.style.display = "";
  document.getElementById("reposicion-piezas-checks").style.display = "none";
  const cambio = datosCambioReposicion();
  if (cambio && !cambio.talla) {
    piezaSelect.innerHTML = '<option value="">Elige primero la medida nueva</option>';
    ultimasPiezasReposicion = [];
    return;
  }
  piezaSelect.innerHTML = "<option>Cargando piezas...</option>";
  const res = await fetch("/api/inventario/reposicion/piezas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ item, services: reposicionOrderActual.services, productoTexto: reposicionOrderActual.product, cambio }),
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
    piezaSelect.innerHTML = \`<option value="">(sin desglose \u2014 se pedir\xE1 el art\xEDculo completo)</option>\`;
    return;
  }
  // value = \xEDndice dentro de ultimasPiezasReposicion (Jennifer, 2026-09-21):
  // "parte" (ej. "TAPA") pasa a ser el Modelo de la reposici\xF3n; "texto" es
  // la l\xEDnea completa con modelo/medida/color, solo para que se vea clara
  // en el desplegable y quede apuntada en la mercanc\xEDa a pedir.
  piezaSelect.innerHTML = ultimasPiezasReposicion.map((p, i) => \`<option value="\${i}">\${escapeAttr(p.texto)}</option>\`).join("");
  // Varias piezas o el canap\xE9 entero (Jennifer, 2026-10-07): si el art\xEDculo
  // se descompone en varias piezas, casillas en vez del desplegable \u2014 todo
  // va en UNA reposici\xF3n (misma referencia, mismo pedido a f\xE1brica y mismo
  // env\xEDo).
  const checks = document.getElementById("reposicion-piezas-checks");
  const variasPiezas = ultimasPiezasReposicion.length > 1;
  piezaSelect.style.display = variasPiezas ? "none" : "";
  checks.style.display = variasPiezas ? "" : "none";
  checks.innerHTML = !variasPiezas ? "" :
    '<label style="display:block;padding:4px 0;font-weight:700"><input type="checkbox" id="reposicion-canape-completo"> CANAP\xC9 COMPLETO (todas las piezas)</label>'
    + ultimasPiezasReposicion.map((p, i) => '<label style="display:block;padding:3px 0;font-size:13px"><input type="checkbox" class="reposicion-pieza-check" value="' + i + '"> ' + escapeAttr(p.texto) + "</label>").join("");
}
document.getElementById("reposicion-piezas-checks").addEventListener("change", (e) => {
  // "Canap\xE9 completo" marca/desmarca todas las piezas de golpe.
  if (e.target.id === "reposicion-canape-completo") {
    document.querySelectorAll(".reposicion-pieza-check").forEach(c => { c.checked = e.target.checked; c.disabled = e.target.checked; });
  }
});
document.getElementById("reposicion-item-select").addEventListener("change", cargarPiezasReposicion);
// SEUR nunca hace recogidas (Jennifer, 2026-09-22) \u2014 la pregunta de
// recogida solo tiene sentido si se eligi\xF3 FURNITURE; y la pregunta de
// destino solo si adem\xE1s se contest\xF3 "S\xED" a la recogida.
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
  const resultEl = document.getElementById("reposicion-modal-result");
  // Piezas elegidas: casillas si el art\xEDculo tiene varias (canap\xE9/base),
  // desplegable si solo tiene una.
  const conCasillas = document.getElementById("reposicion-piezas-checks").style.display !== "none";
  const canapeCompleto = conCasillas && !!document.getElementById("reposicion-canape-completo")?.checked;
  let piezasIdx = conCasillas
    ? [...document.querySelectorAll(".reposicion-pieza-check:checked")].map(c => Number(c.value))
    : (document.getElementById("reposicion-pieza-select").value !== "" ? [Number(document.getElementById("reposicion-pieza-select").value)] : []);
  if (canapeCompleto) piezasIdx = ultimasPiezasReposicion.map((p, i) => i);
  if (conCasillas && !piezasIdx.length) {
    resultEl.textContent = "Marca las piezas a reponer (o CANAP\xC9 COMPLETO).";
    return;
  }
  const piezasElegidas = piezasIdx.map(i => ultimasPiezasReposicion[i]).filter(Boolean);
  const piezaElegida = piezasElegidas.length === 1 ? piezasElegidas[0] : null;
  const nota = document.getElementById("reposicion-motivo").value.trim();
  const textoPiezas = canapeCompleto ? "CANAP\xC9 COMPLETO" : piezasElegidas.map(p => p.texto).join(" + ");
  const piezaTexto = [textoPiezas, nota].filter(Boolean).join(" \xB7 ");
  // Validaci\xF3n espec\xEDfica de colch\xF3n (Jennifer, 2026-09-22): sin esto no se
  // sabe si va por SEUR o Furniture, ni si hace falta recogida.
  const agenciaReposicion = document.getElementById("reposicion-agencia-select").value;
  const recogidaValue = document.getElementById("reposicion-recogida-select").value;
  const recogidaDestino = document.getElementById("reposicion-destino-select").value;
  const cambio = datosCambioReposicion();
  if (cambio && (!cambio.productId || !cambio.talla)) {
    resultEl.textContent = "Para un cambio, elige el modelo y la medida nuevos.";
    return;
  }
  const unidades = Math.floor(Number(document.getElementById("reposicion-unidades").value));
  if (!(unidades >= 1 && unidades <= 20)) {
    resultEl.textContent = "Indica cu\xE1ntas unidades (de 1 a 20).";
    return;
  }
  if (ultimoTipoReposicion === "colchon") {
    if (!agenciaReposicion) {
      resultEl.textContent = "Indica si el colch\xF3n sale por SEUR o por FURNITURE.";
      return;
    }
    if (agenciaReposicion === "FURNITURE" && !recogidaValue) {
      resultEl.textContent = "Indica si tiene recogida del colch\xF3n antiguo.";
      return;
    }
    if (recogidaValue === "si" && !recogidaDestino) {
      resultEl.textContent = "Indica si el colch\xF3n recogido vuelve a nuestras instalaciones o es para desechar.";
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
      // "parte" (ej. "TAPA") pasa a ser el Modelo de la reposici\xF3n en vez
      // del nombre completo del canap\xE9 (Jennifer, 2026-09-21) \u2014 las dem\xE1s
      // caracter\xEDsticas (medida, color) se conservan igual, vienen del
      // propio art\xEDculo resuelto en el servidor.
      parte: piezaElegida?.parte || null,
      // Varias piezas / canap\xE9 completo (Jennifer, 2026-10-07).
      piezas: conCasillas ? piezasElegidas.map(p => p.parte) : null,
      piezasIdx: conCasillas ? piezasIdx : null,
      canapeCompleto,
      // Para pedir el canap\xE9 completo con la receta normal (tapa partida o
      // reforzada, color desde el texto si el pedido no lo trae).
      services: reposicionOrderActual.services || "",
      productoTexto: reposicionOrderActual.product || "",
      agenciaReposicion: ultimoTipoReposicion === "colchon" ? agenciaReposicion : null,
      recogida: recogidaValue === "si",
      recogidaDestino: recogidaValue === "si" ? recogidaDestino : null,
      cambio,
      unidades,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.ok) {
    resultEl.textContent = body.error || "No se ha podido registrar la reposici\xF3n.";
    return;
  }
  cerrarModalReposicion();
  // Stock parcial (Jennifer, 2026-10-07): avisar de cu\xE1ntas salen de stock.
  const deStock = Number(body.enStock) || 0;
  alert(deStock > 0
    ? "Reposici\xF3n registrada (una sola l\xEDnea de " + unidades + " ud.) \u2014 " + deStock + " ya en stock" + (unidades > deStock ? ", pedir " + (unidades - deStock) + " a f\xE1brica." : " (no hace falta pedir a f\xE1brica).")
    : "Reposici\xF3n registrada \u2014 ya est\xE1 en Proveedores pendientes.");
  await loadOrders();
  if (document.getElementById("view-pendientes").style.display !== "none") loadPendientes();
});

// Gesto comercial (Jennifer, 2026-09-22): almohada(s) de regalo por un da\xF1o
// que no compensa gestionar como cambio de pieza, o por un retraso. Solo
// los 4 modelos que se trabajan para esto (nunca L\xE1tex Natural) \u2014 mismo
// cat\xE1logo ya cargado en catalogoProducts, filtrado por palabra clave del
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
  document.getElementById("gesto-comercial-modal-texto").textContent = refLabel(order) + " \u2014 " + (order.name || "");
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
    ? "Gesto comercial registrado \u2014 cubierto con stock real, ya est\xE1 en Furniture pendientes."
    : "Gesto comercial registrado \u2014 " + (cantidad - body.cubiertoConStock) + " ud. quedan en Proveedores pendientes (" + body.referencia + ").");
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
  if (transformarDesde && !confirm("\xBFTransformar un " + b.stockModel + " " + transformarDesde + " en " + b.talla + " para " + refLabel(b) + "?\\n\\nSe descuenta " + (b.cantidad || 1) + " del stock de " + transformarDesde + " y el colch\xF3n sale por FURNITURE (va abierto, nunca por SEUR).")) return;
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
      ? "Transformaci\xF3n registrada. Se ha enviado el aviso por email al almac\xE9n."
      : "Transformaci\xF3n registrada, pero NO se ha podido enviar el email al almac\xE9n (" + ((data.avisoAlmacen && data.avisoAlmacen.reason) || "error") + "). Av\xEDsales t\xFA, por favor.");
    // El pedido ha podido pasar de SEUR a FURNITURE: se recarga todo y, si
    // ya est\xE1 todo lo del pedido listo, sube solo a la carga de Furniture.
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

// Fecha programada para un colch\xF3n por SEUR que a\xFAn no ha llegado (Jennifer,
// 2026-10-06, 012517739-A: llega el 09/10 pero el cliente no est\xE1 hasta la
// semana del 03/11). Se guarda como retenci\xF3n del pedido; al marcarlo
// recibido va directo a la carga de ese d\xEDa.
let seurFechaModo = "preparar";
function fechaProgramadaSeur(b) {
  const o = allOrders.find(x => x.id === b.orderId);
  const r = o ? retencionDe(o) : null;
  return r && r.hasta && r.hasta >= hoyMadrid() ? r.hasta : null;
}
function fechaProgramadaSeurTag(b) {
  const f = fechaProgramadaSeur(b);
  return f ? ' <span class="badge" style="background:#ede9fe;color:#5b21b6" title="Al marcarlo recibido ir\xE1 a la carga de SEUR de ese d\xEDa">\u{1F4C5} Sale el ' + f.slice(8, 10) + "/" + f.slice(5, 7) + "</span>" : "";
}
function abrirModalFechaSeur(id, modo) {
  const b = backorders.find(x => x.id === id);
  if (!b) return;
  seurFechaModo = modo === "programar" ? "programar" : "preparar";
  const programada = fechaProgramadaSeur(b);
  document.getElementById("seur-fecha-modal-titulo").textContent = seurFechaModo === "programar" ? "\xBFEn qu\xE9 carga de SEUR saldr\xE1 cuando llegue?" : "\xBFEn qu\xE9 carga de SEUR sale?";
  document.getElementById("seur-fecha-ok-btn").textContent = seurFechaModo === "programar" ? "Guardar fecha (sin marcar recibido)" : "Preparar para ese d\xEDa";
  document.getElementById("seur-fecha-quitar-btn").style.display = seurFechaModo === "programar" && programada ? "" : "none";
  seurFechaModalBackorderId = id;
  document.getElementById("seur-fecha-modal-texto").textContent = refLabel(b) + " \u2014 " + b.cantidad + "x " + b.stockModel + " (" + b.talla + ")";
  const input = document.getElementById("seur-fecha-input");
  input.min = hoyMadrid();
  input.value = programada || primerDiaSeur();
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
  if (seurFechaModo === "programar") { programarFechaSeur(fecha); return; }
  confirmarFechaSeur(fecha);
});
async function programarFechaSeur(fecha) {
  const b = backorders.find(x => x.id === seurFechaModalBackorderId);
  cerrarModalFechaSeur();
  if (!b) return;
  await guardarRetencion([b.orderId], fecha ? { hasta: fecha } : null);
  mostrarAvisoBreve(fecha ? refLabel(b) + ": cuando llegue, saldr\xE1 en la carga de SEUR del " + fecha.slice(8, 10) + "/" + fecha.slice(5, 7) + "." : refLabel(b) + ": fecha quitada.");
  loadPendientes();
}
document.getElementById("seur-fecha-quitar-btn").addEventListener("click", () => programarFechaSeur(null));

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
    ? \`<span class="aviso-fabrica-tag">\u26A0 Ya se pidi\xF3 a f\xE1brica el \${formatFechaAviso(a.fechaPedidoFabrica)} \u2014 llama para cancelarlo</span>\`
    : "";
  const resueltoTag = resuelto
    ? \`<span class="aviso-resuelto-tag">Resuelto el \${formatFechaAviso(a.fechaCancelado)}</span>\`
    : \`<button type="button" class="secondary aviso-resolver-btn" data-id="\${a.backorderId}" data-generado="\${a.pedidoGenerado}">Marcar resuelto</button>\`;
  return \`
    <div class="aviso-cancelado-card\${resuelto ? " resuelto" : ""}">
      <div class="aviso-titulo">\${refLabel(a)} \u2014 \${a.name || ""}</div>
      <div class="aviso-detalle">\${a.proveedor || "\u2014"} \xB7 \${a.stockModel} \${a.talla} \xB7 \${a.cantidad} ud.</div>
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
    : '<p style="color:var(--muted);font-size:13px">Nada resuelto todav\xEDa.</p>';
  document.querySelectorAll(".aviso-resolver-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const generado = btn.dataset.generado === "true";
      const msg = generado
        ? "Este pendiente YA se pidi\xF3 a f\xE1brica \u2014 aseg\xFArate de haber llamado al proveedor para cancelarlo antes de continuar. \xBFConfirmas que ya est\xE1 resuelto?"
        : "\xBFConfirmas que este pendiente ya est\xE1 resuelto?";
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

// Buscador general de pedidos (Jennifer, 2026-10-09: "si busco el pedido
// BEZEN12158, que me salga todo lo relacionado con este pedido en todos los
// puntos del sistema y me d\xE9 un hist\xF3rico"). Se monta con lo que ya guarda
// la app; no hay un registro aparte.
const normBusca = x => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
function fechaBusca(x) {
  if (!x) return 0;
  const s = String(x).trim();
  const m = /^([0-9]{1,2})[-/]([0-9]{1,2})[-/]([0-9]{4})/.exec(s);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12).getTime();
  const t = Date.parse(s.length === 10 ? s + "T12:00:00" : s);
  return Number.isNaN(t) ? 0 : t;
}
function fechaHoraBusca(t, soloDia) {
  if (!t) return "";
  const d = new Date(t);
  // Las fechas sin hora (Furniture, SEUR) se guardan a las 12:00 en punto.
  if (d.getHours() === 12 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0) soloDia = true;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) + (soloDia ? "" : " " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }));
}
let buscadorDatos = null;
async function cargarDatosBuscador() {
  const j = u => fetch(u).then(r => r.json()).catch(() => []);
  const [orders, bos, cargas, movs, casosL, tareasL] = await Promise.all([
    j("/api/pedidos/shopify"), j("/api/inventario/pendientes"), j("/api/cargas"), j("/api/inventario/movimientos"), j("/api/casos"), j("/api/tareas"),
  ]);
  buscadorDatos = { orders, bos, cargas, movs, casos: casosL, tareas: tareasL };
  return buscadorDatos;
}
function pedidosQueCoinciden(q, d) {
  const n = normBusca(q);
  if (!n) return [];
  const sinPrefijo = n.replace(/^(REP|GC)/, "");
  const texto = q.trim().toLowerCase();
  return d.orders.filter(o => {
    const refs = [refLabel(o), o.orderRef, "BEZEN" + o.orderNumber, o.orderNumber].map(normBusca).filter(Boolean);
    if (refs.some(r => r === n || r === sinPrefijo)) return true;
    // Referencias de SEUR ("\u20262", "GCBEZEN\u2026", la cambiada a mano).
    const seur = (o.seurTracking || []).map(t => t.referencia).concat(Object.keys(o.enviosSeurInfo || {}), Object.values(o.enviosSeurInfo || {}).map(i => i.refSeur)).map(normBusca).filter(Boolean);
    if (seur.some(r => r === n)) return true;
    if (sinPrefijo.length >= 5 && refs.some(r => r.includes(sinPrefijo))) return true;
    if (texto.length >= 4 && /[a-z]/.test(texto) && (o.name || "").toLowerCase().includes(texto)) return true;
    const tel = n.replace(/^34/, "");
    if (/^[0-9]{9,}$/.test(tel) && normBusca(o.phone).endsWith(tel)) return true;
    if (texto.includes("@") && (o.email || "").toLowerCase() === texto) return true;
    return false;
  });
}
function nombreArticuloBusca(b) {
  const tipo = b.tipo === "colchon" ? "Colch\xF3n" : b.tipo === "almohada" ? "Almohada" : b.tipo === "canape" ? "Canap\xE9" : b.tipo === "base" ? "Base" : (b.tipo || "");
  const modelo = nombreCortoModelo(b.stockModel);
  return [modelo.toLowerCase().startsWith(tipo.toLowerCase()) ? "" : tipo, modelo, b.talla, b.color].filter(Boolean).join(" ") + (b.cantidad > 1 ? " (" + b.cantidad + " ud.)" : "");
}
function fichaPedidoBuscador(o, d) {
  const ref = refLabel(o);
  const cargaDe = id => d.cargas.find(c => c.id === id);
  const textoCarga = c => c ? ((c.tipo === "seur" ? "SEUR" : "Furniture") + " del " + (c.dia ? c.dia.toLowerCase() + " " : "") + fechaHoraBusca(fechaBusca(c.fecha), true) + (c.estado === "cerrada" ? " (ya sali\xF3)" : " (abierta)")) : "";
  const bos = d.bos.filter(b => String(b.orderId) === String(o.id));
  const ev = [];
  // link: enlace de seguimiento de SEUR/Furniture para pinchar desde el
  // hist\xF3rico (Jennifer, 2026-10-09).
  const add = (t, texto, quien, link, linkTxt) => { if (t) ev.push({ t, texto, quien: quien || "", link: link || "", linkTxt: linkTxt || "" }); };

  add(fechaBusca(o.orderDate), "Pedido recibido en " + (o.platform || "Shopify") + (o.price ? " \xB7 " + o.price + " " + (o.currency || "EUR") : ""));
  add(fechaBusca(o.fechaTramitacion), "Pedido tramitado en la app");
  add(fechaBusca(o.noSalioSeur), "Marcado como \xABno sali\xF3\xBB en SEUR");
  if (o.recogeCliente) add(fechaBusca(o.recogeCliente.fecha), "Marcado \xABviene el cliente a recogerlo\xBB", o.recogeCliente.usuario);
  if (o.entregadoCliente) add(fechaBusca(o.entregadoCliente.fecha), "Entregado al cliente en mano", o.entregadoCliente.usuario);
  for (const b of bos) {
    const art = nombreArticuloBusca(b) + (b.referencia ? " [" + b.referencia + "]" : "");
    const prov = b.proveedor ? " \xB7 " + b.proveedor : "";
    add(fechaBusca(b.fecha), (b.reposicion ? "Reposici\xF3n creada: " : b.gestoComercial ? "Gesto comercial creado: " : "Art\xEDculo pendiente creado: ") + art + prov, b.creadoPor);
    add(fechaBusca(b.fechaPedidoFabrica), "Pedido a f\xE1brica" + prov + ": " + art);
    add(fechaBusca(b.fechaRecibido), "Recibido de f\xE1brica: " + art);
    add(fechaBusca(b.reservaEnviada), "Email de reserva al almac\xE9n: " + art);
    add(fechaBusca(b.fechaCancelado), "Cancelado: " + art);
    add(fechaBusca(b.fechaTransformacion), "Transformado: " + art);
  }
  const movs = d.movs.filter(m => m.orderNumber && String(m.orderNumber) === String(o.orderNumber) && (m.platform || "Shopify") === (o.platform || "Shopify") && (!o.orderRef || !m.orderRef || m.orderRef === o.orderRef));
  for (const m of movs) add(fechaBusca(m.fecha), "Stock " + (m.delta > 0 ? "+" : "") + m.delta + " " + (m.campo === "vendidoPendiente" ? "vendido pendiente" : "unidades") + ": " + nombreCortoModelo(m.stockModel) + " " + (m.talla || "") + (m.origen ? " (" + m.origen + ")" : ""), m.usuario);
  // Cargas en las que ha salido (las cerradas guardan sus env\xEDos).
  for (const c of d.cargas) {
    const envs = (c.envios || []).filter(e => String(e.orderId) === String(o.id));
    for (const e of envs) add(fechaBusca(c.fechaCierre || c.fecha), "Sali\xF3 en la carga de " + textoCarga(c) + " con referencia " + e.ref + (e.observaciones ? " \xB7 " + e.observaciones : ""));
    if (!envs.length && c.estado === "cerrada" && (o.cargaId === c.id || bos.some(b => b.cargaId === c.id))) add(fechaBusca(c.fechaCierre || c.fecha), "Sali\xF3 en la carga de " + textoCarga(c));
  }
  for (const t of o.furnitureTracking || []) {
    add(fechaBusca(t.fechaAlmacen), "Furniture: en almac\xE9n (albar\xE1n " + (t.albaran || "") + ")", "", t.seguimiento, "Ver en Furniture");
    if (t.estado) add(fechaBusca(t.fechaPrevista) || fechaBusca(t.fechaAlmacen), "Furniture: " + t.estado, "", t.seguimiento, "Ver en Furniture");
  }
  for (const t of o.seurTracking || []) {
    if (t.anulado) continue;
    add(fechaBusca(t.fechaCreacion), "SEUR: env\xEDo registrado con referencia " + t.referencia + (t.numeroExpedicion ? " (expedici\xF3n " + t.numeroExpedicion + ")" : ""), "", t.seguimiento, "Ver en SEUR");
    if (t.estado && t.fechaSituacion) add(fechaBusca(t.fechaSituacion) + 1, "SEUR " + t.referencia + ": " + t.estado, "", t.seguimiento, "Ver en SEUR");
  }
  for (const [r, info] of Object.entries(o.enviosSeurInfo || {})) {
    add(fechaBusca(info.fechaReclamado), "Reclamado a SEUR (" + (info.refSeur || r) + ")");
    add(fechaBusca(info.fechaArchivado), "Env\xEDo SEUR archivado (" + (info.refSeur || r) + ")");
    for (const msg of (info.correo && info.correo.mensajes) || []) add(fechaBusca(msg.fecha), (msg.deSeur ? "Email de SEUR: " : "Email a SEUR: ") + (msg.asunto || ""));
  }
  const casosP = d.casos.filter(c => String(c.pedidoId) === String(o.id) || normBusca(c.pedidoRef) === normBusca(ref));
  for (const c of casosP) for (const nota of c.notas || []) add(fechaBusca(nota.fecha), "Caso \xAB" + (c.motivo || "") + "\xBB: " + nota.texto, nota.autor);
  const tareasP = d.tareas.filter(t => String(t.pedidoId) === String(o.id) || normBusca(t.pedidoRef) === normBusca(ref));
  for (const t of tareasP) {
    add(fechaBusca(t.creado), "Tarea creada: " + t.texto + (t.fecha ? " (para el " + fechaHoraBusca(fechaBusca(t.fecha), true) + ")" : ""), t.creadoPor);
    add(fechaBusca(t.fechaHecha), "Tarea hecha: " + t.texto, t.hechaPor);
  }
  ev.sort((a, b) => a.t - b.t);

  // D\xF3nde est\xE1 ahora.
  const donde = [];
  if (o.cancelado || o.shopifyCancelado) donde.push("\u274C Pedido CANCELADO");
  donde.push("\u{1F4E6} Pedidos \xB7 " + (o.platform || "Shopify") + (o.agencia ? " \u2014 agencia " + o.agencia : "") + (o.shippingStatus === "fulfilled" || o.shopifyFulfilled ? " \u2014 enviado" : ""));
  if (o.cargaId) donde.push("\u{1F69A} En la carga de " + textoCarga(cargaDe(o.cargaId)));
  if (o.retenido) donde.push("\u23F8 Retenido" + (o.retenido.hasta ? " hasta el " + fechaHoraBusca(fechaBusca(o.retenido.hasta), true) : ""));
  if (o.recogeCliente) donde.push("\u{1F64B} Lo recoge el cliente" + (o.entregadoCliente ? " (ya entregado)" : ""));
  for (const b of bos) {
    let txt;
    if (b.estado === "pendiente") txt = "\u{1F3ED} Proveedores \xB7 " + (b.proveedor || "sin proveedor") + ": " + nombreArticuloBusca(b) + " \u2014 " + (b.recibidoFabrica ? "recibido de f\xE1brica" : b.pedidoGenerado ? "pedido a f\xE1brica, esperando" : "SIN PEDIR a f\xE1brica") + (b.tipoEnvio ? " \xB7 " + b.tipoEnvio : "") + (b.reservaEnviada ? " \xB7 reservado en almac\xE9n" : "");
    else if (b.estado === "listo-seur") txt = "\u{1F69A} " + nombreArticuloBusca(b) + " \u2014 preparado para la carga de " + textoCarga(cargaDe(b.cargaId));
    else if (b.estado === "cubierto") txt = "\u2705 " + nombreArticuloBusca(b) + " \u2014 cubierto con stock";
    else if (b.estado === "servido") txt = "\u2714 " + nombreArticuloBusca(b) + " \u2014 ya enviado";
    else if (b.estado === "cancelado") txt = "\u274C " + nombreArticuloBusca(b) + " \u2014 cancelado";
    else txt = nombreArticuloBusca(b) + " \u2014 " + b.estado;
    donde.push(txt + (b.referencia ? " [" + b.referencia + "]" : "") + (b.refSuffix ? " \xB7 env\xEDo " + b.refSuffix : ""));
  }
  for (const c of casosP) donde.push("\u{1F4CB} Caso: " + (c.motivo || "") + " \u2014 " + (c.estado === "cerrado" ? "cerrado" : "ABIERTO"));
  for (const t of tareasP) donde.push("\u{1F4DD} Tarea: " + t.texto + " \u2014 " + (t.hecha ? "hecha" : "pendiente"));

  const notasSeur = Object.entries(o.enviosSeurInfo || {}).filter(([, i]) => (i.nota || "").trim() || i.refSeur)
    .map(([r, i]) => "<li><strong>" + escapeAttr(i.refSeur || r) + "</strong>" + (i.refSeur ? ' <span style="color:var(--muted)">(antes ' + escapeAttr(r) + ")</span>" : "") + (i.nota ? ": " + escapeAttr(i.nota) : "") + "</li>").join("");
  const segLinea = (link, txt, estado) => '<div><a href="' + escapeAttr(link) + '" target="_blank" rel="noopener">' + escapeAttr(txt) + "</a>" + (estado ? ' <span class="buscador-seg-estado">' + escapeAttr(estado) + "</span>" : "") + "</div>";
  const segs = (o.seurTracking || []).filter(t => !t.anulado && t.seguimiento).map(t => segLinea(t.seguimiento, "SEUR " + t.referencia, t.estado))
    .concat((o.furnitureTracking || []).filter(t => t.seguimiento).map(t => segLinea(t.seguimiento, "Furniture " + (t.albaran || ""), t.estado)));
  // Casos abiertos y tareas pendientes del pedido, a la vista (Jennifer,
  // 2026-10-09).
  const pendientesAgenda = casosP.filter(c => c.estado !== "cerrado").map(c => {
    const u = ultimoSeguimiento(c);
    return "<li><strong>\u{1F4CB} Caso abierto" + (c.urgente ? " URGENTE" : "") + ":</strong> " + escapeAttr(c.motivo || "") + (c.responsable ? " \xB7 " + escapeAttr(c.responsable) : "") +
      (u && u.texto ? '<div style="color:var(--muted);font-size:12px">\xDAltimo: ' + escapeAttr(u.texto) + (u.fecha ? " (" + escapeAttr(fechaHoraBusca(fechaBusca(u.fecha))) + ")" : "") + "</div>" : "") + "</li>";
  }).concat(tareasP.filter(t => !t.hecha).map(t =>
    "<li><strong>\u{1F4DD} Tarea pendiente" + (t.fecha ? " para el " + escapeAttr(fechaHoraBusca(fechaBusca(t.fecha), true)) : "") + ":</strong> " + escapeAttr(t.texto || "") + "</li>"));

  // "TODAV\xCDA NO SE HA ENVIADO" bien grande (Jennifer, 2026-10-09) si no ha
  // salido en ninguna carga ni hay seguimiento, entrega en mano o env\xEDo
  // marcado en la tienda.
  const cargaCerrada = id => { const c = cargaDe(id); return !!(c && c.estado === "cerrada"); };
  // Salida real (carga cerrada, seguimiento, entregado en mano). El "enviado"
  // de la tienda solo cuenta si no est\xE1 metido en una carga abierta (Worten
  // 83651443-A sal\xEDa "Enviado" sin haber salido nunca).
  const enviadoReal = (o.cargaId && cargaCerrada(o.cargaId)) ||
    d.cargas.some(c => (c.envios || []).some(e => String(e.orderId) === String(o.id))) ||
    bos.some(b => b.estado === "servido" || (b.cargaId && cargaCerrada(b.cargaId))) ||
    // Etiqueta solo "registrada" en SEUR = subida, pero a\xFAn no recogida.
    (o.seurTracking || []).some(t => !t.anulado && !/registrado/i.test(t.estado || "")) || (o.furnitureTracking || []).length > 0 ||
    !!o.entregadoCliente;
  const abiertas = [o.cargaId].concat(bos.filter(b => b.estado !== "cancelado" && b.estado !== "servido").map(b => b.cargaId)).filter(Boolean).map(cargaDe).filter(c => c && c.estado === "abierta");
  // Estados de marketplace: "Enviado"/"Recibido" (lo recibi\xF3 el cliente)...
  // pedidos de antes de la app que no pasaron por ninguna carga.
  const enviado = enviadoReal || o.shippingStatus === "fulfilled" || !!o.shopifyFulfilled || !!o.gestionadoExterno ||
    /^(enviado|recibido|cerrado|incidencia abierta)$/i.test(o.estado || "");
  const cancelado = o.cancelado || o.shopifyCancelado || o.shippingStatus === "restocked" || /^(cancelado|rechazado|reembolsado)$/i.test(o.estado || "");
  let aviso = "";
  if (cancelado) aviso = '<div class="buscador-aviso" style="background:#fee2e2;color:#991b1b;border-color:#fca5a5">\u274C PEDIDO ' + escapeAttr(/^(rechazado|reembolsado)$/i.test(o.estado || "") ? o.estado.toUpperCase() : o.shippingStatus === "restocked" ? "DEVUELTO" : "CANCELADO") + '</div>';
  else if (!enviado || abiertas.length) {
    aviso = '<div class="buscador-aviso">' + (enviadoReal ? "\u26A0 QUEDA ALGO POR ENVIAR" : "\u26A0 TODAV\xCDA NO SE HA ENVIADO") +
      (abiertas.length ? '<div style="font-size:14px;font-weight:600;margin-top:4px">Metido en la carga de ' + escapeAttr(textoCarga(abiertas[0])) + "</div>" : '<div style="font-size:14px;font-weight:600;margin-top:4px">No est\xE1 en ninguna carga</div>') +
      "</div>";
  }

  return '<div class="buscador-ficha">' +
    '<h3 style="margin:0 0 4px">' + escapeAttr(ref) + ' <span style="font-weight:400;color:var(--muted);font-size:13px">' + escapeAttr(o.platform || "Shopify") + " \xB7 " + escapeAttr(formatOrderDate(o.orderDate)) + "</span></h3>" +
    aviso +
    (pendientesAgenda.length ? '<div class="buscador-agenda"><ul>' + pendientesAgenda.join("") + "</ul></div>" : "") +
    (segs.length ? '<div class="buscador-seg"><div class="buscador-seg-tit">SEGUIMIENTO</div>' + segs.join("") + "</div>" : "") +
    '<div class="buscador-datos">' +
      "<div><strong>" + escapeAttr(o.name || "") + "</strong> \xB7 " + escapeAttr(o.phone || "") + (o.email ? " \xB7 " + escapeAttr(o.email) : "") + "</div>" +
      "<div>" + escapeAttr(o.address || "") + "</div>" +
      "<div>" + escapeAttr(o.product || "") + "</div>" +
      (o.services ? '<div style="color:var(--muted)">' + escapeAttr(o.services) + "</div>" : "") +
      "<div>" + escapeAttr([o.paymentMethod, o.paymentStatus].filter(Boolean).join(" \xB7 ")) + "</div>" +
      ((o.notas || "").trim() ? '<div class="buscador-nota">\u{1F4DD} ' + escapeAttr(o.notas) + "</div>" : "") +
      (notasSeur ? '<div class="buscador-nota">Env\xEDos SEUR:<ul style="margin:2px 0 0 18px;padding:0">' + notasSeur + "</ul></div>" : "") +
    "</div>" +
    '<h4>D\xF3nde est\xE1 ahora</h4><ul class="buscador-donde">' + donde.map(x => "<li>" + escapeAttr(x) + "</li>").join("") + "</ul>" +
    "<h4>Hist\xF3rico</h4>" +
    (ev.length ? '<table class="buscador-historico"><tbody>' + ev.map(e => '<tr><td style="white-space:nowrap;color:var(--muted)">' + fechaHoraBusca(e.t) + "</td><td>" + escapeAttr(e.texto) + (e.link ? ' <a href="' + escapeAttr(e.link) + '" target="_blank" rel="noopener" class="tracking-link">' + e.linkTxt + "</a>" : "") + (e.quien ? ' <span style="color:var(--muted);font-size:11px">\xB7 ' + escapeAttr(e.quien) + "</span>" : "") + "</td></tr>").join("") + "</tbody></table>" : '<p style="color:var(--muted)">Sin movimientos guardados.</p>') +
    "</div>";
}
async function buscarPedidoGeneral(q) {
  const overlay = document.getElementById("buscador-modal-overlay");
  const cont = document.getElementById("buscador-resultado");
  document.getElementById("buscador-titulo").textContent = "Buscar: " + q;
  cont.innerHTML = '<p style="color:var(--muted)">Buscando\u2026</p>';
  overlay.classList.add("open");
  const d = await cargarDatosBuscador();
  const encontrados = pedidosQueCoinciden(q, d);
  if (!encontrados.length) { cont.innerHTML = '<p>No he encontrado ning\xFAn pedido con \xAB' + escapeAttr(q) + '\xBB. Prueba con el n\xBA de pedido, la referencia, el nombre o el tel\xE9fono.</p>'; return; }
  if (encontrados.length === 1) { cont.innerHTML = fichaPedidoBuscador(encontrados[0], d); return; }
  encontrados.sort((a, b) => parseFechaGenerica(b.orderDate) - parseFechaGenerica(a.orderDate));
  cont.innerHTML = "<p>" + encontrados.length + " pedidos coinciden:</p>" + encontrados.slice(0, 50).map(o =>
    '<button type="button" class="secondary buscador-elegir" data-id="' + escapeAttr(String(o.id)) + '" style="display:block;width:100%;text-align:left;margin:4px 0">' +
    "<strong>" + escapeAttr(refLabel(o)) + "</strong> \xB7 " + escapeAttr(o.name || "") + " \xB7 " + escapeAttr(formatOrderDate(o.orderDate)) + ' <span style="color:var(--muted)">' + escapeAttr(o.product || "") + "</span></button>").join("");
  cont.querySelectorAll(".buscador-elegir").forEach(btn => btn.addEventListener("click", () => {
    const o = d.orders.find(x => String(x.id) === btn.dataset.id);
    if (o) cont.innerHTML = fichaPedidoBuscador(o, d);
  }));
}
document.getElementById("buscador-general").addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const q = e.target.value.trim();
  if (q) buscarPedidoGeneral(q);
});
document.getElementById("buscador-cerrar-btn").addEventListener("click", () => document.getElementById("buscador-modal-overlay").classList.remove("open"));
document.getElementById("buscador-modal-overlay").addEventListener("click", e => {
  if (e.target.id === "buscador-modal-overlay") e.currentTarget.classList.remove("open");
});

// Agenda de casos (Jennifer, 2026-10-05): "casos que nos llaman clientes y
// Sergio y yo tenemos que estar pendientes" \u2014 agenda com\xFAn. Siempre a la
// vista el pedido (con lo que lleva y en qu\xE9 est\xE1), cliente, tel\xE9fono,
// motivo y el \xFAltimo seguimiento (fecha, qui\xE9n y qu\xE9). Los que m\xE1s tiempo
// llevan sin seguimiento, arriba.
let casos = [];
let casoEditando = null;
async function loadCasos() {
  try { casos = await (await fetch("/api/casos")).json(); } catch (e) { return; }
  const abiertos = casos.filter(c => casoPorRevisar(c) && esDeMiAgenda(c.responsable)).length;
  const badge = document.getElementById("casos-badge");
  badge.style.display = abiertos ? "" : "none";
  badge.textContent = abiertos;
  badge.style.background = casos.some(c => c.urgente && c.estado !== "cerrado" && esDeMiAgenda(c.responsable)) ? "#dc2626" : "#0d9488";
  if (document.getElementById("view-casos").style.display !== "none") renderCasos();
}
// Revisado hoy (Jennifer, 2026-10-05): "si ya se ha revisado un d\xEDa, que
// ya no salga para revisar hasta el d\xEDa siguiente".
function revisadoHoy(c) {
  const u = ultimoSeguimiento(c);
  return !u.sistema && !!u.fecha && haceDias(u.fecha).n <= 0;
}
// Cada uno ve por defecto lo suyo y lo de los dos (Jennifer, 2026-10-06:
// "las tareas de Sergio solo las quiero ver cuando Sergio no haya venido").
function esDeMiAgenda(persona) {
  const quien = persona || "AMBOS";
  return quien === "AMBOS" || quien === currentUser;
}
function filtroPersonaAgenda(valor, persona) {
  const quien = persona || "AMBOS";
  if (valor === "todas") return true;
  if (!valor) return esDeMiAgenda(quien);
  return quien === valor;
}
function rotularFiltrosAgenda() {
  const otro = USERS.find(u => u !== currentUser);
  const nombre = u => u ? u.charAt(0) + u.slice(1).toLowerCase() : "";
  ["tareas-para-filter", "casos-responsable-filter"].forEach(id => {
    const sel = document.getElementById(id);
    sel.querySelector('option[value=""]').textContent = "M\xEDas (" + nombre(currentUser) + ") y de los dos";
    sel.querySelector('option[value="todas"]').textContent = "Todas (tambi\xE9n las de " + nombre(otro) + ")";
  });
}
function casoPorRevisar(c) {
  return c.estado !== "cerrado" && (c.urgente || !revisadoHoy(c));
}
function casosAbiertosDePedido(o) {
  return o ? casos.filter(c => c.estado !== "cerrado" && c.pedidoId != null && String(c.pedidoId) === String(o.id)) : [];
}
function casoTag(o) {
  return casoTagSolo(o) + tareaTag(o);
}
function casoTagSolo(o) {
  const lista = casosAbiertosDePedido(o);
  if (!lista.length) return "";
  const urg = lista.some(c => c.urgente);
  return '<span class="caso-tag" data-caso-abrir="' + escapeAttr(lista[0].id) + '" title="' + escapeAttr(lista.map(c => c.motivo || "").join(" / ")) + '"' + (urg ? ' style="background:#dc2626;color:#fff"' : "") + '>\u{1F4D2} Agenda' + (urg ? " URGENTE" : "") + '</span>';
}
function ultimoSeguimiento(c) {
  const notas = c.notas || [];
  const reales = notas.filter(n => !n.sistema);
  return reales.length ? reales[reales.length - 1] : { fecha: c.creado, autor: c.creadoPor, texto: "Caso creado", sistema: true };
}
function fechaHoraCaso(iso, soloDia) {
  if (!iso) return "";
  const d = new Date(iso);
  if (soloDia) return d.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
  return d.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" }) + " " + d.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
}
function haceDias(iso) {
  const dia = s => new Date(s).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
  const n = Math.round((Date.parse(hoyMadrid()) - Date.parse(dia(iso))) / 86400000);
  return { n, texto: n <= 0 ? "hoy" : n === 1 ? "ayer" : "hace " + n + " d\xEDas" };
}
function pedidoDeCaso(c) {
  return c.pedidoId != null ? allOrders.find(o => String(o.id) === String(c.pedidoId)) : null;
}
function resumenPedidoCaso(o) {
  if (!o) return "";
  const estado = o.cancelado ? "Cancelado" : o.shippingStatus === "fulfilled" ? "Enviado" : o.cargaId ? "En carga" : "Pendiente de env\xEDo";
  const producto = String(o.product || "");
  return [o.platform || "Shopify", producto.length > 140 ? producto.slice(0, 140) + "\u2026" : producto, o.agencia || "", estado].filter(Boolean).map(escapeAttr).join(" \xB7 ");
}
// Pedidos de Shopify anteriores a este n\xFAmero nunca se tramitan solos
// (SHOPIFY_PROCESAMIENTO_DESDE en orders-store.js) \u2014 se pueden traer de
// Shopify sin riesgo de tocar stock.
const SHOPIFY_CORTE_TRAMITACION = 12223;
function buscarPedidoCaso(texto) {
  const t = String(texto || "").trim().toUpperCase();
  if (!t) return null;
  return allOrders.find(o => refLabel(o).toUpperCase() === t || String(o.orderNumber) === t || String(o.orderRef || "").toUpperCase() === t) || null;
}
const RESPONSABLE_LABELS = { AMBOS: "Los dos", JENNIFER: "Jennifer", SERGIO: "Sergio" };

function selectAgenda() {
  rotularFiltrosAgenda();
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.agenda === "casos"));
  document.getElementById("view-title").textContent = "Agenda de casos";
  hideAllViews();
  document.getElementById("view-casos").style.display = "block";
  loadCasos().then(renderCasos);
}

function renderCasos() {
  const q = document.getElementById("casos-search").value.trim().toLowerCase();
  const resp = document.getElementById("casos-responsable-filter").value;
  const vista = document.getElementById("casos-vista").value;
  const verCerrados = vista === "cerrados";
  const enVista = c => vista === "cerrados" ? c.estado === "cerrado"
    : vista === "revisados" ? c.estado !== "cerrado" && revisadoHoy(c)
    : vista === "abiertos" ? c.estado !== "cerrado"
    : casoPorRevisar(c);
  const filas = casos.filter(c => enVista(c)
    && filtroPersonaAgenda(resp, c.responsable)
    && (!q || [c.pedidoRef, c.cliente, c.telefono, c.motivo].join(" ").toLowerCase().includes(q)));
  filas.sort((a, b) => verCerrados
    ? String(b.fechaCierre || "").localeCompare(String(a.fechaCierre || ""))
    : (!!b.urgente - !!a.urgente) || String(ultimoSeguimiento(a).fecha || "").localeCompare(String(ultimoSeguimiento(b).fecha || "")));
  document.getElementById("casos-count").textContent = filas.length + ({ revisar: " casos para revisar hoy", revisados: " casos ya revisados hoy", abiertos: " casos abiertos", cerrados: " casos cerrados" })[vista];
  const tbody = document.querySelector("#casos-table tbody");
  tbody.innerHTML = filas.length ? filas.map(c => {
    const o = pedidoDeCaso(c);
    const u = ultimoSeguimiento(c);
    const h = haceDias(u.fecha);
    return '<tr' + (c.urgente ? ' style="background:rgba(254,226,226,.6)"' : "") + '>' +
      '<td>' + (c.urgente ? '<span class="badge" style="background:#dc2626;color:#fff">\u{1F534} URGENTE \u2014 responder hoy</span><br>' : "") + '<strong>' + escapeAttr(c.pedidoRef || "\u2014") + '</strong>' + (o ? '<div style="font-size:11.5px;color:var(--muted);max-width:320px">' + resumenPedidoCaso(o) + '</div>' : "") + '</td>' +
      // Nombre/tel\xE9fono del pedido si el caso se guard\xF3 sin ellos (Jennifer, 2026-10-08).
      '<td>' + escapeAttr(c.cliente || (o && o.name) || "") + '</td>' +
      '<td style="white-space:nowrap">' + escapeAttr(c.telefono || (o && o.phone) || "") + '</td>' +
      '<td style="max-width:280px">' + escapeAttr(c.motivo || "") + '</td>' +
      '<td>' + escapeAttr(RESPONSABLE_LABELS[c.responsable] || "Los dos") + '</td>' +
      '<td style="white-space:nowrap"><strong>' + escapeAttr(RESPONSABLE_LABELS[u.autor] || u.autor || "\u2014") + '</strong><br><span' + (c.estado !== "cerrado" && h.n >= 3 ? ' class="caso-atrasado"' : "") + '>' + escapeAttr(fechaHoraCaso(u.fecha, u.soloDia)) + ' (' + h.texto + ')</span>' + (revisadoHoy(c) && c.estado !== "cerrado" ? '<br><span class="badge" style="background:#dcfce7;color:#166534">\u2714 Revisado hoy</span>' : "") + '</td>' +
      '<td style="font-size:12.5px">' + escapeAttr(u.texto || "") + '</td>' +
      '<td><button type="button" class="secondary" data-caso-abrir="' + escapeAttr(c.id) + '">Abrir</button></td>' +
      '</tr>';
  }).join("") : '<tr><td colspan="8" style="color:var(--muted)">' + (verCerrados ? "No hay casos cerrados." : vista === "revisar" ? "Nada pendiente de revisar hoy." : "No hay casos.") + '</td></tr>';
}
["casos-search", "casos-responsable-filter", "casos-vista"].forEach(id => {
  document.getElementById(id).addEventListener(id === "casos-search" ? "input" : "change", renderCasos);
});

function abrirModalCaso(caso, pedidoInicial) {
  casoEditando = caso || null;
  const o = caso ? pedidoDeCaso(caso) : pedidoInicial || null;
  document.getElementById("caso-modal-titulo").textContent = caso ? "Caso " + (caso.pedidoRef || caso.cliente || "") : "Nuevo caso";
  document.getElementById("caso-pedidos-datalist").innerHTML = allOrders.slice(-1500).map(p => '<option value="' + escapeAttr(refLabel(p)) + '">' + escapeAttr(p.name || "") + '</option>').join("");
  document.getElementById("caso-pedido").value = caso ? caso.pedidoRef || "" : o ? refLabel(o) : "";
  document.getElementById("caso-cliente").value = (caso && caso.cliente) || (o && o.name) || "";
  document.getElementById("caso-telefono").value = (caso && caso.telefono) || (o && o.phone) || "";
  document.getElementById("caso-motivo").value = caso ? caso.motivo || "" : "";
  document.getElementById("caso-responsable").value = caso ? caso.responsable || "AMBOS" : "AMBOS";
  document.getElementById("caso-nota").value = "";
  document.getElementById("caso-gestion-autor").value = USERS.includes(currentUser) ? currentUser : "JENNIFER";
  document.getElementById("caso-gestion-fecha").value = hoyMadrid();
  document.getElementById("caso-gestion-fecha").max = hoyMadrid();
  document.getElementById("caso-pedido-info").innerHTML = resumenPedidoCaso(o);
  const notas = caso ? caso.notas || [] : [];
  const hist = document.getElementById("caso-historial");
  hist.style.display = caso ? "" : "none";
  hist.innerHTML = '<div style="font-weight:600;margin-bottom:4px">Historial</div>' + (notas.length ? [...notas].reverse().map(n =>
    '<div class="caso-historial-item"><div class="meta">' + escapeAttr(fechaHoraCaso(n.fecha, n.soloDia)) + (n.autor ? " \xB7 " + escapeAttr(n.autor) : "") + (n.apuntadoPor ? " (apuntado por " + escapeAttr(n.apuntadoPor) + ")" : "") + '</div>' + (n.sistema ? "<em>" + escapeAttr(n.texto) + "</em>" : escapeAttr(n.texto)) + '</div>').join("") : '<div style="color:var(--muted)">Sin seguimientos todav\xEDa.</div>');
  const cerrarBtn = document.getElementById("caso-cerrar-btn");
  cerrarBtn.style.display = caso ? "" : "none";
  cerrarBtn.textContent = caso && caso.estado === "cerrado" ? "Reabrir caso" : "Cerrar caso";
  document.getElementById("caso-urgente").checked = !!(caso && caso.urgente);
  document.getElementById("caso-modal-overlay").classList.add("open");
}
document.getElementById("caso-pedido").addEventListener("change", () => {
  const o = buscarPedidoCaso(document.getElementById("caso-pedido").value);
  document.getElementById("caso-pedido-info").innerHTML = o ? resumenPedidoCaso(o) : "";
  if (o) {
    const cli = document.getElementById("caso-cliente");
    const tel = document.getElementById("caso-telefono");
    if (!cli.value.trim()) cli.value = o.name || "";
    if (!tel.value.trim()) tel.value = o.phone || "";
  }
});
async function guardarCaso(extra) {
  const pedidoTxt = document.getElementById("caso-pedido").value.trim();
  let o = buscarPedidoCaso(pedidoTxt);
  // Pedido antiguo de Shopify que no est\xE1 en la app (Jennifer, 2026-10-08,
  // BEZEN11510): se trae de Shopify sin tramitarlo (anterior al corte), para
  // tener nombre, tel\xE9fono y direcci\xF3n en el caso.
  const numAntiguo = !o && (pedidoTxt.toUpperCase().match(/^(?:BEZEN)?0*(\\d{3,6})$/) || [])[1];
  if (numAntiguo && Number(numAntiguo) < SHOPIFY_CORTE_TRAMITACION) {
    const r = await fetch("/api/admin/importar-pedido-suelto", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ numero: Number(numAntiguo) }) }).then(x => x.json()).catch(() => ({}));
    if (r.ok) { await loadOrders(); o = buscarPedidoCaso(pedidoTxt) || allOrders.find(p => String(p.id) === String(r.id)) || null; }
  }
  const body = {
    id: casoEditando ? casoEditando.id : undefined,
    pedidoId: o ? o.id : null,
    pedidoRef: o ? refLabel(o) : pedidoTxt,
    cliente: document.getElementById("caso-cliente").value.trim() || (o && o.name) || "",
    telefono: document.getElementById("caso-telefono").value.trim() || (o && o.phone) || "",
    motivo: document.getElementById("caso-motivo").value.trim(),
    responsable: document.getElementById("caso-responsable").value,
    urgente: document.getElementById("caso-urgente").checked,
    nota: document.getElementById("caso-nota").value,
    notaAutor: document.getElementById("caso-gestion-autor").value,
    notaFecha: document.getElementById("caso-gestion-fecha").value,
    usuario: currentUser,
    ...extra,
  };
  if (!body.motivo) { alert("Escribe el motivo del caso."); return; }
  if (!body.pedidoRef && !body.cliente) { alert("Pon al menos el pedido o el cliente."); return; }
  const res = await fetch("/api/casos/guardar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.ok) { alert(r.error || "No se ha podido guardar el caso."); return; }
  document.getElementById("caso-modal-overlay").classList.remove("open");
  await loadCasos();
  renderCasos();
}
document.getElementById("caso-modal-ok").addEventListener("click", () => guardarCaso({}));
document.getElementById("caso-cerrar-btn").addEventListener("click", () => {
  if (!casoEditando) return;
  guardarCaso({ estado: casoEditando.estado === "cerrado" ? "abierto" : "cerrado" });
});
document.getElementById("caso-modal-cancel").addEventListener("click", () => document.getElementById("caso-modal-overlay").classList.remove("open"));
document.getElementById("caso-nuevo-btn").addEventListener("click", () => abrirModalCaso(null));
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-caso-abrir]");
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  const c = casos.find(x => x.id === el.dataset.casoAbrir);
  if (c) abrirModalCaso(c);
}, true);
const agendaToggle = document.getElementById("agenda-toggle");
const agendaListEl = document.getElementById("agenda-list");
agendaToggle.addEventListener("click", () => {
  agendaToggle.classList.toggle("open");
  agendaListEl.classList.toggle("open");
});
loadCasos().then(() => { if (casos.length && document.getElementById("view-shopify").style.display !== "none" && allOrders.length) applyFilter(); });

// Tareas con fecha (Jennifer, 2026-10-05): "cosas para hacer en fechas
// determinadas" (ej. 002-26259L13344-A: el 09/10 darle el n\xFAmero de
// seguimiento). Hoy y atrasadas arriba, globo en el men\xFA, aviso al abrir la
// app y email de recordatorio por la ma\xF1ana (ver enviarRecordatorioTareas).
let tareas = [];
let tareaEditando = null;
let tareasAvisoMostrado = false;
function tareaParaMi(t) {
  return !t.para || t.para === "AMBOS" || t.para === currentUser;
}
function tareasDeHoy() {
  const hoy = hoyMadrid();
  return tareas.filter(t => !t.hecha && t.fecha <= hoy);
}
async function loadTareas() {
  try { tareas = await (await fetch("/api/tareas")).json(); } catch (e) { return; }
  const deHoy = tareasDeHoy().filter(tareaParaMi);
  const atrasadas = deHoy.filter(t => t.fecha < hoyMadrid()).length;
  const badge = document.getElementById("tareas-badge");
  badge.style.display = deHoy.length ? "" : "none";
  badge.textContent = deHoy.length;
  badge.style.background = atrasadas ? "#dc2626" : "#0d9488";
  if (!tareasAvisoMostrado && currentUser) {
    tareasAvisoMostrado = true;
    const mias = deHoy.filter(tareaParaMi);
    if (mias.length) mostrarAvisoBreve("\u{1F4CC} Hoy tienes " + mias.length + (mias.length === 1 ? " tarea" : " tareas") + (atrasadas ? " (alguna atrasada)" : "") + " \u2014 Agenda de casos > Tareas");
  }
  if (document.getElementById("view-tareas").style.display !== "none") renderTareas();
}
function fechaTarea(iso) {
  return iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "";
}
function tareaTag(o) {
  if (!o) return "";
  const lista = tareas.filter(t => !t.hecha && t.pedidoId != null && String(t.pedidoId) === String(o.id)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!lista.length) return "";
  return '<span class="caso-tag" data-tarea-abrir="' + escapeAttr(lista[0].id) + '" title="' + escapeAttr(lista.map(t => fechaTarea(t.fecha) + ": " + t.texto).join(" / ")) + '" style="background:#fef3c7;color:#92400e">\u{1F4CC} Tarea ' + escapeAttr(fechaTarea(lista[0].fecha).slice(0, 5)) + '</span>';
}

function selectTareas() {
  rotularFiltrosAgenda();
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.agenda === "tareas"));
  document.getElementById("view-title").textContent = "Agenda \xB7 Tareas";
  hideAllViews();
  document.getElementById("view-tareas").style.display = "block";
  loadTareas().then(renderTareas);
}

// Por d\xEDas, desplegables tipo calendario (Jennifer, 2026-10-05: "que no me
// aparezca un listado de todas las tareas, sino que salgan por d\xEDas que
// podamos ir desplegando"). Atrasadas y hoy abiertos de entrada; el resto
// cerrados, y se recuerda lo que cada uno abre mientras no recargue.
const tareasDiasAbiertos = new Set();
const tareasDiasCerrados = new Set();
const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Mi\xE9rcoles", "Jueves", "Viernes", "S\xE1bado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function sumarDias(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function tituloDia(iso, hoy) {
  const d = new Date(iso + "T12:00:00Z");
  const base = DIAS_SEMANA[d.getUTCDay()] + " " + d.getUTCDate() + " de " + MESES[d.getUTCMonth()] + (iso.slice(0, 4) !== hoy.slice(0, 4) ? " de " + iso.slice(0, 4) : "");
  if (iso === hoy) return "Hoy \xB7 " + base;
  if (iso === sumarDias(hoy, 1)) return "Ma\xF1ana \xB7 " + base;
  if (iso === sumarDias(hoy, -1)) return "Ayer \xB7 " + base;
  return base;
}
function filaTarea(t, hoy) {
  const o = t.pedidoId != null ? allOrders.find(p => String(p.id) === String(t.pedidoId)) : null;
  const atrasada = !t.hecha && t.fecha < hoy;
  return '<tr>' +
    '<td style="width:40px"><input type="checkbox" class="tarea-hecha-check" data-id="' + escapeAttr(t.id) + '"' + (t.hecha ? " checked" : "") + ' title="Marcar como hecha" /></td>' +
    '<td>' + (atrasada ? '<span class="badge" style="background:#dc2626;color:#fff">Atrasada \xB7 era el ' + escapeAttr(fechaTarea(t.fecha).slice(0, 5)) + '</span><br>' : "") + escapeAttr(t.texto || "") +
      (t.hecha ? '<div style="font-size:11.5px;color:var(--muted)">Hecha por ' + escapeAttr(t.hechaPor || "") + " el " + escapeAttr(fechaHoraCaso(t.fechaHecha)) + '</div>' : "") +
      ((t.notas || []).length ? '<div style="font-size:12px;margin-top:4px;padding-left:8px;border-left:2px solid var(--border, #e5e7eb)">\u{1F4DD} <strong>' + escapeAttr(t.notas[t.notas.length - 1].autor || "") + '</strong> (' + escapeAttr(fechaHoraCaso(t.notas[t.notas.length - 1].fecha)) + '): ' + escapeAttr(t.notas[t.notas.length - 1].texto) + (t.notas.length > 1 ? ' <span style="color:var(--muted)">\xB7 ' + t.notas.length + ' notas</span>' : "") + '</div>' : "") + '</td>' +
    '<td><strong>' + escapeAttr(t.pedidoRef || "") + '</strong>' + (o ? '<div style="font-size:11.5px;color:var(--muted);max-width:300px">' + resumenPedidoCaso(o) + '</div>' : "") + '</td>' +
    '<td style="white-space:nowrap">' + escapeAttr(RESPONSABLE_LABELS[t.para] || "Los dos") + '</td>' +
    '<td style="width:70px"><button type="button" class="secondary" data-tarea-abrir="' + escapeAttr(t.id) + '">Editar</button></td>' +
    '</tr>';
}
function renderTareas() {
  const hoy = hoyMadrid();
  const q = document.getElementById("tareas-search").value.trim().toLowerCase();
  const para = document.getElementById("tareas-para-filter").value;
  const verHechas = document.getElementById("tareas-vista").value === "hechas";
  const filas = tareas.filter(t => !!t.hecha === verHechas
    && filtroPersonaAgenda(para, t.para)
    && (!q || [t.texto, t.pedidoRef].join(" ").toLowerCase().includes(q)));
  const nHoy = filas.filter(t => !t.hecha && t.fecha <= hoy).length;
  document.getElementById("tareas-count").textContent = verHechas ? filas.length + " tareas hechas" : filas.length + " tareas pendientes" + (nHoy ? " \xB7 " + nHoy + " para hoy o atrasadas" : "");
  // Grupos: "atrasadas" (pendientes de d\xEDas pasados) y luego un grupo por d\xEDa.
  const grupos = new Map();
  if (!verHechas) {
    const atrasadas = filas.filter(t => t.fecha < hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (atrasadas.length) grupos.set("atrasadas", atrasadas);
  }
  const porDia = filas.filter(t => verHechas || t.fecha >= hoy).sort((a, b) => verHechas ? b.fecha.localeCompare(a.fecha) : a.fecha.localeCompare(b.fecha));
  for (const t of porDia) {
    if (!grupos.has(t.fecha)) grupos.set(t.fecha, []);
    grupos.get(t.fecha).push(t);
  }
  const cont = document.getElementById("tareas-dias");
  if (!grupos.size) {
    cont.innerHTML = '<p style="color:var(--muted)">' + (verHechas ? "No hay tareas hechas." : "No hay tareas pendientes.") + '</p>';
    return;
  }
  cont.innerHTML = [...grupos.entries()].map(([clave, lista]) => {
    const esAtrasadas = clave === "atrasadas";
    const abiertoPorDefecto = !verHechas && (esAtrasadas || clave === hoy);
    const abierto = tareasDiasAbiertos.has(clave) || (abiertoPorDefecto && !tareasDiasCerrados.has(clave));
    const titulo = esAtrasadas ? "\u26A0 Atrasadas" : tituloDia(clave, hoy);
    const color = esAtrasadas ? "#dc2626" : clave === hoy && !verHechas ? "#f59e0b" : "var(--muted)";
    return '<details class="tareas-dia" data-dia="' + escapeAttr(clave) + '"' + (abierto ? " open" : "") + ' style="border-left:4px solid ' + color + '">' +
      '<summary><strong>' + escapeAttr(titulo) + '</strong> <span class="badge" style="background:' + color + ';color:#fff">' + lista.length + (lista.length === 1 ? " tarea" : " tareas") + '</span></summary>' +
      '<div class="table-wrap"><table class="tareas-dia-table"><thead><tr><th>Hecha</th><th>Qu\xE9 hay que hacer</th><th>Pedido</th><th>Para</th><th></th></tr></thead><tbody>' +
      lista.map(t => filaTarea(t, hoy)).join("") + '</tbody></table></div></details>';
  }).join("");
  cont.querySelectorAll("details.tareas-dia").forEach(d => d.addEventListener("toggle", () => {
    if (d.open) { tareasDiasAbiertos.add(d.dataset.dia); tareasDiasCerrados.delete(d.dataset.dia); }
    else { tareasDiasAbiertos.delete(d.dataset.dia); tareasDiasCerrados.add(d.dataset.dia); }
  }));
  cont.querySelectorAll(".tarea-hecha-check").forEach(chk => chk.addEventListener("change", async () => {
    await fetch("/api/tareas/guardar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: chk.dataset.id, hecha: chk.checked, usuario: currentUser }) });
    await loadTareas();
    renderTareas();
  }));
}
["tareas-search", "tareas-para-filter", "tareas-vista"].forEach(id => {
  document.getElementById(id).addEventListener(id === "tareas-search" ? "input" : "change", renderTareas);
});

function abrirModalTarea(t) {
  tareaEditando = t || null;
  document.getElementById("tarea-modal-titulo").textContent = t ? "Editar tarea" : "Nueva tarea";
  document.getElementById("caso-pedidos-datalist").innerHTML = allOrders.slice(-1500).map(p => '<option value="' + escapeAttr(refLabel(p)) + '">' + escapeAttr(p.name || "") + '</option>').join("");
  document.getElementById("tarea-texto").value = t ? t.texto || "" : "";
  document.getElementById("tarea-fecha").value = t ? t.fecha : hoyMadrid();
  document.getElementById("tarea-para").value = t ? t.para || "AMBOS" : "AMBOS";
  document.getElementById("tarea-pedido").value = t ? t.pedidoRef || "" : "";
  const o = t && t.pedidoId != null ? allOrders.find(p => String(p.id) === String(t.pedidoId)) : null;
  document.getElementById("tarea-pedido-info").innerHTML = resumenPedidoCaso(o);
  document.getElementById("tarea-borrar-btn").style.display = t ? "" : "none";
  document.getElementById("tarea-nota").value = "";
  const notas = t ? t.notas || [] : [];
  const hist = document.getElementById("tarea-historial");
  hist.style.display = notas.length ? "" : "none";
  hist.innerHTML = '<div style="font-weight:600;margin-bottom:4px">Notas</div>' + [...notas].reverse().map(n =>
    '<div class="caso-historial-item"><div class="meta">' + escapeAttr(fechaHoraCaso(n.fecha)) + (n.autor ? " \xB7 " + escapeAttr(n.autor) : "") + '</div>' + escapeAttr(n.texto) + '</div>').join("");
  document.getElementById("tarea-modal-overlay").classList.add("open");
}
document.getElementById("tarea-pedido").addEventListener("change", () => {
  document.getElementById("tarea-pedido-info").innerHTML = resumenPedidoCaso(buscarPedidoCaso(document.getElementById("tarea-pedido").value));
});
document.getElementById("tarea-modal-ok").addEventListener("click", async () => {
  const pedidoTxt = document.getElementById("tarea-pedido").value.trim();
  const o = buscarPedidoCaso(pedidoTxt);
  const body = {
    id: tareaEditando ? tareaEditando.id : undefined,
    texto: document.getElementById("tarea-texto").value.trim(),
    fecha: document.getElementById("tarea-fecha").value,
    para: document.getElementById("tarea-para").value,
    pedidoId: o ? o.id : null,
    pedidoRef: o ? refLabel(o) : pedidoTxt,
    nota: document.getElementById("tarea-nota").value,
    usuario: currentUser,
  };
  if (!body.texto || !body.fecha) { alert("Pon qu\xE9 hay que hacer y la fecha."); return; }
  const res = await fetch("/api/tareas/guardar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.ok) { alert(r.error || "No se ha podido guardar la tarea."); return; }
  document.getElementById("tarea-modal-overlay").classList.remove("open");
  await loadTareas();
  renderTareas();
});
document.getElementById("tarea-borrar-btn").addEventListener("click", async () => {
  if (!tareaEditando || !confirm("\xBFBorrar esta tarea?")) return;
  await fetch("/api/tareas/borrar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: tareaEditando.id }) });
  document.getElementById("tarea-modal-overlay").classList.remove("open");
  await loadTareas();
  renderTareas();
});
document.getElementById("tarea-modal-cancel").addEventListener("click", () => document.getElementById("tarea-modal-overlay").classList.remove("open"));
document.getElementById("tarea-nueva-btn").addEventListener("click", () => abrirModalTarea(null));
document.getElementById("tareas-email-prueba-btn").addEventListener("click", async () => {
  const r = await (await fetch("/api/tareas/recordatorio", { method: "POST" })).json().catch(() => ({}));
  const errores = Object.entries(r.resultados || {}).filter(([, x]) => !x.ok).map(([p, x]) => p + ": " + (x.error === "script_sin_actualizar" ? "hay que actualizar el script de Google (versi\xF3n 3)" : x.error || "error"));
  if (r.ok) mostrarAvisoBreve("Email de recordatorio enviado.");
  else alert("No se ha podido mandar el email. " + errores.join(" \xB7 "));
});
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-tarea-abrir]");
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  const t = tareas.find(x => x.id === el.dataset.tareaAbrir);
  if (t) abrirModalTarea(t);
}, true);
loadTareas().then(() => { if (tareas.length && document.getElementById("view-shopify").style.display !== "none" && allOrders.length) applyFilter(); });

// Cambiar la direcci\xF3n de entrega (Jennifer, 2026-10-05): al cliente se le
// olvid\xF3 un dato (piso, puerta...) o cambia de direcci\xF3n. Se guarda en la
// app (no en Shopify ni en el marketplace) y se mantiene aunque el pedido se
// vuelva a sincronizar; los ficheros de Furniture/SEUR usan ya la nueva.
let dirEditando = null;
function direccionButton(o) {
  if (!o || o.id == null) return "";
  const m = o.direccionManual;
  return ' <button type="button" class="dir-edit-btn" data-dir-editar="' + escapeAttr(o.id) + '" title="Cambiar direcci\xF3n de entrega">\u270F\uFE0F</button>' +
    (m ? '<br><span class="caso-tag" style="background:#dbeafe;color:#1e40af;margin-left:0" title="Cambiada por ' + escapeAttr(m.usuario || "") + " el " + escapeAttr(fechaHoraCaso(m.fecha)) + (m.motivo ? " \u2014 " + escapeAttr(m.motivo) : "") + '">\u{1F4CD} Direcci\xF3n cambiada</span>' : "");
}
function textoDireccion(d) {
  return d ? [d.streetAddress, [d.postalCode, d.city].filter(Boolean).join(" "), d.province, d.phone ? "Tel. " + d.phone : ""].filter(Boolean).join(", ") : "";
}
function abrirModalDireccion(o) {
  dirEditando = o;
  document.getElementById("dir-modal-titulo").textContent = "Cambiar direcci\xF3n de entrega \xB7 " + refLabel(o) + (o.name ? " (" + o.name + ")" : "");
  document.getElementById("dir-calle").value = o.streetAddress || o.furnitureAddress || o.address || "";
  document.getElementById("dir-cp").value = o.postalCode || "";
  document.getElementById("dir-ciudad").value = o.city || "";
  document.getElementById("dir-provincia").value = o.province || "";
  document.getElementById("dir-telefono").value = o.phone || "";
  document.getElementById("dir-motivo").value = o.direccionManual ? o.direccionManual.motivo || "" : "";
  const m = o.direccionManual;
  document.getElementById("dir-original").innerHTML = m
    ? "Direcci\xF3n original del pedido: " + escapeAttr(textoDireccion(o.direccionOriginal)) + "<br>Cambiada por " + escapeAttr(m.usuario || "") + " el " + escapeAttr(fechaHoraCaso(m.fecha))
    : "";
  document.getElementById("dir-restaurar-btn").style.display = m ? "" : "none";
  const aviso = document.getElementById("dir-modal-aviso");
  const enCarga = o.cargaId || backorders.some(b => b.orderId === o.id && b.cargaId);
  aviso.style.display = enCarga || o.shippingStatus === "fulfilled" ? "" : "none";
  aviso.textContent = o.shippingStatus === "fulfilled"
    ? "Este pedido ya figura como enviado: el cambio no llega a la agencia por s\xED solo, av\xEDsales."
    : "Este pedido ya est\xE1 en una carga: si el fichero ya se mand\xF3 a la agencia, hay que avisarles del cambio o volver a descargarlo.";
  document.getElementById("dir-modal-overlay").classList.add("open");
}
async function guardarDireccion(direccion) {
  const res = await fetch("/api/pedidos/direccion", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: dirEditando.id, direccion, usuario: currentUser }) });
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.ok) { alert(r.error || "No se ha podido guardar la direcci\xF3n."); return; }
  Object.assign(dirEditando, r.order);
  if (!r.order.direccionManual) { delete dirEditando.direccionManual; delete dirEditando.direccionOriginal; }
  document.getElementById("dir-modal-overlay").classList.remove("open");
  mostrarAvisoBreve(direccion ? "Direcci\xF3n de " + refLabel(dirEditando) + " cambiada." : "Direcci\xF3n original de " + refLabel(dirEditando) + " recuperada.");
  loadOrders();
}
document.getElementById("dir-modal-ok").addEventListener("click", () => {
  const d = {
    streetAddress: document.getElementById("dir-calle").value.trim(),
    postalCode: document.getElementById("dir-cp").value.trim(),
    city: document.getElementById("dir-ciudad").value.trim(),
    province: document.getElementById("dir-provincia").value.trim(),
    phone: document.getElementById("dir-telefono").value.trim(),
    motivo: document.getElementById("dir-motivo").value.trim(),
  };
  if (!d.streetAddress || !d.postalCode || !d.city) { alert("Pon al menos la direcci\xF3n, el c\xF3digo postal y la poblaci\xF3n."); return; }
  guardarDireccion(d);
});
document.getElementById("dir-restaurar-btn").addEventListener("click", () => {
  if (confirm("\xBFVolver a la direcci\xF3n original del pedido?")) guardarDireccion(null);
});
document.getElementById("dir-modal-cancel").addEventListener("click", () => document.getElementById("dir-modal-overlay").classList.remove("open"));
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-dir-editar]");
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  const o = allOrders.find(x => String(x.id) === el.dataset.dirEditar);
  if (o) abrirModalDireccion(o);
}, true);

// Hist\xF3rico de devueltos de SEUR (Jennifer, 2026-10-13): entran solos por el
// seguimiento ("Env\xEDo devuelto" / "se est\xE1 devolviendo a origen") o a mano.
// Se apunta llegada al almac\xE9n, motivo, estado del colch\xF3n y qu\xE9 se hace;
// si est\xE1 bien, "Pasar al stock" suma 1 unidad (solo cuando ella lo decide).
let devoluciones = [];
let devolucionesPendientes = [];
const DEV_MOTIVOS = ["", "Ausente / no localizado", "Direcci\xF3n incorrecta", "Rechazado por el cliente", "El cliente cancela", "Da\xF1ado en el transporte", "Otro"];
const DEV_ESTADOS = ["", "Bien", "Embalaje da\xF1ado", "Colch\xF3n da\xF1ado"];
const DEV_DESTINOS = ["", "Pendiente de decidir", "Reenviar al cliente", "Vuelve al stock", "Desechar", "Reembolsado"];
async function loadDevoluciones() {
  const [d, p] = await Promise.all([
    fetch("/api/seur/devoluciones").then(r => r.json()),
    fetch("/api/inventario/pendientes").then(r => r.json()).catch(() => []),
  ]);
  devoluciones = Array.isArray(d) ? d : [];
  devolucionesPendientes = Array.isArray(p) ? p : [];
  renderDevoluciones();
}
function devSelect(campo, opciones, valor, id) {
  const v0 = valor || "";
  const ops = opciones.includes(v0) ? opciones : opciones.concat([v0]);
  return '<select class="dev-campo" data-id="' + escapeAttr(id) + '" data-campo="' + campo + '">'
    + ops.map(v => '<option value="' + escapeAttr(v) + '"' + (v === v0 ? " selected" : "") + ">" + escapeAttr(v || "\u2014") + "</option>").join("") + "</select>";
}
function colchonesDeDevolucion(d) {
  const vistos = new Map();
  for (const b of devolucionesPendientes) {
    if (String(b.orderId) !== String(d.orderId) || b.tipo !== "colchon" || b.paraStock) continue;
    vistos.set(b.stockModel + "|" + b.talla, { stockModel: b.stockModel, talla: b.talla });
  }
  return [...vistos.values()];
}
function devolucionResuelta(d) {
  return !!d.fechaLlegada && !!d.destino && d.destino !== "Pendiente de decidir";
}
function renderDevoluciones() {
  const q = document.getElementById("devoluciones-search").value.trim().toLowerCase();
  const filtro = document.getElementById("devoluciones-filtro").value;
  const filas = devoluciones.filter(d => {
    if (q && ![refLabel(d), d.nombre, d.producto, d.notas].join(" ").toLowerCase().includes(q)) return false;
    if (filtro === "sin-llegar" && d.fechaLlegada) return false;
    if (filtro === "sin-decidir" && (!d.fechaLlegada || devolucionResuelta(d))) return false;
    if (filtro === "resueltas" && !devolucionResuelta(d)) return false;
    return true;
  }).sort((a, b) => String(b.creado || "").localeCompare(String(a.creado || "")));
  const sinLlegar = devoluciones.filter(d => !d.fechaLlegada).length;
  document.getElementById("devoluciones-count").textContent = filas.length + " de " + devoluciones.length + " devoluciones" + (sinLlegar ? " \xB7 " + sinLlegar + " sin llegar al almac\xE9n" : "");
  document.querySelector("#devoluciones-table tbody").innerHTML = filas.map(d => {
    const idA = escapeAttr(d.id);
    const stockHtml = d.alStock
      ? '<span class="pedido-generado-tag">\u2713 Al stock ' + new Date(d.alStock.fecha).toLocaleDateString("es-ES") + "</span><br><small>" + escapeAttr(nombreCortoModelo(d.alStock.stockModel) + " " + d.alStock.talla) + (d.alStock.usuario ? " (" + escapeAttr(d.alStock.usuario) + ")" : "") + "</small>"
      : '<button type="button" class="secondary dev-stock-btn" data-id="' + idA + '" title="El colch\xF3n ha vuelto bien: suma 1 unidad al stock">\uFF0B Pasar al stock</button>';
    return "<tr" + (devolucionResuelta(d) ? "" : ' class="fila-cuarentena"') + ">"
      + "<td>" + new Date(d.creado).toLocaleDateString("es-ES") + "<br><small>" + (d.origen === "manual" ? "a mano" + (d.creadoPor ? " (" + escapeAttr(d.creadoPor) + ")" : "") : "autom\xE1tico") + "</small></td>"
      + "<td>" + escapeAttr(refLabel(d)) + "<br><small>" + escapeAttr(d.platform || "Shopify") + "</small></td>"
      + "<td>" + escapeAttr(d.nombre || "") + "</td>"
      + "<td>" + escapeAttr(d.producto || "") + "</td>"
      + "<td>" + (d.seguimiento ? '<a href="' + escapeAttr(d.seguimiento) + '" target="_blank" rel="noopener">' + escapeAttr(d.estadoSeur || "Ver en SEUR") + "</a>" : escapeAttr(d.estadoSeur || "")) + "</td>"
      + "<td>" + devSelect("motivo", DEV_MOTIVOS, d.motivo, d.id) + "</td>"
      + '<td><input type="date" class="dev-campo" data-id="' + idA + '" data-campo="fechaLlegada" value="' + escapeAttr(d.fechaLlegada || "") + '"></td>'
      + "<td>" + devSelect("estadoColchon", DEV_ESTADOS, d.estadoColchon, d.id) + "</td>"
      + "<td>" + devSelect("destino", DEV_DESTINOS, d.destino, d.id) + "</td>"
      + "<td>" + stockHtml + "</td>"
      + '<td><textarea class="dev-campo" data-id="' + idA + '" data-campo="notas" placeholder="Notas...">' + escapeAttr(d.notas || "") + "</textarea></td>"
      + '<td><button type="button" class="secondary dev-borrar-btn" data-id="' + idA + '" title="Quitar de la lista (no se vuelve a meter sola)">\u2715</button></td>'
      + "</tr>";
  }).join("");
}
async function guardarDevolucion(datos) {
  const res = await fetch("/api/seur/devoluciones/guardar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...datos, usuario: currentUser }) });
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.ok) { alert(r.error || "No se ha podido guardar."); return null; }
  return r.devolucion;
}
document.addEventListener("change", async (e) => {
  const el = e.target.closest(".dev-campo");
  if (!el) return;
  const d = devoluciones.find(x => x.id === el.dataset.id);
  if (!d) return;
  d[el.dataset.campo] = el.value;
  await guardarDevolucion({ id: d.id, [el.dataset.campo]: el.value });
  renderDevoluciones();
});
document.addEventListener("click", async (e) => {
  const btnStock = e.target.closest(".dev-stock-btn");
  const btnBorrar = e.target.closest(".dev-borrar-btn");
  if (!btnStock && !btnBorrar) return;
  const d = devoluciones.find(x => x.id === (btnStock || btnBorrar).dataset.id);
  if (!d) return;
  if (btnBorrar) {
    if (!confirm("\xBFQuitar " + refLabel(d) + " del hist\xF3rico de devueltos?")) return;
    if (await guardarDevolucion({ id: d.id, descartado: true })) loadDevoluciones();
    return;
  }
  const NL = String.fromCharCode(10);
  const opciones = colchonesDeDevolucion(d);
  let elegido = null;
  if (opciones.length === 1) {
    if (!confirm("\xBFSumar 1 unidad de " + opciones[0].stockModel + " " + opciones[0].talla + " al stock?")) return;
    elegido = opciones[0];
  } else if (opciones.length > 1) {
    const n = prompt("\xBFQu\xE9 colch\xF3n vuelve al stock? Escribe el n\xFAmero:" + NL + opciones.map((o, i) => (i + 1) + ") " + o.stockModel + " " + o.talla).join(NL), "1");
    if (n === null) return;
    elegido = opciones[Number(n) - 1];
    if (!elegido) { alert("N\xFAmero no v\xE1lido."); return; }
  } else {
    const filas = await (await fetch("/api/inventario/stock")).json();
    const modelo = prompt("No s\xE9 qu\xE9 colch\xF3n es. Escribe el modelo tal cual sale en Stock:");
    if (!modelo) return;
    const talla = prompt("Medida (ej. 150X190):");
    if (!talla) return;
    const t = talla.toUpperCase().split(" ").join("");
    elegido = (Array.isArray(filas) ? filas : Object.values(filas)).find(r => String(r.stockModel).toLowerCase() === modelo.trim().toLowerCase() && r.talla === t);
    if (!elegido) { alert("No encuentro " + modelo + " " + t + " en Stock. Revisa el nombre exacto."); return; }
  }
  const res = await fetch("/api/seur/devoluciones/al-stock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: d.id, stockModel: elegido.stockModel, talla: elegido.talla, usuario: currentUser, ref: refLabel(d) }) });
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.ok) { alert(r.error || "No se ha podido pasar al stock."); return; }
  mostrarAvisoBreve("Sumado al stock: " + nombreCortoModelo(elegido.stockModel) + " " + elegido.talla + " (ahora hay " + r.cantidad + ")");
  await asignarAltaAPendientes(elegido.stockModel, elegido.talla, 1);
  loadDevoluciones();
});
document.getElementById("devoluciones-search").addEventListener("input", renderDevoluciones);
document.getElementById("devoluciones-filtro").addEventListener("change", renderDevoluciones);
document.getElementById("devoluciones-anadir-btn").addEventListener("click", async () => {
  const ref = prompt("Referencia del pedido devuelto (ej. BEZEN12089 o 012227361-A):");
  if (!ref || !ref.trim()) return;
  if (await guardarDevolucion({ ref: ref.trim() })) loadDevoluciones();
});

function connectWS() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(proto + "//" + location.host + "/pedidos/shopify/ws");
  ws.onmessage = () => {
    if (editing) { pendingRefresh = true; } else { loadOrders(); }
    loadAvisosCanceladosCount();
    loadCasos();
    loadTareas();
    const vDev = document.getElementById("view-devoluciones-seur");
    if (vDev.style.display !== "none" && !vDev.contains(document.activeElement)) loadDevoluciones();
  };
  ws.onclose = () => setTimeout(connectWS, 2000);
}

initUser();
<\/script>
</body>
</html>`;
}
__name(renderPage, "renderPage");
var FURNITURE_CSV_HEADERS = [
  "FECHA",
  "A COBRAR",
  "DOC. VENTA",
  "NOM. CLIENTE",
  "DIRECCI\xD3N",
  "C. POSTAL",
  "POBLACI\xD3N",
  // N = "USADO/RAEE" en UNA sola columna (Jennifer, 2026-09-29: la columna
  // O "RAEE" sobraba y desajustaba todo el fichero).
  "DESCRIP.",
  "CANTIDAD",
  "CENTRO",
  "TEL\xC9FONO1",
  "TEL\xC9FONO 2",
  "OBSERVACIONES",
  "USADO/RAEE",
  "ARRASTRE",
  "VERIFICADO",
  "PLANIFICADO",
  "LLAMADO",
  "CAMI\xD3N",
  "CARGADO",
  "HORA INICIO",
  "HORA FIN",
  "EAN",
  "PROCEDENCIA",
  "TIPOSERVICIO",
  "BULTOS",
  "VOLUM",
  "KILOS",
  "NUMERO_RESERVA",
  "EMAIL",
  "PROVINCIA",
  "VALOR MERCANC\xCDA"
];
function limpiarTelefonoFurniture(phone) {
  return (phone || "").replace(/^\+34\s*/, "").trim();
}
__name(limpiarTelefonoFurniture, "limpiarTelefonoFurniture");
function tieneMontajeFurniture(services) {
  const m = /Montaje:\s*([^·]+)/i.exec(services || "");
  return !!(m && m[1].trim().toLowerCase().startsWith("con montaje"));
}
__name(tieneMontajeFurniture, "tieneMontajeFurniture");
function tapaPartidaFurniture(services) {
  const m = /Tapa de Canapé:\s*([^·]+)/i.exec(services || "");
  return !!(m && m[1].trim().toLowerCase().startsWith("tapa partida"));
}
__name(tapaPartidaFurniture, "tapaPartidaFurniture");
function observacionesRetiradaFurniture(services) {
  const matches = [...(services || "").matchAll(/Servicios adicionales:\s*([^·]+)/gi)].map((m) => m[1].trim());
  const relevante = matches.find((v2) => v2.toLowerCase() !== "ninguno");
  if (!relevante) return "";
  const v = relevante.toLowerCase();
  const colchon = v.includes("colch");
  const cama = v.includes("cama") || v.includes("canap") || v.includes("base");
  const conDesmontaje = v.includes("desmontaje") && !v.includes("sin desmontaje");
  if (colchon && cama && conDesmontaje) return "Desmontaje; Retirada de colch\xF3n y cama punto limpio";
  if (colchon && cama) return "Retirada de colch\xF3n y cama punto limpio";
  if (cama && conDesmontaje) return "Desmontaje cama, retirada punto limpio";
  if (cama) return "Retirada de cama para desechar";
  if (colchon) return "Retirada colch\xF3n punto limpio";
  return "";
}
__name(observacionesRetiradaFurniture, "observacionesRetiradaFurniture");
function parseMedidaFurniture(talla) {
  const m = /(\d{2,3})\s*[xX]\s*(\d{2,3})/.exec(talla || "");
  if (!m) return null;
  return { ancho: Number(m[1]), largo: Number(m[2]), text: `${m[1]}X${m[2]}` };
}
__name(parseMedidaFurniture, "parseMedidaFurniture");
function esGemeloFurniture(medida, productoTexto) {
  if (!medida) return false;
  if (medida.ancho >= 180) return true;
  if (medida.ancho === 160) return /gemelo/i.test(productoTexto || "");
  return false;
}
__name(esGemeloFurniture, "esGemeloFurniture");
var PROVINCIA_POR_CP = {
  "01": "\xC1LAVA",
  "02": "ALBACETE",
  "03": "ALICANTE",
  "04": "ALMER\xCDA",
  "05": "\xC1VILA",
  "06": "BADAJOZ",
  "07": "BALEARES",
  "08": "BARCELONA",
  "09": "BURGOS",
  "10": "C\xC1CERES",
  "11": "C\xC1DIZ",
  "12": "CASTELL\xD3N",
  "13": "CIUDAD REAL",
  "14": "C\xD3RDOBA",
  "15": "LA CORU\xD1A",
  "16": "CUENCA",
  "17": "GERONA",
  "18": "GRANADA",
  "19": "GUADALAJARA",
  "20": "GUIPUZCOA",
  "21": "HUELVA",
  "22": "HUESCA",
  "23": "JA\xC9N",
  "24": "LE\xD3N",
  "25": "L\xC9RIDA",
  "26": "LA RIOJA",
  "27": "LUGO",
  "28": "MADRID",
  "29": "M\xC1LAGA",
  "30": "MURCIA",
  "31": "NAVARRA",
  "32": "ORENSE",
  "33": "ASTURIAS",
  "34": "PALENCIA",
  "35": "LAS PALMAS",
  "36": "PONTEVEDRA",
  "37": "SALAMANCA",
  "38": "SANTA CRUZ DE TENERIFE",
  "39": "CANTABRIA",
  "40": "SEGOVIA",
  "41": "SEVILLA",
  "42": "SORIA",
  "43": "TARRAGONA",
  "44": "TERUEL",
  "45": "TOLEDO",
  "46": "VALENCIA",
  "47": "VALLADOLID",
  "48": "VIZCAYA",
  "49": "ZAMORA",
  "50": "ZARAGOZA",
  "51": "CEUTA",
  "52": "MELILLA"
};
function provinciaPorCp(postalCode) {
  const p = PROVINCIA_POR_CP[(postalCode || "").slice(0, 2)] || "";
  return p.replace(/Ñ/g, "\0").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\u0000/g, "\xD1");
}
__name(provinciaPorCp, "provinciaPorCp");
function nombreCortoProducto(stockModel) {
  const partes = (stockModel || "").split("|");
  return partes[partes.length - 1].trim().replace(/^almohada\s+/i, "").replace(/^colch[oó]n\s+/i, "").replace(/\s+gran hotel$/i, "");
}
__name(nombreCortoProducto, "nombreCortoProducto");
function bultosCanapeMadera(modelo, medida, color, referencia, tapaPartida) {
  const linea = /* @__PURE__ */ __name((parte) => ({ parte, texto: [referencia, parte, modelo, medida.text, color].filter(Boolean).join(" ") }), "linea");
  if (medida.ancho >= 160) {
    return [linea("TAPA \xBD"), linea("TAPA 2/2"), linea("CAJ\xD3N \xBD"), linea("CAJ\xD3N 2/2"), linea("FONDO"), linea("JUEGO BISAGRAS E HIDR\xC1ULICOS \xBD"), linea("JUEGO BISAGRAS E HIDR\xC1ULICOS 2/2")];
  }
  if (tapaPartida) {
    return [linea("TAPA PARTIDA \xBD"), linea("TAPA PARTIDA 2/2"), linea("CAJ\xD3N"), linea("FONDO"), linea("JUEGO BISAGRAS E HIDR\xC1ULICOS")];
  }
  return [linea("TAPA"), linea("CAJ\xD3N"), linea("FONDO"), linea("JUEGO BISAGRAS E HIDR\xC1ULICOS")];
}
__name(bultosCanapeMadera, "bultosCanapeMadera");
function bultosCanapeGranCapacidad(modelo, medida, color, referencia, tapaPartida, gemelo) {
  const linea = /* @__PURE__ */ __name((parte) => ({ parte, texto: [referencia, parte, modelo, medida.text, color].filter(Boolean).join(" ") }), "linea");
  if (gemelo) return [linea("TAPA \xBD"), linea("TAPA 2/2"), linea("CAJ\xD3N \xBD"), linea("CAJ\xD3N 2/2")];
  if (tapaPartida) return [linea("TAPA PARTIDA \xBD"), linea("TAPA PARTIDA 2/2"), linea("CAJ\xD3N CABECERO"), linea("CAJ\xD3N PIECERO")];
  return [linea("TAPA"), linea("CAJ\xD3N CABECERO"), linea("CAJ\xD3N PIECERO")];
}
__name(bultosCanapeGranCapacidad, "bultosCanapeGranCapacidad");
function bultosCanapeMagnum(modelo, medida, color, referencia, tapaPartida, gemelo) {
  const linea = /* @__PURE__ */ __name((parte) => ({ parte, texto: [referencia, parte, modelo, medida.text, color].filter(Boolean).join(" ") }), "linea");
  if (gemelo) return [linea("TAPA \xBD"), linea("TAPA 2/2"), linea("CAJ\xD3N \xBD"), linea("CAJ\xD3N 2/2")];
  const rows = tapaPartida ? [linea("TAPA PARTIDA \xBD"), linea("TAPA PARTIDA 2/2"), linea("CAJ\xD3N CABECERO"), linea("CAJ\xD3N PIECERO")] : [linea("TAPA"), linea("CAJ\xD3N CABECERO"), linea("CAJ\xD3N PIECERO")];
  if (medida.ancho >= 135) rows.push(linea("FONDO"));
  return rows;
}
__name(bultosCanapeMagnum, "bultosCanapeMagnum");
function bultosCanapeInitial(modelo, medida, color, referencia, tapaPartida, gemelo) {
  const linea = /* @__PURE__ */ __name((parte) => ({ parte, texto: [referencia, parte, modelo, medida.text, color].filter(Boolean).join(" ") }), "linea");
  if (gemelo) return [linea("TAPA \xBD"), linea("TAPA 2/2"), linea("CAJ\xD3N \xBD"), linea("CAJ\xD3N 2/2"), linea("JUEGO DE PATAS")];
  const rows = tapaPartida ? [linea("TAPA PARTIDA \xBD"), linea("TAPA PARTIDA 2/2"), linea("CAJ\xD3N CABECERO"), linea("CAJ\xD3N PIECERO")] : [linea("TAPA"), linea("CAJ\xD3N CABECERO"), linea("CAJ\xD3N PIECERO")];
  if (medida.ancho >= 135) rows.push(linea("FONDO"));
  rows.push(linea("JUEGO DE PATAS"));
  return rows;
}
__name(bultosCanapeInitial, "bultosCanapeInitial");
function bultosBase(medida, color, referencia) {
  const patas = medida.ancho < 135 || medida.ancho === 135 && medida.largo <= 190 ? 4 : 6;
  return [
    { parte: "BASE", texto: [referencia, "BASE", medida.text, color].filter(Boolean).join(" ") },
    { parte: "JUEGO DE PATAS", texto: `JUEGO DE ${patas} PATAS` }
  ];
}
__name(bultosBase, "bultosBase");
var CANAPE_MODELO_RULES = [
  { test: /* @__PURE__ */ __name((t) => /esquinas curvas/i.test(t), "test"), gen: bultosCanapeMadera, modelo: "CANAP\xC9 MADERA" },
  { test: /* @__PURE__ */ __name((t) => /esquinas rectas/i.test(t), "test"), gen: bultosCanapeMadera, modelo: "CANAP\xC9 MADERA ASTRA" },
  { test: /* @__PURE__ */ __name((t) => /extra capacidad/i.test(t), "test"), gen: bultosCanapeGranCapacidad, modelo: "CANAP\xC9 GRAN CAPACIDAD" },
  { test: /* @__PURE__ */ __name((t) => /apertura lateral/i.test(t), "test"), gen: bultosCanapeGranCapacidad, modelo: "CANAP\xC9 POLIPIEL APERTURA LATERAL" },
  { test: /* @__PURE__ */ __name((t) => /borde polipiel/i.test(t), "test"), gen: bultosCanapeGranCapacidad, modelo: "CANAP\xC9 POLIPIEL BORDE DELUXE" },
  { test: /* @__PURE__ */ __name((t) => /tapizado en tela.*alta capacidad/i.test(t), "test"), gen: bultosCanapeGranCapacidad, modelo: "CANAP\xC9 TELA" },
  { test: /* @__PURE__ */ __name((t) => /con ruedas/i.test(t), "test"), gen: bultosCanapeMagnum, modelo: "CANAP\xC9 MAGNUM" },
  { test: /* @__PURE__ */ __name((t) => /tapizado en tela premium/i.test(t), "test"), gen: bultosCanapeInitial, modelo: "CANAP\xC9 SOUL" },
  { test: /* @__PURE__ */ __name((t) => /con patas/i.test(t), "test"), gen: bultosCanapeInitial, modelo: "CANAP\xC9 INITIAL" },
  { test: /* @__PURE__ */ __name((t) => /alta capacidad y resistencia/i.test(t) && !/esquinas/i.test(t), "test"), gen: bultosCanapeGranCapacidad, modelo: "CANAP\xC9 POLIPIEL" }
];
function matchCanapeRule(title) {
  return CANAPE_MODELO_RULES.find((r) => r.test(title || "")) || null;
}
__name(matchCanapeRule, "matchCanapeRule");
function extraerMedidaDeMercancia(mercanciaFabrica) {
  const m = /MEDIDA:\s*([^·]+)/i.exec(mercanciaFabrica || "");
  return m ? m[1].trim().replace(/cm/gi, "").trim() : "";
}
__name(extraerMedidaDeMercancia, "extraerMedidaDeMercancia");
function tapaReforzadaFurniture(services) {
  const m = /Tapa de Canapé:\s*([^·]+)/i.exec(services || "");
  return !!(m && m[1].trim().toLowerCase().startsWith("tapa reforzada"));
}
__name(tapaReforzadaFurniture, "tapaReforzadaFurniture");
function marcarTapaReforzada(piezas) {
  return piezas.map((p) => {
    if (!/^TAPA\b/.test(p.parte) || /REFORZADA|PARTIDA/.test(p.parte)) return p;
    const parte = p.parte.replace(/^TAPA/, "TAPA REFORZADA");
    return { parte, texto: p.texto.replace(p.parte, parte) };
  });
}
__name(marcarTapaReforzada, "marcarTapaReforzada");
function piezasBackorder(b, productoTexto, tapaPartida, servicios) {
  const stockModel = b.stockModel || "";
  const t = stockModel.toLowerCase();
  const referencia = b.referencia || "";
  const color = (b.color || "").replace(/^(tela|polipiel)\s*-\s*/i, "");
  if (t.includes("canap")) {
    const medida = parseMedidaFurniture(b.talla);
    const rule = matchCanapeRule(stockModel);
    if (!rule || !medida) return [{ parte: "REVISAR", texto: `REVISAR (sin regla de bultos): ${stockModel} ${b.talla}` }];
    const gemelo = b.formato160 ? b.formato160 === "GEMELOS" : esGemeloFurniture(medida, productoTexto);
    let piezas = rule.gen(rule.modelo, medida, color, referencia, tapaPartida, gemelo);
    if (tapaReforzadaFurniture(servicios)) piezas = marcarTapaReforzada(piezas);
    if (b.tapaStock) {
      piezas = piezas.map((p) => /^TAPA/.test(p.parte) ? { ...p, texto: "STOCK " + (referencia && p.texto.startsWith(referencia + " ") ? p.texto.slice(referencia.length + 1) : p.texto) } : p);
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
  const prefijo = { almohada: "ALMOHADA", protector: "PROTECTOR", topper: "TOPPER" }[b.tipo] || "COLCH\xD3N";
  const corto = nombreCortoProducto(stockModel).replace(/^(protector|topper)\s+/i, "");
  const base = `${corto} ${b.talla || ""}`.trim();
  const cantidad = b.cantidad || 1;
  if (cantidad <= 1) return [{ parte: prefijo, texto: `${prefijo} ${base}`.trim() }];
  const rows = [];
  for (let i = 1; i <= cantidad; i++) rows.push({ parte: prefijo, texto: `${prefijo} ${i}/${cantidad} ${base}`.trim() });
  return rows;
}
__name(piezasBackorder, "piezasBackorder");
function descripcionesBackorder(b, productoTexto, tapaPartida, servicios) {
  return piezasBackorder(b, productoTexto, tapaPartida, servicios).map((p) => p.texto);
}
__name(descripcionesBackorder, "descripcionesBackorder");
function csvEscapeFurniture(value) {
  const s = String(value ?? "");
  if (/[;"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
__name(csvEscapeFurniture, "csvEscapeFurniture");
var FURNITURE_COLUMNAS_SIN_TILDES = [7, 12];
function sinTildesFurniture(texto) {
  return String(texto ?? "").replace(/½/g, "1/2").replace(/[—–]/g, "-").replace(/Ñ/g, "\0").replace(/ñ/g, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\u0000/g, "\xD1").replace(/\u0001/g, "\xF1");
}
__name(sinTildesFurniture, "sinTildesFurniture");
function buildFurnitureCsv(rows) {
  const lines = [FURNITURE_CSV_HEADERS.map(csvEscapeFurniture).join(";")];
  for (const row of rows) {
    const limpia = row.map((v, i) => FURNITURE_COLUMNAS_SIN_TILDES.includes(i) ? sinTildesFurniture(v) : v);
    lines.push(limpia.map(csvEscapeFurniture).join(";"));
  }
  return "\uFEFF" + lines.join("\r\n");
}
__name(buildFurnitureCsv, "buildFurnitureCsv");
async function buildFurnitureExport(env, cargaId) {
  const ordersId = env.ORDERS_STORE.idFromName("shopify");
  const ordersStub = env.ORDERS_STORE.get(ordersId);
  const invStub = inventoryStub(env);
  const [orders, cargas, backorders] = await Promise.all([
    ordersStub.fetch("https://do/orders").then((r) => r.json()),
    ordersStub.fetch("https://do/cargas").then((r) => r.json()),
    invStub.fetch("https://do/backorders").then((r) => r.json())
  ]);
  const carga = cargaId ? cargas.find((c) => c.id === cargaId) : cargas.find((c) => (c.tipo || "furniture") === "furniture" && c.estado === "abierta");
  if (!carga) return { error: "No hay carga abierta." };
  const clavePedido = /* @__PURE__ */ __name((o) => String(o.grupoEnvio || o.id), "clavePedido");
  const pedidos = orders.filter((o) => o.cargaId === carga.id).sort((a, b) => clavePedido(a).localeCompare(clavePedido(b)) || (a.id === a.grupoEnvio ? -1 : b.id === b.grupoEnvio ? 1 : 0));
  const cargaFecha = /* @__PURE__ */ new Date(carga.fecha + "T00:00:00Z");
  const fechaSubida = new Date(cargaFecha);
  fechaSubida.setUTCDate(fechaSubida.getUTCDate() - 1);
  const fechaTexto = [fechaSubida.getUTCDate(), fechaSubida.getUTCMonth() + 1, fechaSubida.getUTCFullYear()].map((n, i) => i < 2 ? String(n).padStart(2, "0") : n).join("/");
  const rows = [];
  const rowKeys = [];
  for (const o of pedidos) {
    const envio = o.grupoEnvio && orders.find((x) => x.id === o.grupoEnvio) || o;
    const montaje = tieneMontajeFurniture(o.services);
    const tapaPartida = tapaPartidaFurniture(o.services);
    const observaciones = observacionesRetiradaFurniture(o.services);
    const telefono = limpiarTelefonoFurniture(envio.phone);
    const backordersPedido = backorders.filter((b) => b.orderId === o.id && (b.estado === "pendiente" || b.estado === "cubierto") && !b.reposicion && !b.gestoComercial && !b.envioAparte && !(b.tipo === "colchon" && b.tipoEnvio !== "FUR"));
    const descripciones = backordersPedido.length ? backordersPedido.flatMap((b) => descripcionesBackorder(b, o.product, tapaPartida, o.services)) : [o.product || ""];
    for (const descrip of descripciones) {
      rows.push([
        fechaTexto,
        "",
        referenciaPedido(envio),
        envio.name,
        envio.furnitureAddress || envio.address || "",
        envio.postalCode || "",
        envio.city || "",
        descrip,
        "1",
        "1229",
        telefono,
        telefono,
        observaciones,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        montaje ? "SUBIDA Y MONTAJE" : "SUBIDA A PISO",
        "1",
        "",
        "",
        "",
        envio.email || o.email || "",
        provinciaPorCp(envio.postalCode),
        ""
      ]);
      rowKeys.push("o:" + o.id);
    }
  }
  const reposicionesEnCarga = backorders.filter((b) => b.reposicion && b.estado === "pendiente" && b.cargaId === carga.id && !(b.tipo === "colchon" && b.agenciaReposicion === "SEUR"));
  for (const b of reposicionesEnCarga) {
    const o = orders.find((x) => x.id === b.orderId);
    if (!o) continue;
    const montaje = tieneMontajeFurniture(o.services);
    let observaciones = "REPOSICI\xD3N \u2014 desmontar y retirar la pieza da\xF1ada, devolver a almac\xE9n";
    if (b.tipo === "colchon") {
      if (!b.recogida) {
        observaciones = "REPOSICI\xD3N \u2014 colch\xF3n nuevo, SIN recogida del colch\xF3n anterior";
      } else if (b.recogidaDestino === "desechar") {
        observaciones = "REPOSICI\xD3N \u2014 recoger el colch\xF3n da\xF1ado, es PARA DESECHAR";
      } else {
        observaciones = "REPOSICI\xD3N \u2014 recoger el colch\xF3n da\xF1ado y devolver a nuestras instalaciones";
      }
    }
    const telefono = limpiarTelefonoFurniture(o.phone);
    let descripciones = [[b.referencia, b.stockModel, b.talla, b.color].filter(Boolean).join(" ")];
    if (Array.isArray(b.piezasIdx) && b.piezasIdx.length && b.stockModelArticulo) {
      const todas = piezasBackorder({ ...b, stockModel: b.stockModelArticulo, cantidad: 1 }, o.product, tapaPartidaFurniture(o.services), o.services);
      const elegidas = b.canapeCompleto ? todas : b.piezasIdx.map((i) => todas[i]).filter(Boolean);
      if (elegidas.length) {
        descripciones = [];
        for (let u = 0; u < (b.cantidad || 1); u++) for (const p of elegidas) descripciones.push(p.texto);
      }
    }
    for (const descrip of descripciones) {
      rows.push([
        fechaTexto,
        "",
        "REP" + referenciaPedido(o),
        o.name,
        o.furnitureAddress || o.address || "",
        o.postalCode || "",
        o.city || "",
        descrip,
        "1",
        "1229",
        telefono,
        telefono,
        observaciones,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        montaje ? "SUBIDA Y MONTAJE" : "SUBIDA A PISO",
        "1",
        "",
        "",
        "",
        o.email || "",
        provinciaPorCp(o.postalCode),
        ""
      ]);
      rowKeys.push("b:" + b.id);
    }
  }
  const aparteEnCarga = backorders.filter((b) => b.envioAparte && (b.estado === "pendiente" || b.estado === "cubierto") && b.cargaId === carga.id);
  for (const b of aparteEnCarga) {
    const o = orders.find((x) => x.id === b.orderId);
    if (!o) continue;
    const envio = o.grupoEnvio && orders.find((x) => x.id === o.grupoEnvio) || o;
    const montaje = tieneMontajeFurniture(o.services);
    const telefono = limpiarTelefonoFurniture(envio.phone);
    const observaciones = "Resto del pedido " + referenciaPedido(o) + " (segundo env\xEDo)";
    for (const descrip of descripcionesBackorder(b, o.product, tapaPartidaFurniture(o.services), o.services)) {
      rows.push([
        fechaTexto,
        "",
        referenciaPedido(envio) + (b.refSuffix || ""),
        envio.name,
        envio.furnitureAddress || envio.address || "",
        envio.postalCode || "",
        envio.city || "",
        descrip,
        "1",
        "1229",
        telefono,
        telefono,
        observaciones,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        montaje ? "SUBIDA Y MONTAJE" : "SUBIDA A PISO",
        "1",
        "",
        "",
        "",
        envio.email || o.email || "",
        provinciaPorCp(envio.postalCode),
        ""
      ]);
      rowKeys.push("b:" + b.id);
    }
  }
  return { rows, rowKeys, carga };
}
__name(buildFurnitureExport, "buildFurnitureExport");
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
    return [rule ? rule.modelo : stockModel, b.talla, color].filter(Boolean).join(" ") + (extras.length ? " \xB7 " + extras.join(" \xB7 ") : "");
  }
  const piezas = piezasBackorder({ ...b, cantidad: 1, referencia: "" }, productoTexto, false, services);
  if (t.includes("base") && piezas[1]) return piezas[0].texto + " + " + piezas[1].texto;
  return piezas[0] ? piezas[0].texto : stockModel;
}
__name(productoAlmacen, "productoAlmacen");
async function buildListadoAlmacen(env, cargaId) {
  const ordersStub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
  const [orders, cargas, backorders] = await Promise.all([
    ordersStub.fetch("https://do/orders").then((r) => r.json()),
    ordersStub.fetch("https://do/cargas").then((r) => r.json()),
    inventoryStub(env).fetch("https://do/backorders").then((r) => r.json())
  ]);
  const carga = cargaId ? cargas.find((c) => c.id === cargaId) : cargas.find((c) => (c.tipo || "furniture") === "furniture" && c.estado === "abierta");
  if (!carga) return { error: "No hay carga abierta." };
  const clavePedido = /* @__PURE__ */ __name((o) => String(o.grupoEnvio || o.id), "clavePedido");
  const pedidos = orders.filter((o) => o.cargaId === carga.id).sort((a, b) => clavePedido(a).localeCompare(clavePedido(b)) || (a.id === a.grupoEnvio ? -1 : b.id === b.grupoEnvio ? 1 : 0));
  const filas = [];
  const fila = /* @__PURE__ */ __name((pedido, o, referencia, producto, cantidad, b) => filas.push({ pedido, referencia: referencia || "", producto, cantidad: cantidad || 1, montaje: tieneMontajeFurniture(o.services), reservado: b && b.reservaEnviada || null }), "fila");
  for (const o of pedidos) {
    const envio = o.grupoEnvio && orders.find((x) => x.id === o.grupoEnvio) || o;
    const lineas = backorders.filter((b) => b.orderId === o.id && (b.estado === "pendiente" || b.estado === "cubierto") && !b.reposicion && !b.gestoComercial && !b.envioAparte && !(b.tipo === "colchon" && b.tipoEnvio !== "FUR"));
    if (!lineas.length) {
      fila(referenciaPedido(envio), o, "", o.product || "", 1);
      continue;
    }
    for (const b of lineas) fila(referenciaPedido(envio), o, b.referencia, productoAlmacen(b, o.product, o.services), b.cantidad, b);
  }
  for (const b of backorders.filter((b2) => b2.reposicion && b2.estado === "pendiente" && b2.cargaId === carga.id && !(b2.tipo === "colchon" && b2.agenciaReposicion === "SEUR"))) {
    const o = orders.find((x) => x.id === b.orderId);
    if (o) fila("REP" + referenciaPedido(o), o, b.referencia, "REPOSICI\xD3N: " + [b.stockModel, b.talla, b.color].filter(Boolean).join(" "), b.cantidad);
  }
  for (const b of backorders.filter((b2) => b2.envioAparte && (b2.estado === "pendiente" || b2.estado === "cubierto") && b2.cargaId === carga.id)) {
    const o = orders.find((x) => x.id === b.orderId);
    if (!o) continue;
    const envio = o.grupoEnvio && orders.find((x) => x.id === o.grupoEnvio) || o;
    fila(referenciaPedido(envio) + (b.refSuffix || ""), o, b.referencia, productoAlmacen(b, o.product, o.services), b.cantidad, b);
  }
  return { carga, filas };
}
__name(buildListadoAlmacen, "buildListadoAlmacen");
var SEUR_CSV_HEADERS = [
  "REF",
  "NOMBRE",
  "DIRECCION",
  "CP",
  "POBLACION",
  "TLF CONTACTO",
  "",
  "BULTOS",
  "KILOS",
  "",
  "PAIS",
  "OBSERVACIONES",
  "",
  "",
  "",
  "EMAIL",
  "SERVICIO",
  "PRODUCTO"
];
var ALMOHADA_NUNCA_COMBINA_KEYWORDS_EXPORT = ["sea foam", "seafoam"];
function limpiarTelefonoSeur(phone) {
  return (phone || "").replace(/^\+34\s*/, "").trim();
}
__name(limpiarTelefonoSeur, "limpiarTelefonoSeur");
function truncarReferenciaSeur(ref) {
  return ref.length > 15 ? ref.slice(ref.length - 15) : ref;
}
__name(truncarReferenciaSeur, "truncarReferenciaSeur");
function referenciaPedido(o) {
  return o.platform && o.platform !== "Shopify" && o.orderRef ? o.orderRef : "BEZEN" + o.orderNumber;
}
__name(referenciaPedido, "referenciaPedido");
function referenciaSeur(o, refSuffix, prefijo) {
  let ref = o && o.platform === "Leroy Merlin" ? referenciaPedido(o).replace(/^0+/, "") : referenciaPedido(o);
  const pre = prefijo || "";
  if (o && o.platform === "Leroy Merlin" && !pre && (ref + (refSuffix || "")).length > 15) ref = ref.replace("-", "");
  let cuerpo = ref + (refSuffix || "");
  if (pre.length + cuerpo.length > 15) cuerpo = cuerpo.slice(cuerpo.length - (15 - pre.length));
  return truncarReferenciaSeur(pre + cuerpo);
}
__name(referenciaSeur, "referenciaSeur");
function empaquetarPiezasSeur(piezas) {
  const paquetes = [];
  const sueltaPorSku = /* @__PURE__ */ new Map();
  for (const p of piezas) {
    const medida = parseFloat(String(p.talla || "").replace(",", "."));
    const emparejable = p.tipo === "almohada" && medida > 0 && medida <= 90 && !matchesKeywordSeur(p.title, ALMOHADA_NUNCA_COMBINA_KEYWORDS_EXPORT);
    const suelta = emparejable && sueltaPorSku.get(p.sku);
    if (suelta) {
      suelta.piezas.push(p);
      suelta.kilos = Math.round((suelta.kilos + p.pesoUnidad) * 100) / 100;
      sueltaPorSku.delete(p.sku);
      continue;
    }
    const paquete = { piezas: [p], kilos: p.pesoUnidad, nuncaCombina: p.tipo === "almohada" && matchesKeywordSeur(p.title, ALMOHADA_NUNCA_COMBINA_KEYWORDS_EXPORT) };
    paquetes.push(paquete);
    if (emparejable) sueltaPorSku.set(p.sku, paquete);
  }
  return paquetes;
}
__name(empaquetarPiezasSeur, "empaquetarPiezasSeur");
function agruparLineasSeur(piezas, esNacional) {
  const paquetes = empaquetarPiezasSeur(piezas);
  if (!esNacional) {
    return paquetes.map((q) => ({ piezas: q.piezas, bultos: 1, kilos: q.kilos }));
  }
  const lineas = [];
  for (const q of paquetes) {
    const ultima = lineas[lineas.length - 1];
    if (!q.nuncaCombina && ultima && Math.round((ultima.kilos + q.kilos) * 100) / 100 <= 40) {
      ultima.piezas.push(...q.piezas);
      ultima.bultos += 1;
      ultima.kilos = Math.round((ultima.kilos + q.kilos) * 100) / 100;
    } else {
      lineas.push({ piezas: [...q.piezas], bultos: 1, kilos: q.kilos });
    }
  }
  return lineas;
}
__name(agruparLineasSeur, "agruparLineasSeur");
function matchesKeywordSeur(title, keywords) {
  const t = (title || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return keywords.some((k) => t.includes(k));
}
__name(matchesKeywordSeur, "matchesKeywordSeur");
function observacionesSeur(linea) {
  const porSku = /* @__PURE__ */ new Map();
  for (const p of linea.piezas) {
    if (!porSku.has(p.sku)) porSku.set(p.sku, 0);
    porSku.set(p.sku, porSku.get(p.sku) + 1);
  }
  return [...porSku.entries()].map(([sku, n]) => n > 1 ? `${sku} (${n}UD)` : sku).join(" + ");
}
__name(observacionesSeur, "observacionesSeur");
async function buildListadoAlmacenSeur(env, cargaId) {
  const ordersStub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
  const [orders, cargas, backorders] = await Promise.all([
    ordersStub.fetch("https://do/orders").then((r) => r.json()),
    ordersStub.fetch("https://do/cargas").then((r) => r.json()),
    inventoryStub(env).fetch("https://do/backorders").then((r) => r.json())
  ]);
  const carga = cargas.find((c) => c.id === cargaId && c.tipo === "seur");
  if (!carga) return { error: "No se encuentra esa carga de SEUR." };
  const hoy = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
  const diaDe = /* @__PURE__ */ __name((iso) => iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }) : "", "diaDe");
  const corto = /* @__PURE__ */ __name((iso) => {
    const d = diaDe(iso);
    return d ? d.slice(8, 10) + "/" + d.slice(5, 7) : "";
  }, "corto");
  const producto = /* @__PURE__ */ __name((b) => [b.tipo === "almohada" ? "ALMOHADA" : b.tipo === "colchon" ? "COLCH\xD3N" : b.tipo === "topper" && !/topper/i.test(nombreCortoProducto(b.stockModel)) ? "TOPPER" : "", nombreCortoProducto(b.stockModel), b.talla].filter(Boolean).join(" "), "producto");
  const filas = [];
  for (const o of orders) {
    if (o.agencia !== "SEUR" || o.cargaId !== carga.id) continue;
    const cubiertos = backorders.filter((b) => b.orderId === o.id && b.estado === "cubierto");
    if (!cubiertos.length) {
      filas.push({ pedido: referenciaSeur(o, "", ""), cliente: o.name || "", producto: o.product || "", cantidad: 1, origen: "STOCK" });
      continue;
    }
    for (const b of cubiertos) filas.push({ pedido: referenciaSeur(o, b.refSuffix || "", ""), cliente: o.name || "", producto: producto(b), cantidad: b.cantidad || 1, origen: b.reservaEnviada ? "YA APARTADO CON ETIQUETA DE RESERVA (" + corto(b.reservaEnviada) + ")" : "STOCK" });
  }
  for (const b of backorders) {
    if (b.estado !== "listo-seur" || b.cargaId !== carga.id) continue;
    const o = orders.find((x) => x.id === b.orderId);
    if (!o) continue;
    const prefijo = b.reposicion ? "REP" : b.gestoComercial ? "GC" : "";
    let origen;
    if (b.reservaEnviada) origen = "YA APARTADO CON ETIQUETA DE RESERVA (" + corto(b.reservaEnviada) + ")";
    else if (/^ENVÍO SUELTO/i.test(b.mercanciaFabrica || "")) origen = "APARTADO EN ALMAC\xC9N";
    else if (b.fechaRecibido) origen = diaDe(b.fechaRecibido) === hoy ? "RECIBIDO HOY (" + (b.proveedor || "f\xE1brica") + ")" : "RECIBIDO " + corto(b.fechaRecibido) + " (" + (b.proveedor || "f\xE1brica") + ")";
    else origen = "RECIBIDO DE " + (b.proveedor || "F\xC1BRICA");
    filas.push({ pedido: referenciaSeur(o, b.refSuffix || "", prefijo), cliente: o.name || "", producto: producto(b), cantidad: b.cantidad || 1, origen });
  }
  filas.sort((a, b) => a.origen.localeCompare(b.origen) || a.pedido.localeCompare(b.pedido));
  return { carga, filas };
}
__name(buildListadoAlmacenSeur, "buildListadoAlmacenSeur");
function cpSeur(o) {
  const cp = String(o.postalCode || "").trim();
  return String(o.countryCode || "").toUpperCase() === "PT" ? cp.replace(/[^0-9]/g, "") : cp;
}
__name(cpSeur, "cpSeur");
async function cargarDatosSeurExport(env) {
  const ordersStub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
  const invStub = inventoryStub(env);
  const [orders, cargas, backorders, catalog, pesosList] = await Promise.all([
    ordersStub.fetch("https://do/orders").then((r) => r.json()),
    ordersStub.fetch("https://do/cargas").then((r) => r.json()),
    invStub.fetch("https://do/backorders").then((r) => r.json()),
    invStub.fetch("https://do/catalog").then((r) => r.json()),
    invStub.fetch("https://do/pesos").then((r) => r.json())
  ]);
  return { orders, cargas, backorders, catalog, pesosList };
}
__name(cargarDatosSeurExport, "cargarDatosSeurExport");
async function buildSeurExport(env, cargaId, opts = {}) {
  const { orders, cargas, backorders, catalog, pesosList } = opts.datos || await cargarDatosSeurExport(env);
  const servido = /* @__PURE__ */ __name((b) => opts.incluirServidos && b.estado === "servido", "servido");
  const carga = cargas.find((c) => c.id === cargaId && c.tipo === "seur");
  if (!carga) return { error: "No se encuentra esa carga de SEUR." };
  const pesos = Object.fromEntries(pesosList.map((p) => [p.sku, p.peso]));
  const productoPorStockModel = /* @__PURE__ */ new Map();
  for (const p of catalog) if (!productoPorStockModel.has(p.stockModel)) productoPorStockModel.set(p.stockModel, p);
  const ordersById = new Map(orders.map((o) => [o.id, o]));
  const itemsPorPedido = /* @__PURE__ */ new Map();
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
  __name(agregarItem, "agregarItem");
  for (const o of orders) {
    if (o.agencia !== "SEUR" || o.cargaId !== carga.id) continue;
    for (const b of backorders) {
      if (b.orderId === o.id && (b.estado === "cubierto" || servido(b) && !b.cargaId)) agregarItem(o.id, b);
    }
  }
  for (const b of backorders) {
    if ((b.estado === "listo-seur" || servido(b)) && b.cargaId === carga.id) agregarItem(b.orderId, b);
  }
  const rows = [];
  const rowOrderIds = [];
  const avisos = [];
  for (const [orderId, piezas] of itemsPorPedido) {
    const o = ordersById.get(orderId);
    if (!o) continue;
    const esNacional = o.countryCode === "ES" || o.countryCode === "PT";
    const codRemitente = esNacional ? "63235" : "48297";
    const telefono = limpiarTelefonoSeur(o.phone);
    const direccion = o.streetAddress || o.address || "";
    const porSufijo = /* @__PURE__ */ new Map();
    for (const p of piezas) {
      if (!porSufijo.has(p.refSuffix)) porSufijo.set(p.refSuffix, []);
      porSufijo.get(p.refSuffix).push(p);
    }
    for (const [sufijoBase, piezasGrupo] of porSufijo) {
      const lineas = agruparLineasSeur(piezasGrupo, esNacional);
      lineas.forEach((linea, idx) => {
        let sufijo = sufijoBase;
        for (let i = 0; i < idx; i++) sufijo = nextRefSuffixExport(sufijo);
        const esReposicion = linea.piezas.every((p) => p.reposicion);
        const esGestoComercial = linea.piezas.every((p) => p.gestoComercial);
        const ref = referenciaSeur(o, sufijo, esReposicion ? "REP" : esGestoComercial ? "GC" : "");
        const netExpress = linea.piezas.some((p) => p.tipo === "colchon" && calificaNetExpressExport(p.title, p.talla));
        const servicio = !esNacional ? netExpress ? "19" : "77" : "31";
        const producto = !esNacional ? netExpress ? "10" : "70" : "2";
        const sinPeso = linea.piezas.filter((p) => p.pesoUnidad == null);
        if (sinPeso.length) avisos.push(`${referenciaPedido(o)}: sin peso conocido para ${[...new Set(sinPeso.map((p) => p.sku))].join(", ")} \u2014 revisa Pesos SEUR.`);
        rows.push([
          ref,
          o.name,
          direccion,
          cpSeur(o),
          o.city || "",
          telefono,
          telefono,
          String(linea.bultos),
          String(linea.kilos),
          codRemitente,
          o.countryCode || "",
          observacionesSeur(linea),
          "",
          "",
          "",
          o.email || "",
          servicio,
          producto
        ]);
        rowOrderIds.push(o.id);
      });
    }
  }
  return { rows, rowOrderIds, carga, avisos };
}
__name(buildSeurExport, "buildSeurExport");
function enviosDeExportSeur(result) {
  return result.rows.map((r, i) => ({ orderId: result.rowOrderIds[i], ref: r[0], nombre: r[1], pais: r[10], observaciones: r[11] }));
}
__name(enviosDeExportSeur, "enviosDeExportSeur");
function destinoSeurDePedido(o) {
  const cc = String(o && o.countryCode || "").toUpperCase();
  return cc === "ES" || cc === "PT" ? "nacional" : "internacional";
}
__name(destinoSeurDePedido, "destinoSeurDePedido");
function ordersStubSeur(env) {
  return env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
}
__name(ordersStubSeur, "ordersStubSeur");
function noLeidosCorreo(correo) {
  if (!correo || !correo.mensajes) return 0;
  const visto = correo.vistoHasta || "";
  return correo.mensajes.filter((m) => m.deSeur && (m.fecha || "") > visto).length;
}
__name(noLeidosCorreo, "noLeidosCorreo");
async function actualizarCorreosSeur(env, segundaPasada) {
  const orders = await ordersStubSeur(env).fetch("https://do/orders").then((r2) => r2.json());
  const norm = /* @__PURE__ */ __name((x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, ""), "norm");
  const lineas = [];
  for (const o of orders) {
    for (const [ref, info] of Object.entries(o.enviosSeurInfo || {})) {
      if (!info.correo || !(info.correo.threadIds || []).length) continue;
      const t = (o.seurTracking || []).find((x) => norm(x.referencia) === norm(info.refSeur || ref));
      lineas.push({ o, ref, refBusca: info.refSeur || ref, correo: info.correo, expedicion: t ? String(t.numeroExpedicion || "") : "" });
    }
    const refsCambiadas = new Set(Object.values(o.enviosSeurInfo || {}).map((i) => norm(i.refSeur)).filter(Boolean));
    for (const t of o.seurTracking || []) {
      const ref = t.referencia;
      if (t.anulado || !ref || norm(ref).length < 8 || refsCambiadas.has(norm(ref))) continue;
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
      if (texto.includes(norm(l.refBusca || l.ref)) || l.expedicion.length >= 6 && texto.includes(norm(l.expedicion))) ids.add(m.threadId);
    }
    const porId = /* @__PURE__ */ new Map();
    for (const id of ids) for (const m of (r.hilos || {})[id] || []) porId.set(m.id, { ...m, threadId: id });
    for (const m of r.sueltos || []) if (ids.has(m.threadId)) porId.set(m.id, m);
    const mensajes = [...porId.values()].sort((a, b) => (a.fecha || "").localeCompare(b.fecha || "")).map((m) => ({ id: m.id, threadId: m.threadId, fecha: m.fecha, de: m.de, asunto: m.asunto, texto: String(m.texto || "").slice(0, 6e3), deSeur: !!m.deSeur })).slice(-40);
    if (!mensajes.length) continue;
    const antes = new Set((l.correo.mensajes || []).map((m) => m.id));
    nuevos += mensajes.filter((m) => m.deSeur && !antes.has(m.id)).length;
    const correo = { threadIds: [...ids], mensajes, actualizado: (/* @__PURE__ */ new Date()).toISOString() };
    if (l.sinConversacion) {
      correo.destino = l.correo.destino;
      correo.asunto = mensajes[0].asunto || "";
    }
    cambios.push({ orderId: l.o.id, ref: l.ref, correo });
  }
  if (cambios.length) await ordersStubSeur(env).fetch("https://do/orders/envios-seur-correos", { method: "POST", body: JSON.stringify({ cambios }) });
  const enganchadas = lineas.filter((l) => l.sinConversacion && cambios.some((c) => c.orderId === l.o.id && c.ref === l.ref)).length;
  if (enganchadas && !segundaPasada) await actualizarCorreosSeur(env, true);
  return { ok: true, lineas: lineas.length, nuevos, enganchadas };
}
__name(actualizarCorreosSeur, "actualizarCorreosSeur");
function estadoSeurDeLinea(order, ref, lineasDelPedido) {
  const norm = /* @__PURE__ */ __name((x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, ""), "norm");
  const tracking = (order && order.seurTracking ? order.seurTracking : []).filter((t2) => !t2.anulado);
  const t = tracking.find((x) => norm(x.referencia) === norm(ref));
  return t || null;
}
__name(estadoSeurDeLinea, "estadoSeurDeLinea");
function seurSkuExport(product, talla) {
  return `${(product.skuPrefix || "").toUpperCase()}${talla}`;
}
__name(seurSkuExport, "seurSkuExport");
function nextRefSuffixExport(current) {
  const n = parseInt(current, 10);
  return Number.isFinite(n) ? String(n + 1) : "2";
}
__name(nextRefSuffixExport, "nextRefSuffixExport");
var NETEXPRESS_ANCHO_135_KEYWORDS_EXPORT = [
  "generacion z",
  "generacion zen",
  "paris",
  "zen mandala",
  "zen nirvana",
  "zen natural",
  "natural zen",
  "supreme zen",
  "origin zen"
];
var NETEXPRESS_ANCHO_180_KEYWORDS_EXPORT = [
  "pharmatherapy",
  "pharma-therapy",
  "bamboo deluxe",
  "bambu deluxe",
  "bellagio deluxe",
  "4d",
  "fitness",
  "latex gel",
  "ergo-relax",
  "ergo relax",
  "louvre",
  "murano",
  "toscana deluxe"
];
function calificaNetExpressExport(title, talla) {
  const m = /^(\d{2,3})X\d{2,3}$/.exec(talla || "");
  if (!m) return false;
  const ancho = Number(m[1]);
  if (matchesKeywordSeur(title, NETEXPRESS_ANCHO_135_KEYWORDS_EXPORT)) return ancho >= 135;
  if (matchesKeywordSeur(title, NETEXPRESS_ANCHO_180_KEYWORDS_EXPORT)) return ancho >= 180;
  return false;
}
__name(calificaNetExpressExport, "calificaNetExpressExport");
var FESTIVOS_SIN_CARGA2 = ["2026-10-12", "2026-11-09", "2026-12-07", "2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01"];
function errorFechaCargaSeur(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return "Fecha no v\xE1lida.";
  const w = (/* @__PURE__ */ new Date(fecha + "T12:00:00Z")).getUTCDay();
  if (w === 0 || w === 6) return "No hay cargas de SEUR ni s\xE1bado ni domingo.";
  if (FESTIVOS_SIN_CARGA2.includes(fecha)) return "Ese d\xEDa es festivo: no hay carga.";
  const hoy = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
  if (fecha < hoy) return "Esa fecha ya ha pasado.";
  return null;
}
__name(errorFechaCargaSeur, "errorFechaCargaSeur");
function buildSeurCsv(rows) {
  const lines = [SEUR_CSV_HEADERS.map(csvEscapeFurniture).join(";")];
  for (const row of rows) lines.push(row.map(csvEscapeFurniture).join(";"));
  return "\uFEFF" + lines.join("\r\n");
}
__name(buildSeurCsv, "buildSeurCsv");
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
  if (url.pathname === "/api/pedidos/admin/pedido-externo" && request.method === "POST") {
    const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
    const res = await stub.fetch("https://do/orders/import-simple", { method: "POST", body: JSON.stringify([await request.json()]) });
    return new Response(await res.text(), { status: res.status });
  }
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
  if (url.pathname === "/api/pedidos/shopify/admin/scopes") {
    const res = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/oauth/access_scopes.json`, {
      headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN }
    });
    const data = await res.json();
    return Response.json({ status: res.status, ...data });
  }
  if (url.pathname === "/api/pedidos/shopify") {
    return handleGetOrders(env);
  }
  if (url.pathname === "/api/admin/shopify-pedido-bruto" && request.method === "GET") {
    const numero = url.searchParams.get("numero");
    const res = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/orders.json?status=any&name=%23${numero}`, {
      headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN }
    });
    const data = await res.json();
    const o = (data.orders || []).find((x) => String(x.order_number) === String(numero));
    if (!o) return Response.json({ ok: false, error: "No encontrado." }, { status: 404 });
    return Response.json({
      ok: true,
      order_number: o.order_number,
      created_at: o.created_at,
      note: o.note,
      note_attributes: o.note_attributes,
      tags: o.tags,
      shipping_lines: (o.shipping_lines || []).map((s) => ({ title: s.title, code: s.code, source: s.source, delivery_category: s.delivery_category })),
      line_items: (o.line_items || []).map((li) => ({ title: li.title, variant_title: li.variant_title, properties: li.properties })),
      estimated_delivery: o.estimated_delivery_at || null
    });
  }
  if (url.pathname === "/api/admin/importar-pedido-suelto" && request.method === "POST") {
    const { numero } = await request.json();
    if (!numero) return Response.json({ ok: false, error: "Falta el n\xFAmero de pedido." }, { status: 400 });
    const res = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/orders.json?status=any&name=%23${numero}`, {
      headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN }
    });
    const data = await res.json();
    const found = (data.orders || []).find((o) => String(o.order_number) === String(numero));
    if (!found) return Response.json({ ok: false, error: "No se encontr\xF3 ese pedido en Shopify." }, { status: 404 });
    await handleUpsertOrder(found, env);
    const ultimoFulfillment = (found.fulfillments || [])[found.fulfillments.length - 1];
    if (ultimoFulfillment) {
      const idStub = env.ORDERS_STORE.idFromName("shopify");
      const stub = env.ORDERS_STORE.get(idStub);
      await stub.fetch("https://do/orders/shopify-fulfilled", {
        method: "POST",
        body: JSON.stringify({ id: found.id, fulfillmentId: ultimoFulfillment.id })
      });
    }
    return Response.json({ ok: true, orderNumber: found.order_number, id: found.id, created_at: found.created_at, fulfillmentId: ultimoFulfillment ? ultimoFulfillment.id : null });
  }
  const marketplaceImportMatch = url.pathname.match(/^\/api\/(carrefour|maison-du-monde|worten|conforama|conforama-es|leroy-merlin)\/import$/);
  if (marketplaceImportMatch && request.method === "POST") {
    const platform = MARKETPLACE_PLATFORM_BY_ID[marketplaceImportMatch[1]];
    const { entries, forzar } = await request.json();
    const catalogRes = await inventoryStub(env).fetch("https://do/catalog");
    const catalogList = await catalogRes.json();
    const catalogMap = Object.fromEntries(catalogList.map((p) => [p.productId, p]));
    const entriesPorPedido = /* @__PURE__ */ new Map();
    for (const e of entries || []) {
      if (!entriesPorPedido.has(e.orderNumber)) entriesPorPedido.set(e.orderNumber, []);
      entriesPorPedido.get(e.orderNumber).push(e);
    }
    const orders = [...entriesPorPedido.values()].map((grupo) => mapMarketplaceOrder(grupo, catalogMap, platform));
    const id = env.ORDERS_STORE.idFromName("shopify");
    const stub = env.ORDERS_STORE.get(id);
    if (!forzar) {
      const existentes = await (await stub.fetch("https://do/orders")).json();
      const aviso = comprobarTiendaFichero(orders, platform, existentes);
      if (aviso) return Response.json({ ok: false, tiendaIncorrecta: true, ...aviso }, { status: 409 });
    }
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
    let entry = null;
    try {
      entry = JSON.parse(texto);
    } catch (e) {
    }
    const reservaAuto = entry && (entry.tipo === "colchon" ? entry.tipoEnvio === "FUR" : ["almohada", "topper", "protector"].includes(entry.tipo));
    if (res.ok && entry && entry.recibidoFabrica && reservaAuto && !entry.reservaEnviada && !entry.reposicion && !entry.gestoComercial && !entry.envioAparte) {
      const backorders = await inventoryStub(env).fetch("https://do/backorders").then((r) => r.json());
      const resto = backorders.filter((b) => String(b.orderId) === String(entry.orderId) && b.id !== entry.id && (b.estado === "pendiente" || b.estado === "cubierto") && !b.reposicion && !b.gestoComercial && !b.envioAparte && !(b.tipo === "colchon" && b.tipoEnvio !== "FUR"));
      if (resto.some((b) => !b.recibidoFabrica)) {
        const avisoReserva = await reservarStockManual(env, entry);
        if (avisoReserva.ok) {
          await inventoryStub(env).fetch("https://do/backorders/" + encodeURIComponent(entry.id) + "/reserva-enviada", { method: "POST", body: "{}" });
          entry.reservaEnviada = (/* @__PURE__ */ new Date()).toISOString();
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
  const formato160Match = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/formato160$/);
  if (formato160Match && request.method === "POST") {
    const body = await request.text();
    const res = await inventoryStub(env).fetch("https://do/backorders/" + formato160Match[1] + "/formato160", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && data.entry) {
      const ordersStub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
      const o = await pedidoDeBackorder(env, data.entry);
      const reasons = o && o.reviewReasons || [];
      const answers = (o && o.reviewAnswers || []).slice();
      const idx = reasons.findIndex((r, i) => r.startsWith(PREGUNTA_FORMATO_160) && r.includes("(" + data.entry.talla) && !(answers[i] || "").trim());
      if (idx >= 0) {
        answers[idx] = data.entry.formato160 + " (elegido en Polival)";
        await ordersStub.fetch("https://do/orders/review-note", { method: "POST", body: JSON.stringify({ id: o.id, reviewAnswers: answers }) });
      }
    }
    return Response.json(data, { status: res.status });
  }
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
      const entry = data.entry;
      const o = await pedidoDeBackorder(env, entry);
      data.avisoReserva = await enviarReservaAlmacen(env, {
        pedido: referenciaPedidoAlmacen(entry),
        cliente: o && o.name || "",
        lineasTexto: [lineaTextoReserva(entry) + " \u2014 COLCH\xD3N ABIERTO" + (entry.notaAbierto ? " (" + entry.notaAbierto + ")" : "") + (entry.enrolladoDevuelto ? " (sustituye al enrollado, que vuelve a stock)" : "")],
        bultos: bultosPorUnidad(entry).map((b) => ({ ...b, parte: "COLCH\xD3N ABIERTO" + (entry.notaAbierto ? " \xB7 " + entry.notaAbierto : "") }))
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
    try {
      data = JSON.parse(texto);
    } catch (e) {
    }
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
    const body = await request.text();
    const id = decodeURIComponent(referenciaPendingMatch[1]);
    const antes = (await (await inventoryStub(env).fetch("https://do/backorders")).json()).find((b) => b.id === id);
    const res = await inventoryStub(env).fetch("https://do/backorders/" + referenciaPendingMatch[1] + "/referencia", { method: "POST", body });
    const texto = await res.text();
    let nueva = "";
    try {
      nueva = String(JSON.parse(body).referencia || "").trim().toUpperCase();
    } catch (e) {
    }
    if (res.ok && antes && nueva === "STOCK" && !antes.reservaEnviada) {
      const entry = { ...antes, referencia: "STOCK" };
      const avisoReserva = await reservarStockManual(env, entry);
      if (avisoReserva.ok) {
        await inventoryStub(env).fetch("https://do/backorders/" + referenciaPendingMatch[1] + "/reserva-enviada", { method: "POST", body: "{}" });
      }
      let data = {};
      try {
        data = JSON.parse(texto);
      } catch (e) {
      }
      return Response.json({ ...data, avisoReserva });
    }
    return new Response(texto, { status: res.status, headers: { "content-type": "application/json" } });
  }
  const reservarMatch = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/reservar-almacen$/);
  if (reservarMatch && request.method === "POST") {
    const id = decodeURIComponent(reservarMatch[1]);
    const backorders = await inventoryStub(env).fetch("https://do/backorders").then((r) => r.json());
    const entry = backorders.find((b) => b.id === id);
    if (!entry) return Response.json({ ok: false, error: "Art\xEDculo no encontrado." }, { status: 404 });
    if (entry.reservaEnviada && url.searchParams.get("forzar") !== "1") {
      return Response.json({ ok: false, yaEnviada: entry.reservaEnviada }, { status: 409 });
    }
    const opciones = await request.json().catch(() => ({}));
    const fechaSalida = /^\d{4}-\d{2}-\d{2}$/.test(opciones.fechaSalida || "") ? opciones.fechaSalida : null;
    const avisoReserva = await reservarStockManual(env, entry, { agencia: opciones.agencia, fechaSalida });
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
  if (url.pathname === "/api/inventario/pendientes/pedido-stock" && request.method === "POST") {
    return proxyInventory(env, "/backorders/pedido-stock", request);
  }
  if (url.pathname === "/api/inventario/pendientes/set-campo" && request.method === "POST") {
    return proxyInventory(env, "/backorders/set-campo", request);
  }
  if (url.pathname === "/api/inventario/admin/clear-backorders" && request.method === "POST") {
    return proxyInventory(env, "/admin/clear-backorders", request);
  }
  if (url.pathname === "/api/inventario/admin/reserva-enviada" && request.method === "POST") {
    const { id, fecha } = await request.json();
    const res = await inventoryStub(env).fetch("https://do/backorders/" + encodeURIComponent(id) + "/reserva-enviada", { method: "POST", body: JSON.stringify({ fecha }) });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }
  if (url.pathname === "/api/inventario/admin/crear-pendiente-manual" && request.method === "POST") {
    return proxyInventory(env, "/admin/crear-pendiente-manual", request);
  }
  if (url.pathname === "/api/inventario/admin/corregir-modelo-pendiente" && request.method === "POST") {
    return proxyInventory(env, "/admin/corregir-modelo-pendiente", request);
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
  if (url.pathname === "/api/inventario/admin/add-item-to-order" && request.method === "POST") {
    return proxyInventory(env, "/admin/add-item-to-order", request);
  }
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
      const notaNueva = (payload.cambio ? "REPOSICI\xD3N POR CAMBIO (antes: " + (payload.cambio.de || "?") + "): " : "REPOSICI\xD3N: ") + (Number(payload.unidades) > 1 ? payload.unidades + "x " : "") + (payload.piezaTexto || "art\xEDculo completo");
      const notas = order && order.notas ? order.notas + " \xB7 " + notaNueva : notaNueva;
      await stubOrders.fetch("https://do/orders/meta", { method: "POST", body: JSON.stringify({ id: payload.orderId, notas }) });
    }
    return Response.json(result, { status: res.status });
  }
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
      const notaNueva = "GESTO COMERCIAL: " + payload.cantidad + "x almohada" + (payload.motivo ? " \u2014 " + payload.motivo : "");
      const notas = order && order.notas ? order.notas + " \xB7 " + notaNueva : notaNueva;
      await stubOrders.fetch("https://do/orders/meta", { method: "POST", body: JSON.stringify({ id: payload.orderId, notas }) });
    }
    return Response.json(result, { status: res.status });
  }
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
  if (url.pathname === "/api/inventario/reposicion/piezas" && request.method === "POST") {
    const { item, services, productoTexto, cambio } = await request.json();
    const previewRes = await inventoryStub(env).fetch("https://do/admin/reposicion/preview", {
      method: "POST",
      body: JSON.stringify({ item, cambio })
    });
    if (!previewRes.ok) return new Response(await previewRes.text(), { status: previewRes.status });
    const info = await previewRes.json();
    const tapaPartida = tapaPartidaFurniture(services);
    const b = { stockModel: info.stockModel, talla: info.talla, color: info.color, tipo: info.tipo, referencia: "", cantidad: 1, mercanciaFabrica: null };
    const piezas = piezasBackorder(b, productoTexto, tapaPartida, services);
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
  if (url.pathname === "/api/pedidos/shopify/admin/upsert-one" && request.method === "POST") {
    const { orderId } = await request.json();
    const res = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2026-07/orders/${orderId}.json`, {
      headers: { "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN }
    });
    if (!res.ok) return new Response(await res.text(), { status: res.status });
    const { order } = await res.json();
    await handleUpsertOrder(order, env);
    return Response.json({ ok: true, orderNumber: order.order_number });
  }
  if (url.pathname === "/api/pedidos/no-salio" && request.method === "POST") {
    const body = await request.text();
    const res = await inventoryStub(env).fetch("https://do/backorders/no-salio", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return Response.json(data, { status: res.status || 500 });
    if (!data.quedanEnCarga) {
      await env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify")).fetch("https://do/orders/no-salio-seur", { method: "POST", body });
    }
    return Response.json(data);
  }
  const cancelarUnidadesMatch = url.pathname.match(/^\/api\/inventario\/pendientes\/([^/]+)\/cancelar-unidades$/);
  if (cancelarUnidadesMatch && request.method === "POST") {
    const body = await request.text();
    const res = await inventoryStub(env).fetch("https://do/backorders/" + cancelarUnidadesMatch[1] + "/cancelar-unidades", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && data.cancelado) {
      const c = data.cancelado;
      let usuario = null;
      try {
        usuario = JSON.parse(body).usuario || null;
      } catch (e) {
      }
      await env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify")).fetch("https://do/orders/cancelar-linea", {
        method: "POST",
        body: JSON.stringify({ orderId: c.orderId, unidades: c.cantidad, texto: `${c.cantidad}x ${c.stockModel} ${c.talla}`, desde: "proveedor", usuario })
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
    if (!item) return Response.json({ ok: false, error: "Art\xEDculo no encontrado en el pedido." }, { status: 404 });
    const inv = await (await inventoryStub(env).fetch("https://do/backorders/cancelar-por-item", {
      method: "POST",
      body: JSON.stringify({ orderId: order.id, item, unidades })
    })).json();
    const r = await (await ordersStub.fetch("https://do/orders/cancelar-linea", {
      method: "POST",
      body: JSON.stringify({ orderId: order.id, itemIndex, unidades, texto, desde: "pedido", usuario })
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
  if (url.pathname === "/api/pedidos/shopify/admin/reintentar-furniture" && request.method === "POST") {
    const { numero } = await request.json();
    const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
    const orders = await stub.fetch("https://do/orders").then((r) => r.json());
    const order = orders.find((o) => o.orderNumber === Number(numero));
    const t = order && [...order.furnitureTracking || []].reverse().find((x) => x.seguimiento);
    if (!t) return Response.json({ ok: false, reason: "sin_albaran_con_seguimiento" }, { status: 404 });
    const c = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      trackingNumber: t.albaran,
      trackingUrl: t.seguimiento,
      company: "FURNITURE",
      primerEnvio: !order.shopifyFulfilled,
      fulfillmentId: order.shopifyFulfillmentId || null
    };
    const resultado = await shopifyFulfillOrder(env, c);
    if (resultado.ok && c.primerEnvio) {
      await stub.fetch("https://do/orders/shopify-fulfilled", { method: "POST", body: JSON.stringify({ id: order.id, fulfillmentId: resultado.fulfillmentId }) });
    }
    await marcarErroresShopifyFurniture(env, [c], resultado.ok ? [] : [{ orderNumber: c.orderNumber, albaran: c.trackingNumber, reason: resultado.reason, detail: resultado.detail }]);
    return Response.json({ ...resultado, candidato: { ...c, trackingUrl: void 0 } });
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
  if (url.pathname === "/api/cargas/set-fecha" && request.method === "POST") {
    const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
    const res = await stub.fetch("https://do/cargas/set-fecha", { method: "POST", body: await request.text() });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }
  if (url.pathname === "/api/inventario/admin/cargar-furniture-manual" && request.method === "POST") {
    return proxyInventory(env, "/admin/cargar-furniture-manual", request);
  }
  if (url.pathname === "/api/pedidos/recoge-cliente" && request.method === "POST") {
    const bodyText = await request.text();
    const { id, activo } = JSON.parse(bodyText);
    const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
    const res = await stub.fetch("https://do/orders/recoge-cliente", { method: "POST", body: bodyText });
    const result = await res.json();
    if (res.ok && result.ok && activo) {
      const [cargas, backorders] = await Promise.all([
        stub.fetch("https://do/cargas").then((r) => r.json()),
        inventoryStub(env).fetch("https://do/backorders").then((r) => r.json())
      ]);
      const abiertas = new Set((Array.isArray(cargas) ? cargas : []).filter((c) => c.estado === "abierta").map((c) => c.id));
      for (const b of backorders) {
        if (String(b.orderId) === String(id) && b.cargaId && abiertas.has(b.cargaId)) {
          await inventoryStub(env).fetch("https://do/admin/reposicion/carga-remove", { method: "POST", body: JSON.stringify({ id: b.id }) });
        }
      }
    }
    return Response.json(result, { status: res.status });
  }
  if (url.pathname === "/api/pedidos/entregado-cliente" && request.method === "POST") {
    const bodyText = await request.text();
    const { id } = JSON.parse(bodyText);
    const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
    const res = await stub.fetch("https://do/orders/entregado-cliente", { method: "POST", body: bodyText });
    if (!res.ok) return new Response(await res.text(), { status: res.status });
    const settle = await inventoryStub(env).fetch("https://do/settle-shipment", { method: "POST", body: JSON.stringify({ orderId: id }) }).then((r) => r.json());
    return Response.json({ ok: true, settled: settle.settled });
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
  if (url.pathname === "/api/cargas/borrar" && request.method === "POST") {
    const { id } = await request.json();
    const backorders = await (await inventoryStub(env).fetch("https://do/backorders")).json();
    if (backorders.some((b) => b.cargaId === id && b.estado !== "cancelado")) return Response.json({ ok: false, error: "La carga todav\xEDa tiene art\xEDculos." }, { status: 409 });
    const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
    const res = await stub.fetch("https://do/cargas/borrar", { method: "POST", body: JSON.stringify({ id }) });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }
  if (url.pathname === "/api/cargas/remove" && request.method === "POST") {
    const id = env.ORDERS_STORE.idFromName("shopify");
    const stub = env.ORDERS_STORE.get(id);
    const res = await stub.fetch("https://do/cargas/remove", { method: "POST", body: await request.text() });
    return new Response(await res.text(), { headers: { "content-type": "application/json" } });
  }
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
    try {
      const { cargaId } = JSON.parse(cuerpo);
      const ex = await buildSeurExport(env, cargaId);
      if (!ex.error) {
        await stub.fetch("https://do/cargas/seur/envios-guardar", { method: "POST", body: JSON.stringify({ cargaId, envios: enviosDeExportSeur(ex) }) });
      }
    } catch (e) {
    }
    const res = await stub.fetch("https://do/cargas/close", { method: "POST", body: cuerpo });
    return new Response(await res.text(), { headers: { "content-type": "application/json" } });
  }
  if (url.pathname === "/api/seur/envios" && request.method === "GET") {
    const datos = await cargarDatosSeurExport(env);
    const ordersById = new Map(datos.orders.map((o) => [o.id, o]));
    const lista = [];
    const usados = /* @__PURE__ */ new Set();
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
        const info = o && o.enviosSeurInfo && o.enviosSeurInfo[e.ref] || {};
        const t = estadoSeurDeLinea(o, info.refSeur || e.ref, porPedido[e.orderId]);
        if (t) usados.add(t);
        lista.push({
          ...e,
          refSeur: info.refSeur || "",
          cargaId: c.id,
          fechaCarga: c.fecha,
          diaCarga: c.dia,
          fechaCierre: c.fechaCierre || null,
          estadoSeur: t ? t.estado || "" : "",
          fechaSituacion: t ? t.fechaSituacion || "" : "",
          seguimiento: t ? t.seguimiento || "" : "",
          nota: info.nota || "",
          reclamado: !!info.reclamado,
          fechaReclamado: info.fechaReclamado || null,
          archivado: !!info.archivado,
          fechaArchivado: info.fechaArchivado || null,
          numeroExpedicion: t ? t.numeroExpedicion || "" : "",
          correo: info.correo || null,
          correoNoLeidos: noLeidosCorreo(info.correo)
        });
      }
    }
    const yaEnLista = new Set(lista.map((e) => String(e.orderId) + "|" + e.ref));
    for (const o of datos.orders) {
      for (const [ref, info] of Object.entries(o.enviosSeurInfo || {})) {
        if (!info.manual && (!info.correo || !(info.correo.mensajes || []).length) || yaEnLista.has(String(o.id) + "|" + ref)) continue;
        const t = estadoSeurDeLinea(o, info.refSeur || ref, 1);
        const m = t ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(t.fechaCreacion || "").trim()) : null;
        lista.push({
          orderId: o.id,
          ref,
          refSeur: info.refSeur || "",
          nombre: o.name || "",
          pais: o.countryCode || "",
          observaciones: "",
          cargaId: null,
          fechaCarga: m ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") : "",
          diaCarga: "",
          sinCarga: true,
          estadoSeur: t ? t.estado || "" : "",
          fechaSituacion: t ? t.fechaSituacion || "" : "",
          seguimiento: t ? t.seguimiento || "" : "",
          nota: info.nota || "",
          reclamado: !!info.reclamado,
          fechaReclamado: info.fechaReclamado || null,
          archivado: !!info.archivado,
          fechaArchivado: info.fechaArchivado || null,
          numeroExpedicion: t ? t.numeroExpedicion || "" : "",
          correo: info.correo,
          correoNoLeidos: noLeidosCorreo(info.correo)
        });
      }
    }
    const ahora = Date.now();
    for (const e of lista) {
      let desde = e.fechaCierre ? Date.parse(e.fechaCierre) : NaN;
      const registrado = /^el envío ha sido registrado\.?$/i.test((e.estadoSeur || "").trim());
      e.horasDesdeCierre = isNaN(desde) ? null : Math.floor((ahora - desde) / 36e5);
      e.aviso24h = registrado && e.horasDesdeCierre !== null && e.horasDesdeCierre >= 24;
      e.enPunto = /podrás recoger tu envío|disponible para recoger/i.test(e.estadoSeur || "");
    }
    lista.sort((a, b) => (b.fechaCarga || "").localeCompare(a.fechaCarga || "") || a.ref.localeCompare(b.ref));
    return Response.json(lista);
  }
  if (url.pathname === "/api/seur/envios/escribir" && request.method === "POST") {
    const { orderId, ref, texto } = await request.json();
    if (!String(texto || "").trim()) return Response.json({ ok: false, error: "Escribe el mensaje." }, { status: 400 });
    const orders = await ordersStubSeur(env).fetch("https://do/orders").then((r2) => r2.json());
    const o = orders.find((x) => String(x.id) === String(orderId));
    if (!o) return Response.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
    const refReal = o.enviosSeurInfo && o.enviosSeurInfo[ref] && o.enviosSeurInfo[ref].refSeur || ref;
    const t = estadoSeurDeLinea(o, refReal, 1);
    const exp = t && t.numeroExpedicion ? String(t.numeroExpedicion) : "";
    const destino = destinoSeurDePedido(o);
    const asunto = `Consulta env\xEDo ${refReal}${exp ? " \xB7 Expedici\xF3n " + exp : ""} \u2014 Global Happy Deal`;
    const cuerpo = [
      `Referencia: ${refReal}`,
      exp ? `N\xBA de expedici\xF3n: ${exp}` : null,
      `Destinatario: ${o.name || ""} \u2014 ${o.postalCode || ""} ${o.city || ""}`.trim(),
      "",
      String(texto).trim(),
      "",
      "Un saludo,",
      "Global Happy Deal"
    ].filter((x) => x !== null).join("\n");
    const r = await llamarScriptSeur(env, "seur-enviar", { destino, asunto, texto: cuerpo });
    if (!r.ok) return Response.json({ ok: false, error: r.error || "No se pudo enviar." }, { status: 502 });
    const ahora = (/* @__PURE__ */ new Date()).toISOString();
    const info = o.enviosSeurInfo && o.enviosSeurInfo[ref] || {};
    const previo = info.correo || {};
    const correo = {
      threadIds: [.../* @__PURE__ */ new Set([...previo.threadIds || [], r.threadId])],
      destino,
      asunto,
      mensajes: [...previo.mensajes || [], { id: "local-" + Date.now(), threadId: r.threadId, fecha: ahora, de: "Happy Deal", asunto, texto: cuerpo, deSeur: false }],
      vistoHasta: ahora
    };
    await ordersStubSeur(env).fetch("https://do/orders/envio-seur-info", { method: "POST", body: JSON.stringify({ orderId: o.id, ref, correo, ...info.reclamado ? {} : { reclamado: true } }) });
    return Response.json({ ok: true, correo });
  }
  if (url.pathname === "/api/seur/envios/responder" && request.method === "POST") {
    const { orderId, ref, texto } = await request.json();
    if (!String(texto || "").trim()) return Response.json({ ok: false, error: "Escribe el mensaje." }, { status: 400 });
    const orders = await ordersStubSeur(env).fetch("https://do/orders").then((r2) => r2.json());
    const o = orders.find((x) => String(x.id) === String(orderId));
    const correo = o && o.enviosSeurInfo && o.enviosSeurInfo[ref] && o.enviosSeurInfo[ref].correo;
    if (!correo || !(correo.threadIds || []).length) return Response.json({ ok: false, error: "Este env\xEDo no tiene conversaci\xF3n con SEUR." }, { status: 400 });
    const ultimoSeur = [...correo.mensajes || []].reverse().find((m) => m.deSeur && m.threadId);
    const threadId = ultimoSeur ? ultimoSeur.threadId : correo.threadIds[0];
    const r = await llamarScriptSeur(env, "seur-responder", { threadId, texto: String(texto).trim(), destino: correo.destino || destinoSeurDePedido(o) });
    if (!r.ok) return Response.json({ ok: false, error: r.error || "No se pudo enviar." }, { status: 502 });
    const ahora = (/* @__PURE__ */ new Date()).toISOString();
    await ordersStubSeur(env).fetch("https://do/orders/envio-seur-info", { method: "POST", body: JSON.stringify({ orderId: o.id, ref, correo: {
      mensajes: [...correo.mensajes || [], { id: "local-" + Date.now(), threadId, fecha: ahora, de: "Happy Deal", asunto: correo.asunto || "", texto: String(texto).trim(), deSeur: false }],
      vistoHasta: ahora
    } }) });
    return Response.json({ ok: true });
  }
  if (url.pathname === "/api/seur/correos/actualizar" && request.method === "POST") {
    return Response.json(await actualizarCorreosSeur(env));
  }
  if (url.pathname === "/api/seur/envios/visto" && request.method === "POST") {
    const { orderId, ref } = await request.json();
    const res = await ordersStubSeur(env).fetch("https://do/orders/envio-seur-info", { method: "POST", body: JSON.stringify({ orderId, ref, correo: { vistoHasta: (/* @__PURE__ */ new Date()).toISOString() } }) });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }
  if (url.pathname === "/api/pedidos/borrar" && request.method === "POST") {
    const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
    const res = await stub.fetch("https://do/orders/borrar", { method: "POST", body: await request.text() });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }
  if (url.pathname === "/api/pedidos/direccion" && request.method === "POST") {
    const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
    const res = await stub.fetch("https://do/orders/direccion", { method: "POST", body: await request.text() });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }
  if (url.pathname === "/api/tareas/recordatorio" && request.method === "POST") {
    return Response.json(await enviarRecordatorioTareas(env, { forzar: true }));
  }
  if (url.pathname === "/api/casos" || url.pathname === "/api/casos/guardar" || url.pathname === "/api/casos/borrar" || url.pathname === "/api/tareas" || url.pathname === "/api/tareas/guardar" || url.pathname === "/api/tareas/borrar") {
    const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
    const res = await stub.fetch("https://do" + url.pathname.slice(4), request.method === "POST" ? { method: "POST", body: await request.text() } : {});
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }
  if (url.pathname === "/api/seur/devoluciones" || url.pathname === "/api/seur/devoluciones/guardar") {
    const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
    const res = await stub.fetch("https://do" + url.pathname.slice("/api/seur".length), request.method === "POST" ? { method: "POST", body: await request.text() } : {});
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }
  if (url.pathname === "/api/seur/devoluciones/al-stock" && request.method === "POST") {
    const { id, stockModel, talla, usuario, ref } = await request.json();
    if (!id || !stockModel || !talla) return Response.json({ ok: false, error: "Falta el colch\xF3n." }, { status: 400 });
    const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
    const lista = await (await stub.fetch("https://do/devoluciones")).json();
    const d = lista.find((x) => x.id === id);
    if (!d) return Response.json({ ok: false, error: "Devoluci\xF3n no encontrada." }, { status: 404 });
    if (d.alStock) return Response.json({ ok: false, error: "Esta devoluci\xF3n ya se pas\xF3 al stock." }, { status: 400 });
    const row = await (await inventoryStub(env).fetch("https://do/stock/adjust", { method: "POST", body: JSON.stringify({ stockModel, talla, delta: 1, field: "cantidad", usuario, origen: "devolucion", orderRef: ref }) })).json();
    await stub.fetch("https://do/devoluciones/guardar", { method: "POST", body: JSON.stringify({ id, alStock: { fecha: (/* @__PURE__ */ new Date()).toISOString(), usuario: usuario || null, stockModel, talla }, destino: d.destino || "Vuelve al stock", usuario }) });
    return Response.json({ ok: true, cantidad: row.cantidad });
  }
  if (url.pathname === "/api/seur/envios/info" && request.method === "POST") {
    const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
    const res = await stub.fetch("https://do/orders/envio-seur-info", { method: "POST", body: await request.text() });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }
  if (url.pathname === "/api/cargas/seur/almacen-email" && (request.method === "POST" || request.method === "GET")) {
    const cargaId = url.searchParams.get("cargaId") || "";
    const result = await buildListadoAlmacenSeur(env, cargaId);
    if (result.error) return Response.json({ ok: false, error: result.error }, { status: 400 });
    if (!result.filas.length) return Response.json({ ok: false, error: "Esta carga no tiene env\xEDos." }, { status: 400 });
    const c = result.carga;
    const fechaCorta = c.fecha.slice(8, 10) + "/" + c.fecha.slice(5, 7);
    const bultos = result.filas.reduce((n, f) => n + (f.cantidad || 1), 0);
    const lineas = [];
    for (const f of result.filas) {
      const producto = String(f.producto || "").replace(/^COLCHÓN\s+/i, "") + (/^YA APARTADO/.test(f.origen) ? " (YA APARTADO)" : "");
      const l = lineas.find((x) => x.producto === producto);
      if (l) l.cantidad += f.cantidad || 1;
      else lineas.push({ producto, cantidad: f.cantidad || 1 });
    }
    lineas.sort((x, y) => x.producto.localeCompare(y.producto, "es", { numeric: true }));
    const pdf = resumenSeurPdf({ titulo: `SEUR  ${c.dia} ${fechaCorta}  \xB7  ${bultos} ${bultos === 1 ? "BULTO" : "BULTOS"}`, lineas });
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
      "Se adjunta el resumen en etiqueta 15\xD710 para imprimir."
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
    const sel = (url.searchParams.get("sel") || "").split(",").filter(Boolean);
    const rows = sel.length ? result.rows.filter((r, i) => sel.includes(result.rowKeys[i])) : result.rows;
    if (sel.length && !rows.length) return new Response("Ninguno de los env\xEDos marcados tiene l\xEDneas en el fichero.", { status: 400 });
    const csv = buildFurnitureCsv(rows);
    const filename = `Furniture_${result.carga.fecha}${sel.length ? "_seleccion" : ""}.csv`;
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`
      }
    });
  }
  if (url.pathname === "/api/cargas/furniture/mover" && request.method === "POST") {
    const { orderIds, backorderId, cargaId } = await request.json();
    const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
    if (backorderId) {
      const cargas = await stub.fetch("https://do/cargas").then((r) => r.json());
      if (!cargas.some((c) => c.id === cargaId && (c.tipo || "furniture") === "furniture" && c.estado === "abierta")) {
        return Response.json({ ok: false, error: "Esa carga de Furniture no est\xE1 abierta." }, { status: 400 });
      }
      const res2 = await inventoryStub(env).fetch("https://do/backorders/set-carga", { method: "POST", body: JSON.stringify({ id: backorderId, cargaId }) });
      return new Response(await res2.text(), { status: res2.status, headers: { "content-type": "application/json" } });
    }
    const res = await stub.fetch("https://do/cargas/furniture/mover", { method: "POST", body: JSON.stringify({ orderIds, cargaId }) });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }
  if (url.pathname === "/api/cargas/seur/mover" && request.method === "POST") {
    const { orderId, backorderId, fecha } = await request.json();
    const error = errorFechaCargaSeur(fecha);
    if (error) return Response.json({ ok: false, error }, { status: 400 });
    const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
    const destino = await stub.fetch("https://do/cargas/seur/get-or-create", { method: "POST", body: JSON.stringify({ fecha }) }).then((r) => r.json());
    const res = backorderId ? await inventoryStub(env).fetch("https://do/backorders/set-carga", { method: "POST", body: JSON.stringify({ id: backorderId, cargaId: destino.id }) }) : await stub.fetch("https://do/cargas/seur/mover-pedido", { method: "POST", body: JSON.stringify({ orderId, cargaId: destino.id }) });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }
  if (url.pathname === "/api/cargas/seur/export" && request.method === "GET") {
    const cargaId = url.searchParams.get("cargaId") || null;
    if (!cargaId) return new Response("Falta cargaId", { status: 400 });
    const result = await buildSeurExport(env, cargaId);
    if (result.error) return new Response(result.error, { status: 400 });
    if (url.searchParams.get("formato") === "json") {
      return Response.json({ cabeceras: SEUR_CSV_HEADERS, filas: result.rows, rowOrderIds: result.rowOrderIds, fecha: result.carga.fecha });
    }
    const csv = buildSeurCsv(result.rows);
    const filename = `SEUR_${result.carga.fecha}.csv`;
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "x-seur-avisos": String(result.avisos.length)
      }
    });
  }
  if (url.pathname === "/api/cargas/seur/envios-carga" && request.method === "GET") {
    const cargaId = url.searchParams.get("cargaId") || "";
    const datos = await cargarDatosSeurExport(env);
    const result = await buildSeurExport(env, cargaId, { datos });
    if (result.error) return Response.json({ ok: false, error: result.error }, { status: 400 });
    const ordersById = new Map(datos.orders.map((o) => [o.id, o]));
    return Response.json({ ok: true, envios: enviosDeExportSeur(result).map((e) => {
      const info = ((ordersById.get(e.orderId) || {}).enviosSeurInfo || {})[e.ref] || {};
      return { ...e, nota: info.nota || "", refSeur: info.refSeur || "" };
    }) });
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
__name(handleFetch, "handleFetch");
var index_default = {
  async fetch(request, env) {
    const res = await handleFetch(request, env);
    if (res.status === 101) return res;
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleSync(env));
    ctx.waitUntil(actualizarCorreosSeur(env).catch(() => null));
    ctx.waitUntil(enviarRecordatorioTareas(env).catch(() => null));
  }
};
async function enviarRecordatorioTareas(env, { forzar } = {}) {
  const stub = env.ORDERS_STORE.get(env.ORDERS_STORE.idFromName("shopify"));
  const ahora = /* @__PURE__ */ new Date();
  const hoy = ahora.toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
  const hora = Number(ahora.toLocaleString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false }));
  if (!forzar) {
    if (hora < 8) return { ok: true, enviado: false, motivo: "antes_de_las_8" };
    const { dia } = await (await stub.fetch("https://do/tareas/email-dia")).json();
    if (dia === hoy) return { ok: true, enviado: false, motivo: "ya_enviado_hoy" };
  }
  const tareas = await (await stub.fetch("https://do/tareas")).json();
  const pendientes = tareas.filter((t) => !t.hecha && t.fecha <= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const fechaEs = /* @__PURE__ */ __name((iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4), "fechaEs");
  const resultados = {};
  for (const persona of ["JENNIFER", "SERGIO"]) {
    const lista = pendientes.filter((t) => t.para === persona || !t.para || t.para === "AMBOS");
    if (!lista.length && !(forzar && persona === "JENNIFER")) continue;
    const lineas = lista.map((t) => "- " + (t.fecha < hoy ? "[ATRASADA, era el " + fechaEs(t.fecha) + "] " : "") + (t.pedidoRef ? t.pedidoRef + ": " : "") + t.texto);
    const texto = (lista.length ? "Tareas para hoy (" + fechaEs(hoy) + "):\n\n" + lineas.join("\n") : "No tienes tareas pendientes para hoy.") + "\n\nM\xE1rcalas como hechas en la app: Agenda de casos > Tareas.";
    resultados[persona] = await llamarScriptSeur(env, "recordatorio", {
      para: persona,
      asunto: (forzar ? "PRUEBA \u2014 " : "") + "Tareas de hoy " + fechaEs(hoy) + (lista.length ? " (" + lista.length + ")" : ""),
      texto
    });
  }
  if (!forzar && Object.values(resultados).every((r) => r.ok)) {
    await stub.fetch("https://do/tareas/email-dia", { method: "POST", body: JSON.stringify({ dia: hoy }) });
  }
  return { ok: Object.values(resultados).every((r) => r.ok), resultados };
}
__name(enviarRecordatorioTareas, "enviarRecordatorioTareas");
export {
  InventoryStore,
  OrdersStore,
  index_default as default
};
//# sourceMappingURL=index.js.map
