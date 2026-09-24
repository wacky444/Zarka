/// <reference path="../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  isCharacterHidden,
  type PlayerCharacter,
  type ReplayEvent,
} from "@shared";
import type { MatchRecord } from "../src/models/types";
import { advanceTurn } from "../src/match/advanceTurn";
import { collectTargets } from "../src/match/actions/targeting";
import { tailorPlayerCharactersForViewer } from "../src/utils/matchView";
import { createDefaultCharacter } from "../src/utils/playerCharacter";

const logger = { debug: () => {}, warn: () => {} } as unknown as nkruntime.Logger;

function createCharacter(id: string, q: number): PlayerCharacter {
  const character = createDefaultCharacter(id);
  character.position = { tileId: `tile_${q}`, coord: { q, r: 0 } };
  return character;
}

function createMatch(
  characters: PlayerCharacter[],
  tileCount: number
): MatchRecord {
  const tiles = Array.from({ length: tileCount }, (_, q) => ({
    id: `tile_${q}`,
    coord: { q, r: 0 },
    localizationType: LocalizationType.Road,
    walkable: true,
    itemIds: [],
  }));
  return {
    match_id: "coward-test",
    players: characters.map((character) => character.id),
    playerCharacters: Object.fromEntries(
      characters.map((character) => [character.id, character])
    ),
    playerList: {},
    size: characters.length,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0,
    map: { cols: tileCount, rows: 1, seed: "coward", tiles },
    items: [],
  };
}

function hasHiddenLogEvent(events: ReplayEvent[], playerId: string): boolean {
  return events.some(
    (event) =>
      event.kind === "player" &&
      event.actorId === playerId &&
      event.action.actionId === "status_hidden"
  );
}

test("coward characters are hidden by default and emit the invisible log event", () => {
  const coward = createCharacter("coward", 0);
  coward.abilities.push("coward");
  const match = createMatch([coward], 1);

  const result = advanceTurn(match, 1, logger);
  const hiddenEvent = result.events.find(
    (event) =>
      event.kind === "player" && event.action.actionId === "status_hidden"
  );

  assert.equal(isCharacterHidden(coward, 1), true);
  assert.ok(hiddenEvent && hiddenEvent.kind === "player");
  assert.deepEqual(hiddenEvent.visibility, { scope: "all" });
});

test("moving reveals a coward for the current turn", () => {
  const coward = createCharacter("coward", 0);
  coward.abilities.push("coward");
  coward.actionPlan = {
    main: {
      actionId: ActionLibrary.move.id,
      targetLocationId: { q: 1, r: 0 },
    },
  };
  const match = createMatch([coward], 2);

  const result = advanceTurn(match, 1, logger);

  assert.equal(ActionLibrary.move.revealsHidden, true);
  assert.equal(coward.cowardRevealedTurn, 1);
  assert.equal(isCharacterHidden(coward, 1), false);
  assert.equal(hasHiddenLogEvent(result.events, coward.id), false);
  assert.equal(isCharacterHidden(coward, 2), true);
});

test("sleep reveals a coward only when an extra execution is used", () => {
  const restedCoward = createCharacter("rested-coward", 0);
  restedCoward.abilities.push("coward");
  restedCoward.actionPlan = {
    main: {
      actionId: ActionLibrary.sleep.id,
      extraExecutions: 0,
    },
  };
  const restedMatch = createMatch([restedCoward], 1);
  const restedResult = advanceTurn(restedMatch, 1, logger);
  assert.equal(restedCoward.cowardRevealedTurn, undefined);
  assert.equal(hasHiddenLogEvent(restedResult.events, restedCoward.id), true);

  const energizedCoward = createCharacter("energized-coward", 0);
  energizedCoward.abilities.push("coward");
  energizedCoward.actionPlan = {
    main: {
      actionId: ActionLibrary.sleep.id,
      extraExecutions: 1,
    },
  };
  const energizedMatch = createMatch([energizedCoward], 1);
  const energizedResult = advanceTurn(energizedMatch, 1, logger);
  assert.equal(energizedCoward.cowardRevealedTurn, 1);
  assert.equal(hasHiddenLogEvent(energizedResult.events, energizedCoward.id), false);
});

