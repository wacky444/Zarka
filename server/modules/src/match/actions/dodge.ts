/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { ActionLibrary } from "@shared";
import type {
  ActionId,
  ReplayActionDone,
  ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../../models/types";
import { getUsableExtraExecutions } from "../../utils/energy";
import { BaseAction } from "./classes/BaseAction";
import type { PlannedActionParticipant } from "./utils";

export class DodgeAction extends BaseAction {
  protected processRoster(
    roster: PlannedActionParticipant[],
    _match: MatchRecord
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    for (const participant of roster) {
      const actionId = participant.plan.actionId as ActionId;
      if (!actionId) {
        this.clearPlan(participant);
        continue;
      }
      const extraAttempts = getUsableExtraExecutions(
        participant.character,
        participant.plan,
        ActionLibrary.dodge
      );
      const attempts = 1 + extraAttempts;
      const statuses = participant.character.statuses ?? { conditions: [] };
      statuses.dodgeAttempts = attempts;
      participant.character.statuses = statuses;
      this.clearPlan(participant);

      const action: ReplayActionDone = {
        actionId,
        metadata: { attempts }
      };
      if (participant.character.position?.coord) {
        action.originLocation = participant.character.position.coord;
      }
      events.push({
        kind: "player",
        actorId: participant.playerId,
        action
      });
    }
    return events;
  }
}

const dodgeAction = new DodgeAction();

export function executeDodgeAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return dodgeAction.execute(participants, match);
}
