import test from "node:test";
import assert from "node:assert/strict";
import { joinMatchRpc } from "../src/rpc/joinMatch";
import { StorageService } from "../src/services/storageService";
import { createNakamaWrapper } from "../src/services/nakamaWrapper";
import { MatchRecord } from "../src/models/types";
import { buildMatchCardSummary } from "../src/services/matchCardSummary";

Object.assign(globalThis, {
  nkruntime: {
    Codes: {
      INVALID_ARGUMENT: 3,
      NOT_FOUND: 5,
      PERMISSION_DENIED: 7,
      FAILED_PRECONDITION: 9,
      INTERNAL: 13,
    },
  },
});

function createMockHarness() {
  const storage = new Map<string, { value: unknown; version: string }>();
  const users = new Map<string, unknown>();
  let versionCounter = 0;

  users.set("host-user", { zarka: { tutorialCompleted: true } });
  users.set("joiner-user", { zarka: { tutorialCompleted: true } });

  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  } as unknown as nkruntime.Logger;

  const fakeNakama = {
    storageRead: (requests: Array<{ collection: string; key: string; userId: string }>) =>
      requests.flatMap((req) => {
        const item = storage.get(`${req.collection}:${req.key}:${req.userId}`);
        return item ? [{ ...item, collection: req.collection, key: req.key, userId: req.userId }] : [];
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
      for (const req of requests) {
        versionCounter++;
        storage.set(`${req.collection}:${req.key}:${req.userId}`, {
          value: req.value,
          version: `v${versionCounter}`,
        });
      }
      return requests.map((req) => ({
        collection: req.collection,
        key: req.key,
        userId: req.userId,
        version: `v${versionCounter}`,
      }));
    },
    storageList: () => ({ objects: [], cursor: "" }),
    storageDelete: () => {},
    matchCreate: () => "runtime-id",
    matchList: () => [],
    matchSignal: () => "",
    uuidv4: () => "mock-uuid-" + Math.random(),
    usersGetId: (userIds: string[]) =>
      userIds.map((id) => ({
        id,
        username: id,
        metadata: (users.get(id) || {}) as string,
      })),
  } as unknown as nkruntime.Nakama;

  return { nk: fakeNakama, logger };
}

function createMatchRecord(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    match_id: "match-test-1",
    players: ["host-user"],
    playerCharacters: {},
    playerList: {},
    readyStates: { "host-user": false },
    size: 4,
    cols: 4,
    rows: 4,
    roundTime: "23:00",
    autoSkip: true,
    botPlayers: 0,
    created_at: 1_000,
    current_turn: 1,
    creator: "host-user",
    name: "Test match",
    started: true,
    removed: 0,
    ...overrides
  };
}

test("join_match RPC rejects attempts to join started match", () => {
  const harness = createMockHarness();
  const storage = new StorageService(createNakamaWrapper(harness.nk));
  const record = createMatchRecord({ match_id: "started-match", started: true });
  storage.writeMatch(record);

  const joinerCtx: nkruntime.Context = {
    userId: "joiner-user",
    username: "joiner",
    vars: {}
  } as unknown as nkruntime.Context;

  assert.throws(
    () => {
      joinMatchRpc(
        joinerCtx,
        harness.logger,
        harness.nk,
        JSON.stringify({ match_id: "started-match" })
      );
    },
    (err: unknown) => {
      const e = err as { message?: string };
      return e?.message === "match_already_started";
    }
  );
});

test("buildMatchCardSummary sets isJoinable false for started match even with open slots", () => {
  const startedWithOpenSlots = createMatchRecord({
    players: ["host-user"],
    size: 4,
    started: true
  });
  const summaryStarted = buildMatchCardSummary(startedWithOpenSlots);
  assert.equal(summaryStarted.status, "in_progress");
  assert.equal(summaryStarted.isJoinable, false);

  const waitingWithOpenSlots = createMatchRecord({
    players: ["host-user"],
    size: 4,
    started: false,
    current_turn: 0
  });
  const summaryWaiting = buildMatchCardSummary(waitingWithOpenSlots);
  assert.equal(summaryWaiting.status, "waiting");
  assert.equal(summaryWaiting.isJoinable, true);
});
