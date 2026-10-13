import { ItemLibrary } from "@shared";
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

  const carriedItems = (character.inventory?.carriedItems ?? []).map((stack) => ({
    ...stack
  }));
  for (const input of inputs) {
    let remaining = input.quantity;
    for (let index = 0; index < carriedItems.length && remaining > 0; index += 1) {
      const stack = carriedItems[index];
      if (stack.itemId !== input.itemId) {
        continue;
      }
      const available = Math.max(0, Math.floor(stack.quantity));
      const consumed = Math.min(available, remaining);
      if (consumed === 0) {
        continue;
      }
      stack.quantity = available - consumed;
      const stackWeight = Number.isFinite(stack.weight)
        ? Math.max(0, stack.weight)
        : ItemLibrary[input.itemId].weight * available;
      stack.weight = Math.max(
        0,
        stackWeight - ItemLibrary[input.itemId].weight * consumed
      );
      remaining -= consumed;
    }
  }

  const remainingItems = carriedItems.filter((stack) => stack.quantity > 0);
  for (const output of outputs) {
    const existing = remainingItems.find(
      (stack) => stack.itemId === output.itemId
    );
    const weight = ItemLibrary[output.itemId].weight * output.quantity;
    if (existing) {
      existing.quantity += output.quantity;
      existing.weight =
        (Number.isFinite(existing.weight)
          ? Math.max(0, existing.weight)
          : ItemLibrary[output.itemId].weight *
            Math.max(0, existing.quantity - output.quantity)) + weight;
    } else {
      remainingItems.push({
        itemId: output.itemId,
        quantity: output.quantity,
        weight
      });
    }
  }

  character.inventory ??= { carriedItems: [] };
  character.inventory.carriedItems = remainingItems;
  load.current = nextLoad;
  return null;
}
