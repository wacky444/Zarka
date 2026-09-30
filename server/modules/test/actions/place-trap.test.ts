/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  type HexTileSnapshot,
  type ReplayEvent,
  type TrapRecord,
} from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executeAction } from "../../src/match/actionExecutor";
import { triggerTrapsForMovement } from "../../src/match/actions/placeTrap";
import { updateMainActionRpc } from "../../src/rpc/updateMainAction";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const debugMessages: string[] = [];
const logger = {
  debug: (message: string) => debugMessages.push(message),
} as unknown as nkruntime.Logger;

test("placing an extra trap can select a separate adjacent entrance", () => {
  const actor = createDefaultCharacter("player");
  actor.position = { tileId: "tile_0_0", coord: { q: 0, r: 0 } };
  actor.inventory.carriedItems = [
    { itemId: "trap", quantity: 2, weight: 2 },
  ];
  actor.actionPlan = {
    main: {
      actionId: ActionLibrary.place_trap.id,
      targetLocationId: { q: 1, r: 0 },
      secondTargetLocationId: { q: 0, r: 1 },
      extraExecutions: 1,
    },
  };
  const tiles: HexTileSnapshot[] = [
    { q: 0, r: 0 },
    { q: 1, r: 0 },
    { q: 0, r: 1 },
  ].map((coord) => ({
    id: `tile_${coord.q}_${coord.r}`,
    coord,
    localizationType: LocalizationType.Road,
    walkable: true,
    itemIds: [],
  }));
  const match: MatchRecord = {
    match_id: "place-trap-second-path-test",
    players: [actor.id],
    playerCharacters: { [actor.id]: actor },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0,
    map: { cols: 2, rows: 2, seed: "place-trap-second-path", tiles },
    traps: [],
  };

  executeAction(match, ActionLibrary.place_trap, 1, {}, logger);

  assert.deepEqual(
    match.traps?.map((trap) => trap.to.coord),
    [{ q: 1, r: 0 }, { q: 0, r: 1 }],
  );
  assert.equal(actor.inventory.carriedItems.length, 0);
  assert.equal(actor.stats.energy.current, 6);
});

test("a crossing triggers one stacked trap and next crossing triggers next trap", () => {
  const actor = createDefaultCharacter("scaring-player");
  const target = createDefaultCharacter("scared-player");
  actor.position = { tileId: "tile_0_0", coord: { q: 0, r: 0 } };
  target.position = { tileId: "tile_0_0", coord: { q: 0, r: 0 } };
  target.stats.health.max = 25;
  target.stats.health.current = 20;
  actor.actionPlan = {
    main: {
      actionId: ActionLibrary.scare.id,
      targetPlayerIds: [target.id],
      targetLocationId: { q: 1, r: 0 },
      extraExecutions: 1,
    },
  };
  const tiles: HexTileSnapshot[] = [0, 1].map((q) => ({
    id: `tile_${q}_0`,
    coord: { q, r: 0 },
    localizationType: LocalizationType.Road,
    walkable: true,
    itemIds: [],
  }));
  const makeTrap = (id: string): TrapRecord => ({
    id,
    ownerId: actor.id,
    from: { tileId: "tile_0_0", coord: { q: 0, r: 0 } },
    to: { tileId: "tile_1_0", coord: { q: 1, r: 0 } },
    damage: 7,
    placedTurn: 0,
  });
  const match: MatchRecord = {
    match_id: "stacked-trap-trigger-test",
    players: [actor.id, target.id],
    playerCharacters: { [actor.id]: actor, [target.id]: target },
    playerList: {},
    size: 2,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0,
    map: { cols: 2, rows: 1, seed: "stacked-trap-trigger", tiles },
    traps: [makeTrap("first"), makeTrap("second")],
  };

  const scareEvents = executeAction(
    match,
    ActionLibrary.scare,
    1,
    {},
    logger,
  );
  const triggeredByScare = scareEvents.filter(
    (event) =>
      event.kind === "player" &&
      (event.action.metadata as { triggered?: boolean } | undefined)
        ?.triggered === true,
  );
  assert.equal(triggeredByScare.length, 1);
  assert.equal(
    (triggeredByScare[0]?.kind === "player"
      ? triggeredByScare[0].action.metadata as { trapId?: string }
      : undefined)?.trapId,
    "first",
  );
  assert.deepEqual(match.traps?.map((trap) => trap.id), ["second"]);
  assert.equal(target.stats.health.current, 13);

  const nextMovementEvents = triggerTrapsForMovement(
    match,
    target.id,
    { tileId: "tile_1_0", coord: { q: 1, r: 0 } },
    { tileId: "tile_0_0", coord: { q: 0, r: 0 } },
  );

  assert.equal(nextMovementEvents.length, 1);
  assert.equal(match.traps?.length, 0);
  assert.equal(target.stats.health.current, 6);
});

