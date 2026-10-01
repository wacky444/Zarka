import assert from "node:assert/strict";
import { test } from "node:test";
import type { MatchRecord } from "../src/models/types";
import { distributeTeams } from "../src/match/teams";
import { createDefaultCharacter } from "../src/utils/playerCharacter";

function createMatch(humanCount: number, botCount: number): MatchRecord {
  const players = Array.from({ length: humanCount }, (_, index) => `player${index + 1}`);
  const botIds = Array.from({ length: botCount }, (_, index) => `bot${index + 1}`);
  const playerCharacters = Object.fromEntries(
    [...players, ...botIds].map((playerId) => [
      playerId,
      createDefaultCharacter(playerId)
    ])
  );
  return {
    match_id: "team-assignment-test",
    players,
    playerCharacters,
    playerList: {},
    botPlayers: botCount,
    size: humanCount,
    created_at: 1,
    current_turn: 0,
    started: false,
    removed: 0
  };
}

function withRandom<T>(random: () => number, callback: () => T): T {
  const originalRandom = Math.random;
  Math.random = random;
  try {
    return callback();
  } finally {
    Math.random = originalRandom;
  }
}

test("Hero selection can choose humans or bots regardless of roster order", () => {
  const humanHero = withRandom(() => 0, () =>
    distributeTeams(createMatch(9, 2))
  );
  const botHero = withRandom(() => 0.999999, () =>
    distributeTeams(createMatch(9, 2))
  );

  assert.equal(humanHero.heroPlayerId, "player1");
  assert.equal(botHero.heroPlayerId, "bot2");
});

test("Twin pair is selected across teams and may include a bot", () => {
  let callIndex = 0;
  const match = createMatch(6, 2);
  const assignment = withRandom(() => {
    const currentCall = callIndex;
    callIndex += 1;
    return currentCall === 27 ? 0.5 : 0.999999;
  }, () => distributeTeams(match));

  assert.deepEqual(assignment.twinPlayerIds, ["player4", "bot2"]);
  assert.equal(match.playerCharacters.player4.secretTeamId, "Gemelos");
  assert.equal(match.playerCharacters.bot2.secretTeamId, "Gemelos");
});

test("matches with six or fewer participants keep existing no-special-role rule", () => {
  const assignment = withRandom(() => 0.5, () =>
    distributeTeams(createMatch(4, 2))
  );

  assert.equal(assignment.heroPlayerId, undefined);
  assert.equal(assignment.twinPlayerIds, undefined);
});
