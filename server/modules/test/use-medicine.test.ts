/// <reference path="../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionLibrary, type PlayerCharacter, type ReplayPlayerEvent } from "@shared";
import type { MatchRecord } from "../src/models/types";
import { executeAction } from "../src/match/actionExecutor";
import { createDefaultCharacter } from "../src/utils/playerCharacter";

interface MedicineScenario {
  actor: PlayerCharacter;
  target: PlayerCharacter;
  match: MatchRecord;
}

function createScenario(
  medicineQuantity: number,
  extraExecutions: number
): MedicineScenario {
  const actor = createDefaultCharacter("actor");
  const target = createDefaultCharacter("target");
  actor.stats.energy.current = 5;
  actor.position = { tileId: "actor", coord: { q: 0, r: 0 } };
  target.position = { tileId: "target", coord: { q: 0, r: 0 } };
  target.stats.health.max = 100;
  target.stats.health.current = 50;
  actor.inventory.carriedItems = medicineQuantity > 0
    ? [{ itemId: "medicine", quantity: medicineQuantity, weight: medicineQuantity }]
    : [];
  actor.actionPlan = {
    secondary: {
      actionId: ActionLibrary.use_medicine.id,
      extraExecutions,
      targetPlayerIds: [target.id],
    },
  };

  const match: MatchRecord = {
    match_id: "use-medicine-test",
    players: [actor.id, target.id],
    playerCharacters: {
      [actor.id]: actor,
      [target.id]: target,
    },
    playerList: {},
    size: 2,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0,
  };
  return { actor, target, match };
}

function medicineEvent(events: ReplayPlayerEvent[]): ReplayPlayerEvent {
  const event = events.find(
    (candidate) => candidate.action.actionId === ActionLibrary.use_medicine.id
  );
  if (!event) {
    throw new Error("Expected a medicine replay event");
  }
  return event;
}

const logger = { debug: () => {} } as unknown as nkruntime.Logger;

test("medicine heals a selected target and consumes one item", () => {
  const { actor, target, match } = createScenario(1, 0);
  const events = executeAction(
    match,
    ActionLibrary.use_medicine,
    1,
    {},
    logger
  );
  const event = medicineEvent(
    events.filter((candidate): candidate is ReplayPlayerEvent => candidate.kind === "player")
  );

  assert.equal(target.stats.health.current, 58);
  assert.equal(actor.stats.energy.current, 4);
  assert.equal(actor.inventory.carriedItems.length, 0);
  assert.equal(event.targets?.[0]?.targetId, target.id);
  assert.equal(event.targets?.[0]?.metadata?.healed, 8);
  assert.equal(event.action.metadata?.consumedItemId, "medicine");
  assert.equal(event.action.metadata?.medicinesConsumed, 1);
});

test("an affordable extra execution consumes a second medicine and heals again", () => {
  const { actor, target, match } = createScenario(2, 1);
  const events = executeAction(
    match,
    ActionLibrary.use_medicine,
    1,
    {},
    logger
  );
  const event = medicineEvent(
    events.filter((candidate): candidate is ReplayPlayerEvent => candidate.kind === "player")
  );

  assert.equal(target.stats.health.current, 66);
  assert.equal(actor.stats.energy.current, 3);
  assert.equal(actor.inventory.carriedItems.length, 0);
  assert.equal(event.targets?.[0]?.metadata?.healed, 16);
  assert.equal(event.action.metadata?.medicinesConsumed, 2);
  assert.equal(event.action.metadata?.extraExecutions, 1);
});

test("an extra execution is not charged when only one medicine is carried", () => {
  const { actor, target, match } = createScenario(1, 1);
  const events = executeAction(
    match,
    ActionLibrary.use_medicine,
    1,
    {},
    logger
  );
  const event = medicineEvent(
    events.filter((candidate): candidate is ReplayPlayerEvent => candidate.kind === "player")
  );

  assert.equal(target.stats.health.current, 58);
  assert.equal(actor.stats.energy.current, 4);
  assert.equal(actor.inventory.carriedItems.length, 0);
  assert.equal(event.action.metadata?.medicinesConsumed, 1);
  assert.equal(event.action.metadata?.extraExecutions, 0);
});

test("a missing medicine produces a failed action instead of healing", () => {
  const { actor, target, match } = createScenario(0, 0);
  const events = executeAction(
    match,
    ActionLibrary.use_medicine,
    1,
    {},
    logger
  );
  const failure = events.find(
    (event) =>
      event.kind === "player" && event.action.actionId === "failedAction"
  );

  assert.equal(target.stats.health.current, 50);
  assert.equal(actor.stats.energy.current, 4);
  assert.equal(actor.actionPlan, undefined);
  assert.ok(failure && failure.kind === "player");
  assert.equal(failure.action.metadata?.attemptedActionId, "use_medicine");
  assert.equal(failure.action.metadata?.missingItemId, "medicine");
});
