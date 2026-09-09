import { buildSync } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "zarka-perception6-"));
try {
  const outfile = join(temporary, "perception6.test.cjs");
  buildSync({
    absWorkingDir: root,
    entryPoints: ["test/perception6.test.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    alias: { "@shared": resolve(root, "../../shared/src/index.ts") }
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
