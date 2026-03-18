const path = require("path");

const { findCheaperCompetitor, loadGroupedListings, loadMarketListingsIndex } = require("./marketplace");
const { enrichItemWithUsdValues, fetchEthUsdPrice, formatUsd } = require("./pricing");
const { readJson, writeJson } = require("./store");
const { sendTelegramMessage } = require("./telegram");

function getDefaultConfig() {
  return {
    walletAddress: process.env.WALLET_ADDRESS || "0xea869164a6d5fc0b52c347562e08e82e503bcd48",
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 180000),
    monitors: {},
  };
}

function getConfigPath(rootDir) {
  return path.join(rootDir, "data", "config.json");
}

function getStatePath(rootDir) {
  return path.join(rootDir, "data", "state.json");
}

function getDashboardPath(rootDir) {
  return path.join(rootDir, "public", "dashboard-data.json");
}

async function getConfig(rootDir) {
  const config = await readJson(getConfigPath(rootDir), getDefaultConfig());
  config.walletAddress = config.walletAddress || getDefaultConfig().walletAddress;
  config.pollIntervalMs = Number(config.pollIntervalMs || getDefaultConfig().pollIntervalMs);
  config.monitors = config.monitors && typeof config.monitors === "object" ? config.monitors : {};
  return config;
}

async function saveConfig(rootDir, config) {
  await writeJson(getConfigPath(rootDir), config);
}

async function getState(rootDir) {
  const state = await readJson(getStatePath(rootDir), { alerts: {}, priceHistory: [] });
  state.alerts = state.alerts && typeof state.alerts === "object" ? state.alerts : {};
  state.priceHistory = Array.isArray(state.priceHistory) ? state.priceHistory : [];
  return state;
}

async function saveState(rootDir, state) {
  await writeJson(getStatePath(rootDir), state);
}

function updatePriceHistory(state, ethUsdPrice) {
  if (!ethUsdPrice) {
    return state.priceHistory;
  }

  const nextEntry = {
    amount: Number(ethUsdPrice.amount),
    fetchedAt: ethUsdPrice.fetchedAt,
  };

  const history = [...state.priceHistory];
  const previous = history[history.length - 1];
  if (!previous || previous.fetchedAt !== nextEntry.fetchedAt) {
    history.push(nextEntry);
  }

  return history.slice(-24);
}

function buildDashboardData({ config, items, pricing, lastRefreshAt, lastError, sentAlertsInLastRefresh }) {
  const undercutItems = items.filter((item) => item.cheaperCompetitor).length;
  const enabledItems = items.filter((item) => item.enabled).length;

  return {
    walletAddress: config.walletAddress,
    pollIntervalMs: config.pollIntervalMs,
    pricing,
    lastRefreshAt,
    lastError,
    refreshing: false,
    totalItems: items.length,
    enabledItems,
    undercutItems,
    healthyItems: items.length - undercutItems,
    sentAlertsInLastRefresh,
    items,
  };
}

