(function () {
  const form = document.querySelector("[data-caja-cierre-form]");
  if (!form) return;

  const list = form.querySelector("[data-denomination-list]");
  const expectedElement = document.querySelector("[data-expected-cash]");
  const countedElement = form.querySelector("[data-counted-cash]");
  const differenceElement = form.querySelector("[data-cash-difference]");

  function money(value) {
    return new Intl.NumberFormat("es-PY", {
      style: "currency",
      currency: "PYG",
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function updateTotals() {
    let counted = 0;
    list.querySelectorAll("[data-denomination-row]").forEach((row) => {
      const value = Number(row.querySelector("[data-denomination-value]")?.value || 0);
      const count = Number(row.querySelector("[data-denomination-count]")?.value || 0);
      const total = value > 0 && count >= 0 ? value * count : 0;
      counted += total;
      const totalElement = row.querySelector("[data-denomination-total]");
      if (totalElement) totalElement.textContent = money(total);
    });
    const expected = Number(expectedElement?.dataset.expectedCash || 0);
    const difference = counted - expected;
    countedElement.textContent = money(counted);
    differenceElement.textContent = money(difference);
    differenceElement.classList.toggle("is-negative", difference < 0);
    differenceElement.classList.toggle("is-positive", difference > 0);
  }

  list.querySelectorAll("[data-denomination-count]").forEach((field) => field.addEventListener("input", updateTotals));

  form.addEventListener("submit", (event) => {
    const rows = [...list.querySelectorAll("[data-denomination-row]")];
    const hasValidRow = rows.some((row) => Number(row.querySelector("[data-denomination-value]")?.value || 0) > 0);
    if (!hasValidRow) {
      event.preventDefault();
      window.alert("Ingrese al menos una denominación válida para realizar el arqueo.");
      return;
    }
    if (!window.confirm("¿Confirma el cierre de esta sesión de caja? El detalle quedará congelado.")) event.preventDefault();
  });

  updateTotals();
})();
