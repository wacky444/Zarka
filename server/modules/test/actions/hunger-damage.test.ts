/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  type HexTileSnapshot,
  type ReplayEvent,
  type ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executeAction } from "../../src/match/actionExecutor";
import { applyActionEnergyCost } from "../../src/match/actions/utils";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = {
  debug: () => undefined,
} as unknown as nkruntime.Logger;

function createMatchWithEnergy(
  currentEnergy: number,
  currentHealth: number = 10,
): { match: MatchRecord; characterId: string } {
  const character = createDefaultCharacter("hunger-player");
  character.position = { tileId: "tile-1", coord: { q: 0, r: 0 } };
  character.stats.energy.current = currentEnergy;
  character.stats.health.current = currentHealth;
  character.stats.health.max = 20;
  // Dodge costs 2 energy
  character.actionPlan = {
    main: { actionId: ActionLibrary.dodge.id },
  };

  const tile: HexTileSnapshot = {
    id: "tile-1",
    coord: { q: 0, r: 0 },
    localizationType: LocalizationType.Meadow,
    walkable: true,
    itemIds: [],
  };

  const match: MatchRecord = {
    match_id: "hunger-test",
    players: [character.id],
    playerCharacters: { [character.id]: character },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 1,
    started: true,
    removed: 0,
    map: { cols: 1, rows: 1, seed: "hunger-test", tiles: [tile] },
  };

  return { match, characterId: character.id };
}

test("character with sufficient energy does not suffer hunger damage", () => {
  const { match, characterId } = createMatchWithEnergy(10, 10);
  const character = match.playerCharacters![characterId];
  const tileLookup = { "tile-1": match.map!.tiles[0] };

  const events = executeAction(
    match,
    ActionLibrary.dodge,
    1,
    tileLookup,
    logger,
  );

  assert.equal(character.stats.health.current, 10);
  assert.equal(character.stats.energy.current, 8); // 10 - 2
  const hungerEvents = events.filter(
    (e): e is ReplayPlayerEvent =>
      e.kind === "player" && e.action.actionId === ActionLibrary.hunger_damage.id,
  );
  assert.equal(hungerEvents.length, 0);
});

test("character with insufficient energy suffers -1 hunger damage and emits hunger_damage event", () => {
  const { match, characterId } = createMatchWithEnergy(0, 10);
  const character = match.playerCharacters![characterId];
  const tileLookup = { "tile-1": match.map!.tiles[0] };

  const events = executeAction(
    match,
    ActionLibrary.dodge,
    1,
    tileLookup,
    logger,
  );

  assert.equal(character.stats.health.current, 9); // 10 - 1
  assert.equal(character.stats.energy.current, 0);

  const hungerEvents = events.filter(
    (e): e is ReplayPlayerEvent =>
      e.kind === "player" && e.action.actionId === ActionLibrary.hunger_damage.id,
  );
  assert.equal(hungerEvents.length, 1);
  const event = hungerEvents[0];
  assert.equal(event.actorId, characterId);
  assert.equal(event.action.damageDealt, 1);
  assert.deepEqual(event.targets, [
    {
      targetId: characterId,
      damageTaken: 1,
      eliminated: false,
    },
  ]);
});

test("character dying from hunger damage emits hunger_damage and status_dead events", () => {
  const { match, characterId } = createMatchWithEnergy(0, 1);
  const character = match.playerCharacters![characterId];
  const tileLookup = { "tile-1": match.map!.tiles[0] };

  const events = executeAction(
    match,
    ActionLibrary.dodge,
    1,
    tileLookup,
    logger,
  );

  assert.equal(character.stats.health.current, 0);
  assert.ok(character.statuses.conditions.includes("dead"));

  const hungerEvents = events.filter(
    (e): e is ReplayPlayerEvent =>
      e.kind === "player" && e.action.actionId === ActionLibrary.hunger_damage.id,
  );
  assert.equal(hungerEvents.length, 1);
  assert.equal(hungerEvents[0].targets?.[0].eliminated, true);

  const deathEvents = events.filter(
    (e): e is ReplayPlayerEvent =>
      e.kind === "player" && e.action.actionId === ActionLibrary.status_dead.id,
  );
  assert.equal(deathEvents.length, 1);
});

test("applyActionEnergyCost directly generates hunger_damage event on exhaustion", () => {
  const character = createDefaultCharacter("direct-test");
  character.stats.energy.current = 1;
  character.stats.health.current = 8;

  const outcome = applyActionEnergyCost(character, 5, logger);
  assert.equal(outcome.exhausted, true);
  assert.equal(outcome.healthLost, 1);
  assert.equal(character.stats.health.current, 7);
  assert.ok(outcome.event);
  assert.equal(outcome.event?.action.actionId, "hunger_damage");
  assert.equal(outcome.events?.length, 1);
  assert.equal(outcome.events?.[0].action.actionId, "hunger_damage");
});
