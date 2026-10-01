/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  type HexTileSnapshot,
  type ReplayEvent,
} from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executeAction } from "../../src/match/actionExecutor";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = {
  debug: () => undefined,
} as unknown as nkruntime.Logger;

function createMatch(localizationType: LocalizationType): MatchRecord {
  const character = createDefaultCharacter("refuel-player");
  character.position = { tileId: "tile", coord: { q: 0, r: 0 } };
  character.inventory.carriedItems = [
    { itemId: "fuel", quantity: 2, weight: 4 },
  ];
  character.stats.load.current = 4;
  character.actionPlan = {
    secondary: { actionId: ActionLibrary.refuel.id },
  };
  const tile: HexTileSnapshot = {
    id: "tile",
    coord: { q: 0, r: 0 },
    localizationType,
    walkable: true,
    itemIds: [],
  };
  return {
    match_id: "refuel-test",
    players: [character.id],
    playerCharacters: { [character.id]: character },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 4,
    started: true,
    removed: 0,
    map: { cols: 1, rows: 1, seed: "refuel-test", tiles: [tile] },
  };
}

test("refuel adds three fuel, updates carried weight, and logs pickup animation metadata", () => {
  const match = createMatch(LocalizationType.GasStation);
  const character = match.playerCharacters["refuel-player"];

  const events = executeAction(
    match,
    ActionLibrary.refuel,
    5,
    { tile: match.map!.tiles[0] },
    logger,
  );

  assert.deepEqual(character.inventory.carriedItems, [
    { itemId: "fuel", quantity: 5, weight: 10 },
  ]);
  assert.equal(character.stats.load.current, 10);
  assert.equal(character.stats.energy.current, 8);
  assert.equal(character.actionPlan?.secondary, undefined);
  const event = events.find(
    (entry: ReplayEvent) =>
      entry.kind === "player" &&
      entry.action.actionId === ActionLibrary.refuel.id,
  );
  assert.ok(event && event.kind === "player");
  assert.equal(event.action.metadata?.fuelAdded, 3);
  assert.equal(
    (event.action.metadata?.pickedItems as unknown[]).length,
    3,
  );
});

test("refuel outside the gas station does not spend energy or grant fuel", () => {
  const match = createMatch(LocalizationType.Road);
  const character = match.playerCharacters["refuel-player"];

  const events = executeAction(
    match,
    ActionLibrary.refuel,
    5,
    { tile: match.map!.tiles[0] },
    logger,
  );

  assert.deepEqual(character.inventory.carriedItems, [
    { itemId: "fuel", quantity: 2, weight: 4 },
  ]);
  assert.equal(character.stats.load.current, 4);
  assert.equal(character.stats.energy.current, 10);
  assert.equal(character.actionPlan?.secondary, undefined);
  assert.equal(
    events.some(
      (entry) =>
        entry.kind === "player" &&
        entry.action.actionId === ActionLibrary.refuel.id,
    ),
    false,
  );
});
