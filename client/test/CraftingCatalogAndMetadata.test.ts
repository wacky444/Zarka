import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionCategory,
  ActionLibrary,
  CRAFTABLE_ITEMS,
  ItemLibrary,
  LocalizationType,
  MANIPULATE_RECIPES,
  SEPARATE_RECIPES,
  type MatchRecord,
  type PlayerCharacter
} from "@shared";
import {
  buildCraftingProductItems,
  parseCraftingProductSelection
} from "../src/ui/craftingSelectorItems.ts";
import {
  applyProjectedManipulateOperation,
  buildManipulateOperationItems,
  getProjectedManipulateWeightGain,
  type InventoryProjection
} from "../src/ui/manipulateSelectorItems.ts";
import { getMissingRequirement } from "../src/ui/ActionRequirementWarnings.ts";
import { ActionPlanSynchronizer } from "../src/scenes/ActionPlanSynchronizer.ts";
import type { TurnService } from "../src/services/turnService.ts";
import { buildCraftingAnimationPlan } from "../src/animation/replayActions/CraftingAnimationData.ts";
import {
  formatCraftingFailureLine,
  formatCraftingReplayLine,
  formatManipulateFailureLine,
  formatManipulateReplayLine
} from "../src/ui/craftingReplayFormatting.ts";
import {
  buildSecondaryActionItems,
  describeAction
} from "../src/ui/panel/CharacterPanelActionOptions.ts";
import { getLocale, setLocale, t } from "../src/services/i18n.ts";

test("crafting and manipulation catalogs match planned products and recipes", () => {
  assert.deepEqual(CRAFTABLE_ITEMS, [
    "pistol",
    "bullet",
    "molotov",
    "bat",
    "axe",
    "knife",
    "harpoon",
    "arrow",
    "trap",
    "c4"
  ]);
  for (const itemId of CRAFTABLE_ITEMS) {
    assert.ok(ItemLibrary[itemId]);
  }

  assert.deepEqual(
    MANIPULATE_RECIPES.map(({ id, inputs, outputs }) => [
      id,
      inputs.map(({ itemId, quantity }) => [itemId, quantity]),
      outputs.map(({ itemId, quantity }) => [itemId, quantity])
    ]),
    [
      ["knife", [["wood", 1], ["spike", 2]], [["knife", 1]]],
      ["bat", [["wood", 4]], [["bat", 1]]],
      ["nail_bat", [["bat", 1], ["nails", 2]], [["nail_bat", 1]]],
      ["axe", [["wood", 3], ["spike", 2]], [["axe", 1]]],
      ["molotov", [["bottle", 1], ["fuel", 1]], [["molotov", 1]]],
      ["arrow", [["wood", 1], ["spike", 1]], [["arrow", 1]]],
      [
        "suppressed_pistol",
        [["pistol", 1], ["silencer", 1]],
        [["suppressed_pistol", 1]]
      ]
    ]
  );

  for (const recipe of [...MANIPULATE_RECIPES, ...SEPARATE_RECIPES]) {
    for (const component of [...recipe.inputs, ...recipe.outputs]) {
      assert.ok(ItemLibrary[component.itemId]);
      assert.ok(Number.isInteger(component.quantity) && component.quantity > 0);
    }
  }

  assert.deepEqual(
    SEPARATE_RECIPES,
    MANIPULATE_RECIPES.map(({ id, inputs, outputs }) => ({
      id,
      inputs: outputs,
      outputs: inputs
    }))
  );
});

