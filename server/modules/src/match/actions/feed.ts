/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import {
  ActionLibrary,
  extractCarriedItem,
  getSkillEffectTotal,
  ReplayActionEffect,
  syncBandolierLoadCapacity,
  type ActionId,
  type ItemId,
  type PlayerCharacter,
  type ReplayActionDone,
  type ReplayActionTarget,
  type ReplayPlayerEvent,
} from "@shared";
import {
  applyHealthDelta,
  consumeCarriedItem,
  mergeCharacterState,
  type PlannedActionParticipant
} from "./utils";
import { collectTargets } from "./targeting";
import { BaseAction } from "./classes/BaseAction";
import {
  applyPoisonedServingOutcome,
  consumePoisonedServing,
  extractPoisonedServing,
  type PoisonedFoodOutcome,
} from "./intoxication";
import { getUsableExtraExecutions } from "../../utils/energy";
import { isCharacterDead } from "../../utils/playerCharacter";
import { areSameLocation } from "../../utils/location";

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
  if (!tileId) {
    return null;
  }
  const participant: PlannedActionParticipant = {
    playerId: character.id,
    character,
    plan: { actionId: "feed" },
    planKey: "secondary",
  };
  const candidate = collectTargets("feed", participant, match, {
    deadCharacterPolicy: "onlyDead",
    allowMultiple: false,
    filter: (target) =>
      target.character.position?.tileId === tileId &&
      getCorpseRations(target.character) > 0,
  })[0];
  return candidate?.character ?? null;
}

