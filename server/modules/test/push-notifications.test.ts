import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PUSH_NOTIFICATION_OUTBOX_COLLECTION,
  PUSH_SUBSCRIPTION_COLLECTION,
  PUSH_SUBSCRIPTION_DEVICE_INDEX_COLLECTION,
  SERVER_USER_ID
} from "../src/constants";
import type {
  RankedMatchStartedOutbox,
  StoredPushSubscription,
  TurnNotificationOutbox,
  WebPushSubscription
} from "../src/models/pushNotifications";
import type { MatchRecord } from "../src/models/types";
import { RANKED_MATCH_METADATA_KEY, type ReplayRecord } from "@shared";
import { createNakamaWrapper } from "../src/services/nakamaWrapper";
import { StorageService } from "../src/services/storageService";
import {
  registerPushSubscriptionRpc
} from "../src/rpc/registerPushSubscription";
import {
  unregisterPushSubscriptionRpc
} from "../src/rpc/unregisterPushSubscription";
import {
  createRankedMatchStartedOutbox,
  createTurnNotificationOutbox,
  dispatchRankedMatchStartedOutbox,
  dispatchTurnNotificationOutbox
} from "../src/services/turnPushNotifications";

const runtimeGlobals = globalThis as unknown as {
  nkruntime?: { Codes: Record<string, number> };
};
runtimeGlobals.nkruntime = {
  Codes: {
    INVALID_ARGUMENT: 3,
    UNAUTHENTICATED: 16,
    RESOURCE_EXHAUSTED: 8,
    UNAVAILABLE: 14,
    INTERNAL: 13
  }
};

type Entry = {
  collection: string;
  key: string;
  userId: string;
  value: unknown;
  version: string;
};

const DEVICE_ID = "11111111-1111-4111-8111-111111111111";
const PUSH_SECRET = "test-push-secret-with-more-than-32-characters";
const PUSH_ENV = {
  PUSH_DISPATCHER_URL: "http://push-dispatcher:7355/send",
  PUSH_DISPATCH_SECRET: PUSH_SECRET
};
const SUBSCRIPTION: WebPushSubscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test-token",
  expirationTime: null,
  keys: {
    p256dh: "A".repeat(87),
    auth: "B".repeat(22)
  }
};

function createFakeNakama() {
  const entries = new Map<string, Entry>();
  const writes: nkruntime.StorageWriteRequest[][] = [];
  let versionCounter = 0;
  const keyOf = (collection: string, key: string, userId: string) =>
    `${collection}:${key}:${userId}`;
  const writeRequests = (requests: nkruntime.StorageWriteRequest[]) => {
    for (const request of requests) {
      const key = keyOf(request.collection, request.key, request.userId ?? "");
      const existing = entries.get(key);
      if (
        request.version !== undefined &&
        request.version !== (existing?.version ?? "")
      ) {
        throw new Error("version conflict");
      }
    }
    writes.push(requests);
    for (const request of requests) {
      const key = keyOf(request.collection, request.key, request.userId ?? "");
      entries.set(key, {
        collection: request.collection,
        key: request.key,
        userId: request.userId ?? "",
        value: request.value,
        version: String(++versionCounter)
      });
    }
  };
  const fake = {
    storageRead: (requests: nkruntime.StorageReadRequest[]) =>
      requests.flatMap((request) => {
        const entry = entries.get(
          keyOf(request.collection, request.key, request.userId)
        );
        return entry ? [{ ...entry }] : [];
      }),
    storageList: (
      userId: string,
      collection: string,
      limit = 100,
      cursor = ""
    ) => {
      const offset = cursor ? Number(cursor) : 0;
      const matching = Array.from(entries.values())
        .filter((entry) => entry.userId === userId && entry.collection === collection)
        .sort((left, right) => left.key.localeCompare(right.key));
      const objects = matching.slice(offset, offset + limit);
      const nextOffset = offset + objects.length;
      return {
        objects: objects.map((entry) => ({ ...entry })),
        cursor: nextOffset < matching.length ? String(nextOffset) : ""
      };
    },
    storageWrite: (requests: nkruntime.StorageWriteRequest[]) => writeRequests(requests),
    storageDelete: (requests: nkruntime.StorageDeleteRequest[]) => {
      for (const request of requests) {
        const key = keyOf(request.collection, request.key, request.userId);
        const existing = entries.get(key);
        if (
          request.version !== undefined &&
          request.version !== existing?.version
        ) {
          throw new Error("version conflict");
        }
      }
      for (const request of requests) {
        entries.delete(keyOf(request.collection, request.key, request.userId));
      }
    },
    multiUpdate: (
      _accountUpdates: nkruntime.UserUpdateAccount[] | null,
      storageObjectsUpdates: nkruntime.StorageWriteRequest[] | null,
      storageObjectsDeletes: nkruntime.StorageDeleteRequest[] | null
    ) => {
      for (const request of storageObjectsDeletes ?? []) {
        const key = keyOf(request.collection, request.key, request.userId);
        const existing = entries.get(key);
        if (
          request.version !== undefined &&
          request.version !== existing?.version
        ) {
          throw new Error("version conflict");
        }
      }
      for (const request of storageObjectsDeletes ?? []) {
        entries.delete(keyOf(request.collection, request.key, request.userId));
      }
      writeRequests(storageObjectsUpdates ?? []);
      return { storageWriteAcks: [], walletUpdateAcks: [] };
    },
    matchCreate: () => "",
    matchList: () => ({ matches: [] }),
    matchSignal: () => "",
    httpRequest: () => ({
      code: 200,
      headers: [],
      body: JSON.stringify({ ok: true, expiredDeviceIds: [] })
    })
  };
  return {
    nk: fake as unknown as nkruntime.Nakama,
    entries,
    writes
  };
}

