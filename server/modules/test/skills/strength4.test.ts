import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  getActionEnergyDiscount,
  SkillLibrary,
} from "@shared";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const affectedActions = [
  ActionLibrary.place_c4.id,
  ActionLibrary.place_trap.id,
  ActionLibrary.detonate_c4.id,
];

test("Strength 4 is implemented and discounts C4 and trap actions", () => {
  assert.equal(SkillLibrary.strength4.implemented, true);
  const character = createDefaultCharacter("strength4-test");
  character.abilities = ["strength4"];

  for (const actionId of affectedActions) {
    assert.equal(getActionEnergyDiscount(character, actionId), 2);
  }

  character.abilities.push("strength4");
  for (const actionId of affectedActions) {
    assert.equal(getActionEnergyDiscount(character, actionId), 4);
  }
});
