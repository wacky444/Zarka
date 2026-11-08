import assert from "node:assert/strict";
import { test } from "node:test";
import { createMatchRpc } from "../src/rpc/createMatch";
import { createTutorialMatchRpc } from "../src/rpc/createTutorialMatch";
import { updateSettingsRpc } from "../src/rpc/updateSettings";
import {
  buildMatchCardSummary,
  buildMyMatchCardSummary
} from "../src/services/matchCardSummary";
import { MATCH_COLLECTION } from "../src/constants";
import type { MatchRecord } from "../src/models/types";
import type { CreateMatchPayload, UpdateSettingsPayload } from "@shared";

Object.assign(globalThis, {
  nkruntime: {
    Codes: {
      INVALID_ARGUMENT: 3,
      PERMISSION_DENIED: 7,
      NOT_FOUND: 5,
      FAILED_PRECONDITION: 9,
      INTERNAL: 13
    }
  }
});

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
  metadata: unknown;
};

function createHarness(humanIds: string[]) {
  const records = new Map<string, Stored>();
  const users = new Map<string, FakeUser>();
  const matchParams: Array<Record<string, string>> = [];
  const signals: string[] = [];
  let version = 0;
  let runtimeMatchId = 0;
  let gameId = 0;
  const keyFor = (request: { collection: string; key: string; userId: string }) =>
    `${request.collection}:${request.userId}:${request.key}`;

  for (const userId of humanIds) {
    users.set(userId, {
      id: userId,
      username: userId,
      metadata: {
        zarka: {
          tutorialCompleted: true,
          stats: { elo: 1100 + users.size }
        }
      }
    });
  }

  const nakama = {
    storageRead: (requests: Array<{ collection: string; key: string; userId: string }>) =>
      requests.flatMap((request) => {
        const stored = records.get(keyFor(request));
        return stored ? [stored] : [];
      }),
    storageWrite: (requests: Array<{
      collection: string;
      key: string;
      userId: string;
      value: unknown;
      version?: string;
    }>) => {
      for (const request of requests) {
        const key = keyFor(request);
        const current = records.get(key);
        if (
          request.version !== undefined &&
          request.version !== "*" &&
          request.version !== current?.version
        ) {
          throw new Error("version conflict");
        }
        records.set(key, {
          collection: request.collection,
          key: request.key,
          userId: request.userId,
          value: request.value,
          version: String(++version)
        });
      }
    },
    storageList: (userId: string, collection: string, limit = 100, _cursor = "") => ({
      objects: Array.from(records.values())
        .filter((entry) => entry.userId === userId && entry.collection === collection)
        .slice(0, limit),
      cursor: ""
    }),
    storageDelete: (requests: Array<{ collection: string; key: string; userId: string }>) => {
      for (const request of requests) records.delete(keyFor(request));
    },
    matchCreate: (_handler: string, params: Record<string, string>) => {
      matchParams.push(params);
      return `runtime-${++runtimeMatchId}`;
    },
    uuidv4: () => `game-${++gameId}`,
    matchList: () => [],
    matchSignal: (_matchId: string, data: string) => signals.push(data),
    usersGetId: (ids: string[]) =>
      ids.flatMap((id) => {
        const user = users.get(id);
        return user ? [user] : [];
      })
  } as unknown as nkruntime.Nakama;

  const logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  } as unknown as nkruntime.Logger;

  return { nakama, logger, records, users, matchParams, signals };
}

test("createMatchRpc defaults loversMode to true and persists on record and params", () => {
  const harness = createHarness(["creator"]);
  const context = { userId: "creator" } as nkruntime.Context;

  const responseRaw = createMatchRpc(context, harness.logger, harness.nakama, "{}");
  const response = JSON.parse(responseRaw) as CreateMatchPayload;

  assert.equal(response.loversMode, true);

  const stored = Array.from(harness.records.values()).find(
    (record) => record.collection === MATCH_COLLECTION
  );
  assert.ok(stored);
  const match = stored.value as MatchRecord;
  assert.equal(match.loversMode, true);

  const params = harness.matchParams[0];
  assert.ok(params);
  assert.equal(params.loversMode, "true");
});

