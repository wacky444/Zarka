/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  PICKUP_NONE_PRIORITY_ID,
} from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executePickUpAction } from "../../src/match/actions/pickup";
import type { PlannedActionParticipant } from "../../src/match/actions/utils";
import { updateMainActionRpc } from "../../src/rpc/updateMainAction";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = {
  debug: () => undefined,
} as unknown as nkruntime.Logger;

const ITEM_IDS = ["bottle-item", "food-item", "drink-item"];

function createPickupFixture(targetItemIds: string[]): {
  character: ReturnType<typeof createDefaultCharacter>;
  match: MatchRecord;
  participant: PlannedActionParticipant;
} {
  const character = createDefaultCharacter("picker");
  character.position = { tileId: "tile", coord: { q: 0, r: 0 } };
  character.discoveredItemIds = [...ITEM_IDS];
  const plan = {
    actionId: ActionLibrary.pick_up.id,
    targetItemIds,
  };
  character.actionPlan = { main: plan };
  const match: MatchRecord = {
    match_id: "pickup-priority-test",
    players: [character.id],
    playerCharacters: { [character.id]: character },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0,
    map: {
      cols: 1,
      rows: 1,
      seed: "pickup-priority-test",
      tiles: [
        {
          id: "tile",
          coord: { q: 0, r: 0 },
          localizationType: LocalizationType.Road,
          walkable: true,
          itemIds: [...ITEM_IDS],
        },
      ],
    },
    items: [
      { item_id: ITEM_IDS[0], item_type: "bottle" },
      { item_id: ITEM_IDS[1], item_type: "food" },
      { item_id: ITEM_IDS[2], item_type: "drink" },
    ],
  };
  return {
    character,
    match,
    participant: {
      playerId: character.id,
      character,
      plan,
      planKey: "main",
    },
  };
}

test("None slots stop pickup after one prioritized item", () => {
  const { character, match, participant } = createPickupFixture([
    ITEM_IDS[0],
    PICKUP_NONE_PRIORITY_ID,
    PICKUP_NONE_PRIORITY_ID,
  ]);

  const events = executePickUpAction([participant], match);
  const event = events.find((entry) => entry.kind === "player");
  const metadata = event?.kind === "player" ? event.action.metadata : undefined;

  assert.equal(metadata?.pickedCount, 1);
  assert.equal(metadata?.pickLimit, 1);
  assert.deepEqual(metadata?.pickedItemIds, [ITEM_IDS[0]]);
  assert.equal(
    character.inventory.carriedItems.some((stack) => stack.itemId === "bottle"),
    true,
  );
  assert.deepEqual(match.map?.tiles[0].itemIds, ITEM_IDS.slice(1));
});

test("two None slots pick one fallback item when no item is prioritized", () => {
  const { match, participant } = createPickupFixture([
    PICKUP_NONE_PRIORITY_ID,
    PICKUP_NONE_PRIORITY_ID,
  ]);

  const events = executePickUpAction([participant], match);
  const event = events.find((entry) => entry.kind === "player");
  const metadata = event?.kind === "player" ? event.action.metadata : undefined;

  assert.equal(metadata?.pickedCount, 1);
  assert.equal(metadata?.pickLimit, 1);
  assert.equal(match.map?.tiles[0].itemIds.length, 2);
});

test("a priority without None keeps filling the normal pickup limit", () => {
  const { match, participant } = createPickupFixture([ITEM_IDS[0]]);

  const events = executePickUpAction([participant], match);
  const event = events.find((entry) => entry.kind === "player");

  assert.equal(event?.kind === "player" ? event.action.metadata?.pickedCount : 0, 3);
  assert.equal(match.map?.tiles[0].itemIds.length, 0);
});

test("main-action RPC preserves repeated pickup None entries", () => {
  const { match } = createPickupFixture([
    PICKUP_NONE_PRIORITY_ID,
    PICKUP_NONE_PRIORITY_ID,
  ]);
  let storedMatch = match;
  const nakama = {
    storageRead: () => [{ value: storedMatch, version: "1" }],
    storageWrite: (requests: Array<{ value: unknown }>) => {
      const write = requests[0];
      if (write) {
        storedMatch = write.value as MatchRecord;
      }
    },
    storageList: () => ({ objects: [] }),
    storageDelete: () => undefined,
    matchCreate: () => "",
    matchList: () => ({ matches: [] }),
    matchSignal: () => "",
  } as unknown as nkruntime.Nakama;

  updateMainActionRpc(
    { userId: "picker" } as nkruntime.Context,
    logger,
    nakama,
    JSON.stringify({
      match_id: match.match_id,
      submission: {
        actionId: ActionLibrary.pick_up.id,
        targetItemIds: [PICKUP_NONE_PRIORITY_ID, PICKUP_NONE_PRIORITY_ID],
      },
    }),
  );

  assert.deepEqual(
    storedMatch.playerCharacters.picker.actionPlan?.main?.targetItemIds,
    [PICKUP_NONE_PRIORITY_ID, PICKUP_NONE_PRIORITY_ID],
  );
});
