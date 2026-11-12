import type { PlayerCharacter, PlayerItemStack } from "./playerCharacter";
import { ItemLibrary } from "./ItemLibrary";
import type { ItemId } from "./Item";

export const BANDOLIER_MAX_LOAD_BONUS = 5;

export interface AddCarriedItemOptions {
  unitWeight?: number;
}

export interface AddCarriedItemResult {
  addedQuantity: number;
  addedWeight: number;
  nextLoad: number;
}

export function addCarriedItem(
  character: PlayerCharacter,
  itemId: ItemId,
  quantity = 1,
  options?: AddCarriedItemOptions,
): AddCarriedItemResult {
  if (quantity <= 0) {
    return {
      addedQuantity: 0,
      addedWeight: 0,
      nextLoad: character.stats?.load?.current ?? 0,
    };
  }

  character.inventory ??= { carriedItems: [] };
  if (!Array.isArray(character.inventory.carriedItems)) {
    character.inventory.carriedItems = [];
  }

  const definition = ItemLibrary[itemId];
  const unitWeight =
    typeof options?.unitWeight === "number" && Number.isFinite(options.unitWeight)
      ? Math.max(0, options.unitWeight)
      : typeof definition?.weight === "number" && Number.isFinite(definition.weight)
        ? Math.max(0, definition.weight)
        : 0;

  const totalAddedWeight = unitWeight * quantity;

  const stack = character.inventory.carriedItems.find(
    (item) => item && item.itemId === itemId,
  );

  if (stack) {
    const currentQty =
      typeof stack.quantity === "number" && Number.isFinite(stack.quantity)
        ? Math.max(0, Math.floor(stack.quantity))
        : 0;
    const currentWeight =
      typeof stack.weight === "number" && Number.isFinite(stack.weight)
        ? Math.max(0, stack.weight)
        : unitWeight * currentQty;

    stack.quantity = currentQty + quantity;
    stack.weight = currentWeight + totalAddedWeight;
  } else {
    character.inventory.carriedItems.push({
      itemId,
      quantity,
      weight: totalAddedWeight,
    });
  }

  if (character.stats?.load) {
    const currentLoad =
      typeof character.stats.load.current === "number" &&
      Number.isFinite(character.stats.load.current)
        ? character.stats.load.current
        : 0;
    character.stats.load.current = Math.max(0, currentLoad + totalAddedWeight);
  }

  syncBandolierLoadCapacity(character);

  return {
    addedQuantity: quantity,
    addedWeight: totalAddedWeight,
    nextLoad: character.stats?.load?.current ?? 0,
  };
}

export function recalculateCharacterLoad(character: PlayerCharacter): number {
  const carried = character.inventory?.carriedItems ?? [];
  let totalWeight = 0;
  for (const stack of carried) {
    if (!stack || typeof stack.quantity !== "number" || stack.quantity <= 0) {
      continue;
    }
    if (typeof stack.weight === "number" && Number.isFinite(stack.weight)) {
      totalWeight += Math.max(0, stack.weight);
    } else {
      const def = ItemLibrary[stack.itemId as ItemId];
      const w =
        typeof def?.weight === "number" && Number.isFinite(def.weight)
          ? Math.max(0, def.weight)
          : 0;
      totalWeight += w * stack.quantity;
    }
  }
  if (character.stats?.load) {
    character.stats.load.current = totalWeight;
  }
  syncBandolierLoadCapacity(character);
  return totalWeight;
}

export function syncBandolierLoadCapacity(character: PlayerCharacter): void {
  const load = character.stats?.load;
  if (!load) {
    return;
  }
  const hasBandolier = (character.inventory?.carriedItems ?? []).some(
    (item: PlayerItemStack) =>
      item?.itemId === "bandolier" &&
      typeof item.quantity === "number" &&
      item.quantity > 0,
  );
  const nextBonus = hasBandolier ? BANDOLIER_MAX_LOAD_BONUS : 0;
  const previousBonus =
    typeof load.bandolierCapacityBonus === "number" &&
    isFinite(load.bandolierCapacityBonus)
      ? Math.max(
          0,
          Math.min(BANDOLIER_MAX_LOAD_BONUS, load.bandolierCapacityBonus),
        )
      : 0;
  const max =
    typeof load.max === "number" && isFinite(load.max) ? load.max : 25;
  load.max = Math.max(0, max + nextBonus - previousBonus);
  load.bandolierCapacityBonus = nextBonus;
}
