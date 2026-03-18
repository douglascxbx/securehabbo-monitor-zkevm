const { getConfig, runMonitorCycle, saveConfig } = require("./lib/monitor-runner");
const { listTelegramChats } = require("./lib/telegram");

const runtime = {
  dashboardData: null,
  refreshing: false,
};

function applyMonitorState(dashboardData, key, enabled) {
  if (!dashboardData || !Array.isArray(dashboardData.items)) {
    return dashboardData;
  }

  const items = dashboardData.items.map((item) => {
    if (item.key !== key) {
      return item;
    }

    return {
      ...item,
      enabled,
    };
  });

  const enabledItems = items.filter((item) => item.enabled).length;
  const undercutItems = items.filter((item) => item.cheaperCompetitor).length;

  return {
    ...dashboardData,
    items,
    totalItems: items.length,
    enabledItems,
    undercutItems,
    healthyItems: items.length - undercutItems,
  };
}

function isAuthorizedCronRequest(request) {
  const expectedSecret = String(process.env.CRON_SECRET || "").trim();
  if (!expectedSecret) {
    return true;
  }

  const headerValue = request.headers.authorization || request.headers.Authorization || "";
  return headerValue === `Bearer ${expectedSecret}`;
}

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function parseRequestBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      if (raw.length > 1_000_000) {
        reject(new Error("Body too large"));
      }
    });

    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function getDashboardAgeMs() {
  if (!runtime.dashboardData?.lastRefreshAt) {
    return Number.POSITIVE_INFINITY;
  }

  return Date.now() - new Date(runtime.dashboardData.lastRefreshAt).getTime();
}

async function refreshData(rootDir, sendAlerts = true) {
  if (runtime.refreshing) {
    return runtime.dashboardData;
  }

  runtime.refreshing = true;

  try {
    const result = await runMonitorCycle(rootDir, {
      sendAlerts,
      writeDashboardFile: true,
    });

    runtime.dashboardData = result.dashboardData;
    return runtime.dashboardData;
  } finally {
    runtime.refreshing = false;
  }
}

async function getFreshDashboard(rootDir, { force = false, sendAlerts = false } = {}) {
  const config = await getConfig(rootDir);
  const maxAgeMs = Number(config.pollIntervalMs || 180000);
  const shouldRefresh = force || !runtime.dashboardData || getDashboardAgeMs() > maxAgeMs + 15000;

  if (!shouldRefresh) {
    return runtime.dashboardData;
  }

  try {
    return await refreshData(rootDir, sendAlerts);
  } catch (error) {
    if (runtime.dashboardData) {
      return runtime.dashboardData;
    }

    throw error;
  }
}

async function handleApiRequest(request, response, rootDir) {
  const requestUrl = new URL(request.url, "http://localhost");

  if (!requestUrl.pathname.startsWith("/api/")) {
    return false;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/status") {
    const data = await getFreshDashboard(rootDir);
    jsonResponse(response, 200, data || { ...(await getConfig(rootDir)), refreshing: runtime.refreshing });
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/dashboard") {
    const data = await getFreshDashboard(rootDir);
    jsonResponse(response, 200, data);
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/items") {
    const data = await getFreshDashboard(rootDir);
    jsonResponse(response, 200, { items: data?.items || [] });
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/refresh") {
    const data = await refreshData(rootDir, true);
    jsonResponse(response, 200, { ok: true, status: data });
    return true;
  }

  if ((request.method === "GET" || request.method === "POST") && requestUrl.pathname === "/api/cron/monitor") {
    if (!isAuthorizedCronRequest(request)) {
      jsonResponse(response, 401, { ok: false, error: "Unauthorized cron request." });
      return true;
    }

    const data = await refreshData(rootDir, true);
    jsonResponse(response, 200, {
      ok: true,
      lastRefreshAt: data?.lastRefreshAt || null,
      totalItems: data?.totalItems || 0,
      enabledItems: data?.enabledItems || 0,
      undercutItems: data?.undercutItems || 0,
    });
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/telegram/chats") {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      jsonResponse(response, 400, {
        ok: false,
        error: "Preencha TELEGRAM_BOT_TOKEN no ambiente primeiro.",
      });
      return true;
    }

    const chats = await listTelegramChats(process.env.TELEGRAM_BOT_TOKEN);
    jsonResponse(response, 200, {
      ok: true,
      chats,
      message:
        chats.length > 0
          ? "Chats encontrados. Copie o ID desejado para TELEGRAM_CHAT_ID."
          : "Nenhum chat encontrado ainda. Envie uma mensagem para o bot no Telegram e tente novamente.",
    });
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/monitors") {
    const body = await parseRequestBody(request);
    const config = await getConfig(rootDir);

    if (!body.key) {
      jsonResponse(response, 400, { ok: false, error: "Item de monitoramento nao informado." });
      return true;
    }

    if (!config.monitors[body.key]) {
      config.monitors[body.key] = { enabled: false };
    }

    config.monitors[body.key].enabled = Boolean(body.enabled);
    await saveConfig(rootDir, config);

    const data = applyMonitorState(await refreshData(rootDir, false), body.key, Boolean(body.enabled));
    runtime.dashboardData = data;

    jsonResponse(response, 200, { ok: true, dashboard: data });
    return true;
  }

  jsonResponse(response, 404, { ok: false, error: "Rota de API nao encontrada." });
  return true;
}

module.exports = {
  getFreshDashboard,
  handleApiRequest,
  refreshData,
};
