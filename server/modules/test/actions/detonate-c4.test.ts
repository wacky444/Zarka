/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  type C4Record,
  type HexTileSnapshot,
  type ReplayEvent,
} from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executeAction } from "../../src/match/actionExecutor";
import { tailorReplayEvents } from "../../src/match/replay/tailorReplay";
import { updateMainActionRpc } from "../../src/rpc/updateMainAction";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = {
  debug: () => undefined,
} as unknown as nkruntime.Logger;

function createMatch(): MatchRecord {
  const owner = createDefaultCharacter("owner");
  owner.position = { tileId: "tile_5", coord: { q: 5, r: 0 } };
  owner.inventory.carriedItems = [
    { itemId: "detonator", quantity: 1, weight: 2 },
  ];
  owner.stats.load.current = 2;
  owner.actionPlan = {
    main: {
      actionId: ActionLibrary.detonate_c4.id,
      targetLocationId: { q: 0, r: 0 },
    },
  };

  const near = createDefaultCharacter("near");
  near.position = { tileId: "tile_2", coord: { q: 2, r: 0 } };
  const far = createDefaultCharacter("far");
  far.position = { tileId: "tile_3", coord: { q: 3, r: 0 } };
  const victim = createDefaultCharacter("victim");
  victim.position = { tileId: "tile_0", coord: { q: 0, r: 0 } };

  const tiles: HexTileSnapshot[] = [0, 2, 3, 5].map((q) => ({
    id: `tile_${q}`,
    coord: { q, r: 0 },
    localizationType: LocalizationType.Road,
    walkable: true,
    itemIds: [],
  }));
  const c4: C4Record = {
    id: "c4_8_owner_0",
    ownerId: "owner",
    tileId: "tile_0",
    coord: { q: 0, r: 0 },
    placedTurn: 7,
  };
  return {
    match_id: "detonate-c4-test",
    players: ["owner", "near", "far", "victim"],
    playerCharacters: { owner, near, far, victim },
    playerList: {},
    size: 4,
    created_at: 1,
    current_turn: 8,
    started: true,
    removed: 0,
    map: { cols: 4, rows: 1, seed: "detonate-c4-test", tiles },
    c4s: [c4],
  };
}

test("detonates selected owned C4 and limits log and animation event to two tiles", () => {
  const match = createMatch();
  const events = executeAction(
    match,
    ActionLibrary.detonate_c4,
    9,
    {},
    logger,
  );
  const detonationEvents = events.filter(
    (event: ReplayEvent) =>
      event.kind === "player" &&
      event.action.actionId === ActionLibrary.detonate_c4.id,
  );

  assert.equal(match.c4s?.length, 0);
  assert.equal(
    match.playerCharacters.owner.inventory.carriedItems.some(
      (item) => item.itemId === "detonator",
    ),
    false,
  );
  assert.equal(match.playerCharacters.victim.stats.health.current, 0);
  assert.equal(match.playerCharacters.far.stats.health.current, 10);
  assert.equal(detonationEvents.length, 1);
  const event = detonationEvents[0];
  assert.ok(event && event.kind === "player");
  assert.deepEqual(event.action.targetLocation, { q: 0, r: 0 });
  assert.deepEqual(event.visibility, {
    scope: "limited",
    playerIds: ["owner", "near", "victim"],
  });
  assert.equal(
    tailorReplayEvents(events, "near", match.playerCharacters, 0).some(
      (entry) =>
        entry.kind === "player" &&
        entry.action.actionId === ActionLibrary.detonate_c4.id,
    ),
    true,
  );
  assert.equal(
    tailorReplayEvents(events, "far", match.playerCharacters, 0).some(
      (entry) =>
        entry.kind === "player" &&
        entry.action.actionId === ActionLibrary.detonate_c4.id,
    ),
    false,
  );
});

test("extra execution detonates a second selected charge and consumes second detonator", () => {
  const match = createMatch();
  const owner = match.playerCharacters.owner;
  owner.inventory.carriedItems = [
    { itemId: "detonator", quantity: 2, weight: 4 },
  ];
  owner.stats.load.current = 4;
  owner.actionPlan!.main!.extraExecutions = 1;
  owner.actionPlan!.main!.secondTargetLocationId = { q: 2, r: 0 };
  match.c4s = [
    ...(match.c4s ?? []),
    {
      id: "c4_8_owner_1",
      ownerId: "owner",
      tileId: "tile_2",
      coord: { q: 2, r: 0 },
      placedTurn: 7,
    },
  ];
  const secondVictim = match.playerCharacters.near;
  secondVictim.position = { tileId: "tile_2", coord: { q: 2, r: 0 } };

  const events = executeAction(
    match,
    ActionLibrary.detonate_c4,
    9,
    {},
    logger,
  );

  assert.equal(match.c4s?.length, 0);
  assert.equal(
    owner.inventory.carriedItems.some((item) => item.itemId === "detonator"),
    false,
  );
  assert.equal(owner.stats.energy.current, 8);
  assert.deepEqual(
    events
      .filter(
        (event: ReplayEvent) =>
          event.kind === "player" &&
          event.action.actionId === ActionLibrary.detonate_c4.id,
      )
      .map((event) =>
        event.kind === "player" ? event.action.targetLocation : undefined,
      ),
    [{ q: 0, r: 0 }, { q: 2, r: 0 }],
  );
});

test("main-action RPC preserves second C4 location for extra execution", () => {
  const match = createMatch();
  let storedMatch = match;
  const nakama = {
    storageRead: () => [{ value: storedMatch, version: "1" }],
    storageWrite: (requests: Array<{ value: unknown }>) => {
      const write = requests[0];
      if (write) {
        storedMatch = write.value as MatchRecord;
      }
    },
    storageList: () => ({ objects: [] }),
    storageDelete: () => undefined,
    matchCreate: () => "",
    matchList: () => ({ matches: [] }),
    matchSignal: () => "",
  } as unknown as nkruntime.Nakama;

  updateMainActionRpc(
    { userId: "owner" } as nkruntime.Context,
    logger,
    nakama,
    JSON.stringify({
      match_id: match.match_id,
      submission: {
        actionId: ActionLibrary.detonate_c4.id,
        extraExecutions: 1,
        targetLocationId: { q: 0, r: 0 },
        secondTargetLocationId: { q: 2, r: 0 },
      },
    }),
  );

  assert.deepEqual(
    storedMatch.playerCharacters.owner.actionPlan?.main?.secondTargetLocationId,
    { q: 2, r: 0 },
  );
});

test("failed detonation preserves detonator when no owned C4 is at target", () => {
  const match = createMatch();
  match.c4s = [];

  const events = executeAction(
    match,
    ActionLibrary.detonate_c4,
    9,
    {},
    logger,
  );

  assert.equal(match.playerCharacters.owner.inventory.carriedItems[0]?.itemId, "detonator");
  assert.equal(
    events.some(
      (event) =>
        event.kind === "player" &&
        event.action.actionId === ActionLibrary.failedAction.id &&
        (event.action.metadata as { reason?: string }).reason === "invalid_target",
    ),
    true,
  );
});
