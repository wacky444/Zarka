/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import {
  getSkillEffectTotal,
  ItemLibrary,
  ReplayActionEffect,
  type ActionId,
  type ItemId,
  type PlayerCharacter,
  type ReplayActionDone,
  type ReplayActionTarget,
  type ReplayPlayerEvent,
} from "@shared";
import {
  applyHealthDelta,
  mergeCharacterState,
  type PlannedActionParticipant
} from "./utils";
import { getAvailableEnergy } from "../../utils/energy";
import { BaseAction } from "./classes/BaseAction";

const FEED_ITEM_PRIORITY: ItemId[] = ["food", "drink"];

export function hasFeedConsumable(character: PlayerCharacter): boolean {
  const stacks = character.inventory?.carriedItems;
  if (!Array.isArray(stacks)) {
    return false;
  }
  for (const stack of stacks) {
    if (!stack || typeof stack.itemId !== "string") {
      continue;
    }
    const itemId = stack.itemId as ItemId;
    if (FEED_ITEM_PRIORITY.indexOf(itemId) === -1) {
      continue;
    }
    const quantity = typeof stack.quantity === "number" ? stack.quantity : 0;
    if (quantity > 0) {
      return true;
    }
  }
  return false;
}

function getCorpseRations(corpse: PlayerCharacter): number {
  if (typeof corpse.corpseRations === "number" && isFinite(corpse.corpseRations)) {
    return Math.max(0, Math.floor(corpse.corpseRations));
  }
  return 4;
}

function findCorpse(
  character: PlayerCharacter,
  match: MatchRecord
): PlayerCharacter | null {
  const tileId = character.position?.tileId;
  if (!tileId || !match.playerCharacters) {
    return null;
  }
  for (const playerId in match.playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(match.playerCharacters, playerId)) {
      continue;
    }
    const corpse = match.playerCharacters[playerId];
    if (
      corpse.id !== character.id &&
      corpse.position?.tileId === tileId &&
      Array.isArray(corpse.statuses?.conditions) &&
      corpse.statuses.conditions.indexOf("dead") !== -1 &&
      getCorpseRations(corpse) > 0
    ) {
      return corpse;
    }
  }
  return null;
}

function canEatCorpse(character: PlayerCharacter, match: MatchRecord): boolean {
  const corpse = findCorpse(character, match);
  if (!corpse) {
    return false;
  }
  const hasCannibalSkill =
    getSkillEffectTotal(character, "corpse_consumption") > 0;
  return hasCannibalSkill || getAvailableEnergy(character) <= 0;
}

export function canFeedParticipant(
  character: PlayerCharacter,
  match: MatchRecord
): boolean {
  return hasFeedConsumable(character) || canEatCorpse(character, match);
}

function getEnergyGain(itemId: ItemId): number {
  switch (itemId) {
    case "food":
      return 20;
    case "drink":
      return 12;
    default:
      return 0;
  }
}

function applyEnergy(character: PlayerCharacter, amount: number): number {
  if (amount <= 0) {
    return 0;
  }
  const stats = character.stats;
  if (!stats || !stats.energy) {
    return 0;
  }
  const energy = stats.energy;
  const current = typeof energy.current === "number" ? energy.current : 0;
  const max = typeof energy.max === "number" ? energy.max : current;
  const next = Math.min(max, current + amount);
  energy.current = next;
  return next - current;
}

function computePerItemWeight(
  itemId: ItemId,
  totalWeight: number,
  quantity: number
): number {
  if (quantity <= 0) {
    return 0;
  }
  const definition = ItemLibrary[itemId];
  if (definition && typeof definition.weight === "number") {
    return definition.weight;
  }
  if (typeof totalWeight === "number" && isFinite(totalWeight)) {
    return totalWeight / quantity;
  }
  return 0;
}

