import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RANKED_MATCH_METADATA_KEY,
  TUTORIAL_MATCH_METADATA_KEY,
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
import { isPlayerForfeited, isBotControlled } from "../src/utils/activityClock";
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

function createTestHarness(userIds: string[] = ["human-a", "human-b"]) {
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
        return value ? [{ ...value }] : [];
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
          value: request.value,
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
      const objects = matching.slice(start, start + limit);
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
    match_id: "ranked_match_1",
    created_at: 1000,
    started_at: 1000,
    started: true,
    removed: 0,
    current_turn: 1,
    size: players.length,
    players,
    playerCharacters: characters,
    playerList: Object.fromEntries(players.map((p) => [p, true])),
    readyStates: Object.fromEntries(players.map((p) => [p, false])),
    metadata: {
      [RANKED_MATCH_METADATA_KEY]: rankedMetadata,
    },
    ...overrides,
  } as MatchRecord;
}

test("Player marked forfeited at 3 consecutive AFK turns and controlled by botAI while retaining userId", () => {
  const { nk, logger } = createTestHarness(["human-a", "human-b"]);
  const charA = createCharacter("human-a", "Player A");
  const charB = createCharacter("human-b", "Player B");
  charA.progression = { level: 2, experience: 0, availableSkillPoints: 1, skills: {} };

  const match = createRankedMatch(["human-a", "human-b"], {
    "human-a": charA,
    "human-b": charB,
  }, {
    consecutive_afk_turns: {
      "human-a": 3,
      "human-b": 0,
    },
  });

  const result = checkAndProcessRankedAfkForfeits(match, nk, logger, [], 1);
  assert.ok(result.forfeitedPlayerIds.includes("human-a"));
  assert.equal(isPlayerForfeited(match, "human-a"), true);
  assert.equal(isBotControlled(match, "human-a"), true);

  // userId retained in players and playerCharacters
  assert.ok(match.players.includes("human-a"));
  assert.ok(match.playerCharacters["human-a"]);
  const rankedMeta = match.metadata?.[RANKED_MATCH_METADATA_KEY] as RankedMatchMetadata;
  assert.equal(rankedMeta.eloSnapshots["human-a"], 1000);

  // Bot AI assigns progression/skills to the forfeited character
  processBotActions(match, logger);
  assert.equal(match.playerCharacters["human-a"].progression?.availableSkillPoints, 0);
});

test("Multi-human match continues after 1 player is forfeited to bot control", () => {
  const { nk, logger } = createTestHarness(["human-a", "human-b", "human-c"]);
  const charA = createCharacter("human-a", "Player A");
  const charB = createCharacter("human-b", "Player B");
  const charC = createCharacter("human-c", "Player C");

  const match = createRankedMatch(["human-a", "human-b", "human-c"], {
    "human-a": charA,
    "human-b": charB,
    "human-c": charC,
  }, {
    consecutive_afk_turns: {
      "human-a": 3,
      "human-b": 0,
      "human-c": 0,
    },
  });

  const result = checkAndProcessRankedAfkForfeits(match, nk, logger, [], 1);
  assert.deepEqual(result.forfeitedPlayerIds, ["human-a"]);
  assert.equal(result.matchEnded, false);
  assert.equal(match.removed, 0);
  assert.equal(match.started, true);

  // Team forfeit recorded for human-a
  const rankedMeta = match.metadata?.[RANKED_MATCH_METADATA_KEY] as RankedMatchMetadata;
  const placementA = rankedMeta.placements?.find((p) => p.teamId === "solo_human-a");
  assert.ok(placementA);
  assert.equal(placementA.eliminated, true);
  assert.equal(placementA.place, 3);
});