function context(userId: string, env = PUSH_ENV): nkruntime.Context {
  return { userId, env } as unknown as nkruntime.Context;
}

function logger(): nkruntime.Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  } as unknown as nkruntime.Logger;
}

function rpcErrorCode(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code?: number }).code;
  }
  return undefined;
}

function createMatch(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    match_id: "match-notification-test",
    runtime_match_id: "runtime-notification-test",
    creator: "human-player",
    name: "Test",
    size: 2,
    players: ["human-player", "bot1"],
    started: true,
    removed: 0,
    current_turn: 3,
    playerCharacters: {},
    map: { tiles: [] },
    ...overrides
  } as unknown as MatchRecord;
}

function subscriptionEntry(
  userId: string,
  deviceId = DEVICE_ID,
  locale: "en" | "es" = "en"
): StoredPushSubscription {
  return {
    userId,
    deviceId,
    subscription: SUBSCRIPTION,
    locale,
    updatedAtMs: Date.now()
  };
}

function writeSubscription(
  nk: nkruntime.Nakama,
  userId: string,
  deviceId = DEVICE_ID,
  locale: "en" | "es" = "en"
): void {
  nk.storageWrite([
    {
      collection: PUSH_SUBSCRIPTION_COLLECTION,
      key: deviceId,
      userId,
      value: subscriptionEntry(userId, deviceId, locale),
      permissionRead: 0,
      permissionWrite: 0
    },
    {
      collection: PUSH_SUBSCRIPTION_DEVICE_INDEX_COLLECTION,
      key: deviceId,
      userId: SERVER_USER_ID,
      value: { userId },
      permissionRead: 0,
      permissionWrite: 0
    }
  ]);
}

