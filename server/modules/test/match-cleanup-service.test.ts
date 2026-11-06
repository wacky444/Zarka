import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlayerCharacter, ReplayRecord } from "@shared";
import type { MatchRecord, TurnRecord } from "../src/models/types";
import { createDefaultCharacter } from "../src/utils/playerCharacter";
import { createStorageService } from "../src/services/storageService";
import {
  scanAndCleanStaleMatches,
  DEFAULT_EMPTY_LOBBY_THRESHOLD_SECONDS,
  DEFAULT_INACTIVE_LOBBY_THRESHOLD_SECONDS,
  DEFAULT_INACTIVE_MATCH_THRESHOLD_SECONDS,
} from "../src/services/matchCleanupService";

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
    playerCharacters: characters,
    deadCharacters: {},
  } as unknown as MatchRecord;
}

function createLobbyMatch(id = "match-lobby", players: string[] = []): MatchRecord {
  return {
    match_id: id,
    name: "Lobby Test Match",
    creator: "creator-user",
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
    playerCharacters: {},
    deadCharacters: {},
  } as unknown as MatchRecord;
}

test("24-hour empty lobby deletion: deletes lobby, turns, replays, chat log, and match record", () => {
  const harness = createTestHarness(["human-a"]);
  const storage = createStorageService(harness.nk);
  const now = 2000000;
  const staleCreatedAt = now - DEFAULT_EMPTY_LOBBY_THRESHOLD_SECONDS - 100;

  const emptyMatch = createLobbyMatch("empty-lobby-1", []);
  emptyMatch.created_at = staleCreatedAt;
  emptyMatch.last_roster_activity_at = staleCreatedAt;
  storage.writeMatch(emptyMatch);

  // Add artifacts
  storage.appendTurn({ match_id: "empty-lobby-1", turn: 0 } as TurnRecord);
  storage.appendReplayTurn({ match_id: "empty-lobby-1", turn: 0 } as ReplayRecord);
  storage.writeChatLog({
    matchId: "empty-lobby-1",
    messages: [
      {
        messageId: "msg-1",
        userId: "human-a",
        username: "human-a",
        text: "hello",
        createdAt: 1000,
      },
    ],
    updatedAt: 1000,
  });

  const result = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now,
  });

  assert.equal(result.expiredEmptyLobbies, 1);
  assert.equal(result.expiredStaleLobbies, 0);
  assert.equal(result.expiredActiveMatches, 0);
  assert.equal(result.skippedDueToRace, 0);
  assert.deepEqual(result.affectedMatchIds, ["empty-lobby-1"]);

  // Storage should have no trace of empty-lobby-1
  assert.equal(storage.getMatch("empty-lobby-1"), null);
  assert.deepEqual(storage.listTurnsForMatch("empty-lobby-1"), []);
  assert.deepEqual(storage.listReplaysForMatch("empty-lobby-1"), []);
  assert.equal(storage.getChatLog("empty-lobby-1"), null);

  // Signal should have been sent
  const signal = harness.signals.find(
    (s) => s.matchId === "empty-lobby-1" && s.data.includes("match_removed")
  );
  assert.ok(signal, "expected match_removed signal");
});

test("14-day unstarted lobby deletion: cleans stale lobby but preserves recent lobby", () => {
  const harness = createTestHarness(["human-a", "human-b"]);
  const storage = createStorageService(harness.nk);
  const now = 2000000;
  const staleActivity = now - DEFAULT_INACTIVE_LOBBY_THRESHOLD_SECONDS - 100;
  const recentActivity = now - (DEFAULT_INACTIVE_LOBBY_THRESHOLD_SECONDS - 3600);

  const staleLobby = createLobbyMatch("stale-lobby-1", ["human-a", "human-b"]);
  staleLobby.created_at = staleActivity - 1000;
  staleLobby.last_roster_activity_at = staleActivity;
  storage.writeMatch(staleLobby);

  const activeLobby = createLobbyMatch("active-lobby-1", ["human-a"]);
  activeLobby.created_at = staleActivity - 1000;
  activeLobby.last_roster_activity_at = recentActivity;
  storage.writeMatch(activeLobby);

  const result = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now,
  });

  assert.equal(result.expiredStaleLobbies, 1);
  assert.equal(result.expiredEmptyLobbies, 0);
  assert.equal(result.expiredActiveMatches, 0);
  assert.deepEqual(result.affectedMatchIds, ["stale-lobby-1"]);

  assert.equal(storage.getMatch("stale-lobby-1"), null);
  assert.ok(storage.getMatch("active-lobby-1"), "active lobby should remain");
});

