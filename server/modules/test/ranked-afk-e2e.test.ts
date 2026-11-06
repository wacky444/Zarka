import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RANKED_MATCH_METADATA_KEY,
  type PlayerCharacter,
  type RankedMatchMetadata,
} from "@shared";
import type { MatchRecord } from "../src/models/types";
import { checkAndProcessRankedAfkForfeits } from "../src/match/rankedAfkForfeit";
import { resolveTurnForMatch } from "../src/match/turnResolution";
import { processBotActions } from "../src/match/botAI";
import { calculateRankedEloDeltas } from "../src/match/rankedElo";
import { createDefaultCharacter } from "../src/utils/playerCharacter";
import { createStorageService } from "../src/services/storageService";
import {
  isPlayerForfeited,
  isBotControlled,
  isActiveHumanPlayer,
} from "../src/utils/activityClock";
import { SERVER_USER_ID } from "../src/constants";

if (typeof (globalThis as unknown as { nkruntime?: unknown }).nkruntime === "undefined") {
  Object.assign(globalThis, {
    nkruntime: {
      Codes: {
        OK: 0,
        INVALID_ARGUMENT: 3,
        NOT_FOUND: 5,
        PERMISSION_DENIED: 7,
        FAILED_PRECONDITION: 9,
        ABORTED: 10,
        INTERNAL: 13,
      },
    },
  });
}

type Stored = {
  collection: string;
  key: string;
  userId: string;
  value: unknown;
  version: string;
};

type FakeUser = { id: string; username: string; metadata: Record<string, unknown> };

function createTestHarness(userIds: string[] = ["human-a", "human-b", "human-c"]) {
  const records = new Map<string, Stored>();
  const users = new Map<string, FakeUser>();
  let version = 0;
  const keyOf = (record: { collection: string; key: string; userId: string }) =>
    `${record.collection}:${record.userId}:${record.key}`;

  for (const userId of userIds) {
    users.set(userId, {
      id: userId,
      username: userId,
      metadata: {
        zarka: {
          tutorialCompleted: true,
          rankedMatchSlots: 1,
          stats: {
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            elo: 1000,
            highestElo: 1000,
            currentWinStreak: 0,
            bestWinStreak: 0,
            rankTier: "unranked",
          },
        },
      },
    });
  }

  const nk = {
    storageRead: (requests: Array<{ collection: string; key: string; userId: string }>) =>
      requests.flatMap((request) => {
        const value = records.get(keyOf(request));
        return value
          ? [{ ...value, value: JSON.parse(JSON.stringify(value.value)) }]
          : [];
      }),
    storageWrite: (requests: Array<{
      collection: string;
      key: string;
      userId: string;
      value: unknown;
      version?: string;
    }>) => {
      for (const request of requests) {
        const existing = records.get(keyOf(request));
        const expected =
          request.version === "" || request.version === "*"
            ? undefined
            : request.version;
        if (request.version !== undefined && expected !== existing?.version) {
          throw new Error("version conflict");
        }
      }
      for (const request of requests) {
        const record: Stored = {
          collection: request.collection,
          key: request.key,
          userId: request.userId,
          value: JSON.parse(JSON.stringify(request.value)),
          version: String(++version),
        };
        records.set(keyOf(record), record);
      }
    },
    storageList: (userId: string, collection: string, limit = 100, cursor = "") => {
      const start = Number.parseInt(cursor || "0", 10) || 0;
      const matching = Array.from(records.values())
        .filter((record) => record.userId === userId && record.collection === collection)
        .sort((a, b) => a.key.localeCompare(b.key));
      const objects = matching.slice(start, start + limit).map((obj) => ({
        ...obj,
        value: JSON.parse(JSON.stringify(obj.value)),
      }));
      const next = start + limit < matching.length ? String(start + limit) : "";
      return { objects, cursor: next };
    },
    storageDelete: (requests: Array<{ collection: string; key: string; userId: string }>) => {
      for (const request of requests) records.delete(keyOf(request));
    },
    usersGetId: (ids: string[]) =>
      ids.flatMap((id) => {
        const user = users.get(id);
        return user ? [user] : [];
      }),
    accountUpdateId: (
      userId: string,
      _username: unknown,
      _displayName: unknown,
      _timezone: unknown,
      _location: unknown,
      _langTag: unknown,
      _avatarUrl: unknown,
      metadata: unknown,
    ) => {
      const user = users.get(userId);
      if (!user) throw new Error("missing user");
      user.metadata = metadata as Record<string, unknown>;
    },
    uuidv4: () => `uuid-${++version}`,
    matchCreate: () => "mock_runtime_match_id",
    matchList: () => [],
    matchSignal: () => {},
  } as unknown as nkruntime.Nakama;

  const logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as nkruntime.Logger;

  return { nk, logger, users, records };
}

