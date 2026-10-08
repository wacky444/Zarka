import assert from "node:assert/strict";
import { test } from "node:test";
import { getUserAccountRpc } from "../src/rpc/getUserAccount";
import { setRankedMatchSlotsRpc } from "../src/rpc/setRankedMatchSlots";

type RpcResponse = {
  ok?: boolean;
  ranked_match_slots?: number;
  error?: string;
};

function createHarness(initialMetadata: unknown) {
  const userId = "ranked-slots-owner";
  let user = {
    id: userId,
    username: userId,
    metadata: initialMetadata
  } as unknown as nkruntime.User;
  const nakama = {
    usersGetId: (ids: string[]) => (ids.includes(userId) ? [user] : []),
    accountUpdateId: (...args: unknown[]) => {
      if (args[0] === userId) {
        user = { ...user, metadata: args[7] } as nkruntime.User;
      }
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
