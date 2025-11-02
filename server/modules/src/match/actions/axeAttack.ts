/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  PlayerCharacter,
  ReplayActionDone,
  ReplayActionEffectMask,
  ReplayActionTarget,
  ReplayPlayerEvent,
} from "@shared";
import { ReplayActionEffect } from "@shared";
import {
  applyHealthDelta,
  clearPlanByKey,
  mergeCharacterState,
  type PlannedActionParticipant,
} from "./utils";
import { collectTargets } from "./targeting";

function isGuarded(target: PlayerCharacter): boolean {
  const statuses = target.statuses;
  if (!statuses?.conditions) {
    return false;
  }
  return statuses.conditions.indexOf("protected") !== -1;
}

function resolveDamage(baseDamage: number, guarded: boolean): number {
  if (!guarded) {
    return baseDamage;
  }
  const reduction = Math.ceil(baseDamage / 3);
  const dealt = baseDamage - reduction;
  return dealt > 0 ? dealt : 0;
}

function resolveTargetEffects(guarded: boolean): ReplayActionEffectMask {
  let mask = ReplayActionEffect.Hit;
  if (guarded) {
    mask |= ReplayActionEffect.Guard;
  }
  return mask;
}

export function executeAxeAttackAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  const roster = participants.slice();
  for (let i = roster.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = roster[i];
    roster[i] = roster[j];
    roster[j] = tmp;
  }

  const events: ReplayPlayerEvent[] = [];
  for (const participant of roster) {
    const actionId = participant.plan.actionId as ActionId;
    if (!actionId) {
      clearPlanByKey(participant.character, participant.planKey);
      continue;
    }
    const targets = collectTargets(actionId, participant, match);
    const targetEntries: ReplayActionTarget[] = [];
    let totalDamage = 0;
    const postEvents: ReplayPlayerEvent[] = [];
    for (const targetCandidate of targets) {
      const targetId = targetCandidate.id;
      const target = match.playerCharacters?.[targetId];
      if (!target) {
        continue;
      }
      const guarded = isGuarded(target);
      const baseDamage = 8;
      const dealtAmount = resolveDamage(baseDamage, guarded);
      const {
        result: healthChange,
        character: updatedTarget,
        event,
      } = applyHealthDelta(target, -dealtAmount);
      mergeCharacterState(target, updatedTarget);
      match.playerCharacters[targetId] = target;
      if (event) {
        postEvents.push(event);
      }
      const applied = Math.max(0, -healthChange.delta);
      if (applied <= 0) {
        continue;
      }
      totalDamage += applied;
      const eliminated =
        healthChange.current === 0 && healthChange.previous > 0;
      const targetEntry: ReplayActionTarget = {
        targetId,
        damageTaken: applied,
        effects: resolveTargetEffects(guarded),
      };
      if (eliminated) {
        targetEntry.eliminated = true;
      }
      targetEntries.push(targetEntry);
    }
    clearPlanByKey(participant.character, participant.planKey);
    if (targetEntries.length === 0) {
      continue;
    }
    const action: ReplayActionDone = {
      actionId,
      damageDealt: totalDamage,
      effects: ReplayActionEffect.Hit,
    };
    if (participant.character.position?.coord) {
      action.originLocation = participant.character.position.coord;
    }
    if (participant.plan.targetLocationId) {
      action.targetLocation = participant.plan.targetLocationId;
    }
    events.push({
      kind: "player",
      actorId: participant.playerId,
      action,
      targets: targetEntries,
    });
    if (postEvents.length > 0) {
      events.push(...postEvents);
    }
  }
  return events;
}
