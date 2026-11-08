/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  ReplayActionEffect,
  type PlayerCharacter,
  type ReplayEvent,
  type ReplayPlayerEvent
} from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executeAction } from "../../src/match/actionExecutor";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = { debug: () => undefined } as unknown as nkruntime.Logger;

function createCharacter(id: string, q = 0): PlayerCharacter {
  const character = createDefaultCharacter(id);
  character.position = { tileId: `tile_${q}`, coord: { q, r: 0 } };
  character.stats.energy.current = 10;
  return character;
}

function createMatch(characters: PlayerCharacter[]): MatchRecord {
  return {
    match_id: "protect-test",
    players: characters.map((c) => c.id),
    playerCharacters: Object.fromEntries(characters.map((c) => [c.id, c])),
    playerList: {},
    size: characters.length,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0
  };
}

function getProtectEvent(events: ReplayEvent[]): ReplayPlayerEvent {
  const event = events.find(
    (entry) =>
      entry.kind === "player" &&
      entry.action.actionId === ActionLibrary.protect.id
  );
  assert.ok(event && event.kind === "player");
  return event as ReplayPlayerEvent;
}

test("protect action always protects own character when no target is selected", () => {
  const actor = createCharacter("actor");
  actor.actionPlan = {
    main: { actionId: ActionLibrary.protect.id }
  };
  const match = createMatch([actor]);

  const events = executeAction(match, ActionLibrary.protect, 1, {}, logger);
  const event = getProtectEvent(events);

  assert.ok(actor.statuses.conditions.includes("protected"));
  assert.equal(event.targets?.length, 1);
  assert.equal(event.targets?.[0].targetId, "actor");
  assert.equal(event.targets?.[0].effects, ReplayActionEffect.Guard);
});

test("protect action always protects own character when self is selected as target", () => {
  const actor = createCharacter("actor");
  actor.actionPlan = {
    main: { actionId: ActionLibrary.protect.id, targetPlayerIds: ["actor"] }
  };
  const match = createMatch([actor]);

  const events = executeAction(match, ActionLibrary.protect, 1, {}, logger);
  const event = getProtectEvent(events);

  assert.ok(actor.statuses.conditions.includes("protected"));
  assert.equal(event.targets?.length, 1);
  assert.equal(event.targets?.[0].targetId, "actor");
});

test("protect action protects both own character and target when another player is selected", () => {
  const actor = createCharacter("actor");
  const target = createCharacter("target");
  actor.actionPlan = {
    main: { actionId: ActionLibrary.protect.id, targetPlayerIds: ["target"] }
  };
  const match = createMatch([actor, target]);

  const events = executeAction(match, ActionLibrary.protect, 1, {}, logger);
  const event = getProtectEvent(events);

  assert.ok(actor.statuses.conditions.includes("protected"));
  assert.ok(target.statuses.conditions.includes("protected"));

  const targetIds = event.targets?.map((t) => t.targetId) ?? [];
  assert.ok(targetIds.includes("actor"));
  assert.ok(targetIds.includes("target"));
  assert.equal(targetIds.length, 2);
});

test("protect action protects own character even if selected target is dead", () => {
  const actor = createCharacter("actor");
  const deadTarget = createCharacter("deadTarget");
  deadTarget.stats.health.current = 0;
  deadTarget.statuses.conditions = ["dead"];
  actor.actionPlan = {
    main: {
      actionId: ActionLibrary.protect.id,
      targetPlayerIds: ["deadTarget"]
    }
  };
  const match = createMatch([actor, deadTarget]);

  const events = executeAction(match, ActionLibrary.protect, 1, {}, logger);
  const event = getProtectEvent(events);

  assert.ok(actor.statuses.conditions.includes("protected"));
  assert.equal(event.targets?.length, 1);
  assert.equal(event.targets?.[0].targetId, "actor");
});
