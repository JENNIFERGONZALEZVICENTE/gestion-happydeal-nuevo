// FICHEROS PLATAFORMAS COMPLETOS (Jennifer, 2026-11-04): por cliente
// (market Mirakl), el fichero de ofertas ENTERO —colchones, tapicería, packs,
// almohadas— guardado una vez en el programa, y el CSV de IMPORTACIÓN de
// Mirakl regenerado en caliente con los precios de Tarifas al día.
// Reglas acordadas con Jennifer (ver memoria project_ficheros_markets):
//  - Precio de oferta = columna de Tarifas del país (RESTO_ES/FR/IT).
//  - SKU con "M" delante = con montaje: + 39 € + IVA (47,19).
//  - Packs propios del market ("A+B…"): Σ piezas −3 % (+ montaje si M).
//    "2ALM…" = 2 almohadas, también −3 %.
//  - COLNAT = Látex Natura. Medida X180 sin precio → la de X190.
//  - Redondeo al alza. Tachado: Carrefour oferta × 545/198. Leroy Merlin
//    (Jennifer: "sigue la norma que más o menos veas ahora"): España y
//    Portugal mantienen su tachado actual, Francia e Italia oferta ÷ 0,60/
//    0,50/0,40 según el ancho (como el fichero de colchones API), y siempre
//    con la oferta al menos un 30 % por debajo ("usan el 30 % de descuento
//    sobre el precio general").
//  - Sin tarifa → se deja el último precio guardado y se avisa.

export const CABECERAS_MIRAKL = ["sku", "product-id", "product-id-type", "description", "internal-description", "price", "price-additional-info", "quantity", "min-quantity-alert", "state", "available-start-date", "available-end-date", "logistic-class", "favorite-rank", "discount-start-date", "discount-end-date", "discount-price", "update-delete"];

