import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TUTORIAL_MATCH_METADATA_KEY,
  type PlayerCharacter,
  type ReplayRecord,
  type ListMatchCardsPayload,
  type ListMyMatchesPayload,
} from "@shared";
import type { MatchRecord, TurnRecord } from "../src/models/types";
import { createDefaultCharacter } from "../src/utils/playerCharacter";
import { createStorageService } from "../src/services/storageService";
import {
  scanAndCleanStaleMatches,
  DEFAULT_EMPTY_LOBBY_THRESHOLD_SECONDS,
  DEFAULT_INACTIVE_LOBBY_THRESHOLD_SECONDS,
  DEFAULT_INACTIVE_MATCH_THRESHOLD_SECONDS,
} from "../src/services/matchCleanupService";
import { deleteUnstartedLobbyAndArtifacts } from "../src/services/lobbyCleanup";
import { listMatchCardsRpc } from "../src/rpc/listMatchCards";
import { listMyMatchesRpc } from "../src/rpc/listMyMatches";
import { resolveTurnForMatch } from "../src/match/turnResolution";
import { recordHumanGameplayActivity } from "../src/utils/activityClock";
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
  const signals: Array<{ matchId: string; data: string }> = [];
  const logWarnings: string[] = [];
  let version = 0;
  const keyOf = (record: { collection: string; key: string; userId: string }) =>
    `${record.collection}:${record.userId}:${record.key}`;

  for (const userId of userIds) {
    users.set(userId, {
      id: userId,
      username: userId,
      metadata: {
        zarka: {
          tutorialCompleted: false,
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
    matchSignal: (matchId: string, data: string) => {
      signals.push({ matchId, data });
    },
  } as unknown as nkruntime.Nakama;

  const logger = {
    info: () => {},
    warn: (_format: string, ...args: unknown[]) => {
      logWarnings.push(args.map(String).join(" "));
    },
    error: () => {},
    debug: () => {},
  } as unknown as nkruntime.Logger;

  return { nk, logger, users, records, signals, logWarnings };
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

function createStartedMatch(id = "match-started", players = ["human-a", "human-b"]): MatchRecord {
  const characters: Record<string, PlayerCharacter> = {};
  for (const p of players) {
    characters[p] = createCharacter(p, `Char_${p}`, { teamId: `team_${p}` });
  }

  return {
    match_id: id,
    name: "Started Test Match",
    creator: players[0],
    started: true,
    removed: 0,
    created_at: 1000,
    started_at: 1010,
    last_human_action_at: 1010,
    current_turn: 3,
    size: 2,
    cols: 5,
    rows: 5,
    roundTime: "24h",
    autoSkip: true,
    botPlayers: 0,
    order: [...players],
    players: [...players],
    playerList: Object.fromEntries(players.map((p) => [p, true])),
    readyStates: Object.fromEntries(players.map((p) => [p, false])),
    playerCharacters: characters,
    deadCharacters: {},
  } as unknown as MatchRecord;
}

function createLobbyMatch(id = "match-lobby", players: string[] = []): MatchRecord {
  return {
    match_id: id,
    name: "Lobby Test Match",
    creator: players[0] ?? "creator-user",
    started: false,
    removed: 0,
    created_at: 1000,
    last_roster_activity_at: 1000,
    size: 4,
    cols: 5,
    rows: 5,
    roundTime: "24h",
    autoSkip: false,
    botPlayers: 0,
    order: [...players],
    players: [...players],
    playerList: Object.fromEntries(players.map((p) => [p, true])),
    readyStates: Object.fromEntries(players.map((p) => [p, false])),
    playerCharacters: {},
    deadCharacters: {},
  } as unknown as MatchRecord;
}

test("14-day lobby timeout: unstarted lobby with no roster activity is deleted along with artifacts and excluded from listMatchCards and listMyMatches", () => {
  const harness = createTestHarness(["human-a", "human-b"]);
  const storage = createStorageService(harness.nk);
  const now = 2_000_000;
  const staleActivity = now - DEFAULT_INACTIVE_LOBBY_THRESHOLD_SECONDS - 100;

  const staleLobby = createLobbyMatch("stale-lobby-e2e", ["human-a", "human-b"]);
  staleLobby.created_at = staleActivity - 500;
  staleLobby.last_roster_activity_at = staleActivity;
  storage.writeMatch(staleLobby);

  // Attach artifacts
  storage.appendTurn({ match_id: "stale-lobby-e2e", turn: 0 } as TurnRecord);
  storage.appendReplayTurn({ match_id: "stale-lobby-e2e", turn: 0 } as ReplayRecord);
  storage.writeChatLog({
    matchId: "stale-lobby-e2e",
    messages: [
      {
        messageId: "msg-1",
        userId: "human-a",
        username: "human-a",
        text: "hello lobby",
        createdAt: staleActivity,
      },
    ],
    updatedAt: staleActivity,
  });

  // Verify before cleanup: visible in list_match_cards and list_my_matches
  const beforeCards = JSON.parse(
    listMatchCardsRpc(
      { userId: "human-a" } as nkruntime.Context,
      harness.logger,
      harness.nk,
      JSON.stringify({ offset: 0, limit: 10 })
    )
  ) as ListMatchCardsPayload;
  assert.equal(beforeCards.ok, true);
  assert.equal(beforeCards.matches?.some((m) => m.match_id === "stale-lobby-e2e"), true);

  const beforeMyMatches = JSON.parse(
    listMyMatchesRpc(
      { userId: "human-a" } as nkruntime.Context,
      harness.logger,
      harness.nk,
      ""
    )
  ) as ListMyMatchesPayload;
  assert.equal(beforeMyMatches.ok, true);
  assert.equal(beforeMyMatches.matches?.some((m) => m.match_id === "stale-lobby-e2e"), true);

  // Run cleanup
  const result = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now,
  });
  assert.equal(result.expiredStaleLobbies, 1);
  assert.deepEqual(result.affectedMatchIds, ["stale-lobby-e2e"]);

  // Storage asserts: match and artifacts deleted
  assert.equal(storage.getMatch("stale-lobby-e2e"), null);
  assert.deepEqual(storage.listTurnsForMatch("stale-lobby-e2e"), []);
  assert.deepEqual(storage.listReplaysForMatch("stale-lobby-e2e"), []);
  assert.equal(storage.getChatLog("stale-lobby-e2e"), null);

  // List asserts: excluded from list_match_cards and list_my_matches
  const afterCards = JSON.parse(
    listMatchCardsRpc(
      { userId: "human-a" } as nkruntime.Context,
      harness.logger,
      harness.nk,
      JSON.stringify({ offset: 0, limit: 10 })
    )
  ) as ListMatchCardsPayload;
  assert.equal(afterCards.ok, true);
  assert.equal(afterCards.matches?.some((m) => m.match_id === "stale-lobby-e2e"), false);

  const afterMyMatchesA = JSON.parse(
    listMyMatchesRpc(
      { userId: "human-a" } as nkruntime.Context,
      harness.logger,
      harness.nk,
      ""
    )
  ) as ListMyMatchesPayload;
  assert.equal(afterMyMatchesA.ok, true);
  assert.equal(afterMyMatchesA.matches?.some((m) => m.match_id === "stale-lobby-e2e"), false);

  const afterMyMatchesB = JSON.parse(
    listMyMatchesRpc(
      { userId: "human-b" } as nkruntime.Context,
      harness.logger,
      harness.nk,
      ""
    )
  ) as ListMyMatchesPayload;
  assert.equal(afterMyMatchesB.ok, true);
  assert.equal(afterMyMatchesB.matches?.some((m) => m.match_id === "stale-lobby-e2e"), false);
});

test("24-hour empty lobby timeout: unstarted lobby with 0 players for >= 24 hours is deleted from storage", () => {
  const harness = createTestHarness(["human-a"]);
  const storage = createStorageService(harness.nk);
  const now = 2_000_000;
  const staleCreatedAt = now - DEFAULT_EMPTY_LOBBY_THRESHOLD_SECONDS - 50;

  const emptyLobby = createLobbyMatch("empty-lobby-e2e", []);
  emptyLobby.created_at = staleCreatedAt;
  emptyLobby.last_roster_activity_at = staleCreatedAt;
  storage.writeMatch(emptyLobby);

  storage.appendTurn({ match_id: "empty-lobby-e2e", turn: 0 } as TurnRecord);
  storage.appendReplayTurn({ match_id: "empty-lobby-e2e", turn: 0 } as ReplayRecord);
  storage.writeChatLog({
    matchId: "empty-lobby-e2e",
    messages: [],
    updatedAt: staleCreatedAt,
  });

  const result = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now,
  });

  assert.equal(result.expiredEmptyLobbies, 1);
  assert.deepEqual(result.affectedMatchIds, ["empty-lobby-e2e"]);

  assert.equal(storage.getMatch("empty-lobby-e2e"), null);
  assert.deepEqual(storage.listTurnsForMatch("empty-lobby-e2e"), []);
  assert.deepEqual(storage.listReplaysForMatch("empty-lobby-e2e"), []);
  assert.equal(storage.getChatLog("empty-lobby-e2e"), null);
});

