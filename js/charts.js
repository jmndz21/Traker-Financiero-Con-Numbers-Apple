// Chart.js rendering, configured against the design tokens in css/styles.css
// (read live so charts follow the light/dark toggle without re-fetching data).

function tok(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function baseFont() {
  return { family: "system-ui, -apple-system, 'Segoe UI', sans-serif", size: 12 };
}

Chart.defaults.font = baseFont();
Chart.defaults.color = () => tok("--text-secondary");
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.boxWidth = 8;
Chart.defaults.plugins.legend.labels.boxHeight = 8;

const charts = {}; // id -> Chart instance, so re-renders destroy the old one

function makeChart(canvasId, config) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(el, config);
  return charts[canvasId];
}

function gridOpts() {
  return { color: tok("--gridline"), drawTicks: false };
}

function tooltipBase() {
  return {
    backgroundColor: tok("--surface-2"),
    titleColor: tok("--text-primary"),
    bodyColor: tok("--text-secondary"),
    borderColor: tok("--border"),
    borderWidth: 1,
    padding: 10,
    cornerRadius: 8,
    displayColors: true,
    boxPadding: 4,
  };
}

function renderMonthlyEvolution(monthly) {
  const labels = monthly.map((m) => m.label);
  makeChart("chart-evolution", {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Ingresos",
          data: monthly.map((m) => m.ingresos),
          borderColor: tok("--series-1"),
          backgroundColor: hexAlpha(tok("--series-1"), 0.1),
          fill: true,
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: tok("--series-1"),
          pointBorderColor: tok("--surface-1"),
          pointBorderWidth: 2,
        },
        {
          label: "Gastos",
          data: monthly.map((m) => m.gastos),
          borderColor: tok("--series-2"),
          backgroundColor: hexAlpha(tok("--series-2"), 0.1),
          fill: true,
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: tok("--series-2"),
          pointBorderColor: tok("--surface-1"),
          pointBorderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, position: "top", align: "end" },
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${FinanceAnalytics.fmtEUR(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false } },
        y: {
          beginAtZero: true,
          grid: gridOpts(),
          border: { display: false },
          ticks: { callback: (v) => FinanceAnalytics.fmtCompactEUR(v) },
        },
      },
    },
  });
}

function renderBalanceBars(monthly) {
  const labels = monthly.map((m) => m.label);
  const values = monthly.map((m) => m.ingresos - m.gastos);
  const good = tok("--status-good");
  const critical = tok("--status-critical");
  makeChart("chart-balance", {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Balance",
          data: values,
          backgroundColor: values.map((v) => (v >= 0 ? good : critical)),
          borderRadius: 4,
          maxBarThickness: 24,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipBase(),
          callbacks: { label: (ctx) => FinanceAnalytics.fmtEUR(ctx.parsed.y) },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false } },
        y: {
          grid: gridOpts(),
          border: { display: false },
          ticks: { callback: (v) => FinanceAnalytics.fmtCompactEUR(v) },
        },
      },
    },
  });
}

function foldOthers(items, keyField, max = 7) {
  if (items.length <= max) return items;
  const head = items.slice(0, max);
  const tail = items.slice(max);
  const other = {
    [keyField]: "Otros",
    total: tail.reduce((a, i) => a + i.total, 0),
    count: tail.reduce((a, i) => a + i.count, 0),
  };
  return [...head, other];
}

function renderRankedBar(canvasId, items, keyField) {
  const folded = foldOthers(items, keyField);
  const blue = tok("--series-1");
  makeChart(canvasId, {
    type: "bar",
    data: {
      labels: folded.map((i) => i[keyField]),
      datasets: [
        {
          data: folded.map((i) => i.total),
          backgroundColor: blue,
          borderRadius: 4,
          maxBarThickness: 20,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipBase(),
          callbacks: { label: (ctx) => FinanceAnalytics.fmtEUR(ctx.parsed.x) },
        },
      },
      scales: {
        x: {
          grid: gridOpts(),
          border: { display: false },
          ticks: { callback: (v) => FinanceAnalytics.fmtCompactEUR(v) },
        },
        y: { grid: { display: false }, border: { display: false } },
      },
    },
  });
}

function hexAlpha(hex, alpha) {
  const h = hex.replace("#", "");
  const bigint = parseInt(h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function renderHeatmap(containerId, grid) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const max = Math.max(1, ...grid.flat().map((c) => c.total));
  const blue = tok("--series-1");
  const bands = FinanceAnalytics.TIME_BANDS;
  const days = FinanceAnalytics.WEEKDAY_NAMES;

  let html = '<div class="heatmap-grid" style="--cols:' + (bands.length + 1) + '">';
  html += '<div class="heatmap-cell heatmap-corner"></div>';
  bands.forEach((b) => (html += `<div class="heatmap-cell heatmap-head">${b.label}</div>`));
  days.forEach((day, dIdx) => {
    html += `<div class="heatmap-cell heatmap-head heatmap-rowhead">${day}</div>`;
    bands.forEach((_, bIdx) => {
      const cell = grid[dIdx][bIdx];
      const intensity = cell.total / max;
      const bg = intensity === 0 ? "transparent" : hexAlpha(blue, 0.12 + intensity * 0.78);
      const textColor = intensity > 0.55 ? "#ffffff" : "var(--text-secondary)";
      const title = `${day} · ${bands[bIdx].label}: ${FinanceAnalytics.fmtEUR(cell.total)} (${cell.count} gastos)`;
      html += `<div class="heatmap-cell heatmap-value" style="background:${bg};color:${textColor}" title="${title}">${
        cell.total > 0 ? FinanceAnalytics.fmtCompactEUR(cell.total) : "—"
      }</div>`;
    });
  });
  html += "</div>";
  el.innerHTML = html;
}

window.FinanceCharts = {
  renderMonthlyEvolution,
  renderBalanceBars,
  renderRankedBar,
  renderHeatmap,
  hexAlpha,
};