// canales: un país = una pareja de columnas (tachado, oferta) en el fichero.
// Un canal solo se rellena en las filas que YA tienen precio en ese canal
// (no se activan países nuevos desde aquí: Jennifer, 2026-11-04, "no se
// puede enviar tapicería a Portugal, revisa que no esté activo").
// general (Leroy): "el precio general para ellos es nuestro precio tachado"
// → se mantiene el actual, subiéndolo solo si hace falta para que todas las
// ofertas queden un 30 % por debajo; discount-price = oferta de España.
export const CLIENTES_FICHERO_COMPLETO = {
  CARREFOUR: {
    nombre: "Carrefour", sep: ",", tachado: "carrefour",
    canales: [{ id: "ES", pais: "España", columna: "RESTO_ES", plataformaColchones: "CARREFOUR", colTachado: "price", colOferta: "discount-price" }],
  },
  LEROY_MERLIN: {
    nombre: "Leroy Merlin", sep: ";", tachado: "fuera", redondeo: "tarifa",
    canales: [
      { id: "002", pais: "España", columna: "RESTO_ES", plataformaColchones: "LEROY_MERLIN_ES", colTachado: "price[channel=002]", colOferta: "discount-price[channel=002]", tachadoModo: "mantener" },
      { id: "001", pais: "Francia", columna: "RESTO_FR", plataformaColchones: "LEROY_MERLIN_FR", colTachado: "price[channel=001]", colOferta: "discount-price[channel=001]", tachadoModo: "ancho" },
      { id: "005", pais: "Italia", columna: "RESTO_IT", plataformaColchones: "LEROY_MERLIN_IT", colTachado: "price[channel=005]", colOferta: "discount-price[channel=005]", tachadoModo: "ancho" },
      // Portugal con el precio de España (Jennifer, 2026-11-04).
      { id: "003", pais: "Portugal", columna: "RESTO_ES", plataformaColchones: "LEROY_MERLIN_ES", colTachado: "price[channel=003]", colOferta: "discount-price[channel=003]", tachadoModo: "mantener" },
    ],
    general: { colTachado: "price", colOferta: "discount-price", canalOferta: "002" },
  },
  // Conforama España (Jennifer, 2026-11-04): canal ES con RESTO_ES; el canal
  // PT existe en el fichero pero sin precios (no se activa). Norma actual del
  // fichero: el precio general es SIEMPRE el tachado de España; en colchones
  // el tachado va por ancho (como el fichero de colchones API); en el resto
  // se mantiene el actual (mínimo 30 % de descuento).
  CONFORAMA_ES: {
    nombre: "Conforama España", sep: ";", tachado: "fuera", redondeo: "tarifa",
    canales: [
      { id: "ES", pais: "España", columna: "RESTO_ES", plataformaColchones: "CONFORAMA_ES", colTachado: "price[channel=ES]", colOferta: "discount-price[channel=ES]", tachadoModo: "anchoColchones" },
      { id: "PT", pais: "Portugal", columna: "RESTO_ES", plataformaColchones: "CONFORAMA_ES", colTachado: "price[channel=PT]", colOferta: "discount-price[channel=PT]", tachadoModo: "mantener" },
    ],
    general: { colTachado: "price", colOferta: "discount-price", canalOferta: "ES", igualAlCanal: "ES" },
    // Precio de oferta fijo para SKU que no casan con Tarifas (Jennifer,
    // 2026-11-23: S14633 "no es el sku correcto, por defecto 250 €").
    preciosFijos: { S14633: 250 },
  },
  // Maison du Monde (Jennifer, 2026-11-04): ES/FR/IT con las columnas MAISON
  // de Tarifas y Alemania con RESTO_AL ("a Alemania el RESTO AL de tarifas").
  // Norma del fichero: precio general = tachado de España y SIN oferta
  // general (la columna discount-price va vacía); FR/IT tachado por ancho;
  // ES/DE se mantiene (mínimo 30 %). price-excl-vat = price[channel=ES] (columna W)
  // ÷ 1,21, siempre. Las fechas de
  // descuento no se tocan (recordatorio en Tareas el 20/12/2026).
  MAISON: {
    nombre: "Maison du Monde", sep: ";", tachado: "fuera", redondeo: "tarifa",
    canales: [
      { id: "ES", pais: "España", columna: "MAISON_ES", plataformaColchones: "MAISON_ES", colTachado: "price[channel=ES]", colOferta: "discount-price[channel=ES]", tachadoModo: "mantener" },
      { id: "FR", pais: "Francia", columna: "MAISON_FR", plataformaColchones: "MAISON_FR", colTachado: "price[channel=FR]", colOferta: "discount-price[channel=FR]", tachadoModo: "ancho" },
      { id: "IT", pais: "Italia", columna: "MAISON_IT", plataformaColchones: "MAISON_IT", colTachado: "price[channel=IT]", colOferta: "discount-price[channel=IT]", tachadoModo: "ancho" },
      { id: "DE", pais: "Alemania", columna: "RESTO_AL", plataformaColchones: null, colchonesDe: "MAISON_ES", noMenosQue: ["FR", "IT"], colTachado: "price[channel=DE]", colOferta: "discount-price[channel=DE]", tachadoModo: "mantener" },
    ],
    general: { colTachado: "price", colOferta: "discount-price", canalOferta: "ES", igualAlCanal: "ES", sinOferta: true, colSinIva: "price-excl-vat" },
    // Artículos que NO se tocan (ni precio ni stock): Jennifer, 2026-11-04,
    // ALMANT90 "lo dejas tal cual porque yo juego con esa almohada".
    noTocar: ["ALMANT90"],
  },
  // Conforama Francia (Jennifer, 2026-11-04): un solo precio (sin canales),
  // columna RESTO_FR de Tarifas y fichero de colchones API CONFORAMA_FR.
  // Tachado por ancho como el resto de canales franceses (40/50/60 %).
  CONFORAMA_FR: {
    nombre: "Conforama Francia", sep: ";", tachado: "fuera", redondeo: "tarifa",
    canales: [
      { id: "FR", pais: "Francia", columna: "RESTO_FR", plataformaColchones: "CONFORAMA_FR", colTachado: "price", colOferta: "discount-price", tachadoModo: "ancho" },
    ],
  },
  // Worten (Jennifer, 2026-11-06): CSV de importación (offers-import). El
  // sku es el EAN; nuestro código va en internal-description (las
  // almohadas ALMNOR lo llevan en el propio sku). Solo vende en Portugal
  // (canal WRT_PT_ONLINE) con RESTO_ES (Portugal = precio de España) y el
  // fichero de colchones API WORTEN_PT. Norma del fichero: tachado del
  // canal por ancho (÷ 0,60/0,50/0,40) en colchones; precio general (price)
  // se mantiene (mínimo 30 %); discount-price general = oferta del canal,
  // solo donde ya hay.
  WORTEN: {
    nombre: "Worten", sep: ";", tachado: "fuera", redondeo: "tarifa", colSkuNuestro: "internal-description",
    canales: [
      { id: "PT", pais: "Portugal", columna: "RESTO_ES", plataformaColchones: "WORTEN_PT", colTachado: "price[channel=WRT_PT_ONLINE]", colOferta: "discount-price[channel=WRT_PT_ONLINE]", tachadoModo: "anchoColchones" },
    ],
    general: { colTachado: "price", colOferta: "discount-price", canalOferta: "PT", ofertaSiHay: true },
  },
};

