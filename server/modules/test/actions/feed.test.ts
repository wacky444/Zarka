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