test("update_main_action persists a second trap destination only with extra effort", () => {
  const actor = createDefaultCharacter("player");
  actor.position = { tileId: "tile_0", coord: { q: 0, r: 0 } };
  const match: MatchRecord = {
    match_id: "place-trap-rpc-test",
    players: [actor.id],
    playerCharacters: { [actor.id]: actor },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0,
  };
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
  const context = { userId: actor.id } as nkruntime.Context;

  updateMainActionRpc(
    context,
    logger,
    nakama,
    JSON.stringify({
      match_id: match.match_id,
      submission: {
        actionId: ActionLibrary.place_trap.id,
        targetLocationId: { q: 1, r: 0 },
        secondTargetLocationId: { q: 0, r: 1 },
        extraExecutions: 1,
      },
    }),
  );

  assert.deepEqual(
    storedMatch.playerCharacters[actor.id].actionPlan?.main?.secondTargetLocationId,
    { q: 0, r: 1 },
  );

  updateMainActionRpc(
    context,
    logger,
    nakama,
    JSON.stringify({
      match_id: match.match_id,
      submission: {
        actionId: ActionLibrary.place_trap.id,
        targetLocationId: { q: 1, r: 0 },
        secondTargetLocationId: { q: 0, r: 1 },
      },
    }),
  );
  assert.equal(
    storedMatch.playerCharacters[actor.id].actionPlan?.main
      ?.secondTargetLocationId,
    undefined,
  );
});

test("placing a trap stores it on the match and keeps placement diagnostics", () => {
  const actor = createDefaultCharacter("player");
  actor.position = { tileId: "tile_0", coord: { q: 0, r: 0 } };
  actor.inventory.carriedItems = [
    { itemId: "trap", quantity: 1, weight: 1 },
  ];
  actor.actionPlan = {
    main: {
      actionId: ActionLibrary.place_trap.id,
      targetLocationId: { q: 1, r: 0 },
    },
  };
  const tiles: HexTileSnapshot[] = [0, 1].map((q) => ({
    id: `tile_${q}`,
    coord: { q, r: 0 },
    localizationType: LocalizationType.Road,
    walkable: true,
    itemIds: [],
  }));
  const match: MatchRecord = {
    match_id: "place-trap-test",
    players: [actor.id],
    playerCharacters: { [actor.id]: actor },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 22,
    started: true,
    removed: 0,
    map: { cols: 2, rows: 1, seed: "place-trap-test", tiles },
    traps: [],
  };

  const events = executeAction(
    match,
    ActionLibrary.place_trap,
    23,
    {},
    logger,
  );
  const placementEvent = events.find(
    (event: ReplayEvent) =>
      event.kind === "player" &&
      event.action.actionId === ActionLibrary.place_trap.id,
  );

  assert.equal(match.traps?.length, 1);
  assert.equal(match.traps?.[0].ownerId, actor.id);
  assert.deepEqual(match.traps?.[0].from.coord, { q: 0, r: 0 });
  assert.deepEqual(match.traps?.[0].to.coord, { q: 1, r: 0 });
  assert.equal(match.traps?.[0].placedTurn, 23);
  assert.ok(placementEvent);
  assert.ok(debugMessages.includes(
    "place_trap added match=%s trap=%s owner=%s traps_after=%d",
  ));
});
