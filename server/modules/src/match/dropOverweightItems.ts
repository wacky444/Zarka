import {
  ItemLibrary,
  syncBandolierLoadCapacity,
  type ItemId,
  type ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../models/types";

interface DropCandidate {
  itemId: ItemId;
  value: number;
  order: number;
}

function getCandidates(match: MatchRecord, playerId: string): DropCandidate[] {
  const carriedItems = match.playerCharacters?.[playerId]?.inventory?.carriedItems;
  if (!Array.isArray(carriedItems)) {
    return [];
  }
  const candidates: DropCandidate[] = [];
  let order = 0;
  for (const stack of carriedItems) {
    if (!stack || !stack.itemId) {
      continue;
    }
    const definition = ItemLibrary[stack.itemId as ItemId];
    if (!definition || !Number.isFinite(stack.quantity) || stack.quantity <= 0) {
      continue;
    }
    const itemWeight =
      typeof definition.weight === "number" && Number.isFinite(definition.weight)
        ? Math.max(0, definition.weight)
        : 0;
    if (itemWeight <= 0) {
      continue;
    }
    const rawValue = definition.sellValue;
    const value = typeof rawValue === "number" && Number.isFinite(rawValue)
      ? rawValue
      : 0;
    for (let count = 0; count < stack.quantity; count += 1) {
      candidates.push({ itemId: definition.id, value, order });
      order += 1;
    }
  }
  candidates.sort((a, b) => {
    // Special rule: remote c4 detonator is dropped among the last items to avoid losing it due to 0/low sell value
    const aIsDetonator = a.itemId === "detonator";
    const bIsDetonator = b.itemId === "detonator";
    if (aIsDetonator !== bIsDetonator) {
      return aIsDetonator ? 1 : -1;
    }
    return a.value - b.value || a.order - b.order;
  });
  return candidates;
}

function removeOneItem(
  match: MatchRecord,
  playerId: string,
  itemId: ItemId,
  tileId?: string
): string | null {
  const character = match.playerCharacters?.[playerId];
  const carriedItems = character?.inventory?.carriedItems;
  const load = character?.stats?.load;
  const coord = character?.position?.coord;
  const tile = match.map?.tiles.find(
    (candidate) =>
      (tileId && candidate.id === tileId) ||
      (candidate.coord && coord && candidate.coord.q === coord.q && candidate.coord.r === coord.r)
  );
  if (!character || !Array.isArray(carriedItems) || !load || !tile) {
    return null;
  }
  const index = carriedItems.findIndex(
    (stack) => stack && stack.itemId === itemId && stack.quantity > 0,
  );
  if (index < 0) {
    return null;
  }
  const definition = ItemLibrary[itemId];
  const weight = Math.max(0, definition.weight);
  const stack = carriedItems[index];
  if (stack.quantity === 1) {
    carriedItems.splice(index, 1);
  } else {
    stack.quantity -= 1;
    stack.weight = Math.max(0, stack.weight - weight);
  }
  character.inventory.carriedItems = carriedItems.filter(Boolean);
  load.current = Math.max(0, load.current - weight);

  const itemIdOnGround = `itm_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;
  match.items = match.items ?? [];
  match.items.push({ item_id: itemIdOnGround, item_type: itemId });
  tile.itemIds = Array.isArray(tile.itemIds) ? tile.itemIds : [];
  tile.itemIds.push(itemIdOnGround);
  character.discoveredItemIds = character.discoveredItemIds ?? [];
  if (character.discoveredItemIds.indexOf(itemIdOnGround) === -1) {
    character.discoveredItemIds.push(itemIdOnGround);
  }
  syncBandolierLoadCapacity(character);
  return itemIdOnGround;
}

export function dropOverweightItems(match: MatchRecord): ReplayPlayerEvent[] {
  const events: ReplayPlayerEvent[] = [];
  const playerIds = Array.from(
    new Set([...(match.players ?? []), ...Object.keys(match.playerCharacters ?? {})])
  );
  for (const playerId of playerIds) {
    const character = match.playerCharacters?.[playerId];
    const load = character?.stats?.load;
    const tileId = character?.position?.tileId;
    const coord = character?.position?.coord;
    if (
      !character ||
      !load ||
      (!tileId && !coord) ||
      !Number.isFinite(load.current) ||
      !Number.isFinite(load.max) ||
      load.current <= load.max
    ) {
      continue;
    }

    const droppedItems: Array<{ itemType: ItemId; id: string }> = [];
    for (const candidate of getCandidates(match, playerId)) {
      if (load.current <= load.max) {
        break;
      }
      const droppedId = removeOneItem(match, playerId, candidate.itemId, tileId);
      if (droppedId) {
        droppedItems.push({ itemType: candidate.itemId, id: droppedId });
      }
    }
    if (droppedItems.length === 0) {
      continue;
    }
    events.push({
      kind: "player",
      importance: 1,
      actorId: playerId,
      action: {
        actionId: "drop",
        originLocation: character.position?.coord,
        targetLocation: character.position?.coord,
        metadata: {
          automatic: true,
          droppedCount: droppedItems.length,
          droppedItems: droppedItems.map((item) => ({ itemType: item.itemType, id: item.id })),
          discoveredItemIds: droppedItems.map((item) => item.id),
          sellInstead: false,
          load: { current: load.current, max: load.max },
        },
      },
    });
  }
  return events;
}
