(function () {
  const A = FinanceAnalytics;
  let allTx = [];
  let filtered = [];

  const el = {
    uploadScreen: document.getElementById("upload-screen"),
    dashboard: document.getElementById("dashboard"),
    dropzone: document.getElementById("dropzone"),
    fileInput: document.getElementById("file-input"),
    uploadError: document.getElementById("upload-error"),
    reloadBtn: document.getElementById("reload-btn"),
    fileNameLabel: document.getElementById("file-name-label"),
    themeToggle: document.getElementById("theme-toggle"),
    kpiRow: document.getElementById("kpi-row"),
    filterMonth: document.getElementById("filter-month"),
    filterCuenta: document.getElementById("filter-cuenta"),
    filterCategoria: document.getElementById("filter-categoria"),
    heatmap: document.getElementById("heatmap-container"),
    antList: document.getElementById("ant-list"),
    topExpensesBody: document.querySelector("#top-expenses-table tbody"),
    txBody: document.querySelector("#tx-table tbody"),
    txSearch: document.getElementById("tx-search"),
    txCountLabel: document.getElementById("tx-count-label"),
  };

  // ---- Theme ----
  const savedTheme = localStorage.getItem("finance-theme");
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);
  el.themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("finance-theme", next);
    if (allTx.length) renderAll();
  });

  // ---- File handling ----
  el.dropzone.addEventListener("click", () => el.fileInput.click());
  el.dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.dropzone.classList.add("drag-over");
  });
  el.dropzone.addEventListener("dragleave", () => el.dropzone.classList.remove("drag-over"));
  el.dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    el.dropzone.classList.remove("drag-over");
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  el.fileInput.addEventListener("change", () => {
    if (el.fileInput.files.length) handleFile(el.fileInput.files[0]);
  });
  el.reloadBtn.addEventListener("click", () => {
    allTx = [];
    el.dashboard.classList.remove("active");
    el.uploadScreen.classList.remove("hidden");
    el.reloadBtn.style.display = "none";
    el.fileNameLabel.textContent = "";
    el.fileInput.value = "";
    showError("");
  });

  function showError(msg) {
    el.uploadError.textContent = msg;
    el.uploadError.style.display = msg ? "block" : "none";
  }

  async function handleFile(file) {
    showError("");
    try {
      const txs = await FinanceParser.parseFile(file);
      if (!txs.length) {
        showError("No se encontraron movimientos válidos en el archivo. Comprueba que exportaste la tabla correcta.");
        return;
      }
      allTx = txs;
      el.fileNameLabel.textContent = "· " + file.name;
      el.uploadScreen.classList.add("hidden");
      el.dashboard.classList.add("active");
      el.reloadBtn.style.display = "inline-flex";
      populateFilters(allTx);
      renderAll();
    } catch (err) {
      console.error(err);
      showError(err.message || "No se pudo leer el archivo.");
    }
  }

  // ---- Filters ----
  function populateFilters(txs) {
    const months = [...new Set(txs.map((t) => A.monthKey(t.fecha)))].sort();
    const cuentas = [...new Set(txs.map((t) => t.cuenta))].sort();
    const categorias = [...new Set(txs.map((t) => t.categoria))].sort();
    fillSelect(el.filterMonth, months.map((m) => [m, A.monthLabel(m)]), "Todos los meses");
    fillSelect(el.filterCuenta, cuentas.map((c) => [c, c]), "Todas las cuentas");
    fillSelect(el.filterCategoria, categorias.map((c) => [c, c]), "Todas las categorías");
  }
  function fillSelect(selectEl, pairs, allLabel) {
    selectEl.innerHTML = `<option value="">${allLabel}</option>`;
    for (const [value, label] of pairs) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      selectEl.appendChild(opt);
    }
  }
  [el.filterMonth, el.filterCuenta, el.filterCategoria].forEach((s) =>
    s.addEventListener("change", renderAll)
  );
  el.txSearch.addEventListener("input", renderTransactionsTable);

  function applyFilters() {
    const month = el.filterMonth.value;
    const cuenta = el.filterCuenta.value;
    const categoria = el.filterCategoria.value;
    filtered = allTx.filter((t) => {
      if (month && A.monthKey(t.fecha) !== month) return false;
      if (cuenta && t.cuenta !== cuenta) return false;
      if (categoria && t.categoria !== categoria) return false;
      return true;
    });
  }

  // ---- Render pipeline ----
  function renderAll() {
    applyFilters();
    renderKPIs(filtered);
    const monthly = A.monthOverMonth(A.groupByMonth(filtered));
    FinanceCharts.renderMonthlyEvolution(monthly);
    FinanceCharts.renderBalanceBars(monthly);
    FinanceCharts.renderRankedBar("chart-categoria", A.groupByCategory(filtered, "Gasto"), "categoria");
    FinanceCharts.renderRankedBar("chart-cuenta", A.groupByAccount(filtered, "Gasto"), "cuenta");
    FinanceCharts.renderHeatmap("heatmap-container", A.weekdayHourHeatmap(filtered));
    renderAntSpend(A.antSpend(filtered));
    renderTopExpenses(A.topExpenses(filtered, 10));
    renderTransactionsTable();
  }

  function renderKPIs(txs) {
    const k = A.computeKPIs(txs);
    const monthly = A.groupByMonth(txs);
    const last = monthly[monthly.length - 1];
    const prev = monthly[monthly.length - 2];
    let balanceDelta = "";
    if (last && prev) {
      const lastBal = last.ingresos - last.gastos;
      const prevBal = prev.ingresos - prev.gastos;
      const diff = lastBal - prevBal;
      const good = diff >= 0;
      balanceDelta = `<div class="kpi-delta ${good ? "good" : "bad"}">${good ? "▲" : "▼"} ${A.fmtCompactEUR(Math.abs(diff))} vs ${prev.label}</div>`;
    }
    const tiles = [
      { label: "Balance total", value: A.fmtEUR(k.balance), extra: balanceDelta },
      { label: "Ingresos", value: A.fmtEUR(k.ingresos) },
      { label: "Gastos", value: A.fmtEUR(k.gastos) },
      { label: "Tasa de ahorro", value: `${k.ahorro.toFixed(1)}%` },
    ];
    el.kpiRow.innerHTML = tiles
      .map(
        (t) => `<div class="kpi-tile">
          <div class="kpi-label">${t.label}</div>
          <div class="kpi-value">${t.value}</div>
          ${t.extra || ""}
        </div>`
      )
      .join("");
  }

  function renderAntSpend(items) {
    const top = items.slice(0, 6);
    const max = Math.max(1, ...top.map((i) => i.total));
    el.antList.innerHTML = top.length
      ? top
          .map(
            (i) => `
        <div class="ant-row">
          <div class="ant-name">${escapeHtml(i.categoria)}</div>
          <div class="ant-total">${A.fmtEUR(i.total)}</div>
          <div class="ant-bar-track"><div class="ant-bar-fill" style="width:${(i.total / max) * 100}%"></div></div>
          <div class="ant-meta">${i.count} movimientos · media ${A.fmtEUR(i.avg)}</div>
          <div></div>
        </div>`
          )
          .join("")
      : `<div class="empty-state">No hay suficientes datos aún</div>`;
  }

  function renderTopExpenses(items) {
    el.topExpensesBody.innerHTML = items.length
      ? items
          .map(
            (t) => `<tr>
          <td>${escapeHtml(t.nombre)}</td>
          <td><span class="tag">${escapeHtml(t.categoria)}</span></td>
          <td class="num">${A.fmtEUR(t.precio)}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="3" class="empty-state">Sin gastos</td></tr>`;
  }

  function renderTransactionsTable() {
    const q = el.txSearch.value.trim().toLowerCase();
    const rows = filtered
      .filter((t) => !q || t.nombre.toLowerCase().includes(q) || t.categoria.toLowerCase().includes(q))
      .slice()
      .reverse();
    el.txCountLabel.textContent = `${rows.length} de ${filtered.length} movimientos`;
    const dtf = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
    el.txBody.innerHTML = rows.length
      ? rows
          .slice(0, 300)
          .map(
            (t) => `<tr>
          <td>${dtf.format(t.fecha)}</td>
          <td><span class="tag ${t.tipo === "Ingreso" ? "ingreso" : "gasto"}">${t.tipo}</span></td>
          <td>${escapeHtml(t.nombre)}</td>
          <td>${escapeHtml(t.categoria)}</td>
          <td>${escapeHtml(t.cuenta)}</td>
          <td class="num">${t.tipo === "Gasto" ? "-" : "+"}${A.fmtEUR(t.precio)}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="6" class="empty-state">Sin movimientos</td></tr>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
})();
