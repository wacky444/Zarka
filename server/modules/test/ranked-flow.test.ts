import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RANKED_ASSIGNMENT_COLLECTION,
  RANKED_DAILY_PRESENCE_COLLECTION,
  RANKED_MATCH_SETTLEMENT_COLLECTION,
  RANKED_QUEUE_ENROLLMENT_COLLECTION,
  RANKED_QUEUE_TICKET_COLLECTION,
  PUSH_NOTIFICATION_OUTBOX_COLLECTION,
  PUSH_SUBSCRIPTION_COLLECTION,
  SERVER_USER_ID
} from "../src/constants";
import { RANKED_MATCH_METADATA_KEY } from "@shared";
import type { MatchRecord } from "../src/models/types";
import { finalizeMatchIfEnded } from "../src/match/checkEndGame";
import { enqueueRankedMatchSettlement } from "../src/match/rankedElo";
import { createNakamaWrapper } from "../src/services/nakamaWrapper";
import { processRankedQueue, recordRankedSlotPreference } from "../src/services/rankedQueue";
import { StorageService } from "../src/services/storageService";
import { touchRankedPresence } from "../src/services/rankedPresence";

const NOW = 1_700_100_000_000;
const PUSH_SECRET = "ranked-flow-push-secret-that-is-longer-than-32-characters";
const CONTEXT = {
  env: {
    RANKED_MATCHMAKING_ENABLED: "true",
    PUSH_DISPATCHER_URL: "http://push-dispatcher:7355/send",
    PUSH_DISPATCH_SECRET: PUSH_SECRET
  }
} as nkruntime.Context;

type Stored = {
  collection: string;
  key: string;
  userId: string;
  value: unknown;
  version: string;
};

type FakeUser = { id: string; username: string; metadata: unknown };

function createHarness() {
  const records = new Map<string, Stored>();
  const users = new Map<string, FakeUser>();
  const matchParams: Array<Record<string, string>> = [];
  const dispatchedPayloads: Array<Record<string, unknown>> = [];
  let version = 0;
  let uuid = 0;
  const keyOf = (record: { collection: string; key: string; userId: string }) =>
    `${record.collection}:${record.userId}:${record.key}`;
  for (const userId of ["human-a", "human-b"]) {
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
            rankTier: "unranked"
          }
        }
      }
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
          version: String(++version)
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
    usersGetId: (ids: string[]) => ids.flatMap((id) => {
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
      user.metadata = metadata;
    },
    matchCreate: (_handler: string, params: Record<string, string>) => {
      matchParams.push(params);
      return `runtime-${matchParams.length}`;
    },
    matchList: () => [],
    matchSignal: () => "",
    uuidv4: () => `assignment-${++uuid}`,
    httpRequest: (
      _url: string,
      _method: string,
      _headers: Record<string, string>,
      body: string
    ) => {
      dispatchedPayloads.push(JSON.parse(body) as Record<string, unknown>);
      return {
        code: 200,
        headers: [],
        body: JSON.stringify({ ok: true, expiredDeviceIds: [] })
      };
    }
  } as unknown as nkruntime.Nakama;
  const logs: string[] = [];
  const logger = {
    debug: (message: string) => logs.push(message),
    info: (message: string) => logs.push(message),
    warn: (message: string) => logs.push(message),
    error: (message: string) => logs.push(message)
  } as unknown as nkruntime.Logger;

  for (const [index, userId] of ["human-a", "human-b"].entries()) {
    nk.storageWrite([
      {
        collection: PUSH_SUBSCRIPTION_COLLECTION,
        key: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
        userId,
        value: {
          userId,
          deviceId: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
          subscription: {
            endpoint: "https://fcm.googleapis.com/fcm/send/test-token",
            expirationTime: null,
            keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) }
          },
          locale: index === 0 ? "en" : "es",
          updatedAtMs: NOW
        },
        permissionRead: 0,
        permissionWrite: 0
      }
    ]);
  }
  return {
    nk,
    logger,
    records,
    users,
    matchParams,
    dispatchedPayloads,
    logs,
    recordsFor(collection: string): number {
      return Array.from(records.values()).filter(
        (record) => record.collection === collection
      ).length;
    }
  };
}