test("createMatchRpc with loversMode: false persists false", () => {
  const harness = createHarness(["creator"]);
  const context = { userId: "creator" } as nkruntime.Context;

  const payload = JSON.stringify({ loversMode: false });
  const responseRaw = createMatchRpc(context, harness.logger, harness.nakama, payload);
  const response = JSON.parse(responseRaw) as CreateMatchPayload;

  assert.equal(response.loversMode, false);

  const stored = Array.from(harness.records.values()).find(
    (record) => record.collection === MATCH_COLLECTION
  );
  assert.ok(stored);
  const match = stored.value as MatchRecord;
  assert.equal(match.loversMode, false);

  const params = harness.matchParams[0];
  assert.ok(params);
  assert.equal(params.loversMode, "false");
});

test("createTutorialMatchRpc explicitly sets loversMode: false and never sets loversTriggerTurn", () => {
  const harness = createHarness(["student"]);
  const context = { userId: "student" } as nkruntime.Context;

  createTutorialMatchRpc(context, harness.logger, harness.nakama, "{}");

  const stored = Array.from(harness.records.values()).find(
    (record) => record.collection === MATCH_COLLECTION
  );
  assert.ok(stored);
  const match = stored.value as MatchRecord;
  assert.equal(match.loversMode, false);
  assert.equal(match.loversTriggerTurn, undefined);
});

test("updateSettingsRpc updates loversMode when not started and signals update", () => {
  const harness = createHarness(["creator"]);
  const context = { userId: "creator" } as nkruntime.Context;

  const createRes = JSON.parse(
    createMatchRpc(context, harness.logger, harness.nakama, "{}")
  ) as CreateMatchPayload;
  assert.equal(createRes.loversMode, true);

  const updatePayload = JSON.stringify({
    match_id: createRes.match_id,
    settings: {
      loversMode: false
    }
  });

  const updateResRaw = updateSettingsRpc(context, harness.logger, harness.nakama, updatePayload);
  const updateRes = JSON.parse(updateResRaw) as UpdateSettingsPayload;
  assert.equal(updateRes.loversMode, false);

  const stored = Array.from(harness.records.values()).find(
    (record) => record.collection === MATCH_COLLECTION
  );
  const match = stored?.value as MatchRecord;
  assert.equal(match.loversMode, false);

  const lastSignal = JSON.parse(harness.signals[harness.signals.length - 1]);
  assert.equal(lastSignal.type, "update_settings");
  assert.equal(lastSignal.loversMode, false);
});

test("updateSettingsRpc does not update loversMode when match is started", () => {
  const harness = createHarness(["creator"]);
  const context = { userId: "creator" } as nkruntime.Context;

  const createRes = JSON.parse(
    createMatchRpc(context, harness.logger, harness.nakama, "{}")
  ) as CreateMatchPayload;

  const stored = Array.from(harness.records.values()).find(
    (record) => record.collection === MATCH_COLLECTION
  );
  const match = stored?.value as MatchRecord;
  match.started = true;

  const updatePayload = JSON.stringify({
    match_id: createRes.match_id,
    settings: {
      loversMode: false
    }
  });

  const updateResRaw = updateSettingsRpc(context, harness.logger, harness.nakama, updatePayload);
  const updateRes = JSON.parse(updateResRaw) as UpdateSettingsPayload;
  // match.loversMode remains true because started is true
  assert.equal(updateRes.loversMode, true);
  assert.equal(match.loversMode, true);
});

test("buildMatchCardSummary and buildMyMatchCardSummary map loversMode", () => {
  const matchRecordTrue = {
    match_id: "m-true",
    players: ["p1"],
    size: 4,
    current_turn: 1,
    started: true,
    loversMode: true
  } as unknown as MatchRecord;

  const summaryTrue = buildMatchCardSummary(matchRecordTrue);
  assert.equal(summaryTrue.loversMode, true);
  const mySummaryTrue = buildMyMatchCardSummary(matchRecordTrue, "p1");
  assert.equal(mySummaryTrue.loversMode, true);

  const matchRecordFalse = {
    match_id: "m-false",
    players: ["p1"],
    size: 4,
    current_turn: 1,
    started: true,
    loversMode: false
  } as unknown as MatchRecord;

  const summaryFalse = buildMatchCardSummary(matchRecordFalse);
  assert.equal(summaryFalse.loversMode, false);
  const mySummaryFalse = buildMyMatchCardSummary(matchRecordFalse, "p1");
  assert.equal(mySummaryFalse.loversMode, false);
});
