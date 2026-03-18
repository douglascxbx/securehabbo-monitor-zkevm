const path = require("path");
const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react");

module.exports = defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "frontend"),
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "public"),
    emptyOutDir: false,
    assetsDir: "assets",
  },
});
