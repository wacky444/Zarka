import assert from "node:assert/strict";
import { test } from "node:test";
import { LocalizationType } from "@shared";
import { ActionLibrary } from "@shared";
import type { MatchRecord, PlayerCharacter } from "@shared";
import { executePoisonFoodAction } from "../../src/match/actions/poisonFood";
import { executeFeedAction } from "../../src/match/actions/feed";
import { executeUseAntidoteAction } from "../../src/match/actions/useAntidote";
import { applyIntoxicationBeforeAction, decrementIntoxicationAfterAction } from "../../src/match/actions/intoxication";
import type { PlannedActionParticipant } from "../../src/match/actions/utils";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";
import { getUsableExtraExecutions } from "../../src/utils/energy";

function stack(itemId: string, quantity = 1) {
  return { itemId, quantity, weight: quantity };
}

function createMatch(characters: PlayerCharacter[]): MatchRecord {
  return {
    match_id: "poison-test",
    players: characters.map((character) => character.id),
    playerCharacters: Object.fromEntries(characters.map((character) => [character.id, character])),
    playerList: {}, size: characters.length, created_at: 1, current_turn: 1, started: true, removed: 0,
    map: { cols: 1, rows: 1, seed: "poison-test", tiles: [{ id: "tile", coord: { q: 0, r: 0 }, localizationType: LocalizationType.House, walkable: true, itemIds: [] }] },
  };
}

function participant(character: PlayerCharacter, actionId: "poison_food" | "feed" | "use_antidote", planKey: "main" | "secondary" = "secondary", targetPlayerIds?: string[]): PlannedActionParticipant {
  const plan = { actionId, ...(targetPlayerIds ? { targetPlayerIds } : {}) };
  character.actionPlan = { ...character.actionPlan, [planKey]: plan };
  return { playerId: character.id, character, plan, planKey };
}

test("poison_food consumes poison and marks target carried food for poisoning", () => {
  const attacker = createDefaultCharacter("attacker");
  const target = createDefaultCharacter("target");
  attacker.position = target.position = { tileId: "tile", coord: { q: 0, r: 0 } };
  attacker.inventory.carriedItems = [stack("poison", 2)];
  target.inventory.carriedItems = [stack("food", 2)];
  const match = createMatch([attacker, target]);
  const events = executePoisonFoodAction([participant(attacker, "poison_food", "secondary", [target.id])], match);
  assert.equal(target.poisonedFoodCount, 1);
  assert.equal(attacker.inventory.carriedItems[0].quantity, 1);
  assert.equal(events[0].kind === "player" ? events[0].action.actionId : undefined, "poison_food");
});

test("feeding poisoned food starts five-action intoxication and consumes one poisoned serving", () => {
  const target = createDefaultCharacter("target");
  target.position = { tileId: "tile", coord: { q: 0, r: 0 } };
  target.inventory.carriedItems = [stack("food", 1)];
  target.poisonedFoodCount = 1;
  const match = createMatch([target]);
  const events = executeFeedAction([participant(target, "feed", "main")], match);
  assert.equal(target.poisonedFoodCount, 0);
  assert.equal(target.statuses.intoxication?.remainingActions, 5);
  assert.equal(target.statuses.conditions.includes("intoxicated"), true);
  assert.equal(events[0].kind === "player" ? events[0].action.metadata?.intoxicationStarted : undefined, true);
});

test("intoxication damages each action and expires after five actions", () => {
  const character = createDefaultCharacter("intoxicated");
  character.statuses.intoxication = { remainingActions: 5 };
  character.statuses.conditions.push("intoxicated");
  character.actionPlan = { main: { actionId: "punch" } };
  const match = createMatch([character]);
  const initialHealth = character.stats.health.current;
  for (let action = 0; action < 5; action += 1) {
    applyIntoxicationBeforeAction(match, "punch");
    decrementIntoxicationAfterAction(match, [character.id]);
  }
  assert.equal(character.stats.health.current, initialHealth - 5);
  assert.equal(character.statuses.intoxication, undefined);
  assert.equal(character.statuses.conditions.includes("intoxicated"), false);
});

test("intoxication doubles extra-execution energy cost", () => {
  const character = createDefaultCharacter("intoxicated");
  character.statuses.intoxication = { remainingActions: 2 };
  const energyBefore = character.stats.energy.current;
  const repetitions = getUsableExtraExecutions(
    character,
    { actionId: "poison_food", extraExecutions: 1 },
    ActionLibrary.poison_food,
  );
  assert.equal(repetitions, 1);
  assert.equal(energyBefore - character.stats.energy.current, 2);
});

test("use_antidote cures same-location intoxication and consumes antidote", () => {
  const user = createDefaultCharacter("user");
  const ally = createDefaultCharacter("ally");
  user.position = ally.position = { tileId: "tile", coord: { q: 0, r: 0 } };
  user.inventory.carriedItems = [stack("antidote")];
  ally.statuses.intoxication = { remainingActions: 3 };
  ally.statuses.conditions.push("intoxicated");
  const match = createMatch([user, ally]);
  const events = executeUseAntidoteAction([participant(user, "use_antidote", "secondary", [ally.id])], match);
  assert.equal(ally.statuses.intoxication, undefined);
  assert.equal(ally.statuses.conditions.includes("intoxicated"), false);
  assert.equal(user.inventory.carriedItems.length, 0);
  assert.equal(events[0].kind === "player" ? events[0].action.actionId : undefined, "use_antidote");
});