test("Single remaining human triggers immediate 1st place win, valid MatchReport, and complete Elo settlement", () => {
  const { nk, logger, users } = createTestHarness(["human-a", "human-b"]);
  const charA = createCharacter("human-a", "Player A");
  const charB = createCharacter("human-b", "Player B");
  const botChar1 = createCharacter("bot1", "Bot 1");
  const botChar2 = createCharacter("bot2", "Bot 2");

  // Bots and human-b are still alive (health = 10)
  const match = createRankedMatch(["human-a", "human-b", "bot1", "bot2"], {
    "human-a": charA,
    "human-b": charB,
    "bot1": botChar1,
    "bot2": botChar2,
  }, {
    consecutive_afk_turns: {
      "human-a": 0,
      "human-b": 3,
    },
  });

  const result = checkAndProcessRankedAfkForfeits(match, nk, logger, [], 3);
  assert.equal(result.matchEnded, true);
  assert.equal(result.outcome?.ended, true);
  assert.equal(result.outcome?.winnerId, "human-a");
  assert.equal(match.removed, 1);
  assert.equal(match.started, false);

  // Placements check: complete placement for all 4 teams
  const rankedMeta = match.metadata?.[RANKED_MATCH_METADATA_KEY] as RankedMatchMetadata;
  assert.equal(rankedMeta.placements?.length, 4);
  const placeA = rankedMeta.placements?.find((p) => p.teamId === "solo_human-a");
  assert.equal(placeA?.place, 1);
  assert.equal(placeA?.eliminated, false);

  // Living bots ordered ahead of forfeited human-b
  const placeBot1 = rankedMeta.placements?.find((p) => p.teamId === "solo_bot1");
  const placeBot2 = rankedMeta.placements?.find((p) => p.teamId === "solo_bot2");
  const placeB = rankedMeta.placements?.find((p) => p.teamId === "solo_human-b");

  assert.ok(placeBot1 && placeBot2 && placeB);
  assert.ok(placeBot1.place < placeB.place);
  assert.ok(placeBot2.place < placeB.place);
  assert.equal(placeB.place, 4);

  // Match report check
  const storage = createStorageService(nk);
  const report = storage.getMatchReport(match.match_id);
  assert.ok(report);
  assert.equal(report.winning_team_id, "solo_human-a");
  assert.ok(report.winning_character_ids?.includes("human-a"));

  // Elo settlement check
  const deltas = calculateRankedEloDeltas(match);
  assert.ok(deltas);
  assert.ok(deltas["human-a"] > 0, `Winner human-a should gain Elo: ${deltas["human-a"]}`);
  assert.ok(deltas["human-b"] < 0, `Forfeited human-b should lose Elo: ${deltas["human-b"]}`);

  // User metadata updated
  const userA = users.get("human-a");
  const userB = users.get("human-b");
  const statsA = (userA?.metadata?.zarka as { stats: { wins: number; elo: number } })?.stats;
  const statsB = (userB?.metadata?.zarka as { stats: { losses: number; elo: number } })?.stats;
  assert.equal(statsA.wins, 1);
  assert.ok(statsA.elo > 1000);
  assert.equal(statsB.losses, 1);
  assert.ok(statsB.elo < 1000);
});

test("Turn resolution automatically triggers ranked AFK forfeit and match finalization", () => {
  const { nk, logger } = createTestHarness(["human-a", "human-b"]);
  const charA = createCharacter("human-a", "Player A");
  const charB = createCharacter("human-b", "Player B");

  const match = createRankedMatch(["human-a", "human-b"], {
    "human-a": charA,
    "human-b": charB,
  }, {
    consecutive_afk_turns: {
      "human-a": 0,
      "human-b": 3,
    },
    current_turn: 2,
    readyStates: {
      "human-a": true,
      "human-b": true,
    },
  });

  const result = resolveTurnForMatch(match, logger, nk);
  assert.equal(result.advanced, true);
  assert.equal(result.outcome?.ended, true);
  assert.equal(result.outcome?.winnerId, "human-a");
  assert.equal(match.removed, 1);
});

test("Unranked games are untouched by 3-AFK forfeit rule", () => {
  const { nk, logger } = createTestHarness(["human-a", "human-b"]);
  const charA = createCharacter("human-a", "Player A");
  const charB = createCharacter("human-b", "Player B");

  // No RANKED_MATCH_METADATA_KEY
  const match: MatchRecord = {
    match_id: "unranked_match_1",
    created_at: 1000,
    started_at: 1000,
    started: true,
    removed: 0,
    current_turn: 1,
    size: 2,
    players: ["human-a", "human-b"],
    playerCharacters: {
      "human-a": charA,
      "human-b": charB,
    },
    playerList: { "human-a": true, "human-b": true },
    readyStates: { "human-a": false, "human-b": false },
    consecutive_afk_turns: {
      "human-a": 0,
      "human-b": 3,
    },
  } as MatchRecord;

  const result = checkAndProcessRankedAfkForfeits(match, nk, logger, [], 1);
  assert.equal(result.matchEnded, false);
  assert.equal(result.forfeitedPlayerIds.length, 0);
  assert.equal(isPlayerForfeited(match, "human-b"), false);
  assert.equal(match.removed, 0);
});

test("Tutorial matches are untouched by 3-AFK forfeit rule", () => {
  const { nk, logger } = createTestHarness(["human-a"]);
  const charA = createCharacter("human-a", "Player A");
  const botChar = createCharacter("bot1", "Tutorial Bot");

  const match: MatchRecord = {
    match_id: "tutorial_match_1",
    created_at: 1000,
    started_at: 1000,
    started: true,
    removed: 0,
    current_turn: 1,
    size: 2,
    players: ["human-a", "bot1"],
    playerCharacters: {
      "human-a": charA,
      "bot1": botChar,
    },
    playerList: { "human-a": true, "bot1": true },
    readyStates: { "human-a": false, "bot1": false },
    consecutive_afk_turns: {
      "human-a": 3,
    },
    metadata: {
      [TUTORIAL_MATCH_METADATA_KEY]: true,
    },
  } as MatchRecord;

  const result = checkAndProcessRankedAfkForfeits(match, nk, logger, [], 1);
  assert.equal(result.matchEnded, false);
  assert.equal(result.forfeitedPlayerIds.length, 0);
  assert.equal(isPlayerForfeited(match, "human-a"), false);
  assert.equal(match.removed, 0);
});
