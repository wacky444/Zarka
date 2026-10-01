/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  type PlayerCharacter,
  type ReplayEvent,
} from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executeAction } from "../../src/match/actionExecutor";
import { applyVirusInfection } from "../../src/match/actions/virusInfection";
import { tailorReplayEvents } from "../../src/match/replay/tailorReplay";
import { tailorPlayerCharactersForViewer } from "../../src/utils/matchView";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = { debug: () => undefined } as unknown as nkruntime.Logger;

function createCharacter(id: string, q = 0): PlayerCharacter {
  const character = createDefaultCharacter(id);
  character.position = { tileId: `tile_${q}`, coord: { q, r: 0 } };
  character.stats.energy.current = 5;
  return character;
}

function createMatch(
  actor: PlayerCharacter,
  targets: PlayerCharacter[]
): MatchRecord {
  const characters = [actor, ...targets];
  return {
    match_id: "inject-virus-test",
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
  };
}

function getEvent(events: ReplayEvent[], actionId: string) {
  const event = events.find(
    (entry) => entry.kind === "player" && entry.action.actionId === actionId
  );
  assert.ok(event && event.kind === "player");
  return event;
}

function infectPlan(actor: PlayerCharacter, targetPlayerIds?: string[]): void {
  actor.inventory.carriedItems = [
    { itemId: "virus", quantity: 1, weight: 1 },
  ];
  actor.stats.load.current = 1;
  actor.actionPlan = {
    main: {
      actionId: ActionLibrary.inject_virus.id,
      ...(targetPlayerIds ? { targetPlayerIds } : {}),
    },
  };
}

test("inject virus infects selected co-located target and consumes vial", () => {
  const actor = createCharacter("actor");
  const target = createCharacter("target");
  infectPlan(actor, [target.id]);
  const match = createMatch(actor, [target]);

  const events = executeAction(match, ActionLibrary.inject_virus, 1, {}, logger);
  const event = getEvent(events, ActionLibrary.inject_virus.id);

  assert.equal(target.statuses.virus?.containsVirus, true);
  assert.equal(target.statuses.virus?.contagious, true);
  assert.ok(target.statuses.conditions.includes("infected"));
  assert.equal(target.stats.health.current, 10);
  assert.equal(actor.inventory.carriedItems.length, 0);
  assert.equal(actor.stats.load.current, 0);
  assert.equal(actor.stats.energy.current, 4);
  assert.deepEqual(event.targets?.map((entry) => entry.targetId), [target.id]);
  assert.equal(event.visibility?.scope, "limited");
  assert.deepEqual(
    event.visibility?.scope === "limited" ? event.visibility.playerIds : [],
    [actor.id]
  );
});

test("inject virus defaults to infecting actor when no target is selected", () => {
  const actor = createCharacter("actor");
  infectPlan(actor);
  const match = createMatch(actor, []);

  const event = getEvent(
    executeAction(match, ActionLibrary.inject_virus, 1, {}, logger),
    ActionLibrary.inject_virus.id
  );

  assert.equal(actor.statuses.virus?.containsVirus, true);
  assert.deepEqual(event.targets?.map((entry) => entry.targetId), [actor.id]);
});

test("invalid remote target fails without consuming virus, but spends energy and cooldown", () => {
  const actor = createCharacter("actor");
  const target = createCharacter("target", 1);
  infectPlan(actor, [target.id]);
  const match = createMatch(actor, [target]);

  const events = executeAction(match, ActionLibrary.inject_virus, 1, {}, logger);
  const failure = getEvent(events, ActionLibrary.failedAction.id);

  assert.equal(actor.inventory.carriedItems[0]?.itemId, "virus");
  assert.equal(actor.stats.load.current, 1);
  assert.equal(actor.stats.energy.current, 4);
  assert.equal(actor.statuses.cooldowns?.[0]?.actionId, "inject_virus");
  assert.equal(failure.action.metadata?.attemptedActionId, "inject_virus");
  assert.equal(failure.action.metadata?.reason, "invalid_target");
  assert.equal(target.statuses.virus?.containsVirus, undefined);
});

test("injection replay and infection status stay hidden from other players", () => {
  const actor = createCharacter("actor");
  const target = createCharacter("target");
  const observer = createCharacter("observer");
  infectPlan(actor, [target.id]);
  const match = createMatch(actor, [target, observer]);
  const events = executeAction(match, ActionLibrary.inject_virus, 1, {}, logger);

  assert.equal(
    tailorReplayEvents(events, target.id, match.playerCharacters, 0).some(
      (event) =>
        event.kind === "player" &&
        event.action.actionId === ActionLibrary.inject_virus.id
    ),
    false
  );
  assert.equal(
    tailorReplayEvents(events, actor.id, match.playerCharacters, 0).some(
      (event) =>
        event.kind === "player" &&
        event.action.actionId === ActionLibrary.inject_virus.id
    ),
    true
  );

  const view = tailorPlayerCharactersForViewer(
    match.playerCharacters,
    observer.id,
    false,
    1
  );
  assert.equal(view?.[target.id]?.statuses.virus, undefined);
  assert.equal(
    view?.[target.id]?.statuses.conditions.includes("infected"),
    false
  );
  const targetView = tailorPlayerCharactersForViewer(
    match.playerCharacters,
    target.id,
    false,
    1
  );
  assert.equal(targetView?.[target.id]?.statuses.virus, undefined);
  assert.equal(
    targetView?.[target.id]?.statuses.conditions.includes("infected"),
    false
  );
  assert.equal(target.statuses.virus?.containsVirus, true);
});

test("virus damages co-located non-incapacitated unvaccinated characters, not source", () => {
  const source = createCharacter("source");
  const target = createCharacter("target");
  const fainted = createCharacter("fainted");
  const vaccinated = createCharacter("vaccinated");
  source.statuses.virus = {
    containsVirus: true,
    contagious: true,
    lastTickTurn: 0,
  };
  source.statuses.conditions.push("infected");
  fainted.statuses.conditions.push("unconscious");
  vaccinated.statuses.vaccine = { immune: true };
  const match = createMatch(source, [target, fainted, vaccinated]);

  const events = applyVirusInfection(match, 1, logger);

  assert.equal(source.stats.health.current, 10);
  assert.equal(target.stats.health.current, 9);
  assert.equal(fainted.stats.health.current, 10);
  assert.equal(vaccinated.stats.health.current, 10);
  assert.equal(events.length, 1);
  assert.equal(
    getEvent(events, ActionLibrary.inject_virus.id).action.metadata?.infectionTick,
    true
  );
});
