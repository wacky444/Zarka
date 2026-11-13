import type { PlayerCharacter, PlayerItemStack, PlayerItemStackMetadata } from "./playerCharacter";
import { ItemLibrary } from "./ItemLibrary";
import type { ItemId } from "./Item";

export const BANDOLIER_MAX_LOAD_BONUS = 5;

export function isSameItemStackMetadata(
  a?: PlayerItemStackMetadata,
  b?: PlayerItemStackMetadata,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export function syncPoisonCounters(character: PlayerCharacter): void {
  const carried = character.inventory?.carriedItems ?? [];
  let count = 0;
  const by: Record<string, number> = {};
  for (const stack of carried) {
    if (stack?.metadata?.poisonedBy && (stack.itemId === "food" || stack.itemId === "drink")) {
      const qty = Math.max(0, Math.floor(stack.quantity));
      count += qty;
      const owner = stack.metadata.poisonedBy;
      by[owner] = (by[owner] ?? 0) + qty;
    }
  }
  if (count > 0) {
    character.poisonedFoodCount = count;
    character.poisonedFoodBy = by;
  } else {
    character.poisonedFoodCount = 0;
    delete character.poisonedFoodBy;
  }
}

export interface AddCarriedItemOptions {
  unitWeight?: number;
  metadata?: PlayerItemStackMetadata;
}

export interface RemoveCarriedItemOptions {
  unitWeight?: number;
  metadata?: PlayerItemStackMetadata;
  preferPoisoned?: boolean;
}

export interface ExtractedCarriedItem {
  itemId: ItemId;
  quantity: number;
  weight: number;
  metadata?: PlayerItemStackMetadata;
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
    (item) => item && item.itemId === itemId && isSameItemStackMetadata(item.metadata, options?.metadata),
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
      ...(options?.metadata ? { metadata: { ...options.metadata } } : {}),
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
  syncPoisonCounters(character);

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

export function removeCarriedItem(
  character: PlayerCharacter,
  itemId: ItemId,
  quantity = 1,
  options?: RemoveCarriedItemOptions,
): boolean {
  if (!itemId || quantity <= 0) {
    return false;
  }
  const carried = character.inventory?.carriedItems;
  if (!Array.isArray(carried) || carried.length === 0) {
    return false;
  }

  const matchesOptions = (s: PlayerItemStack) => {
    if (!s || s.itemId !== itemId || typeof s.quantity !== "number" || s.quantity <= 0) return false;
    if (options?.metadata !== undefined && !isSameItemStackMetadata(s.metadata, options.metadata)) return false;
    return true;
  };

  let totalAvailable = 0;
  for (const s of carried) {
    if (matchesOptions(s)) {
      totalAvailable += Math.floor(s.quantity);
    }
  }
  if (totalAvailable < quantity) {
    return false;
  }

  let remainingToRemove = quantity;
  let totalRemovedWeight = 0;
  const definition = ItemLibrary[itemId];

  // Build removal order
  const indices: number[] = [];
  for (let i = 0; i < carried.length; i++) {
    if (matchesOptions(carried[i])) indices.push(i);
  }
  if (options?.preferPoisoned === true) {
    indices.sort((a, b) => (carried[b].metadata?.poisonedBy ? 1 : 0) - (carried[a].metadata?.poisonedBy ? 1 : 0));
  } else if (options?.preferPoisoned === false) {
    indices.sort((a, b) => (carried[a].metadata?.poisonedBy ? 1 : 0) - (carried[b].metadata?.poisonedBy ? 1 : 0));
  } else {
    indices.reverse(); // Default: remove from end
  }

  for (const i of indices) {
    if (remainingToRemove <= 0) break;
    const stack = carried[i];
    const stackQty =
      typeof stack.quantity === "number" && Number.isFinite(stack.quantity)
        ? Math.max(0, Math.floor(stack.quantity))
        : 0;
    if (stackQty <= 0) continue;

    const toRemove = Math.min(stackQty, remainingToRemove);
    const unitWeight =
      typeof options?.unitWeight === "number" && Number.isFinite(options.unitWeight)
        ? Math.max(0, options.unitWeight)
        : typeof definition?.weight === "number" && Number.isFinite(definition.weight)
          ? Math.max(0, definition.weight)
          : typeof stack.weight === "number" && stackQty > 0 && Number.isFinite(stack.weight)
            ? Math.max(0, stack.weight / stackQty)
            : 0;

    const removedStackWeight = unitWeight * toRemove;
    totalRemovedWeight += removedStackWeight;
    remainingToRemove -= toRemove;

    if (stackQty <= toRemove) {
      stack.quantity = 0;
    } else {
      stack.quantity = stackQty - toRemove;
      if (typeof stack.weight === "number" && Number.isFinite(stack.weight)) {
        stack.weight = Math.max(0, stack.weight - removedStackWeight);
      }
    }
  }

  // Clean up empty stacks
  character.inventory.carriedItems = carried.filter((s) => s && typeof s.quantity === "number" && s.quantity > 0);

  if (character.stats?.load) {
    const currentLoad =
      typeof character.stats.load.current === "number" &&
      Number.isFinite(character.stats.load.current)
        ? character.stats.load.current
        : 0;
    character.stats.load.current = Math.max(0, currentLoad - totalRemovedWeight);
  }

  syncBandolierLoadCapacity(character);
  syncPoisonCounters(character);

  return true;
}

export function extractCarriedItem(
  character: PlayerCharacter,
  itemId: ItemId,
  quantity = 1,
  options?: RemoveCarriedItemOptions,
): ExtractedCarriedItem | null {
  if (!itemId || quantity <= 0) {
    return null;
  }
  const carried = character.inventory?.carriedItems;
  if (!Array.isArray(carried) || carried.length === 0) {
    return null;
  }

  const matchesOptions = (s: PlayerItemStack) => {
    if (!s || s.itemId !== itemId || typeof s.quantity !== "number" || s.quantity <= 0) return false;
    if (options?.metadata !== undefined && !isSameItemStackMetadata(s.metadata, options.metadata)) return false;
    return true;
  };

  const indices: number[] = [];
  for (let i = 0; i < carried.length; i++) {
    if (matchesOptions(carried[i])) indices.push(i);
  }
  if (indices.length === 0) return null;

  if (options?.preferPoisoned === true) {
    indices.sort((a, b) => (carried[b].metadata?.poisonedBy ? 1 : 0) - (carried[a].metadata?.poisonedBy ? 1 : 0));
  } else if (options?.preferPoisoned === false) {
    indices.sort((a, b) => (carried[a].metadata?.poisonedBy ? 1 : 0) - (carried[b].metadata?.poisonedBy ? 1 : 0));
  } else {
    indices.reverse();
  }

  const targetStack = carried[indices[0]];
  const metadata = targetStack.metadata ? { ...targetStack.metadata } : undefined;
  const unitWeight = typeof targetStack.weight === "number" && targetStack.quantity > 0
    ? targetStack.weight / targetStack.quantity
    : (ItemLibrary[itemId]?.weight ?? 0);

  const success = removeCarriedItem(character, itemId, quantity, {
    unitWeight: options?.unitWeight ?? unitWeight,
    metadata: targetStack.metadata,
  });
  if (!success) return null;

  return {
    itemId,
    quantity,
    weight: unitWeight * quantity,
    metadata,
  };
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
