/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { ActionLibrary } from "@shared";
import type { ActionDefinition, ReplayEvent } from "@shared";
import type { MatchRecord } from "../models/types";
import { executeMoveAction, type MoveParticipant } from "./actions/move";
import {
  applyActionCooldown,
  updateCooldownsForTurn,
} from "./actions/cooldowns";

function sortedActions(): ActionDefinition[] {
  const keys = Object.keys(ActionLibrary) as Array<keyof typeof ActionLibrary>;
  const items: ActionDefinition[] = [];
  for (const key of keys) {
    items.push(ActionLibrary[key]);
  }
  items.sort((a, b) => {
    if (a.actionOrder === b.actionOrder) {
      return a.actionSubOrder - b.actionSubOrder;
    }
    return a.actionOrder - b.actionOrder;
  });
  return items;
}

export interface AdvanceTurnResult {
  events: ReplayEvent[];
}

export function advanceTurn(
  match: MatchRecord,
  resolvedTurn: number
): AdvanceTurnResult {
  if (!Array.isArray(match.players) || !match.playerCharacters) {
    return { events: [] };
  }
  const players = match.players.filter(
    (playerId) => !!match.playerCharacters?.[playerId]
  );
  if (players.length === 0) {
    return { events: [] };
  }
  updateCooldownsForTurn(match, resolvedTurn);
  const actions = sortedActions();
  const replayEvents: ReplayEvent[] = [];
  for (const action of actions) {
    if (action.id !== ActionLibrary.move.id) {
      continue;
    }
    const participants: MoveParticipant[] = [];
    for (const playerId of players) {
      const character = match.playerCharacters[playerId];
      if (!character || !character.actionPlan || !character.actionPlan.main) {
        continue;
      }
      if (character.actionPlan.main.actionId !== action.id) {
        continue;
      }
      participants.push({
        playerId,
        character,
        plan: character.actionPlan.main,
      });
    }
    if (participants.length === 0) {
      continue;
    }
    const moveEvents = executeMoveAction(participants, match);
    for (const participant of participants) {
      applyActionCooldown(
        participant.character,
        action.id,
        action.cooldown,
        resolvedTurn
      );
      match.playerCharacters[participant.playerId] = participant.character;
    }
    if (moveEvents.length) {
      replayEvents.push(...moveEvents);
    }
  }
  return { events: replayEvents };
}
