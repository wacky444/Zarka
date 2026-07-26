/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type { ActionId, ReplayActionDone, ReplayPlayerEvent } from "@shared";
import {
  resolvePlanDestination,
  type PlannedActionParticipant,
} from "./utils";
import { ActionLibrary, ExtraExecutionEffect } from "@shared";
import { axialDistance } from "../../utils/location";
import { getUsableExtraExecutions } from "../../utils/energy";
import { BaseAction } from "./classes/BaseAction";

export class MoveAction extends BaseAction {
  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];

    for (const entry of roster) {
      const actionId = entry.plan.actionId as ActionId;
      const destination = resolvePlanDestination(match, entry.plan);
      const originCoord = entry.character.position?.coord;
      if (!destination || !originCoord) {
        this.clearPlan(entry);
        continue;
      }
      const definition = ActionLibrary[actionId];
      let allowedRange =
        definition?.range && definition.range.length > 0 ? [...definition.range] : [0];
      const extraExecutions = getUsableExtraExecutions(
        entry.character,
        entry.plan,
        definition
      );
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
        this.clearPlan(entry);
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
      this.clearPlan(entry);
    }
    return events;
  }
}

const moveAction = new MoveAction();

export function executeMoveAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return moveAction.execute(participants, match);
}
