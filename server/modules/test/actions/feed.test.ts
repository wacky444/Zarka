/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  type HexTileSnapshot,
  type PlayerCharacter,
} from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executeFeedAction } from "../../src/match/actions/feed";
import { type PlannedActionParticipant } from "../../src/match/actions/utils";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

function createFeedScenario(
  carriedItems: Array<{ itemId: "food" | "drink"; quantity: number; weight: number }> = [],
  energyCurrent: number = 10,
  extraExecutions: number = 0
): { participant: PlannedActionParticipant; match: MatchRecord } {
  const actor = createDefaultCharacter("feed-actor");
  actor.position = { tileId: "tile-1", coord: { q: 0, r: 0 } };
  actor.stats.energy.current = energyCurrent;
  actor.stats.energy.max = 50;
  actor.inventory.carriedItems = carriedItems;

  const plan = {
    actionId: ActionLibrary.feed.id,
    ...(extraExecutions > 0 ? { extraExecutions } : {}),
  };
  actor.actionPlan = { secondary: plan };

  const participant: PlannedActionParticipant = {
    playerId: actor.id,
    character: actor,
    plan,
    planKey: "secondary",
  };

  const tile: HexTileSnapshot = {
    id: "tile-1",
    coord: { q: 0, r: 0 },
    localizationType: LocalizationType.Meadow,
    walkable: true,
    itemIds: [],
  };

  const match: MatchRecord = {
    match_id: "feed-test-match",
    players: [actor.id],
    playerCharacters: { [actor.id]: actor },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 1,
    started: true,
    removed: 0,
    map: { cols: 1, rows: 1, seed: "feed-test", tiles: [tile] },
  };

  return { participant, match };
}

test("Feed without extra executions consumes 1 food and restores 20 energy", () => {
  const { participant, match } = createFeedScenario(
    [{ itemId: "food", quantity: 2, weight: 6 }],
    10,
    0
  );

  const events = executeFeedAction([participant], match);
  const feedEvent = events.find(
    (e) => e.kind === "player" && e.action.actionId === "feed"
  );

  assert.ok(feedEvent && feedEvent.kind === "player");
  const meta = feedEvent.action.metadata as Record<string, unknown>;
  assert.equal(meta.energyRestored, 20);
  assert.equal(meta.consumedItemId, "food");
  assert.deepEqual(meta.consumedItems, ["food"]);
  assert.equal(meta.extraExecutions, undefined);

  const carried = participant.character.inventory.carriedItems;
  assert.equal(carried.find((i) => i.itemId === "food")?.quantity, 1);
  assert.equal(participant.character.stats.energy.current, 30);
});

test("Feed with extraExecutions consumes 2 food, restores 40 energy, and deducts 2 energy cost", () => {
  const { participant, match } = createFeedScenario(
    [{ itemId: "food", quantity: 2, weight: 6 }],
    10,
    1
  );

  const events = executeFeedAction([participant], match);
  const feedEvent = events.find(
    (e) => e.kind === "player" && e.action.actionId === "feed"
  );

  assert.ok(feedEvent && feedEvent.kind === "player");
  const meta = feedEvent.action.metadata as Record<string, unknown>;
  assert.equal(meta.energyRestored, 40);
  assert.equal(meta.consumedItemId, "food");
  assert.deepEqual(meta.consumedItems, ["food", "food"]);
  assert.equal(meta.extraExecutions, 1);

  const carried = participant.character.inventory.carriedItems;
  assert.equal(carried.find((i) => i.itemId === "food"), undefined);
  assert.equal(participant.character.stats.energy.current, 10 - 2 + 40);
});

test("Feed with extraExecutions stops gracefully if only 1 food is available", () => {
  const { participant, match } = createFeedScenario(
    [{ itemId: "food", quantity: 1, weight: 6 }],
    10,
    1
  );

  const events = executeFeedAction([participant], match);
  const feedEvent = events.find(
    (e) => e.kind === "player" && e.action.actionId === "feed"
  );

  assert.ok(feedEvent && feedEvent.kind === "player");
  const meta = feedEvent.action.metadata as Record<string, unknown>;
  assert.equal(meta.energyRestored, 20);
  assert.deepEqual(meta.consumedItems, ["food"]);

  const carried = participant.character.inventory.carriedItems;
  assert.equal(carried.find((i) => i.itemId === "food"), undefined);
  assert.equal(participant.character.stats.energy.current, 10 - 2 + 20);
});

test("Feed another character in the same cell consumes actor food and restores energy to target", () => {
  const { participant, match } = createFeedScenario(
    [{ itemId: "food", quantity: 2, weight: 6 }],
    10,
    0
  );

  const target = createDefaultCharacter("target-player");
  target.position = { tileId: "tile-1", coord: { q: 0, r: 0 } };
  target.stats.energy.current = 5;
  target.stats.energy.max = 50;

  match.players.push(target.id);
  match.playerCharacters![target.id] = target;

  participant.plan.targetPlayerIds = [target.id];

  const events = executeFeedAction([participant], match);
  const feedEvent = events.find(
    (e) => e.kind === "player" && e.action.actionId === "feed"
  );

  assert.ok(feedEvent && feedEvent.kind === "player");
  assert.equal(feedEvent.actorId, participant.playerId);
  assert.equal(feedEvent.targets?.[0]?.targetId, target.id);

  const meta = feedEvent.action.metadata as Record<string, unknown>;
  assert.equal(meta.energyRestored, 20);
  assert.equal(meta.targetPlayerId, target.id);

  // Actor consumed 1 food but didn't gain the 20 energy
  const carried = participant.character.inventory.carriedItems;
  assert.equal(carried.find((i) => i.itemId === "food")?.quantity, 1);
  assert.equal(participant.character.stats.energy.current, 10);

  // Target received the 20 energy
  assert.equal(target.stats.energy.current, 25);
  assert.equal(match.playerCharacters![target.id].stats.energy.current, 25);
});

