/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  PlayerCharacter,
  PlayerPlannedAction,
  ReplayActionDone,
  ReplayPlayerEvent,
} from "@shared";

export interface MoveParticipant {
  playerId: string;
  character: PlayerCharacter;
  plan: PlayerPlannedAction;
}

function findDestination(match: MatchRecord, plan: PlayerPlannedAction) {
  const target = plan.targetLocationId;
  if (!target) {
    return undefined;
  }
  const tiles = match.map?.tiles ?? [];
  for (const entry of tiles) {
    if (entry.coord.q === target.q && entry.coord.r === target.r) {
      return {
        tileId: entry.id,
        coord: { q: target.q, r: target.r },
      };
    }
  }
  return {
    tileId: `hex_${target.q}_${target.r}`,
    coord: { q: target.q, r: target.r },
  };
}

function clearMainPlan(character: PlayerCharacter) {
  if (!character.actionPlan) {
    return;
  }
  delete character.actionPlan.main;
  if (
    character.actionPlan.secondary === undefined &&
    character.actionPlan.nextMain === undefined &&
    character.actionPlan.main === undefined
  ) {
    delete character.actionPlan;
  }
}

export function executeMoveAction(
  participants: MoveParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  const events: ReplayPlayerEvent[] = [];
  for (let i = participants.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = participants[i];
    participants[i] = participants[j];
    participants[j] = temp;
  }

  for (const entry of participants) {
    const destination = findDestination(match, entry.plan);
    if (!destination) {
      continue;
    }
    const previousPosition = entry.character.position;
    entry.character.position = {
      tileId: destination.tileId,
      coord: destination.coord,
    };
    const action: ReplayActionDone = {
      actionId: entry.plan.actionId as ActionId,
      targetLocation: destination.coord,
    };
    if (previousPosition?.coord) {
      action.originLocation = previousPosition.coord;
    }
    events.push({
      kind: "player",
      actorId: entry.playerId,
      action,
    });
    clearMainPlan(entry.character);
  }
  return events;
}
