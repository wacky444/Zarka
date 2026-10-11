import { buildSync } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "zarka-client-tests-"));
const run = (args, cwd = root) => {
  const result = spawnSync(process.execPath, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

try {
  const testScripts = [
    "test-tutorial-ui.mjs",
    "test-chat-service.mjs",
    "test-match-card.mjs",
    "test-my-matches.mjs",
    "test-public-matches.mjs",
    "test-push-notifications.mjs"
  ];
  for (const script of testScripts) run([join(root, "scripts", script)]);

  const rankedTest = join(temporary, "ranked-matchmaking.test.cjs");
  buildSync({
    absWorkingDir: root,
    entryPoints: ["test/RankedMatchmaking.test.ts"],
    outfile: rankedTest,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    alias: { "@shared": resolve(root, "../shared/src/index.ts") }
  });
  run(["--test", rankedTest]);
  run(["--test", join(root, "test/service-worker-notifications.test.mjs")]);
  run([join(root, "scripts/smoke-login.mjs")]);
  console.log("All client tests passed.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
