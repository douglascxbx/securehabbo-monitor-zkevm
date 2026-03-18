const fs = require("fs");
const http = require("http");
const path = require("path");

const { handleApiRequest, refreshData } = require("./api-handler");
const { loadEnv } = require("./lib/env");
const { getConfig } = require("./lib/monitor-runner");

const rootDir = path.resolve(__dirname, "..");
loadEnv(rootDir);

const publicDir = path.join(rootDir, "public");

function textResponse(response, statusCode, payload, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
  });
  response.end(payload);
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
    if (await handleApiRequest(request, response, rootDir)) {
      return;
    }

    if (request.method === "GET") {
      const requestUrl = new URL(request.url, "http://localhost");
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
    textResponse(response, 500, JSON.stringify({ ok: false, error: error.message }, null, 2), "application/json; charset=utf-8");
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, async () => {
  console.log(`Immutable zkEVM monitor on http://localhost:${port}`);

  try {
    await refreshData(rootDir, false);
  } catch (error) {
    console.error("Initial refresh failed:", error.message);
  }

  const config = await getConfig(rootDir);
  setInterval(async () => {
    try {
      await refreshData(rootDir, true);
    } catch (error) {
      console.error("Scheduled refresh failed:", error.message);
    }
  }, Number(config.pollIntervalMs || 180000));
});
