/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  MANIPULATE_RECIPES,
  ItemLibrary,
  type ItemId,
  type MatchRecord,
  type ReplayEvent
} from "@shared";
import type { MatchRecord as ServerMatchRecord } from "../../src/models/types";
import { executeAction } from "../../src/match/actionExecutor";
import { updateSecondaryActionRpc } from "../../src/rpc/updateSecondaryAction";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = { debug: () => undefined } as unknown as nkruntime.Logger;

function createMatch(
  localizationType: LocalizationType,
  productId: string = "bat"
): MatchRecord {
  const character = createDefaultCharacter("crafter");
  character.position = { tileId: "tile", coord: { q: 0, r: 0 } };
  character.inventory.carriedItems = [
    { itemId: "wood", quantity: 4, weight: 4 }
  ];
  character.stats.load.current = 4;
  character.actionPlan = {
    secondary: {
      actionId: "fabricate",
      craftedItemId: productId as ItemId
    }
  };
  const tile = {
    id: "tile",
    coord: { q: 0, r: 0 },
    localizationType,
    walkable: true,
    itemIds: []
  };
  return {
    match_id: "crafting-test",
    players: [character.id],
    playerCharacters: { [character.id]: character },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 4,
    started: true,
    removed: 0,
    map: { cols: 1, rows: 1, seed: "crafting-test", tiles: [tile] }
  };
}

function executeFabricate(match: MatchRecord): ReplayEvent[] {
  return executeAction(
    match,
    ActionLibrary.fabricate,
    match.current_turn + 1,
    { tile: match.map!.tiles[0] },
    logger
  );
}

test("Crafting at Workshop grants item, preserves ingredients, and awards XP", () => {
  const match = createMatch(LocalizationType.Workshop);
  const character = match.playerCharacters.crafter;

  const events = executeFabricate(match);

  assert.deepEqual(character.inventory.carriedItems, [
    { itemId: "wood", quantity: 4, weight: 4 },
    { itemId: "bat", quantity: 1, weight: ItemLibrary.bat.weight }
  ]);
  assert.equal(character.stats.load.current, 8);
  assert.equal(character.progression.experience, 2);
  assert.equal(character.stats.energy.current, 7);
  assert.equal(character.actionPlan?.secondary, undefined);
  assert.equal(
    character.statuses.cooldowns?.some(
      (cooldown) => cooldown.actionId === "fabricate"
    ),
    true
  );
  const event = events.find(
    (candidate) =>
      candidate.kind === "player" &&
      candidate.action.actionId === "fabricate"
  );
  assert.ok(event && event.kind === "player");
  assert.equal(event.action.metadata?.craftedItemId, "bat");
  assert.equal(event.action.metadata?.outcome, "success");
});

test("Crafting with Dexterity 4 works outside Workshop", () => {
  const match = createMatch(LocalizationType.Road);
  const character = match.playerCharacters.crafter;
  character.abilities.push("dexterity4");

  const events = executeFabricate(match);

  assert.equal(character.inventory.carriedItems.at(-1)?.itemId, "bat");
  assert.equal(character.progression.experience, 2);
  assert.ok(
    events.some(
      (event) =>
        event.kind === "player" && event.action.actionId === "fabricate"
    )
  );
});

test("Crafting outside Workshop without Dexterity 4 fails without inventory changes", () => {
  const match = createMatch(LocalizationType.Road);
  const character = match.playerCharacters.crafter;
  const before = structuredClone(character.inventory);

  const events = executeFabricate(match);

  assert.deepEqual(character.inventory, before);
  assert.equal(character.progression.experience, 0);
  const event = events.find(
    (candidate) =>
      candidate.kind === "player" &&
      candidate.action.actionId === "failedAction"
  );
  assert.ok(event && event.kind === "player");
  assert.equal(event.action.metadata?.attemptedActionId, "fabricate");
  assert.equal(event.action.metadata?.reason, "location_skill_requirement");
});