test("14-day started match inactivity timeout draw: terminalizes match with report and does not delete it", () => {
  const harness = createTestHarness(["human-a", "human-b"]);
  const storage = createStorageService(harness.nk);
  const now = 2000000;
  const staleAction = now - DEFAULT_INACTIVE_MATCH_THRESHOLD_SECONDS - 100;

  const match = createStartedMatch("inactive-started-1", ["human-a", "human-b"]);
  match.created_at = staleAction - 1000;
  match.started_at = staleAction - 500;
  match.last_human_action_at = staleAction;
  storage.writeMatch(match);

  const result = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now,
  });

  assert.equal(result.expiredActiveMatches, 1);
  assert.equal(result.expiredEmptyLobbies, 0);
  assert.equal(result.expiredStaleLobbies, 0);
  assert.deepEqual(result.affectedMatchIds, ["inactive-started-1"]);

  // Match record should still exist in storage, but marked removed=1, started=false
  const updated = storage.getMatch("inactive-started-1");
  assert.ok(updated);
  assert.equal(updated.match.removed, 1);
  assert.equal(updated.match.started, false);

  // Match report must exist with reason inactivity_timeout
  const report = storage.getMatchReport("inactive-started-1");
  assert.ok(report);
  assert.equal(report.reason, "inactivity_timeout");
  assert.ok(typeof report.ended_at === "number" && report.ended_at > 0);

  // Subsequent run should skip this already-finished match
  const secondResult = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now + 10,
  });
  assert.equal(secondResult.expiredActiveMatches, 0);
  assert.equal(secondResult.affectedMatchIds.length, 0);
});

test("Retention of active matches with recent human actions", () => {
  const harness = createTestHarness(["human-a", "human-b"]);
  const storage = createStorageService(harness.nk);
  const now = 2000000;

  // Active started match with recent action
  const activeMatch = createStartedMatch("active-match-1", ["human-a", "human-b"]);
  activeMatch.last_human_action_at = now - 60; // 1 minute ago
  storage.writeMatch(activeMatch);

  // Active unstarted lobby with recent roster activity
  const activeLobby = createLobbyMatch("active-lobby-1", ["human-a"]);
  activeLobby.last_roster_activity_at = now - 60;
  storage.writeMatch(activeLobby);

  // Fresh empty lobby (< 24h)
  const freshEmpty = createLobbyMatch("fresh-empty-1", []);
  freshEmpty.created_at = now - 3600; // 1 hour ago
  freshEmpty.last_roster_activity_at = now - 3600;
  storage.writeMatch(freshEmpty);

  const result = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now,
  });

  assert.equal(result.scannedCount, 3);
  assert.equal(result.expiredEmptyLobbies, 0);
  assert.equal(result.expiredStaleLobbies, 0);
  assert.equal(result.expiredActiveMatches, 0);
  assert.equal(result.affectedMatchIds.length, 0);

  // Verify none were modified or deleted
  assert.ok(storage.getMatch("active-match-1"));
  assert.ok(storage.getMatch("active-lobby-1"));
  assert.ok(storage.getMatch("fresh-empty-1"));
});

test("Safe fallback for legacy records missing activity timestamps (and quarantine/skip when created_at is 0)", () => {
  const harness = createTestHarness(["human-a", "human-b"]);
  const storage = createStorageService(harness.nk);
  const now = 2000000;
  const oldTime = now - DEFAULT_INACTIVE_MATCH_THRESHOLD_SECONDS - 500;

  // Match A: Legacy unstarted empty lobby with created_at set, but missing last_roster_activity_at
  const legacyEmpty = createLobbyMatch("legacy-empty-1", []);
  legacyEmpty.created_at = oldTime;
  delete (legacyEmpty as any).last_roster_activity_at;
  storage.writeMatch(legacyEmpty);

  // Match B: Legacy started match with started_at set, but missing last_human_action_at
  const legacyStarted = createStartedMatch("legacy-started-1", ["human-a", "human-b"]);
  legacyStarted.created_at = oldTime - 100;
  legacyStarted.started_at = oldTime;
  delete (legacyStarted as any).last_human_action_at;
  storage.writeMatch(legacyStarted);

  // Match C: Broken/legacy record with created_at = 0 and started_at = 0
  const quarantinedMatch = createLobbyMatch("broken-record-1", []);
  quarantinedMatch.created_at = 0;
  (quarantinedMatch as any).started_at = 0;
  delete (quarantinedMatch as any).last_roster_activity_at;
  storage.writeMatch(quarantinedMatch);

  const result = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now,
  });

  assert.equal(result.expiredEmptyLobbies, 1);
  assert.equal(result.expiredActiveMatches, 1);
  assert.deepEqual(result.affectedMatchIds.sort(), ["legacy-empty-1", "legacy-started-1"]);

  // Quarantined match should still exist in storage untouched
  const quarantined = storage.getMatch("broken-record-1");
  assert.ok(quarantined, "broken record with created_at 0 must be preserved");
  assert.equal(quarantined.match.removed, 0);
  assert.ok(harness.logWarnings.some((w) => w.includes("broken-record-1")));
});

