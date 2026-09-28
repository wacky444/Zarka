/// <reference path="../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  type HexTileSnapshot,
  type ReplayEvent,
} from "@shared";
import type { MatchRecord } from "../src/models/types";
import { executeAction } from "../src/match/actionExecutor";
import { createDefaultCharacter } from "../src/utils/playerCharacter";

const debugMessages: string[] = [];
const logger = {
  debug: (message: string) => debugMessages.push(message),
} as unknown as nkruntime.Logger;

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