function consumeFeedItem(character: PlayerCharacter): ItemId | null {
  const inventory = character.inventory;
  if (!inventory || !Array.isArray(inventory.carriedItems)) {
    return null;
  }
  for (let index = 0; index < inventory.carriedItems.length; index += 1) {
    const stack = inventory.carriedItems[index];
    if (!stack || typeof stack.itemId !== "string") {
      continue;
    }
    const itemId = stack.itemId as ItemId;
    if (FEED_ITEM_PRIORITY.indexOf(itemId) === -1) {
      continue;
    }
    const quantity =
      typeof stack.quantity === "number" && isFinite(stack.quantity)
        ? Math.max(0, Math.floor(stack.quantity))
        : 0;
    if (quantity <= 0) {
      continue;
    }
    const perItemWeight = computePerItemWeight(
      itemId,
      typeof stack.weight === "number" ? stack.weight : 0,
      quantity
    );
    const load = character.stats?.load;
    if (load && typeof load.current === "number") {
      load.current = Math.max(0, load.current - perItemWeight);
    }
    if (quantity === 1) {
      inventory.carriedItems.splice(index, 1);
    } else {
      stack.quantity = quantity - 1;
      if (typeof stack.weight === "number") {
        stack.weight = Math.max(0, stack.weight - perItemWeight);
      } else if (perItemWeight > 0) {
        stack.weight = perItemWeight * (stack.quantity ?? 0);
      }
    }
    return itemId;
  }
  return null;
}

function consumeCorpse(
  character: PlayerCharacter,
  match: MatchRecord
): PlayerCharacter | null {
  const corpse = findCorpse(character, match);
  if (!corpse) {
    return null;
  }
  const remaining = getCorpseRations(corpse) - 1;
  corpse.corpseRations = remaining;
  if (remaining <= 0 && corpse.inventory) {
    corpse.inventory.carriedItems = [];
    corpse.inventory.stash = [];
  }
  return corpse;
}

export class FeedAction extends BaseAction {
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
        if (match.playerCharacters) {
          match.playerCharacters[participant.playerId] = participant.character;
        }
        continue;
      }
      const consumedItemId = consumeFeedItem(participant.character);
      const corpse = consumedItemId
        ? null
        : canEatCorpse(participant.character, match)
          ? consumeCorpse(participant.character, match)
          : null;
      if (!consumedItemId && !corpse) {
        this.clearPlan(participant);
        if (match.playerCharacters) {
          match.playerCharacters[participant.playerId] = participant.character;
        }
        continue;
      }
      const energyGain = corpse ? 20 : getEnergyGain(consumedItemId!);
      const restored = applyEnergy(participant.character, energyGain);
      let healthEvent: ReplayPlayerEvent | undefined;
      const corpseHealthLoss = corpse
        ? getSkillEffectTotal(participant.character, "corpse_consumption") > 0
          ? 0
          : 1
        : 0;
      if (corpse && corpseHealthLoss > 0) {
        const healthOutcome = applyHealthDelta(participant.character, -1);
        mergeCharacterState(participant.character, healthOutcome.character);
        healthEvent = healthOutcome.event;
      }
      const action: ReplayActionDone = {
        actionId,
        effects: ReplayActionEffect.Heal,
        metadata: {
          consumedItemId: corpse ? "corpse" : consumedItemId,
          energyRestored: restored,
          corpseRationsRemaining: corpse?.corpseRations,
          healthLost: corpseHealthLoss
        }
      };
      if (participant.character.position?.coord) {
        action.originLocation = participant.character.position.coord;
      }
      const target: ReplayActionTarget = {
        targetId: participant.playerId,
        effects: ReplayActionEffect.Heal,
        metadata: {
          consumedItemId: corpse ? "corpse" : consumedItemId,
          energyRestored: restored,
          corpseRationsRemaining: corpse?.corpseRations,
          healthLost: corpseHealthLoss
        }
      };
      this.clearPlan(participant);
      if (match.playerCharacters) {
        match.playerCharacters[participant.playerId] = participant.character;
      }
      events.push({
        kind: "player",
        actorId: participant.playerId,
        action,
        targets: [target],
      });
      if (healthEvent) {
        events.push(healthEvent);
      }
    }
    return events;
  }
}

const feedAction = new FeedAction();

export function executeFeedAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return feedAction.execute(participants, match);
}
