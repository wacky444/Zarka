/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  type PlayerCharacter,
  type ReplayEvent,
} from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executeAction } from "../../src/match/actionExecutor";
import { getActionCooldownRemaining } from "../../src/match/actions/cooldowns";
import { applyVirusInfection } from "../../src/match/actions/virusInfection";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = { debug: () => undefined } as unknown as nkruntime.Logger;

function createCharacter(id: string, q = 0): PlayerCharacter {
  const character = createDefaultCharacter(id);
  character.position = { tileId: `tile_${q}`, coord: { q, r: 0 } };
  character.stats.energy.current = 5;
  return character;
}

function createMatch(
  actor: PlayerCharacter,
  targets: PlayerCharacter[]
): MatchRecord {
  const characters = [actor, ...targets];
  return {
    match_id: "inject-vaccine-test",
    players: characters.map((character) => character.id),
    playerCharacters: Object.fromEntries(
      characters.map((character) => [character.id, character])
    ),
    playerList: {},
    size: characters.length,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0,
  };
}

function getEvent(events: ReplayEvent[], actionId: string) {
  const event = events.find(
    (entry) => entry.kind === "player" && entry.action.actionId === actionId
  );
  assert.ok(event && event.kind === "player");
  return event;
}

function vaccinatePlan(
  actor: PlayerCharacter,
  targetPlayerIds?: string[]
): void {
  actor.inventory.carriedItems = [
    { itemId: "vaccine", quantity: 1, weight: 1 },
  ];
  actor.stats.load.current = 1;
  actor.actionPlan = {
    secondary: {
      actionId: ActionLibrary.inject_vaccine.id,
      ...(targetPlayerIds ? { targetPlayerIds } : {}),
    },
  };
}

test("inject vaccine immunizes selected co-located target and consumes vial", () => {
  const actor = createCharacter("actor");
  const target = createCharacter("target");
  target.statuses.conditions.push("infected");
  target.statuses.virus = {
    containsVirus: true,
    contagious: true,
    lastTickTurn: 0,
  };
  vaccinatePlan(actor, [target.id]);
  const match = createMatch(actor, [target]);

  const events = executeAction(match, ActionLibrary.inject_vaccine, 1, {}, logger);
  const event = getEvent(events, ActionLibrary.inject_vaccine.id);

  assert.equal(ActionLibrary.inject_vaccine.developed, true);
  assert.equal(target.statuses.vaccine?.immune, true);
  assert.equal(target.statuses.virus?.containsVirus, true);
  assert.ok(target.statuses.conditions.includes("infected"));
  assert.equal(actor.inventory.carriedItems.length, 0);
  assert.equal(actor.stats.load.current, 0);
  assert.equal(actor.stats.energy.current, 4);
  assert.deepEqual(event.targets?.map((entry) => entry.targetId), [target.id]);
  assert.equal(event.action.metadata?.consumedItemId, "vaccine");
  assert.equal(actor.actionPlan?.secondary, undefined);
  assert.equal(getActionCooldownRemaining(actor, ActionLibrary.inject_vaccine.id, 1), 2);
});

test("inject vaccine defaults to vaccinating actor when no target is selected", () => {
  const actor = createCharacter("actor");
  vaccinatePlan(actor);
  const match = createMatch(actor, []);

  const event = getEvent(
    executeAction(match, ActionLibrary.inject_vaccine, 1, {}, logger),
    ActionLibrary.inject_vaccine.id
  );

  assert.equal(actor.statuses.vaccine?.immune, true);
  assert.deepEqual(event.targets?.map((entry) => entry.targetId), [actor.id]);
});

test("invalid remote vaccine target fails without consuming vial", () => {
  const actor = createCharacter("actor");
  const target = createCharacter("target", 1);
  vaccinatePlan(actor, [target.id]);
  const match = createMatch(actor, [target]);

  const events = executeAction(match, ActionLibrary.inject_vaccine, 1, {}, logger);
  const failure = getEvent(events, ActionLibrary.failedAction.id);

  assert.equal(actor.inventory.carriedItems[0]?.itemId, "vaccine");
  assert.equal(actor.stats.load.current, 1);
  assert.equal(actor.stats.energy.current, 4);
  assert.equal(getActionCooldownRemaining(actor, ActionLibrary.inject_vaccine.id, 1), 2);
  assert.equal(failure.action.metadata?.attemptedActionId, "inject_vaccine");
  assert.equal(failure.action.metadata?.reason, "invalid_target");
  assert.equal(target.statuses.vaccine?.immune, undefined);
});

test("vaccinated infected character takes no contact damage", () => {
  const source = createCharacter("source");
  const target = createCharacter("target");
  source.statuses.virus = {
    containsVirus: true,
    contagious: true,
    lastTickTurn: 0,
  };
  target.statuses.vaccine = { immune: true };
  const match = createMatch(source, [target]);

  const events = applyVirusInfection(match, 1, logger);

  assert.equal(target.stats.health.current, 10);
  assert.equal(events.length, 0);
});