test("Legacy soft-removed lobby exclusion: unstarted lobby with removed = 1, current_turn = 0, and no report is excluded from listMyMatches", () => {
  const harness = createTestHarness(["human-a"]);
  const storage = createStorageService(harness.nk);

  const legacyLobby = createLobbyMatch("legacy-removed-lobby", ["human-a"]);
  legacyLobby.removed = 1;
  legacyLobby.started = false;
  legacyLobby.current_turn = 0;
  storage.writeMatch(legacyLobby);

  // Verify no report exists in storage
  assert.equal(storage.getMatchReport("legacy-removed-lobby"), null);

  const response = JSON.parse(
    listMyMatchesRpc(
      { userId: "human-a" } as nkruntime.Context,
      harness.logger,
      harness.nk,
      ""
    )
  ) as ListMyMatchesPayload;

  assert.equal(response.ok, true);
  assert.equal(
    response.matches?.some((m) => m.match_id === "legacy-removed-lobby"),
    false,
    "Legacy soft-removed unstarted lobby must be excluded from listMyMatches"
  );
});

test("14-day gameplay timeout: started match with no qualifying human actions ends as draw with inactivity_timeout, increments draws, and exposes terminalReason", () => {
  const harness = createTestHarness(["human-a", "human-b"]);
  const storage = createStorageService(harness.nk);
  const now = 2_000_000;
  const staleActionTime = now - DEFAULT_INACTIVE_MATCH_THRESHOLD_SECONDS - 200;

  const match = createStartedMatch("inactive-gameplay-e2e", ["human-a", "human-b"]);
  match.created_at = staleActionTime - 1000;
  match.started_at = staleActionTime - 500;
  match.last_human_action_at = staleActionTime;
  match.current_turn = 4;
  storage.writeMatch(match);

  const result = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now,
  });

  assert.equal(result.expiredActiveMatches, 1);
  assert.deepEqual(result.affectedMatchIds, ["inactive-gameplay-e2e"]);

  // Stored match record is marked removed=1, started=false, but NOT deleted
  const stored = storage.getMatch("inactive-gameplay-e2e");
  assert.ok(stored);
  assert.equal(stored.match.removed, 1);
  assert.equal(stored.match.started, false);

  // Stored match report exists with reason: inactivity_timeout and no winning team
  const report = storage.getMatchReport("inactive-gameplay-e2e");
  assert.ok(report);
  assert.equal(report.reason, "inactivity_timeout");
  assert.equal(report.winning_team_id, undefined);
  assert.deepEqual(report.winning_character_ids, []);

  // Stats incremented: participants have draws: 1, matchesPlayed: 1, wins: 0, losses: 0
  const userA = harness.users.get("human-a")!;
  const statsA = (userA.metadata.zarka as { stats: { draws: number; matchesPlayed: number; wins: number; losses: number } }).stats;
  assert.equal(statsA.draws, 1);
  assert.equal(statsA.matchesPlayed, 1);
  assert.equal(statsA.wins, 0);
  assert.equal(statsA.losses, 0);

  const userB = harness.users.get("human-b")!;
  const statsB = (userB.metadata.zarka as { stats: { draws: number; matchesPlayed: number; wins: number; losses: number } }).stats;
  assert.equal(statsB.draws, 1);
  assert.equal(statsB.matchesPlayed, 1);
  assert.equal(statsB.wins, 0);
  assert.equal(statsB.losses, 0);

  // listMyMatches exposes terminalReason: inactivity_timeout
  const myMatchesResponse = JSON.parse(
    listMyMatchesRpc(
      { userId: "human-a" } as nkruntime.Context,
      harness.logger,
      harness.nk,
      ""
    )
  ) as ListMyMatchesPayload;

  assert.equal(myMatchesResponse.ok, true);
  const entry = myMatchesResponse.matches?.find((m) => m.match_id === "inactive-gameplay-e2e");
  assert.ok(entry, "Match should appear in My Matches");
  assert.equal(entry.has_report, true);
  assert.equal(entry.started, false);
  assert.equal(entry.terminalReason, "inactivity_timeout");
});

