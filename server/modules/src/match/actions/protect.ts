/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  PlayerCharacter,
  PlayerConditionFlag,
  PlayerStatusState,
  ReplayActionDone,
  ReplayActionEffectMask,
  ReplayActionTarget,
  ReplayPlayerEvent,
} from "@shared";
import { ReplayActionEffect } from "@shared";
import {
  clearPlanByKey,
  collectPlanTargetIds,
  shuffleParticipants,
  type PlannedActionParticipant,
} from "./utils";

function ensureStatusState(character: PlayerCharacter): PlayerStatusState {
  if (!character.statuses) {
    character.statuses = { conditions: [] } as PlayerStatusState;
  } else if (!character.statuses.conditions) {
    character.statuses.conditions = [] as PlayerConditionFlag[];
  }
  return character.statuses;
}

function applyProtection(character: PlayerCharacter): boolean {
  const statuses = ensureStatusState(character);
  const conditions = statuses.conditions ?? [];
  if (conditions.indexOf("protected") !== -1) {
    statuses.conditions = conditions;
    return false;
  }
  conditions.push("protected");
  statuses.conditions = conditions;
  return true;
}

function guardEffectMask(): ReplayActionEffectMask {
  return ReplayActionEffect.Guard;
}

export function executeProtectAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  const roster = shuffleParticipants(participants);

  const events: ReplayPlayerEvent[] = [];
  for (const participant of roster) {
    const actionId = participant.plan.actionId as ActionId;
    if (!actionId) {
      clearPlanByKey(participant.character, participant.planKey);
      continue;
    }
    const targets = collectPlanTargetIds(participant, match);
    const appliedTargets: ReplayActionTarget[] = [];
    for (const targetId of targets) {
      const target = match.playerCharacters?.[targetId];
      if (!target) {
        continue;
      }
      applyProtection(target);
      match.playerCharacters[targetId] = target;
      appliedTargets.push({
        targetId,
        effects: guardEffectMask(),
      });
    }
    clearPlanByKey(participant.character, participant.planKey);
    if (appliedTargets.length === 0) {
      continue;
    }
    const action: ReplayActionDone = {
      actionId,
    };
    if (participant.character.position?.coord) {
      action.originLocation = participant.character.position.coord;
    }
    if (participant.plan.targetLocationId) {
      action.targetLocation = participant.plan.targetLocationId;
    }
    action.effects = guardEffectMask();
    events.push({
      kind: "player",
      actorId: participant.playerId,
      action,
      targets: appliedTargets,
    });
  }
  return events;
}
