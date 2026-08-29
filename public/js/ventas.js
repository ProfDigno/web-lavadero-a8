(function () {
  const form = document.querySelector("[data-venta-form]");
  if (!form) return;

  const clientSearch = form.querySelector("[data-venta-client-search]");
  const clientId = form.querySelector("[data-venta-client-id]");
  const clientResults = form.querySelector("[data-venta-client-results]");
  const selectedClient = form.querySelector("[data-venta-selected-client]");
  const selectedClientText = form.querySelector("[data-venta-selected-client-text]");
  const clearClient = form.querySelector("[data-venta-clear-client]");
  const items = form.querySelector("[data-venta-items]");
  const template = document.querySelector("[data-venta-item-template]");
  const totalNode = form.querySelector("[data-venta-total]");
  const conditionField = form.querySelector("[data-venta-condition]");
  const conditionOptions = [...form.querySelectorAll("[data-venta-condition-option]")];
  const paymentField = form.querySelector("[data-venta-payment]");
  const paymentOptions = [...form.querySelectorAll("[data-venta-payment-option]")];

  paymentOptions.forEach((option) => {
    option.addEventListener("click", () => {
      paymentOptions.forEach((other) => {
        const active = other === option;
        other.classList.toggle("is-active", active);
        other.setAttribute("aria-pressed", active ? "true" : "false");
      });
      if (paymentField) paymentField.value = option.dataset.ventaPaymentOption || "";
    });
  });

  conditionOptions.forEach((option) => {
    option.addEventListener("change", () => {
      if (!option.checked) {
        option.checked = true;
        return;
      }
      conditionOptions.forEach((other) => {
        if (other !== option) other.checked = false;
      });
      if (conditionField) conditionField.value = option.dataset.ventaConditionOption || "";
    });
  });

  function clientText(client) {
    return [client.chapa, client.marca_modelo, client.nombre].filter(Boolean).join(" - ");
  }

  function hideClientResults() {
    clientResults?.classList.add("is-hidden");
  }

  function chooseClient(client) {
    if (!client) return;
    clientId.value = client.id || "";
    clientSearch.value = clientText(client);
    selectedClientText.textContent = clientText(client);
    selectedClient.classList.remove("is-hidden");
    hideClientResults();
  }

  function clearSelectedClient() {
    clientId.value = "";
    clientSearch.value = "";
    selectedClientText.textContent = "";
    selectedClient.classList.add("is-hidden");
    hideClientResults();
    clientSearch.focus();
  }

  if (clientSearch && clientResults && clientId) {
    let searchTimer = null;
    clientSearch.addEventListener("input", () => {
      clearTimeout(searchTimer);
      clientId.value = "";
      selectedClient.classList.add("is-hidden");
      const term = clientSearch.value.trim();
      if (!term) {
        hideClientResults();
        return;
      }
      searchTimer = setTimeout(async () => {
        try {
          const response = await fetch(`/clientes/buscar?q=${encodeURIComponent(term)}`, { headers: { Accept: "application/json" } });
          if (!response.ok) throw new Error("No se pudo buscar clientes.");
          const clients = (await response.json()).clientes || [];
          clientResults.innerHTML = "";
          if (!clients.length) {
            const empty = document.createElement("div");
            empty.className = "client-result-empty";
            empty.textContent = "Sin clientes encontrados";
            clientResults.appendChild(empty);
          } else {
            clients.slice(0, 8).forEach((client) => {
              const option = document.createElement("button");
              option.type = "button";
              option.className = "client-result";
              option.textContent = clientText(client);
              option.addEventListener("click", () => chooseClient(client));
              clientResults.appendChild(option);
            });
          }
          clientResults.classList.remove("is-hidden");
        } catch (_error) {
          clientResults.innerHTML = "";
          hideClientResults();
        }
      }, 250);
    });
    clearClient?.addEventListener("click", clearSelectedClient);
    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-venta-client-box]")) hideClientResults();
    });
  }

  function money(value) {
    return new Intl.NumberFormat("es-PY", {
      style: "currency",
      currency: "PYG",
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function updateRow(row) {
    const product = row.querySelector("[data-venta-product]");
    const option = product?.selectedOptions[0];
    const price = Number(option?.dataset.price || 0);
    const stock = option?.value ? Number(option.dataset.stock || 0) : 0;
    const quantity = Math.max(0, Number(row.querySelector("[data-venta-quantity]")?.value || 0));
    row.querySelector("[data-venta-stock]").textContent = option?.value ? String(stock) : "—";
    row.querySelector("[data-venta-price]").textContent = money(price);
    row.querySelector("[data-venta-subtotal]").textContent = money(price * quantity);
    return price * quantity;
  }

  function updateTotal() {
    const total = [...items.querySelectorAll("[data-venta-item]")].reduce((sum, row) => sum + updateRow(row), 0);
    totalNode.textContent = money(total);
  }

  function bindRow(row) {
    row.querySelector("[data-venta-product]")?.addEventListener("change", updateTotal);
    row.querySelector("[data-venta-quantity]")?.addEventListener("input", updateTotal);
    row.querySelector("[data-remove-venta-item]")?.addEventListener("click", () => {
      const rows = items.querySelectorAll("[data-venta-item]");
      if (rows.length > 1) row.remove();
      else {
        row.querySelector("[data-venta-product]").value = "";
        row.querySelector("[data-venta-quantity]").value = "1";
      }
      updateTotal();
    });
  }

  items.querySelectorAll("[data-venta-item]").forEach(bindRow);
  document.querySelector("[data-add-venta-item]")?.addEventListener("click", () => {
    const row = template.content.cloneNode(true).firstElementChild;
    items.appendChild(row);
    bindRow(row);
    updateTotal();
  });

  form.addEventListener("submit", (event) => {
    const rows = [...items.querySelectorAll("[data-venta-item]")];
    const selected = rows.map((row) => row.querySelector("[data-venta-product]").value).filter(Boolean);
    if (!selected.length || new Set(selected).size !== selected.length) {
      event.preventDefault();
      window.alert("Seleccione productos distintos y agregue al menos uno.");
    }
  });

  updateTotal();
})();
