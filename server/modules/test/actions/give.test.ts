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
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = { debug: () => undefined } as unknown as nkruntime.Logger;

function createCharacter(id: string, q = 0): PlayerCharacter {
  const character = createDefaultCharacter(id);
  character.position = { tileId: `tile_${q}`, coord: { q, r: 0 } };
  return character;
}

function createMatch(
  actor: PlayerCharacter,
  others: PlayerCharacter[]
): MatchRecord {
  const characters = [actor, ...others];
  return {
    match_id: "give-test",
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

function getPlayerEvent(events: ReplayEvent[], actionId: string) {
  const event = events.find(
    (entry) => entry.kind === "player" && entry.action.actionId === actionId
  );
  assert.ok(event && event.kind === "player");
  return event;
}

test("give transfers prioritized item to selected co-located recipient", () => {
  const actor = createCharacter("actor");
  const firstRecipient = createCharacter("first");
  const selectedRecipient = createCharacter("selected");
  actor.inventory.carriedItems = [
    { itemId: "medicine", quantity: 2, weight: 2 },
  ];
  firstRecipient.inventory.carriedItems = [];
  selectedRecipient.inventory.carriedItems = [];
  selectedRecipient.stats.load.current = 0;
  actor.stats.load.current = 2;
  actor.actionPlan = {
    main: {
      actionId: ActionLibrary.give.id,
      targetPlayerIds: [selectedRecipient.id],
      targetItemIds: ["medicine"],
    },
  };
  const match = createMatch(actor, [firstRecipient, selectedRecipient]);

  const events = executeAction(match, ActionLibrary.give, 1, {}, logger);
  const event = getPlayerEvent(events, ActionLibrary.give.id);

  assert.equal(ActionLibrary.give.developed, true);
  assert.deepEqual(actor.inventory.carriedItems, [
    { itemId: "medicine", quantity: 1, weight: 1 },
  ]);
  assert.deepEqual(selectedRecipient.inventory.carriedItems, [
    { itemId: "medicine", quantity: 1, weight: 1 },
  ]);
  assert.equal(actor.stats.load.current, 1);
  assert.equal(selectedRecipient.stats.load.current, 1);
  assert.deepEqual(event.targets?.map((target) => target.targetId), ["selected"]);
  assert.deepEqual(event.action.metadata?.givenItems, [
    { itemType: "medicine" },
  ]);
  assert.equal(actor.stats.energy.current, 9);
  assert.equal(getActionCooldownRemaining(actor, ActionLibrary.give.id, 1), 2);
  assert.equal(actor.actionPlan?.main, undefined);
});

test("give transfers extra prioritized items and charges extra energy", () => {
  const actor = createCharacter("actor");
  const recipient = createCharacter("recipient");
  actor.inventory.carriedItems = [
    { itemId: "medicine", quantity: 1, weight: 1 },
    { itemId: "food", quantity: 1, weight: 3 },
  ];
  actor.stats.load.current = 4;
  recipient.inventory.carriedItems = [];
  recipient.stats.load.current = 0;
  actor.actionPlan = {
    main: {
      actionId: ActionLibrary.give.id,
      targetPlayerIds: [recipient.id],
      targetItemIds: ["medicine", "food"],
      extraExecutions: 1,
    },
  };
  const match = createMatch(actor, [recipient]);

  const event = getPlayerEvent(
    executeAction(match, ActionLibrary.give, 1, {}, logger),
    ActionLibrary.give.id
  );

  assert.deepEqual(recipient.inventory.carriedItems, [
    { itemId: "medicine", quantity: 1, weight: 1 },
    { itemId: "food", quantity: 1, weight: 3 },
  ]);
  assert.equal(actor.inventory.carriedItems.length, 0);
  assert.equal(actor.stats.load.current, 0);
  assert.equal(recipient.stats.load.current, 4);
  assert.equal(actor.stats.energy.current, 8);
  assert.equal(event.action.metadata?.extraExecutions, 1);
});

test("give randomly selects a co-located recipient when none was selected", () => {
  const actor = createCharacter("actor");
  const firstRecipient = createCharacter("first");
  const randomRecipient = createCharacter("random");
  firstRecipient.inventory.carriedItems = [];
  randomRecipient.inventory.carriedItems = [];
  randomRecipient.stats.load.current = 0;
  actor.inventory.carriedItems = [{ itemId: "food", quantity: 1, weight: 3 }];
  actor.actionPlan = { main: { actionId: ActionLibrary.give.id } };
  const match = createMatch(actor, [firstRecipient, randomRecipient]);
  const originalRandom = Math.random;
  Math.random = () => 0.99;
  let events: ReplayEvent[];
  try {
    events = executeAction(match, ActionLibrary.give, 1, {}, logger);
  } finally {
    Math.random = originalRandom;
  }

  const event = getPlayerEvent(events!, ActionLibrary.give.id);
  assert.deepEqual(event.targets?.map((target) => target.targetId), ["random"]);
  assert.deepEqual(randomRecipient.inventory.carriedItems, [
    { itemId: "food", quantity: 1, weight: 3 },
  ]);
  assert.equal(firstRecipient.inventory.carriedItems.length, 0);
});

test("give without a co-located recipient fails, spends energy, and starts cooldown", () => {
  const actor = createCharacter("actor");
  const distantRecipient = createCharacter("distant", 1);
  distantRecipient.inventory.carriedItems = [];
  actor.inventory.carriedItems = [{ itemId: "food", quantity: 1, weight: 3 }];
  actor.actionPlan = { main: { actionId: ActionLibrary.give.id } };
  const match = createMatch(actor, [distantRecipient]);

  const events = executeAction(match, ActionLibrary.give, 1, {}, logger);
  const failure = getPlayerEvent(events, ActionLibrary.failedAction.id);

  assert.equal(actor.stats.energy.current, 9);
  assert.equal(getActionCooldownRemaining(actor, ActionLibrary.give.id, 1), 2);
  assert.deepEqual(actor.inventory.carriedItems, [
    { itemId: "food", quantity: 1, weight: 3 },
  ]);
  assert.equal(distantRecipient.inventory.carriedItems.length, 0);
  assert.equal(failure.action.metadata?.attemptedActionId, ActionLibrary.give.id);
  assert.equal(failure.action.metadata?.reason, "invalid_target");
  assert.equal(actor.actionPlan?.main, undefined);
});
