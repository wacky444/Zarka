import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultCharacter } from "../src/utils/playerCharacter";
import { isVirusInfected } from "../src/utils/virus";

test("isVirusInfected recognizes condition and virus status flags", () => {
  const character = createDefaultCharacter("player");
  assert.equal(isVirusInfected(character), false);

  character.statuses.conditions.push("infected");
  assert.equal(isVirusInfected(character), true);

  character.statuses.conditions = [];
  character.statuses.virus = {
    containsVirus: true,
    contagious: false,
    lastTickTurn: 0,
  };
  assert.equal(isVirusInfected(character), true);

  character.statuses.virus = {
    containsVirus: false,
    contagious: true,
    lastTickTurn: 0,
  };
  assert.equal(isVirusInfected(character), true);
});