function canEatCorpse(character: PlayerCharacter, match: MatchRecord): boolean {
  const corpse = findCorpse(character, match);
  if (!corpse) {
    return false;
  }
  const hasCannibalSkill =
    getSkillEffectTotal(character, "corpse_consumption") > 0;
  const currentEnergy = character.stats?.energy?.current;
  const hasCurrentEnergy =
    typeof currentEnergy === "number" &&
    isFinite(currentEnergy) &&
    currentEnergy > 0;
  return hasCannibalSkill || !hasCurrentEnergy;
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

function consumeFeedItem(character: PlayerCharacter): { itemId: ItemId; poisonedBy?: string } | null {
  for (let i = 0; i < FEED_ITEM_PRIORITY.length; i += 1) {
    const candidateId = FEED_ITEM_PRIORITY[i];
    const extracted = extractCarriedItem(character, candidateId, 1, { preferPoisoned: true });
    if (extracted) {
      return { itemId: candidateId, poisonedBy: extracted.metadata?.poisonedBy };
    }
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
    syncBandolierLoadCapacity(corpse);
  }
  return corpse;
}

function isSameCell(a: PlayerCharacter, b: PlayerCharacter): boolean {
  if (areSameLocation(a.position?.coord, b.position?.coord)) {
    return true;
  }
  if (
    a.position?.tileId &&
    b.position?.tileId &&
    a.position.tileId === b.position.tileId
  ) {
    return true;
  }
  return false;
}

function resolveFeedRecipient(
  participant: PlannedActionParticipant,
  match: MatchRecord
): { recipient: PlayerCharacter; isTargetingOther: boolean } {
  const requestedTargetId = participant.plan.targetPlayerIds?.[0];
  if (
    requestedTargetId &&
    requestedTargetId !== participant.playerId &&
    match.playerCharacters
  ) {
    const candidate = match.playerCharacters[requestedTargetId];
    if (
      candidate &&
      !isCharacterDead(candidate) &&
      isSameCell(participant.character, candidate)
    ) {
      return { recipient: candidate, isTargetingOther: true };
    }
  }
  return { recipient: participant.character, isTargetingOther: false };
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
      const { recipient, isTargetingOther } = resolveFeedRecipient(
        participant,
        match
      );
      const recipientId = isTargetingOther ? recipient.id : participant.playerId;
      const extraExecutions = getUsableExtraExecutions(
        participant.character,
        participant.plan,
        ActionLibrary.feed
      );
      const totalReps = 1 + extraExecutions;
      let totalEnergyRestored = 0;
      let totalHealthLost = 0;
      let consumedAnyPoison = false;
      let intoxicationStarted = false;
      let lastOverdose: string | null = null;
      let lastCorpseRationsRemaining: number | null = null;
      const consumedItemIds: (ItemId | "corpse")[] = [];
      const healthEvents: ReplayPlayerEvent[] = [];

      for (let rep = 0; rep < totalReps; rep += 1) {
        const consumed = consumeFeedItem(participant.character);
        const consumedItemId = consumed?.itemId ?? null;
        const corpse =
          consumedItemId || isTargetingOther
            ? null
            : canEatCorpse(participant.character, match)
              ? consumeCorpse(participant.character, match)
              : null;
        if (!consumedItemId && !corpse) {
          break;
        }
        consumedItemIds.push(corpse ? "corpse" : consumedItemId!);
        const energyGain = corpse ? 20 : getEnergyGain(consumedItemId!);
        const restored = applyEnergy(recipient, energyGain);
        totalEnergyRestored += restored;
        if (consumedItemId) {
          let poisonOutcome: PoisonedFoodOutcome;
          if (consumed?.poisonedBy) {
            poisonOutcome = applyPoisonedServingOutcome(recipient, consumed.poisonedBy);
          } else if (recipient === participant.character) {
            poisonOutcome = consumePoisonedServing(participant.character);
          } else {
            const legacyPoisonOwner = extractPoisonedServing(participant.character);
            poisonOutcome =
              legacyPoisonOwner !== null
                ? applyPoisonedServingOutcome(recipient, legacyPoisonOwner)
                : { consumedPoison: false, intoxicationStarted: false };
          }
          if (poisonOutcome.consumedPoison) consumedAnyPoison = true;
          if (poisonOutcome.intoxicationStarted) intoxicationStarted = true;
          if (poisonOutcome.overdose) lastOverdose = poisonOutcome.overdose;
          if (poisonOutcome.healthEvent) healthEvents.push(poisonOutcome.healthEvent);
        }
        const corpseHealthLoss = corpse
          ? getSkillEffectTotal(participant.character, "corpse_consumption") > 0
            ? 0
            : 1
          : 0;
        if (corpse) {
          lastCorpseRationsRemaining = corpse.corpseRations ?? null;
          if (corpseHealthLoss > 0) {
            totalHealthLost += corpseHealthLoss;
            const healthOutcome = applyHealthDelta(participant.character, -corpseHealthLoss);
            mergeCharacterState(participant.character, healthOutcome.character);
            if (healthOutcome.event) healthEvents.push(healthOutcome.event);
          }
        }
        if (isCharacterDead(participant.character) || isCharacterDead(recipient)) {
          break;
        }
      }

      if (consumedItemIds.length === 0) {
        this.clearPlan(participant);
        if (match.playerCharacters) {
          match.playerCharacters[participant.playerId] = participant.character;
        }
        continue;
      }

      const action: ReplayActionDone = {
        actionId,
        effects: ReplayActionEffect.Heal,
        metadata: {
          consumedItemId: consumedItemIds[0],
          consumedItems: consumedItemIds,
          energyRestored: totalEnergyRestored,
          corpseRationsRemaining: lastCorpseRationsRemaining,
          healthLost: totalHealthLost,
          consumedPoison: consumedAnyPoison,
          intoxicationStarted,
          overdose: lastOverdose,
          ...(isTargetingOther ? { targetPlayerId: recipientId } : {}),
          ...(extraExecutions > 0 ? { extraExecutions } : {}),
        }
      };
      if (participant.character.position?.coord) {
        action.originLocation = participant.character.position.coord;
      }
      const target: ReplayActionTarget = {
        targetId: recipientId,
        effects: ReplayActionEffect.Heal,
        metadata: {
          consumedItemId: consumedItemIds[0],
          consumedItems: consumedItemIds,
          energyRestored: totalEnergyRestored,
          corpseRationsRemaining: lastCorpseRationsRemaining,
          healthLost: totalHealthLost,
          ...(extraExecutions > 0 ? { extraExecutions } : {}),
        }
      };
      this.clearPlan(participant);
      if (match.playerCharacters) {
        match.playerCharacters[participant.playerId] = participant.character;
        if (isTargetingOther) {
          match.playerCharacters[recipientId] = recipient;
        }
      }
      events.push({
        kind: "player",
        importance: 1,
        actorId: participant.playerId,
        action,
        targets: [target],
      });
      events.push(...healthEvents);
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
