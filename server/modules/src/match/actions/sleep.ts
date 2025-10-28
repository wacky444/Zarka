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
  applyHealthDelta,
  clearPlanByKey,
  mergeCharacterState,
  type PlannedActionParticipant,
} from "./utils";

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

export function executeSleepAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  const roster = shuffle(participants.slice());
  const events: ReplayPlayerEvent[] = [];
  for (const participant of roster) {
    const actionId = participant.plan.actionId as ActionId;
    if (!actionId) {
      clearPlanByKey(participant.character, participant.planKey);
      continue;
    }
    const { result: healthChange, character: updatedCharacter } =
      applyHealthDelta(participant.character, 2);
    mergeCharacterState(participant.character, updatedCharacter);
    const restored = Math.max(0, healthChange.delta);
    const action: ReplayActionDone = {
      actionId,
      effects: ReplayActionEffect.Heal,
      metadata: { healed: restored },
    };
    if (participant.character.position?.coord) {
      action.originLocation = participant.character.position.coord;
    }
    const target: ReplayActionTarget = {
      targetId: participant.playerId,
      effects: ReplayActionEffect.Heal,
      metadata: { healed: restored },
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
