import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionCategory,
  ActionLibrary,
  CRAFTABLE_ITEMS,
  ItemLibrary,
  MANIPULATE_RECIPES,
  SEPARATE_RECIPES
} from "@shared";
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
