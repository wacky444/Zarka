import type { MatchRecord } from "../../models/types";
import {
  ItemLibrary,
  type ActionId,
  type HexTileSnapshot,
  type ItemId,
  type MatchItemRecord,
  type PlayerCharacter,
  type ReplayActionDone,
  type ReplayPlayerEvent,
} from "@shared";
import { clearPlanByKey, type PlannedActionParticipant } from "./utils";
import { buildItemLookup, findTileById } from "./search";

type ItemLookup = Record<string, MatchItemRecord>;

type PickupItem = {
  id: string;
  itemType: ItemId;
};

function normalizePriorityIds(
  plan: PlannedActionParticipant["plan"]
): string[] {
  const raw = plan.targetItemIds;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }
  const seen: Record<string, true> = {};
  const list: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed || Object.prototype.hasOwnProperty.call(seen, trimmed)) {
      continue;
    }
    seen[trimmed] = true;
    list.push(trimmed);
  }
  return list;
}

function computePickupLimit(plan: PlannedActionParticipant["plan"]): number {
  const base = 3;
  const extra =
    typeof plan.extraEffort === "number" && isFinite(plan.extraEffort)
      ? Math.max(0, Math.floor(plan.extraEffort))
      : 0;
  const limit = base + extra;
  return limit > 0 ? limit : 0;
}

function resolveItemWeight(itemType: ItemId): number {
  const definition = ItemLibrary[itemType];
  if (definition && typeof definition.weight === "number") {
    if (isFinite(definition.weight)) {
      return Math.max(0, definition.weight);
    }
  }
  return 0;
}

function incrementLoad(character: PlayerCharacter, weight: number): void {
  if (weight <= 0) {
    return;
  }
  if (!character.stats) {
    return;
  }
  const load = character.stats.load;
  if (!load) {
    character.stats.load = {
      current: weight,
      max: weight,
    };
    return;
  }
  const current =
    typeof load.current === "number" && isFinite(load.current)
      ? load.current
      : 0;
  load.current = current + weight;
}

function ensureInventory(character: PlayerCharacter) {
  if (!character.inventory) {
    character.inventory = { carriedItems: [] };
  }
  if (!Array.isArray(character.inventory.carriedItems)) {
    character.inventory.carriedItems = [];
  }
  return character.inventory;
}

function addItemToInventory(
  character: PlayerCharacter,
  itemType: ItemId,
  weight: number
): void {
  const inventory = ensureInventory(character);
  const carried = inventory.carriedItems;
  let stackIndex = -1;
  for (let index = 0; index < carried.length; index += 1) {
    const entry = carried[index];
    if (entry && entry.itemId === itemType) {
      stackIndex = index;
      break;
    }
  }
  if (stackIndex !== -1) {
    const stack = carried[stackIndex];
    const quantity =
      typeof stack.quantity === "number" && isFinite(stack.quantity)
        ? stack.quantity
        : 0;
    stack.quantity = quantity + 1;
    const totalWeight =
      typeof stack.weight === "number" && isFinite(stack.weight)
        ? stack.weight
        : 0;
    stack.weight = totalWeight + weight;
  } else {
    carried.push({
      itemId: itemType,
      quantity: 1,
      weight,
    });
  }
  inventory.carriedItems = carried;
}

function removeItemFromMatch(match: MatchRecord, itemId: string): void {
  const items = match.items;
  if (!Array.isArray(items)) {
    return;
  }
  let index = -1;
  for (let i = 0; i < items.length; i += 1) {
    const entry = items[i];
    if (entry && entry.item_id === itemId) {
      index = i;
      break;
    }
  }
  if (index !== -1) {
    items.splice(index, 1);
  }
}

function removeItemFromTile(tile: HexTileSnapshot, itemId: string): void {
  const list = Array.isArray(tile.itemIds) ? tile.itemIds : [];
  if (list.length === 0) {
    tile.itemIds = [];
    return;
  }
  tile.itemIds = list.filter((id) => id !== itemId);
}

function removeFoundItem(character: PlayerCharacter, itemId: string): void {
  if (!Array.isArray(character.foundItems)) {
    return;
  }
  const filtered = character.foundItems.filter((entry) => entry !== itemId);
  if (filtered.length !== character.foundItems.length) {
    character.foundItems = filtered;
  }
}

function filterVisibleItems(
  tileItemIds: string[],
  character: PlayerCharacter
): string[] {
  if (!Array.isArray(tileItemIds) || tileItemIds.length === 0) {
    return [];
  }
  const found = Array.isArray(character.foundItems)
    ? character.foundItems.filter((entry) => typeof entry === "string")
    : [];
  if (found.length === 0) {
    return [];
  }
  const lookup: Record<string, true> = {};
  for (const entry of found) {
    if (typeof entry !== "string") {
      continue;
    }
    lookup[entry] = true;
  }
  return tileItemIds.filter((id) =>
    Object.prototype.hasOwnProperty.call(lookup, id)
  );
}