test("AFK turn exclusion: auto-advanced AFK turns do not refresh last_human_action_at, allowing 14-day inactivity expiry to proceed", () => {
  const harness = createTestHarness(["human-a", "human-b"]);
  const storage = createStorageService(harness.nk);
  const startTime = 1_000_000;

  const match = createStartedMatch("afk-exclusion-match", ["human-a", "human-b"]);
  match.created_at = startTime;
  match.started_at = startTime;
  match.last_human_action_at = startTime;
  match.current_turn = 1;
  storage.writeMatch(match);

  // Advance turn at startTime + 5 days using isAutoAdvance: true
  const turn2Time = startTime + 5 * 86400;
  const turnResult = resolveTurnForMatch(match, harness.logger, harness.nk, {
    isAutoAdvance: true,
  });
  assert.equal(turnResult.advanced, true);
  assert.equal(match.current_turn, 2);

  // Crucial invariant: auto-advance turns DO NOT refresh last_human_action_at
  assert.equal(match.last_human_action_at, startTime);
  storage.writeMatch(match);

  // At startTime + 14 days + 10s (only 9 days after the AFK turn, but 14 days since human action):
  const scanTime = startTime + DEFAULT_INACTIVE_MATCH_THRESHOLD_SECONDS + 10;
  const result = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: scanTime,
  });

  assert.equal(result.expiredActiveMatches, 1);
  assert.deepEqual(result.affectedMatchIds, ["afk-exclusion-match"]);

  const report = storage.getMatchReport("afk-exclusion-match");
  assert.ok(report);
  assert.equal(report.reason, "inactivity_timeout");
});

