import {
  ItemLibrary,
  MANIPULATE_RECIPES,
  SEPARATE_RECIPES,
  isCraftableItemId,
  isManipulateRecipeId,
  type ItemId,
  type RecipeComponent
} from "@shared";

export interface CraftingAnimationPlan {
  kind: "fabricate" | "combine" | "separate";
  inputs: RecipeComponent[];
  outputs: RecipeComponent[];
}

function parseComponents(value: unknown): RecipeComponent[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const components: RecipeComponent[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      return null;
    }
    const component = entry as { itemId?: unknown; quantity?: unknown };
    if (
      typeof component.itemId !== "string" ||
      !ItemLibrary[component.itemId as ItemId] ||
      typeof component.quantity !== "number" ||
      !Number.isInteger(component.quantity) ||
      component.quantity < 1
    ) {
      return null;
    }
    components.push({
      itemId: component.itemId as ItemId,
      quantity: component.quantity
    });
  }
  return components;
}

function sameComponents(
  first: readonly RecipeComponent[],
  second: readonly RecipeComponent[]
): boolean {
  return (
    first.length === second.length &&
    first.every(
      (component, index) =>
        component.itemId === second[index]?.itemId &&
        component.quantity === second[index]?.quantity
    )
  );
}

export function buildCraftingAnimationPlan(
  actionId: string,
  metadata: unknown
): CraftingAnimationPlan | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const record = metadata as Record<string, unknown>;
  if (record.outcome !== "success") {
    return null;
  }
  if (actionId === "fabricate") {
    if (!isCraftableItemId(record.craftedItemId)) {
      return null;
    }
    return {
      kind: "fabricate",
      inputs: [],
      outputs: [{ itemId: record.craftedItemId, quantity: 1 }]
    };
  }
  if (
    actionId !== "manipulate" ||
    (record.mode !== "combine" && record.mode !== "separate") ||
    !isManipulateRecipeId(record.recipeId)
  ) {
    return null;
  }
  const recipe = MANIPULATE_RECIPES.find(
    (candidate) => candidate.id === record.recipeId
  );
  const selectedParts =
    record.mode === "combine"
      ? recipe
      : SEPARATE_RECIPES.find((candidate) => candidate.id === record.recipeId);
  const outputs = parseComponents(record.resultingItems);
  if (!recipe || !selectedParts || !outputs || !sameComponents(outputs, selectedParts.outputs)) {
    return null;
  }
  return {
    kind: record.mode,
    inputs: selectedParts.inputs.map((component) => ({ ...component })),
    outputs
  };
}
