import { buildSync } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "zarka-client-tests-"));
const sharedAlias = resolve(root, "../shared/src/index.ts");
const phaserShim = resolve(root, "scripts/empty-phaser-shim.cjs");
const suites = [
  { name: "tutorial-ui", entryPoint: "test/TutorialProgressController.test.ts" },
  {
    name: "chat-service",
    entryPoint: "test/ChatService.test.ts",
    define: {
      "import.meta.env": JSON.stringify({
        VITE_NAKAMA_HOST: "127.0.0.1",
        VITE_NAKAMA_PORT: "7350",
        VITE_NAKAMA_SSL: "false"
      })
    }
  },
  { name: "match-card", entryPoint: "test/MatchCardModel.test.ts" },
  {
    name: "my-matches",
    entryPoint: "test/MyMatchesListModel.test.ts",
    external: ["phaser", "phaser3spectorjs"]
  },
  {
    name: "public-matches",
    entryPoint: "test/PublicMatchesModel.test.ts",
    external: ["phaser", "phaser3spectorjs"]
  },
  {
    name: "push-notifications",
    entryPoint: "test/PushNotifications.test.ts",
    define: {
      "import.meta.env": JSON.stringify({
        BASE_URL: "/Zarka/",
        VITE_WEB_PUSH_VAPID_PUBLIC_KEY: "A".repeat(87)
      })
    },
    alias: { phaser: phaserShim, phaser3spectorjs: phaserShim }
  },
  {
    name: "crafting-catalog",
    entryPoint: "test/CraftingCatalogAndMetadata.test.ts"
  },
  {
    name: "chainsaw-action-warnings",
    entryPoint: "test/ChainsawActionWarnings.test.ts"
  },
  { name: "ranked-matchmaking", entryPoint: "test/RankedMatchmaking.test.ts" },
  { name: "loading-tips", entryPoint: "test/LoadingTips.test.ts" },
  { name: "replay-turn-loading", entryPoint: "test/ReplayTurnLoading.test.ts", alias: { phaser: phaserShim, phaser3spectorjs: phaserShim } },
  {
    name: "lobby-player-card",
    entryPoint: "test/LobbyPlayerCard.test.ts",
    alias: { phaser: phaserShim, phaser3spectorjs: phaserShim }
  }
];

try {
  const bundledTests = suites.map((suite) => {
    const { name, entryPoint, alias: suiteAlias, ...options } = suite;
    const outfile = join(temporary, `${name}.test.cjs`);
    buildSync({
      absWorkingDir: root,
      ...options,
      entryPoints: [entryPoint],
      outfile,
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node18",
      alias: { "@shared": sharedAlias, ...suiteAlias }
    });
    return outfile;
  });
  const testFiles = [
    ...bundledTests,
    join(root, "test/service-worker-notifications.test.mjs"),
    join(root, "scripts/smoke-login.mjs")
  ];
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", ...testFiles],
    { cwd: root, stdio: "inherit" }
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status === 0) {
    console.log("All client tests passed.");
  }
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