test("Active match retention: match with human gameplay actions within 14 days is preserved and never expired", () => {
  const harness = createTestHarness(["human-a", "human-b"]);
  const storage = createStorageService(harness.nk);
  const now = 2_000_000;

  // Match started long ago, but human performed an action 2 hours ago
  const match = createStartedMatch("recently-active-match", ["human-a", "human-b"]);
  match.created_at = now - 20 * 86400;
  match.started_at = now - 19 * 86400;
  recordHumanGameplayActivity(match, "human-a", now - 7200);
  assert.equal(match.last_human_action_at, now - 7200);
  storage.writeMatch(match);

  // Active unstarted lobby with roster activity 2 hours ago
  const lobby = createLobbyMatch("recently-active-lobby", ["human-a"]);
  lobby.created_at = now - 20 * 86400;
  lobby.last_roster_activity_at = now - 7200;
  storage.writeMatch(lobby);

  const result = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now,
  });

  assert.equal(result.expiredActiveMatches, 0);
  assert.equal(result.expiredStaleLobbies, 0);
  assert.equal(result.expiredEmptyLobbies, 0);
  assert.equal(result.affectedMatchIds.length, 0);

  // Both records remain active in storage
  const storedMatch = storage.getMatch("recently-active-match");
  assert.ok(storedMatch);
  assert.equal(storedMatch.match.started, true);
  assert.equal(storedMatch.match.removed, 0);

  const storedLobby = storage.getMatch("recently-active-lobby");
  assert.ok(storedLobby);
  assert.equal(storedLobby.match.started, false);
  assert.equal(storedLobby.match.removed, 0);
});

