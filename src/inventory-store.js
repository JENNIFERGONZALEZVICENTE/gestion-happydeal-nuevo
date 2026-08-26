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

// Devuelve { referencia, needsReview, reason } — needsReview cuando no se
// puede formar la referencia completa (tipo sin clasificar, o color sin
// letra asignada): se asigna igualmente el número (para no dejar huecos en
// el correlativo) pero sin prefijo/sufijo, y Jennifer la corrige a mano.
function buildReferencia(numero, referenciaTipo, color) {
  if (referenciaTipo === "numero") return { referencia: numero, needsReview: false };
  if (referenciaTipo === "fur") return { referencia: numero + "FUR", needsReview: false };
  if (referenciaTipo === "zenit" || referenciaTipo === "astra") {
    const letra = REFERENCIA_COLOR_LETTERS[normalizeKey(color)];
    if (!letra) {
      return {
        referencia: numero,
        needsReview: true,
        reason: `No sé qué letra de color usar para "${color || "(sin color)"}" en la referencia de Polival (nº ${numero}) — dime la letra o corrige la referencia a mano.`,
      };
    }
    const prefijo = referenciaTipo === "zenit" ? "M" : "ASTRA";
    return { referencia: prefijo + letra + numero, needsReview: false };
  }
  return {
    referencia: numero,
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
    modelo: "SPACE GRAN CAPACIDAD",
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
    tapaBase: "Tapa con borde Deluxe (mismo color elegido)",
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
    },
  },
  tela_tierra: {
    modelo: "SPACE DELUXE",
    tapaBase: "Tapa con borde Deluxe",
    extra: ["BORDE DELUXE"],
    tiradorDefault: "Uñero",
    tiradorTapaPartida: "Normal",
    colores: {
      cacao: { color: "Tela Duna Cocoa", rejilla: "Wengué" },
      beige: { color: "Duna Lino", rejilla: "Tierra" },
      "gris antracita": { color: "Duna Onix", rejilla: "Grafito" },
      "gris niebla": { color: "Duna Koala", rejilla: "Grafito" },
    },
  },
  tela_natural: {
    modelo: "SPACE DELUXE",
    tapaBase: "Tapa con borde Deluxe",
    extra: ["BORDE DELUXE"],
    tiradorDefault: "Uñero",
    tiradorTapaPartida: "Normal",
    colores: {
      oliva: { color: "Duna Oliva", rejilla: "Negra" },
      menta: { color: "Duna Salvia", rejilla: "Negra" },
      oceanic: { color: "Duna Tulum", rejilla: "Negra" },
    },
  },
  tela_vivos: {
    modelo: "SPACE DELUXE",
    tapaBase: "Tapa con borde Deluxe",
    extra: ["BORDE DELUXE"],
    tiradorDefault: "Uñero",
    tiradorTapaPartida: "Normal",
    colores: {
      magenta: { color: "Duna Magenta", rejilla: "Negra" },
      rosa: { color: "Duna Flamingo", rejilla: "Negra" },
      lavanda: { color: "Duna Lavanda", rejilla: "Negra" },
      star: { color: "Duna Dijón", rejilla: "Negra" },
    },
  },
};

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
  const tapa = modelo === "INITIAL DELUXE" ? "Tapa con borde Deluxe + rejilla" : (modelo === "INITIAL" ? "Tapa entera en rejilla" : recipe.tapaBase);

  const partes = [
    `MODELO: ${modelo}`,
    `MEDIDA: ${talla || "(según SKU)"}`,
    `COLOR: ${entry.color}`,
    `TAPA: ${tapa} — Rejilla ${entry.rejilla}`,
  ];
  if (tirador) partes.push(`TIRADOR: ${tirador}`);
  if (extras.length) partes.push(`EXTRA: ${extras.join(" + ")}`);
  return { texto: partes.join(" · "), needsReview: false };
}

