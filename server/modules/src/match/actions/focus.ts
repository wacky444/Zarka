/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  PlayerCharacter,
  ReplayActionDone,
  ReplayActionTarget,
  ReplayPlayerEvent,
} from "@shared";
import { ReplayActionEffect } from "@shared";
import { clearPlanByKey, type PlannedActionParticipant } from "./utils";

const FOCUS_BASE_BONUS = 6;

function applyFocusBonus(character: PlayerCharacter, bonus: number): number {
  const stats = character.stats;
  if (!stats?.energy) {
    return 0;
  }
  const track = stats.energy;
  const previous =
    typeof track.temporary === "number" && isFinite(track.temporary)
      ? track.temporary
      : 0;
  const next = previous + bonus;
  track.temporary = next;
  return bonus;
}

export function executeFocusAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  const events: ReplayPlayerEvent[] = [];
  for (const participant of participants) {
    const actionId = participant.plan.actionId as ActionId;
    if (!actionId) {
      clearPlanByKey(participant.character, participant.planKey);
      continue;
    }
    const granted = applyFocusBonus(participant.character, FOCUS_BASE_BONUS);
    clearPlanByKey(participant.character, participant.planKey);
    if (match.playerCharacters) {
      match.playerCharacters[participant.playerId] = participant.character;
    }
    const action: ReplayActionDone = {
      actionId,
      effects: ReplayActionEffect.Heal,
      metadata: {
        energyBonus: granted,
      },
    };
    if (participant.character.position?.coord) {
      action.originLocation = participant.character.position.coord;
    }
    const target: ReplayActionTarget = {
      targetId: participant.playerId,
      effects: ReplayActionEffect.Heal,
      metadata: {
        energyBonus: granted,
      },
    };
    events.push({
      kind: "player",
      actorId: participant.playerId,
      action,
      targets: [target],
    });
  }
  return events;
}