test("push subscription RPC stores records privately and binds one owner per device", () => {
  const { nk, writes } = createFakeNakama();
  const firstContext = context("player-first");
  const payload = JSON.stringify({ device_id: DEVICE_ID, subscription: SUBSCRIPTION, locale: "en" });
  assert.deepEqual(
    JSON.parse(registerPushSubscriptionRpc(firstContext, logger(), nk, payload)),
    { ok: true }
  );
  const savedSubscriptionWrite = writes[0]?.find(
    (request) => request.collection === PUSH_SUBSCRIPTION_COLLECTION
  );
  assert.equal(savedSubscriptionWrite?.permissionRead, 0);
  assert.equal(savedSubscriptionWrite?.permissionWrite, 0);
  const storedSubscription = nk.storageRead([
    {
      collection: PUSH_SUBSCRIPTION_COLLECTION,
      key: DEVICE_ID,
      userId: "player-first"
    }
  ])[0]?.value as StoredPushSubscription | undefined;
  assert.equal(storedSubscription?.locale, "en");

  registerPushSubscriptionRpc(context("player-second"), logger(), nk, payload);
  assert.equal(
    nk.storageRead([
      {
        collection: PUSH_SUBSCRIPTION_COLLECTION,
        key: DEVICE_ID,
        userId: "player-first"
      }
    ]).length,
    0
  );
  const index = nk.storageRead([
    {
      collection: PUSH_SUBSCRIPTION_DEVICE_INDEX_COLLECTION,
      key: DEVICE_ID,
      userId: SERVER_USER_ID
    }
  ])[0];
  assert.equal((index?.value as { userId: string }).userId, "player-second");
});

test("push subscription RPC rejects non-provider endpoints and missing dispatch config", () => {
  const { nk } = createFakeNakama();
  const unsafe = {
    ...SUBSCRIPTION,
    endpoint: "https://127.0.0.1/private"
  };
  assert.throws(
    () =>
      registerPushSubscriptionRpc(
        context("player-first"),
        logger(),
        nk,
        JSON.stringify({ device_id: DEVICE_ID, subscription: unsafe, locale: "en" })
      ),
    (error: unknown) => rpcErrorCode(error) === 3
  );
  assert.throws(
    () =>
      registerPushSubscriptionRpc(
        context("player-first", {}),
        logger(),
        nk,
        JSON.stringify({ device_id: DEVICE_ID, subscription: SUBSCRIPTION, locale: "en" })
      ),
    (error: unknown) => rpcErrorCode(error) === 14
  );
});

test("push subscription RPC enforces per-user device limit", () => {
  const { nk } = createFakeNakama();
  for (let index = 0; index < 8; index += 1) {
    const deviceId = `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`;
    registerPushSubscriptionRpc(
      context("player-first"),
      logger(),
      nk,
      JSON.stringify({ device_id: deviceId, subscription: SUBSCRIPTION, locale: "es" })
    );
  }
  assert.throws(
    () =>
      registerPushSubscriptionRpc(
        context("player-first"),
        logger(),
        nk,
        JSON.stringify({ device_id: "11111111-1111-4111-8111-999999999999", subscription: SUBSCRIPTION, locale: "en" })
      ),
    (error: unknown) => rpcErrorCode(error) === 8
  );
});

test("unregister RPC cannot remove another account's subscription", () => {
  const { nk } = createFakeNakama();
  writeSubscription(nk, "player-first");
  unregisterPushSubscriptionRpc(
    context("player-second"),
    logger(),
    nk,
    JSON.stringify({ device_id: DEVICE_ID })
  );
  assert.equal(
    nk.storageRead([
      {
        collection: PUSH_SUBSCRIPTION_COLLECTION,
        key: DEVICE_ID,
        userId: "player-first"
      }
    ]).length,
    1
  );
  unregisterPushSubscriptionRpc(
    context("player-first"),
    logger(),
    nk,
    JSON.stringify({ device_id: DEVICE_ID })
  );
  assert.equal(
    nk.storageRead([
      {
        collection: PUSH_SUBSCRIPTION_COLLECTION,
        key: DEVICE_ID,
        userId: "player-first"
      }
    ]).length,
    0
  );
});

test("turn outbox snapshots subscribed human participants and skips ended matches", () => {
  const { nk } = createFakeNakama();
  writeSubscription(nk, "human-player");
  const outbox = createTurnNotificationOutbox(
    createMatch(),
    context("human-player"),
    nk,
    logger()
  );
  assert.deepEqual(outbox?.targets, [
    { userId: "human-player", deviceId: DEVICE_ID, locale: "en" }
  ]);
  assert.equal(
    createTurnNotificationOutbox(
      createMatch({ removed: 1 }),
      context("human-player"),
      nk,
      logger()
    ),
    null
  );
  assert.equal(
    createTurnNotificationOutbox(
      createMatch(),
      context("human-player", {}),
      nk,
      logger()
    ),
    null
  );
});

