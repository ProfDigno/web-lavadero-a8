(function () {
  const dataNode = document.getElementById("analysis-ventas-data");
  if (!dataNode || !window.Chart) return;

  const data = JSON.parse(dataNode.textContent || "{}");
  const money = (value) => `Gs. ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Number(value || 0))}`;
  const palette = ["#0f766e", "#1f6feb", "#b45309", "#7c3aed", "#dc2626", "#0891b2", "#4d7c0f", "#be185d", "#475569", "#ca8a04"];

  Chart.defaults.font.family = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  Chart.defaults.color = "#506078";

  function canvas(name) {
    return document.querySelector(`[data-sales-chart="${name}"]`);
  }

  function horizontalBar(name, items, label, valueKey, options = {}) {
    const node = canvas(name);
    if (!node || !items?.length) return;
    new Chart(node, {
      type: "bar",
      data: {
        labels: items.map((item) => item.label || item.nombre),
        datasets: [{
          label,
          data: items.map((item) => Number(item[valueKey] ?? item.value ?? 0)),
          backgroundColor: options.colors || options.color || "#0f766e",
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (context) => options.money ? money(context.raw) : String(context.raw || 0) } }
        },
        scales: {
          x: { beginAtZero: true, ticks: { callback: (value) => options.money ? money(value) : value } },
          y: { grid: { display: false } }
        }
      }
    });
  }

  const daily = data.daily || [];
  const dailyNode = canvas("daily");
  if (dailyNode && daily.length) {
    new Chart(dailyNode, {
      type: "bar",
      data: {
        labels: daily.map((item) => item.label),
        datasets: [
          { label: "Monto vendido", data: daily.map((item) => item.total), backgroundColor: "rgba(31, 111, 235, .72)", yAxisID: "money", borderRadius: 6 },
          { type: "line", label: "Ventas", data: daily.map((item) => item.ventas), borderColor: "#0f766e", backgroundColor: "#0f766e", yAxisID: "count", tension: .25 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          tooltip: {
            callbacks: {
              label: (context) => context.dataset.yAxisID === "money"
                ? `${context.dataset.label}: ${money(context.raw)}`
                : `${context.dataset.label}: ${context.raw}`
            }
          }
        },
        scales: {
          count: { beginAtZero: true, position: "left", grid: { display: false } },
          money: { beginAtZero: true, position: "right", ticks: { callback: (value) => money(value) } }
        }
      }
    });
  }

  const payments = data.payments || [];
  horizontalBar("payments", payments.map((item) => ({ ...item, label: item.label, value: item.value })), "Total", "value", {
    colors: payments.map((item, index) => item.color || palette[index % palette.length]),
    money: true
  });
  horizontalBar("products", data.products || [], "Unidades", "value", { color: "#7c3aed" });
  horizontalBar("clients", data.clients || [], "Total", "value", { color: "#b45309", money: true });
})();
