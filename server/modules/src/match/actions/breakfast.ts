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
import {
  clearPlanByKey,
  shuffleParticipants,
  type PlannedActionParticipant,
} from "./utils";

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

export function executeBreakfastAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  const roster = shuffleParticipants(participants);
  const events: ReplayPlayerEvent[] = [];
  for (const participant of roster) {
    const actionId = participant.plan.actionId as ActionId;
    if (!actionId) {
      clearPlanByKey(participant.character, participant.planKey);
      if (match.playerCharacters) {
        match.playerCharacters[participant.playerId] = participant.character;
      }
      continue;
    }
    const restored = applyEnergy(participant.character, 20);
    const action: ReplayActionDone = {
      actionId,
      effects: ReplayActionEffect.Heal,
      metadata: { energyRestored: restored },
    };
    if (participant.character.position?.coord) {
      action.originLocation = participant.character.position.coord;
    }
    const target: ReplayActionTarget = {
      targetId: participant.playerId,
      effects: ReplayActionEffect.Heal,
      metadata: { energyRestored: restored },
    };
    clearPlanByKey(participant.character, participant.planKey);
    if (match.playerCharacters) {
      match.playerCharacters[participant.playerId] = participant.character;
    }
    events.push({
      kind: "player",
      actorId: participant.playerId,
      action,
      targets: [target],
    });
  }
  return events;
}
