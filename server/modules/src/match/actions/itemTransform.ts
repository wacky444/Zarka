import { addCarriedItem, ItemLibrary, removeCarriedItem } from "@shared";
import type { ItemId, PlayerCharacter, RecipeComponent } from "@shared";

export type InventoryTransformFailure = "missing_items" | "inventory_capacity";

function countInventoryItem(character: PlayerCharacter, itemId: ItemId): number {
  return (character.inventory?.carriedItems ?? []).reduce(
    (count, stack) =>
      stack?.itemId === itemId && Number.isFinite(stack.quantity)
        ? count + Math.max(0, Math.floor(stack.quantity))
        : count,
    0
  );
}

function getComponentWeight(components: readonly RecipeComponent[]): number {
  return components.reduce(
    (weight, component) =>
      weight + ItemLibrary[component.itemId].weight * component.quantity,
    0
  );
}

export function applyInventoryTransform(
  character: PlayerCharacter,
  inputs: readonly RecipeComponent[],
  outputs: readonly RecipeComponent[]
): InventoryTransformFailure | null {
  for (const input of inputs) {
    if (countInventoryItem(character, input.itemId) < input.quantity) {
      return "missing_items";
    }
  }

  const load = character.stats?.load;
  if (
    !load ||
    !Number.isFinite(load.current) ||
    !Number.isFinite(load.max)
  ) {
    return "inventory_capacity";
  }
  const nextLoad =
    load.current - getComponentWeight(inputs) + getComponentWeight(outputs);
  if (nextLoad > load.max) {
    return "inventory_capacity";
  }

  for (const input of inputs) {
    removeCarriedItem(character, input.itemId, input.quantity);
  }
  for (const output of outputs) {
    addCarriedItem(character, output.itemId, output.quantity);
  }
  return null;
}