test("Tutorial match handling: stale tutorial match terminalizes as draw with inactivity_timeout and tutorialCompleted is not set", () => {
  const harness = createTestHarness(["tutorial-user"]);
  const storage = createStorageService(harness.nk);
  const now = 2_000_000;
  const staleActionTime = now - DEFAULT_INACTIVE_MATCH_THRESHOLD_SECONDS - 100;

  const charUser = createCharacter("tutorial-user", "Learner", { teamId: "player" });
  const charBot = createCharacter("bot", "Instructor", { teamId: "bot" });

  const tutorialMatch: MatchRecord = {
    match_id: "tutorial-stale-1",
    name: "Tutorial Match",
    creator: "tutorial-user",
    started: true,
    removed: 0,
    created_at: staleActionTime - 1000,
    started_at: staleActionTime - 500,
    last_human_action_at: staleActionTime,
    current_turn: 2,
    size: 2,
    cols: 5,
    rows: 5,
    roundTime: "24h",
    autoSkip: false,
    botPlayers: 1,
    order: ["tutorial-user", "bot"],
    players: ["tutorial-user", "bot"],
    playerList: { "tutorial-user": true, bot: true },
    readyStates: { "tutorial-user": false, bot: true },
    playerCharacters: {
      "tutorial-user": charUser,
      bot: charBot,
    },
    deadCharacters: {},
    metadata: {
      [TUTORIAL_MATCH_METADATA_KEY]: { version: 1 },
    },
  } as unknown as MatchRecord;

  storage.writeMatch(tutorialMatch);

  // Assert starting tutorialCompleted is false
  const userBefore = harness.users.get("tutorial-user")!;
  assert.equal((userBefore.metadata.zarka as { tutorialCompleted: boolean }).tutorialCompleted, false);

  const result = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now,
  });

  assert.equal(result.expiredActiveMatches, 1);
  assert.deepEqual(result.affectedMatchIds, ["tutorial-stale-1"]);

  // Stored match report exists as inactivity draw
  const report = storage.getMatchReport("tutorial-stale-1");
  assert.ok(report);
  assert.equal(report.reason, "inactivity_timeout");
  assert.equal(report.winning_team_id, undefined);

  // Critical requirement: tutorialCompleted MUST NOT be granted on inactivity draw
  const userAfter = harness.users.get("tutorial-user")!;
  assert.equal((userAfter.metadata.zarka as { tutorialCompleted: boolean }).tutorialCompleted, false);
});

test("Solo match handling: single-human started match follows standard timeout rules and ends as an inactivity draw without declaring an artificial winner", () => {
  const harness = createTestHarness(["solo-human"]);
  const storage = createStorageService(harness.nk);
  const now = 2_000_000;
  const staleActionTime = now - DEFAULT_INACTIVE_MATCH_THRESHOLD_SECONDS - 100;

  const match = createStartedMatch("solo-started-match", ["solo-human"]);
  match.created_at = staleActionTime - 1000;
  match.started_at = staleActionTime - 500;
  match.last_human_action_at = staleActionTime;
  match.size = 1;
  storage.writeMatch(match);

  const result = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now,
  });

  assert.equal(result.expiredActiveMatches, 1);
  assert.deepEqual(result.affectedMatchIds, ["solo-started-match"]);

  const report = storage.getMatchReport("solo-started-match");
  assert.ok(report);
  assert.equal(report.reason, "inactivity_timeout");
  assert.equal(report.winning_team_id, undefined, "Solo inactivity timeout must not declare winning team");
  assert.deepEqual(report.winning_character_ids, [], "Solo inactivity timeout must not declare winning characters");

  // Participant stats incremented as draw, not win
  const user = harness.users.get("solo-human")!;
  const stats = (user.metadata.zarka as { stats: { draws: number; wins: number; matchesPlayed: number } }).stats;
  assert.equal(stats.draws, 1);
  assert.equal(stats.wins, 0);
  assert.equal(stats.matchesPlayed, 1);
});

