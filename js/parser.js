// Parses a CSV or XLSX export of the "Numbers" spreadsheet into normalized
// transaction objects. Nothing here ever leaves the browser.

const FIELD_SYNONYMS = {
  tipo: ["tipo", "type"],
  nombre: ["nombre", "concepto", "descripcion", "description", "name"],
  precio: ["precio", "importe", "cantidad", "monto", "amount", "valor"],
  categoria: ["categoria", "category"],
  cuenta: ["cuenta", "account", "banco"],
  fecha: ["fecha", "date"],
};

// Strips emoji/symbols and accents so "↕️Tipo" -> "tipo", "🗂️Categoría" -> "categoria".
function normalizeHeader(raw) {
  if (raw == null) return "";
  return String(raw)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // accents
    .replace(/[^a-zA-Z]/g, "") // emoji, spaces, punctuation
    .toLowerCase()
    .trim();
}

function buildFieldMap(headers) {
  const map = {}; // canonical field -> column index
  headers.forEach((h, idx) => {
    const norm = normalizeHeader(h);
    for (const [canonical, synonyms] of Object.entries(FIELD_SYNONYMS)) {
      if (map[canonical] !== undefined) continue;
      if (synonyms.some((s) => norm === s || norm.startsWith(s))) {
        map[canonical] = idx;
      }
    }
  });
  return map;
}

// Strips the trailing emoji/symbol cluster from a category label, e.g.
// "Comida🍕" -> "Comida". Keeps the original as `raw` for display.
function splitCategoryLabel(value) {
  const raw = value == null ? "" : String(value).trim();
  const clean = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N} .,'()/-]+$/gu, "")
    .trim();
  return { raw: raw || "Sin categoría", clean: clean || raw || "Sin categoría" };
}

function parseAmount(value) {
  if (typeof value === "number") return value;
  if (value == null) return NaN;
  let s = String(value).trim();
  if (!s) return NaN;
  s = s.replace(/[€$\s]/g, "");
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Whichever separator appears last is the decimal separator.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Only a comma: treat as decimal separator (Spanish locale export).
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function parseDate(value) {
  if (value instanceof Date && !isNaN(value)) return value;
  if (typeof value === "number") {
    // Excel/Numbers serial date.
    return new Date(EXCEL_EPOCH + value * 86400000);
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    // ISO-ish: 2026-09-16 16:44 or 2026-09-16T16:44:00
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2})?:?(\d{2})?/);
    if (m) {
      return new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4] || 0),
        Number(m[5] || 0)
      );
    }
    // DD/MM/YYYY[ HH:MM]
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[ ,]*(\d{1,2})?:?(\d{2})?/);
    if (m) {
      let year = Number(m[3]);
      if (year < 100) year += 2000;
      return new Date(year, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0));
    }
    const d = new Date(s);
    if (!isNaN(d)) return d;
  }
  return null;
}

function rowsToTransactions(headers, rows) {
  const fieldMap = buildFieldMap(headers);
  const missing = ["tipo", "precio", "fecha"].filter((f) => fieldMap[f] === undefined);
  if (missing.length) {
    throw new Error(
      "No se reconocen las columnas: " +
        missing.join(", ") +
        ". Revisa que el archivo exportado tenga las columnas Tipo, Nombre, Precio, Categoría, Cuenta y Fecha."
    );
  }

  const transactions = [];
  for (const row of rows) {
    if (!row || row.every((c) => c == null || c === "")) continue;
    const tipoRaw = row[fieldMap.tipo];
    const tipo = String(tipoRaw || "").trim().toLowerCase().startsWith("ingreso")
      ? "Ingreso"
      : "Gasto";
    const precio = parseAmount(row[fieldMap.precio]);
    const fecha = parseDate(row[fieldMap.fecha]);
    if (!Number.isFinite(precio) || !fecha) continue;

    const { raw: categoriaRaw, clean: categoria } = splitCategoryLabel(
      fieldMap.categoria !== undefined ? row[fieldMap.categoria] : null
    );
    const cuenta =
      fieldMap.cuenta !== undefined && row[fieldMap.cuenta]
        ? String(row[fieldMap.cuenta]).trim()
        : "Sin cuenta";
    const nombre =
      fieldMap.nombre !== undefined && row[fieldMap.nombre]
        ? String(row[fieldMap.nombre]).trim()
        : "(sin nombre)";

    transactions.push({
      tipo,
      nombre,
      precio: Math.abs(precio),
      categoria,
      categoriaRaw,
      cuenta,
      fecha,
    });
  }
  transactions.sort((a, b) => a.fecha - b.fecha);
  return transactions;
}

function parseCSVText(text) {
  const result = Papa.parse(text, {
    skipEmptyLines: true,
    delimitersToGuess: [",", ";", "\t"],
  });
  const [headers, ...rows] = result.data;
  return rowsToTransactions(headers, rows);
}

function parseWorkbookArrayBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const [headers, ...rows] = data;
  return rowsToTransactions(headers, rows);
}

async function parseFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const text = await file.text();
    return parseCSVText(text);
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    return parseWorkbookArrayBuffer(buffer);
  }
  throw new Error("Formato no soportado. Exporta tu hoja de Numbers a CSV o Excel (.xlsx).");
}

window.FinanceParser = { parseFile, parseAmount, parseDate, normalizeHeader };