function createCharacter(id: string, name: string, overrides: Partial<PlayerCharacter> = {}): PlayerCharacter {
  const base = createDefaultCharacter(id, name, {
    health: { current: 10, max: 10 },
    energy: { current: 10, max: 10 },
    focus: { current: 5, max: 5 },
  });
  return {
    ...base,
    location: { q: 0, r: 0 },
    ...overrides,
  };
}

function createRankedMatch(
  players: string[],
  characters: Record<string, PlayerCharacter>,
  overrides: Partial<MatchRecord> = {},
): MatchRecord {
  const eloSnapshots: Record<string, number> = {};
  for (const p of players) {
    if (!p.startsWith("bot")) {
      eloSnapshots[p] = 1000;
    }
  }

  const rankedMetadata: RankedMatchMetadata = {
    seasonId: "season_1",
    queueMode: "1v1",
    targetSize: players.length,
    humanCount: players.filter((p) => !p.startsWith("bot")).length,
    botCount: players.filter((p) => p.startsWith("bot")).length,
    eloSnapshots,
    placements: [],
  };

  return {
    match_id: "ranked_match_e2e_1",
    name: "Ranked E2E Match",
    creator: SERVER_USER_ID,
    created_at: 1000,
    started_at: 1000,
    started: true,
    removed: 0,
    current_turn: 1,
    size: players.length,
    cols: 5,
    rows: 5,
    roundTime: "24h",
    autoSkip: true,
    botPlayers: players.filter((p) => p.startsWith("bot")).length,
    players: [...players],
    order: [...players],
    playerList: Object.fromEntries(players.map((p) => [p, true])),
    readyStates: Object.fromEntries(players.map((p) => [p, false])),
    playerCharacters: characters,
    deadCharacters: {},
    metadata: {
      [RANKED_MATCH_METADATA_KEY]: rankedMetadata,
    },
    ...overrides,
  } as MatchRecord;
}

test("3-AFK forfeit and bot substitution: player reaching 3 consecutive AFK turns is forfeited, remains in players/eloSnapshots, and botAI takes over", () => {
  const { nk, logger } = createTestHarness(["human-a", "human-b"]);
  const storage = createStorageService(nk);

  const charA = createCharacter("human-a", "Player A");
  charA.progression = { level: 2, experience: 0, availableSkillPoints: 1, skills: {} };
  const charB = createCharacter("human-b", "Player B");
  const bot1 = createCharacter("bot1", "Bot 1");
  const bot2 = createCharacter("bot2", "Bot 2");

  const match = createRankedMatch(["human-a", "human-b", "bot1", "bot2"], {
    "human-a": charA,
    "human-b": charB,
    "bot1": bot1,
    "bot2": bot2,
  });
  storage.writeMatch(match);

  // Turn 1 auto-advance: human-a is unready
  match.readyStates["human-a"] = false;
  match.readyStates["human-b"] = true;
  const res1 = resolveTurnForMatch(match, logger, nk, { isAutoAdvance: true });
  assert.equal(res1.advanced, true);
  assert.equal(match.consecutive_afk_turns?.["human-a"], 1);
  assert.equal(isPlayerForfeited(match, "human-a"), false);
  assert.equal(isBotControlled(match, "human-a"), false);

  // Turn 2 auto-advance: human-a is unready
  match.readyStates["human-a"] = false;
  match.readyStates["human-b"] = true;
  const res2 = resolveTurnForMatch(match, logger, nk, { isAutoAdvance: true });
  assert.equal(res2.advanced, true);
  assert.equal(match.consecutive_afk_turns?.["human-a"], 2);
  assert.equal(isPlayerForfeited(match, "human-a"), false);

  // Turn 3 auto-advance: human-a reaches 3rd consecutive AFK turn
  match.readyStates["human-a"] = false;
  match.readyStates["human-b"] = true;
  const res3 = resolveTurnForMatch(match, logger, nk, { isAutoAdvance: true });
  assert.equal(res3.advanced, true);
  assert.equal(match.consecutive_afk_turns?.["human-a"], 3);

  // 1. Forfeited player marked in forfeited_players
  assert.equal(match.forfeited_players?.["human-a"], true);
  assert.equal(isPlayerForfeited(match, "human-a"), true);

  // 2. userId remains in players array and eloSnapshots
  assert.ok(match.players.includes("human-a"));
  const rankedMeta = match.metadata?.[RANKED_MATCH_METADATA_KEY] as RankedMatchMetadata;
  assert.equal(rankedMeta.eloSnapshots["human-a"], 1000);

  // 3. Identified as bot controlled
  assert.equal(isBotControlled(match, "human-a"), true);
  assert.equal(isActiveHumanPlayer(match, "human-a"), false);

  // 4. In subsequent turn, botAI plans actions and progression for human-a
  match.playerCharacters["human-a"].progression = {
    level: 2,
    experience: 0,
    availableSkillPoints: 2,
    skills: {},
  };
  processBotActions(match, logger);
  assert.equal(
    match.playerCharacters["human-a"].progression.availableSkillPoints,
    0,
    "botAI should have spent skill points for the bot-controlled forfeited human"
  );
});