test("match and turn outbox share one atomic storage write", () => {
  const { nk, writes } = createFakeNakama();
  const outbox: TurnNotificationOutbox = {
    id: "turn_match-notification-test_3",
    matchId: "match-notification-test",
    event: "turn_advanced",
    turn: 3,
    targets: [{ userId: "human-player", deviceId: DEVICE_ID }],
    status: "pending",
    attempts: 0,
    nextAttemptAtMs: 0,
    createdAtMs: Date.now()
  };
  new StorageService(createNakamaWrapper(nk)).writeMatchWithPushOutbox(
    createMatch(),
    outbox
  );
  assert.deepEqual(
    writes.at(-1)?.map((request) => request.collection),
    ["async_turn_matches", PUSH_NOTIFICATION_OUTBOX_COLLECTION]
  );

  const failedWrite = createFakeNakama();
  const failedStorage = new StorageService(createNakamaWrapper(failedWrite.nk));
  assert.throws(() =>
    failedStorage.writeMatchWithPushOutbox(createMatch(), outbox, "stale-version")
  );
  assert.equal(
    failedWrite.entries.has(
      `${PUSH_NOTIFICATION_OUTBOX_COLLECTION}:${outbox.id}:${SERVER_USER_ID}`
    ),
    false
  );
});

test("ranked-start outbox stores locale and atomically persists match, replay, and event", () => {
  const { nk, writes, entries } = createFakeNakama();
  writeSubscription(nk, "human-player", DEVICE_ID, "es");
  const match = createMatch({
    match_id: "ranked_assignment-1",
    players: ["human-player", "bot1"],
    metadata: { [RANKED_MATCH_METADATA_KEY]: { assignmentId: "assignment-1" } } as MatchRecord["metadata"]
  });
  const outbox = createRankedMatchStartedOutbox(
    match,
    context("system", PUSH_ENV),
    nk,
    logger()
  );
  assert.deepEqual(outbox, {
    id: "ranked_match_started_ranked_assignment-1",
    matchId: "ranked_assignment-1",
    event: "ranked_match_started",
    targets: [{ userId: "human-player", deviceId: DEVICE_ID, locale: "es" }],
    status: "pending",
    attempts: 0,
    nextAttemptAtMs: 0,
    createdAtMs: outbox?.createdAtMs
  });
  assert.equal(createRankedMatchStartedOutbox(createMatch(), context("system"), nk, logger()), null);

  const replay: ReplayRecord = {
    match_id: match.match_id,
    turn: 0,
    events: [],
    snapshot: {} as ReplayRecord["snapshot"],
    created_at: 100
  };
  new StorageService(createNakamaWrapper(nk)).writeMatchWithReplayTurn0AndPushOutbox(
    match,
    replay,
    outbox!
  );
  assert.deepEqual(
    writes.at(-1)?.map((request) => request.collection),
    ["async_turn_matches", "async_turn_replays", PUSH_NOTIFICATION_OUTBOX_COLLECTION]
  );
  const savedOutbox = entries.get(
    `${PUSH_NOTIFICATION_OUTBOX_COLLECTION}:${outbox!.id}:${SERVER_USER_ID}`
  )?.value as RankedMatchStartedOutbox | undefined;
  assert.equal(savedOutbox?.event, "ranked_match_started");

  let dispatchCount = 0;
  let dispatchPayload: Record<string, unknown> | undefined;
  const dispatchNk = {
    ...nk,
    httpRequest: (
      _url: string,
      _method: string,
      _headers: Record<string, string>,
      body: string
    ) => {
      dispatchCount += 1;
      dispatchPayload = JSON.parse(body) as Record<string, unknown>;
      return { code: 200, headers: [], body: JSON.stringify({ ok: true }) };
    }
  } as unknown as nkruntime.Nakama;
  dispatchRankedMatchStartedOutbox(match.match_id, context("system", PUSH_ENV), dispatchNk, logger());
  dispatchRankedMatchStartedOutbox(match.match_id, context("system", PUSH_ENV), dispatchNk, logger());
  assert.equal(dispatchCount, 1);
  assert.equal(dispatchPayload?.event, "ranked_match_started");
  assert.equal(dispatchPayload?.matchId, match.match_id);
  assert.equal("turn" in (dispatchPayload ?? {}), false);
  assert.equal(
    ((dispatchPayload?.subscriptions as Array<{ locale: string }> | undefined) ?? [])[0]?.locale,
    "es"
  );
});

