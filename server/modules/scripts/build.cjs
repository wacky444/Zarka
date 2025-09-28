const path = require("path");
const fs = require("fs");
const { buildSync } = require("esbuild");

const rootDir = path.resolve(__dirname, "..");
const outDir = path.resolve(rootDir, "build");
const entryPoint = path.resolve(rootDir, "src", "main.ts");
const tsconfigPath = path.resolve(rootDir, "tsconfig.json");

if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

buildSync({
  entryPoints: [entryPoint],
  bundle: true,
  platform: "neutral",
  target: ["es2017"],
  format: "cjs",
  banner: {
    js: [
      "var __global = typeof globalThis !== 'undefined' ? globalThis : this;",
      "if (!__global.module) { __global.module = { exports: {} }; }",
      "if (!__global.module.exports) { __global.module.exports = {}; }",
      "var module = __global.module;",
      "var exports = module.exports;"
    ].join("\n"),
  },
  tsconfig: tsconfigPath,
  outfile: path.resolve(outDir, "main.js"),
  logLevel: "info",
});
