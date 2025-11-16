import type { MatchRecord } from "../../models/types";
import {
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
  clearPlanByKey,
  collectPlanTargetIds,
  mergeCharacterState,
  type PlannedActionParticipant,
} from "./utils";

function hasBandage(character: PlayerCharacter): number {
  const stacks = character.inventory?.carriedItems;
  if (!Array.isArray(stacks)) {
    return -1;
  }
  for (let index = 0; index < stacks.length; index += 1) {
    const stack = stacks[index];
    if (!stack || typeof stack.itemId !== "string") {
      continue;
    }
    if ((stack.itemId as ItemId) !== "bandage") {
      continue;
    }
    const quantity =
      typeof stack.quantity === "number" && isFinite(stack.quantity)
        ? Math.max(0, Math.floor(stack.quantity))
        : 0;
    if (quantity <= 0) {
      continue;
    }
    return index;
  }
  return -1;
}

function computePerItemWeight(totalWeight: number, quantity: number): number {
  if (!isFinite(totalWeight) || quantity <= 0) {
    return 0;
  }
  return totalWeight / quantity;
}

function consumeBandage(character: PlayerCharacter): boolean {
  const stacks = character.inventory?.carriedItems;
  if (!Array.isArray(stacks)) {
    return false;
  }
  const index = hasBandage(character);
  if (index === -1) {
    return false;
  }
  const stack = stacks[index];
  const quantity =
    typeof stack.quantity === "number" && isFinite(stack.quantity)
      ? Math.max(0, Math.floor(stack.quantity))
      : 0;
  if (quantity <= 0) {
    stacks.splice(index, 1);
    return false;
  }
  const definition = ItemLibrary.bandage;
  const fallbackWeight = typeof stack.weight === "number" ? stack.weight : 0;
  const perItemWeight =
    computePerItemWeight(fallbackWeight, quantity) ||
    (definition && typeof definition.weight === "number"
      ? definition.weight
      : 0);
  const load = character.stats?.load;
  if (load && typeof load.current === "number") {
    load.current = Math.max(0, load.current - perItemWeight);
  }
  if (quantity === 1) {
    stacks.splice(index, 1);
  } else {
    stack.quantity = quantity - 1;
    if (typeof stack.weight === "number") {
      stack.weight = Math.max(0, stack.weight - perItemWeight);
    } else if (perItemWeight > 0) {
      stack.weight = perItemWeight * (stack.quantity ?? 0);
    }
  }
  return true;
}

export function executeUseBandageAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  const roster = participants.slice();
  const events: ReplayPlayerEvent[] = [];
  for (const participant of roster) {
    const actionId = participant.plan.actionId as ActionId;
    if (!actionId) {
      clearPlanByKey(participant.character, participant.planKey);
      continue;
    }
    const hadBandage = consumeBandage(participant.character);
    if (!hadBandage) {
      clearPlanByKey(participant.character, participant.planKey);
      if (match.playerCharacters) {
        match.playerCharacters[participant.playerId] = participant.character;
      }
      continue;
    }
    const targets = collectPlanTargetIds(participant, match);
    const appliedTargets: ReplayActionTarget[] = [];
    for (const targetId of targets) {
      const target = match.playerCharacters?.[targetId];
      if (!target) {
        continue;
      }
      const { result: healthChange, character: updatedTarget } =
        applyHealthDelta(target, 5);
      mergeCharacterState(target, updatedTarget);
      const healed = Math.max(0, healthChange.delta);
      match.playerCharacters[targetId] = target;
      appliedTargets.push({
        targetId,
        effects: ReplayActionEffect.Heal,
        metadata: {
          healed,
        },
      });
    }
    clearPlanByKey(participant.character, participant.planKey);
    if (match.playerCharacters) {
      match.playerCharacters[participant.playerId] = participant.character;
    }
    if (appliedTargets.length === 0) {
      continue;
    }
    const action: ReplayActionDone = {
      actionId,
      effects: ReplayActionEffect.Heal,
      metadata: {
        consumedItemId: "bandage",
      },
    };
    if (participant.character.position?.coord) {
      action.originLocation = participant.character.position.coord;
    }
    events.push({
      kind: "player",
      actorId: participant.playerId,
      action,
      targets: appliedTargets,
    });
  }
  return events;
}
