const itemsGrid = document.getElementById("itemsGrid");
const walletAddress = document.getElementById("walletAddress");
const lastRefresh = document.getElementById("lastRefresh");
const telegramStatus = document.getElementById("telegramStatus");
const undercutCount = document.getElementById("undercutCount");
const enabledCount = document.getElementById("enabledCount");
const totalCount = document.getElementById("totalCount");
const healthyCount = document.getElementById("healthyCount");
const runtimeMode = document.getElementById("runtimeMode");
const flashMessage = document.getElementById("flashMessage");
const heroActions = document.getElementById("heroActions");
const refreshButton = document.getElementById("refreshButton");
const telegramButton = document.getElementById("telegramButton");

const state = {
  interactiveApi: false,
  dashboard: null,
};

function showMessage(message, isError = false) {
  flashMessage.textContent = message;
  flashMessage.className = isError ? "flash-message error" : "flash-message success";

  window.clearTimeout(showMessage.timeoutId);
  showMessage.timeoutId = window.setTimeout(() => {
    flashMessage.textContent = "";
    flashMessage.className = "flash-message";
  }, 5000);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Erro inesperado.");
  }

  return payload;
}

function formatAddress(value) {
  if (!value || value.length < 16) {
    return value || "-";
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function applyDashboardMeta(data) {
  walletAddress.textContent = formatAddress(data.walletAddress);
  lastRefresh.textContent = data.lastRefreshAt ? new Date(data.lastRefreshAt).toLocaleString("pt-BR") : "Ainda não";
  undercutCount.textContent = String(data.undercutItems || 0);
  enabledCount.textContent = String(data.enabledItems || 0);
  totalCount.textContent = String(data.totalItems || 0);
  healthyCount.textContent = String(data.healthyItems || 0);
  runtimeMode.textContent = state.interactiveApi ? "Local interativo" : "Publicado 24h";

  if (data.telegramConfigured) {
    telegramStatus.textContent = "bot + chat configurados";
  } else if (data.telegramBotConfigured) {
    telegramStatus.textContent = "falta chat_id";
  } else {
    telegramStatus.textContent = "falta token";
  }
}

function renderItems(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) {
    itemsGrid.innerHTML = '<div class="empty-state">Nenhuma listing ativa encontrada.</div>';
    return;
  }

  itemsGrid.innerHTML = items
    .map((item) => {
      const competitor = item.cheaperCompetitor;
      const hasAlert = Boolean(competitor);
      const footerText = competitor
        ? `Concorrente em ${competitor.buyAmountDisplay} ${competitor.buyTokenSymbol}`
        : "Você continua no menor preço";

      const toggleMarkup = state.interactiveApi
        ? `
            <label class="toggle">
              <input type="checkbox" data-key="${item.key}" ${item.enabled ? "checked" : ""} />
              <span></span>
            </label>
          `
        : `
            <span class="monitor-pill ${item.enabled ? "on" : "off"}">
              ${item.enabled ? "Monitorando" : "Desligado"}
            </span>
          `;

      return `
        <article class="item-card ${hasAlert ? "alert" : "safe"}">
          <div class="item-top">
            <img class="item-thumb" src="${item.imageUrl}" alt="${item.name}" />

            <div class="item-body">
              <div class="item-heading">
                <div>
                  <p class="item-kicker">${item.collectionName}</p>
                  <h3>${item.name}</h3>
                </div>
                ${toggleMarkup}
              </div>

              <p class="item-code">${item.productCode}</p>
            </div>
          </div>

          <div class="stats-grid">
            <div class="stat-box">
              <span>Seu menor preço</span>
              <strong>${item.ownFloorPriceDisplay} ${item.buyTokenSymbol}</strong>
            </div>
            <div class="stat-box">
              <span>Floor do mercado</span>
              <strong>${competitor ? `${competitor.buyAmountDisplay} ${competitor.buyTokenSymbol}` : "Sem undercut"}</strong>
            </div>
            <div class="stat-box">
              <span>Diferença</span>
              <strong>${competitor ? `${competitor.priceDeltaDisplay} ${item.buyTokenSymbol}` : "0"}</strong>
            </div>
            <div class="stat-box">
              <span>Suas listings</span>
              <strong>${item.ownListingCount}</strong>
            </div>
          </div>

          <div class="item-footer">
            <span class="badge ${hasAlert ? "danger" : "success"}">
              ${hasAlert ? "Undercut detectado" : "Preço saudável"}
            </span>
            <span class="footer-note">${footerText}</span>
          </div>
        </article>
      `;
    })
    .join("");

  if (!state.interactiveApi) {
    return;
  }

  for (const checkbox of itemsGrid.querySelectorAll("input[type='checkbox']")) {
    checkbox.addEventListener("change", async (event) => {
      try {
        await fetchJson("/api/monitors", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            key: event.target.dataset.key,
            enabled: event.target.checked,
          }),
        });

        await loadDashboardData();
        showMessage("Monitor atualizado.");
      } catch (error) {
        event.target.checked = !event.target.checked;
        showMessage(error.message, true);
      }
    });
  }
}

async function detectInteractiveApi() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    state.interactiveApi = response.ok;
  } catch {
    state.interactiveApi = false;
  }

  if (!state.interactiveApi) {
    heroActions.style.display = "none";
  }
}

async function loadDashboardData() {
  const data = await fetchJson(`/dashboard-data.json?ts=${Date.now()}`);
  state.dashboard = data;
  applyDashboardMeta(data);
  renderItems(data);
}

refreshButton.addEventListener("click", async () => {
  try {
    refreshButton.disabled = true;
    await fetchJson("/api/refresh", { method: "POST" });
    await loadDashboardData();
    showMessage("Atualização concluída.");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    refreshButton.disabled = false;
  }
});

telegramButton.addEventListener("click", async () => {
  try {
    telegramButton.disabled = true;
    await fetchJson("/api/test-telegram", { method: "POST" });
    showMessage("Mensagem de teste enviada.");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    telegramButton.disabled = false;
  }
});

Promise.resolve()
  .then(detectInteractiveApi)
  .then(loadDashboardData)
  .catch((error) => {
    showMessage(error.message, true);
  });

window.setInterval(() => {
  loadDashboardData().catch(() => {});
}, 30000);