test("Feed another character in a different cell falls back to feeding ownself", () => {
  const { participant, match } = createFeedScenario(
    [{ itemId: "food", quantity: 2, weight: 6 }],
    10,
    0
  );

  const target = createDefaultCharacter("remote-player");
  target.position = { tileId: "tile-2", coord: { q: 2, r: 2 } };
  target.stats.energy.current = 5;
  target.stats.energy.max = 50;

  match.players.push(target.id);
  match.playerCharacters![target.id] = target;

  participant.plan.targetPlayerIds = [target.id];

  const events = executeFeedAction([participant], match);
  const feedEvent = events.find(
    (e) => e.kind === "player" && e.action.actionId === "feed"
  );

  assert.ok(feedEvent && feedEvent.kind === "player");
  assert.equal(feedEvent.actorId, participant.playerId);
  assert.equal(feedEvent.targets?.[0]?.targetId, participant.playerId);

  const meta = feedEvent.action.metadata as Record<string, unknown>;
  assert.equal(meta.energyRestored, 20);
  assert.equal(meta.targetPlayerId, undefined);

  // Actor consumed 1 food and received the 20 energy (fed ownself)
  const carried = participant.character.inventory.carriedItems;
  assert.equal(carried.find((i) => i.itemId === "food")?.quantity, 1);
  assert.equal(participant.character.stats.energy.current, 30);

  // Target was not affected
  assert.equal(target.stats.energy.current, 5);
});

test("Feed another character who is dead falls back to feeding ownself", () => {
  const { participant, match } = createFeedScenario(
    [{ itemId: "food", quantity: 2, weight: 6 }],
    10,
    0
  );

  const target = createDefaultCharacter("dead-player");
  target.position = { tileId: "tile-1", coord: { q: 0, r: 0 } };
  target.stats.energy.current = 0;
  target.stats.health.current = 0;
  target.statuses = { conditions: ["dead"] };

  match.players.push(target.id);
  match.playerCharacters![target.id] = target;

  participant.plan.targetPlayerIds = [target.id];

  const events = executeFeedAction([participant], match);
  const feedEvent = events.find(
    (e) => e.kind === "player" && e.action.actionId === "feed"
  );

  assert.ok(feedEvent && feedEvent.kind === "player");
  assert.equal(feedEvent.actorId, participant.playerId);
  assert.equal(feedEvent.targets?.[0]?.targetId, participant.playerId);

  // Actor fed ownself
  assert.equal(participant.character.stats.energy.current, 30);
});

test("Feed another character in the same cell with poisoned food intoxicates the recipient", () => {
  const actor = createDefaultCharacter("poison-actor");
  actor.position = { tileId: "tile-1", coord: { q: 0, r: 0 } };
  actor.stats.energy.current = 10;
  actor.stats.energy.max = 50;
  actor.inventory.carriedItems = [
    { itemId: "food", quantity: 1, weight: 3, metadata: { poisonedBy: "poisoner-id" } }
  ];

  const target = createDefaultCharacter("victim-player");
  target.position = { tileId: "tile-1", coord: { q: 0, r: 0 } };
  target.stats.energy.current = 5;
  target.stats.energy.max = 50;

  const plan = {
    actionId: ActionLibrary.feed.id,
    targetPlayerIds: [target.id],
  };
  actor.actionPlan = { secondary: plan };

  const participant: PlannedActionParticipant = {
    playerId: actor.id,
    character: actor,
    plan,
    planKey: "secondary",
  };

  const match: MatchRecord = {
    match_id: "feed-poison-test",
    players: [actor.id, target.id],
    playerCharacters: { [actor.id]: actor, [target.id]: target },
    playerList: {},
    size: 2,
    created_at: 1,
    current_turn: 1,
    started: true,
    removed: 0,
    map: { cols: 1, rows: 1, seed: "feed-test", tiles: [] },
  };

  const events = executeFeedAction([participant], match);
  const feedEvent = events.find(
    (e) => e.kind === "player" && e.action.actionId === "feed"
  );

  assert.ok(feedEvent && feedEvent.kind === "player");
  assert.equal(feedEvent.targets?.[0]?.targetId, target.id);

  // Target received energy and became intoxicated
  assert.equal(target.stats.energy.current, 25);
  assert.ok(target.statuses?.conditions?.includes("intoxicated"));
  assert.equal(target.statuses?.intoxication?.remainingActions, 5);

  // Actor was not intoxicated
  assert.ok(!actor.statuses?.conditions?.includes("intoxicated"));
});

