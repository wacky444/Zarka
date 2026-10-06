import type { MatchRecord } from "../../models/types";
import {
  ActionLibrary,
  ItemCategory,
  ItemLibrary,
  MAX_STEAL_PRIORITY_ITEMS,
  getSkillRank,
  syncBandolierLoadCapacity,
  type ActionId,
  type ItemId,
  type PlayerCharacter,
  type PlayerItemStack,
  type ReplayActionDone,
  type ReplayActionTarget,
  type ReplayPlayerEvent,
} from "@shared";
import { getUsableExtraExecutions } from "../../utils/energy";
import { collectTargets, type TargetCandidate } from "./targeting";
import {
  isTargetProtected,
  type PlannedActionParticipant,
} from "./utils";
import { BaseAction } from "./classes/BaseAction";

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

function adjustLoad(character: PlayerCharacter, delta: number): void {
  if (!character.stats?.load || delta === 0) {
    return;
  }
  const current =
    typeof character.stats.load.current === "number" &&
    isFinite(character.stats.load.current)
      ? character.stats.load.current
      : 0;
  character.stats.load.current = Math.max(0, current + delta);
}

function addItem(
  character: PlayerCharacter,
  itemType: ItemId,
  weight: number
): void {
  const carriedItems = ensureCarriedItems(character);
  for (const stack of carriedItems) {
    if (stack.itemId !== itemType) {
      continue;
    }
    stack.quantity =
      typeof stack.quantity === "number" && isFinite(stack.quantity)
        ? stack.quantity + 1
        : 1;
    stack.weight =
      typeof stack.weight === "number" && isFinite(stack.weight)
        ? stack.weight + weight
        : weight;
    adjustLoad(character, weight);
    return;
  }
  carriedItems.push({ itemId: itemType, quantity: 1, weight });
  adjustLoad(character, weight);
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
    adjustLoad(character, -weight);
    return true;
  }
  return false;
}

function getCarriedItemTypes(character: PlayerCharacter): ItemId[] {
  const types: ItemId[] = [];
  for (const stack of ensureCarriedItems(character)) {
    if (
      typeof stack.itemId === "string" &&
      ItemLibrary[stack.itemId as ItemId]?.canBeStolen !== false &&
      stack.itemId.length > 0 &&
      typeof stack.quantity === "number" &&
      stack.quantity > 0
    ) {
      types.push(stack.itemId as ItemId);
    }
  }
  return types;
}

function isStealPriorityItem(itemType: string): itemType is ItemId {
  const definition = ItemLibrary[itemType as ItemId];
  return (
    definition !== undefined &&
    definition.category !== ItemCategory.Special &&
    definition.canBeStolen !== false
  );
}

function collectStealTarget(
  actionId: ActionId,
  participant: PlannedActionParticipant,
  match: MatchRecord,
  targetPlayerId: string | undefined
): TargetCandidate | undefined {
  const targetParticipant: PlannedActionParticipant = {
    ...participant,
    plan: {
      ...participant.plan,
      targetPlayerIds: targetPlayerId ? [targetPlayerId] : []
    }
  };
  return collectTargets(actionId, targetParticipant, match, {
    deadCharacterPolicy: "include",
    allowMultiple: false
  })[0];
}

function getKnownCarriedItemTypes(
  actor: PlayerCharacter,
  targetId: string,
  carriedTypes: ItemId[]
): ItemId[] {
  const revealed = actor.revealedItemTypesByPlayerId?.[targetId];
  if (!Array.isArray(revealed) || revealed.length === 0) {
    return [];
  }
  const known: ItemId[] = [];
  for (const itemType of carriedTypes) {
    if (revealed.indexOf(itemType) !== -1) {
      known.push(itemType);
    }
  }
  return known;
}

function chooseItemType(
  actor: PlayerCharacter,
  targetId: string,
  target: PlayerCharacter,
  canSpecifyUnknownItem: boolean,
  requestedItemTypes: string[] = []
): ItemId | null {
  const carriedTypes = getCarriedItemTypes(target);
  if (carriedTypes.length === 0) {
    return null;
  }
  if (canSpecifyUnknownItem) {
    for (const requestedItemType of requestedItemTypes) {
      if (carriedTypes.indexOf(requestedItemType as ItemId) !== -1) {
        return requestedItemType as ItemId;
      }
    }
    if (requestedItemTypes.length > 0) {
      return carriedTypes[Math.floor(Math.random() * carriedTypes.length)] ?? null;
    }
  }
  const knownTypes = getKnownCarriedItemTypes(actor, targetId, carriedTypes);
  const choices = knownTypes.length > 0 ? knownTypes : carriedTypes;
  return choices[Math.floor(Math.random() * choices.length)] ?? null;
}

