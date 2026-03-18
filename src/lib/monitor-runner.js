const path = require("path");

const { findCheaperCompetitor, loadGroupedListings, loadMarketListingsIndex } = require("./marketplace");
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

function getConfig(rootDir) {
  const config = readJson(getConfigPath(rootDir), getDefaultConfig());
  config.walletAddress = config.walletAddress || getDefaultConfig().walletAddress;
  config.pollIntervalMs = Number(config.pollIntervalMs || getDefaultConfig().pollIntervalMs);
  config.monitors = config.monitors && typeof config.monitors === "object" ? config.monitors : {};
  return config;
}

function saveConfig(rootDir, config) {
  writeJson(getConfigPath(rootDir), config);
}

function getState(rootDir) {
  const state = readJson(getStatePath(rootDir), { alerts: {} });
  state.alerts = state.alerts && typeof state.alerts === "object" ? state.alerts : {};
  return state;
}

function saveState(rootDir, state) {
  writeJson(getStatePath(rootDir), state);
}

function buildDashboardData({ config, items, lastRefreshAt, lastError, sentAlertsInLastRefresh }) {
  const undercutItems = items.filter((item) => item.cheaperCompetitor).length;
  const enabledItems = items.filter((item) => item.enabled).length;

  return {
    walletAddress: config.walletAddress,
    pollIntervalMs: config.pollIntervalMs,
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    telegramBotConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    telegramChatConfigured: Boolean(process.env.TELEGRAM_CHAT_ID),
    whatsappSupported: false,
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

  const signature = [
    item.cheaperCompetitor.orderId,
    item.cheaperCompetitor.buyAmountRaw,
    item.ownFloorPriceRaw,
  ].join(":");

  const previous = state.alerts[item.key];
  if (previous?.signature === signature) {
    return false;
  }

  const message = [
    "Alerta Immutable zkEVM",
    "",
    `Item: ${item.name}`,
    `ProductCode: ${item.productCode}`,
    `Sua menor listing: ${item.ownFloorPriceDisplay} ${item.buyTokenSymbol}`,
    `Mais barata do mercado: ${item.cheaperCompetitor.buyAmountDisplay} ${item.cheaperCompetitor.buyTokenSymbol}`,
    `Diferenca: ${item.cheaperCompetitor.priceDeltaDisplay} ${item.buyTokenSymbol}`,
    `Carteira monitorada: ${walletAddress}`,
    `Concorrente: ${item.cheaperCompetitor.accountAddress}`,
  ].join("\n");

  await sendTelegramMessage(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID, message);

  state.alerts[item.key] = {
    status: "alerted",
    signature,
    updatedAt: new Date().toISOString(),
  };

  return true;
}

async function runMonitorCycle(rootDir, options = {}) {
  const config = getConfig(rootDir);
  const groupedListings = await loadGroupedListings(config.walletAddress);
  const marketListingsIndex = await loadMarketListingsIndex(groupedListings);
  let configChanged = false;
  const items = [];

  for (const group of groupedListings) {
    if (!config.monitors[group.key]) {
      config.monitors[group.key] = { enabled: false };
      configChanged = true;
    }

    const marketListings = marketListingsIndex.get(group.key) || [];
    const cheaperCompetitor = findCheaperCompetitor(group, marketListings, config.walletAddress);

    items.push({
      ...group,
      enabled: Boolean(config.monitors[group.key]?.enabled),
      marketListingCount: marketListings.length,
      cheaperCompetitor,
    });
  }

  if (configChanged) {
    saveConfig(rootDir, config);
  }

  const state = getState(rootDir);
  let sentAlertsInLastRefresh = 0;

  if (options.sendAlerts !== false && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    for (const item of items) {
      if (await maybeSendAlert(item, state, config.walletAddress)) {
        sentAlertsInLastRefresh += 1;
      }
    }
  }

  saveState(rootDir, state);

  const result = {
    config,
    items,
    lastRefreshAt: new Date().toISOString(),
    lastError: null,
    sentAlertsInLastRefresh,
  };

  const dashboardData = buildDashboardData(result);
  if (options.writeDashboardFile !== false) {
    writeJson(getDashboardPath(rootDir), dashboardData);
  }

  return {
    ...result,
    dashboardData,
  };
}

module.exports = {
  buildDashboardData,
  getConfig,
  runMonitorCycle,
};
