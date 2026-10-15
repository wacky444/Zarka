import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerCharacter } from "@shared";
import { awardExperience } from "../src/match/progression";

function character(): PlayerCharacter {
  return {
    id: "player",
    name: "Player",
    stats: {
      health: { current: 10, max: 10, knockoutThreshold: 5, injuredMax: 5 },
      energy: { current: 10, max: 10 },
      load: { current: 0, max: 10 },
      speed: 0,
      sympathy: 0,
      baseViewRange: 0,
    },
    progression: {
      level: 1,
      experience: 0,
      experienceForNextLevel: 10,
      availableSkillPoints: 0,
      spentSkillPoints: 0,
    },
    abilities: [],
    inventory: { carriedItems: [] },
    relationships: { confirmedTeammates: [], alliances: [], representatives: [] },
    statuses: { conditions: [] },
    discoveredItemIds: [],
  };
}

test("experience awards one skill point per level and preserves XP overflow", () => {
  const player = character();
  const result = awardExperience(player, 25);

  assert.deepEqual(result, { experienceGained: 25, levelsGained: 2 });
  assert.equal(player.progression?.level, 3);
  assert.equal(player.progression?.experience, 5);
  assert.equal(player.progression?.experienceForNextLevel, 10);
  assert.equal(player.progression?.availableSkillPoints, 2);
});

test("experience stops leveling at level 10", () => {
  const player = character();
  player.progression!.level = 9;
  const result = awardExperience(player, 30);

  assert.equal(result.levelsGained, 1);
  assert.equal(player.progression?.level, 10);
  assert.equal(player.progression?.experienceForNextLevel, 0);
  assert.equal(player.progression?.availableSkillPoints, 1);
});