export class StealAction extends BaseAction {
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

      const canSpecifyUnknownItem =
        getSkillRank(participant.character, "dexterity2") > 0;
      const requestedItemTypes =
        canSpecifyUnknownItem && Array.isArray(participant.plan.targetItemIds)
          ? participant.plan.targetItemIds
              .slice(0, MAX_STEAL_PRIORITY_ITEMS)
              .filter(isStealPriorityItem)
          : [];
      const requestedSecondItemTypes =
        canSpecifyUnknownItem &&
        Array.isArray(participant.plan.secondTargetItemIds)
          ? participant.plan.secondTargetItemIds
              .slice(0, MAX_STEAL_PRIORITY_ITEMS)
              .filter(isStealPriorityItem)
          : [];
      const extraExecutions = getUsableExtraExecutions(
        participant.character,
        participant.plan,
        ActionLibrary.steal
      );
      const stealCount = 1 + extraExecutions;
      const requestedTargetPlayerId = participant.plan.targetPlayerIds?.[0];
      const requestedSecondTargetPlayerId =
        participant.plan.secondTargetPlayerId;
      let firstTargetCandidate: TargetCandidate | undefined;
      let secondTargetCandidate: TargetCandidate | undefined;
      let blockedByProtection = false;
      let targetHadNoMoreItems = false;
      const stolenItems: ItemId[] = [];
      const targetResults = new Map<
        string,
        { candidate: TargetCandidate; stolenItems: ItemId[] }
      >();

      for (let index = 0; index < stealCount; index += 1) {
        const targetPlayerId =
          index === 0
            ? requestedTargetPlayerId
            : requestedSecondTargetPlayerId ??
              firstTargetCandidate?.id ??
              requestedTargetPlayerId;
        const candidate = collectStealTarget(
          actionId,
          participant,
          match,
          targetPlayerId
        );
        if (index === 0) {
          firstTargetCandidate = candidate;
        } else {
          secondTargetCandidate = candidate;
        }
        if (!candidate) {
          continue;
        }

        if (isTargetProtected(candidate.character)) {
          blockedByProtection = true;
          continue;
        }
        const result = targetResults.get(candidate.id) ?? {
          candidate,
          stolenItems: []
        };
        targetResults.set(candidate.id, result);

        const itemPriorities = index === 0
          ? requestedItemTypes
          : requestedSecondItemTypes;
        const itemType = chooseItemType(
          participant.character,
          candidate.id,
          candidate.character,
          canSpecifyUnknownItem,
          itemPriorities
        );
        if (!itemType) {
          targetHadNoMoreItems = true;
          continue;
        }
        const weight = itemWeight(itemType);
        if (!removeItem(candidate.character, itemType, weight)) {
          targetHadNoMoreItems = true;
          continue;
        }
        addItem(participant.character, itemType, weight);
        stolenItems.push(itemType);
        result.stolenItems.push(itemType);
        match.playerCharacters![candidate.id] = candidate.character;
      }

      for (const { candidate } of targetResults.values()) {
        syncBandolierLoadCapacity(candidate.character);
      }
      syncBandolierLoadCapacity(participant.character);
      this.clearPlan(participant);
      match.playerCharacters![participant.playerId] = participant.character;

      const metadata: Record<string, unknown> = {
        targetPlayerId: firstTargetCandidate?.id,
        targetPlayerIds: [...targetResults.keys()],
        secondTargetPlayerId: secondTargetCandidate?.id,
        stolenCount: stolenItems.length,
        stolenItems: stolenItems.map((itemType) => ({ itemType })),
        extraExecutions
      };
      if (blockedByProtection) {
        metadata.blockedByProtection = true;
      }
      if (targetHadNoMoreItems) {
        metadata.targetHadNoMoreItems = true;
      }

      const action: ReplayActionDone = {
        actionId,
        originLocation: participant.character.position?.coord,
        targetLocation: firstTargetCandidate?.coord,
        metadata
      };
      const replayEvent: ReplayPlayerEvent = {
        kind: "player",
        actorId: participant.playerId,
        action
      };
      if (targetResults.size > 0) {
        replayEvent.targets = [...targetResults.values()].map(
          ({ candidate, stolenItems: targetStolenItems }) => {
            const replayTarget: ReplayActionTarget = {
              targetId: candidate.id,
              metadata: {
                stolenCount: targetStolenItems.length,
                stolenItems: targetStolenItems.map((itemType) => ({ itemType }))
              }
            };
            return replayTarget;
          }
        );
      }
      events.push(replayEvent);
    }

    return events;
  }
}

const stealAction = new StealAction();

export function executeStealAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return stealAction.execute(participants, match);
}
