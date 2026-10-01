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
import { createReplaySnapshot } from "../../src/match/replay/snapshot";
import { updateMainActionRpc } from "../../src/rpc/updateMainAction";
import { tailorMatchForPlayer } from "../../src/utils/matchView";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = {
  debug: () => undefined,
} as unknown as nkruntime.Logger;

function createMatch(): MatchRecord {
  const player = createDefaultCharacter("player");
  player.position = { tileId: "tile_0", coord: { q: 0, r: 0 } };
  const tiles: HexTileSnapshot[] = [
    {
      id: "tile_0",
      coord: { q: 0, r: 0 },
      localizationType: LocalizationType.Road,
      walkable: true,
      itemIds: [],
    },
  ];
  return {
    match_id: "place-c4-test",
    players: [player.id, "other"],
    playerCharacters: {
      [player.id]: player,
      other: createDefaultCharacter("other"),
    },
    playerList: {},
    size: 2,
    created_at: 1,
    current_turn: 22,
    started: true,
    removed: 0,
    map: { cols: 1, rows: 1, seed: "place-c4-test", tiles },
    c4s: [],
  };
}

test("placing C4 consumes charges and adds a detonator for each one", () => {
  const match = createMatch();
  const character = match.playerCharacters.player;
  character.inventory.carriedItems = [
    { itemId: "c4", quantity: 1, weight: 4 },
    { itemId: "c4", quantity: 1, weight: 4 },
  ];
  character.stats.load.current = 8;
  character.actionPlan = {
    main: {
      actionId: ActionLibrary.place_c4.id,
      extraExecutions: 1,
    },
  };

  const events = executeAction(
    match,
    ActionLibrary.place_c4,
    23,
    {},
    logger,
  );

  assert.deepEqual(
    match.c4s?.map(({ ownerId, tileId, coord, placedTurn }) => ({
      ownerId,
      tileId,
      coord,
      placedTurn,
    })),
    [
      {
        ownerId: "player",
        tileId: "tile_0",
        coord: { q: 0, r: 0 },
        placedTurn: 23,
      },
      {
        ownerId: "player",
        tileId: "tile_0",
        coord: { q: 0, r: 0 },
        placedTurn: 23,
      },
    ],
  );
  assert.equal(character.inventory.carriedItems.some((item) => item.itemId === "c4"), false);
  assert.deepEqual(
    character.inventory.carriedItems.find((item) => item.itemId === "detonator"),
    { itemId: "detonator", quantity: 2, weight: 4 },
  );
  assert.equal(character.stats.load.current, 4);
  assert.equal(character.stats.energy.current, 6);
  assert.equal(
    events.filter(
      (event: ReplayEvent) =>
        event.kind === "player" &&
        event.action.actionId === ActionLibrary.place_c4.id,
    ).length,
    2,
  );
  assert.deepEqual(createReplaySnapshot(match).c4s, match.c4s);
});

test("placing C4 without a charge fails and adds no detonator", () => {
  const match = createMatch();
  const character = match.playerCharacters.player;
  character.actionPlan = { main: { actionId: ActionLibrary.place_c4.id } };

  const events = executeAction(
    match,
    ActionLibrary.place_c4,
    23,
    {},
    logger,
  );

  assert.equal(match.c4s?.length, 0);
  assert.equal(
    character.inventory.carriedItems.some((item) => item.itemId === "detonator"),
    false,
  );
  assert.equal(character.actionPlan?.main, undefined);
  assert.equal(
    events.some(
      (event) =>
        event.kind === "player" &&
        event.action.actionId === ActionLibrary.failedAction.id,
    ),
    true,
  );
});

test("C4 records are visible only to their owner or admin view", () => {
  const match = createMatch();
  const charge: C4Record = {
    id: "c4_23_player_0",
    ownerId: "player",
    tileId: "tile_0",
    coord: { q: 0, r: 0 },
    placedTurn: 23,
  };
  match.c4s = [charge];

  assert.deepEqual(tailorMatchForPlayer(match, "player").c4s, [charge]);
  assert.deepEqual(tailorMatchForPlayer(match, "other").c4s, []);
  assert.deepEqual(tailorMatchForPlayer(match, "other", true).c4s, [charge]);
});

test("update_main_action keeps extra execution for placing a second C4", () => {
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
    { userId: "player" } as nkruntime.Context,
    logger,
    nakama,
    JSON.stringify({
      match_id: match.match_id,
      submission: {
        actionId: ActionLibrary.place_c4.id,
        extraExecutions: 1,
      },
    }),
  );

  assert.equal(
    storedMatch.playerCharacters.player.actionPlan?.main?.extraExecutions,
    1,
  );
});