test("fabricate and manipulate action metadata and labels match the plan", () => {
  const fabricate = ActionLibrary.fabricate;
  assert.equal(fabricate.developed, true);
  assert.equal(fabricate.category, ActionCategory.Secondary);
  assert.equal(fabricate.energyCost, 3);
  assert.equal(fabricate.cooldown, 3);
  assert.equal(fabricate.experience?.base, 2);
  assert.equal(fabricate.actionOrder, 14);
  assert.equal(fabricate.actionSubOrder, 0);
  assert.equal(fabricate.extraExecution, undefined);
  assert.equal(fabricate.requiredItems, undefined);
  assert.ok(
    fabricate.requirements?.every((requirement) => !requirement.consumesResource)
  );

  const manipulate = ActionLibrary.manipulate;
  assert.equal(manipulate.developed, true);
  assert.equal(manipulate.category, ActionCategory.Secondary);
  assert.equal(manipulate.energyCost, 1);
  assert.equal(manipulate.cooldown, 3);
  assert.equal(manipulate.actionOrder, 6);
  assert.equal(manipulate.actionSubOrder, 3);
  assert.deepEqual(manipulate.extraExecution, {
    cost: 1,
    maxRepetitions: 3,
    description: "Permite realizar manipulaciones adicionales."
  });
  assert.equal(manipulate.requiredItems, undefined);

  const previousLocale = getLocale();
  try {
    const context = {
      character: null,
      match: null,
      currentTurn: 0,
      allowedMainActionIds: null,
      allowedSecondaryActionIds: null
    };
    setLocale("en");
    const englishActions = buildSecondaryActionItems([], context);
    const englishCrafting = englishActions.find(
      ({ id }) => id === "fabricate"
    );
    const englishManipulation = englishActions.find(
      ({ id }) => id === "manipulate"
    );
    assert.equal(englishCrafting?.name, "Crafting");
    assert.equal(englishManipulation?.name, "Combine/Separate");
    assert.equal(englishCrafting?.disabled, false);
    assert.equal(englishManipulation?.disabled, false);
    assert.match(
      t(describeAction(fabricate)),
      /without consuming inventory items/
    );
    assert.match(
      t(describeAction(manipulate)),
      /Combines or separates inventory items/
    );

    setLocale("es");
    const spanishActions = buildSecondaryActionItems([], context);
    assert.equal(
      spanishActions.find(({ id }) => id === "fabricate")?.name,
      "Fabricar"
    );
    assert.equal(
      spanishActions.find(({ id }) => id === "manipulate")?.name,
      "Combinar/Separar"
    );
  } finally {
    setLocale(previousLocale);
  }
});

test("Crafting selector returns only valid product selections", () => {
  assert.equal(parseCraftingProductSelection("bat"), "bat");
  assert.equal(parseCraftingProductSelection("nail_bat"), null);
  assert.equal(parseCraftingProductSelection(null), null);
});

test("Crafting selector renders all products without ingredient warnings", () => {
  const textureResolver = () => ({ texture: "item" });
  const items = buildCraftingProductItems(null, textureResolver);
  assert.deepEqual(
    items.map(({ id }) => id),
    CRAFTABLE_ITEMS
  );
  assert.ok(items.every((item) => item.missingRequirement === null));
  assert.ok(items.every((item) => item.disabled !== true));

  const warnedItems = buildCraftingProductItems(
    "Not in workshop",
    textureResolver
  );
  assert.ok(warnedItems.every((item) => item.missingRequirement === "Not in workshop"));
  assert.ok(warnedItems.every((item) => item.disabled !== true));
});

test("Crafting requirement warning accepts Workshop or Dexterity 4", () => {
  const map = {
    tiles: [
      {
        id: "workshop",
        coord: { q: 0, r: 0 },
        localizationType: LocalizationType.Workshop
      },
      {
        id: "road",
        coord: { q: 1, r: 0 },
        localizationType: LocalizationType.Road
      }
    ]
  } as Parameters<typeof getMissingRequirement>[2];
  const character = {
    abilities: [],
    position: { tileId: "road", coord: { q: 1, r: 0 } }
  } as PlayerCharacter;

  assert.equal(
    getMissingRequirement(ActionLibrary.fabricate, character, map),
    t("Not in workshop")
  );
  character.position = { tileId: "workshop", coord: { q: 0, r: 0 } };
  assert.equal(getMissingRequirement(ActionLibrary.fabricate, character, map), null);
  character.position = { tileId: "road", coord: { q: 1, r: 0 } };
  character.abilities.push("dexterity4");
  assert.equal(getMissingRequirement(ActionLibrary.fabricate, character, map), null);
});

test("Manipulate selector keeps both catalogs visible and warns from projected inventory", () => {
  const previousLocale = getLocale();
  try {
    setLocale("es");
    const options = buildManipulateOperationItems(
      { wood: 3, spike: 2, bat: 1 },
      () => ({ texture: "item" })
    );
    assert.equal(options.length, 14);
    assert.equal(options.filter(({ id }) => id.startsWith("combine:")).length, 7);
    assert.equal(options.filter(({ id }) => id.startsWith("separate:")).length, 7);
    const combineBat = options.find(({ id }) => id === "combine:bat");
    const separateNailBat = options.find(({ id }) => id === "separate:nail_bat");
    assert.equal(combineBat?.missingRequirement, "Falta: Madera ×4");
    assert.equal(separateNailBat?.missingRequirement, "Falta: Bate con clavos ×1");
    assert.equal(combineBat?.disabled, undefined);
    assert.match(combineBat?.description ?? "", /Requiere: Madera ×4/);
    assert.match(separateNailBat?.description ?? "", /Produce: Bate ×1, Clavos ×2/);
  } finally {
    setLocale(previousLocale);
  }
});

