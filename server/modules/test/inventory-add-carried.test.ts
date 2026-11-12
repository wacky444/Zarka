import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addCarriedItem,
  recalculateCharacterLoad,
  ItemLibrary,
  type PlayerCharacter,
} from "@shared";
import { createDefaultCharacter } from "../src/utils/playerCharacter";
import { applyTraffickerDeliveries } from "../src/match/turnEconomy";
import type { MatchRecord } from "../src/models/types";

test("addCarriedItem creates stack and increments load", () => {
  const character = createDefaultCharacter("char-1", "Alpha");
  character.inventory = { carriedItems: [] };
  character.stats.load = { current: 0, max: 25, bandolierCapacityBonus: 0 };

  const result1 = addCarriedItem(character, "bullet", 2);
  assert.equal(result1.addedQuantity, 2);
  assert.equal(result1.addedWeight, 2 * ItemLibrary.bullet.weight);
  assert.equal(character.stats.load.current, 2);
  assert.equal(character.inventory.carriedItems.length, 1);
  assert.equal(character.inventory.carriedItems[0].itemId, "bullet");
  assert.equal(character.inventory.carriedItems[0].quantity, 2);
  assert.equal(character.inventory.carriedItems[0].weight, 2);

  const result2 = addCarriedItem(character, "bullet", 3);
  assert.equal(result2.addedQuantity, 3);
  assert.equal(character.stats.load.current, 5);
  assert.equal(character.inventory.carriedItems.length, 1);
  assert.equal(character.inventory.carriedItems[0].quantity, 5);
  assert.equal(character.inventory.carriedItems[0].weight, 5);

  addCarriedItem(character, "pistol", 1);
  assert.equal(character.stats.load.current, 5 + ItemLibrary.pistol.weight);
  assert.equal(character.inventory.carriedItems.length, 2);
});

test("addCarriedItem syncs bandolier capacity automatically", () => {
  const character = createDefaultCharacter("char-2", "Bravo");
  character.inventory = { carriedItems: [] };
  character.stats.load = { current: 0, max: 25, bandolierCapacityBonus: 0 };

  addCarriedItem(character, "bandolier", 1);
  assert.equal(character.stats.load.bandolierCapacityBonus, 5);
  assert.equal(character.stats.load.max, 30);
});

test("recalculateCharacterLoad sums carried items and updates load", () => {
  const character = createDefaultCharacter("char-3", "Charlie");
  character.inventory = {
    carriedItems: [
      { itemId: "bullet", quantity: 4, weight: 4 },
      { itemId: "bulletproof_vest", quantity: 2, weight: 10 },
      { itemId: "pistol", quantity: 1, weight: 3 },
    ],
  };
  character.stats.load = { current: 0, max: 25, bandolierCapacityBonus: 0 };

  const total = recalculateCharacterLoad(character);
  assert.equal(total, 17);
  assert.equal(character.stats.load.current, 17);
});

test("applyTraffickerDeliveries increments load via addCarriedItem", () => {
  const recipient = createDefaultCharacter("recip", "Delta");
  recipient.inventory = { carriedItems: [] };
  recipient.stats.load = { current: 0, max: 25, bandolierCapacityBonus: 0 };
  recipient.pendingTraffickerDeliveries = ["food", "pistol"];

  const match: MatchRecord = {
    match_id: "test-match",
    players: [recipient.id],
    playerCharacters: { [recipient.id]: recipient },
    current_turn: 1,
    size: 1,
    created_at: 1,
    started: true,
    removed: 0,
    playerList: {},
  };

  applyTraffickerDeliveries(match, []);

  assert.equal(
    recipient.stats.load.current,
    ItemLibrary.food.weight + ItemLibrary.pistol.weight
  );
  assert.equal(recipient.inventory.carriedItems.length, 2);
});