// Nombre del producto en Worten (portugués) → prefijo de nuestro SKU.
// Comprobado con el fichero de Worten y el de colchones API WORTEN_PT
// (2026-11-06): 277 de 278 EAN casan. El orden importa (Bellagio antes que
// Total Comfort, Pharmatherapy Slim antes que Pharma Therapy).
const MODELOS_WORTEN = [
  [/Grafeno|Deluxe 4D/i, "COLDELUXE4D"],
  [/Ergo-?relax|Louzen/i, "COLLOU"],
  [/Bambu/i, "COLBAMDL"],
  [/Pharmatherapy Slim/i, "COLPHARS"],
  [/Pharma ?therapy/i, "PHARM"],
  [/Generation Z/i, "COLGEZ"],
  [/Extrasuave/i, "COLTOSD"],
  [/Molas Ensacadas E Espuma/i, "COLPARIS"],
  [/Fitne?ss? (Therapy|Sport)/i, "COLFITSPORT"],
  [/Mandala/i, "COLZMAN"],
  [/Nirvana/i, "COLZNIR"],
  [/Bellagio/i, "COLBEL"],
  [/Total Comfort/i, "2COLBELD"],
  [/L.tex Gel/i, "COLLAT"],
];
export function skuDesdeNombreWorten(sku, nombre) {
  const s = String(sku || "").trim();
  if (!/^\d{8,14}$/.test(s)) return s.toUpperCase();
  const m = MODELOS_WORTEN.find(([re]) => re.test(String(nombre || "")));
  const t = /(\d{2,3})\s*x\s*(\d{2,3})/i.exec(String(nombre || ""));
  return m && t ? m[1] + t[1] + "X" + t[2] : null;
}

// STOCK (Jennifer, 2026-11-04): "el stock de los artículos vivos que tenemos,
// siempre tenga 100 unidades para que así no haya problemas de stocks y se
// siga vendiendo con normalidad"; los modelos que ya no se trabajan, a 0.
export const STOCK_VIVO = 100;
// COLZSENSEI (Sensei Zen) añadido 2026-11-04: "el Sensei con stock a 0 sí".
// COLGRA = colchón Grafeno, ya no se trabaja (Jennifer, 2026-11-04).
// ALMBOD80 (Almohada Body Milk 80): "esta almohada siempre tiene que estar a
// 0 unidades de stock, esta en concreto" (Jennifer, 2026-11-10: se publicó a
// 2 € en Carrefour al ponerla a 100 sin tener tarifa).
export const DESCATALOGADOS = [/^COLMONACO/i, /^C?COLZSENSEI/i, /^C?COLGRA/i, /^ALMBOD80$/i];
export const esDescatalogado = (sku) => DESCATALOGADOS.some((re) => re.test(String(sku || "")));

const FACTOR_TACHADO = 545 / 198;
const alAlza = (n) => Math.ceil(n - 1e-6);
const MONTAJE = 39 * 1.21;

