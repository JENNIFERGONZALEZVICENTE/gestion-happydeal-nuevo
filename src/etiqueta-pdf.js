// Etiqueta de transformación para el almacén (Jennifer, 2026-09-28): la
// imprimen y la pegan al colchón que suben a fábrica. Mismo tamaño que la
// que usaban a mano: 15 × 10 cm en horizontal. Se genera un PDF mínimo a
// mano (sin librerías: el Worker no tiene ninguna de PDF) con Helvetica y
// codificación WinAnsi, que cubre las tildes y la ñ.

const MM = 72 / 25.4;
const ANCHO = 150 * MM;
const ALTO = 100 * MM;

// Anchos aproximados de Helvetica-Bold (en milésimas del tamaño), para
// partir líneas largas sin salirse de la etiqueta.
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
  // Helvetica normal es algo más estrecha que la negrita.
  return (total / 1000) * tam * (negrita ? 1 : 0.9);
}

function partirLineas(texto, tam, maxAncho, negrita) {
  const palabras = String(texto || "").split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? actual + " " + p : p;
    if (anchoTexto(prueba, tam, negrita) <= maxAncho || !actual) actual = prueba;
    else { lineas.push(actual); actual = p; }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

// Texto -> bytes WinAnsi escapados para una cadena PDF "( ... )".
function cadenaPdf(texto) {
  let out = "";
  for (const c of String(texto)) {
    const code = c.charCodeAt(0);
    if (c === "(" || c === ")" || c === "\\") out += "\\" + c;
    else if (code < 128) out += c;
    else if (code <= 255) out += "\\" + code.toString(8).padStart(3, "0");
    else if (c === "—" || c === "–") out += "-";
    else if (c === "→") out += "->";
    else out += "?";
  }
  return "(" + out + ")";
}

// datos: { pedido, cliente, modelo, desde, hasta, unidades, fecha }
export function etiquetaTransformacionPdf(datos) {
  const margen = 8 * MM;
  const util = ANCHO - 2 * margen;
  const ops = [];
  // Marco
  ops.push("1.5 w", `${margen / 2} ${margen / 2} ${ANCHO - margen} ${ALTO - margen} re S`);
  // `y` es siempre el borde de arriba de lo siguiente que se pinta: cada
  // línea baja su altura de mayúsculas, pinta la línea base ahí, y deja
  // debajo el hueco del trazo descendente + interlineado.
  let y = ALTO - margen - 4;
  const linea = (texto, tam, negrita = true, centrado = true) => {
    const fuente = negrita ? "/F2" : "/F1";
    for (const l of partirLineas(texto, tam, util, negrita)) {
      y -= tam * 0.74;
      const x = centrado ? (ANCHO - anchoTexto(l, tam, negrita)) / 2 : margen;
      ops.push(`BT ${fuente} ${tam} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td ${cadenaPdf(l)} Tj ET`);
      y -= tam * 0.38;
    }
  };
  const separador = () => {
    y -= 5;
    ops.push("0.6 w", `${margen} ${y.toFixed(1)} m ${ANCHO - margen} ${y.toFixed(1)} l S`);
    y -= 9;
  };

  linea("TRANSFORMACIÓN DE COLCHÓN", 15);
  separador();
  linea(datos.pedido, 32);
  if (datos.cliente) linea(datos.cliente, 13, false);
  separador();
  linea(String(datos.modelo || "").toUpperCase(), 22);
  y -= 6;
  linea(`DE ${datos.desde}  A  ${datos.hasta}`, 30);
  if ((datos.unidades || 1) > 1) linea(`${datos.unidades} UNIDADES`, 18);
  // Pie fijo abajo
  y = margen + 16;
  linea(`${datos.fecha || ""}   ·   Sale por FURNITURE`, 11, false);

  const contenido = ops.join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO.toFixed(2)} ${ALTO.toFixed(2)}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objetos.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += String(off).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  // Todo el contenido es ASCII (las tildes van escapadas en octal), así
  // que cada carácter es un byte.
  return new TextEncoder().encode(pdf);
}

export function base64DeBytes(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
