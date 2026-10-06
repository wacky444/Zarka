import assert from "node:assert/strict";
import { test } from "node:test";
import { SkillLibrary } from "@shared";
import type { MatchRecord } from "../src/models/types";
import { processBotActions } from "../src/match/botAI";
import { createDefaultCharacter } from "../src/utils/playerCharacter";

const logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

test("bots learn eligible skills according to personality and skip NPC skills", () => {
  const botCharacters = Object.fromEntries(
    ["bot1", "bot2", "bot3", "bot4"].map((botId) => {
      const character = createDefaultCharacter(botId);
      character.progression.availableSkillPoints = 1;
      return [botId, character];
    })
  );
  const match: MatchRecord = {
    match_id: "bot-skill-learning-test",
    players: [],
    playerCharacters: botCharacters,
    playerList: {},
    size: 4,
    created_at: 1,
    current_turn: 1,
    started: true,
    removed: 0,
  };
  const originalRandom = Math.random;
  Math.random = () => 0.4;
  try {
    processBotActions(match, logger);
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(botCharacters.bot1.abilities[0], "agility1");
  assert.equal(botCharacters.bot2.abilities[0], "strength1");
  assert.equal(botCharacters.bot3.abilities[0], "agility2");
  for (const character of Object.values(botCharacters)) {
    assert.equal(character.progression.availableSkillPoints, 0);
    assert.equal(character.progression.spentSkillPoints, 1);
    assert.ok(
      character.abilities.every(
        (skillId) => SkillLibrary[skillId].category !== "npc"
      )
    );
  }
});
