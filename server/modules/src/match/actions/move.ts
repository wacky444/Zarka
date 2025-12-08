/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type { ActionId, ReplayActionDone, ReplayPlayerEvent } from "@shared";
import {
  clearPlanByKey,
  resolvePlanDestination,
  shuffleParticipants,
  type PlannedActionParticipant,
} from "./utils";
import { ActionLibrary } from "@shared";
import { axialDistance } from "../../utils/location";

export function executeMoveAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  const events: ReplayPlayerEvent[] = [];
  const roster = shuffleParticipants(participants);

  for (const entry of roster) {
    const actionId = entry.plan.actionId as ActionId;
    const destination = resolvePlanDestination(match, entry.plan);
    const originCoord = entry.character.position?.coord;
    if (!destination || !originCoord) {
      clearPlanByKey(entry.character, entry.planKey);
      continue;
    }
    const definition = ActionLibrary[actionId];
    const allowedRange =
      definition?.range && definition.range.length > 0 ? definition.range : [0];
    const distance = axialDistance(originCoord, destination.coord);
    if (allowedRange.indexOf(distance) === -1) {
      clearPlanByKey(entry.character, entry.planKey);
      continue;
    }
    const previousPosition = entry.character.position;
    entry.character.position = {
      tileId: destination.tileId,
      coord: destination.coord,
    };
    const action: ReplayActionDone = {
      actionId,
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
