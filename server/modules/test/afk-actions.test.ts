import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionLibrary } from "@shared";
import type { MatchRecord } from "../src/models/types";
import { assignAfkActions } from "../src/match/afkActions";
import { createDefaultCharacter } from "../src/utils/playerCharacter";

function createMatch(playerIds: string[]): MatchRecord {
  return {
    match_id: "afk-actions-test",
    players: playerIds,
    playerCharacters: Object.fromEntries(
      playerIds.map((playerId) => [playerId, createDefaultCharacter(playerId)])
    ),
    playerList: {},
    size: playerIds.length,
    created_at: 1,
    current_turn: 1,
    started: true,
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

test("auto-skip fills missing main actions with a random off-cooldown AFK action", () => {
  const match = createMatch(["afk", "secondaryOnly", "planned", "blocked", "unconscious"]);
  const afkCharacter = match.playerCharacters.afk;
  afkCharacter.statuses.cooldowns = [
    {
      actionId: ActionLibrary.dodge.id,
      remainingTurns: 1,
      availableOnTurn: 3
    }
  ];
  afkCharacter.actionPlan = {
    secondary: { actionId: ActionLibrary.search.id }
  };

  const secondaryOnlyCharacter = match.playerCharacters.secondaryOnly;
  secondaryOnlyCharacter.actionPlan = {
    secondary: { actionId: ActionLibrary.search.id }
  };

  const plannedCharacter = match.playerCharacters.planned;
  plannedCharacter.actionPlan = {
    main: { actionId: ActionLibrary.protect.id }
  };

  const blockedCharacter = match.playerCharacters.blocked;
  blockedCharacter.statuses.cooldowns = [
    ActionLibrary.dodge.id,
    ActionLibrary.protect.id,
    ActionLibrary.sleep.id
  ].map((actionId) => ({
    actionId,
    remainingTurns: 1,
    availableOnTurn: 3
  }));

  const unconsciousCharacter = match.playerCharacters.unconscious;
  unconsciousCharacter.statuses.conditions.push("unconscious");

  withRandom(() => 0.999999, () => assignAfkActions(match));

  assert.equal(afkCharacter.actionPlan?.main?.actionId, ActionLibrary.sleep.id);
  assert.equal(
    afkCharacter.actionPlan?.secondary?.actionId,
    ActionLibrary.search.id
  );
  assert.equal(
    secondaryOnlyCharacter.actionPlan?.main?.actionId,
    ActionLibrary.sleep.id
  );
  assert.equal(
    secondaryOnlyCharacter.actionPlan?.secondary?.actionId,
    ActionLibrary.search.id
  );
  assert.equal(plannedCharacter.actionPlan?.main?.actionId, ActionLibrary.protect.id);
  assert.equal(blockedCharacter.actionPlan?.main, undefined);
  assert.equal(unconsciousCharacter.actionPlan?.main, undefined);
});