test("ranked flow queues, starts offline, notifies, places, and settles ELO once", () => {
  const harness = createHarness();
  const storage = new StorageService(createNakamaWrapper(harness.nk));
  for (const userId of ["human-a", "human-b"]) {
    recordRankedSlotPreference(harness.nk, userId, 1, NOW);
    touchRankedPresence(harness.nk, userId, NOW);
  }

  processRankedQueue(harness.nk, harness.logger, NOW, CONTEXT);

  assert.equal(harness.recordsFor(RANKED_QUEUE_ENROLLMENT_COLLECTION), 2);
  assert.equal(harness.recordsFor(RANKED_QUEUE_TICKET_COLLECTION), 2);
  assert.equal(harness.recordsFor(RANKED_DAILY_PRESENCE_COLLECTION), 2);
  assert.equal(harness.recordsFor(RANKED_ASSIGNMENT_COLLECTION), 1);
  assert.equal(harness.matchParams.length, 1);
  assert.equal(harness.matchParams[0].started, "true");
  assert.equal(harness.matchParams[0].botPlayers, "14");

  const assignments = Array.from(harness.records.values()).filter(
    (record) => record.collection === RANKED_ASSIGNMENT_COLLECTION
  );
  const assignment = assignments[0].value as { state: string; matchId: string };
  assert.equal(assignment.state, "active");
  const storedMatch = storage.getMatch(assignment.matchId);
  assert.ok(storedMatch);
  const match = storedMatch.match;
  assert.equal(match.started, true);
  assert.equal(match.size, 16);
  assert.equal(Object.keys(match.playerCharacters).length, 16);
  assert.equal(match.metadata?.[RANKED_MATCH_METADATA_KEY]?.eloSnapshots["human-a"], 1000);

  const outboxes = Array.from(harness.records.values()).filter(
    (record) => record.collection === PUSH_NOTIFICATION_OUTBOX_COLLECTION
  );
  assert.equal(outboxes.length, 1);
  assert.equal((outboxes[0].value as { status: string }).status, "delivered");
  assert.equal(harness.dispatchedPayloads.length, 1);
  assert.equal(harness.dispatchedPayloads[0].event, "ranked_match_started");
  assert.equal(harness.dispatchedPayloads[0].matchId, match.match_id);
  assert.equal("turn" in harness.dispatchedPayloads[0], false);
  assert.equal((harness.dispatchedPayloads[0].subscriptions as unknown[]).length, 2);

  for (const [playerId, character] of Object.entries(match.playerCharacters)) {
    character.secretTeamId = undefined;
    character.teamId = playerId.startsWith("bot") ? "bots" : playerId;
    character.stats.health.current = playerId === "human-a" ? 100 : 0;
  }
  const outcome = finalizeMatchIfEnded(
    match,
    harness.nk,
    harness.logger,
    [],
    1
  );
  assert.equal(outcome.ended, true);
  assert.equal(match.removed, 1);
  const report = storage.getMatchReport(match.match_id);
  assert.ok(report);
  assert.equal(report.teams.find((team) => team.team_id === "human-a")?.rank, 1);
  assert.equal(report.teams.find((team) => team.team_id === "human-b")?.rank, 2);
  assert.equal(report.teams.find((team) => team.team_id === "bots")?.rank, 2);

  const userA = harness.users.get("human-a")!.metadata as {
    zarka: { stats: { elo: number; matchesPlayed: number; wins: number } };
  };
  const userB = harness.users.get("human-b")!.metadata as {
    zarka: { stats: { elo: number; matchesPlayed: number; losses: number } };
  };
  assert.deepEqual(
    [userA.zarka.stats.elo, userA.zarka.stats.matchesPlayed, userA.zarka.stats.wins],
    [1002, 1, 1]
  );
  assert.deepEqual(
    [userB.zarka.stats.elo, userB.zarka.stats.matchesPlayed, userB.zarka.stats.losses],
    [999, 1, 1]
  );
  assert.equal(harness.users.has("bot1"), false);

  enqueueRankedMatchSettlement(
    match,
    {
      ended: true,
      reason: "last_alive",
      winnerId: "human-a",
      aliveCharacterIds: ["human-a"]
    },
    harness.nk,
    harness.logger,
    Date.now() + 60_000
  );
  assert.deepEqual(
    [userA.zarka.stats.elo, userA.zarka.stats.matchesPlayed],
    [1002, 1]
  );
  assert.deepEqual(
    [userB.zarka.stats.elo, userB.zarka.stats.matchesPlayed],
    [999, 1]
  );
  assert.equal(harness.recordsFor(RANKED_MATCH_SETTLEMENT_COLLECTION), 0);
  storage.writeMatch(match, storedMatch.version);
  assert.equal(storage.getMatch(match.match_id)?.match.removed, 1);
});
