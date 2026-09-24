/// <reference path="../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  type PlayerCharacter,
  type ReplayEvent,
  type ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../src/models/types";
import { executeAction } from "../src/match/actionExecutor";
import { createDefaultCharacter } from "../src/utils/playerCharacter";

const logger = { debug: () => {} } as unknown as nkruntime.Logger;

function createCharacter(id: string, q: number): PlayerCharacter {
  const character = createDefaultCharacter(id);
  character.position = { tileId: `tile_${q}`, coord: { q, r: 0 } };
  return character;
}

function createMatch(
  actor: PlayerCharacter,
  targets: PlayerCharacter[],
  targetCoord: { q: number; r: number },
  extraExecutions = 0
): MatchRecord {
  const positions = [actor, ...targets];
  const maxQ = Math.max(0, targetCoord.q, ...positions.map((entry) => entry.position?.coord.q ?? 0));
  const tiles = Array.from({ length: maxQ + 1 }, (_, q) => ({
    id: `tile_${q}`,
    coord: { q, r: 0 },
    localizationType: LocalizationType.Road,
    walkable: true,
    itemIds: [],
  }));
  actor.actionPlan = {
    main: {
      actionId: ActionLibrary.throw_object.id,
      targetLocationId: targetCoord,
      targetItemIds: ["drink"],
      ...(extraExecutions > 0 ? { extraExecutions } : {}),
    },
  };
  const playerCharacters = Object.fromEntries(
    positions.map((character) => [character.id, character])
  );
  return {
    match_id: "throw-object-test",
    players: positions.map((character) => character.id),
    playerCharacters,
    playerList: {},
    size: positions.length,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0,
    map: { cols: tiles.length, rows: 1, seed: "throw-object", tiles },
    items: [],
  };
}

function getThrowEvent(events: ReplayEvent[]): ReplayPlayerEvent {
  const event = events.find(
    (candidate) =>
      candidate.kind === "player" &&
      candidate.action.actionId === ActionLibrary.throw_object.id
  );
  if (!event || event.kind !== "player") {
    throw new Error("Expected a throw-object replay event");
  }
  return event;
}

test("throwing an item damages the target and reveals the dropped item to both", () => {
  const actor = createCharacter("thrower", 0);
  actor.inventory.carriedItems = [
    { itemId: "drink", quantity: 1, weight: 3 },
    { itemId: "zarkans", quantity: 8, weight: 0 },
  ];
  actor.stats.load.current = 3;
  const target = createCharacter("target", 1);
  const match = createMatch(actor, [target], { q: 1, r: 0 });
  const events = executeAction(
    match,
    ActionLibrary.throw_object,
    1,
    {},
    logger
  );
  const event = getThrowEvent(events);
  const itemId = match.map?.tiles[1].itemIds[0];

  assert.equal(ActionLibrary.throw_object.developed, true);
  assert.equal(actor.inventory.carriedItems.some((item) => item.itemId === "drink"), false);
  assert.equal(actor.inventory.carriedItems.find((item) => item.itemId === "zarkans")?.quantity, 8);
  assert.equal(actor.stats.load.current, 0);
  assert.equal(match.items?.[0].item_type, "drink");
  assert.ok(itemId);
  assert.equal(match.items?.[0].item_id, itemId);
  assert.ok(actor.discoveredItemIds?.includes(itemId));
  assert.ok(target.discoveredItemIds?.includes(itemId));
  assert.equal(target.stats.health.current, 9);
  assert.equal(event.action.damageDealt, 1);
  assert.deepEqual(event.action.metadata?.thrownItems, [
    { itemType: "drink", itemId },
  ]);
  assert.deepEqual(event.targets?.map((entry) => entry.targetId), ["target"]);
  assert.equal(event.targets?.[0].damageTaken, 1);
  assert.deepEqual(event.visibility, {
    scope: "limited",
    playerIds: ["thrower", "target"],
  });
});

test("throwing a molotov deals four damage", () => {
  const actor = createCharacter("thrower", 0);
  actor.inventory.carriedItems = [
    { itemId: "molotov", quantity: 1, weight: 3 },
  ];
  const target = createCharacter("target", 1);
  const match = createMatch(actor, [target], { q: 1, r: 0 });
  actor.actionPlan!.main!.targetItemIds = ["molotov"];
  const event = getThrowEvent(
    executeAction(match, ActionLibrary.throw_object, 1, {}, logger)
  );

  assert.equal(target.stats.health.current, 6);
  assert.equal(event.action.damageDealt, 4);
  assert.equal(event.targets?.[0].damageTaken, 4);
});

test("extra executions throw additional items and charge extra energy", () => {
  const actor = createCharacter("thrower", 0);
  actor.inventory.carriedItems = [
    { itemId: "drink", quantity: 1, weight: 3 },
    { itemId: "molotov", quantity: 1, weight: 3 },
  ];
  actor.stats.load.current = 6;
  const target = createCharacter("target", 1);
  const match = createMatch(actor, [target], { q: 1, r: 0 }, 1);
  actor.actionPlan!.main!.targetItemIds = ["drink", "molotov"];
  const event = getThrowEvent(
    executeAction(match, ActionLibrary.throw_object, 1, {}, logger)
  );

  assert.equal(actor.stats.energy.current, 6);
  assert.equal(target.stats.health.current, 5);
  assert.equal(event.action.damageDealt, 5);
  assert.equal(event.action.metadata?.extraExecutions, 1);
  assert.equal(match.map?.tiles[1].itemIds.length, 2);
  assert.equal(target.discoveredItemIds?.length, 2);
});

test("strength5 discounts the base throw action cost", () => {
  const actor = createCharacter("thrower", 0);
  actor.inventory.carriedItems = [
    { itemId: "drink", quantity: 1, weight: 3 },
    { itemId: "molotov", quantity: 1, weight: 3 },
  ];
  actor.stats.load.current = 6;
  actor.stats.energy.current = 2;
  actor.abilities.push("strength5");
  const target = createCharacter("target", 1);
  const match = createMatch(actor, [target], { q: 1, r: 0 }, 1);
  actor.actionPlan!.main!.targetItemIds = ["drink", "molotov"];
  const event = getThrowEvent(
    executeAction(match, ActionLibrary.throw_object, 1, {}, logger)
  );

  assert.equal(actor.stats.energy.current, 0);
  assert.equal(match.map?.tiles[1].itemIds.length, 2);
  assert.equal(event.action.metadata?.extraExecutions, 1);
  assert.equal(event.action.damageDealt, 5);
});

test("zarkans alone cannot be thrown", () => {
  const actor = createCharacter("thrower", 0);
  actor.inventory.carriedItems = [
    { itemId: "zarkans", quantity: 8, weight: 0 },
  ];
  const target = createCharacter("target", 1);
  const match = createMatch(actor, [target], { q: 1, r: 0 });
  actor.actionPlan!.main!.targetItemIds = ["zarkans"];
  const events = executeAction(
    match,
    ActionLibrary.throw_object,
    1,
    {},
    logger
  );
  const failure = events.find(
    (event) => event.kind === "player" && event.action.actionId === "failedAction"
  );

  assert.equal(actor.inventory.carriedItems[0].itemId, "zarkans");
  assert.equal(actor.inventory.carriedItems[0].quantity, 8);
  assert.equal(match.items?.length, 0);
  assert.equal(match.map?.tiles[1].itemIds.length, 0);
  assert.ok(failure && failure.kind === "player");
  assert.equal(failure.action.metadata?.attemptedActionId, "throw_object");
});
