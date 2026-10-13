import {
  ItemLibrary,
  MANIPULATE_RECIPES,
  SEPARATE_RECIPES,
  isManipulateRecipeId,
  type ItemId,
  type ManipulateOperationSelection,
  type RecipeComponent
} from "@shared";
import { t } from "../services/i18n";
import type { GridSelectItem } from "./GridSelect";
import { resolveItemTexture } from "./itemIcons";

export type InventoryProjection = Partial<Record<ItemId, number>>;

interface OperationDisplay {
  selection: ManipulateOperationSelection;
  titleItemId: ItemId;
  inputs: readonly RecipeComponent[];
  outputs: readonly RecipeComponent[];
}

function resolveOperation(
  selection: ManipulateOperationSelection
): OperationDisplay | null {
  if (!isManipulateRecipeId(selection.recipeId)) {
    return null;
  }
  const recipe = MANIPULATE_RECIPES.find(
    (candidate) => candidate.id === selection.recipeId
  );
  if (!recipe) {
    return null;
  }
  if (selection.mode === "combine") {
    return {
      selection,
      titleItemId: recipe.outputs[0].itemId,
      inputs: recipe.inputs,
      outputs: recipe.outputs
    };
  }
  const separate = SEPARATE_RECIPES.find(
    (candidate) => candidate.id === selection.recipeId
  );
  return separate
    ? {
        selection,
        titleItemId: recipe.outputs[0].itemId,
        inputs: separate.inputs,
        outputs: separate.outputs
      }
    : null;
}

function formatComponents(components: readonly RecipeComponent[]): string {
  return components
    .map(
      ({ itemId, quantity }) =>
        `${t(ItemLibrary[itemId].name)} ×${quantity}`
    )
    .join(", ");
}

export function applyProjectedManipulateOperation(
  inventory: InventoryProjection,
  selection: ManipulateOperationSelection
): InventoryProjection | null {
  const operation = resolveOperation(selection);
  if (!operation) {
    return null;
  }
  const next = { ...inventory };
  for (const input of operation.inputs) {
    const available = next[input.itemId] ?? 0;
    if (available < input.quantity) {
      return null;
    }
    next[input.itemId] = available - input.quantity;
  }
  for (const output of operation.outputs) {
    next[output.itemId] = (next[output.itemId] ?? 0) + output.quantity;
  }
  return next;
}

export function getProjectedManipulateWeightGain(
  inventory: InventoryProjection,
  operations: readonly ManipulateOperationSelection[]
): number {
  let projected = { ...inventory };
  let totalGain = 0;
  let maximumGain = 0;
  const getWeight = (items: InventoryProjection): number =>
    Object.entries(items).reduce((weight, [itemId, quantity]) => {
      const definition = ItemLibrary[itemId as ItemId];
      return definition && typeof quantity === "number" && quantity > 0
        ? weight + definition.weight * quantity
        : weight;
    }, 0);

  for (const operation of operations) {
    const next = applyProjectedManipulateOperation(projected, operation);
    if (!next) {
      break;
    }
    totalGain += getWeight(next) - getWeight(projected);
    maximumGain = Math.max(maximumGain, totalGain);
    projected = next;
  }
  return maximumGain;
}

export function buildManipulateOperationItems(
  inventory: InventoryProjection,
  textureResolver: typeof resolveItemTexture = resolveItemTexture
): GridSelectItem[] {
  return [
    ...MANIPULATE_RECIPES.map((recipe) => ({
      selection: { mode: "combine" as const, recipeId: recipe.id },
      titleItemId: recipe.outputs[0].itemId,
      inputs: recipe.inputs,
      outputs: recipe.outputs
    })),
    ...MANIPULATE_RECIPES.map((recipe) => {
      const separate = SEPARATE_RECIPES.find(
        (candidate) => candidate.id === recipe.id
      )!;
      return {
        selection: { mode: "separate" as const, recipeId: recipe.id },
        titleItemId: recipe.outputs[0].itemId,
        inputs: separate.inputs,
        outputs: separate.outputs
      };
    })
  ].map((operation) => {
    const visual = textureResolver(ItemLibrary[operation.titleItemId]);
    const missing = operation.inputs.filter(
      ({ itemId, quantity }) => (inventory[itemId] ?? 0) < quantity
    );
    return {
      id: `${operation.selection.mode}:${operation.selection.recipeId}`,
      name: `${t(operation.selection.mode === "combine" ? "Combine" : "Separate")}: ${t(ItemLibrary[operation.titleItemId].name)}`,
      description: `${t("Requires")}: ${formatComponents(operation.inputs)}\n${t("Produces")}: ${formatComponents(operation.outputs)}`,
      texture: visual.texture,
      frame: visual.frame,
      missingRequirement:
        missing.length > 0
          ? `${t("Missing")}: ${formatComponents(missing)}`
          : null
    };
  });
}