test("Dry-run mode accuracy and non-mutation", () => {
  const harness = createTestHarness(["human-a", "human-b"]);
  const storage = createStorageService(harness.nk);
  const now = 2000000;
  const oldTime = now - DEFAULT_INACTIVE_MATCH_THRESHOLD_SECONDS - 1000;

  const empty = createLobbyMatch("dry-empty-1", []);
  empty.created_at = oldTime;
  empty.last_roster_activity_at = oldTime;
  storage.writeMatch(empty);

  const staleLobby = createLobbyMatch("dry-lobby-1", ["human-a"]);
  staleLobby.created_at = oldTime;
  staleLobby.last_roster_activity_at = oldTime;
  storage.writeMatch(staleLobby);

  const inactiveMatch = createStartedMatch("dry-active-1", ["human-a", "human-b"]);
  inactiveMatch.created_at = oldTime;
  inactiveMatch.started_at = oldTime;
  inactiveMatch.last_human_action_at = oldTime;
  storage.writeMatch(inactiveMatch);

  const result = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    dryRun: true,
    nowSeconds: now,
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.scannedCount, 3);
  assert.equal(result.expiredEmptyLobbies, 1);
  assert.equal(result.expiredStaleLobbies, 1);
  assert.equal(result.expiredActiveMatches, 1);
  assert.equal(result.affectedMatchIds.length, 3);
  assert.equal(result.skippedDueToRace, 0);

  // Storage should be completely untouched
  const readEmpty = storage.getMatch("dry-empty-1");
  assert.ok(readEmpty);
  assert.equal(readEmpty.match.removed, 0);

  const readLobby = storage.getMatch("dry-lobby-1");
  assert.ok(readLobby);
  assert.equal(readLobby.match.removed, 0);

  const readMatch = storage.getMatch("dry-active-1");
  assert.ok(readMatch);
  assert.equal(readMatch.match.started, true);
  assert.equal(readMatch.match.removed, 0);
  assert.equal(storage.getMatchReport("dry-active-1"), null);

  // Signals should be empty
  assert.equal(harness.signals.length, 0);
});

test("Storage version check and race-abort behavior (skippedDueToRace)", () => {
  const harness = createTestHarness(["human-a", "human-b"]);
  const storage = createStorageService(harness.nk);
  const now = 2000000;
  const oldTime = now - DEFAULT_INACTIVE_MATCH_THRESHOLD_SECONDS - 1000;

  // Race 1: Empty lobby is identified, but freshly read record shows player joined
  const raceMatch1 = createLobbyMatch("race-lobby-1", []);
  raceMatch1.created_at = oldTime;
  raceMatch1.last_roster_activity_at = oldTime;
  storage.writeMatch(raceMatch1);

  // Race 2: Inactive started match is identified, but freshly read record shows recent action
  const raceMatch2 = createStartedMatch("race-started-2", ["human-a", "human-b"]);
  raceMatch2.created_at = oldTime;
  raceMatch2.started_at = oldTime;
  raceMatch2.last_human_action_at = oldTime;
  storage.writeMatch(raceMatch2);

  // Race 3: Concurrent write conflict between getMatch and writeMatch
  const raceMatch3 = createLobbyMatch("race-conflict-3", []);
  raceMatch3.created_at = oldTime;
  raceMatch3.last_roster_activity_at = oldTime;
  storage.writeMatch(raceMatch3);

  // Hook storageList to simulate concurrent mutations immediately after listServerMatches returns
  const origStorageList = harness.nk.storageList;
  harness.nk.storageList = (userId, collection, limit, cursor) => {
    const res = origStorageList(userId, collection, limit, cursor);

    // Modify match1 so fresh read sees a player joined with recent roster activity
    const m1 = storage.getMatch("race-lobby-1")!;
    m1.match.players = ["human-a"];
    m1.match.last_roster_activity_at = now;
    storage.writeMatch(m1.match, m1.version);

    // Modify match2 so fresh read sees human took an action recently
    const m2 = storage.getMatch("race-started-2")!;
    m2.match.last_human_action_at = now - 10;
    storage.writeMatch(m2.match, m2.version);

    return res;
  };

  // For match3, simulate version conflict by intercepting storageWrite during cleanup
  const origStorageWrite = harness.nk.storageWrite;
  harness.nk.storageWrite = (requests) => {
    for (const req of requests) {
      if (req.key.includes("race-conflict-3")) {
        throw new Error("version conflict");
      }
    }
    return origStorageWrite(requests);
  };

  const result = scanAndCleanStaleMatches(harness.nk, harness.logger, {
    nowSeconds: now,
  });

  // All 3 should be skipped due to race
  assert.equal(result.skippedDueToRace, 3);
  assert.equal(result.expiredEmptyLobbies, 0);
  assert.equal(result.expiredStaleLobbies, 0);
  assert.equal(result.expiredActiveMatches, 0);
  assert.equal(result.affectedMatchIds.length, 0);

  // Matches should still exist in storage
  assert.ok(storage.getMatch("race-lobby-1"));
  assert.ok(storage.getMatch("race-started-2"));
  assert.ok(storage.getMatch("race-conflict-3"));
});