test("Multi-human match continuation: if >= 2 active humans remain alive after a forfeit, match continues running with bot controller", () => {
  const { nk, logger } = createTestHarness(["human-a", "human-b", "human-c"]);
  const storage = createStorageService(nk);

  const charA = createCharacter("human-a", "Player A");
  const charB = createCharacter("human-b", "Player B");
  const charC = createCharacter("human-c", "Player C");
  const bot1 = createCharacter("bot1", "Bot 1");

  const match = createRankedMatch(["human-a", "human-b", "human-c", "bot1"], {
    "human-a": charA,
    "human-b": charB,
    "human-c": charC,
    "bot1": bot1,
  }, {
    consecutive_afk_turns: {
      "human-a": 3,
      "human-b": 0,
      "human-c": 0,
    },
    current_turn: 2,
  });
  storage.writeMatch(match);

  // Check forfeits: human-a forfeits, but human-b and human-c are still active humans
  const result = checkAndProcessRankedAfkForfeits(match, nk, logger, [], 2);
  assert.deepEqual(result.forfeitedPlayerIds, ["human-a"]);
  assert.equal(result.matchEnded, false);

  // Match continues running
  assert.equal(match.started, true);
  assert.equal(match.removed, 0);

  // human-a's forfeit placement recorded
  const rankedMeta = match.metadata?.[RANKED_MATCH_METADATA_KEY] as RankedMatchMetadata;
  const placementA = rankedMeta.placements?.find((p) => p.teamId === "solo_human-a");
  assert.ok(placementA);
  assert.equal(placementA.eliminated, true);
  assert.equal(placementA.place, 4);

  // Remaining humans are active
  assert.equal(isActiveHumanPlayer(match, "human-b"), true);
  assert.equal(isActiveHumanPlayer(match, "human-c"), true);
  assert.equal(isActiveHumanPlayer(match, "human-a"), false);

  // Turn resolution continues with bot controller for human-a
  match.readyStates["human-b"] = true;
  match.readyStates["human-c"] = true;
  const nextTurnResult = resolveTurnForMatch(match, logger, nk);
  assert.equal(nextTurnResult.advanced, true);
  assert.equal(match.current_turn, 3);
  assert.equal(match.started, true);
});

