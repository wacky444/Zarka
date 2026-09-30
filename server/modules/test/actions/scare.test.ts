/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  axialDistance,
  neighbors,
} from "@shared";
import type { PlayerCharacter } from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executeAction } from "../../src/match/actionExecutor";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as nkruntime.Logger;

function createCharacter(id: string): PlayerCharacter {
  const character = createDefaultCharacter(id);
  character.position = { tileId: `tile-${id}`, coord: { q: 0, r: 0 } };
  return character;
}

test("Scare clamps distant selected destinations to the nearest tile toward them", () => {
  const actor = createCharacter("actor");
  const target = createCharacter("target");
  const origin = { q: 0, r: 0 };
  const requestedDestination = { q: 2, r: 0 };
  const mapTiles = [
    ...neighbors(origin),
    requestedDestination,
  ].map((coord, index) => ({
    id: `tile-${index}`,
    coord,
    localizationType: LocalizationType.Road,
    walkable: true,
    itemIds: [],
  }));
  actor.actionPlan = {
    main: {
      actionId: ActionLibrary.scare.id,
      targetPlayerIds: [target.id],
      targetLocationId: requestedDestination,
      extraExecutions: 1,
    },
  };
  const match: MatchRecord = {
    match_id: "scare-direction-test",
    players: [actor.id, target.id],
    playerCharacters: { [actor.id]: actor, [target.id]: target },
    playerList: {},
    size: 2,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0,
    map: { cols: 3, rows: 3, seed: "scare-direction", tiles: mapTiles },
  };

  const events = executeAction(
    match,
    ActionLibrary.scare,
    1,
    {},
    logger,
  );
  const scareEvent = events.find(
    (event) => event.kind === "player" && event.action.actionId === "scare",
  );
  const movedTo = target.position?.coord;

  assert.ok(scareEvent);
  assert.deepEqual(movedTo, { q: 1, r: 0 });
  assert.equal(axialDistance(origin, movedTo!), 1);
});
