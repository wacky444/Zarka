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
import { clearMainPlan, type PlannedActionParticipant } from "./utils";

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

function applyHealing(character: PlayerCharacter, amount: number): number {
  const health = character.stats?.health;
  if (!health) {
    return 0;
  }
  const max = typeof health.max === "number" ? health.max : health.current;
  const previous = typeof health.current === "number" ? health.current : 0;
  const next = Math.min(max, previous + amount);
  health.current = next;
  return next - previous;
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
      clearMainPlan(participant.character);
      continue;
    }
    const restored = applyHealing(participant.character, 2);
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
    clearMainPlan(participant.character);
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
