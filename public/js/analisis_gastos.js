(function () {
  const node = document.getElementById("analysis-gastos-data");
  if (!node || !window.Chart) return;
  const data = JSON.parse(node.textContent || "{}");
  const money = (value) => `Gs. ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Number(value || 0))}`;
  const palette = ["#0f766e", "#1f6feb", "#b45309", "#7c3aed", "#dc2626", "#0891b2", "#4d7c0f", "#be185d", "#475569", "#ca8a04"];
  Chart.defaults.font.family = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  Chart.defaults.color = "#506078";
  const canvas = (name) => document.querySelector(`[data-expense-chart="${name}"]`);
  const bar = (name, items, label, key, options = {}) => {
    const target = canvas(name);
    if (!target || !items?.length) return;
    new Chart(target, { type: "bar", data: { labels: items.map((item) => item.label), datasets: [{ label, data: items.map((item) => Number(item[key] || 0)), backgroundColor: options.colors || options.color || "#0f766e", borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, indexAxis: options.horizontal ? "y" : "x", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${label}: ${options.money ? money(context.raw) : context.raw}` } } }, scales: { x: { beginAtZero: true, ticks: { callback: (value) => options.money && !options.horizontal ? money(value) : value }, grid: { display: options.horizontal } }, y: { beginAtZero: true, ticks: { callback: (value) => options.money && options.horizontal ? money(value) : value }, grid: { display: !options.horizontal } } } } });
  };
  const period = data.period || [];
  const periodNode = canvas("period");
  if (periodNode && period.length) {
    new Chart(periodNode, { type: "bar", data: { labels: period.map((item) => item.label), datasets: [{ label: "Monto", data: period.map((item) => item.total), backgroundColor: "rgba(31,111,235,.72)", borderRadius: 6, yAxisID: "money" }, { type: "line", label: "Cantidad", data: period.map((item) => item.cantidad), borderColor: "#0f766e", backgroundColor: "#0f766e", yAxisID: "count", tension: .25 }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { tooltip: { callbacks: { label: (context) => context.dataset.yAxisID === "money" ? `Monto: ${money(context.raw)}` : `Cantidad: ${context.raw}` } } }, scales: { count: { beginAtZero: true, position: "left", grid: { display: false } }, money: { beginAtZero: true, position: "right", ticks: { callback: (value) => money(value) } } } } });
  }
  const types = data.types || [];
  bar("types-count", types, "Cantidad", "cantidad", { horizontal: true, colors: types.map((_, index) => palette[index % palette.length]) });
  bar("types-total", [...types].sort((a, b) => b.total - a.total), "Monto", "total", { horizontal: true, money: true, color: "#b45309" });
  const payments = data.payments || [];
  bar("payments", payments, "Monto", "total", { horizontal: true, money: true, colors: payments.map((_, index) => palette[index % palette.length]) });
})();
