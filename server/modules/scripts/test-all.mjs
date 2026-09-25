import { buildSync } from "esbuild";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testDir = join(root, "test");
const testFiles = readdirSync(testDir)
  .filter((file) => file.endsWith(".test.ts"))
  .sort();

const temporary = mkdtempSync(join(tmpdir(), "zarka-all-tests-"));
try {
  buildSync({
    absWorkingDir: root,
    entryPoints: testFiles.map((file) => join("test", file)),
    outdir: temporary,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    banner: {
      js: `
if (typeof window === "undefined") {
  globalThis.window = {
    cordova: undefined,
    navigator: { userAgent: "node" },
    addEventListener: () => {},
    removeEventListener: () => {}
  };
}
if (typeof Image === "undefined") {
  globalThis.Image = class {
    constructor() {
      this.src = "";
      this.width = 1;
      this.height = 1;
    }
  };
}
if (typeof HTMLCanvasElement === "undefined") {
  globalThis.HTMLCanvasElement = class HTMLCanvasElement {};
}
if (typeof HTMLVideoElement === "undefined") {
  globalThis.HTMLVideoElement = class HTMLVideoElement {};
}
if (typeof document === "undefined") {
  const dummyContext = {
    fillStyle: "",
    fillRect: () => {},
    getImageData: () => ({ data: [0, 0, 0, 0] }),
    putImageData: () => {},
    createImageData: () => ({ data: [] }),
    setTransform: () => {},
    drawImage: () => {}
  };
  globalThis.document = {
    createElement: () => ({
      getContext: () => dummyContext,
      style: {}
    }),
    documentElement: { style: {} },
    body: { style: {} }
  };
}
`
    },
    alias: {
      "@shared": resolve(root, "../../shared/src/index.ts"),
      "phaser": resolve(root, "scripts/empty-shim.cjs"),
      "phaser3spectorjs": resolve(root, "scripts/empty-shim.cjs")
    }
  });

  const builtFiles = testFiles.map((file) =>
    join(temporary, file.replace(/\.ts$/, ".js"))
  );

  const result = spawnSync(process.execPath, ["--test", ...builtFiles], {
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
