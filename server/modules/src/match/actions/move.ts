/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type { ActionId, ReplayActionDone, ReplayPlayerEvent } from "@shared";
import {
  clearPlanByKey,
  resolvePlanDestination,
  shuffleParticipants,
  type PlannedActionParticipant,
} from "./utils";
import { ActionLibrary, ExtraExecutionEffect } from "@shared";
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
    let allowedRange =
      definition?.range && definition.range.length > 0 ? [...definition.range] : [0];
    const extraExecutions = entry.plan.extraExecutions ?? 0;
    if (
      definition?.extraExecution &&
      definition.extraExecution.effectType === ExtraExecutionEffect.IncreaseRange &&
      extraExecutions > 0
    ) {
      const maxRange = Math.max(...allowedRange) + extraExecutions;
      const minRange = Math.min(...allowedRange);
      const newAllowed: number[] = [];
      for (let r = minRange; r <= maxRange; r++) {
        newAllowed.push(r);
      }
      allowedRange = newAllowed;
    }
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
