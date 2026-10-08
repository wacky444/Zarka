import assert from "node:assert/strict";
import { test } from "node:test";
import { getUserAccountRpc } from "../src/rpc/getUserAccount";
import { RANKED_QUEUE_ENROLLMENT_COLLECTION } from "../src/constants";
import { setRankedMatchSlotsRpc } from "../src/rpc/setRankedMatchSlots";

type RpcResponse = {
  ok?: boolean;
  ranked_match_slots?: number;
  error?: string;
};

function createHarness(initialMetadata: unknown) {
  const userId = "ranked-slots-owner";
  const storage = new Map<
    string,
    { collection: string; key: string; userId: string; value: unknown; version: string }
  >();
  let storageVersion = 0;
  let uuid = 0;
  let failNextMultiUpdate = false;
  let user = {
    id: userId,
    username: userId,
    metadata: initialMetadata
  } as unknown as nkruntime.User;
  const storageKey = (record: { collection: string; key: string; userId: string }) =>
    `${record.collection}:${record.userId}:${record.key}`;
  const writeStorage = (requests: nkruntime.StorageWriteRequest[]) => {
    for (const request of requests) {
      const current = storage.get(storageKey({
        collection: request.collection,
        key: request.key,
        userId: request.userId ?? ""
      }));
      const expectedVersion =
        request.version === "" || request.version === "*"
          ? undefined
          : request.version;
      if (request.version !== undefined && expectedVersion !== current?.version) {
        throw new Error("version conflict");
      }
    }
    for (const request of requests) {
      const entry = {
        collection: request.collection,
        key: request.key,
        userId: request.userId ?? "",
        value: request.value,
        version: String(++storageVersion)
      };
      storage.set(storageKey(entry), entry);
    }
  };
  const nakama = {
    usersGetId: (ids: string[]) => (ids.includes(userId) ? [user] : []),
    accountUpdateId: (...args: unknown[]) => {
      if (args[0] === userId) {
        user = { ...user, metadata: args[7] } as nkruntime.User;
      }
    },
    storageRead: (requests: Array<{ collection: string; key: string; userId: string }>) =>
      requests.flatMap((request) => {
        const entry = storage.get(storageKey(request));
        return entry ? [entry] : [];
      }),
    storageWrite: writeStorage,
    multiUpdate: (
      accountUpdates: nkruntime.UserUpdateAccount[] | null,
      storageUpdates: nkruntime.StorageWriteRequest[] | null
    ) => {
      if (failNextMultiUpdate) {
        failNextMultiUpdate = false;
        throw new Error("simulated_multi_update_failure");
      }
      if (storageUpdates) writeStorage(storageUpdates);
      for (const update of accountUpdates ?? []) {
        if (update.userId === userId) {
          user = { ...user, metadata: update.metadata } as nkruntime.User;
        }
      }
    },
    uuidv4: () => `metadata-lock-${++uuid}`,
    storageList: (storageUserId: string, collection: string) => ({
      objects: Array.from(storage.values()).filter(
        (entry) => entry.userId === storageUserId && entry.collection === collection
      ),
      cursor: ""
    }),
    storageDelete: (requests: Array<{ collection: string; key: string; userId: string }>) => {
      for (const request of requests) storage.delete(storageKey(request));
    }
  } as unknown as nkruntime.Nakama;
  const logger = {
    info: () => undefined,
    error: () => undefined
  } as unknown as nkruntime.Logger;

  return {
    userId,
    logger,
    nakama,
    get metadata(): unknown {
      return (user as unknown as { metadata?: unknown }).metadata;
    },
    failNextMultiUpdate(): void {
      failNextMultiUpdate = true;
    },
    get enrollment(): unknown {
      return Array.from(storage.values()).find(
        (entry) => entry.collection === RANKED_QUEUE_ENROLLMENT_COLLECTION
      )?.value;
    },
    setSlots(slots: unknown, userIdOverride?: string): RpcResponse {
      return JSON.parse(
        setRankedMatchSlotsRpc(
          { userId: userIdOverride ?? userId } as nkruntime.Context,
          logger,
          nakama,
          JSON.stringify({ ranked_match_slots: slots })
        )
      ) as RpcResponse;
    },
    readAccount(): { account?: { rankedMatchSlots?: number } } {
      return JSON.parse(
        getUserAccountRpc(
          { userId } as nkruntime.Context,
          logger,
          nakama,
          ""
        )
      ) as { account?: { rankedMatchSlots?: number } };
    }
  };
}

test("set_ranked_match_slots saves each supported value and reads it back", () => {
  for (const slots of [0, 1, 2, 3]) {
    const harness = createHarness({ zarka: {} });
    const result = harness.setSlots(slots);
    assert.deepEqual(result, { ok: true, ranked_match_slots: slots });
    assert.equal(harness.readAccount().account?.rankedMatchSlots, slots);
    assert.equal(
      (harness.enrollment as { desiredSlots: number } | undefined)?.desiredSlots,
      slots
    );
  }
});

test("set_ranked_match_slots preserves unrelated metadata", () => {
  const original = {
    unrelated: { keep: true },
    zarka: {
      stats: { wins: 9 },
      cosmetics: { selectedSkinId: { body: "kept.png" } },
      tutorialCompleted: true,
      anotherSetting: "preserved"
    }
  };
  const harness = createHarness(original);

  assert.equal(harness.setSlots(2).ok, true);
  assert.deepEqual(harness.metadata, {
    unrelated: { keep: true },
    zarka: {
      stats: { wins: 9 },
      cosmetics: { selectedSkinId: { body: "kept.png" } },
      tutorialCompleted: true,
      anotherSetting: "preserved",
      rankedMatchSlots: 2
    }
  });
});

test("set_ranked_match_slots rejects invalid values without changing metadata", () => {
  for (const slots of [-1, 4, 1.5, "2", null, true, undefined]) {
    const original = { zarka: { stats: { wins: 3 } } };
    const harness = createHarness(original);
    assert.equal(harness.setSlots(slots).error, "invalid_ranked_match_slots");
    assert.deepEqual(harness.metadata, original);
  }

  const harness = createHarness({ zarka: {} });
  assert.equal(
    JSON.parse(
      setRankedMatchSlotsRpc(
        { userId: harness.userId } as nkruntime.Context,
        harness.logger,
        harness.nakama,
        "{"
      )
    ).error,
    "bad_json"
  );
  assert.deepEqual(harness.metadata, { zarka: {} });
});

test("slot preference and queue enrollment fail atomically", () => {
  const initialMetadata = { unrelated: true, zarka: { stats: { elo: 1100 } } };
  const harness = createHarness(initialMetadata);
  harness.failNextMultiUpdate();

  assert.equal(harness.setSlots(2).error, "internal_error");
  assert.deepEqual(harness.metadata, initialMetadata);
  assert.equal(harness.enrollment, undefined);
});

test("set_ranked_match_slots requires authentication and ignores supplied identity", () => {
  const harness = createHarness({ zarka: {} });
  assert.equal(harness.setSlots(1, "").error, "unauthorized");

  const result = JSON.parse(
    setRankedMatchSlotsRpc(
      { userId: harness.userId } as nkruntime.Context,
      harness.logger,
      harness.nakama,
      JSON.stringify({ user_id: "another-user", ranked_match_slots: 3 })
    )
  ) as RpcResponse;
  assert.equal(result.ok, true);
  assert.equal(harness.readAccount().account?.rankedMatchSlots, 3);
});
