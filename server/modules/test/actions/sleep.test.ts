/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  type PlayerCharacter,
  type ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { advanceTurn } from "../../src/match/advanceTurn";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as nkruntime.Logger;

function createCharacter(
  id: string,
  q: number,
  health = 10,
  energy = 10
): PlayerCharacter {
  const character = createDefaultCharacter(id);
  character.position = { tileId: `tile_${q}`, coord: { q, r: 0 } };
  character.stats.health.current = health;
  character.stats.health.max = 20;
  character.stats.energy.current = energy;
  character.stats.energy.max = 20;
  return character;
}

function createMatch(
  characters: PlayerCharacter[],
  tileCount = 3
): MatchRecord {
  const tiles = Array.from({ length: tileCount }, (_, q) => ({
    id: `tile_${q}`,
    coord: { q, r: 0 },
    localizationType: LocalizationType.Road,
    walkable: true,
    itemIds: [],
  }));
  return {
    match_id: "sleep-test",
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
    map: { cols: tileCount, rows: 1, seed: "sleep", tiles },
    items: [],
  };
}

function getSleepEvent(
  events: ReturnType<typeof advanceTurn>["events"],
  actorId: string
): ReplayPlayerEvent | undefined {
  return events.find(
    (event): event is ReplayPlayerEvent =>
      event.kind === "player" &&
      event.actorId === actorId &&
      event.action.actionId === ActionLibrary.sleep.id
  );
}

test("normal sleep heals 2 HP, costs 0 energy, and does not award bonus XP", () => {
  const p1 = createCharacter("p1", 0, 10, 10);
  p1.actionPlan = {
    main: {
      actionId: ActionLibrary.sleep.id,
      extraExecutions: 0,
    },
  };
  const match = createMatch([p1]);
  const result = advanceTurn(match, 1, logger);

  const event = getSleepEvent(result.events, "p1");
  assert.ok(event);
  assert.equal(event.action.metadata?.healed, 2);
  assert.equal(event.action.metadata?.extraExecutions, 0);
  assert.equal(event.action.metadata?.sharedExtraPower, false);
  assert.equal(event.action.metadata?.experienceGained, undefined);

  assert.equal(p1.stats.health.current, 12);
  assert.equal(p1.stats.energy.current, 10);
});

test("sleep with extra power when nobody else does it performs a normal sleep action without power", () => {
  const p1 = createCharacter("p1", 0, 10, 10);
  p1.actionPlan = {
    main: {
      actionId: ActionLibrary.sleep.id,
      extraExecutions: 1,
    },
  };
  const match = createMatch([p1]);
  const result = advanceTurn(match, 1, logger);

  const event = getSleepEvent(result.events, "p1");
  assert.ok(event);
  // Instead of failing or deducting energy, performs a normal sleep action without power
  assert.equal(event.action.metadata?.healed, 2);
  assert.equal(event.action.metadata?.extraExecutions, 0);
  assert.equal(event.action.metadata?.sharedExtraPower, false);
  assert.equal(event.action.metadata?.experienceGained, undefined);

  assert.equal(p1.stats.health.current, 12);
  // Energy is untouched (0 energy deducted for normal sleep)
  assert.equal(p1.stats.energy.current, 10);
});

test("sleep with extra power when co-located player sleeps without extra power performs normal sleep", () => {
  const p1 = createCharacter("p1", 0, 10, 10);
  p1.actionPlan = {
    main: {
      actionId: ActionLibrary.sleep.id,
      extraExecutions: 1,
    },
  };
  const p2 = createCharacter("p2", 0, 10, 10);
  p2.actionPlan = {
    main: {
      actionId: ActionLibrary.sleep.id,
      extraExecutions: 0,
    },
  };
  const match = createMatch([p1, p2]);
  const result = advanceTurn(match, 1, logger);

  const event1 = getSleepEvent(result.events, "p1");
  assert.ok(event1);
  assert.equal(event1.action.metadata?.healed, 2);
  assert.equal(event1.action.metadata?.extraExecutions, 0);
  assert.equal(event1.action.metadata?.sharedExtraPower, false);
  assert.equal(p1.stats.health.current, 12);
  assert.equal(p1.stats.energy.current, 10);

  const event2 = getSleepEvent(result.events, "p2");
  assert.ok(event2);
  assert.equal(event2.action.metadata?.healed, 2);
  assert.equal(event2.action.metadata?.extraExecutions, 0);
  assert.equal(event2.action.metadata?.sharedExtraPower, false);
  assert.equal(p2.stats.health.current, 12);
  assert.equal(p2.stats.energy.current, 10);
});