// Cabeceros vendidos sueltos (no en pack) traen en Shopify tanto el color
// como la medida final ya calculada en el propio variantTitle, ej.
// "Blanco / Cama 150 – Medida final 180cm" o "Cama 105 - Medida final
// 115cm / Beige" (el orden color/medida cambia según el producto). Se usa
// directamente el "Medida final" que da Shopify en vez de calcular el
// +30cm a mano — así vale igual aunque el margen sea distinto por modelo
// (ej. Aura es +30cm, Atenea/Iris son +10cm, visto en pedidos reales).
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
};
// offset: cuánto se le suma al ancho que elige el cliente para pedir la
// medida final a fábrica — Aura +30cm, el resto +10cm (confirmado con
// pedidos reales y por Jennifer). Se usa tanto si el cabecero va suelto
// (aunque ahí Shopify ya trae la medida final calculada y se usa esa
// directamente) como si va dentro de un pack (donde no hay "medida final"
// en el SKU, solo el ancho del colchón/canapé — ver buildCabeceroMercancia).
const CABECERO_RECIPES = {
  aura: {
    modelo: "SIENNA",
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
  aria: { modelo: "ASHLEY", offset: 10, colores: CABECERO_ACABADOS_COMUNES },
  atenea: { modelo: "MERYL", offset: 10, colores: CABECERO_ACABADOS_COMUNES },
  iris: { modelo: "MARGOT", offset: 10, colores: CABECERO_ACABADOS_COMUNES },
  gaia: { modelo: "GRETA", offset: 10, colores: CABECERO_ACABADOS_COMUNES },
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

// colorResuelto/tallaResuelta son lo que ya calculó resolveItem/resolvePackSku
// (funciona igual suelto que dentro de un pack). rawVariantTitle solo existe
// para cabeceros vendidos sueltos (no en pack) y trae el "Medida final" que
// ya calcula Shopify — dentro de un pack no hay ese dato, así que se usa la
// talla del pack tal cual y se avisa de que puede no ser la medida final real.
function buildCabeceroMercancia(title, colorResuelto, tallaResuelta, rawVariantTitle) {
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
  const acabado = recipe.colores ? recipe.colores[colorKey] : null;
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

function buildSimpleMercancia(title, talla) {
  const t = normalizeKey(title);
  const found = SIMPLE_FABRICA_NOMBRES.find((r) => t.includes(r.match));
  if (!found) {
    return { texto: "", needsReview: true, reason: `No tengo el nombre de fábrica para "${title}" — dime cómo se pide o rellena "Mercancía para pedir a fábrica" a mano.` };
  }
  return { texto: `${found.nombre}${talla ? " · MEDIDA: " + talla : ""}`, needsReview: false };
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
  const bare = text.trim().match(/^\d{2,3}(\.\d+)?$/);
  if (bare) return text.trim();
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

// Empuja un pendiente nuevo (idempotente por id) — compartido entre la
// venta normal (applyStockUsage) y los productos "no llevamos stock"
// (addNoStockBackorder).
function pushBackorder(backorders, { id, orderId, orderNumber, stockModel, talla, color, tipo, cantidad, orderDate, esPack, proveedor, needsDecision, referencia, mercanciaFabrica }) {
  if (backorders.some((b) => b.id === id)) return;
  backorders.push({
    id,
    orderId,
    orderNumber,
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
    estado: "pendiente",
    recibidoFabrica: false,
    // Solo tiene sentido para colchones dentro de un pack con tapicería:
    // referencia FURBEZEN (tiene que salir junto con la tapicería) o
    // FPKBEZEN (puede salir independiente), por defecto FPK hasta que se
    // indique lo contrario o se sepa una fecha de camión cercana. Ver
    // updateBackorderPlan.
    esPack: !!esPack,
    tipoEnvio: "FPK",
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
  });
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
  // Recoge TODOS los productos distintos cuyo código encaja en el
  // segmento, no solo el mejor — dos modelos casi gemelos (ej. un canapé y
  // su versión "LIQUIDACIÓN") pueden coincidir a la vez y el más largo no
  // siempre es el correcto. Si hay más de uno, es una duda real: se sigue
  // eligiendo el más largo como mejor apuesta, pero se marca ambiguo para
  // que Jennifer lo confirme (ver resolvePackSku).
  const matches = [];
  for (const p of Object.values(products)) {
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

function resolvePackSku(rawSku, products, packColor, packTalla) {
  if (!rawSku || rawSku.includes("(")) return { componentes: [], needsReview: true, ambiguousNotes: [] };
  const base = rawSku.split("-")[0];
  const segments = base.split("+").map((s) => s.trim()).filter(Boolean);
  const componentes = [];
  const ambiguousNotes = [];
  let unresolved = 0;
  for (const seg of segments) {
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
      unresolved++;
    }
  }
  return { componentes, needsReview: unresolved > 0 || componentes.length === 0, ambiguousNotes };
}

function resolveItem(item, products) {
  const product = item.productId != null ? products[item.productId] : null;
  if (!product) return { tipo: "desconocido" };
  if (product.product_type === "Pack") {
    const { componentes, needsReview, ambiguousNotes } = resolvePackSku(item.sku, products, extractColor(item.variantTitle), normalizeTalla(item.variantTitle));
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
    const planMatch = url.pathname.match(/^\/backorders\/([^/]+)\/plan$/);
    if (planMatch && method === "POST") {
      return this.updateBackorderPlan(decodeURIComponent(planMatch[1]), await request.json());
    }
    const referenciaMatch = url.pathname.match(/^\/backorders\/([^/]+)\/referencia$/);
    if (referenciaMatch && method === "POST") {
      const { referencia } = await request.json();
      return this.setBackorderReferencia(decodeURIComponent(referenciaMatch[1]), referencia);
    }
    const mercanciaMatch = url.pathname.match(/^\/backorders\/([^/]+)\/mercancia$/);
    if (mercanciaMatch && method === "POST") {
      const { mercanciaFabrica } = await request.json();
      return this.setBackorderMercancia(decodeURIComponent(mercanciaMatch[1]), mercanciaFabrica);
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

    if (url.pathname === "/admin/backfill-proveedor" && method === "POST") {
      return this.backfillProveedor();
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

  async updateFlags({ productId, exceptionFurniture, noStock, stockModel, skuPrefix, altSkuPrefixes, proveedor, referenciaTipo }) {
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
  async applyStockUsage(stock, backorders, item, orderId, orderNumber, esPack, orderDate, proveedor, needsDecision) {
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
        const built = buildReferencia(numero, item.product.referenciaTipo, item.color);
        referencia = built.referencia;
        if (built.needsReview) reviewNotes.push(built.reason);
        if (item.product.product_type === "Almohada" || item.product.product_type === "Topper") {
          const builtMercancia = buildSimpleMercancia(item.product.title, item.talla);
          mercanciaFabrica = builtMercancia.texto;
          if (builtMercancia.needsReview) reviewNotes.push(builtMercancia.reason);
        }
      }
      pushBackorder(backorders, {
        id: `${orderId}-${key}`,
        orderId,
        orderNumber,
        stockModel: item.product.stockModel,
        talla: item.talla,
        color: item.color,
        tipo: item.tipo,
        cantidad: falta,
        orderDate,
        esPack,
        proveedor,
        needsDecision,
        referencia,
        mercanciaFabrica,
      });
    }
    stock[key] = row;
    return { falta, reviewNotes };
  }

  // Para productos "no llevamos stock" (fabricación bajo pedido siempre,
  // ej. Látex Natura): no hay fila de stock que descontar, así que cada
  // venta genera directamente un pendiente por la cantidad completa, sin
  // tocar cantidad/vendidoPendiente. La referencia de Polival ya viene
  // calculada por el llamador (aquí siempre se crea el pendiente, así que
  // no hay riesgo de desperdiciar números del correlativo).
  addNoStockBackorder(backorders, item, orderId, orderNumber, esPack, orderDate, proveedor, needsDecision, referencia, mercanciaFabrica) {
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
      const match = Object.values(products).find((p) => p.stockModel === b.stockModel);
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

  // Mantenimiento puntual: borra un pendiente suelto (ej. quedó un registro
  // erróneo por un fallo de emparejamiento de SKU ya corregido en Catálogo,
  // o un duplicado de pruebas). No expuesto en la UI, solo por API.
  async deleteBackorder(id) {
    const backorders = await this.load("backorders", []);
    const filtered = backorders.filter((b) => b.id !== id);
    const existed = filtered.length !== backorders.length;
    await this.state.storage.put("backorders", filtered);
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

  // Corrección manual de la referencia de Polival (Jennifer, 2026-08-25):
  // siempre editable, por si la letra de color o el tipo automático no
  // encajan para un caso concreto.
  async setBackorderReferencia(id, referencia) {
    const backorders = await this.load("backorders", []);
    const entry = backorders.find((b) => b.id === id);
    if (!entry) return new Response("not found", { status: 404 });
    entry.referencia = referencia || "";
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
  async markOrdered({ ids, unmark }) {
    const backorders = await this.load("backorders", []);
    const set = new Set(ids || []);
    let marcados = 0;
    const fecha = new Date().toISOString();
    for (const b of backorders) {
      if (!set.has(b.id)) continue;
      b.pedidoGenerado = !unmark;
      b.fechaPedidoFabrica = unmark ? null : fecha;
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

  async processSale({ orderId, orderNumber, items, force, orderDate, services, paymentStatus }) {
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
        for (const c of resolved.componentes) flat.push({ ...c, qty: resolved.qty, fromPack: true });
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
    } else {
      const colchones = flat.filter((c) => c.tipo === "colchon");
      agencia = colchones.some((c) => c.product.exceptionFurniture) ? "FURNITURE" : "SEUR";
    }

    // Caso sin regla fija posible (Jennifer, 2026-08-25): un colchón suelto
    // (no parte del pack) que comparte pedido con tapicería. No hay forma
    // automática de saber si debe esperar al mismo envío o salir aparte —
    // se marca para que ella decida pedido a pedido (ver reviewNote).
    if (hasTapiceria && flat.some((c) => c.tipo === "colchon" && !c.fromPack)) {
      needsReview = true;
      reviewReasons.push("Hay un colchón suelto (no es parte del pack) en un pedido que también lleva tapicería. Decide si debe ir en el mismo envío que la tapicería o aparte.");
    }

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
        if (proveedor === "POLIVAL") {
          const numero = await nextReferenciaNumero(this.state);
          const built = buildReferencia(numero, item.product.referenciaTipo, item.color);
          referencia = built.referencia;
          if (built.needsReview) {
            needsReview = true;
            reviewReasons.push(built.reason);
          }
        }
        // "Mercancía para pedir a fábrica" (Jennifer, 2026-08-25): se
        // calcula sola por receta para canapés y para los cabeceros ya
        // clasificados (Aura); el resto (almohadas, topper, cabeceros sin
        // receta, bases, canapé fijo) sigue en blanco/editable a mano.
        let mercanciaFabrica = null;
        if (proveedor === "POLIVAL" && item.product.product_type === "Canapé") {
          const built = buildCanapeMercancia(item.product.title, item.color, item.talla, services);
          mercanciaFabrica = built.texto;
          if (built.needsReview) {
            needsReview = true;
            reviewReasons.push(built.reason);
          }
        } else if (proveedor === "POLIVAL" && item.product.product_type === "Cabecero") {
          const built = buildCabeceroMercancia(item.product.title, item.color, item.talla, item.variantTitle);
          mercanciaFabrica = built.texto;
          if (built.needsReview) {
            needsReview = true;
            reviewReasons.push(built.reason);
          }
        }
        this.addNoStockBackorder(backorders, item, orderId, orderNumber, hasTapiceria, orderDate, proveedor, needsDecision, referencia, mercanciaFabrica);
        if (item.tipo === "colchon" && item.fromPack && hasTapiceria) {
          pendingManufacture = { modelo: item.product.stockModel, talla: item.talla, cantidad: item.qty };
          needsReview = true;
          reviewReasons.push(`${item.product.stockModel} (${item.talla}) del pack sin stock (fabricación bajo pedido, faltan ${item.qty}). Dime si sale junto con la tapicería (FUR) o puede ir aparte (FPK).`);
        }
        continue;
      }

      if (!proveedor) needsReview = true;
      const { falta, reviewNotes } = await this.applyStockUsage(stock, backorders, item, orderId, orderNumber, hasTapiceria, orderDate, proveedor, needsDecision);
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

    return Response.json({ agencia, pendingManufacture, needsReview, reviewReasons });
  }
}