function buildPickupQueue(visible: string[], priorities: string[]): string[] {
  const queue: string[] = [];
  const seen: Record<string, true> = {};
  for (const id of priorities) {
    if (visible.indexOf(id) === -1) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(seen, id)) {
      continue;
    }
    seen[id] = true;
    queue.push(id);
  }
  for (const id of visible) {
    if (Object.prototype.hasOwnProperty.call(seen, id)) {
      continue;
    }
    seen[id] = true;
    queue.push(id);
  }
  return queue;
}

function getLoadSnapshot(
  character: PlayerCharacter
): Record<string, number> | undefined {
  const load = character.stats?.load;
  if (!load) {
    return undefined;
  }
  const current =
    typeof load.current === "number" && isFinite(load.current)
      ? load.current
      : undefined;
  const max =
    typeof load.max === "number" && isFinite(load.max) ? load.max : undefined;
  if (current === undefined && max === undefined) {
    return undefined;
  }
  const snapshot: Record<string, number> = {};
  if (current !== undefined) {
    snapshot.current = current;
  }
  if (max !== undefined) {
    snapshot.max = max;
  }
  return snapshot;
}

export function executePickUpAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  const events: ReplayPlayerEvent[] = [];
  const itemLookup = buildItemLookup(match);

  for (const participant of participants) {
    const actionId = participant.plan.actionId as ActionId;
    if (!actionId) {
      clearPlanByKey(participant.character, participant.planKey);
      continue;
    }

    const position = participant.character.position;
    const tileId = position?.tileId;
    const coord = position?.coord;
    const priorities = normalizePriorityIds(participant.plan);
    const limit = computePickupLimit(participant.plan);
    const picked: PickupItem[] = [];
    const skippedByLoad: PickupItem[] = [];
    const missingPriorityLookup: Record<string, true> = {};
    const attempted: string[] = [];
    let visibleBefore: string[] = [];
    let remainingAfter: string[] = [];
    let missingTile = false;

    if (!tileId) {
      missingTile = true;
    } else {
      const tile = findTileById(match, tileId);
      if (!tile) {
        missingTile = true;
      } else {
        const tileItems = Array.isArray(tile.itemIds)
          ? tile.itemIds.slice()
          : [];
        const visible = filterVisibleItems(tileItems, participant.character);
        visibleBefore = visible.slice();
        if (priorities.length > 0) {
          for (const id of priorities) {
            if (visible.indexOf(id) === -1) {
              missingPriorityLookup[id] = true;
            }
          }
        }
        if (limit > 0 && visible.length > 0) {
          const queue = buildPickupQueue(visible, priorities);
          for (const itemId of queue) {
            if (picked.length >= limit) {
              break;
            }
            attempted.push(itemId);
            const record = itemLookup[itemId];
            if (!record) {
              if (priorities.indexOf(itemId) !== -1) {
                missingPriorityLookup[itemId] = true;
              }
              continue;
            }
            const itemType = record.item_type;
            const weight = resolveItemWeight(itemType);
            // TODO check for exceeding load capacity to reduce health
            addItemToInventory(participant.character, itemType, weight);
            incrementLoad(participant.character, weight);
            removeItemFromTile(tile, itemId);
            removeItemFromMatch(match, itemId);
            delete itemLookup[itemId];
            removeFoundItem(participant.character, itemId);
            picked.push({ id: itemId, itemType });
          }
        }
        remainingAfter = Array.isArray(tile.itemIds)
          ? tile.itemIds.slice()
          : [];
      }
    }

    clearPlanByKey(participant.character, participant.planKey);
    if (match.playerCharacters) {
      match.playerCharacters[participant.playerId] = participant.character;
    }

    const metadata: Record<string, unknown> = {
      pickLimit: limit,
      pickedAny: picked.length > 0,
      pickedCount: picked.length,
    };
    if (picked.length > 0) {
      metadata.pickedItemIds = picked.map((entry) => entry.id);
      metadata.pickedItems = picked.map((entry) => ({
        id: entry.id,
        itemType: entry.itemType,
      }));
    }
    if (skippedByLoad.length > 0) {
      metadata.skippedDueToLoad = skippedByLoad.map((entry) => ({
        id: entry.id,
        itemType: entry.itemType,
      }));
    }
    if (priorities.length > 0) {
      metadata.requestedItemIds = priorities;
    }
    if (attempted.length > 0) {
      metadata.attemptedItemIds = attempted;
    }
    if (visibleBefore.length > 0) {
      metadata.visibleItemIds = visibleBefore;
    }
    if (remainingAfter.length > 0) {
      metadata.remainingItemIds = remainingAfter;
    }
    const missingPriorityIds = Object.keys(missingPriorityLookup);
    if (missingPriorityIds.length > 0) {
      metadata.missingPriorityItemIds = missingPriorityIds;
    }
    const loadSnapshot = getLoadSnapshot(participant.character);
    if (loadSnapshot) {
      metadata.load = loadSnapshot;
    }
    if (missingTile) {
      metadata.missingTile = true;
    }

    const action: ReplayActionDone = {
      actionId,
      originLocation: coord,
      targetLocation: coord,
      metadata,
    };

    events.push({
      kind: "player",
      actorId: participant.playerId,
      action,
    });
  }

  return events;
}