test("Legacy record fallback: records created before new timestamp fields safely fall back to started_at or created_at without mass deletion or crashes", () => {
  const harness = createTestHarness(["human-a", "human-b"]);
  const storage = createStorageService(harness.nk);
  const now = 2_000_000;

  // 1. Started match missing last_human_action_at: falls back to started_at
  // Case A: started_at is recent (2 days ago) -> retained
  const recentLegacyMatch = createStartedMatch("recent-legacy-match", ["human-a"]);
  delete (recentLegacyMatch as unknown as { last_human_action_at?: number }).last_human_action_at;
  recentLegacyMatch.created_at = now - 3 * 86400;
  recentLegacyMatch.started_at = now - 2 * 86400;
  storage.writeMatch(recentLegacyMatch);

  // Case B: started_at is stale (15 days ago) -> expires safely
  const staleLegacyMatch = createStartedMatch("stale-legacy-match", ["human-b"]);
  delete (staleLegacyMatch as unknown as { last_human_action_at?: number }).last_human_action_at;
  staleLegacyMatch.created_at = now - 16 * 86400;
  staleLegacyMatch.started_at = now - 15 * 86400;
  storage.writeMatch(staleLegacyMatch);

  // 2. Lobby missing last_roster_activity_at: falls back to created_at
  // Case A: created_at is recent (2 days ago) -> retained
  const recentLegacyLobby = createLobbyMatch("recent-legacy-lobby", ["human-a"]);
  delete (recentLegacyLobby as unknown as { last_roster_activity_at?: number }).last_roster_activity_at;
  recentLegacyLobby.created_at = now - 2 * 86400;
  storage.writeMatch(recentLegacyLobby);

  // Case B: created_at is stale (15 days ago) -> deleted safely
  const staleLegacyLobby = createLobbyMatch("stale-legacy-lobby", ["human-b"]);
  delete (staleLegacyLobby as unknown as { last_roster_activity_at?: number }).last_roster_activity_at;
  staleLegacyLobby.created_at = now - 15 * 86400;
  storage.writeMatch(staleLegacyLobby);

  // 3. Corrupt record: created_at is 0 and no timestamps -> quarantined/skipped
  const corruptRecord = createLobbyMatch("corrupt-match", ["human-a"]);
  delete (corruptRecord as unknown as { last_roster_activity_at?: number }).last_roster_activity_at;
  corruptRecord.created_at = 0;
  storage.writeMatch(corruptRecord);

  const result = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now,
  });

  // Exactly staleLegacyMatch expired and staleLegacyLobby expired
  assert.equal(result.expiredActiveMatches, 1);
  assert.equal(result.expiredStaleLobbies, 1);
  assert.ok(result.affectedMatchIds.includes("stale-legacy-match"));
  assert.ok(result.affectedMatchIds.includes("stale-legacy-lobby"));

  // Retained records
  assert.ok(storage.getMatch("recent-legacy-match"), "Recent legacy match should be retained");
  assert.ok(storage.getMatch("recent-legacy-lobby"), "Recent legacy lobby should be retained");
  assert.ok(storage.getMatch("corrupt-match"), "Corrupt record with 0 timestamp should be quarantined, not deleted");
});