test("the silenced pistol does not reveal a coward", () => {
  const coward = createCharacter("coward", 0);
  coward.abilities.push("coward");
  coward.inventory.carriedItems = [
    { itemId: "suppressed_pistol", quantity: 1, weight: 4 },
    { itemId: "bullet", quantity: 1, weight: 1 },
  ];
  coward.actionPlan = {
    main: {
      actionId: ActionLibrary.shoot_pistol.id,
      targetPlayerIds: ["target"],
      targetLocationId: { q: 0, r: 0 },
    },
  };
  const target = createCharacter("target", 0);
  const match = createMatch([coward, target], 1);

  const result = advanceTurn(match, 1, logger);

  assert.equal(coward.cowardRevealedTurn, undefined);
  assert.equal(isCharacterHidden(coward, 1), true);
  assert.equal(hasHiddenLogEvent(result.events, coward.id), true);
});

test("single-target attacks skip a hidden player when a visible target is available", () => {
  const actor = createCharacter("actor", 0);
  const visible = createCharacter("visible", 0);
  const coward = createCharacter("coward", 0);
  coward.abilities.push("coward");
  const match = createMatch([actor, visible, coward], 1);
  const participant = {
    playerId: actor.id,
    character: actor,
    plan: {
      actionId: ActionLibrary.punch.id,
      targetLocationId: { q: 0, r: 0 },
    },
    planKey: "main" as const,
  };

  const targets = collectTargets(ActionLibrary.punch.id, participant, match, {
    allowMultiple: false,
  });

  assert.deepEqual(targets.map((target) => target.id), ["visible"]);
});

test("bat attacks include hidden players and hidden-only locations can still be attacked", () => {
  const actor = createCharacter("actor", 0);
  const visible = createCharacter("visible", 0);
  const coward = createCharacter("coward", 0);
  coward.abilities.push("coward");
  const match = createMatch([actor, visible, coward], 1);
  const batParticipant = {
    playerId: actor.id,
    character: actor,
    plan: {
      actionId: ActionLibrary.bat_attack.id,
      targetLocationId: { q: 0, r: 0 },
    },
    planKey: "main" as const,
  };
  const batTargets = collectTargets(
    ActionLibrary.bat_attack.id,
    batParticipant,
    match,
    { allowMultiple: true }
  );

  assert.deepEqual(
    batTargets.map((target) => target.id).sort(),
    ["coward", "visible"]
  );

  const hiddenOnlyMatch = createMatch([actor, coward], 1);
  const punchParticipant = {
    playerId: actor.id,
    character: actor,
    plan: {
      actionId: ActionLibrary.punch.id,
      targetLocationId: { q: 0, r: 0 },
    },
    planKey: "main" as const,
  };
  const hiddenOnlyTargets = collectTargets(
    ActionLibrary.punch.id,
    punchParticipant,
    hiddenOnlyMatch,
    { allowMultiple: false }
  );
  assert.deepEqual(hiddenOnlyTargets.map((target) => target.id), ["coward"]);
});

test("viewer tailoring hides cowards even when observed remotely, but reveals them after acting", () => {
  const viewer = createCharacter("viewer", 0);
  const coward = createCharacter("coward", 1);
  coward.abilities.push("coward");
  viewer.remoteView = { coord: { q: 1, r: 0 }, turn: 1 };
  const characters = { viewer, coward };

  const hiddenView = tailorPlayerCharactersForViewer(
    characters,
    viewer.id,
    false,
    1
  );
  assert.equal(hiddenView?.coward, undefined);

  coward.cowardRevealedTurn = 1;
  const revealedView = tailorPlayerCharactersForViewer(
    characters,
    viewer.id,
    false,
    1
  );
  assert.ok(revealedView?.coward);
});
