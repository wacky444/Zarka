/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  type Axial,
  type HexTileSnapshot,
  type PlayerCharacter,
} from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executeAction } from "../../src/match/actionExecutor";
import {
  getActionCooldownRemaining,
  isActionOnCooldown,
} from "../../src/match/actions/cooldowns";
import { hasCarriedItem } from "../../src/match/actions/utils";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as nkruntime.Logger;

function createCharacter(id: string, coord: Axial): PlayerCharacter {
  const character = createDefaultCharacter(id);
  character.position = { tileId: `tile_${coord.q}_${coord.r}`, coord };
  character.stats.energy.current = 5;
  character.stats.energy.max = 5;
  character.inventory.carriedItems = [
    { itemId: "rocket_launcher", quantity: 1, weight: 3 },
  ];
  return character;
}

function createMatch(characters: PlayerCharacter[]): MatchRecord {
  const tiles: HexTileSnapshot[] = [
    {
      id: "tile_0_0",
      coord: { q: 0, r: 0 },
      localizationType: LocalizationType.Road,
      walkable: true,
      itemIds: [],
    },
    {
      id: "tile_1_0",
      coord: { q: 1, r: 0 },
      localizationType: LocalizationType.Road,
      walkable: true,
      itemIds: [],
    },
  ];
  const playerCharacters = Object.fromEntries(
    characters.map((character) => [character.id, character]),
  );
  return {
    match_id: "rocket-launcher-test",
    current_turn: 1,
    players: characters.map((character) => character.id),
    playerCharacters,
    map: {
      meta: {
        width: 10,
        height: 10,
        center: { q: 0, r: 0 },
        createdTurn: 0,
      },
      tiles,
    },
  };
}

test("shooting rocket launcher without target does not consume item but spends energy and cooldown", () => {
  const shooter = createCharacter("shooter", { q: 0, r: 0 });
  shooter.actionPlan = {
    main: {
      actionId: ActionLibrary.fire_rocket_launcher.id,
    },
  };
  const match = createMatch([shooter]);

  executeAction(match, ActionLibrary.fire_rocket_launcher, 1, logger);

  assert.equal(shooter.stats.energy.current, 2);
  assert.equal(hasCarriedItem(shooter, "rocket_launcher"), true);
  assert.equal(shooter.inventory.carriedItems[0]?.quantity, 1);
  assert.equal(shooter.actionPlan?.main, undefined);
  assert.equal(
    isActionOnCooldown(shooter, ActionLibrary.fire_rocket_launcher.id, 1),
    true,
  );
  assert.equal(
    getActionCooldownRemaining(
      shooter,
      ActionLibrary.fire_rocket_launcher.id,
      1,
    ),
    2,
  );
});

test("shooting rocket launcher with valid target consumes item, spends energy and cooldown", () => {
  const shooter = createCharacter("shooter", { q: 0, r: 0 });
  shooter.actionPlan = {
    main: {
      actionId: ActionLibrary.fire_rocket_launcher.id,
      targetLocationId: { q: 1, r: 0 },
    },
  };
  const match = createMatch([shooter]);

  executeAction(match, ActionLibrary.fire_rocket_launcher, 1, logger);

  assert.equal(shooter.stats.energy.current, 2);
  assert.equal(hasCarriedItem(shooter, "rocket_launcher"), false);
  assert.equal(shooter.actionPlan?.main, undefined);
  assert.equal(
    isActionOnCooldown(shooter, ActionLibrary.fire_rocket_launcher.id, 1),
    true,
  );
  assert.equal(
    getActionCooldownRemaining(
      shooter,
      ActionLibrary.fire_rocket_launcher.id,
      1,
    ),
    2,
  );
  assert.equal(match.map?.tiles[1]?.meta?.rocketLauncherExplosionVisible, true);
});