test("Sole remaining human victory with living bots: if forfeit leaves exactly 1 active human while bots are alive, match immediately terminates with sole human win", () => {
  const { nk, logger, users } = createTestHarness(["human-a", "human-b"]);
  const storage = createStorageService(nk);

  const charA = createCharacter("human-a", "Player A");
  const charB = createCharacter("human-b", "Player B");
  const bot1 = createCharacter("bot1", "Bot 1");
  const bot2 = createCharacter("bot2", "Bot 2");

  // All 4 characters are fully ALIVE (health = 10)
  assert.equal(charA.stats.health.current, 10);
  assert.equal(charB.stats.health.current, 10);
  assert.equal(bot1.stats.health.current, 10);
  assert.equal(bot2.stats.health.current, 10);

  const match = createRankedMatch(["human-a", "human-b", "bot1", "bot2"], {
    "human-a": charA,
    "human-b": charB,
    "bot1": bot1,
    "bot2": bot2,
  }, {
    consecutive_afk_turns: {
      "human-a": 0,
      "human-b": 3,
    },
    current_turn: 2,
    readyStates: {
      "human-a": true,
      "human-b": false,
      "bot1": true,
      "bot2": true,
    },
  });
  storage.writeMatch(match);

  // Resolve turn or check forfeits
  const result = checkAndProcessRankedAfkForfeits(match, nk, logger, [], 2);

  // 1. Match immediately terminates
  assert.equal(result.matchEnded, true);
  assert.equal(result.outcome?.ended, true);
  assert.equal(result.outcome?.winnerId, "human-a");
  assert.equal(match.started, false);
  assert.equal(match.removed, 1);

  // 2. Complete placements assigned for ALL 4 teams
  const rankedMeta = match.metadata?.[RANKED_MATCH_METADATA_KEY] as RankedMatchMetadata;
  assert.equal(rankedMeta.placements?.length, 4);

  const placeA = rankedMeta.placements?.find((p) => p.teamId === "solo_human-a");
  assert.ok(placeA);
  assert.equal(placeA.place, 1);
  assert.equal(placeA.eliminated, false);

  const placeBot1 = rankedMeta.placements?.find((p) => p.teamId === "solo_bot1");
  const placeBot2 = rankedMeta.placements?.find((p) => p.teamId === "solo_bot2");
  const placeB = rankedMeta.placements?.find((p) => p.teamId === "solo_human-b");

  assert.ok(placeBot1 && placeBot2 && placeB);
  // Living bots ordered ahead of the forfeited human leaver
  assert.ok(placeBot1.place < placeB.place);
  assert.ok(placeBot2.place < placeB.place);
  assert.equal(placeB.place, 4);
  assert.equal(placeB.eliminated, true);

  // 3. MatchReport exists with winning_team_id
  const report = storage.getMatchReport(match.match_id);
  assert.ok(report);
  assert.equal(report.winning_team_id, "solo_human-a");
  assert.ok(report.winning_character_ids?.includes("human-a"));

  // 4. Immediate Elo settlement applied: winner gains, leaver loses
  const userA = users.get("human-a")!;
  const userB = users.get("human-b")!;
  const statsA = (userA.metadata.zarka as { stats: { wins: number; elo: number; matchesPlayed: number } }).stats;
  const statsB = (userB.metadata.zarka as { stats: { losses: number; elo: number; matchesPlayed: number } }).stats;

  assert.equal(statsA.wins, 1);
  assert.equal(statsA.matchesPlayed, 1);
  assert.ok(statsA.elo > 1000, `Sole human winner should gain Elo: got ${statsA.elo}`);

  assert.equal(statsB.losses, 1);
  assert.equal(statsB.matchesPlayed, 1);
  assert.ok(statsB.elo < 1000, `Forfeited leaver should lose Elo: got ${statsB.elo}`);
});

test("Immediate Elo settlement: full end-to-end turn resolution triggers ranked forfeit, match report, and Elo settlement update", () => {
  const { nk, logger, users } = createTestHarness(["human-a", "human-b"]);
  const storage = createStorageService(nk);

  const charA = createCharacter("human-a", "Player A");
  const charB = createCharacter("human-b", "Player B");

  const match = createRankedMatch(["human-a", "human-b"], {
    "human-a": charA,
    "human-b": charB,
  }, {
    consecutive_afk_turns: {
      "human-a": 0,
      "human-b": 2, // 2 afk turns already
    },
    current_turn: 2,
    readyStates: {
      "human-a": true,
      "human-b": false,
    },
  });
  storage.writeMatch(match);

  // Turn 3 auto-advance: human-b reaches 3rd consecutive AFK turn during turn resolution
  const turnResult = resolveTurnForMatch(match, logger, nk, { isAutoAdvance: true });

  assert.equal(turnResult.advanced, true);
  assert.equal(match.consecutive_afk_turns?.["human-b"], 3);
  assert.equal(match.forfeited_players?.["human-b"], true);
  assert.equal(match.started, false);
  assert.equal(match.removed, 1);

  // Match report generated with human-a as winner
  const report = storage.getMatchReport(match.match_id);
  assert.ok(report);
  assert.equal(report.winning_team_id, "solo_human-a");

  // User stats updated with Elo deltas
  const statsA = (users.get("human-a")!.metadata.zarka as { stats: { wins: number; elo: number } }).stats;
  const statsB = (users.get("human-b")!.metadata.zarka as { stats: { losses: number; elo: number } }).stats;
  assert.equal(statsA.wins, 1);
  assert.ok(statsA.elo > 1000);
  assert.equal(statsB.losses, 1);
  assert.ok(statsB.elo < 1000);
});
