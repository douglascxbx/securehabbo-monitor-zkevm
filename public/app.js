const itemsGrid = document.getElementById("itemsGrid");
const walletAddress = document.getElementById("walletAddress");
const lastRefresh = document.getElementById("lastRefresh");
const ethUsdPrice = document.getElementById("ethUsdPrice");
const undercutCount = document.getElementById("undercutCount");
const enabledCount = document.getElementById("enabledCount");
const totalCount = document.getElementById("totalCount");
const healthyCount = document.getElementById("healthyCount");
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
    return "Ainda não sincronizado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCollectionName(value) {
  const normalized = String(value || "").toLowerCase();
  const labels = {
    clothes: "Vestuário",
    furniture: "Móveis",
    addons: "Extras",
  };

  return labels[normalized] || value || "Coleção";
}

function renderThumb(item) {
  if (item.imageUrl) {
    return `<img class="thumb" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" />`;
  }

  return `<div class="thumb-placeholder" aria-hidden="true">${escapeHtml((item.name || "?").slice(0, 1).toUpperCase())}</div>`;
}

function buildToggle(item) {
  if (!state.interactiveApi) {
    return `<span class="monitor-chip ${item.enabled ? "on" : "off"}">${item.enabled ? "Ativo" : "Pausado"}</span>`;
  }

  return `
    <label class="toggle" aria-label="Ativar monitor do item ${escapeHtml(item.name)}">
      <input type="checkbox" data-key="${escapeHtml(item.key)}" ${item.enabled ? "checked" : ""} />
      <span></span>
    </label>
  `;
}

function priceText(value) {
  return value && value !== "—" ? value : "—";
}

function applyDashboardMeta(data) {
  walletAddress.textContent = formatAddress(data.walletAddress);
  lastRefresh.textContent = formatDate(data.lastRefreshAt);
  ethUsdPrice.textContent = data.pricing?.ethUsdDisplay || "—";
  undercutCount.textContent = String(data.undercutItems || 0);
  enabledCount.textContent = String(data.enabledItems || 0);
  totalCount.textContent = String(data.totalItems || 0);
  healthyCount.textContent = String(data.healthyItems || 0);

  if ((data.undercutItems || 0) > 0) {
    headlineStatus.textContent = `${data.undercutItems} item(ns) estão abaixo do seu preço agora.`;
  } else if ((data.totalItems || 0) > 0) {
    headlineStatus.textContent = "Nenhum concorrente está abaixo do seu preço neste momento.";
  } else {
    headlineStatus.textContent = "Nenhuma listing ativa foi encontrada nessa carteira.";
  }
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
        ? `Concorrente ${formatAddress(competitor.accountAddress)} com anúncio abaixo do seu valor.`
        : "Você ainda segura o menor preço desse item.";

      return `
        <article class="item-card ${hasAlert ? "alert" : "safe"}">
          <div class="item-top">
            ${renderThumb(item)}

            <div class="item-copy">
              <div class="item-header">
                <span class="collection-chip">${escapeHtml(formatCollectionName(item.collectionName))}</span>
                <span class="state-pill ${hasAlert ? "alert" : "safe"}">
                  ${hasAlert ? "Em risco" : "Seguro"}
                </span>
              </div>

              <h3>${escapeHtml(item.name)}</h3>
            </div>

            <div class="item-toggle">
              ${buildToggle(item)}
            </div>
          </div>

          <div class="price-grid">
            <div class="price-box">
              <span>Seu preço</span>
              <strong>${priceText(item.ownFloorUsdDisplay)}</strong>
            </div>
            <div class="price-box">
              <span>Menor do mercado</span>
              <strong>${competitor ? priceText(competitor.buyAmountUsdDisplay) : "Sem undercut"}</strong>
            </div>
            <div class="price-box">
              <span>Diferença</span>
              <strong>${competitor ? priceText(competitor.priceDeltaUsdDisplay) : "$0.00"}</strong>
            </div>
          </div>

          <div class="item-foot">
            <div class="tags">
              <span class="tag">${item.ownListingCount} anúncio(s) seu(s)</span>
              <span class="tag">${item.marketListingCount || 0} anúncio(s) no mercado</span>
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
