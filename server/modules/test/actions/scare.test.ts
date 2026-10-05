/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  axialDistance,
  neighbors,
} from "@shared";
import type { Axial, PlayerCharacter, ReplayEvent } from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executeAction } from "../../src/match/actionExecutor";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as nkruntime.Logger;

const ORIGIN: Axial = { q: 0, r: 0 };

function createCharacter(id: string): PlayerCharacter {
  const character = createDefaultCharacter(id);
  character.position = { tileId: `tile-${id}`, coord: { ...ORIGIN } };
  return character;
}

function createMatch(
  characters: PlayerCharacter[],
  extraTileCoords: Axial[] = []
): MatchRecord {
  const tileCoords = [ORIGIN, ...neighbors(ORIGIN), ...extraTileCoords];
  const seen = new Set<string>();
  const tiles = tileCoords
    .filter((coord) => {
      const key = `${coord.q}:${coord.r}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((coord, index) => ({
      id: `tile-${index}`,
      coord,
      localizationType: LocalizationType.Road,
      walkable: true,
      itemIds: [],
    }));
  const playerCharacters = Object.fromEntries(
    characters.map((character) => [character.id, character])
  );
  return {
    match_id: "scare-action-test",
    players: characters.map((character) => character.id),
    playerCharacters,
    playerList: {},
    size: characters.length,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0,
    map: { cols: 3, rows: 3, seed: "scare-action", tiles },
  };
}

function scareEvents(events: ReplayEvent[]) {
  return events.filter(
    (event) =>
      event.kind === "player" && event.action.actionId === ActionLibrary.scare.id
  );
}

test("Scare sends co-located target to one cell from caster without extra power", () => {
  const actor = createCharacter("actor");
  const target = createCharacter("target");
  actor.actionPlan = { main: { actionId: ActionLibrary.scare.id } };
  const match = createMatch([actor, target]);

  const events = executeAction(match, ActionLibrary.scare, 1, {}, logger);
  const movedTo = target.position?.coord;

  assert.equal(scareEvents(events).length, 1);
  assert.ok(movedTo);
  assert.notDeepEqual(movedTo, ORIGIN);
  assert.equal(axialDistance(ORIGIN, movedTo), 1);
});

test("extra Scare chooses one adjacent destination instead of a second target", () => {
  const actor = createCharacter("actor");
  const firstTarget = createCharacter("first");
  const secondTarget = createCharacter("second");
  const destination = { q: -1, r: 0 };
  actor.actionPlan = {
    main: {
      actionId: ActionLibrary.scare.id,
      extraExecutions: 1,
      targetPlayerIds: [firstTarget.id, secondTarget.id],
      targetLocationId: destination,
    },
  };
  const match = createMatch([actor, firstTarget, secondTarget]);

  const events = executeAction(match, ActionLibrary.scare, 1, {}, logger);

  assert.equal(scareEvents(events).length, 1);
  assert.deepEqual(firstTarget.position?.coord, destination);
  assert.deepEqual(secondTarget.position?.coord, ORIGIN);
  assert.equal(axialDistance(ORIGIN, firstTarget.position!.coord), 1);
});

test("extra Scare can scare two targets, both ending one cell from caster", () => {
  const actor = createCharacter("actor");
  const firstTarget = createCharacter("first");
  const secondTarget = createCharacter("second");
  actor.actionPlan = {
    main: {
      actionId: ActionLibrary.scare.id,
      extraExecutions: 1,
      targetPlayerIds: [firstTarget.id, secondTarget.id],
    },
  };
  const match = createMatch([actor, firstTarget, secondTarget]);

  const events = executeAction(match, ActionLibrary.scare, 1, {}, logger);

  assert.equal(scareEvents(events).length, 2);
  assert.equal(axialDistance(ORIGIN, firstTarget.position!.coord), 1);
  assert.equal(axialDistance(ORIGIN, secondTarget.position!.coord), 1);
});

test("protected character cannot be pushed by Scare", () => {
  const actor = createCharacter("actor");
  const target = createCharacter("target");
  actor.actionPlan = {
    main: { actionId: ActionLibrary.scare.id, targetPlayerIds: [target.id] },
  };
  target.actionPlan = { main: { actionId: ActionLibrary.protect.id } };
  const match = createMatch([actor, target]);

  executeAction(match, ActionLibrary.protect, 1, {}, logger);
  const events = executeAction(match, ActionLibrary.scare, 1, {}, logger);

  assert.ok(target.statuses?.conditions?.includes("protected"));
  assert.deepEqual(target.position?.coord, ORIGIN);
  assert.equal(scareEvents(events).length, 0);
});
