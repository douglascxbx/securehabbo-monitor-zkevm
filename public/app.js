const itemsGrid = document.getElementById("itemsGrid");
const walletAddress = document.getElementById("walletAddress");
const lastRefresh = document.getElementById("lastRefresh");
const telegramStatus = document.getElementById("telegramStatus");
const undercutCount = document.getElementById("undercutCount");
const enabledCount = document.getElementById("enabledCount");
const totalCount = document.getElementById("totalCount");
const healthyCount = document.getElementById("healthyCount");
const sentAlertsCount = document.getElementById("sentAlertsCount");
const runtimeMode = document.getElementById("runtimeMode");
const runtimePill = document.getElementById("runtimePill");
const headlineStatus = document.getElementById("headlineStatus");
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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatAddress(value) {
  if (!value || value.length < 18) {
    return value || "-";
  }

  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function formatDate(value) {
  if (!value) {
    return "Ainda nao sincronizado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function applyDashboardMeta(data) {
  walletAddress.textContent = data.walletAddress || "-";
  lastRefresh.textContent = formatDate(data.lastRefreshAt);
  undercutCount.textContent = String(data.undercutItems || 0);
  enabledCount.textContent = String(data.enabledItems || 0);
  totalCount.textContent = String(data.totalItems || 0);
  healthyCount.textContent = String(data.healthyItems || 0);
  sentAlertsCount.textContent = String(data.sentAlertsInLastRefresh || 0);

  const runtimeText = state.interactiveApi ? "Painel local com controle" : "Painel publicado 24h";
  runtimeMode.textContent = runtimeText;
  runtimePill.textContent = runtimeText;

  if (data.telegramConfigured) {
    telegramStatus.textContent = "Bot e chat prontos";
  } else if (data.telegramBotConfigured) {
    telegramStatus.textContent = "Falta definir o chat_id";
  } else {
    telegramStatus.textContent = "Token ainda nao configurado";
  }

  if ((data.undercutItems || 0) > 0) {
    headlineStatus.textContent = `${data.undercutItems} item(ns) estao abaixo do seu preco agora.`;
  } else if ((data.totalItems || 0) > 0) {
    headlineStatus.textContent = "No momento, nenhum concorrente esta abaixo do seu floor.";
  } else {
    headlineStatus.textContent = "Nenhuma listing ativa foi encontrada nessa carteira.";
  }
}

function renderThumb(item) {
  if (item.imageUrl) {
    return `<img class="thumb" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" />`;
  }

  return `<div class="thumb-placeholder" aria-hidden="true">${escapeHtml((item.name || "?").slice(0, 1).toUpperCase())}</div>`;
}

function buildToggle(item) {
  if (!state.interactiveApi) {
    return `<span class="monitor-chip ${item.enabled ? "on" : "off"}">${item.enabled ? "Monitorando" : "Desligado"}</span>`;
  }

  return `
    <label class="toggle" aria-label="Ativar monitor do item ${escapeHtml(item.name)}">
      <input type="checkbox" data-key="${escapeHtml(item.key)}" ${item.enabled ? "checked" : ""} />
      <span></span>
    </label>
  `;
}

function renderItems(data) {
  const items = Array.isArray(data.items) ? [...data.items] : [];
  if (!items.length) {
    itemsGrid.innerHTML = '<div class="empty-state">Nenhuma listing ativa encontrada para essa carteira.</div>';
    return;
  }

  items.sort((left, right) => {
    const alertScore = Number(Boolean(right.cheaperCompetitor)) - Number(Boolean(left.cheaperCompetitor));
    if (alertScore !== 0) {
      return alertScore;
    }

    const enabledScore = Number(Boolean(right.enabled)) - Number(Boolean(left.enabled));
    if (enabledScore !== 0) {
      return enabledScore;
    }

    return String(left.name || "").localeCompare(String(right.name || ""));
  });

  itemsGrid.innerHTML = items
    .map((item) => {
      const competitor = item.cheaperCompetitor;
      const hasAlert = Boolean(competitor);
      const competitorText = competitor
        ? `Concorrente ${formatAddress(competitor.accountAddress)} em ${competitor.buyAmountDisplay} ${competitor.buyTokenSymbol}.`
        : "Voce ainda esta no menor preco desse item.";

      return `
        <article class="listing-card ${hasAlert ? "alert" : "safe"}">
          <div class="listing-top">
            ${renderThumb(item)}

            <div class="listing-copy">
              <div class="listing-meta">
                <p class="collection-tag">${escapeHtml(item.collectionName || "Collection")}</p>
                <span class="state-badge ${hasAlert ? "alert" : "safe"}">
                  ${hasAlert ? "Undercut detectado" : "Preco saudavel"}
                </span>
              </div>

              <h3>${escapeHtml(item.name)}</h3>
              <p class="product-code">${escapeHtml(item.productCode)}</p>
            </div>

            <div class="listing-toggle">
              ${buildToggle(item)}
            </div>
          </div>

          <div class="price-grid">
            <div class="price-card">
              <span>Seu floor</span>
              <strong>${escapeHtml(item.ownFloorPriceDisplay)} ${escapeHtml(item.buyTokenSymbol)}</strong>
            </div>
            <div class="price-card">
              <span>Floor do mercado</span>
              <strong>${
                competitor
                  ? `${escapeHtml(competitor.buyAmountDisplay)} ${escapeHtml(competitor.buyTokenSymbol)}`
                  : "Sem undercut"
              }</strong>
            </div>
            <div class="price-card">
              <span>Diferenca</span>
              <strong>${competitor ? `${escapeHtml(competitor.priceDeltaDisplay)} ${escapeHtml(item.buyTokenSymbol)}` : "0"}</strong>
            </div>
          </div>

          <div class="listing-foot">
            <div class="foot-meta">
              <span class="micro-pill">${item.ownListingCount} listing(s) suas</span>
              <span class="micro-pill">${item.marketListingCount || 0} listing(s) no mercado</span>
            </div>
            <p class="competitor-note">${escapeHtml(competitorText)}</p>
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
      const input = event.target;

      try {
        await fetchJson("/api/monitors", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            key: input.dataset.key,
            enabled: input.checked,
          }),
        });

        await loadDashboardData();
        showMessage("Monitor atualizado.");
      } catch (error) {
        input.checked = !input.checked;
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
  const dashboardUrl = new URL("./dashboard-data.json", window.location.href);
  dashboardUrl.searchParams.set("ts", Date.now());

  const data = await fetchJson(dashboardUrl.toString());
  state.dashboard = data;
  applyDashboardMeta(data);
  renderItems(data);

  if (data.lastError) {
    showMessage(data.lastError, true);
  }
}

refreshButton.addEventListener("click", async () => {
  try {
    refreshButton.disabled = true;
    await fetchJson("/api/refresh", { method: "POST" });
    await loadDashboardData();
    showMessage("Atualizacao concluida.");
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
