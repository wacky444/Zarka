import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlayerCharacter } from "@shared";
import type { MatchRecord } from "../src/models/types";
import { createDefaultCharacter } from "../src/utils/playerCharacter";
import { createStorageService } from "../src/services/storageService";
import { cleanStaleMatchesRpc } from "../src/rpc/cleanStaleMatches";
import {
  rankedQueueCoordinatorMatchLoop,
  RankedQueueCoordinatorState,
  CLEANUP_INTERVAL_MS,
} from "../src/matchmaking/coordinator";
import {
  MATCH_COLLECTION,
  MATCH_KEY_PREFIX,
  SERVER_USER_ID,
} from "../src/constants";

if (
  typeof (globalThis as unknown as { nkruntime?: unknown }).nkruntime ===
  "undefined"
) {
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

type FakeUser = {
  id: string;
  username: string;
  metadata: Record<string, unknown>;
};

function createTestHarness(userIds: string[] = ["admin-user", "normal-user"]) {
  const records = new Map<string, Stored>();
  const users = new Map<string, FakeUser>();
  const signals: Array<{ matchId: string; data: string }> = [];
  const logErrors: string[] = [];
  let version = 0;
  const keyOf = (record: { collection: string; key: string; userId: string }) =>
    `${record.collection}:${record.userId}:${record.key}`;

  for (const userId of userIds) {
    users.set(userId, {
      id: userId,
      username: userId,
      metadata: {
        admin: userId.startsWith("admin"),
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
    storageRead: (
      requests: Array<{ collection: string; key: string; userId: string }>
    ) =>
      requests.flatMap((request) => {
        const value = records.get(keyOf(request));
        return value
          ? [{ ...value, value: JSON.parse(JSON.stringify(value.value)) }]
          : [];
      }),
    storageWrite: (
      requests: Array<{
        collection: string;
        key: string;
        userId: string;
        value: unknown;
        version?: string;
      }>
    ) => {
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
    storageList: (
      userId: string,
      collection: string,
      limit = 100,
      cursor = ""
    ) => {
      const start = Number.parseInt(cursor || "0", 10) || 0;
      const matching = Array.from(records.values())
        .filter(
          (record) =>
            record.userId === userId && record.collection === collection
        )
        .sort((a, b) => a.key.localeCompare(b.key));
      const objects = matching.slice(start, start + limit).map((obj) => ({
        ...obj,
        value: JSON.parse(JSON.stringify(obj.value)),
      }));
      const next =
        start + limit < matching.length ? String(start + limit) : "";
      return { objects, cursor: next };
    },
    storageDelete: (
      requests: Array<{ collection: string; key: string; userId: string }>
    ) => {
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
      metadata: unknown
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
    warn: () => {},
    error: (_format: string, ...args: unknown[]) => {
      logErrors.push(args.map(String).join(" "));
    },
    debug: () => {},
  } as unknown as nkruntime.Logger;

  return { nk, logger, users, records, signals, logErrors };
}

function createLobby(
  id: string,
  players: string[] = [],
  created_at = 1000
): MatchRecord {
  const characters: Record<string, PlayerCharacter> = {};
  for (const p of players) {
    const base = createDefaultCharacter(p, `Char_${p}`);
    characters[p] = { ...base, location: { q: 0, r: 0 } };
  }
  return {
    match_id: id,
    name: `Lobby ${id}`,
    creator: players[0] || "someone",
    started: false,
    removed: 0,
    created_at,
    players,
    playerCharacters: characters,
    current_turn: 0,
    turn_deadline: 0,
    last_roster_activity_at: created_at,
  } as MatchRecord;
}

test("cleanStaleMatchesRpc authorization rejects non-admins and allows admin", () => {
  const harness = createTestHarness();
  const storage = createStorageService(harness.nk);

  const lobby = createLobby("stale-lobby-1", [], 1000);
  storage.writeMatch(lobby);

  // 1. Missing userId
  assert.throws(
    () =>
      cleanStaleMatchesRpc(
        {} as nkruntime.Context,
        harness.logger,
        harness.nk,
        ""
      ),
    (err: { code?: number; message?: string }) => {
      assert.equal(err.code, 7); // PERMISSION_DENIED
      assert.equal(err.message, "admin_required");
      return true;
    }
  );

  // 2. Normal user (non-admin)
  assert.throws(
    () =>
      cleanStaleMatchesRpc(
        { userId: "normal-user" } as nkruntime.Context,
        harness.logger,
        harness.nk,
        ""
      ),
    (err: { code?: number; message?: string }) => {
      assert.equal(err.code, 7); // PERMISSION_DENIED
      assert.equal(err.message, "admin_required");
      return true;
    }
  );

  // 3. Admin user succeeds
  const adminCtx = { userId: "admin-user" } as nkruntime.Context;
  const rawResponse = cleanStaleMatchesRpc(
    adminCtx,
    harness.logger,
    harness.nk,
    JSON.stringify({ nowSeconds: 1000 + 25 * 3600 })
  );
  const response = JSON.parse(rawResponse) as {
    ok: boolean;
    result: { expiredEmptyLobbies: number; affectedMatchIds: string[] };
  };

  assert.equal(response.ok, true);
  assert.equal(response.result.expiredEmptyLobbies, 1);
  assert.deepEqual(response.result.affectedMatchIds, ["stale-lobby-1"]);
});

test("cleanStaleMatchesRpc rejects malformed JSON or invalid payload", () => {
  const harness = createTestHarness();
  const adminCtx = { userId: "admin-user" } as nkruntime.Context;

  assert.throws(
    () =>
      cleanStaleMatchesRpc(
        adminCtx,
        harness.logger,
        harness.nk,
        "{ broken: json"
      ),
    (err: { code?: number; message?: string }) => {
      assert.equal(err.code, 3); // INVALID_ARGUMENT
      assert.equal(err.message, "bad_json");
      return true;
    }
  );

  assert.throws(
    () =>
      cleanStaleMatchesRpc(adminCtx, harness.logger, harness.nk, "[1, 2, 3]"),
    (err: { code?: number; message?: string }) => {
      assert.equal(err.code, 3); // INVALID_ARGUMENT
      assert.equal(err.message, "bad_json");
      return true;
    }
  );
});

test("cleanStaleMatchesRpc dryRun audits matches without modifying storage", () => {
  const harness = createTestHarness();
  const storage = createStorageService(harness.nk);

  const lobby = createLobby("dry-run-lobby", [], 1000);
  storage.writeMatch(lobby);

  const adminCtx = { userId: "admin-user" } as nkruntime.Context;
  const rawResponse = cleanStaleMatchesRpc(
    adminCtx,
    harness.logger,
    harness.nk,
    JSON.stringify({ dryRun: true, nowSeconds: 1000 + 25 * 3600 })
  );
  const response = JSON.parse(rawResponse) as {
    ok: boolean;
    result: {
      dryRun: boolean;
      expiredEmptyLobbies: number;
      affectedMatchIds: string[];
    };
  };

  assert.equal(response.ok, true);
  assert.equal(response.result.dryRun, true);
  assert.equal(response.result.expiredEmptyLobbies, 1);
  assert.deepEqual(response.result.affectedMatchIds, ["dry-run-lobby"]);

  // Storage should still contain the match because dryRun was true
  const saved = storage.getMatch("dry-run-lobby");
  assert.ok(saved);
  assert.equal(saved.match.match_id, "dry-run-lobby");
});

test("cleanStaleMatchesRpc forwards custom thresholds and maxCandidatesPerRun", () => {
  const harness = createTestHarness();
  const storage = createStorageService(harness.nk);

  // Lobby created 2 hours ago (7200 seconds ago)
  const now = 100_000;
  const lobby1 = createLobby("custom-lobby-1", [], now - 7200);
  const lobby2 = createLobby("custom-lobby-2", [], now - 7200);
  storage.writeMatch(lobby1);
  storage.writeMatch(lobby2);

  const adminCtx = { userId: "admin-user" } as nkruntime.Context;

  // Custom emptyLobbyThresholdSec: 3600 (1 hour), maxCandidatesPerRun: 1
  const rawResponse = cleanStaleMatchesRpc(
    adminCtx,
    harness.logger,
    harness.nk,
    JSON.stringify({
      emptyLobbyThresholdSec: 3600,
      maxCandidatesPerRun: 1,
      nowSeconds: now,
    })
  );
  const response = JSON.parse(rawResponse) as {
    ok: boolean;
    result: { expiredEmptyLobbies: number; affectedMatchIds: string[] };
  };

  assert.equal(response.ok, true);
  // Only 1 processed because maxCandidatesPerRun was capped at 1
  assert.equal(response.result.expiredEmptyLobbies, 1);
  assert.equal(response.result.affectedMatchIds.length, 1);
});

test("coordinator match loop runs cleanup once every 24 hours and updates state", () => {
  const harness = createTestHarness();
  const storage = createStorageService(harness.nk);

  const lobby = createLobby("coordinator-stale-lobby", [], 1000);
  storage.writeMatch(lobby);

  const state: RankedQueueCoordinatorState = {
    lastProcessAtMs: 0,
    lastCleanupAtMs: 0,
  };

  const dispatcher = {} as nkruntime.MatchDispatcher;
  const ctx = {} as nkruntime.Context;

  // 1. Initial tick with lastCleanupAtMs = 0 -> triggers cleanup immediately
  const initResult = rankedQueueCoordinatorMatchLoop(
    ctx,
    harness.logger,
    harness.nk,
    dispatcher,
    1,
    state,
    []
  );
  assert.ok(initResult.state.lastCleanupAtMs);
  const firstCleanupMs = initResult.state.lastCleanupAtMs;
  assert.ok(firstCleanupMs > 0);

  // 2. Immediate next tick -> within 24 hours -> does not run cleanup
  // Add a new stale lobby
  const lobby2 = createLobby("coordinator-stale-lobby-2", [], 1000);
  storage.writeMatch(lobby2);

  const secondResult = rankedQueueCoordinatorMatchLoop(
    ctx,
    harness.logger,
    harness.nk,
    dispatcher,
    2,
    initResult.state,
    []
  );
  assert.equal(secondResult.state.lastCleanupAtMs, firstCleanupMs);
  // lobby2 was not cleaned up because cleanup was skipped
  assert.ok(storage.getMatch("coordinator-stale-lobby-2"));

  // 3. Advance state.lastCleanupAtMs to be > 24 hours ago
  const simulatedPastMs = Date.now() - (CLEANUP_INTERVAL_MS + 1000);
  secondResult.state.lastCleanupAtMs = simulatedPastMs;
  const thirdResult = rankedQueueCoordinatorMatchLoop(
    ctx,
    harness.logger,
    harness.nk,
    dispatcher,
    3,
    secondResult.state,
    []
  );
  assert.ok(thirdResult.state.lastCleanupAtMs);
  assert.ok(thirdResult.state.lastCleanupAtMs > simulatedPastMs);
  // Now lobby2 should have been cleaned up
  assert.equal(storage.getMatch("coordinator-stale-lobby-2"), null);
});

test("coordinator error isolation: cleanup errors do not interrupt coordinator loop", () => {
  const harness = createTestHarness();
  const state: RankedQueueCoordinatorState = {
    lastProcessAtMs: 0,
    lastCleanupAtMs: 0,
  };

  // Create a nk proxy where storageList throws an exception
  const brokenNk = {
    ...harness.nk,
    storageList: () => {
      throw new Error("Simulated storage outage during cleanup");
    },
  } as unknown as nkruntime.Nakama;

  const dispatcher = {} as nkruntime.MatchDispatcher;
  const ctx = {} as nkruntime.Context;

  // Should NOT throw
  const result = rankedQueueCoordinatorMatchLoop(
    ctx,
    harness.logger,
    brokenNk,
    dispatcher,
    1,
    state,
    []
  );

  assert.ok(result);
  assert.ok(result.state);
  assert.ok(result.state.lastCleanupAtMs);
  assert.ok(
    harness.logErrors.some((log) =>
      log.includes("Simulated storage outage during cleanup")
    )
  );
});
