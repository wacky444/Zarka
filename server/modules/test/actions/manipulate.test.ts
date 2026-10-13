/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  ItemLibrary,
  LocalizationType,
  MANIPULATE_RECIPES,
  SEPARATE_RECIPES,
  type ItemId,
  type ManipulateOperationSelection,
  type MatchRecord,
  type RecipeComponent,
  type ReplayEvent
} from "@shared";
import { executeAction } from "../../src/match/actionExecutor";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = { debug: () => undefined } as unknown as nkruntime.Logger;

function createMatch(
  inventory: readonly RecipeComponent[],
  operations: readonly ManipulateOperationSelection[],
  extraExecutions = operations.length - 1
): MatchRecord {
  const character = createDefaultCharacter("manipulator");
  character.position = { tileId: "road", coord: { q: 0, r: 0 } };
  character.inventory.carriedItems = inventory.map(({ itemId, quantity }) => ({
    itemId,
    quantity,
    weight: ItemLibrary[itemId].weight * quantity
  }));
  character.stats.load.current = inventory.reduce(
    (weight, item) => weight + ItemLibrary[item.itemId].weight * item.quantity,
    0
  );
  character.actionPlan = {
    secondary: {
      actionId: ActionLibrary.manipulate.id,
      extraExecutions,
      manipulateOperations: operations
    }
  };
  const tile = {
    id: "road",
    coord: { q: 0, r: 0 },
    localizationType: LocalizationType.Road,
    walkable: true,
    itemIds: []
  };
  return {
    match_id: "manipulate-test",
    players: [character.id],
    playerCharacters: { [character.id]: character },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 4,
    started: true,
    removed: 0,
    map: { cols: 1, rows: 1, seed: "manipulate-test", tiles: [tile] }
  };
}

function runManipulate(match: MatchRecord): ReplayEvent[] {
  return executeAction(
    match,
    ActionLibrary.manipulate,
    match.current_turn + 1,
    { road: match.map!.tiles[0] },
    logger
  );
}

function getQuantity(match: MatchRecord, itemId: ItemId): number {
  return (match.playerCharacters.manipulator.inventory.carriedItems ?? [])
    .filter((stack) => stack.itemId === itemId)
    .reduce((total, stack) => total + stack.quantity, 0);
}

for (const recipe of MANIPULATE_RECIPES) {
  test(`Combine ${recipe.id} consumes exact inputs and creates output`, () => {
    const match = createMatch(recipe.inputs, [
      { mode: "combine", recipeId: recipe.id }
    ]);
    const events = runManipulate(match);
    for (const component of recipe.inputs) {
      assert.equal(getQuantity(match, component.itemId), 0);
    }
    for (const component of recipe.outputs) {
      assert.equal(getQuantity(match, component.itemId), component.quantity);
    }
    assert.equal(match.playerCharacters.manipulator.stats.energy.current, 9);
    assert.equal(
      events.some(
        (event) =>
          event.kind === "player" && event.action.actionId === "manipulate"
      ),
      true
    );
  });

  test(`Separate ${recipe.id} consumes output and returns exact components`, () => {
    const separate = SEPARATE_RECIPES.find(({ id }) => id === recipe.id)!;
    const match = createMatch(separate.inputs, [
      { mode: "separate", recipeId: recipe.id }
    ]);
    runManipulate(match);
    for (const component of separate.inputs) {
      assert.equal(getQuantity(match, component.itemId), 0);
    }
    for (const component of separate.outputs) {
      assert.equal(getQuantity(match, component.itemId), component.quantity);
    }
  });
}

test("Manipulate operations chain in order and preserve created items", () => {
  const match = createMatch(
    [
      { itemId: "wood", quantity: 4 },
      { itemId: "nails", quantity: 2 }
    ],
    [
      { mode: "combine", recipeId: "bat" },
      { mode: "combine", recipeId: "nail_bat" }
    ]
  );

  const events = runManipulate(match);

  assert.equal(getQuantity(match, "wood"), 0);
  assert.equal(getQuantity(match, "nails"), 0);
  assert.equal(getQuantity(match, "bat"), 0);
  assert.equal(getQuantity(match, "nail_bat"), 1);
  assert.equal(match.playerCharacters.manipulator.stats.energy.current, 8);
  assert.deepEqual(
    events
      .filter(
        (event) =>
          event.kind === "player" && event.action.actionId === "manipulate"
      )
      .map((event) =>
        event.kind === "player" ? event.action.metadata?.recipeId : null
      ),
    ["bat", "nail_bat"]
  );
});

test("Four operations consume four extra executions at configured cost", () => {
  const operations: ManipulateOperationSelection[] = Array.from(
    { length: 4 },
    () => ({ mode: "combine", recipeId: "arrow" })
  );
  const match = createMatch(
    [
      { itemId: "wood", quantity: 4 },
      { itemId: "spike", quantity: 4 }
    ],
    operations
  );

  runManipulate(match);

  assert.equal(getQuantity(match, "wood"), 0);
  assert.equal(getQuantity(match, "spike"), 0);
  assert.equal(getQuantity(match, "arrow"), 4);
  assert.equal(match.playerCharacters.manipulator.stats.energy.current, 6);
});

test("Failed operation leaves its inventory unchanged and stops later operations", () => {
  const match = createMatch(
    [{ itemId: "wood", quantity: 4 }],
    [
      { mode: "combine", recipeId: "bat" },
      { mode: "combine", recipeId: "knife" },
      { mode: "combine", recipeId: "axe" }
    ]
  );
  const beforeFailingOperation = structuredClone(
    match.playerCharacters.manipulator.inventory
  );

  const events = runManipulate(match);

  assert.equal(getQuantity(match, "bat"), 1);
  assert.equal(getQuantity(match, "wood"), 0);
  assert.equal(getQuantity(match, "knife"), 0);
  assert.equal(getQuantity(match, "axe"), 0);
  assert.notDeepEqual(
    match.playerCharacters.manipulator.inventory,
    beforeFailingOperation
  );
  const failed = events.find(
    (event) =>
      event.kind === "player" && event.action.actionId === "failedAction"
  );
  assert.ok(failed && failed.kind === "player");
  assert.equal(failed.action.metadata?.attemptedActionId, "manipulate");
  assert.equal(failed.action.metadata?.reason, "missing_items");
  assert.equal(failed.action.metadata?.operationIndex, 1);
});

test("Malformed later operation preserves earlier success and fails atomically", () => {
  const operations = [
    { mode: "combine", recipeId: "bat" },
    { mode: "combine", recipeId: "knife", outputs: [{ itemId: "axe", quantity: 1 }] }
  ] as unknown as ManipulateOperationSelection[];
  const match = createMatch([{ itemId: "wood", quantity: 4 }], operations);

  const events = runManipulate(match);

  assert.equal(getQuantity(match, "bat"), 1);
  assert.equal(getQuantity(match, "wood"), 0);
  assert.equal(getQuantity(match, "knife"), 0);
  assert.ok(
    events.some(
      (event) =>
        event.kind === "player" &&
        event.action.actionId === "failedAction" &&
        event.action.metadata?.reason === "invalid_selection" &&
        event.action.metadata?.operationIndex === 1
    )
  );
});
