/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { ActionLibrary, type ActionDefinition } from "@shared";
import type { MatchRecord } from "../models/types";
import { executeMoveAction, type MoveParticipant } from "./actions/move";

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

export function advanceTurn(match: MatchRecord) {
  if (!Array.isArray(match.players) || !match.playerCharacters) {
    return;
  }
  const players = match.players.filter(
    (playerId) => !!match.playerCharacters?.[playerId]
  );
  if (players.length === 0) {
    return;
  }
  const actions = sortedActions();
  for (const action of actions) {
    if (action.id !== "move") {
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
    executeMoveAction(participants, match);
  }
}
