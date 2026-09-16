import type { MatchRecord } from "../../models/types";
import {
  ActionLibrary,
  ItemLibrary,
  type ActionId,
  type ItemId,
  type PlayerCharacter,
  type PlayerItemStack,
  type ReplayActionDone,
  type ReplayPlayerEvent,
} from "@shared";
import { getUsableExtraExecutions } from "../../utils/energy";
import { type PlannedActionParticipant } from "./utils";
import { BaseAction } from "./classes/BaseAction";

function normalizePriorityIds(
  plan: PlannedActionParticipant["plan"]
): string[] {
  const values = Array.isArray(plan.targetItemIds) ? plan.targetItemIds : [];
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }
    if (result.indexOf(value) === -1) {
      result.push(value);
    }
  }
  return result;
}

function ensureCarriedItems(character: PlayerCharacter): PlayerItemStack[] {
  if (!character.inventory) {
    character.inventory = { carriedItems: [] };
  }
  if (!Array.isArray(character.inventory.carriedItems)) {
    character.inventory.carriedItems = [];
  }
  return character.inventory.carriedItems;
}

function itemWeight(itemType: ItemId): number {
  const weight = ItemLibrary[itemType]?.weight;
  return typeof weight === "number" && isFinite(weight)
    ? Math.max(0, weight)
    : 0;
}

function decrementLoad(character: PlayerCharacter, weight: number): void {
  if (weight <= 0 || !character.stats?.load) {
    return;
  }
  const current =
    typeof character.stats.load.current === "number" &&
    isFinite(character.stats.load.current)
      ? character.stats.load.current
      : 0;
  character.stats.load.current = Math.max(0, current - weight);
}

function removeItem(
  character: PlayerCharacter,
  itemType: ItemId,
  weight: number
): boolean {
  const carriedItems = ensureCarriedItems(character);
  for (let index = 0; index < carriedItems.length; index += 1) {
    const stack = carriedItems[index];
    if (stack.itemId !== itemType) {
      continue;
    }
    const quantity =
      typeof stack.quantity === "number" && isFinite(stack.quantity)
        ? stack.quantity
        : 1;
    if (quantity <= 1) {
      carriedItems.splice(index, 1);
    } else {
      stack.quantity = quantity - 1;
      const stackWeight =
        typeof stack.weight === "number" && isFinite(stack.weight)
          ? stack.weight
          : weight * quantity;
      stack.weight = Math.max(0, stackWeight - weight);
    }
    decrementLoad(character, weight);
    return true;
  }
  return false;
}

function selectItems(
  character: PlayerCharacter,
  priorities: string[],
  limit: number
): ItemId[] {
  const selected: ItemId[] = [];
  const carriedItems = ensureCarriedItems(character);
  const quantities: Record<string, number> = {};
  for (const stack of carriedItems) {
    if (
      typeof stack.itemId === "string" &&
      typeof stack.quantity === "number" &&
      stack.quantity > 0
    ) {
      quantities[stack.itemId] = stack.quantity;
    }
  }
  const append = (itemType: string) => {
    while (selected.length < limit && (quantities[itemType] ?? 0) > 0) {
      selected.push(itemType as ItemId);
      quantities[itemType] -= 1;
    }
  };
  for (const itemType of priorities) {
    append(itemType);
    if (selected.length >= limit) {
      return selected;
    }
  }
  for (const stack of carriedItems) {
    if (selected.length >= limit) {
      break;
    }
    if (typeof stack.itemId === "string") {
      append(stack.itemId);
    }
  }
  return selected;
}

function ensureEconomy(character: PlayerCharacter): void {
  if (!character.economy) {
    character.economy = {
      zarkans: 0,
      pendingZarkans: 0,
      incomeInterval: 1,
    };
  }
}

export class BlackMarketTradeAction extends BaseAction {
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
      const extraExecutions = getUsableExtraExecutions(
        participant.character,
        participant.plan,
        ActionLibrary.black_market_trade
      );
      const selectedItems = selectItems(
        participant.character,
        normalizePriorityIds(participant.plan),
        1 + extraExecutions
      );
      const soldItems: Array<{ itemType: ItemId; zarkans: number }> = [];
      let totalEarnedZarkans = 0;
      for (const itemType of selectedItems) {
        const weight = itemWeight(itemType);
        if (!removeItem(participant.character, itemType, weight)) {
          continue;
        }
        const sellValue = ItemLibrary[itemType]?.sellValue;
        const baseValue =
          typeof sellValue === "number" && isFinite(sellValue)
            ? Math.max(0, sellValue)
            : 0;
        const earned = baseValue + 1;
        totalEarnedZarkans += earned;
        soldItems.push({ itemType, zarkans: earned });
      }

      ensureEconomy(participant.character);
      const currentZarkans =
        typeof participant.character.economy.zarkans === "number" &&
        isFinite(participant.character.economy.zarkans)
          ? participant.character.economy.zarkans
          : 0;
      participant.character.economy.zarkans =
        currentZarkans + totalEarnedZarkans;
      this.clearPlan(participant);
      match.playerCharacters![participant.playerId] = participant.character;

      const metadata: Record<string, unknown> = {
        soldCount: soldItems.length,
        soldItems,
        zarkansEarned: totalEarnedZarkans,
        extraExecutions,
      };
      const action: ReplayActionDone = {
        actionId,
        originLocation: participant.character.position?.coord,
        targetLocation: participant.character.position?.coord,
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
}

const blackMarketTradeAction = new BlackMarketTradeAction();

export function executeBlackMarketTradeAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return blackMarketTradeAction.execute(participants, match);
}
