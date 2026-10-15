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
    const definition = ItemLibrary[stack.itemId as ItemId];
    if (!definition || !Number.isFinite(stack.quantity) || stack.quantity <= 0) {
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
  candidates.sort((a, b) => a.value - b.value || a.order - b.order);
  return candidates;
}

function removeOneItem(
  match: MatchRecord,
  playerId: string,
  itemId: ItemId,
  tileId: string
): boolean {
  const character = match.playerCharacters?.[playerId];
  const carriedItems = character?.inventory?.carriedItems;
  const load = character?.stats?.load;
  const tile = match.map?.tiles.find((candidate) => candidate.id === tileId);
  if (!character || !Array.isArray(carriedItems) || !load || !tile) {
    return false;
  }
  const index = carriedItems.findIndex(
    (stack) => stack.itemId === itemId && stack.quantity > 0,
  );
  if (index < 0) {
    return false;
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
  load.current = Math.max(0, load.current - weight);

  const itemIdOnGround = `itm_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;
  match.items = match.items ?? [];
  match.items.push({ item_id: itemIdOnGround, item_type: itemId });
  tile.itemIds = Array.isArray(tile.itemIds) ? tile.itemIds : [];
  tile.itemIds.push(itemIdOnGround);
  character.discoveredItemIds = character.discoveredItemIds ?? [];
  character.discoveredItemIds.push(itemIdOnGround);
  syncBandolierLoadCapacity(character);
  return true;
}

export function dropOverweightItems(match: MatchRecord): ReplayPlayerEvent[] {
  const events: ReplayPlayerEvent[] = [];
  for (const playerId of match.players ?? []) {
    const character = match.playerCharacters?.[playerId];
    const load = character?.stats?.load;
    const tileId = character?.position?.tileId;
    if (
      !character ||
      !load ||
      !tileId ||
      !Number.isFinite(load.current) ||
      !Number.isFinite(load.max) ||
      load.current <= load.max
    ) {
      continue;
    }

    const droppedItems: ItemId[] = [];
    for (const candidate of getCandidates(match, playerId)) {
      if (load.current <= load.max) {
        break;
      }
      if (removeOneItem(match, playerId, candidate.itemId, tileId)) {
        droppedItems.push(candidate.itemId);
      }
    }
    if (droppedItems.length === 0) {
      continue;
    }
    events.push({
      kind: "player",
      actorId: playerId,
      action: {
        actionId: "drop",
        originLocation: character.position?.coord,
        targetLocation: character.position?.coord,
        metadata: {
          automatic: true,
          droppedCount: droppedItems.length,
          droppedItems: droppedItems.map((itemType) => ({ itemType })),
          sellInstead: false,
          load: { current: load.current, max: load.max },
        },
      },
    });
  }
  return events;
}
