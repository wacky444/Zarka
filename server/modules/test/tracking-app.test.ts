/// <reference path="../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  ShopLibrary,
  type Axial,
  type C4Record,
  type ReplayPlayerEvent,
  type TrapRecord
} from "@shared";
import {
  MATCH_COLLECTION,
  MATCH_KEY_PREFIX,
  SERVER_USER_ID
} from "../src/constants";
import type { MatchRecord } from "../src/models/types";
import { buyShopItemRpc } from "../src/rpc/buyShopItem";
import { createDefaultCharacter } from "../src/utils/playerCharacter";

const runtimeGlobals = globalThis as unknown as {
  nkruntime?: { Codes: Record<string, number> };
};
runtimeGlobals.nkruntime = {
  Codes: {
    INVALID_ARGUMENT: 3,
    NOT_FOUND: 5,
    PERMISSION_DENIED: 7,
    FAILED_PRECONDITION: 9,
    ABORTED: 10
  }
};

type StoredMatch = {
  value: MatchRecord;
  version: string;
};

function createTestContext(userId: string): nkruntime.Context {
  return {
    userId,
    username: `${userId}_user`,
    vars: {},
    env: {}
  } as unknown as nkruntime.Context;
}

function createTestLogger(): nkruntime.Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  } as unknown as nkruntime.Logger;
}

function createMatchWithState(options?: {
  actorZarkans?: number;
  actorCoord?: Axial;
  c4s?: C4Record[];
  traps?: TrapRecord[];
}): MatchRecord {
  const actor = createDefaultCharacter("buyer");
  actor.economy.zarkans = options?.actorZarkans ?? 20;
  actor.position = {
    tileId: "tile_2_3",
    coord: options?.actorCoord ?? { q: 2, r: 3 }
  };

  return {
    match_id: "test-match",
    runtime_match_id: "runtime-test-match",
    players: ["buyer"],
    playerCharacters: { buyer: actor },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 1,
    started: true,
    removed: 0,
    c4s: options?.c4s ?? [],
    traps: options?.traps ?? []
  };
}

function createNakama(initialMatch: MatchRecord) {
  const stored: StoredMatch = { value: initialMatch, version: "v1" };
  const fake = {
    storageRead: (requests: nkruntime.StorageReadRequest[]) =>
      requests
        .filter(
          (req) =>
            req.collection === MATCH_COLLECTION &&
            req.key === `${MATCH_KEY_PREFIX}${initialMatch.match_id}` &&
            req.userId === SERVER_USER_ID
        )
        .map((req) => ({
          collection: req.collection,
          key: req.key,
          userId: req.userId,
          value: stored.value,
          version: stored.version,
          permissionRead: 2,
          permissionWrite: 0,
          createTime: 0,
          updateTime: 0
        })),
    storageWrite: (writes: nkruntime.StorageWriteRequest[]) =>
      writes.map((w) => {
        if (w.collection === MATCH_COLLECTION) {
          const val = w.value as { match?: MatchRecord } | MatchRecord;
          stored.value = JSON.parse(
            JSON.stringify("match" in val && val.match ? val.match : val)
          ) as MatchRecord;
          stored.version = `v_${Date.now()}`;
        }
        return {
          collection: w.collection,
          key: w.key,
          userId: w.userId,
          version: stored.version
        };
      }),
    storageList: () => ({ objects: [] }),
    storageDelete: () => {},
    matchCreate: () => "match-id",
    matchList: () => [],
    matchSignal: () => ""
  };
  return { fakeNakama: fake as unknown as nkruntime.Nakama, stored };
}

test("tracking_app is implemented in ShopLibrary and ActionLibrary", () => {
  assert.equal(ShopLibrary.tracking_app.implemented, true);
  assert.equal(ShopLibrary.tracking_app.cost, 8);
  assert.equal(ShopLibrary.tracking_app.category, "Applications");
  assert.equal(ActionLibrary.buy_tracking_app.developed, true);
});

test("buyShopItemRpc fails if player has insufficient zarkans for tracking app", () => {
  const match = createMatchWithState({ actorZarkans: 7 });
  const { fakeNakama } = createNakama(match);
  const ctx = createTestContext("buyer");
  const logger = createTestLogger();

  assert.throws(
    () => {
      buyShopItemRpc(
        ctx,
        logger,
        fakeNakama,
        JSON.stringify({ match_id: "test-match", shop_id: "tracking_app" })
      );
    },
    (err: unknown) => {
      const e = err as { message: string };
      return e.message.includes("insufficient_zarkans");
    }
  );
});