async function maybeSendAlert(item, state, walletAddress) {
  if (!item.enabled || !item.cheaperCompetitor) {
    state.alerts[item.key] = {
      status: "clear",
      signature: null,
      updatedAt: new Date().toISOString(),
    };
    return false;
  }

  const signature = [item.cheaperCompetitor.orderId, item.cheaperCompetitor.buyAmountRaw, item.ownFloorPriceRaw].join(":");
  const previous = state.alerts[item.key];

  if (previous?.signature === signature) {
    return false;
  }

  const ownPrice = item.ownFloorUsdDisplay !== "-" ? item.ownFloorUsdDisplay : `${item.ownFloorPriceDisplay} ${item.buyTokenSymbol}`;
  const marketPrice =
    item.cheaperCompetitor.buyAmountUsdDisplay !== "-"
      ? item.cheaperCompetitor.buyAmountUsdDisplay
      : `${item.cheaperCompetitor.buyAmountDisplay} ${item.cheaperCompetitor.buyTokenSymbol}`;
  const difference =
    item.cheaperCompetitor.priceDeltaUsdDisplay !== "-"
      ? item.cheaperCompetitor.priceDeltaUsdDisplay
      : `${item.cheaperCompetitor.priceDeltaDisplay} ${item.buyTokenSymbol}`;

  const divider = "\u2501".repeat(19);
  const message = [
    "\ud83d\udea8 *ALERTA \u2014 Immutable zkEVM*",
    "",
    divider,
    "\ud83c\udfaf *Item*",
    item.name,
    "",
    "\ud83d\udcb0 *Sua listing*",
    ownPrice,
    "",
    "\ud83d\udcc9 *Menor pre\u00e7o*",
    marketPrice,
    "",
    "\u2696\ufe0f *Diferen\u00e7a*",
    `- ${difference}`,
    "",
    divider,
    "\ud83d\udc40 *Status*",
    "Acima do menor pre\u00e7o do mercado",
    "Ajuste recomendado para competir",
    "",
    divider,
    "\ud83e\uddfe *Sua carteira:*",
    `\`${walletAddress}\``,
    "",
    "\ud83e\udd47 *Concorrente com o menor pre\u00e7o:*",
    `\`${item.cheaperCompetitor.accountAddress}\``,
    divider,
  ].join("\n");

  await sendTelegramMessage(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID, message, {
    imageUrl: item.imageUrl,
    parseMode: "Markdown",
  });

  state.alerts[item.key] = {
    status: "alerted",
    signature,
    updatedAt: new Date().toISOString(),
  };

  return true;
}

async function runMonitorCycle(rootDir, options = {}) {
  const config = await getConfig(rootDir);
  const groupedListings = await loadGroupedListings(config.walletAddress);
  const marketListingsIndex = await loadMarketListingsIndex(groupedListings);
  const ethUsdPrice = await fetchEthUsdPrice().catch(() => null);
  let configChanged = false;
  const items = [];

  for (const group of groupedListings) {
    if (!config.monitors[group.key]) {
      config.monitors[group.key] = { enabled: false };
      configChanged = true;
    }

    const marketListings = marketListingsIndex.get(group.key) || [];
    const cheaperCompetitor = findCheaperCompetitor(group, marketListings, config.walletAddress);

    const enrichedItem = enrichItemWithUsdValues(
      {
        ...group,
        enabled: Boolean(config.monitors[group.key]?.enabled),
        marketListingCount: marketListings.length,
        cheaperCompetitor,
      },
      ethUsdPrice
    );

    items.push({
      ...group,
      ...enrichedItem,
    });
  }

  if (configChanged) {
    await saveConfig(rootDir, config);
  }

  const state = await getState(rootDir);
  state.priceHistory = updatePriceHistory(state, ethUsdPrice);
  let sentAlertsInLastRefresh = 0;

  if (options.sendAlerts !== false && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    for (const item of items) {
      if (await maybeSendAlert(item, state, config.walletAddress)) {
        sentAlertsInLastRefresh += 1;
      }
    }
  }

  await saveState(rootDir, state);

  const result = {
    config,
    items,
    pricing: ethUsdPrice
      ? {
          pair: ethUsdPrice.pair,
          source: ethUsdPrice.source,
          ethUsd: ethUsdPrice.amount,
          ethUsdDisplay: formatUsd(ethUsdPrice.amount),
          fetchedAt: ethUsdPrice.fetchedAt,
          history: state.priceHistory,
        }
      : null,
    lastRefreshAt: new Date().toISOString(),
    lastError: null,
    sentAlertsInLastRefresh,
  };

  const dashboardData = buildDashboardData(result);
  if (options.writeDashboardFile !== false) {
    await writeJson(getDashboardPath(rootDir), dashboardData);
  }

  return {
    ...result,
    dashboardData,
  };
}

module.exports = {
  buildDashboardData,
  getConfig,
  saveConfig,
  runMonitorCycle,
};
