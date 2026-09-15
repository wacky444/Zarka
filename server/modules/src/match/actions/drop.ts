import type { MatchRecord } from "../../models/types";
import {
  ActionLibrary,
  getSkillRank,
  ItemLibrary,
  type ActionId,
  type HexTileSnapshot,
  type ItemId,
  type PlayerCharacter,
  type ReplayActionDone,
  type ReplayPlayerEvent
} from "@shared";
import { type PlannedActionParticipant } from "./utils";
import { findTileById } from "./search";
import { getUsableExtraExecutions } from "../../utils/energy";
import { BaseAction } from "./classes/BaseAction";

function normalizePriorityIds(
  plan: PlannedActionParticipant["plan"]
): string[] {
  const list = Array.isArray(plan.targetItemIds) ? plan.targetItemIds : [];
  const normalized: string[] = [];
  const lookup: Record<string, true> = {};
  for (const entry of list) {
    if (typeof entry !== "string" || entry.length === 0) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(lookup, entry)) {
      continue;
    }
    lookup[entry] = true;
    normalized.push(entry);
  }
  return normalized;
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

function decrementLoad(character: PlayerCharacter, weight: number): void {
  if (weight <= 0 || !character.stats?.load) {
    return;
  }
  const load = character.stats.load;
  const current =
    typeof load.current === "number" && isFinite(load.current)
      ? load.current
      : 0;
  load.current = Math.max(0, current - weight);
}

function removeItemFromInventory(
  character: PlayerCharacter,
  itemType: ItemId,
  weight: number
): boolean {
  if (
    !character.inventory ||
    !Array.isArray(character.inventory.carriedItems)
  ) {
    return false;
  }
  const carried = character.inventory.carriedItems;
  let index = -1;
  for (let i = 0; i < carried.length; i += 1) {
    const entry = carried[i];
    if (entry && entry.itemId === itemType) {
      index = i;
      break;
    }
  }
  if (index === -1) {
    return false;
  }
  const stack = carried[index];
  const currentQuantity =
    typeof stack.quantity === "number" && isFinite(stack.quantity)
      ? stack.quantity
      : 1;
  if (currentQuantity <= 1) {
    carried.splice(index, 1);
  } else {
    stack.quantity = currentQuantity - 1;
    const currentWeight =
      typeof stack.weight === "number" && isFinite(stack.weight)
        ? stack.weight
        : weight;
    stack.weight = Math.max(0, currentWeight - weight);
  }
  decrementLoad(character, weight);
  return true;
}

function selectItemsToDrop(
  character: PlayerCharacter,
  priorities: string[],
  limit: number
): ItemId[] {
  const selected: ItemId[] = [];
  if (
    !character.inventory ||
    !Array.isArray(character.inventory.carriedItems)
  ) {
    return selected;
  }
  const counts: Record<string, number> = {};
  for (const stack of character.inventory.carriedItems) {
    if (stack && typeof stack.itemId === "string" && stack.quantity > 0) {
      counts[stack.itemId] = stack.quantity;
    }
  }
  for (const priorityId of priorities) {
    while (selected.length < limit && (counts[priorityId] ?? 0) > 0) {
      selected.push(priorityId as ItemId);
      counts[priorityId] -= 1;
    }
    if (selected.length >= limit) {
      break;
    }
  }
  if (selected.length < limit) {
    for (const stack of character.inventory.carriedItems) {
      if (!stack || typeof stack.itemId !== "string") {
        continue;
      }
      const itemId = stack.itemId;
      while (selected.length < limit && (counts[itemId] ?? 0) > 0) {
        selected.push(itemId as ItemId);
        counts[itemId] -= 1;
      }
      if (selected.length >= limit) {
        break;
      }
    }
  }
  return selected;
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

export class DropAction extends BaseAction {
  protected override readonly shouldShuffleParticipants = false;

  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];

    for (const participant of roster) {
      const actionId = participant.plan.actionId as ActionId;
      if (!actionId) {
        this.clearPlan(participant);
        continue;
      }

      const position = participant.character.position;
      const tileId = position?.tileId;
      const coord = position?.coord;
      const priorities = normalizePriorityIds(participant.plan);
      const definition = ActionLibrary[actionId];
      const extraReps = getUsableExtraExecutions(
        participant.character,
        participant.plan,
        definition
      );
      const limit = 1 + extraReps;
      const isSell = participant.plan.sellInstead === true;

      const tile = tileId ? findTileById(match, tileId) : undefined;
      const chosenItems = selectItemsToDrop(
        participant.character,
        priorities,
        limit
      );
      const processedItems: Array<{ itemType: ItemId; zarkans?: number }> = [];
      let totalEarnedZarkans = 0;

      for (const itemType of chosenItems) {
        const weight = resolveItemWeight(itemType);
        const removed = removeItemFromInventory(
          participant.character,
          itemType,
          weight
        );
        if (!removed) {
          continue;
        }

        if (isSell) {
          const itemDef = ItemLibrary[itemType];
          const rawSellValue = itemDef?.sellValue;
          const baseValue =
            typeof rawSellValue === "number" && isFinite(rawSellValue)
              ? Math.max(0, rawSellValue)
              : 0;
          const salesmanBonus =
            getSkillRank(participant.character, "salesman") > 0 ? 1 : 0;
          const earned = baseValue + salesmanBonus;
          totalEarnedZarkans += earned;

          if (!participant.character.economy) {
            participant.character.economy = {
              zarkans: 0,
              pendingZarkans: 0,
              incomeInterval: 1
            };
          }
          const currentZarkans =
            typeof participant.character.economy.zarkans === "number" &&
            isFinite(participant.character.economy.zarkans)
              ? participant.character.economy.zarkans
              : 0;
          participant.character.economy.zarkans = currentZarkans + earned;

          processedItems.push({ itemType, zarkans: earned });
        } else {
          const newId = `itm_${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 7)}`;
          if (!Array.isArray(match.items)) {
            match.items = [];
          }
          match.items.push({ item_id: newId, item_type: itemType });

          if (tile) {
            if (!Array.isArray(tile.itemIds)) {
              tile.itemIds = [];
            }
            tile.itemIds.push(newId);
          }

          if (!Array.isArray(participant.character.foundItems)) {
            participant.character.foundItems = [];
          }
          participant.character.foundItems.push(newId);

          processedItems.push({ itemType });
        }
      }

      this.clearPlan(participant);
      if (match.playerCharacters) {
        match.playerCharacters[participant.playerId] = participant.character;
      }

      const metadata: Record<string, unknown> = {
        droppedCount: processedItems.length,
        droppedItems: processedItems.map((item) => ({
          itemType: item.itemType
        })),
        sellInstead: isSell,
        extraExecutions: extraReps
      };
      if (isSell) {
        metadata.zarkansEarned = totalEarnedZarkans;
      }
      const loadSnapshot = getLoadSnapshot(participant.character);
      if (loadSnapshot) {
        metadata.load = loadSnapshot;
      }

      const action: ReplayActionDone = {
        actionId,
        originLocation: coord,
        targetLocation: coord,
        metadata
      };

      events.push({
        kind: "player",
        actorId: participant.playerId,
        action
      });
    }

    return events;
  }
}

const dropAction = new DropAction();

export function executeDropAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return dropAction.execute(participants, match);
}