// CSV con comillas (las descripciones llevan separadores, comillas y saltos de línea).
export function parseCsv(texto, sep) {
  const s = String(texto || "").replace(/^﻿/, "");
  const coma = sep || ",";
  const filas = [];
  let fila = [], campo = "", comillas = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (comillas) {
      if (c === '"') { if (s[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === coma) { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      if (fila.some((x) => x !== "")) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some((x) => x !== "")) filas.push(fila);
  return filas;
}

export function toCsv(filas, sep) {
  const coma = sep || ",";
  const esc = (v) => {
    const t = v === null || v === undefined ? "" : String(v);
    return t.includes(coma) || /["\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  return filas.map((f) => f.map(esc).join(coma)).join("\n") + "\n";
}

// CSV de importación → { cabeceras (las del propio fichero, en su orden), filas [[...valores]] }.
// Error si no es el formato de importación (la EXPORTACIÓN de Mirakl no vale).
export function filasDesdeCsvImport(texto, cliente) {
  const cfg = CLIENTES_FICHERO_COMPLETO[cliente];
  const primera = String(texto || "").replace(/^﻿/, "").split(/\r?\n/)[0] || "";
  const sep = primera.split(";").length > primera.split(",").length ? ";" : ",";
  const aoa = parseCsv(texto, sep);
  if (!aoa.length) return { error: "El fichero está vacío." };
  const cabeceras = aoa[0].map((h) => String(h).trim());
  const H = cabeceras.map((h) => h.toLowerCase());
  const colSku = cfg.colSku || "sku";
  const necesarias = [colSku, ...new Set(cfg.canales.flatMap((c) => [c.colTachado, c.colOferta]))];
  const falta = necesarias.filter((c) => !H.includes(c.toLowerCase()));
  if (falta.length) return { error: cfg.colSku ? "No es el fichero de ofertas de " + cfg.nombre + " (faltan las columnas " + falta.join(", ") + ")." : "No es el fichero de IMPORTACIÓN de " + cfg.nombre + " (faltan las columnas " + falta.join(", ") + "). La exportación de ofertas no vale: usa el CSV de importación." };
  const iSku = H.indexOf(colSku.toLowerCase());
  const filas = [];
  const vistos = new Set();
  for (const r of aoa.slice(1)) {
    const fila = cabeceras.map((_, i) => String(r[i] ?? ""));
    fila[iSku] = fila[iSku].trim();
    // En Mirakl el SKU distingue mayúsculas: PHARM120X190 y PHARM120x190 son
    // dos ofertas distintas en Carrefour, se guardan las dos.
    if (!fila[iSku] || vistos.has(fila[iSku])) continue;
    vistos.add(fila[iSku]);
    filas.push(fila);
  }
  return { cabeceras, filas, sep };
}

const PIEZAS_PACK = [
  [/^CANPOL/, "Canape Abatible tapizado alta capacidad y resistencia"],
  [/^CANMON/, "Canape abatible de madera alta capacidad y resistencia - esquinas curvas"],
  [/^CANBAS/, "Canapé de madera esquinas rectas"],
  [/^BASE/, "Base tapizada con rejilla 3D y respiraderos | BLANCO"],
  [/^COLLOU/, "Colchón Viscoelástico | 24cm | Doble cara | Ergo-Relax Plus"],
  [/^COLPHAR/, "Colchón Viscoelástico | 20cm | Pharma-Therapy Soja"],
  [/^(COLTOSD|TOSCANA)/, "Colchón Viscoelástico | 21cm | Toscana Deluxe"],
  [/^ALMNOR/, "Almohada núcleo visco Nordic"],
  [/^ALMANT/, "Almohada Copos visco Antiestres"],
];

// ctx: { columna, tabla(stockModel) → Promise<{ [talla]: fila }>, pb: Map(SKU → fila de Precios web),
//        colchon(sku) → Promise<{ precio, pasos, origen }|null> (fichero "solo colchones API" del market) }
// Devuelve { oferta, tachado, como, pasos } — oferta null si no hay tarifa.
// pasos (Jennifer, 2026-11-04: "ver cómo se han calculado los precios"):
// [{ label, valor, sub: [pasos de la fórmula de Tarifas] }], de arriba abajo.
const r2 = (n) => Math.round(n * 100) / 100;
// Colores de canapé de tela con código propio en Leroy Merlin (2026-11-04).
const ALIAS_TELA = { GNIE: "GRISNIEBLA", CACAO: "COCOA", OCE: "OCEA", GANT: "GRISANT" };
// Piezas de pack con otro nombre en la web.
const ALIAS_PIEZA = { COLZNAT: "COLZENNAT" };
// Colchones que pueden no estar en el fichero de colchones API ni en la web:
// directo a su modelo de Tarifas (Jennifer, 2026-11-04: "si no están en el
// fichero de API nosotros los vamos igualmente a actualizar").
const MODELOS_COLCHON = [[/^COLBEL(\d{2,3}X\d{3})$/, "Colchón Viscoelástico | 21cm | Bellagio Deluxe"]];
const GAMAS_TELA = { natural: ["LAOLIVA", "OLIVA", "MENTA", "OCEA"], tierras: ["BEIGE", "COCOA", "GRISANT", "GRISNIEBLA"], vivos: ["MAGE", "ROSE", "LAVAN", "STAR"] };
export async function calcularPrecioOferta(skuOriginal, ctx) {
  // Maison (2026-11-04): "CCOL…" es el mismo colchón que "COL…" (otra oferta
  // con una C delante; mismos precios en el fichero).
  const skuMayus = String(skuOriginal || "").toUpperCase();
  const dobleC = /^CCOL/.test(skuMayus);
  const sku = dobleC ? skuMayus.slice(1) : skuMayus;
  const colDe = (row) => (row && row.columnas && row.columnas[ctx.columna]) || null;
  const precioCol = (row) => { const c = colDe(row); return c && c.precio != null ? Number(c.precio) : null; };
  const pasoTarifa = (texto, row, p) => ({ label: texto, valor: p, sub: (colDe(row) || {}).pasos || [] });
  // SKU del market → SKU de la web (Precios web): igual, X180 → X190, color
  // de tela de Leroy, o cabecero "CABARIA105" → "CABARIA<color>-105".
  const en = (x) => {
    const cands = [x, x.replace(/X180$/, "X190")];
    const tela = /^(CANTEL)(GNIE|CACAO|OCE|GANT)(\d.*)$/.exec(x);
    if (tela) { const y = tela[1] + ALIAS_TELA[tela[2]] + tela[3]; cands.push(y, y.replace(/X180$/, "X190")); }
    for (const c of cands) if (ctx.pb.has(c)) return c;
    const cab = /^CAB([A-Z]+?)(\d{2,3})$/.exec(x);
    if (cab) {
      const re = new RegExp("^CAB" + cab[1] + "[A-Z]*-?" + cab[2] + "$");
      for (const k of ctx.pb.keys()) if (re.test(k) && ctx.pb.get(k).tarifaModelo) return k;
    }
    return null;
  };
  const montaje = /^M/.test(sku) && !!en(sku.slice(1)) && !en(sku);
  const base = en(montaje ? sku.slice(1) : sku) || sku;
  let oferta = null, como = "", esPack = false, montajeTela = false;
  const pasos = [];
  if (dobleC) pasos.push({ label: skuMayus + " = mismo colchón que " + sku, valor: null });

  const nat = /^COLNAT(\d{2,3})X(\d{3})$/.exec(sku);
  if (nat) {
    const tb = await ctx.tabla("Colchón de Látex Natural Natura");
    const row = tb[nat[1] + "X" + nat[2]] || tb[nat[1] + "X190"];
    const p = precioCol(row);
    if (p != null) {
      oferta = p;
      como = "Tarifas " + ctx.columna + " Látex Natura " + row.talla;
      pasos.push(pasoTarifa("COLNAT = Látex Natura · Tarifas " + ctx.columna + " " + row.talla + (row.talla !== nat[1] + "X" + nat[2] ? " (la " + nat[1] + "X" + nat[2] + " no tiene precio: se usa la X190)" : ""), row, p));
    }
  }
  if (oferta == null) {
    const c = await ctx.colchon(sku);
    if (c && c.precio != null) {
      oferta = c.precio;
      como = "Tarifas (fichero solo colchones API)";
      pasos.push({ label: c.origen + " · Tarifas " + ctx.columna, valor: c.precio, sub: c.pasos || [] });
    }
  }
  if (oferta == null && ctx.pb.has(base)) {
    const f = ctx.pb.get(base);
    const m = f.tarifaModelo || (f.packPiezas ? null : f.producto);
    const t = f.tarifaTalla || String(f.variante || "").replace(",", ".").trim();
    if (m && !f.packPiezas) {
      const row = (await ctx.tabla(m))[t];
      const p = precioCol(row);
      if (p != null) {
        oferta = p;
        como = "Tarifas " + ctx.columna + " " + m.slice(0, 40) + " " + t;
        const sinM = montaje ? sku.slice(1) : sku;
        pasos.push(pasoTarifa((montaje ? "Sin montaje = " + sinM + " · " : "") + (base !== sinM ? "En la web es " + base + " · " : "") + "Tarifas " + ctx.columna + ": " + m + " " + t, row, p));
      }
    }
  }
  if (oferta == null) {
    for (const [re, modelo] of MODELOS_COLCHON) {
      const m = re.exec(sku);
      if (!m) continue;
      const tb = await ctx.tabla(modelo);
      const row = tb[m[1]] || tb[m[1].replace(/X180$/, "X190")];
      const p = precioCol(row);
      if (p != null) { oferta = p; como = "Tarifas " + ctx.columna + " " + modelo.slice(0, 40) + " " + row.talla; pasos.push(pasoTarifa("Tarifas " + ctx.columna + ": " + modelo + " " + row.talla, row, p)); }
      break;
    }
  }
  // Canapé de tela que la web no tiene en esa medida/color (Leroy, p. ej.
  // MCANTELCACAO160X200): directo a la tarifa de su gama de colores.
  if (oferta == null) {
    const sinM = montaje ? sku.slice(1) : sku.replace(/^M(?=CANTEL)/, "");
    const tela = /^CANTEL([A-Z]+?)(\d{2,3}X\d{3})$/.exec(sinM);
    if (tela) {
      const color = ALIAS_TELA[tela[1]] || tela[1];
      const gama = Object.entries(GAMAS_TELA).find(([, cs]) => cs.includes(color));
      if (gama) {
        const modelo = "Canape abatible tapizado en tela alta capacidad y resistencia  gama colores " + gama[0];
        const tb = await ctx.tabla(modelo);
        const row = tb[tela[2]] || tb[tela[2].replace(/X180$/, "X190")];
        const p = precioCol(row);
        if (p != null) {
          oferta = p;
          como = "Tarifas " + ctx.columna + " canapé tela gama " + gama[0] + " " + row.talla;
          pasos.push(pasoTarifa((/^M/.test(sku) ? "Sin montaje = " + sinM + " · " : "") + "Color " + color + " = gama " + gama[0] + " · Tarifas " + ctx.columna + ": " + modelo + " " + row.talla, row, p));
          if (/^M/.test(sku) && !montaje) { montajeTela = true; oferta += MONTAJE; como += " + montaje 47,19"; pasos.push({ label: "+ montaje 39 € + IVA (47,19 €), el SKU empieza por M", valor: r2(oferta) }); }
        }
      }
    }
  }
  // Canapé 105X200 sin tarifa (Jennifer, 2026-11-04): "un 10 % más caro del
  // precio que te salga el de 105" (105X190); con montaje, se suma al final
  // como en Carrefour.
  if (oferta == null) {
    const c105 = /^(M?)(CAN[A-Z]*)105X200$/.exec(sku);
    if (c105) {
      const r190 = await calcularPrecioOferta(c105[2] + "105X190", { ...ctx, tachado: "fuera", redondeo: "tarifa" });
      if (r190.oferta != null) {
        pasos.push(...r190.pasos.filter((p) => !p.destacado));
        pasos.push({ label: "Precio del " + c105[2] + "105X190", valor: r190.oferta });
        oferta = r190.oferta * 1.1;
        pasos.push({ label: "105X200 = el de 105X190 + 10 % (× 1,10)", valor: r2(oferta) });
        como = "105X190 + 10 % (" + r190.como + ")";
        if (c105[1] === "M") { montajeTela = true; oferta += MONTAJE; como += " + montaje 47,19"; pasos.push({ label: "+ montaje 39 € + IVA (47,19 €), el SKU empieza por M", valor: r2(oferta) }); }
        else montajeTela = true;
      }
    }
  }
  if (oferta == null) {
    // "…GEMELOS" (Leroy, Jennifer 2026-11-04): "en el caso de 160 usa el
    // precio de los canapés (sin ser gemelos) pero en el caso de 180 siempre
    // tienes que usar el precio del canapé gemelo. Respecto a los colchones
    // es el colchón entero".
    const gemelos = /GEMELOS$/.test(sku);
    const mm = /^(M?)(?:PACK)?(.+?)(\d{2,3})X(\d{3})$/.exec(sku.replace(/GEMELOS$/, ""));
    const dos = /^2(ALM[A-Z]+)(\d{2,3})$/.exec(sku);
    let partes = null, conMontaje = false, talla = null;
    if (dos) { partes = [dos[1], dos[1]]; talla = dos[2]; }
    else if (mm && mm[2].includes("+")) { conMontaje = mm[1] === "M"; partes = mm[2].split("+").filter(Boolean); talla = mm[3] + "X" + mm[4]; }
    if (partes) {
      let suma = 0, ok = true;
      const det = [], pasosPiezas = [];
      for (const pz of partes) {
        const t = /^ALM/.test(pz) ? (dos ? talla : talla.split("X")[0]) : talla;
        let row = null, nombre = null, nota = "";
        const def = PIEZAS_PACK.find(([re]) => re.test(pz));
        if (def) {
          const tb = await ctx.tabla(def[1]);
          const canapeGemelo = gemelos && /^CAN/.test(pz) && /^180X/.test(t);
          if (canapeGemelo && tb[t + " GEMELOS"]) { row = tb[t + " GEMELOS"]; nota = " (precio de canapé gemelo)"; }
          else row = tb[t] || tb[t.replace(/X180$/, "X190")];
          // Madera (Jennifer, 2026-11-04): "en madera el 180 gemelo es el frente único".
          if (canapeGemelo && !nota) nota = /madera/i.test(def[1]) ? " (en madera el 180 gemelo es el de frente único)" : " (precio de la 180, no hay gemelo aparte en Tarifas)";
          if (gemelos && /^CAN/.test(pz) && /^160X/.test(t)) nota = " (160: precio del canapé normal, no gemelo)";
          nombre = def[1];
        } else {
          // Pieza que no está en la lista: se busca como artículo de la web.
          const k = en((ALIAS_PIEZA[pz] || pz) + t);
          const fw = k && ctx.pb.get(k);
          if (fw && fw.tarifaModelo) { row = (await ctx.tabla(fw.tarifaModelo))[fw.tarifaTalla]; nombre = fw.tarifaModelo; }
        }
        const p = precioCol(row);
        if (p == null) { ok = false; break; }
        suma += p;
        det.push(pz + " " + p);
        pasosPiezas.push(pasoTarifa("Pieza " + pz + " = " + nombre + " " + row.talla + nota + " · Tarifas " + ctx.columna, row, p));
      }
      if (ok) {
        esPack = true;
        pasos.push(...pasosPiezas);
        pasos.push({ label: "Suma de las piezas", valor: r2(suma) });
        oferta = suma * 0.97;
        pasos.push({ label: "− 3 % por ser pack (× 0,97)", valor: r2(oferta) });
        como = "PACK Σ piezas −3% (" + det.join(" + ") + ")";
        if (conMontaje) { oferta += MONTAJE; como += " + montaje 47,19"; pasos.push({ label: "+ montaje 39 € + IVA (47,19 €), el SKU empieza por M", valor: r2(oferta) }); }
      }
    }
  }
  if (oferta == null) return { oferta: null, tachado: null, como: "SIN TARIFA", pasos: [{ label: "No se ha encontrado tarifa para este SKU: se queda el último precio guardado", valor: null }] };
  if (montaje && !esPack) { oferta += MONTAJE; como += " + montaje 47,19"; pasos.push({ label: "+ montaje 39 € + IVA (47,19 €), el SKU empieza por M", valor: r2(oferta) }); }
  // Leroy (redondeo "tarifa"): el precio que sale tal cual de Tarifas se
  // respeta (los colchones acaban en ,99); solo se redondea al alza lo que
  // se calcula aquí (packs, montaje). Carrefour: siempre al alza.
  const derivado = esPack || montaje || montajeTela;
  if (ctx.redondeo === "tarifa" && !derivado) {
    oferta = r2(oferta);
    pasos.push({ label: "Precio de oferta (el de Tarifas, sin redondear)", valor: oferta, destacado: true });
  } else {
    oferta = alAlza(oferta);
    pasos.push({ label: "Precio de oferta, redondeado al alza", valor: oferta, destacado: true });
  }
  if (ctx.tachado === "fuera") return { oferta, tachado: null, como, pasos };
  const tachado = ctx.tachado === "dto30" ? alAlza(oferta / 0.7) : alAlza(oferta * FACTOR_TACHADO);
  pasos.push(ctx.tachado === "dto30"
    ? { label: "Precio tachado = oferta ÷ 0,70 (" + r2(oferta / 0.7) + "): la oferta es un 30 % más barata, redondeado al alza", valor: tachado, destacado: true }
    : { label: "Precio tachado = oferta × 545 / 198 (" + r2(oferta * FACTOR_TACHADO) + "), redondeado al alza", valor: tachado, destacado: true });
  return { oferta, tachado, como, pasos };
}
