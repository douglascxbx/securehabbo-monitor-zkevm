const fs = require("fs");
const path = require("path");

function ensureJsonFile(filePath, fallbackValue) {
  if (fs.existsSync(filePath)) {
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(fallbackValue, null, 2)}\n`, "utf8");
}

function readJson(filePath, fallbackValue) {
  ensureJsonFile(filePath, fallbackValue);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

module.exports = {
  readJson,
  writeJson,
};
