// Pure aggregation functions over the normalized transaction list.
// No DOM, no side effects — easy to reason about and test.

const MONTH_NAMES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];
const WEEKDAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function fmtEUR(n) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}
function fmtCompactEUR(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1000) return sign + (abs / 1000).toFixed(abs >= 10000 ? 0 : 1) + "K €";
  return fmtEUR(n);
}

function computeKPIs(txs) {
  const ingresos = sum(txs.filter((t) => t.tipo === "Ingreso"));
  const gastos = sum(txs.filter((t) => t.tipo === "Gasto"));
  const balance = ingresos - gastos;
  const ahorro = ingresos > 0 ? (balance / ingresos) * 100 : 0;
  return { ingresos, gastos, balance, ahorro };
}

function sum(txs) {
  return txs.reduce((acc, t) => acc + t.precio, 0);
}

function groupByMonth(txs) {
  const map = new Map();
  for (const t of txs) {
    const key = monthKey(t.fecha);
    if (!map.has(key)) map.set(key, { key, label: monthLabel(key), ingresos: 0, gastos: 0 });
    const bucket = map.get(key);
    if (t.tipo === "Ingreso") bucket.ingresos += t.precio;
    else bucket.gastos += t.precio;
  }
  return [...map.values()].sort((a, b) => (a.key > b.key ? 1 : -1));
}

function groupByCategory(txs, tipo = "Gasto") {
  const map = new Map();
  for (const t of txs) {
    if (t.tipo !== tipo) continue;
    if (!map.has(t.categoria)) map.set(t.categoria, { categoria: t.categoria, raw: t.categoriaRaw, total: 0, count: 0 });
    const bucket = map.get(t.categoria);
    bucket.total += t.precio;
    bucket.count += 1;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function groupByAccount(txs, tipo = "Gasto") {
  const map = new Map();
  for (const t of txs) {
    if (t.tipo !== tipo) continue;
    if (!map.has(t.cuenta)) map.set(t.cuenta, { cuenta: t.cuenta, total: 0, count: 0 });
    const bucket = map.get(t.cuenta);
    bucket.total += t.precio;
    bucket.count += 1;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

// Rows: weekday (0=Dom..6=Sáb) × 4 time bands. Values are average spend per
// occurrence so a single big outlier doesn't dominate the read.
const TIME_BANDS = [
  { key: "madrugada", label: "Madrugada", from: 0, to: 6 },
  { key: "manana", label: "Mañana", from: 6, to: 13 },
  { key: "tarde", label: "Tarde", from: 13, to: 20 },
  { key: "noche", label: "Noche", from: 20, to: 24 },
];
function bandFor(hour) {
  return TIME_BANDS.find((b) => hour >= b.from && hour < b.to) || TIME_BANDS[0];
}

function weekdayHourHeatmap(txs) {
  const grid = WEEKDAY_NAMES.map(() => TIME_BANDS.map(() => ({ total: 0, count: 0 })));
  for (const t of txs) {
    if (t.tipo !== "Gasto") continue;
    const day = t.fecha.getDay();
    const band = bandFor(t.fecha.getHours());
    const bandIdx = TIME_BANDS.indexOf(band);
    grid[day][bandIdx].total += t.precio;
    grid[day][bandIdx].count += 1;
  }
  return grid;
}

function topExpenses(txs, n = 10) {
  return txs
    .filter((t) => t.tipo === "Gasto")
    .sort((a, b) => b.precio - a.precio)
    .slice(0, n);
}

// Categories whose spend is many small transactions rather than few big
// ones — often the "hormiga" (ant) spend that's easy to underestimate.
function antSpend(txs, minCount = 5) {
  return groupByCategory(txs, "Gasto")
    .filter((c) => c.count >= minCount)
    .map((c) => ({ ...c, avg: c.total / c.count }))
    .sort((a, b) => b.total - a.total);
}

function monthOverMonth(monthly) {
  return monthly.map((m, i) => {
    if (i === 0) return { ...m, gastosDelta: null, ingresosDelta: null };
    const prev = monthly[i - 1];
    const gastosDelta = prev.gastos > 0 ? ((m.gastos - prev.gastos) / prev.gastos) * 100 : null;
    const ingresosDelta =
      prev.ingresos > 0 ? ((m.ingresos - prev.ingresos) / prev.ingresos) * 100 : null;
    return { ...m, gastosDelta, ingresosDelta };
  });
}

// Simple linear regression on monthly balance to project the next N months.
function projectBalance(monthly, months = 2) {
  const pts = monthly.map((m, i) => [i, m.ingresos - m.gastos]);
  if (pts.length < 2) return [];
  const n = pts.length;
  const sumX = pts.reduce((a, [x]) => a + x, 0);
  const sumY = pts.reduce((a, [, y]) => a + y, 0);
  const sumXY = pts.reduce((a, [x, y]) => a + x * y, 0);
  const sumXX = pts.reduce((a, [x]) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  const out = [];
  for (let i = 0; i < months; i++) {
    const x = n + i;
    out.push({ index: x, value: slope * x + intercept });
  }
  return out;
}

window.FinanceAnalytics = {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  TIME_BANDS,
  monthKey,
  monthLabel,
  fmtEUR,
  fmtCompactEUR,
  computeKPIs,
  groupByMonth,
  groupByCategory,
  groupByAccount,
  weekdayHourHeatmap,
  topExpenses,
  antSpend,
  monthOverMonth,
  projectBalance,
};
