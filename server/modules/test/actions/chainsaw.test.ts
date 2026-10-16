/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  type HexTileSnapshot,
  type PlayerCharacter,
} from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executeAction } from "../../src/match/actionExecutor";
import { advanceTurn } from "../../src/match/advanceTurn";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as nkruntime.Logger;

function createTestMatch(): { match: MatchRecord; tile: HexTileSnapshot } {
  const p1 = createDefaultCharacter("p1");
  p1.position = { tileId: "hex_0_0", coord: { q: 0, r: 0 } };
  p1.inventory.carriedItems = [
    { itemId: "chainsaw", quantity: 1, weight: 5 },
    { itemId: "fuel", quantity: 2, weight: 4 },
  ];
  p1.stats.energy.current = 10;

  const p2 = createDefaultCharacter("p2");
  p2.position = { tileId: "hex_0_0", coord: { q: 0, r: 0 } };
  p2.stats.health.current = 10;
  p2.stats.health.max = 10;

  const p3 = createDefaultCharacter("p3");
  p3.position = { tileId: "hex_0_1", coord: { q: 0, r: 1 } }; // distance 1

  const p4 = createDefaultCharacter("p4");
  p4.position = { tileId: "hex_0_3", coord: { q: 0, r: 3 } }; // distance 3 (outside hearing)

  const tile: HexTileSnapshot = {
    id: "hex_0_0",
    coord: { q: 0, r: 0 },
    localizationType: LocalizationType.House,
    walkable: true,
    itemIds: [],
  };

  const match: MatchRecord = {
    match_id: "chainsaw-test",
    players: ["p1", "p2", "p3", "p4"],
    playerCharacters: { p1, p2, p3, p4 },
    playerList: {},
    size: 4,
    created_at: 1,
    current_turn: 1,
    started: true,
    removed: 0,
    map: { cols: 3, rows: 3, seed: "test", tiles: [tile] },
  };

  return { match, tile };
}

test("start_chainsaw consumes 1 fuel, sets remainingTurns to 5, and includes nearby players in visibility", () => {
  const { match, tile } = createTestMatch();
  const p1 = match.playerCharacters.p1;
  p1.actionPlan = {
    secondary: { actionId: ActionLibrary.start_chainsaw.id },
  };

  const events = executeAction(
    match,
    ActionLibrary.start_chainsaw,
    1,
    { [tile.id]: tile },
    logger
  );

  const actionEvent = events.find(
    (e) => e.kind === "player" && e.action.actionId === "start_chainsaw"
  );
  assert.ok(actionEvent, "start_chainsaw action event should be generated");
  assert.equal(actionEvent.actorId, "p1");

  // Fuel consumed
  const fuelStack = p1.inventory.carriedItems.find((s) => s.itemId === "fuel");
  assert.equal(fuelStack?.quantity, 1);

  // Chainsaw status set
  assert.equal(p1.statuses?.chainsaw?.remainingTurns, 5);

  // Visibility: includes p1 (actor), p2 (same cell, dist 0), p3 (adj cell, dist 1), but NOT p4 (dist 3)
  assert.equal(actionEvent.visibility?.scope, "limited");
  const visiblePlayers = actionEvent.visibility?.playerIds ?? [];
  assert.ok(visiblePlayers.includes("p1"), "p1 should hear it");
  assert.ok(visiblePlayers.includes("p2"), "p2 in same cell should hear it");
  assert.ok(visiblePlayers.includes("p3"), "p3 at distance 1 should hear it");
  assert.equal(visiblePlayers.includes("p4"), false, "p4 at distance 3 should NOT hear it");
});

test("chainsaw_attack fails if chainsaw is not running", () => {
  const { match, tile } = createTestMatch();
  const p1 = match.playerCharacters.p1;
  p1.actionPlan = {
    main: { actionId: ActionLibrary.chainsaw_attack.id, targetPlayerIds: ["p2"] },
  };

  const events = executeAction(
    match,
    ActionLibrary.chainsaw_attack,
    1,
    { [tile.id]: tile },
    logger
  );

  const failEvent = events.find(
    (e) => e.kind === "player" && e.action.actionId === ActionLibrary.failedAction.id
  );
  assert.ok(failEvent, "Failed action event should be generated");
  assert.equal(failEvent.action.metadata?.reason, "chainsaw_not_running");
});

test("chainsaw_attack succeeds when running, deals lethal damage, eliminates target, and broadcasts with hearingRadious", () => {
  const { match, tile } = createTestMatch();
  const p1 = match.playerCharacters.p1;
  p1.statuses = {
    conditions: [],
    chainsaw: { remainingTurns: 5 },
  };
  p1.actionPlan = {
    main: { actionId: ActionLibrary.chainsaw_attack.id, targetPlayerIds: ["p2"] },
  };

  const events = executeAction(
    match,
    ActionLibrary.chainsaw_attack,
    1,
    { [tile.id]: tile },
    logger
  );

  const attackEvent = events.find(
    (e) => e.kind === "player" && e.action.actionId === "chainsaw_attack"
  );
  assert.ok(attackEvent, "Chainsaw attack event generated");
  assert.equal(attackEvent.actorId, "p1");

  const targetEntry = attackEvent.targets?.[0];
  assert.ok(targetEntry);
  assert.equal(targetEntry.targetId, "p2");
  assert.equal(targetEntry.eliminated, true);

  const p2 = match.playerCharacters.p2;
  assert.equal(p2.stats.health.current, 0);
  assert.ok(p2.statuses.conditions.includes("dead"));

  // Visibility: includes p1 (actor), p2 (target), p3 (distance 1), but NOT p4 (distance 3)
  assert.equal(attackEvent.visibility?.scope, "limited");
  const visiblePlayers = attackEvent.visibility?.playerIds ?? [];
  assert.ok(visiblePlayers.includes("p1"));
  assert.ok(visiblePlayers.includes("p2"));
  assert.ok(visiblePlayers.includes("p3"));
  assert.equal(visiblePlayers.includes("p4"), false);
});

test("advanceTurn decrements chainsaw remainingTurns each turn and expires after 5 turns", () => {
  const { match } = createTestMatch();
  const p1 = match.playerCharacters.p1;
  p1.statuses = {
    conditions: [],
    chainsaw: { remainingTurns: 5 },
  };

  advanceTurn(match, 1, logger);
  assert.equal(p1.statuses?.chainsaw?.remainingTurns, 4);

  advanceTurn(match, 2, logger);
  assert.equal(p1.statuses?.chainsaw?.remainingTurns, 3);

  advanceTurn(match, 3, logger);
  assert.equal(p1.statuses?.chainsaw?.remainingTurns, 2);

  advanceTurn(match, 4, logger);
  assert.equal(p1.statuses?.chainsaw?.remainingTurns, 1);

  advanceTurn(match, 5, logger);
  assert.equal(p1.statuses?.chainsaw, undefined, "Chainsaw should expire after 5 turns");
});