test("Crafting animations use only successful catalog-backed results", () => {
  assert.deepEqual(
    buildCraftingAnimationPlan("fabricate", {
      craftedItemId: "bat",
      outcome: "success",
      ingredients: [{ itemId: "wood", quantity: 4 }]
    }),
    {
      kind: "fabricate",
      inputs: [],
      outputs: [{ itemId: "bat", quantity: 1 }]
    }
  );
  assert.deepEqual(
    buildCraftingAnimationPlan("manipulate", {
      mode: "combine",
      recipeId: "bat",
      outcome: "success",
      resultingItems: [{ itemId: "bat", quantity: 1 }]
    }),
    {
      kind: "combine",
      inputs: [{ itemId: "wood", quantity: 4 }],
      outputs: [{ itemId: "bat", quantity: 1 }]
    }
  );
  assert.deepEqual(
    buildCraftingAnimationPlan("manipulate", {
      mode: "separate",
      recipeId: "bat",
      outcome: "success",
      resultingItems: [{ itemId: "wood", quantity: 4 }]
    }),
    {
      kind: "separate",
      inputs: [{ itemId: "bat", quantity: 1 }],
      outputs: [{ itemId: "wood", quantity: 4 }]
    }
  );
  assert.equal(
    buildCraftingAnimationPlan("fabricate", {
      craftedItemId: "bat",
      outcome: "failure"
    }),
    null
  );
  assert.equal(
    buildCraftingAnimationPlan("manipulate", {
      mode: "combine",
      recipeId: "bat",
      outcome: "success",
      resultingItems: [{ itemId: "wood", quantity: 1 }]
    }),
    null
  );
});

test("Crafting replay formatter localizes products and actual operation results", () => {
  const previousLocale = getLocale();
  try {
    setLocale("en");
    assert.equal(
      formatCraftingReplayLine("Alex", { craftedItemId: "bat" }),
      "Alex crafted Bat"
    );
    assert.equal(
      formatManipulateReplayLine("Alex", {
        mode: "combine",
        recipeId: "bat",
        resultingItems: [{ itemId: "bat", quantity: 1 }]
      }),
      "Alex combined Bat ×1"
    );
    assert.equal(
      formatManipulateReplayLine("Alex", {
        mode: "separate",
        recipeId: "bat",
        resultingItems: [
          { itemId: "wood", quantity: 4 },
          { itemId: "nails", quantity: 2 }
        ]
      }),
      "Alex separated Bat; returned: Wood ×4, Nails ×2"
    );
    assert.equal(
      formatCraftingFailureLine("Alex", {
        attemptedActionId: "fabricate",
        craftedItemId: "bat",
        reason: "inventory_capacity"
      }),
      "Alex failed to use Crafting (inventory is full: Bat)"
    );
    assert.equal(
      formatManipulateFailureLine("Alex", {
        attemptedActionId: "manipulate",
        mode: "combine",
        recipeId: "bat",
        reason: "missing_items"
      }),
      "Alex failed to use Combine Bat (missing required items)"
    );
    setLocale("es");
    assert.equal(
      formatCraftingReplayLine("Alex", { craftedItemId: "bat" }),
      "Alex fabricó Bate"
    );
    assert.equal(
      formatManipulateReplayLine("Alex", {
        mode: "combine",
        recipeId: "bat",
        resultingItems: [{ itemId: "bat", quantity: 1 }]
      }),
      "Alex combinó Bate ×1"
    );
    assert.match(
      formatCraftingFailureLine("Alex", {
        attemptedActionId: "fabricate",
        craftedItemId: "bat",
        reason: "location_skill_requirement"
      }) ?? "",
      /no pudo usar Fabricar.*Destreza 4/
    );
    assert.match(
      formatManipulateFailureLine("Alex", {
        attemptedActionId: "manipulate",
        mode: "separate",
        recipeId: "bat",
        reason: "missing_items"
      }) ?? "",
      /no pudo usar Separar Bate.*faltan objetos necesarios/
    );
  } finally {
    setLocale(previousLocale);
  }
});

