// TARIFA REFORMAN (Jennifer, 2026-11-17). Reforman (Reformam Network /
// Habitium) trabaja con un catálogo en Excel que hacemos nosotros: columna A
// = SKU (la referencia para sacar el precio), columna "Precio" (G) = lo único
// que se recalcula; "el resto de columnas quedan exactamente igual".
// Precio = (precio de coste + transporte) ÷ 0,7, SIN IVA, con 2 decimales
// (el Excel de mayo ya iba así: canapé polipiel 90x190 = (119,67 + 45) ÷ 0,7
// = 235,24). Transporte = el de España de Tarifas.
//  - Packs (PACK…+…R): suma de las piezas, cada una (coste + transporte) ÷
//    0,7, SIN descuento (Jennifer: "no le vamos a hacer 5 %, vamos a hacer el
//    cálculo"). La almohada de regalo (+NOR80, +2NOR70) cuenta como pieza.
//  - Base con montaje (MBASE…): + 19 € de montaje (sin IVA) al coste, como en
//    el Excel de mayo (150,94 − 123,80 = 27,14 = 19 ÷ 0,7).
//  - Sin coste en Tarifas (p. ej. almohada Seafoam): se queda el precio del
//    Excel guardado y se avisa.
import { calcularPrecioOferta } from "./ficheros-completos.js";

export const REFORMAN_DIVISOR = 0.7;
export const REFORMAN_MONTAJE_BASE = 19;
const r2 = (n) => Math.round(n * 100) / 100;

// Columna virtual REFORMAN en cada fila de Tarifas: (coste + envío ES) ÷ 0,7.
export function anadirColumnaReforman(fila) {
  if (!fila || fila.coste === null || fila.coste === undefined || !fila.envios || fila.envios.ES === null || fila.envios.ES === undefined) return fila;
  const coste = Number(fila.coste), envio = Number(fila.envios.ES);
  const precio = (coste + envio) / REFORMAN_DIVISOR;
  fila.columnas = {
    ...(fila.columnas || {}),
    REFORMAN: {
      precio,
      pasos: [
        { label: "Precio de coste", valor: r2(coste) },
        { label: "Transporte (España)", valor: r2(envio) },
        { label: "Coste + transporte", valor: r2(coste + envio) },
        { label: "÷ 0,7", valor: r2(precio) },
      ],
    },
  };
  return fila;
}

// Modelos que la web no tiene con el mismo SKU.
const DIRECTOS = [[/^PROPOL(\d{2,3}X\d{3})$/, "Protector Impermeable Pronébula"]];

// Un artículo suelto → { precio (sin redondear), pasos, como } o null.
async function precioSuelto(sku, ctx) {
  for (const [re, modelo] of DIRECTOS) {
    const m = re.exec(sku);
    if (!m) continue;
    const tb = await ctx.tabla(modelo);
    const row = tb[m[1]] || tb[m[1].replace(/X180$/, "X190")];
    const c = row && row.columnas && row.columnas.REFORMAN;
    if (!c) return null;
    return { precio: c.precio, como: modelo + " " + row.talla, pasos: [{ label: modelo + " " + row.talla, valor: r2(c.precio), sub: c.pasos }] };
  }
  const r = await calcularPrecioOferta(sku, { columna: "REFORMAN", tabla: ctx.tabla, pb: ctx.pb, colchon: async () => null, tachado: "fuera", redondeo: "tarifa" });
  if (r.oferta === null || r.oferta === undefined) return null;
  return { precio: r.oferta, como: String(r.como || "").replace(/^Tarifas REFORMAN /, ""), pasos: (r.pasos || []).filter((p) => !p.destacado) };
}

// Pieza de pack → SKU de un artículo suelto de la web con el mismo coste
// (el color no cambia el coste).
// Pack "…GEMELOS": el canapé es el gemelo (2 piezas); la base de 160/180 es
// una sola pieza y el colchón va entero (como en Leroy Merlin).
function skuPieza(codigo, talla, medidaPropia, gemelos) {
  const g = gemelos ? "GEMELOS" : "";
  if (/^CANPOL/.test(codigo)) return "CANPOLBLA" + talla + g;
  if (/^CANMON/.test(codigo)) return "CANMONBLA" + talla + g;
  if (/^BASE/.test(codigo)) return "BASEBLANCA" + talla;
  if (/^COLPHARM?$/.test(codigo)) return "PHARM" + talla;
  if (/^(ALM)?NOR$/.test(codigo)) return "ALMNOR" + (medidaPropia || talla.split("X")[0]);
  return codigo + (medidaPropia || talla);
}

export async function calcularPrecioReforman(skuOriginal, ctx) {
  const sku = String(skuOriginal || "").toUpperCase().replace(/\s+/g, "");
  if (!sku) return { precio: null, como: "SIN SKU", pasos: [] };
  // Packs: PACK<pieza>+<pieza><medida>[+<almohada>]R
  if (/^PACK.*\+/.test(sku)) {
    let s = sku.replace(/^PACK/, "").replace(/R$/, "");
    const gemelos = /GEMELOS$/.test(s);
    s = s.replace(/GEMELOS$/, "");
    const tm = /(\d{2,3}X\d{3})/.exec(s);
    if (!tm) return { precio: null, como: "SIN TARIFA: pack sin medida", pasos: [] };
    const talla = tm[1];
    let suma = 0;
    const pasos = [], det = [];
    for (const parte of s.split("+").filter(Boolean)) {
      const m = /^(\d)?([A-Z]+?)(\d{2,3}X\d{3}|\d{2,3})?$/.exec(parte);
      if (!m) return { precio: null, como: "SIN TARIFA: no se entiende la pieza " + parte, pasos };
      const qty = Number(m[1] || 1);
      const skuP = skuPieza(m[2], talla, m[3] && !/X/.test(m[3]) ? m[3] : null, gemelos);
      const r = await precioSuelto(skuP, ctx);
      if (!r) return { precio: null, como: "SIN TARIFA: pieza " + parte + " (" + skuP + ")", pasos };
      suma += qty * r.precio;
      det.push((qty > 1 ? qty + " × " : "") + skuP);
      pasos.push({ label: "Pieza " + (qty > 1 ? qty + " × " : "") + parte + " = " + r.como, valor: r2(qty * r.precio), sub: (r.pasos[r.pasos.length - 1] || {}).sub || [] });
    }
    const precio = r2(suma);
    pasos.push({ label: "Precio del pack = suma de las piezas (sin descuento)", valor: precio, destacado: true });
    return { precio, como: "Pack: " + det.join(" + "), pasos };
  }
  // Base con montaje.
  if (/^MBASE/.test(sku)) {
    const r = await precioSuelto(sku.slice(1), ctx);
    if (!r) return { precio: null, como: "SIN TARIFA", pasos: [] };
    const extra = REFORMAN_MONTAJE_BASE / REFORMAN_DIVISOR;
    const precio = r2(r.precio + extra);
    return {
      precio, como: r.como + " + montaje 19 €",
      pasos: [...r.pasos, { label: "+ montaje 19 € (sin IVA) ÷ 0,7", valor: r2(extra) }, { label: "Precio con montaje", valor: precio, destacado: true }],
    };
  }
  const r = await precioSuelto(sku, ctx);
  if (!r) return { precio: null, como: "SIN TARIFA", pasos: [{ label: "Sin coste en Tarifas: se queda el precio del Excel guardado", valor: null }] };
  const precio = r2(r.precio);
  return { precio, como: r.como, pasos: [...r.pasos, { label: "Precio Reforman (sin IVA, 2 decimales)", valor: precio, destacado: true }] };
}

