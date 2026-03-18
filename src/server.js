const fs = require("fs");
const http = require("http");
const path = require("path");

const { loadEnv } = require("./lib/env");
const { getConfig, runMonitorCycle } = require("./lib/monitor-runner");
const { listTelegramChats, sendTelegramMessage } = require("./lib/telegram");

const rootDir = path.resolve(__dirname, "..");
loadEnv(rootDir);

const publicDir = path.join(rootDir, "public");

const runtime = {
  dashboardData: null,
  refreshing: false,
};

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function textResponse(response, statusCode, payload, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
  });
  response.end(payload);
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

async function refreshData(sendAlerts = true) {
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

function getStaticFile(filePath) {
  const targetPath = filePath === "/" ? "/index.html" : filePath;
  const resolved = path.join(publicDir, targetPath.replace(/^\/+/, ""));

  if (!resolved.startsWith(publicDir) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    return null;
  }

  return resolved;
}

function getContentType(filePath) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }

  return "text/plain; charset=utf-8";
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, "http://localhost");

    if (request.method === "GET" && requestUrl.pathname === "/api/status") {
      jsonResponse(response, 200, runtime.dashboardData || { ...getConfig(rootDir), refreshing: runtime.refreshing });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/items") {
      jsonResponse(response, 200, {
        items: runtime.dashboardData?.items || [],
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/refresh") {
      const data = await refreshData(true);
      jsonResponse(response, 200, { ok: true, status: data });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/test-telegram") {
      if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
        jsonResponse(response, 400, {
          ok: false,
          error: "Preencha TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no arquivo .env primeiro.",
        });
        return;
      }

      await sendTelegramMessage(
        process.env.TELEGRAM_BOT_TOKEN,
        process.env.TELEGRAM_CHAT_ID,
        "Teste do monitor SecureHabbo: o envio pelo Telegram esta funcionando."
      );

      jsonResponse(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/telegram/chats") {
      if (!process.env.TELEGRAM_BOT_TOKEN) {
        jsonResponse(response, 400, {
          ok: false,
          error: "Preencha TELEGRAM_BOT_TOKEN no .env primeiro.",
        });
        return;
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
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/monitors") {
      const body = await parseRequestBody(request);
      const config = getConfig(rootDir);

      if (!body.key || !config.monitors[body.key]) {
        jsonResponse(response, 404, { ok: false, error: "Monitor nao encontrado." });
        return;
      }

      config.monitors[body.key].enabled = Boolean(body.enabled);
      fs.writeFileSync(path.join(rootDir, "data", "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
      await refreshData(false);

      jsonResponse(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET") {
      const filePath = getStaticFile(requestUrl.pathname);
      if (!filePath) {
        textResponse(response, 404, "Not found");
        return;
      }

      textResponse(response, 200, fs.readFileSync(filePath), getContentType(filePath));
      return;
    }

    textResponse(response, 405, "Method not allowed");
  } catch (error) {
    jsonResponse(response, 500, { ok: false, error: error.message });
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, async () => {
  console.log(`SecureHabbo monitor on http://localhost:${port}`);

  try {
    await refreshData(false);
  } catch (error) {
    console.error("Initial refresh failed:", error.message);
  }

  setInterval(async () => {
    try {
      await refreshData(true);
    } catch (error) {
      console.error("Scheduled refresh failed:", error.message);
    }
  }, getConfig(rootDir).pollIntervalMs);
});
