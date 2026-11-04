import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionLibrary } from "@shared";
import type { MatchRecord } from "../src/models/types";
import { assignAfkActions } from "../src/match/afkActions";
import { resolveTurnForMatch } from "../src/match/turnResolution";
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

function createGameMasterMatch(characterIds: string[], gmUserIds: string[] = ["gm1"]): MatchRecord {
  return {
    match_id: "afk-actions-gm-test",
    gameMasterMode: true,
    gameMasterUserIds: gmUserIds,
    players: gmUserIds,
    playerCharacters: Object.fromEntries(
      characterIds.map((charId) => [charId, createDefaultCharacter(charId)])
    ),
    readyStates: Object.fromEntries(characterIds.map((charId) => [charId, false])),
    controlledCharacterRoster: characterIds.map((charId) => ({
      id: charId,
      name: charId,
      skin: { body: "char_a", shoes: "shoes_a", shirt: "shirt_a", hair: "hair_a" }
    })),
    playerList: {},
    size: characterIds.length,
    created_at: 1,
    current_turn: 1,
    started: true,
    removed: 0,
    autoSkip: false
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

test("resolveTurnForMatch assigns random AFK action when server received no action", () => {
  const match = createMatch(["p1"]);
  const logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  } as unknown as nkruntime.Logger;

  delete match.playerCharacters.p1.actionPlan;

  const result = withRandom(() => 0, () =>
    resolveTurnForMatch(match, logger, undefined as unknown as nkruntime.Nakama)
  );

  assert.equal(result.advanced, true);
  assert.equal(
    result.events.some(
      (event) =>
        event.kind === "player" &&
        event.actorId === "p1" &&
        (event.action.actionId === ActionLibrary.dodge.id ||
          event.action.actionId === ActionLibrary.protect.id ||
          event.action.actionId === ActionLibrary.sleep.id)
    ),
    true
  );
});

test("assignAfkActions fills missing main actions for controlled characters in Game Master mode", () => {
  const match = createGameMasterMatch(["c1", "c2", "planned", "unconscious"]);
  const c1 = match.playerCharacters.c1;
  const c2 = match.playerCharacters.c2;
  c2.actionPlan = {
    secondary: { actionId: ActionLibrary.search.id }
  };
  const planned = match.playerCharacters.planned;
  planned.actionPlan = {
    main: { actionId: ActionLibrary.protect.id }
  };
  const unconscious = match.playerCharacters.unconscious;
  unconscious.statuses.conditions.push("unconscious");

  withRandom(() => 0.999999, () => assignAfkActions(match));

  assert.equal(c1.actionPlan?.main?.actionId, ActionLibrary.sleep.id);
  assert.equal(c2.actionPlan?.main?.actionId, ActionLibrary.sleep.id);
  assert.equal(c2.actionPlan?.secondary?.actionId, ActionLibrary.search.id);
  assert.equal(planned.actionPlan?.main?.actionId, ActionLibrary.protect.id);
  assert.equal(unconscious.actionPlan?.main, undefined);
  assert.equal(match.playerCharacters.gm1, undefined);
});

test("resolveTurnForMatch in Game Master mode assigns AFK actions and resets readyStates per character", () => {
  const match = createGameMasterMatch(["char1", "char2"]);
  const logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  } as unknown as nkruntime.Logger;

  delete match.playerCharacters.char1.actionPlan;
  delete match.playerCharacters.char2.actionPlan;
  match.readyStates = { char1: true, char2: true };

  const result = withRandom(() => 0, () =>
    resolveTurnForMatch(match, logger, undefined as unknown as nkruntime.Nakama)
  );

  assert.equal(result.advanced, true);
  assert.equal(
    result.events.some(
      (event) =>
        event.kind === "player" &&
        event.actorId === "char1" &&
        (event.action.actionId === ActionLibrary.dodge.id ||
          event.action.actionId === ActionLibrary.protect.id ||
          event.action.actionId === ActionLibrary.sleep.id)
    ),
    true
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.kind === "player" &&
        event.actorId === "char2" &&
        (event.action.actionId === ActionLibrary.dodge.id ||
          event.action.actionId === ActionLibrary.protect.id ||
          event.action.actionId === ActionLibrary.sleep.id)
    ),
    true
  );
  assert.deepEqual(match.readyStates, { char1: false, char2: false });
});
