import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TUTORIAL_BOT_ID,
  TUTORIAL_MATCH_METADATA_KEY,
  type PlayerCharacter,
} from "@shared";
import type { MatchRecord } from "../src/models/types";
import { createDefaultCharacter } from "../src/utils/playerCharacter";
import { createStorageService } from "../src/services/storageService";
import { terminalizeMatchForInactivity } from "../src/match/inactivityTerminalize";
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
    matchSignal: (matchId: string, data: string) => {
      signals.push({ matchId, data });
    },
  } as unknown as nkruntime.Nakama;

  const logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as nkruntime.Logger;

  return { nk, logger, users, records, signals };
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

function createActiveMatch(id = "match-active", players = ["human-a", "human-b"]): MatchRecord {
  const characters: Record<string, PlayerCharacter> = {};
  for (const p of players) {
    characters[p] = createCharacter(p, `Char_${p}`, { teamId: `team_${p}` });
  }

  return {
    match_id: id,
    name: "Active Inactive Match",
    creator: players[0],
    started: true,
    removed: 0,
    created_at: 1000,
    started_at: 1010,
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

test("Active match terminalized as draw with reason: inactivity_timeout and participant draw stats incremented once", () => {
  const harness = createTestHarness(["human-a", "human-b"]);
  const storage = createStorageService(harness.nk);
  const match = createActiveMatch("test-match-draw", ["human-a", "human-b"]);
  storage.writeMatch(match);
  const initialRead = storage.getMatch(match.match_id);
  assert.ok(initialRead);

  const report = terminalizeMatchForInactivity(
    match,
    storage,
    harness.nk,
    harness.logger,
    initialRead.version,
    1700000000,
  );

  assert.ok(report);
  assert.equal(report.match_id, match.match_id);
  assert.equal(report.reason, "inactivity_timeout");
  assert.equal(report.winning_team_id, undefined);
  assert.deepEqual(report.winning_character_ids, []);
  assert.equal(report.ended_at, 1700000000);
  assert.ok(report.teams.length > 0);
  for (const team of report.teams) {
    assert.equal(team.won, false);
  }

  // Verify match state mutated in memory and persisted in storage
  assert.equal(match.removed, 1);
  assert.equal(match.started, false);
  const updatedMatch = storage.getMatch(match.match_id);
  assert.ok(updatedMatch);
  assert.equal(updatedMatch.match.removed, 1);
  assert.equal(updatedMatch.match.started, false);

  // Verify participant stats incremented once
  const userA = harness.users.get("human-a")?.metadata?.zarka as {
    stats?: { matchesPlayed?: number; draws?: number; wins?: number; losses?: number; currentWinStreak?: number };
  };
  const userB = harness.users.get("human-b")?.metadata?.zarka as {
    stats?: { matchesPlayed?: number; draws?: number; wins?: number; losses?: number; currentWinStreak?: number };
  };

  assert.equal(userA.stats?.matchesPlayed, 1);
  assert.equal(userA.stats?.draws, 1);
  assert.equal(userA.stats?.wins, 0);
  assert.equal(userA.stats?.losses, 0);
  assert.equal(userA.stats?.currentWinStreak, 0);

  assert.equal(userB.stats?.matchesPlayed, 1);
  assert.equal(userB.stats?.draws, 1);
  assert.equal(userB.stats?.wins, 0);
  assert.equal(userB.stats?.losses, 0);
  assert.equal(userB.stats?.currentWinStreak, 0);

  // Verify signals sent: match_ended with inactivity_timeout and match_removed
  const parsedSignals = harness.signals.map((s) => JSON.parse(s.data));
  const matchEndedSignal = parsedSignals.find((s) => s.type === "match_ended");
  const matchRemovedSignal = parsedSignals.find((s) => s.type === "match_removed");

  assert.ok(matchEndedSignal);
  assert.equal(matchEndedSignal.reason, "inactivity_timeout");
  assert.equal(matchEndedSignal.winnerId, undefined);
  assert.deepEqual(matchEndedSignal.winnerIds, []);

  assert.ok(matchRemovedSignal);
});

test("Stale tutorial match terminalized without granting tutorialCompleted", () => {
  const harness = createTestHarness(["human-t"]);
  const storage = createStorageService(harness.nk);
  const match = createActiveMatch("test-match-tutorial", ["human-t"]);
  match.metadata = { [TUTORIAL_MATCH_METADATA_KEY]: { version: 1 } };
  match.playerCharacters[TUTORIAL_BOT_ID] = createCharacter(TUTORIAL_BOT_ID, "TutorialBot", { teamId: "team_bot" });
  storage.writeMatch(match);

  const report = terminalizeMatchForInactivity(
    match,
    storage,
    harness.nk,
    harness.logger,
  );

  assert.ok(report);
  assert.equal(report.reason, "inactivity_timeout");
  assert.equal(report.winning_team_id, undefined);
  assert.deepEqual(report.winning_character_ids, []);

  const userT = harness.users.get("human-t")?.metadata?.zarka as {
    tutorialCompleted?: boolean;
    stats?: { matchesPlayed?: number; draws?: number; wins?: number };
  };

  // Must NOT grant tutorial completed!
  assert.equal(userT.tutorialCompleted, false);
  assert.equal(userT.stats?.matchesPlayed, 1);
  assert.equal(userT.stats?.draws, 1);
  assert.equal(userT.stats?.wins, 0);
});

test("Solo / single-human match terminalized as draw without a winner", () => {
  const harness = createTestHarness(["human-solo"]);
  const storage = createStorageService(harness.nk);
  const match = createActiveMatch("test-match-solo", ["human-solo"]);
  storage.writeMatch(match);

  const report = terminalizeMatchForInactivity(
    match,
    storage,
    harness.nk,
    harness.logger,
  );

  assert.ok(report);
  assert.equal(report.reason, "inactivity_timeout");
  assert.equal(report.winning_team_id, undefined);
  assert.deepEqual(report.winning_character_ids, []);
  for (const team of report.teams) {
    assert.equal(team.won, false);
  }

  const userSolo = harness.users.get("human-solo")?.metadata?.zarka as {
    stats?: { matchesPlayed?: number; draws?: number; wins?: number; losses?: number };
  };

  assert.equal(userSolo.stats?.matchesPlayed, 1);
  assert.equal(userSolo.stats?.draws, 1);
  assert.equal(userSolo.stats?.wins, 0);
  assert.equal(userSolo.stats?.losses, 0);
});

test("Idempotent execution on already-terminalized records", () => {
  const harness = createTestHarness(["human-a"]);
  const storage = createStorageService(harness.nk);
  const match = createActiveMatch("test-match-idempotent", ["human-a"]);
  storage.writeMatch(match);

  const firstReport = terminalizeMatchForInactivity(
    match,
    storage,
    harness.nk,
    harness.logger,
  );
  assert.ok(firstReport);

  const userAAfterFirst = harness.users.get("human-a")?.metadata?.zarka as {
    stats?: { matchesPlayed?: number; draws?: number };
  };
  assert.equal(userAAfterFirst.stats?.matchesPlayed, 1);
  assert.equal(userAAfterFirst.stats?.draws, 1);

  // Second execution on same match
  const secondReport = terminalizeMatchForInactivity(
    match,
    storage,
    harness.nk,
    harness.logger,
  );

  assert.ok(secondReport);
  assert.equal(secondReport.match_id, firstReport.match_id);

  // Stats should NOT be incremented again!
  const userAAfterSecond = harness.users.get("human-a")?.metadata?.zarka as {
    stats?: { matchesPlayed?: number; draws?: number };
  };
  assert.equal(userAAfterSecond.stats?.matchesPlayed, 1);
  assert.equal(userAAfterSecond.stats?.draws, 1);

  // Edge case: storage has report, but match object passed has removed: 0
  const staleMatch = { ...match, removed: 0, started: true };
  const recoveredReport = terminalizeMatchForInactivity(
    staleMatch,
    storage,
    harness.nk,
    harness.logger,
  );
  assert.ok(recoveredReport);
  assert.equal(staleMatch.removed, 1);
  assert.equal(staleMatch.started, false);
  assert.equal(userAAfterSecond.stats?.matchesPlayed, 1);

  // Edge case: unstarted match is not eligible
  const unstartedMatch = createActiveMatch("unstarted-match", ["human-a"]);
  unstartedMatch.started = false;
  const unstartedResult = terminalizeMatchForInactivity(
    unstartedMatch,
    storage,
    harness.nk,
    harness.logger,
  );
  assert.equal(unstartedResult, null);

  // Edge case: already removed match without report is not eligible
  const removedMatch = createActiveMatch("removed-match", ["human-a"]);
  removedMatch.removed = 1;
  const removedResult = terminalizeMatchForInactivity(
    removedMatch,
    storage,
    harness.nk,
    harness.logger,
  );
  assert.equal(removedResult, null);
});
