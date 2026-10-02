// Emails al almacén (Jennifer, 2026-09-28): transformaciones y reservas de
// stock, con las etiquetas en PDF adjuntas para imprimir y pegar. El email
// lo manda un Google Apps Script de la cuenta de Jennifer (colchonesbezen.com
// está en otra cuenta de Cloudflare, no se puede enviar correo desde aquí):
// el destinatario está fijo en el script, aquí solo va el contenido + secreto.
// Secrets del Worker: ALMACEN_AVISO_URL, ALMACEN_AVISO_SECRET.
import { base64DeBytes, etiquetasReservaPdf } from "./etiqueta-pdf.js";

// Correo con SEUR por el mismo Apps Script (Jennifer, 2026-10-02):
// accion "seur-enviar" | "seur-leer" | "seur-responder" (ver la copia del
// script en Downloads/AVISO-ALMACEN-y-SEUR-apps-script.txt). Devuelve la
// respuesta JSON del script, o { ok:false, error }.
export async function llamarScriptSeur(env, accion, datos) {
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
      body: JSON.stringify({ secreto: env.ALMACEN_AVISO_SECRET, accion, ...datos, adjunto: { nombre: "x.pdf", base64: "%%%no-es-base64%%%" } }),
    });
    const destino = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (destino) res = await fetch(destino);
    const r = await res.json().catch(() => null);
    if (!r) return { ok: false, error: "respuesta_no_json_status_" + res.status };
    // El script antiguo (sin SEUR) no conoce "accion" y manda un email al
    // almacén: se detecta porque no devuelve nada propio de SEUR.
    if (r.ok && accion === "seur-enviar" && !r.threadId) return { ok: false, error: "script_sin_actualizar" };
    if (r.ok && accion === "seur-leer" && !r.hilos) return { ok: false, error: "script_sin_actualizar" };
    return r;
  } catch (e) {
    return { ok: false, error: "error_red" };
  }
}

// { asunto, texto, pdf (Uint8Array, opcional), nombrePdf } -> { ok, reason? }
export async function enviarEmailAlmacen(env, { asunto, texto, pdf, nombrePdf }) {
  if (!env.ALMACEN_AVISO_URL || !env.ALMACEN_AVISO_SECRET) return { ok: false, reason: "sin_configurar" };
  const cuerpo = { secreto: env.ALMACEN_AVISO_SECRET, asunto, texto };
  if (pdf) cuerpo.adjunto = { nombre: nombrePdf || "etiqueta.pdf", base64: base64DeBytes(pdf) };
  try {
    // Apps Script responde con un 302 a otra URL donde está el resultado.
    // Con un cuerpo grande (la etiqueta adjunta), seguir la redirección de
    // forma automática devuelve una página de error de Google aunque el
    // email SÍ se haya enviado (visto en la prueba real del 28/09) — así
    // que la redirección se sigue a mano, con un GET aparte.
    let res = await fetch(env.ALMACEN_AVISO_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      redirect: "manual",
      body: JSON.stringify(cuerpo),
    });
    const destino = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (destino) res = await fetch(destino);
    const r = await res.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, reason: r.error || "status_" + res.status };
  } catch (e) {
    return { ok: false, reason: "error_red" };
  }
}

export function fechaHoyEs() {
  return new Date().toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
}

export function referenciaPedidoAlmacen(x) {
  return x.platform && x.platform !== "Shopify" && x.orderRef ? x.orderRef : "BEZEN" + x.orderNumber;
}

// "... | Zen Natural" -> "Zen Natural"
export function modeloCorto(stockModel) {
  const partes = (stockModel || "").split("|").map((s) => s.trim()).filter(Boolean);
  return partes[partes.length - 1] || stockModel || "";
}

const TIPO_ETIQUETA = { colchon: "Colchón", almohada: "Almohada", topper: "Topper", protector: "Protector" };

// Reserva de stock: un email por pedido con una etiqueta por bulto.
// bultos: [{ articulo, parte }] ya desglosados (un canapé = varios bultos).
export async function enviarReservaAlmacen(env, { pedido, cliente, lineasTexto, bultos }) {
  const fecha = fechaHoyEs();
  const pdf = etiquetasReservaPdf(bultos.map((b, i) => ({
    pedido, cliente, articulo: b.articulo, parte: b.parte, bulto: i + 1, totalBultos: bultos.length, fecha,
  })));
  const texto = [
    "Hay que RESERVAR en el almacén para este pedido (sale por Furniture):",
    "",
    ...lineasTexto.map((l) => "- " + l),
    "",
    `Pedido: ${pedido}${cliente ? " — " + cliente : ""}`,
    "",
    `Se adjuntan ${bultos.length} ${bultos.length === 1 ? "etiqueta" : "etiquetas"} (una por bulto) para pegar en cada parte.`,
  ].join("\n");
  return enviarEmailAlmacen(env, { asunto: `Reserva de stock — ${pedido}`, texto, pdf, nombrePdf: `Reserva ${pedido}.pdf` });
}

// Bultos de un artículo SIN desglose de piezas (colchón, topper, almohada,
// protector): una etiqueta por unidad.
export function bultosPorUnidad(b) {
  const modelo = modeloCorto(b.stockModel);
  const tipo = TIPO_ETIQUETA[b.tipo] || "";
  // Sin repetir el tipo si el nombre ya lo lleva ("Topper-sobrecolchón V5").
  const conTipo = tipo && !modelo.toLowerCase().includes(tipo.toLowerCase().slice(0, 5)) ? tipo + " " : "";
  const articulo = `${conTipo}${modelo} ${b.talla || ""}`.replace(/\s+/g, " ").trim();
  const n = b.cantidad || 1;
  return Array.from({ length: n }, () => ({ articulo, parte: "" }));
}

export function lineaTextoReserva(b) {
  const n = b.cantidad || 1;
  return `${modeloCorto(b.stockModel)} ${b.talla || ""}${b.color ? " " + b.color : ""} — ${n} ${n > 1 ? "unidades" : "unidad"}`;
}