test("turn outbox dispatch marks success and removes expired subscriptions", () => {
  const { nk, entries } = createFakeNakama();
  writeSubscription(nk, "human-player");
  const outbox: TurnNotificationOutbox = {
    id: "turn_match-notification-test_3",
    matchId: "match-notification-test",
    event: "turn_advanced",
    turn: 3,
    targets: [{ userId: "human-player", deviceId: DEVICE_ID }],
    status: "pending",
    attempts: 0,
    nextAttemptAtMs: 0,
    createdAtMs: Date.now()
  };
  nk.storageWrite([
    {
      collection: PUSH_NOTIFICATION_OUTBOX_COLLECTION,
      key: outbox.id,
      userId: SERVER_USER_ID,
      value: outbox,
      permissionRead: 0,
      permissionWrite: 0
    }
  ]);
  const expiredNk = {
    ...nk,
    httpRequest: () => ({
      code: 200,
      headers: [],
      body: JSON.stringify({ ok: true, expiredDeviceIds: [DEVICE_ID] })
    })
  } as unknown as nkruntime.Nakama;
  dispatchTurnNotificationOutbox(
    outbox.matchId,
    outbox.turn,
    context("human-player"),
    expiredNk,
    logger()
  );
  const storedOutbox = entries.get(
    `${PUSH_NOTIFICATION_OUTBOX_COLLECTION}:${outbox.id}:${SERVER_USER_ID}`
  );
  assert.equal(
    (storedOutbox?.value as TurnNotificationOutbox).status,
    "delivered"
  );
  assert.equal(
    nk.storageRead([
      {
        collection: PUSH_SUBSCRIPTION_COLLECTION,
        key: DEVICE_ID,
        userId: "human-player"
      }
    ]).length,
    0
  );
});

test("transient push failures remain in the outbox for retry", () => {
  const { nk, entries } = createFakeNakama();
  writeSubscription(nk, "human-player");
  const outbox: TurnNotificationOutbox = {
    id: "turn_match-notification-retry_3",
    matchId: "match-notification-retry",
    event: "turn_advanced",
    turn: 3,
    targets: [{ userId: "human-player", deviceId: DEVICE_ID }],
    status: "pending",
    attempts: 0,
    nextAttemptAtMs: 0,
    createdAtMs: Date.now()
  };
  nk.storageWrite([
    {
      collection: PUSH_NOTIFICATION_OUTBOX_COLLECTION,
      key: outbox.id,
      userId: SERVER_USER_ID,
      value: outbox,
      permissionRead: 0,
      permissionWrite: 0
    }
  ]);
  const retryNk = {
    ...nk,
    httpRequest: () => ({
      code: 503,
      headers: [],
      body: JSON.stringify({ ok: false, expiredDeviceIds: [] })
    })
  } as unknown as nkruntime.Nakama;
  dispatchTurnNotificationOutbox(
    outbox.matchId,
    outbox.turn,
    context("human-player"),
    retryNk,
    logger()
  );
  const storedOutbox = entries.get(
    `${PUSH_NOTIFICATION_OUTBOX_COLLECTION}:${outbox.id}:${SERVER_USER_ID}`
  )?.value as TurnNotificationOutbox | undefined;
  assert.equal(storedOutbox?.status, "pending");
  assert.equal(storedOutbox?.attempts, 1);
  assert.ok((storedOutbox?.nextAttemptAtMs ?? 0) > Date.now());
});