test("Crafting rejects invalid products and products over load capacity atomically", () => {
  const invalid = createMatch(LocalizationType.Workshop, "nail_bat");
  const invalidCharacter = invalid.playerCharacters.crafter;
  const beforeInvalid = structuredClone(invalidCharacter.inventory);
  const invalidEvents = executeFabricate(invalid);
  assert.deepEqual(invalidCharacter.inventory, beforeInvalid);
  assert.equal(invalidCharacter.progression.experience, 0);
  assert.ok(
    invalidEvents.some(
      (event) =>
        event.kind === "player" &&
        event.action.actionId === "failedAction" &&
        event.action.metadata?.reason === "invalid_selection"
    )
  );

  const full = createMatch(LocalizationType.Workshop);
  const fullCharacter = full.playerCharacters.crafter;
  fullCharacter.stats.load.current = fullCharacter.stats.load.max;
  const beforeFull = structuredClone(fullCharacter.inventory);
  const fullEvents = executeFabricate(full);
  assert.deepEqual(fullCharacter.inventory, beforeFull);
  assert.equal(fullCharacter.progression.experience, 0);
  assert.ok(
    fullEvents.some(
      (event) =>
        event.kind === "player" &&
        event.action.actionId === "failedAction" &&
        event.action.metadata?.reason === "inventory_capacity"
    )
  );
});

function createRpcHarness(): {
  match: ServerMatchRecord;
  nk: nkruntime.Nakama;
} {
  const match = createMatch(LocalizationType.Workshop) as ServerMatchRecord;
  const nk = {
    storageRead: () => [{ value: match, version: "1", permissionRead: 0 }],
    storageWrite: (requests: Array<{ value: unknown }>) => {
      const write = requests[0];
      if (write) {
        Object.assign(match, write.value as ServerMatchRecord);
      }
    },
    storageList: () => ({ objects: [] }),
    storageDelete: () => undefined,
    matchCreate: () => "match",
    matchList: () => ({ matches: [] }),
    matchSignal: () => ""
  } as unknown as nkruntime.Nakama;
  return { match, nk };
}

function submitSecondary(
  nk: nkruntime.Nakama,
  submission: Record<string, unknown>,
  slot: "secondary" | "extra_secondary" = "secondary"
): void {
  updateSecondaryActionRpc(
    { userId: "crafter" } as nkruntime.Context,
    logger,
    nk,
    JSON.stringify({ match_id: "crafting-test", slot, submission })
  );
}

test("Secondary RPC stores typed crafting and manipulation selections, clears stale data", () => {
  const { match, nk } = createRpcHarness();
  submitSecondary(nk, {
    actionId: "fabricate",
    craftedItemId: "bat"
  });
  assert.equal(
    match.playerCharacters.crafter.actionPlan?.secondary?.craftedItemId,
    "bat"
  );
  submitSecondary(nk, {
    actionId: "manipulate",
    manipulateOperations: [
      { mode: "combine", recipeId: "bat" },
      { mode: "separate", recipeId: "bat" }
    ],
    extraExecutions: 1
  });
  assert.equal(
    match.playerCharacters.crafter.actionPlan?.secondary?.craftedItemId,
    undefined
  );
  assert.deepEqual(
    match.playerCharacters.crafter.actionPlan?.secondary?.manipulateOperations,
    [
      { mode: "combine", recipeId: "bat" },
      { mode: "separate", recipeId: "bat" }
    ]
  );
});

test("Secondary RPC rejects malformed crafting/manipulation data", () => {
  const invalidValues: Array<Record<string, unknown>> = [
    { actionId: "fabricate", craftedItemId: "nail_bat" },
    {
      actionId: "manipulate",
      manipulateOperations: Array.from({ length: 5 }, () => ({
        mode: "combine",
        recipeId: "bat"
      }))
    },
    {
      actionId: "manipulate",
      manipulateOperations: [{ mode: "combine", recipeId: "unknown" }]
    },
    {
      actionId: "manipulate",
      manipulateOperations: [
        {
          mode: "combine",
          recipeId: "bat",
          inputs: [{ itemId: "wood", quantity: 4 }]
        }
      ]
    },
    {
      actionId: "manipulate",
      manipulateOperations: [{ mode: "combine", recipeId: "bat" }],
      extraExecutions: 1
    }
  ];
  for (const submission of invalidValues) {
    const { nk } = createRpcHarness();
    assert.throws(() => submitSecondary(nk, submission));
  }
  assert.equal(MANIPULATE_RECIPES.length, 7);
});
