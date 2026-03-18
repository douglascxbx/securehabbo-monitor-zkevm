const path = require("path");

const { handleApiRequest } = require("../src/api-handler");
const { loadEnv } = require("../src/lib/env");

const rootDir = path.resolve(__dirname, "..");
loadEnv(rootDir);

module.exports = async (request, response) => {
  try {
    const handled = await handleApiRequest(request, response, rootDir);
    if (!handled) {
      response.statusCode = 404;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: "Not found" }, null, 2));
    }
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ ok: false, error: error.message }, null, 2));
  }
};
