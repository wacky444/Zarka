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
      "var exports = module.exports;",
      "var nkruntime = __global.nkruntime || {",
      "  Codes: {",
      "    OK: 0,",
      "    CANCELLED: 1,",
      "    UNKNOWN: 2,",
      "    INVALID_ARGUMENT: 3,",
      "    DEADLINE_EXCEEDED: 4,",
      "    NOT_FOUND: 5,",
      "    ALREADY_EXISTS: 6,",
      "    PERMISSION_DENIED: 7,",
      "    RESOURCE_EXHAUSTED: 8,",
      "    FAILED_PRECONDITION: 9,",
      "    ABORTED: 10,",
      "    OUT_OF_RANGE: 11,",
      "    UNIMPLEMENTED: 12,",
      "    INTERNAL: 13,",
      "    UNAVAILABLE: 14,",
      "    DATA_LOSS: 15,",
      "    UNAUTHENTICATED: 16",
      "  }",
      "};",
      "__global.nkruntime = nkruntime;"
    ].join("\n")
  },
  tsconfig: tsconfigPath,
  outfile: path.resolve(outDir, "main.js"),
  logLevel: "info"
});