test("Concurrent user action race: a human turn action or join arriving concurrently updates version/timestamp, increments skippedDueToRace, and prevents expiry", () => {
  const harness = createTestHarness(["human-a", "human-b"]);
  const storage = createStorageService(harness.nk);
  const now = 2_000_000;
  const staleActionTime = now - DEFAULT_INACTIVE_MATCH_THRESHOLD_SECONDS - 100;

  const match = createStartedMatch("racing-match-1", ["human-a", "human-b"]);
  match.created_at = staleActionTime - 1000;
  match.started_at = staleActionTime - 500;
  match.last_human_action_at = staleActionTime;
  storage.writeMatch(match);

  // Hook storageList: after candidate scan lists matches, simulate concurrent user action arriving
  // updating last_human_action_at and version before the individual match transition runs
  const originalStorageList = harness.nk.storageList;
  harness.nk.storageList = (userId, collection, limit, cursor) => {
    const res = originalStorageList(userId, collection, limit, cursor);
    const current = storage.getMatch("racing-match-1")!;
    recordHumanGameplayActivity(current.match, "human-a", now);
    storage.writeMatch(current.match, current.version);
    return res;
  };

  const result = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now,
  });

  // Verify that the concurrent human action caused the scanner to abort expiry
  assert.equal(result.skippedDueToRace, 1);
  assert.equal(result.expiredActiveMatches, 0);

  // Match remains active in storage
  const finalStored = storage.getMatch("racing-match-1")!;
  assert.equal(finalStored.match.started, true);
  assert.equal(finalStored.match.removed, 0);
  assert.equal(finalStored.match.last_human_action_at, now);
  assert.equal(storage.getMatchReport("racing-match-1"), null);
});

test("Idempotent scanner runs: running scanAndCleanStaleMatches multiple times consecutively causes no duplicate reports, no duplicate stats increments, and no errors", () => {
  const harness = createTestHarness(["human-a", "human-b"]);
  const storage = createStorageService(harness.nk);
  const now = 2_000_000;
  const staleTime = now - DEFAULT_INACTIVE_MATCH_THRESHOLD_SECONDS - 100;

  // Stale active match
  const match = createStartedMatch("idempotent-match-1", ["human-a", "human-b"]);
  match.created_at = staleTime;
  match.started_at = staleTime;
  match.last_human_action_at = staleTime;
  storage.writeMatch(match);

  // Stale lobby
  const lobby = createLobbyMatch("idempotent-lobby-1", ["human-a"]);
  lobby.created_at = staleTime;
  lobby.last_roster_activity_at = staleTime;
  storage.writeMatch(lobby);

  // Run 1: cleans lobby and terminalizes active match
  const run1 = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now,
  });
  assert.equal(run1.expiredActiveMatches, 1);
  assert.equal(run1.expiredStaleLobbies, 1);
  assert.equal(run1.skippedDueToRace, 0);

  const statsAfterRun1 = (harness.users.get("human-a")!.metadata.zarka as { stats: { draws: number; matchesPlayed: number } }).stats;
  assert.equal(statsAfterRun1.draws, 1);
  assert.equal(statsAfterRun1.matchesPlayed, 1);

  // Run 2: immediately afterwards
  const run2 = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now + 5,
  });
  assert.equal(run2.expiredActiveMatches, 0);
  assert.equal(run2.expiredStaleLobbies, 0);
  assert.equal(run2.expiredEmptyLobbies, 0);
  assert.equal(run2.affectedMatchIds.length, 0);

  // Run 3: after another interval
  const run3 = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now + 86400,
  });
  assert.equal(run3.expiredActiveMatches, 0);
  assert.equal(run3.expiredStaleLobbies, 0);
  assert.equal(run3.expiredEmptyLobbies, 0);
  assert.equal(run3.affectedMatchIds.length, 0);

  // Invariant assertions:
  // 1. Participant stats draws remain 1 (no duplicate increment)
  const statsAfterRun3 = (harness.users.get("human-a")!.metadata.zarka as { stats: { draws: number; matchesPlayed: number } }).stats;
  assert.equal(statsAfterRun3.draws, 1);
  assert.equal(statsAfterRun3.matchesPlayed, 1);

  // 2. Exactly one match report exists
  assert.ok(storage.getMatchReport("idempotent-match-1"));
  assert.equal(storage.getMatchReport("idempotent-lobby-1"), null);

  // 3. Lobby is completely gone
  assert.equal(storage.getMatch("idempotent-lobby-1"), null);
});