test("Action plan synchronizer sends custom selections for both secondary slots", async () => {
  const calls: Array<{
    submission: Record<string, unknown> | null;
    slot?: string;
  }> = [];
  const character = { actionPlan: {} } as PlayerCharacter;
  const match = {
    match_id: "crafting-sync-test",
    playerCharacters: { crafter: character }
  } as MatchRecord;
  const turnService = {
    updateSecondaryAction: async (
      _matchId: string,
      submission: Record<string, unknown> | null,
      slot?: string
    ) => {
      calls.push({ submission, slot });
      return {};
    }
  } as unknown as TurnService;
  const synchronizer = new ActionPlanSynchronizer({
    getTurnService: () => turnService,
    getCurrentUserId: () => "crafter",
    getCurrentMatchId: () => match.match_id,
    getCurrentMatch: () => match,
    isReplayViewActive: () => false,
    cancelMainActionLocationPick: () => undefined,
    parseRpcPayload: <T>(response: object) => {
      const submission = calls.at(-1)?.submission;
      return {
        actionId: submission?.actionId,
        craftedItemId: submission?.craftedItemId,
        manipulateOperations: submission?.manipulateOperations,
        extraExecutions: submission?.extraExecutions
      } as T;
    },
    updateCharacterPanel: () => undefined
  });

  synchronizer.scheduleSecondaryActionSelection({
    actionId: "fabricate",
    targetLocation: null,
    craftedItemId: "bat"
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(calls[0]?.submission?.craftedItemId, "bat");
  assert.equal(character.actionPlan?.secondary?.craftedItemId, "bat");

  synchronizer.scheduleExtraSecondaryActionSelection({
    actionId: "manipulate",
    targetLocation: null,
    extraExecutions: 1,
    manipulateOperations: [
      { mode: "combine", recipeId: "bat" },
      { mode: "separate", recipeId: "bat" }
    ]
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(calls[1]?.slot, "extra_secondary");
  assert.deepEqual(calls[1]?.submission?.manipulateOperations, [
    { mode: "combine", recipeId: "bat" },
    { mode: "separate", recipeId: "bat" }
  ]);
  assert.deepEqual(
    character.actionPlan?.extraSecondary?.manipulateOperations,
    calls[1]?.submission?.manipulateOperations
  );
  synchronizer.destroy();
});

test("Manipulate weight preview follows recipe inputs and returned components", () => {
  for (const recipe of MANIPULATE_RECIPES) {
    const separate = SEPARATE_RECIPES.find(({ id }) => id === recipe.id);
    assert.ok(separate);
    for (const [mode, parts] of [
      ["combine", recipe],
      ["separate", separate]
    ] as const) {
      const inventory = Object.fromEntries(
        parts.inputs.map(({ itemId, quantity }) => [itemId, quantity])
      ) as InventoryProjection;
      const expectedGain = Math.max(
        0,
        parts.outputs.reduce(
          (weight, { itemId, quantity }) =>
            weight + ItemLibrary[itemId].weight * quantity,
          0
        ) -
          parts.inputs.reduce(
            (weight, { itemId, quantity }) =>
              weight + ItemLibrary[itemId].weight * quantity,
            0
          )
      );
      assert.equal(
        getProjectedManipulateWeightGain(inventory, [
          { mode, recipeId: recipe.id }
        ]),
        expectedGain
      );
    }
  }
  assert.equal(
    getProjectedManipulateWeightGain(
      { wood: 4 },
      [
        { mode: "combine", recipeId: "bat" },
        { mode: "separate", recipeId: "bat" }
      ]
    ),
    0
  );
  assert.equal(
    getProjectedManipulateWeightGain(
      { wood: 3 },
      [{ mode: "combine", recipeId: "bat" }]
    ),
    0
  );
});

test("Manipulate projections consume earlier outputs and leave failed operation state unchanged", () => {
  const initial: InventoryProjection = { wood: 4, nails: 2 };
  const afterBat = applyProjectedManipulateOperation(initial, {
    mode: "combine",
    recipeId: "bat"
  });
  assert.deepEqual(afterBat, { wood: 0, nails: 2, bat: 1 });
  const afterNailBat = applyProjectedManipulateOperation(afterBat ?? {}, {
    mode: "combine",
    recipeId: "nail_bat"
  });
  assert.deepEqual(afterNailBat, { wood: 0, nails: 0, bat: 0, nail_bat: 1 });
  assert.equal(
    applyProjectedManipulateOperation({ wood: 3 }, {
      mode: "combine",
      recipeId: "knife"
    }),
    null
  );
  assert.deepEqual(initial, { wood: 4, nails: 2 });
});
