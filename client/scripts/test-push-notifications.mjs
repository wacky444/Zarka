import { buildSync } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "zarka-push-client-"));
try {
  const outfile = join(temporary, "push-notifications.test.cjs");
  buildSync({
    absWorkingDir: root,
    entryPoints: ["test/PushNotifications.test.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    define: {
      "import.meta.env": JSON.stringify({
        BASE_URL: "/Zarka/",
        VITE_WEB_PUSH_VAPID_PUBLIC_KEY: "A".repeat(87)
      })
    },
    alias: {
      phaser: resolve(root, "scripts/empty-phaser-shim.cjs"),
      phaser3spectorjs: resolve(root, "scripts/empty-phaser-shim.cjs")
    }
  });
  const result = spawnSync(process.execPath, ["--test", outfile], {
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
