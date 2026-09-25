import type { MatchRecord } from "../../models/types";
import {
  ActionLibrary,
  ItemLibrary,
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
import { collectTargets } from "./targeting";
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

      const targetCandidate = collectTargets(actionId, participant, match, {
        allowMultiple: false,
      })[0];
      const target =
        targetCandidate && !isTargetProtected(targetCandidate.character)
          ? targetCandidate
          : undefined;
      const blockedByProtection =
        targetCandidate !== undefined && target === undefined;
      const canSpecifyUnknownItem =
        getSkillRank(participant.character, "dexterity2") > 0;
      const requestedItemTypes =
        canSpecifyUnknownItem && Array.isArray(participant.plan.targetItemIds)
          ? participant.plan.targetItemIds.filter(
              (itemType): itemType is string =>
                typeof itemType === "string" && itemType.length > 0
            )
          : [];
      const extraExecutions = getUsableExtraExecutions(
        participant.character,
        participant.plan,
        ActionLibrary.steal
      );
      const stealCount = 1 + extraExecutions;
      const stolenItems: ItemId[] = [];
      let targetId: string | undefined;

      if (target) {
        targetId = target.id;
        for (let index = 0; index < stealCount; index += 1) {
          const itemType = chooseItemType(
            participant.character,
            target.id,
            target.character,
            canSpecifyUnknownItem,
            index === 0 ? requestedItemTypes : []
          );
          if (!itemType) {
            break;
          }
          const weight = itemWeight(itemType);
          if (!removeItem(target.character, itemType, weight)) {
            break;
          }
          addItem(participant.character, itemType, weight);
          stolenItems.push(itemType);
        }
        syncBandolierLoadCapacity(target.character);
        syncBandolierLoadCapacity(participant.character);
        match.playerCharacters![target.id] = target.character;
      }

      this.clearPlan(participant);
      match.playerCharacters![participant.playerId] = participant.character;

      const metadata: Record<string, unknown> = {
        targetPlayerId: targetId ?? targetCandidate?.id,
        stolenCount: stolenItems.length,
        stolenItems: stolenItems.map((itemType) => ({ itemType })),
        extraExecutions,
      };
      if (blockedByProtection) {
        metadata.blockedByProtection = true;
      }
      if (target && stolenItems.length < stealCount) {
        metadata.targetHadNoMoreItems = true;
      }

      const action: ReplayActionDone = {
        actionId,
        originLocation: participant.character.position?.coord,
        targetLocation: targetCandidate?.coord,
        metadata,
      };
      const replayEvent: ReplayPlayerEvent = {
        kind: "player",
        actorId: participant.playerId,
        action,
      };
      if (target) {
        const replayTarget: ReplayActionTarget = {
          targetId: target.id,
          metadata: {
            stolenCount: stolenItems.length,
            stolenItems: stolenItems.map((itemType) => ({ itemType })),
          },
        };
        replayEvent.targets = [replayTarget];
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
