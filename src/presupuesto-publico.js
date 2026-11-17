// Página pública del presupuesto (Jennifer, 2026-11-12): el enlace que se
// manda por WhatsApp. Premium pero cercana: firmada por quien lo prepara,
// con su nota personal, fotos y un enlace por producto a SU medida en la web.
// Diseño de referencia: artifact "Presupuesto Bezen por WhatsApp".

export const TIENDA_URL = "https://www.colchonesbezen.com";
// Opciones que salen siempre que el presupuesto lleve un canapé (Jennifer, 2026-11-12).
export const OPCIONES_CANAPE = [
  { texto: "Montaje", precio: 39 },
  { texto: "Tapa reforzada", precio: 25 },
  { texto: "Tapa partida", precio: 59 },
];
// Servicios para el canapé o la base antigua: con cualquier canapé, suelto o en
// pack, dentro de un desplegable para no saturar las opciones (Jennifer, 2026-11-12).
export const SERVICIOS_CANAPE_ANTIGUO = [
  { texto: "Retirada del canapé o base a sustituir", precio: 30 },
  { texto: "Desmontaje y retirada de la base a sustituir", precio: 60 },
];
// Canapé suelto o pack con canapé: por la descripción, el nombre del producto de la web o su dirección.
export function llevaCanape(p) { return (p.lineas || []).some((l) => /canap/i.test((l.descripcion || "") + " " + (l.titulo || "") + " " + (l.handle || ""))); }
// Reseña destacada de un producto (Jennifer, 2026-11-12: "elige la que veas
// mejor para hablar del producto"): de las reseñas de Loox en la web, solo 5★,
// sin pegas, que hable del producto y de longitud cómoda; mejor verificada.
const SIN_ACENTOS = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PEGAS = /\b(pega|pena|pero|aunque|lastima|retras|tard|demora|incidenc|problema|defect|roto|rota|golpe|devol|queja|malo?\b|reclam|esper(a|ar|ando|amos|ado)\b|no me\b|no lo\b|no es\b|no tiene|falta|ruido|altura|inconvenien|falla|error|largo|no ha sido|a pesar|un poco|raro|de momento|esperemos|dentro de|complicad|\d+ (y \d+ )?dias|semanas?\b)/;
const ES = /\b(el|la|los|las|que|muy|de|del|es|con|para|una?)\b/g;
const OTRO_IDIOMA = /\b(muito|qualidade|estou|obrigad|und|ich|sehr|the|very|and|tres|merci)\b|ção\b/;
const SIN_PEGA = /\bsin (ningun )?(problema|ruido)s?\b|\bmerece la pena\b|\bvale la pena\b|\bfirme,? pero\b|\bpero no (duro|se hunde)\b|\bno me duele\w*|\bno defraud\w*/g;
const DEL_PRODUCTO = /(calidad|robust|solid|resisten|comod|descans|dorm|firmeza|firme|suave|capacidad|acabad|material|precios|bonit|espalda|dolor|calor|fresc|transpir|adapt|almacen|abre|apertura|montaje|facil|recomiend|acierto|mejor|encant)/g;
export function elegirResena(reviews) {
  const cand = (reviews || []).filter((r) => r && (r.rating === 5 || r.rating == null) && typeof r.review === "string").map((r) => {
    const txt = r.review.replace(/\s+/g, " ").trim();
    const n = SIN_ACENTOS(txt).replace(SIN_PEGA, "");
    const letras = txt.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
    if (txt.length < 60 || txt.length > 420 || PEGAS.test(n)) return null;
    if (OTRO_IDIOMA.test(n) || (n.match(ES) || []).length < 3) return null; // solo en español
    if (letras && letras === letras.toUpperCase()) return null; // todo en mayúsculas
    const temas = new Set(n.match(DEL_PRODUCTO) || []).size;
    let pts = temas * 3 + (r.verified === true ? 6 : 0) + (txt.length >= 110 && txt.length <= 320 ? 4 : 0);
    const dias = r.date ? (Date.now() - Date.parse(r.date)) / 864e5 : 9999;
    if (dias < 365) pts += 2;
    return { texto: txt, autor: String(r.author || "").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()), verificada: r.verified === true, pts };
  }).filter(Boolean);
  cand.sort((a, b) => b.pts - a.pts);
  return cand[0] || null;
}
// Productos sin "review_feed" en Loox: solo tienen el HTML "reviews" (nombre y
// texto, sin estrellas). Se leen de ahí; el filtro de pegas hace el resto.
export function resenasDeHtml(html) {
  const dec = (t) => String(t).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
  const out = [];
  const re = /<div class="name">([\s\S]*?)<\/div>\s*<div class="review_text">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(String(html || ""))) && out.length < 60) out.push({ rating: null, author: dec(m[1]), review: dec(m[2]) });
  return out;
}
export function estrellas(media) {
  const n = Math.round(Number(media) * 2) / 2;
  let out = "";
  for (let i = 1; i <= 5; i++) out += i <= n ? "★" : (i - 0.5 === n ? '<span class="media">★</span>' : '<span class="vacia">★</span>');
  return out;
}
// Frase al final de la página del presupuesto (Jennifer, 2026-11-12).
export const FRASE_CIERRE = "Lo que acaba de ver es cómo trabajamos cuando nadie nos mira. Lo que va a sentir es lo que ocurre cuando alguien decide no conformarse.";
// Formas de pago que salen plegadas bajo el precio (Jennifer, 2026-11-12).
export const FORMAS_PAGO = [
  { titulo: "Tarjeta de crédito o débito" },
  { titulo: "Apple Pay / Google Pay" },
  { titulo: "Transferencia bancaria" },
  { titulo: "Financiación con SeQura", detalle: "Paga a plazos" },
  { titulo: "Financiación con Cetelem", detalle: "Paga a plazos" },
];
// WhatsApp de la empresa para "Tengo una duda" (vacío = no sale el botón).
export const WHATSAPP_EMPRESA = "34689383415";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const euros = (n) => n == null ? "" : (Math.round(n * 100) % 100 === 0 ? Math.round(n).toLocaleString("es-ES") : n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + " €";
const nombrePropio = (s) => String(s || "").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const primerNombre = (s) => nombrePropio(String(s || "").trim().split(/\s+/)[0] || "");

function esMontaje(l) { return !l.handle && /montaje/i.test(l.descripcion || ""); }
function pct(p) { return p.profesional ? Math.min(100, Math.max(0, Number(p.descuentoPct) || 0)) : 0; }
function precioProf(p, l) {
  if (l.precio == null || !pct(p) || esMontaje(l)) return l.precio;
  return Math.round(l.precio * (100 - pct(p))) / 100;
}
export function enlaceMedida(l) {
  return l.handle ? TIENDA_URL + "/products/" + encodeURIComponent(l.handle) + (l.varianteId ? "?variant=" + l.varianteId : "") : null;
}
export function enlaceCarrito(p) {
  const items = (p.lineas || []).filter((l) => l.varianteId && l.precio != null).map((l) => l.varianteId + ":" + Math.max(1, l.unidades || 1));
  return items.length ? TIENDA_URL + "/cart/" + items.join(",") : null;
}
function waLink(texto) {
  return WHATSAPP_EMPRESA ? "https://wa.me/" + WHATSAPP_EMPRESA + "?text=" + encodeURIComponent(texto) : null;
}
function fechaEs(iso) {
  const [a, m, d] = String(iso || "").split("-");
  return d && m ? d + "/" + m + "/" + a : "";
}
function sumarDias(iso, dias) {
  const d = new Date((iso || new Date().toISOString().slice(0, 10)) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + (dias || 15));
  return d.toISOString().slice(0, 10);
}

const ICONO = {
  tarjeta: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/></svg>',
  carrito: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20.5" r="1.2"/><circle cx="17" cy="20.5" r="1.2"/></svg>',
  chat: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z"/></svg>',
  flecha: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  camion: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#11765f" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/></svg>',
  fabrica: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#11765f" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/></svg>',
  medida: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#11765f" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16M4 6h16M4 18h10"/></svg>',
  persona: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#11765f" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
};

export function paginaPresupuesto(p, origen, extra) {
  const esFoto = (d) => /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d || "");
  const fotoAsesor = extra && esFoto(extra.fotoAsesor) ? extra.fotoAsesor : null;
  const fotosFabrica = ((extra && extra.fotosFabrica) || []).filter(esFoto).slice(0, 2);
  const coloresMadera = ((extra && extra.coloresMadera) || []).filter((c) => c && esFoto(c.foto) && c.nombre);
  const coloresTela = ((extra && extra.coloresTela) || []).filter((c) => c && esFoto(c.foto) && c.nombre);
  // Un mosaico por modelo de cabecero (Jennifer, 2026-11-13): [{modelo, colores}].
  const coloresCabecero = ((extra && extra.coloresCabecero) || [])
    .map((g) => ({ modelo: String((g && g.modelo) || ""), colores: ((g && g.colores) || []).filter((c) => c && esFoto(c.foto) && c.nombre) }))
    .filter((g) => g.colores.length);
  const nombre = primerNombre(p.cliente);
  const asesor = nombrePropio(p.creadoPor || "") || "El equipo de Bezen";
  const con = pct(p) > 0;
  const lineas = p.lineas || [];
  const conPrecio = lineas.filter((l) => l.precio != null);
  const textos = lineas.filter((l) => l.precio == null && (l.descripcion || "").trim());
  // Alternativas (Jennifer, 2026-11-12): líneas marcadas entre las que el cliente
  // elige una (ej. dos colchones). Se comparan y no se suman entre sí.
  const alternativas = conPrecio.filter((l) => l.alternativa);
  const modoOpc = alternativas.length >= 2;
  const fijas = modoOpc ? conPrecio.filter((l) => !l.alternativa) : conPrecio;
  const importe = (l) => (precioProf(p, l) || 0) * (l.unidades != null ? l.unidades : 1);
  const sumar = (ls) => Math.round(ls.reduce((t, l) => t + importe(l), 0) * 100) / 100;
  const total = sumar(fijas);
  const carrito = p.mostrarTotal && !con && !modoOpc ? enlaceCarrito(p) : null;
  const carritoDe = (ls) => enlaceCarrito({ lineas: ls });
  const hayMontaje = conPrecio.some(esMontaje);

  const dudas = waLink("Hola " + asesor + ", tengo una duda sobre mi presupuesto nº " + p.numero + ".");
  const pedirPro = waLink("Hola " + asesor + ", quiero hacer el pedido del presupuesto nº " + p.numero + " con mi precio profesional.");

  // Galería con TODAS las fotos del producto en la web (la de su variante,
  // primero). Sin datos de la web, la foto guardada en la línea.
  const fotosWeb = (extra && extra.fotosWeb) || {};
  const esUrl = (u) => /^https:\/\/[^\s"'<>]+$/.test(u || "");
  const galeria = (l) => {
    const w = l.handle && fotosWeb[l.handle];
    let fotos = [];
    if (w && w.imgs && w.imgs.length) {
      const idVar = l.varianteId && w.porVariante && w.porVariante[l.varianteId];
      const prim = w.imgs.filter((i) => i.id === idVar);
      fotos = prim.concat(w.imgs.filter((i) => i.id !== idVar)).map((i) => i.src);
    } else if (l.imagen) fotos = [l.imagen];
    fotos = fotos.filter(esUrl).slice(0, 12);
    if (!fotos.length) return "";
    const imgs = fotos.map((src, i) => '<img class="prod-img" src="' + esc(src) + '" alt="' + esc(l.descripcion) + (i ? " · foto " + (i + 1) : "") + '"' + (i ? ' loading="lazy"' : "") + '>').join("");
    if (fotos.length === 1) return imgs;
    return '<div class="galeria"><div class="galeria-pista">' + imgs + '</div><span class="galeria-n">' + fotos.length + ' fotos · desliza →</span></div>';
  };

  // Estrellas de la web + reseña destacada (si el producto tiene reseñas).
  const resenasWeb = (extra && extra.resenasWeb) || {};
  const bloqueResenas = (l) => {
    const r = l.handle && resenasWeb[l.handle];
    if (!r) return "";
    const conEstrellas = r.num > 0 && r.media > 0;
    const d = r.destacada;
    if (!conEstrellas && !d) return "";
    return (conEstrellas ? '<div class="valoracion"><span class="estrellas" aria-label="' + String(r.media).replace(".", ",") + ' de 5">' + estrellas(r.media) + '</span><b>' + r.media.toFixed(1).replace(".", ",") + '</b></div>' : "")
      + (d ? '<blockquote class="resena"><p>“' + esc(d.texto) + '”</p><footer><span class="estrellas peq">★★★★★</span> ' + esc(d.autor) + (d.verificada ? ' · <span class="verif">Compra verificada</span>' : "") + '</footer></blockquote>' : "");
  };

  // Bloque "Somos fábrica": lo que podemos hacer además de lo que sale en la web.
  // Packs: no se combinan libremente (hay que calcular precio) → se ofrece calcularlo.
  const bloqueFabricamos = () => {
    const textoDe = (l) => (l.descripcion || "") + " " + (l.titulo || "") + " " + (l.handle || "");
    const ts = lineas.map(textoDe);
    const hayCanape = ts.some((t) => /canap/i.test(t));
    const hayCabecero = ts.some((t) => /cabecero/i.test(t));
    const hayPack = ts.some((t) => /\b(pack|conjunto)/i.test(t));
    if (!hayCanape && !hayCabecero && !hayPack) return "";
    const que = hayPack ? "tu pack" : hayCanape && hayCabecero ? "tu canapé y tu cabecero" : hayCanape ? "tu canapé" : hayCabecero ? "tu cabecero" : "tu pack";
    const puntos = ["Más colores y tejidos que los de la web", "En cualquier medida, también especiales"];
    if (hayCanape) puntos.push("Canapé con apertura lateral", "Canapé con patas o con ruedas");
    if (hayPack) puntos.push("¿Otra combinación de canapé, colchón o cabecero? Te calculamos el precio");
    const msg = "Hola " + asesor + ", sobre el presupuesto nº " + p.numero + ": me gustaría " + que + " de otra forma (color, tejido, medida…). Te cuento:";
    return '<div class="fabricamos"><div class="fab-etq">' + ICONO.fabrica + 'Somos fábrica · lo hacemos para ti</div>'
      + '<h3>En la web ves solo una parte</h3>'
      + '<p>Como lo fabricamos nosotros, podemos hacer ' + que + ' a tu gusto:</p>'
      + '<ul class="fab-lista">' + puntos.map((t) => '<li>' + esc(t) + '</li>').join("") + '</ul>'
      + (coloresMadera.length ? '<div class="fab-sub">Algunos acabados del canapé de madera:</div><ul class="fab-colores">'
        + coloresMadera.map((c) => '<li><img src="' + c.foto + '" alt="Acabado ' + esc(c.nombre) + '"><span>' + esc(c.nombre) + '</span></li>').join("") + '</ul>' : "")
      // Telas (Jennifer, 2026-11-13): MOSAICO de fotos pequeñas del canapé en
      // cada color (carpeta CARTA DE COLORES › CANAPÉ TELA), en vez de muestras.
      + (coloresTela.length ? '<div class="fab-sub">' + (hayCabecero && !hayCanape ? "Algunos de nuestros colores de tela:" : "Tu canapé en otros colores:") + '</div><ul class="fab-telas">'
        + coloresTela.map((c) => '<li><img src="' + c.foto + '" alt="Tela ' + esc(c.nombre) + '" loading="lazy"><span>' + esc(c.nombre) + '</span></li>').join("") + '</ul>' : "")
      // Cabecero (Jennifer, 2026-11-13): mismo mosaico, con sus propias fotos.
      + coloresCabecero.map((g) => '<div class="fab-sub">' + (coloresCabecero.length > 1 && g.modelo ? "Cabecero " + esc(g.modelo) + " en otros colores:" : "Tu cabecero en otros colores:") + '</div><ul class="fab-telas">'
        + g.colores.map((c) => '<li><img src="' + c.foto + '" alt="Cabecero ' + esc(g.modelo) + " " + esc(c.nombre) + '" loading="lazy"><span>' + esc(c.nombre) + '</span></li>').join("") + '</ul>').join("")
      + (waLink("") ? '<a class="btn-color" href="' + esc(waLink(msg)) + '" target="_blank" rel="noopener">' + ICONO.chat + 'Cuéntame qué tienes en mente</a>' : "")
      + '</div>';
  };

  // Comparativa de alternativas: diseño oscuro con detalles dorados.
  const fichasWeb = (extra && extra.fichasWeb) || {};
  const txtLinea = (l) => (l.descripcion || "") + " " + (l.titulo || "") + " " + (l.handle || "");
  const nombreCorto = (l) => {
    // Nombre de la web (el de la línea o, si no lo guardó, el que trae Shopify):
    // así todas las opciones salen con el mismo formato (Jennifer, 2026-11-12).
    const t = String(l.titulo || (fichasWeb[l.handle] && fichasWeb[l.handle].titulo) || "");
    const medida = /\s*·?\s*\d{2,3}\s*[xX×]\s*\d{2,3}(\s*cm)?/g;
    let n = t ? (t.includes("|") ? t.split("|").pop().trim() : t) : String(l.descripcion || "").replace(medida, "").trim();
    const letras = n.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, "");
    if (letras && letras === letras.toUpperCase()) n = n.toLowerCase().replace(/(^|[\s(/-])\S/g, (c) => c.toUpperCase());
    const med = String(l.descripcion || "").match(/\d{2,3}\s*[xX×]\s*\d{2,3}/);
    n = n.replace(medida, "").trim();
    if (med) n += " · " + med[0].replace(/\s/g, "").replace(/[X×]/, "x");
    return n.length > 60 ? n.slice(0, 58) + "…" : n;
  };
  const queElige = () => {
    const todas = (re) => alternativas.every((l) => re.test(txtLinea(l)));
    return todas(/\b(pack|conjunto)/i) ? "tu pack" : todas(/colch/i) ? "tu colchón" : todas(/canap/i) ? "tu canapé" : todas(/cabecero/i) ? "tu cabecero" : "tu opción";
  };
  const coma = (n) => String(n).replace(".", ",");
  const barra = (v) => '<div class="cmp-barra"><i style="width:' + Math.max(0, Math.min(10, v)) * 10 + '%"></i></div><span class="cmp-cifra">' + coma(v) + '<small>/10</small></span>';
  const bloqueAlternativas = () => {
    const n = alternativas.length;
    const ficha = (l) => fichasWeb[l.handle] || {};
    const filas = [];
    const fila = (titulo, celdas) => filas.push('<div class="cmp-l">' + titulo + '</div>' + celdas.map((c) => '<div class="cmp-v">' + c + '</div>').join(""));
    const todas = (fn) => alternativas.every((l) => { const v = fn(l); return v != null && v !== ""; });
    const res = (l) => resenasWeb[l.handle];
    if (todas((l) => res(l) && res(l).num > 0 ? res(l).media : null)) fila("Valoración", alternativas.map((l) => '<span class="estrellas">' + estrellas(res(l).media) + '</span> <b>' + res(l).media.toFixed(1).replace(".", ",") + '</b>'));
    if (todas((l) => ficha(l).firmeza)) fila("Firmeza", alternativas.map((l) => barra(ficha(l).firmeza)));
    if (todas((l) => ficha(l).adaptabilidad)) fila("Adaptabilidad", alternativas.map((l) => barra(ficha(l).adaptabilidad)));
    if (todas((l) => ficha(l).altura)) fila("Altura", alternativas.map((l) => esc(ficha(l).altura)));
    if (todas((l) => ficha(l).material)) fila("Material", alternativas.map((l) => esc(ficha(l).material)));
    const caras = (l) => /doble cara/i.test(txtLinea(l)) ? "Doble cara" : /una cara/i.test(txtLinea(l)) ? "Una cara" : null;
    if (todas(caras)) fila("Caras", alternativas.map((l) => esc(caras(l))));
    fila("Precio", alternativas.map((l) => (con && precioProf(p, l) !== l.precio ? '<s>' + euros(l.precio * (l.unidades != null ? l.unidades : 1)) + '</s> ' : "") + '<b class="cmp-precio">' + euros(importe(l)) + '</b>'));
    if (p.mostrarTotal && fijas.length) fila("Total del presupuesto · IVA incl.", alternativas.map((l) => '<b class="cmp-precio">' + euros(Math.round((total + importe(l)) * 100) / 100) + '</b>'));
    const botones = alternativas.map((l, i) => {
      const wa = waLink("Hola " + asesor + ", del presupuesto nº " + p.numero + " me quedo con la opción " + (i + 1) + ": " + nombreCorto(l) + ".");
      const web = p.mostrarTotal && !con ? carritoDe(fijas.concat([l])) : null;
      return (wa ? '<a class="cmp-btn" href="' + esc(wa) + '" target="_blank" rel="noopener">Me quedo con esta</a>' : "")
        + (web ? '<a class="cmp-web" href="' + esc(web) + '" target="_blank" rel="noopener">Comprar online</a>' : "");
    });
    return '<div class="alt-cab"><div class="alt-sup">' + n + ' opciones para ti</div><h2>Elige ' + queElige() + '</h2><p>Te proponemos estas alternativas. Compáralas con calma y quédate con la que más te guste.</p></div>'
      + alternativas.map((l, i) => tarjeta(l, i + 1)).join("")
      + '<div class="comparar"><div class="cmp-sup">Compáralas de un vistazo</div>'
      + '<div class="cmp" style="--n:' + n + '">'
      + alternativas.map((l, i) => '<div class="cmp-h"><span>Opción ' + (i + 1) + '</span><b>' + esc(nombreCorto(l)) + '</b></div>').join("")
      + filas.join("")
      + botones.map((b) => '<div class="cmp-acc">' + b + '</div>').join("")
      + '</div></div>';
  };
  // Formas de pago plegadas (Jennifer, 2026-11-12): una línea que se despliega.
  const bloquePagos = (donde) => '<details class="pagos pagos-' + donde + '"><summary>' + ICONO.tarjeta + '<span>Formas de pago</span><i>Ver todas</i></summary><ul>'
    + FORMAS_PAGO.map((x) => '<li><b>' + esc(x.titulo) + '</b>' + (x.detalle ? '<span>' + esc(x.detalle) + '</span>' : "") + '</li>').join("")
    + '</ul></details>';
  const totalOpciones = () => {
    // El total de cada opción ya va en la comparativa; aquí solo el pedido del profesional.
    if (!p.mostrarTotal || !con || !pedirPro) return "";
    return '<div class="total"><div class="total-sub">Precios con tu descuento profesional · IVA incluido</div>'
      + '<a class="btn-comprar" href="' + esc(pedirPro) + '" target="_blank" rel="noopener">' + ICONO.chat + 'Hacer el pedido con mi precio</a></div>';
  };

  const tarjeta = (l, opcion) => {
    const link = enlaceMedida(l);
    const pp = precioProf(p, l);
    const uds = l.unidades != null ? l.unidades : 1;
    return '<article class="prod' + (opcion ? " prod-opc" : "") + '">'
      + galeria(l)
      + '<div class="prod-cuerpo">'
      + (opcion ? '<div class="etq etq-opc">Opción ' + opcion + '</div>' : esMontaje(l) ? '<div class="etq">Servicio en tu casa</div>' : l.handle ? '<div class="etq">Directo de fábrica</div>' : "")
      + '<h3>' + esc(l.descripcion) + '</h3>'
      + bloqueResenas(l)
      + '<div class="prod-precio"><span class="uds">' + uds + (uds === 1 ? " unidad" : " unidades") + '</span><span>'
      + (con && pp !== l.precio ? '<s>' + euros(l.precio) + '</s> <b>' + euros(pp) + '</b>' : '<b>' + euros(l.precio) + '</b>')
      + '</span></div>'
      + (con && pp !== l.precio ? '<div class="nota-pro">Tu precio profesional (−' + String(pct(p)).replace(".", ",") + ' %)</div>' : "")
      + (con && esMontaje(l) ? '<div class="nota-pro">El montaje no lleva descuento</div>' : "")
      + (link ? '<a class="btn-medida" href="' + esc(link) + '" target="_blank" rel="noopener">' + (con ? "Ver este producto en la web" : "Ver y comprar esta medida") + ICONO.flecha + '</a>' : "")
      + '</div></article>';
  };

  const info = (p.info || []).filter((b) => (b.titulo || "").trim() || (b.puntos || "").trim());
  const enlazar = (t) => /^https?:\/\//i.test(t.trim()) ? '<a href="' + esc(t.trim()) + '" target="_blank" rel="noopener">Ver en la web</a>' : esc(t);

  const og = origen + "/presupuesto-logo.png";
  return '<!doctype html><html lang="es"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta name="robots" content="noindex, nofollow">'
    + '<title>Presupuesto para ' + esc(nombre || "ti") + ' · Bezen</title>'
    + '<meta property="og:title" content="Presupuesto para ' + esc(nombre || "ti") + ' · Bezen">'
    + '<meta property="og:description" content="Preparado por ' + esc(asesor) + ' · directo de nuestra fábrica">'
    + '<meta property="og:image" content="' + esc(og) + '">'
    + '<meta property="og:type" content="website">'
    + '<link rel="preconnect" href="https://fonts.googleapis.com">'
    + '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Poppins:wght@400;500;600&family=Mrs+Saint+Delafield&display=swap" rel="stylesheet">'
    + '<style>' + CSS + (fotosFabrica[0] ? ".fondo-fabrica{background-image:url(" + fotosFabrica[0] + ")}" : "") + '</style></head><body>'
    // Fondo: foto de la fábrica difuminada (Jennifer, 2026-11-12).
    + (fotosFabrica[0] ? '<div class="fondo-fabrica" aria-hidden="true"></div><div class="fondo-velo" aria-hidden="true"></div>' : "")
    + '<main>'
    + '<header class="cab"><img src="/presupuesto-logo.png" alt="Bezen" class="logo"></header>'
    + '<section class="intro"><div class="sup">Presupuesto nº ' + esc(p.numero) + '</div>'
    + '<h1>' + (nombre ? esc(nombre) + ", este" : "Este") + ' es el descanso que hemos preparado para ti</h1></section>'
    + '<section class="asesor"><div class="asesor-cab">' + (fotoAsesor ? '<img class="avatar foto" src="' + fotoAsesor + '" alt="' + esc(asesor) + '">' : '<div class="avatar" aria-hidden="true">' + esc(asesor.charAt(0)) + '</div>') + '<div><div class="asesor-nombre">' + esc(asesor) + '</div><div class="asesor-rol">Tu asesor' + (/a$/i.test(asesor) || /jennifer/i.test(asesor) ? "a" : "") + ' de descanso en Bezen</div></div></div>'
    + (String(p.nota || "").trim() ? '<p class="nota">' + esc(p.nota).replace(/\n/g, "<br>") + '</p>' : '<p class="nota">Aquí tienes lo que hemos preparado para ti. Cualquier duda, escríbeme y lo vemos juntos.</p>')
    + '<div class="firma">' + esc(asesor.split(" ")[0]) + '</div></section>'
    + '<section class="bloque"><h2>' + (modoOpc ? (fijas.length ? "Tu propuesta" : "Las opciones que te proponemos") : p.mostrarTotal ? "Tu propuesta" : conPrecio.length > 1 ? "Las opciones que te proponemos" : "Tu propuesta") + '</h2>'
    + fijas.map((l) => tarjeta(l)).join("")
    + (modoOpc ? bloqueAlternativas() : "")
    + (textos.length ? '<ul class="incluye-lista">' + textos.map((l) => '<li>' + esc(l.descripcion) + '</li>').join("") + '</ul>' : "")
    + (modoOpc ? totalOpciones() : p.mostrarTotal ? '<div class="total"><div class="total-fila"><span>Total' + (con ? " con tu precio profesional" : "") + '</span><span class="total-num">' + euros(total) + '</span></div>'
      + '<div class="total-sub">IVA incluido</div>'
      + bloquePagos("en-total")
      + (carrito ? '<a class="btn-comprar" href="' + esc(carrito) + '" target="_blank" rel="noopener">' + ICONO.carrito + 'Comprar ahora</a><div class="total-sub centro">Se abre tu carrito en colchonesbezen.com con todo preparado' + (hayMontaje ? ". El montaje te lo confirmamos nosotros por WhatsApp" : "") + '</div>' : "")
      + (con && pedirPro ? '<a class="btn-comprar" href="' + esc(pedirPro) + '" target="_blank" rel="noopener">' + ICONO.chat + 'Hacer el pedido con mi precio</a>' : "")
      + '</div>' : "")
    // Sin bloque de total (o con alternativas): formas de pago debajo de los precios.
    + (modoOpc || !p.mostrarTotal ? bloquePagos("suelto") : "")
    + (llevaCanape(p) ? '<div class="opciones"><h3>Opciones para tu canapé</h3><ul>'
      + OPCIONES_CANAPE.map((o) => '<li><span>' + esc(o.texto) + '</span><b>+' + euros(o.precio) + '</b></li>').join("")
      + '</ul>'
      + ('<details class="antiguo"><summary>¿Tienes un canapé o base antigua? <u>Ver servicios</u></summary><ul>'
        + SERVICIOS_CANAPE_ANTIGUO.map((o) => '<li><span>' + esc(o.texto) + '</span><b>+' + euros(o.precio) + '</b></li>').join("") + '</ul>'
        + (waLink("") ? '<a class="btn-antiguo" href="' + esc(waLink("Hola " + asesor + ", sobre el presupuesto nº " + p.numero + ": quiero que retiréis mi canapé o base antigua.")) + '" target="_blank" rel="noopener">' + ICONO.chat + 'Quiero que retiréis la antigua</a>' : "")
        + '</details>')
      + '<div class="opciones-nota">Precio adicional por canapé. Dinos cuál quieres y lo añadimos.</div></div>' : "")
    // "Somos fábrica · lo hacemos para ti" (Jennifer, 2026-11-12): con canapé,
    // cabecero o pack. Dentro, los acabados del canapé de madera si los hay.
    + bloqueFabricamos()
    + (dudas ? '<a class="btn-duda" href="' + esc(dudas) + '" target="_blank" rel="noopener">' + ICONO.chat + 'Tengo una duda, escribir a ' + esc(asesor.split(" ")[0]) + '</a>' : "")
    + '</section>'
    // Fábrica: fotos reales del taller (Jennifer lo confirma, 2026-11-12).
    + (fotosFabrica.length ? '<section class="fabrica"><div class="fab-sup">Así trabajamos</div><h2>Del taller a tu casa, sin intermediarios</h2>'
      + fotosFabrica.map((d) => '<img class="fab-img" src="' + d + '" alt="Fabricación Bezen" loading="lazy">').join("")
      + '</section>' : "")
    + '<section class="bloque"><h2>Por qué Bezen</h2><div class="rejilla">'
    + '<div class="mini">' + ICONO.fabrica + '<b>Somos fábrica</b><span>Sin intermediarios: por eso el precio</span></div>'
    + '<div class="mini">' + ICONO.camion + '<b>Te lo llevamos</b><span>Envío a domicilio cuidado</span></div>'
    + '<div class="mini">' + ICONO.medida + '<b>Medidas especiales</b><span>Si tu cama es distinta, pregúntanos</span></div>'
    + '<div class="mini">' + ICONO.persona + '<b>Trato personal</b><span>Hablas siempre con una persona</span></div>'
    + '</div></section>'
    // "Más información" quitado de la página (Jennifer, 2026-11-12): el cliente
    // ya lo ve pinchando en cada producto. Sigue en el PDF.
    // Sin "Gracias, <nombre>" (Jennifer, 2026-11-12): solo la frase y la firma.
    + '<section class="cierre">'
    // Sin texto de validez ni fecha "válido hasta" (Jennifer, 2026-11-12).
    // Frase de cierre (Jennifer, 2026-11-12).
    + '<p class="frase-cierre">' + esc(FRASE_CIERRE) + '</p>'
    + '<div class="firma-cierre">Equipo Bezen</div>'
    + '</section>'
    + '<footer class="pie"><img src="/presupuesto-logo.png" alt="Bezen" class="logo-pie"><a href="' + TIENDA_URL + '" target="_blank" rel="noopener">colchonesbezen.com</a></footer>'
    + '</main></body></html>';
}

export function paginaNoDisponible() {
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Bezen</title><style>' + CSS + '</style></head>'
    + '<body><main><header class="cab"><img src="/presupuesto-logo.png" alt="Bezen" class="logo"></header><section class="intro"><h1>Este presupuesto ya no está disponible</h1><p class="nota">Escríbenos por WhatsApp y te preparamos uno nuevo encantados.</p></section></main></body></html>';
}

const CSS = [
  "*{box-sizing:border-box}html,body{margin:0;background:#f7f4ee;color:#1c1c1a;font-family:Poppins,system-ui,sans-serif;-webkit-text-size-adjust:100%}",
  "main{position:relative;z-index:1;max-width:560px;margin:0 auto;padding-bottom:28px}",
  ".fondo-fabrica{position:fixed;inset:-40px;z-index:0;background-size:cover;background-position:center;filter:blur(6px) saturate(.9)}",
  ".fondo-velo{position:fixed;inset:0;z-index:0;background:rgba(247,244,238,.62)}",
  "a{color:#0d5e4c}",
  ".cab{background:#fff;padding:20px 24px 16px;display:flex;justify-content:center;border-bottom:1px solid #e7e1d6}.logo{height:46px;width:auto}",
  ".intro{padding:28px 22px 6px}.sup{font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#11765f;font-weight:600}",
  "h1{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:36px;line-height:1.1;margin:12px 0 0}",
  "h2{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:28px;margin:0 4px 14px}",
  ".asesor{margin:18px 16px 0;background:#fff;border-radius:18px;padding:18px}",
  ".asesor-cab{display:flex;gap:14px;align-items:center}.avatar{width:72px;height:72px;border-radius:50%;background:#11765f;color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:34px;flex-shrink:0}.avatar.foto{width:84px;height:84px;object-fit:cover;background:#e4ded2}",
  ".asesor-nombre{font-weight:600;font-size:17px}.asesor-rol{font-size:13px;color:#5c5a55}",
  ".nota{margin:14px 0 0;font-size:15px;line-height:1.6;color:#33322e}",
  ".firma{font-family:'Mrs Saint Delafield',cursive;font-size:38px;color:#11765f;line-height:1;margin-top:8px}",
  ".bloque{padding:32px 16px 0}",
  ".prod{background:#fff;border-radius:18px;overflow:hidden;margin-bottom:14px}",
  ".prod-img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:#e4ded2}",
  ".galeria{position:relative}",
  ".galeria-pista{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none}",
  ".galeria-pista::-webkit-scrollbar{display:none}",
  ".galeria-pista .prod-img{flex:0 0 100%;scroll-snap-align:start}",
  ".galeria-n{position:absolute;right:10px;bottom:10px;background:rgba(30,26,20,.72);color:#fff;font-size:12px;padding:4px 10px;border-radius:99px;pointer-events:none}",
  ".prod-cuerpo{padding:16px 18px 18px;display:flex;flex-direction:column;gap:8px}",
  ".etq{font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#11765f;font-weight:600}",
  ".prod h3{margin:0;font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600;line-height:1.15}",
  ".prod-precio{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:22px}.prod-precio s{color:#8a877f;font-size:16px}.uds{font-size:13px;color:#5c5a55}",
  ".nota-pro{font-size:12.5px;color:#0d5e4c}",
  ".btn-medida{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;margin-top:6px;border-radius:999px;background:#eef6f3;color:#0d5e4c;font-weight:600;font-size:15px;text-decoration:none}",
  ".incluye-lista{background:#fff;border-radius:16px;margin:0 0 14px;padding:14px 18px 14px 34px;font-size:14px;line-height:1.7}",
  ".total{background:#11765f;color:#fff;border-radius:18px;padding:20px;display:flex;flex-direction:column;gap:12px}",
  ".total-fila{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:15px}.total-num{font-family:'Cormorant Garamond',serif;font-size:40px;font-weight:600;line-height:1}",
  ".total-sub{font-size:12.5px;color:#dff1eb;line-height:1.5}.centro{text-align:center}",
  ".btn-comprar{display:flex;align-items:center;justify-content:center;gap:10px;min-height:54px;background:#fff;color:#0d5e4c;border-radius:999px;font-weight:600;font-size:16px;text-decoration:none}",
  ".btn-duda{display:flex;align-items:center;justify-content:center;gap:10px;min-height:52px;margin-top:14px;background:#fff;color:#1c1c1a;border:1.5px solid #1c1c1a;border-radius:999px;font-weight:500;font-size:15px;text-decoration:none}",
  ".fabrica{margin-top:34px;background:#1f2a26;color:#f2efe8;padding:30px 16px 22px}.fabrica h2{color:#f2efe8;margin:6px 4px 16px}",
  ".fab-sup{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9fd3c4;font-weight:600;margin:0 4px}",
  ".fab-img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:14px;margin-bottom:12px;background:#3a4642}",
  ".fab-nota{font-size:11px;color:#b9c2be;text-align:right}",
  ".opciones{background:#fff;border-radius:16px;padding:14px 18px;margin-top:14px;border:1.5px dashed #9fd3c4}.opciones h3{margin:0 0 8px;font-size:15px}",
  ".opciones ul{list-style:none;margin:0;padding:0}.opciones li{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #f0ece4;font-size:14.5px}.opciones li:last-child{border-bottom:0}.opciones b{color:#0d5e4c;white-space:nowrap}",
  ".valoracion{display:flex;align-items:center;gap:6px;font-size:13px;color:#5c5a55;flex-wrap:wrap}.valoracion b{color:#1e1a14}",
  ".estrellas{color:#e0a82e;letter-spacing:1px;font-size:16px;line-height:1}.estrellas .vacia{color:#ddd6c8}.estrellas .media{background:linear-gradient(90deg,#e0a82e 50%,#ddd6c8 50%);-webkit-background-clip:text;background-clip:text;color:transparent}.estrellas.peq{font-size:12px}",
  ".resena{margin:2px 0 0;background:#f7f3ec;border-radius:12px;padding:10px 12px;border-left:3px solid #e0a82e}.resena p{margin:0 0 6px;font-size:14px;line-height:1.45;font-style:italic;color:#3a3833}.resena footer{font-size:12px;color:#5c5a55}.resena .verif{color:#0d5e4c;font-weight:500}",
  ".antiguo{margin-top:6px;border-top:1px solid #f0ece4;padding-top:8px}.antiguo summary{cursor:pointer;font-size:14px;color:#3a3833;list-style:none}.antiguo summary::-webkit-details-marker{display:none}.antiguo summary u{color:#0d5e4c;font-weight:500}.antiguo[open] summary u{display:none}.antiguo ul{margin-top:6px}",
  ".btn-antiguo{display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-size:13.5px;color:#0d5e4c;font-weight:500;text-decoration:none}.btn-antiguo svg{width:16px;height:16px}",
  ".opciones-nota{font-size:12px;color:#5c5a55;margin-top:6px}",
  ".alt-cab{margin:30px 2px 14px}.alt-sup,.cmp-sup{font-size:11px;letter-spacing:1.6px;text-transform:uppercase;font-weight:600;color:#a37414}.alt-cab h2{margin:6px 0 6px}.alt-cab p{margin:0;font-size:14px;color:#5c5a55}",
  ".prod-opc{box-shadow:0 0 0 1.5px #d9bf7a inset}.etq-opc{color:#a37414}",
  ".comparar{background:#1f2a26;color:#f2efe8;border-radius:20px;padding:20px 16px 18px;margin:4px 0 14px;box-shadow:0 10px 30px rgba(20,28,25,.18)}.cmp-sup{color:#d9bf7a;text-align:center;margin-bottom:14px}",
  ".cmp{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));column-gap:12px}",
  ".cmp-h{display:flex;flex-direction:column;align-items:center;text-align:center;gap:4px;padding-bottom:12px;border-bottom:1px solid rgba(217,191,122,.35)}.cmp-h span{font-size:10.5px;letter-spacing:1.4px;text-transform:uppercase;color:#d9bf7a;font-weight:600}.cmp-h b{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:600;line-height:1.1;word-break:break-word}",
  ".cmp-l{grid-column:1/-1;text-align:center;font-size:13px;font-weight:500;color:rgba(242,239,232,.62);padding:14px 0 6px}",
  ".cmp-v{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px;text-align:center;font-size:14px;padding-bottom:12px;border-bottom:1px solid rgba(242,239,232,.08)}.cmp-v s{color:rgba(242,239,232,.5);font-size:12px}",
  ".cmp-barra{flex:1 1 60px;max-width:110px;height:6px;border-radius:99px;background:rgba(242,239,232,.14);overflow:hidden}.cmp-barra i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#b8913f,#e6cd8a)}.cmp-cifra{font-weight:600;font-size:14px}.cmp-cifra small{font-weight:400;opacity:.6;font-size:11px}",
  ".cmp-precio{font-size:20px;font-weight:600;color:#fff}.cmp-h b{font-size:22px}.comparar .estrellas{font-size:13px}",
  ".cmp-acc{display:flex;flex-direction:column;align-items:center;gap:8px;padding-top:16px}",
  ".cmp-btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:44px;padding:0 8px;border-radius:999px;background:linear-gradient(135deg,#d9bf7a,#b8913f);color:#1f2a26;font-weight:600;font-size:13.5px;text-decoration:none;text-align:center;line-height:1.2}",
  ".cmp-web{font-size:12.5px;color:#f2efe8;opacity:.85;text-decoration:underline;text-underline-offset:3px}",
  ".total-opc{font-size:30px}",
  ".pagos summary{display:flex;align-items:center;gap:8px;cursor:pointer;list-style:none;font-size:14px;font-weight:500}.pagos summary::-webkit-details-marker{display:none}.pagos summary i{font-style:normal;margin-left:auto;font-size:12.5px;text-decoration:underline;text-underline-offset:3px}.pagos[open] summary i{display:none}",
  ".pagos ul{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:2px}.pagos li{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:7px 0;font-size:14px}.pagos li span{font-size:12.5px;white-space:nowrap}",
  ".pagos-en-total{border-top:1px solid rgba(255,255,255,.22);padding-top:10px;color:#fff}.pagos-en-total li{border-bottom:1px solid rgba(255,255,255,.14)}.pagos-en-total li:last-child{border-bottom:0}.pagos-en-total li span{color:#dff1eb}",
  ".pagos-suelto{background:#fff;border-radius:16px;padding:14px 18px;margin-top:14px;color:#1e1a14}.pagos-suelto summary i{color:#0d5e4c}.pagos-suelto summary svg{color:#0d5e4c}.pagos-suelto li{border-bottom:1px solid #f0ece4}.pagos-suelto li:last-child{border-bottom:0}.pagos-suelto li span{color:#5c5a55}",
  ".fabricamos{background:#fff;border-radius:16px;padding:16px 18px;margin-top:14px;border:1.5px solid #e0a82e}.fabricamos h3{margin:4px 0 4px;font-size:17px}.fabricamos p{margin:0 0 8px;font-size:14px;color:#5c5a55}",
  ".fab-etq{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#a37414}.fab-etq svg{width:16px;height:16px}",
  ".fab-lista{list-style:none;margin:0 0 6px;padding:0}.fab-lista li{position:relative;padding:5px 0 5px 24px;font-size:14.5px}.fab-lista li::before{content:'✓';position:absolute;left:2px;top:4px;color:#0d5e4c;font-weight:700}",
  ".fab-telas{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.fab-telas li{display:flex;flex-direction:column;background:#fff;border:1px solid #ece6db;border-radius:10px;overflow:hidden;font-size:11.5px;font-weight:500;text-align:center;line-height:1.2}.fab-telas img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover}.fab-telas span{padding:5px 4px 7px}@media(min-width:520px){.fab-telas{grid-template-columns:repeat(4,minmax(0,1fr))}}",
  ".fab-sub{font-size:13px;color:#5c5a55;margin:10px 0 8px}",
  ".fab-colores{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}.fab-colores li{display:flex;align-items:center;gap:14px;font-size:15px;font-weight:500}.fab-colores img{width:132px;height:66px;object-fit:cover;border-radius:8px;border:1px solid #e7e1d6;flex-shrink:0}",
  ".colores{background:#fff;border-radius:16px;padding:16px 18px;margin-top:14px}.colores h3{margin:0 0 4px;font-size:15.5px}.colores p{margin:0 0 10px;font-size:13px;color:#5c5a55}",
  ".colores ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}",
  ".colores li{display:flex;align-items:center;gap:14px;font-size:15px;font-weight:500}.colores img{width:132px;height:66px;object-fit:cover;border-radius:8px;border:1px solid #e7e1d6;flex-shrink:0}",
  ".btn-color{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;margin-top:14px;border-radius:999px;background:#eef6f3;color:#0d5e4c;font-weight:600;font-size:15px;text-decoration:none}",
  ".rejilla{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}",
  ".mini{background:#fff;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:6px;font-size:13.5px}.mini span{font-size:12px;color:#5c5a55;line-height:1.45}",
  ".info{background:#fff;border-radius:16px;padding:14px 18px;margin-bottom:12px}.info h3{margin:0 0 6px;font-size:15px}.info ul{margin:0;padding-left:18px;font-size:14px;line-height:1.7}",
  ".cierre .frase-cierre{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:21px;line-height:1.4;color:#2b2a26;max-width:420px;margin:0 auto}",
  ".cierre .firma-cierre{margin-top:10px;font-family:'Cormorant Garamond',serif;font-style:italic;font-size:18px;color:#5c5a55}",
  ".cierre{padding:36px 22px 0;text-align:center}.gracias{font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:600;font-size:38px;color:#11765f;line-height:1.1}.cierre p{font-size:13px;color:#4a4843;line-height:1.6}",
  ".pie{margin-top:28px;padding:22px;display:flex;flex-direction:column;align-items:center;gap:6px;border-top:1px solid #e7e1d6;background:#fff;font-size:13px}.logo-pie{height:30px;width:auto}",
].join("");