test("sleep with extra power when another player in a different cell sleeps with extra power performs normal sleep", () => {
  const p1 = createCharacter("p1", 0, 10, 10);
  p1.actionPlan = {
    main: {
      actionId: ActionLibrary.sleep.id,
      extraExecutions: 1,
    },
  };
  const p2 = createCharacter("p2", 1, 10, 10);
  p2.actionPlan = {
    main: {
      actionId: ActionLibrary.sleep.id,
      extraExecutions: 1,
    },
  };
  const match = createMatch([p1, p2]);
  const result = advanceTurn(match, 1, logger);

  const event1 = getSleepEvent(result.events, "p1");
  assert.ok(event1);
  assert.equal(event1.action.metadata?.healed, 2);
  assert.equal(event1.action.metadata?.extraExecutions, 0);
  assert.equal(event1.action.metadata?.sharedExtraPower, false);
  assert.equal(p1.stats.health.current, 12);
  assert.equal(p1.stats.energy.current, 10);

  const event2 = getSleepEvent(result.events, "p2");
  assert.ok(event2);
  assert.equal(event2.action.metadata?.healed, 2);
  assert.equal(event2.action.metadata?.extraExecutions, 0);
  assert.equal(event2.action.metadata?.sharedExtraPower, false);
  assert.equal(p2.stats.health.current, 12);
  assert.equal(p2.stats.energy.current, 10);
});

test("sleep with extra power when another player in the same cell also sleeps with extra power succeeds", () => {
  const p1 = createCharacter("p1", 0, 10, 10);
  p1.actionPlan = {
    main: {
      actionId: ActionLibrary.sleep.id,
      extraExecutions: 1,
    },
  };
  const p2 = createCharacter("p2", 0, 10, 10);
  p2.actionPlan = {
    main: {
      actionId: ActionLibrary.sleep.id,
      extraExecutions: 1,
    },
  };
  const match = createMatch([p1, p2]);
  const result = advanceTurn(match, 1, logger);

  const event1 = getSleepEvent(result.events, "p1");
  assert.ok(event1);
  assert.equal(event1.action.metadata?.healed, 7);
  assert.equal(event1.action.metadata?.extraExecutions, 1);
  assert.equal(event1.action.metadata?.sharedExtraPower, true);
  assert.equal(event1.action.metadata?.experienceGained, 4);
  assert.equal(p1.stats.health.current, 17);
  assert.equal(p1.stats.energy.current, 8);

  const event2 = getSleepEvent(result.events, "p2");
  assert.ok(event2);
  assert.equal(event2.action.metadata?.healed, 7);
  assert.equal(event2.action.metadata?.extraExecutions, 1);
  assert.equal(event2.action.metadata?.sharedExtraPower, true);
  assert.equal(event2.action.metadata?.experienceGained, 4);
  assert.equal(p2.stats.health.current, 17);
  assert.equal(p2.stats.energy.current, 8);
});

test("sleep with extra power when co-located player cannot afford extra power falls back to normal sleep", () => {
  const p1 = createCharacter("p1", 0, 10, 10);
  p1.actionPlan = {
    main: {
      actionId: ActionLibrary.sleep.id,
      extraExecutions: 1,
    },
  };
  // p2 has 0 energy, cannot afford extra execution cost of 2
  const p2 = createCharacter("p2", 0, 10, 0);
  p2.actionPlan = {
    main: {
      actionId: ActionLibrary.sleep.id,
      extraExecutions: 1,
    },
  };
  const match = createMatch([p1, p2]);
  const result = advanceTurn(match, 1, logger);

  const event1 = getSleepEvent(result.events, "p1");
  assert.ok(event1);
  assert.equal(event1.action.metadata?.healed, 2);
  assert.equal(event1.action.metadata?.extraExecutions, 0);
  assert.equal(event1.action.metadata?.sharedExtraPower, false);
  assert.equal(p1.stats.health.current, 12);
  assert.equal(p1.stats.energy.current, 10);

  const event2 = getSleepEvent(result.events, "p2");
  assert.ok(event2);
  assert.equal(event2.action.metadata?.healed, 2);
  assert.equal(event2.action.metadata?.extraExecutions, 0);
  assert.equal(event2.action.metadata?.sharedExtraPower, false);
  assert.equal(p2.stats.health.current, 12);
  assert.equal(p2.stats.energy.current, 0);
});