test("buyShopItemRpc succeeds and reports 0 when no c4 or traps exist", () => {
  const match = createMatchWithState({ actorZarkans: 10 });
  const { fakeNakama, stored } = createNakama(match);
  const ctx = createTestContext("buyer");
  const logger = createTestLogger();

  const responseJson = buyShopItemRpc(
    ctx,
    logger,
    fakeNakama,
    JSON.stringify({ match_id: "test-match", shop_id: "tracking_app" })
  );
  const response = JSON.parse(responseJson) as {
    ok: boolean;
    character: { economy: { zarkans: number } };
    event: ReplayPlayerEvent;
  };

  assert.equal(response.ok, true);
  assert.equal(response.character.economy.zarkans, 2); // 10 - 8 = 2
  assert.equal(stored.value.playerCharacters.buyer.economy.zarkans, 2);

  const event = response.event;
  assert.equal(event.kind, "player");
  assert.equal(event.action.actionId, "buy_tracking_app");
  assert.deepEqual(event.visibility, {
    scope: "limited",
    playerIds: ["buyer"]
  });

  const metadata = event.action.metadata as {
    c4Current: number;
    c4Distance1: number;
    trapsLocation: number;
  };
  assert.equal(metadata.c4Current, 0);
  assert.equal(metadata.c4Distance1, 0);
  assert.equal(metadata.trapsLocation, 0);
});

test("buyShopItemRpc accurately detects c4 at current cell, distance 1, and traps in location", () => {
  // Buyer is at (2, 3)
  const c4s: C4Record[] = [
    {
      id: "c4-curr-1",
      ownerId: "enemy1",
      tileId: "t_2_3",
      coord: { q: 2, r: 3 },
      placedTurn: 1
    },
    {
      id: "c4-dist1-1",
      ownerId: "enemy2",
      tileId: "t_3_3",
      coord: { q: 3, r: 3 }, // adjacent
      placedTurn: 1
    },
    {
      id: "c4-dist1-2",
      ownerId: "enemy3",
      tileId: "t_2_2",
      coord: { q: 2, r: 2 }, // adjacent
      placedTurn: 1
    },
    {
      id: "c4-dist2",
      ownerId: "enemy4",
      tileId: "t_4_3",
      coord: { q: 4, r: 3 }, // distance 2
      placedTurn: 1
    }
  ];

  const traps: TrapRecord[] = [
    // Trap where "from" is buyer's cell
    {
      id: "trap-from-curr",
      ownerId: "enemy1",
      from: { tileId: "t_2_3", coord: { q: 2, r: 3 } },
      to: { tileId: "t_3_3", coord: { q: 3, r: 3 } },
      damage: 7,
      placedTurn: 1
    },
    // Trap where "to" is buyer's cell
    {
      id: "trap-to-curr",
      ownerId: "enemy2",
      from: { tileId: "t_2_4", coord: { q: 2, r: 4 } },
      to: { tileId: "t_2_3", coord: { q: 2, r: 3 } },
      damage: 7,
      placedTurn: 1
    },
    // Trap between two other cells (not touching buyer's cell)
    {
      id: "trap-other",
      ownerId: "enemy3",
      from: { tileId: "t_3_3", coord: { q: 3, r: 3 } },
      to: { tileId: "t_4_3", coord: { q: 4, r: 3 } },
      damage: 7,
      placedTurn: 1
    }
  ];

  const match = createMatchWithState({
    actorZarkans: 20,
    actorCoord: { q: 2, r: 3 },
    c4s,
    traps
  });
  const { fakeNakama } = createNakama(match);
  const ctx = createTestContext("buyer");
  const logger = createTestLogger();

  const responseJson = buyShopItemRpc(
    ctx,
    logger,
    fakeNakama,
    JSON.stringify({ match_id: "test-match", shop_id: "tracking_app" })
  );
  const response = JSON.parse(responseJson) as {
    ok: boolean;
    event: ReplayPlayerEvent;
  };

  assert.equal(response.ok, true);
  const metadata = response.event.action.metadata as {
    c4Current: number;
    c4Distance1: number;
    trapsLocation: number;
  };
  assert.equal(metadata.c4Current, 1);
  assert.equal(metadata.c4Distance1, 2);
  assert.equal(metadata.trapsLocation, 2);
});
