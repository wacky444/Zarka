import test from "node:test";
import assert from "node:assert/strict";
import type { PlayerCharacter } from "@shared";
import { getDexterity3CooldownState } from "../src/ui/dexterity3SelectorItems";
import { getLocale, setLocale } from "../src/services/i18n";

function createMockCharacter(overrides?: Partial<PlayerCharacter>): PlayerCharacter {
  return {
    id: "p1",
    userId: "u1",
    name: "Player 1",
    alive: true,
    stats: {
      health: { current: 10, max: 10 },
      energy: { current: 10, max: 10 },
      baseViewRange: 3,
    },
    inventory: {
      carriedWeight: 0,
      maxWeight: 100,
      carriedItems: [],
      storedItems: [],
    },
    statuses: {},
    abilities: ["dexterity3"],
    ...overrides,
  };
}

test("dexterity3 cooldown state when character has no dexterity3 skill", () => {
  const character = createMockCharacter({ abilities: [] });
  const state = getDexterity3CooldownState(character, 5);
  assert.equal(state.isOnCooldown, false);
  assert.equal(state.cooldownRemaining, 0);
  assert.equal(state.label, "Destreza 3");
});

test("dexterity3 cooldown state when availableOnTurn is undefined", () => {
  const character = createMockCharacter({ dexterity3AvailableOnTurn: undefined });
  const state = getDexterity3CooldownState(character, 5);
  assert.equal(state.isOnCooldown, false);
  assert.equal(state.cooldownRemaining, 0);
});

test("dexterity3 cooldown state and i18n label when on cooldown", () => {
  const character = createMockCharacter({ dexterity3AvailableOnTurn: 8 });
  const prevLocale = getLocale();
  try {
    setLocale("en");
    const enState = getDexterity3CooldownState(character, 3);
    assert.equal(enState.isOnCooldown, true);
    assert.equal(enState.cooldownRemaining, 5);
    assert.equal(enState.label, "Dexterity 3 (CD: 5)");

    setLocale("es");
    const esState = getDexterity3CooldownState(character, 3);
    assert.equal(esState.isOnCooldown, true);
    assert.equal(esState.cooldownRemaining, 5);
    assert.equal(esState.label, "Destreza 3 (Enf: 5)");
  } finally {
    setLocale(prevLocale);
  }
});

test("dexterity3 cooldown state when current turn reaches or passes availableOnTurn", () => {
  const character = createMockCharacter({ dexterity3AvailableOnTurn: 8 });
  const prevLocale = getLocale();
  try {
    setLocale("en");
    const readyState = getDexterity3CooldownState(character, 8);
    assert.equal(readyState.isOnCooldown, false);
    assert.equal(readyState.cooldownRemaining, 0);
    assert.equal(readyState.label, "Dexterity 3");

    const pastState = getDexterity3CooldownState(character, 9);
    assert.equal(pastState.isOnCooldown, false);
    assert.equal(pastState.cooldownRemaining, 0);
    assert.equal(pastState.label, "Dexterity 3");
  } finally {
    setLocale(prevLocale);
  }
});
