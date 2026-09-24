/// <reference path="../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  type HexTileSnapshot,
  type PlayerCharacter,
  type ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../src/models/types";
import { executeAction } from "../src/match/actionExecutor";
import { tailorMapForCharacter } from "../src/utils/matchView";
import { createDefaultCharacter } from "../src/utils/playerCharacter";

const logger = { debug: () => {} } as unknown as nkruntime.Logger;

function createTile(id: string, q: number, meta?: Record<string, unknown>): HexTileSnapshot {
  return {
    id,
    coord: { q, r: 0 },
    localizationType: LocalizationType.Road,
    walkable: true,
    itemIds: [],
    meta,
  };
}

function createCharacter(id: string, q: number): PlayerCharacter {
  const character = createDefaultCharacter(id);
  character.position = { tileId: `tile_${q}`, coord: { q, r: 0 } };
  character.stats.baseViewRange = 0;
  return character;
}

function createMatch(
  actor: PlayerCharacter,
  targetCoord: { q: number; r: number },
  fuelStacks: number[]
): MatchRecord {
  actor.inventory.carriedItems = fuelStacks.map((quantity) => ({
    itemId: "fuel",
    quantity,
    weight: quantity * 2,
  }));
  actor.actionPlan = {
    secondary: {
      actionId: ActionLibrary.create_fire.id,
      targetLocationId: targetCoord,
    },
  };
  const targetTile = createTile(`tile_${targetCoord.q}`, targetCoord.q);
  const originTile = createTile("tile_0", 0);
  const tiles = targetCoord.q === 0 ? [originTile] : [originTile, targetTile];
  return {
    match_id: "create-fire-test",
    players: [actor.id],
    playerCharacters: { [actor.id]: actor },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0,
    map: { cols: tiles.length, rows: 1, seed: "create-fire", tiles },
  };
}

function fireEvent(events: ReplayPlayerEvent[]): ReplayPlayerEvent {
  const event = events.find(
    (candidate) => candidate.action.actionId === ActionLibrary.create_fire.id
  );
  if (!event) {
    throw new Error("Expected a create-fire replay event");
  }
  return event;
}

test("creating a fire locally consumes two fuel and schedules three future turns", () => {
  const actor = createCharacter("actor", 0);
  const match = createMatch(actor, { q: 0, r: 0 }, [1, 2]);
  const events = executeAction(
    match,
    ActionLibrary.create_fire,
    1,
    {},
    logger
  );
  const event = fireEvent(
    events.filter((candidate): candidate is ReplayPlayerEvent => candidate.kind === "player")
  );
  const tile = match.map?.tiles[0];

  assert.deepEqual(tile?.meta, { fireStartTurn: 2, fireEndTurn: 4 });
  assert.equal(actor.inventory.carriedItems.length, 1);
  assert.equal(actor.inventory.carriedItems[0].quantity, 1);
  assert.equal(event.action.metadata?.fuelConsumed, 2);
  assert.equal(event.action.metadata?.fireStartTurn, 2);
  assert.equal(event.action.metadata?.fireEndTurn, 4);
});

test("an adjacent fire consumes five fuel across carried stacks", () => {
  const actor = createCharacter("actor", 0);
  const match = createMatch(actor, { q: 1, r: 0 }, [2, 3]);
  const events = executeAction(
    match,
    ActionLibrary.create_fire,
    1,
    {},
    logger
  );
  const event = fireEvent(
    events.filter((candidate): candidate is ReplayPlayerEvent => candidate.kind === "player")
  );
  const targetTile = match.map?.tiles.find((tile) => tile.coord.q === 1);

  assert.deepEqual(targetTile?.meta, { fireStartTurn: 2, fireEndTurn: 4 });
  assert.equal(actor.inventory.carriedItems.length, 0);
  assert.equal(event.action.metadata?.fuelConsumed, 5);
});

test("fire creation replay is visible to nearby viewers and perception4", () => {
  const actor = createCharacter("actor", 0);
  const match = createMatch(actor, { q: 1, r: 0 }, [5]);
  const nearby = createCharacter("nearby", 1);
  nearby.stats.baseViewRange = 1;
  const distant = createCharacter("distant", 5);
  const perceiver = createCharacter("perceiver", 5);
  perceiver.abilities.push("perception4");
  match.playerCharacters[nearby.id] = nearby;
  match.playerCharacters[distant.id] = distant;
  match.playerCharacters[perceiver.id] = perceiver;
  match.players.push(nearby.id, distant.id, perceiver.id);
  const events = executeAction(
    match,
    ActionLibrary.create_fire,
    1,
    {},
    logger
  );
  const event = fireEvent(
    events.filter((candidate): candidate is ReplayPlayerEvent => candidate.kind === "player")
  );

  assert.equal(event.visibility?.scope, "limited");
  if (event.visibility?.scope === "limited") {
    assert.deepEqual(event.visibility.playerIds, ["actor", "nearby", "perceiver"]);
  }
});

test("an adjacent fire fails without five fuel", () => {
  const actor = createCharacter("actor", 0);
  const match = createMatch(actor, { q: 1, r: 0 }, [4]);
  const events = executeAction(
    match,
    ActionLibrary.create_fire,
    1,
    {},
    logger
  );
  const failure = events.find(
    (event) => event.kind === "player" && event.action.actionId === "failedAction"
  );

  assert.equal(match.map?.tiles[1].meta?.fireStartTurn, undefined);
  assert.equal(actor.inventory.carriedItems[0].quantity, 4);
  assert.ok(failure && failure.kind === "player");
  assert.equal(failure.action.metadata?.attemptedActionId, "create_fire");
  assert.equal(failure.action.metadata?.missingItemId, "fuel");
});

test("fire metadata is hidden beyond view range unless the viewer has perception4", () => {
  const viewer = createCharacter("viewer", 0);
  viewer.stats.baseViewRange = 1;
  const map = {
    cols: 3,
    rows: 1,
    seed: "fire-visibility",
    tiles: [
      createTile("near", 1, { fireStartTurn: 2, fireEndTurn: 4 }),
      createTile("far", 3, {
        fireStartTurn: 2,
        fireEndTurn: 4,
        destroyed: false,
      }),
    ],
  };

  const nearbyView = tailorMapForCharacter(map, viewer);
  assert.equal(nearbyView?.tiles[0].meta?.fireStartTurn, 2);
  assert.equal(nearbyView?.tiles[1].meta?.fireStartTurn, undefined);
  assert.equal(nearbyView?.tiles[1].meta?.destroyed, false);
  assert.equal(map.tiles[1].meta?.fireStartTurn, 2);

  const perceiver = createCharacter("perceiver", 0);
  perceiver.abilities.push("perception4");
  const perceptionView = tailorMapForCharacter(map, perceiver);
  assert.equal(perceptionView?.tiles[1].meta?.fireStartTurn, 2);
});
