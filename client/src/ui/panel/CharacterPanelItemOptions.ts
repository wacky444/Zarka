import {
  ItemCategory,
  ItemLibrary,
  type ItemDefinition,
  type ItemId,
  type MatchRecord
} from "@shared";
import { resolveItemTexture } from "../itemIcons";
import type { ItemPriorityOption } from "../ItemPrioritySelector";
import type { InventoryGridItem } from "../InventoryGrid";

export interface CharacterPanelItemOptions {
  groundItems: ItemPriorityOption[];
  inventoryItems: ItemPriorityOption[];
  stealItems: ItemPriorityOption[];
}

export function buildCharacterPanelItemOptions(
  match: MatchRecord | null,
  currentUserId: string | null
): CharacterPanelItemOptions {
  const groundItems: ItemPriorityOption[] = [];
  const inventoryItems: ItemPriorityOption[] = [];
  const stealItems: ItemPriorityOption[] = [];
  const character =
    match && currentUserId
      ? (match.playerCharacters?.[currentUserId] ?? null)
      : null;
  if (match && currentUserId) {
    const tileId = character?.position?.tileId ?? null;
    if (tileId) {
      const tiles = Array.isArray(match.map?.tiles) ? match.map.tiles : [];
      const tile = tiles.find((entry) => entry?.id === tileId);
      const matchItems = Array.isArray(match.items) ? match.items : [];
      const itemRecords = new Map(
        matchItems
          .filter((record) => typeof record?.item_id === "string")
          .map((record) => [record.item_id, record])
      );
      const itemIds = Array.isArray(tile?.itemIds) ? tile.itemIds : [];
      for (const itemId of itemIds) {
        if (typeof itemId !== "string" || itemId.length === 0) {
          continue;
        }
        const itemType = itemRecords.get(itemId)?.item_type;
        const definition = itemType ? ItemLibrary[itemType] : undefined;
        if (definition?.canBePickedUp === false) {
          continue;
        }
        const visual = definition
          ? resolveItemTexture(definition)
          : { texture: "hex", frame: "grass_01.png" };
        groundItems.push({
          id: itemId,
          label: definition?.name ?? itemId,
          description: definition?.description,
          texture: visual.texture,
          frame: visual.frame
        });
      }

    }
    const carriedItems = Array.isArray(character?.inventory?.carriedItems)
      ? character.inventory.carriedItems
      : [];
    for (const stack of carriedItems) {
      if (
        !stack ||
        typeof stack.itemId !== "string" ||
        stack.quantity <= 0
      ) {
        continue;
      }
      const itemId = stack.itemId as ItemId;
      const definition = ItemLibrary[itemId];
      const name = definition?.name ?? itemId;
      const visual = definition
        ? resolveItemTexture(definition)
        : { texture: "hex", frame: "grass_01.png" };
      inventoryItems.push({
        id: itemId,
        label: stack.quantity > 1 ? `${name} (x${stack.quantity})` : name,
        description: definition?.description,
        texture: visual.texture,
        frame: visual.frame
      });
    }
  }
  if (character?.abilities?.includes("dexterity2")) {
    for (const definition of Object.values(ItemLibrary)) {
      if (
        definition.category === ItemCategory.Special ||
        definition.canBeStolen === false
      ) {
        continue;
      }
      const visual = resolveItemTexture(definition);
      stealItems.push({
        id: definition.id,
        label: definition.name,
        description: definition.description,
        texture: visual.texture,
        frame: visual.frame
      });
    }
  }
  return { groundItems, inventoryItems, stealItems };
}

export function buildInventoryGridItems(
  stacks: Array<{ itemId?: string; quantity?: number; weight?: number }>,
  walletZarkans = 0
): InventoryGridItem[] {
  const aggregated = new Map<
    string,
    { quantity: number; totalWeight: number }
  >();
  for (const stack of stacks) {
    if (!stack || typeof stack.itemId !== "string") {
      continue;
    }
    const entry = aggregated.get(stack.itemId) ?? {
      quantity: 0,
      totalWeight: 0
    };
    entry.quantity += normalizeQuantity(stack.quantity);
    entry.totalWeight += normalizeRawWeight(stack.weight);
    aggregated.set(stack.itemId, entry);
  }
  const walletQuantity = normalizeQuantity(walletZarkans);
  if (walletQuantity > 0) {
    const entry = aggregated.get("zarkans") ?? {
      quantity: 0,
      totalWeight: 0
    };
    entry.quantity += walletQuantity;
    aggregated.set("zarkans", entry);
  }

  const items: InventoryGridItem[] = [];
  for (const [itemId, entry] of aggregated) {
    const definition = resolveItemDefinition(itemId);
    const fallbackPerWeight = definition?.weight ?? 0;
    const computedWeight =
      entry.totalWeight > 0
        ? entry.totalWeight
        : entry.quantity * fallbackPerWeight;
    const perItemWeight =
      fallbackPerWeight > 0
        ? fallbackPerWeight
        : entry.quantity > 0
          ? computedWeight / entry.quantity
          : 0;
    if (entry.quantity <= 0 && computedWeight <= 0) {
      continue;
    }
    const visual = definition
      ? resolveItemTexture(definition)
      : { texture: "hex", frame: "grass_01.png" as const };
    items.push({
      id: definition?.id ?? itemId,
      name: definition?.name ?? formatItemName(itemId),
      category: definition?.category,
      description: definition?.description ?? "Description not available yet.",
      notes: definition?.notes,
      quantity: entry.quantity,
      totalWeight: normalizeWeight(computedWeight),
      weightPerItem: normalizeWeight(perItemWeight),
      texture: visual.texture,
      frame: visual.frame
    });
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

function resolveItemDefinition(itemId: string): ItemDefinition | null {
  return ItemLibrary[itemId as ItemId] ?? null;
}

function normalizeQuantity(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function normalizeRawWeight(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
}

function normalizeWeight(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value * 100) / 100);
}

function formatItemName(id: string): string {
  const spaced = id.replace(/[_-]+/g, " ");
  return spaced.slice(0, 1).toUpperCase() + spaced.slice(1);
}
