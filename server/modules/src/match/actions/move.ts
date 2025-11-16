/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  PlayerPlannedAction,
  ReplayActionDone,
  ReplayPlayerEvent,
} from "@shared";
import {
  clearPlanByKey,
  shuffleParticipants,
  type PlannedActionParticipant,
} from "./utils";

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

export function executeMoveAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  const events: ReplayPlayerEvent[] = [];
  const roster = shuffleParticipants(participants);

  for (const entry of roster) {
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
    clearPlanByKey(entry.character, entry.planKey);
  }
  return events;
}
