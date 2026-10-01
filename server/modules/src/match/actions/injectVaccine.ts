import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  ReplayActionDone,
  ReplayActionTarget,
  ReplayPlayerEvent,
} from "@shared";
import {
  collectPlanTargetIds,
  consumeCarriedItem,
  createFailedActionEvent,
  type PlannedActionParticipant,
} from "./utils";
import { BaseAction } from "./classes/BaseAction";

function grantVaccineImmunity(
  character: PlannedActionParticipant["character"]
): void {
  const statuses = character.statuses ?? { conditions: [] };
  character.statuses = {
    ...statuses,
    vaccine: {
      ...(statuses.vaccine ?? {}),
      immune: true,
    },
  };
}

export class InjectVaccineAction extends BaseAction {
  protected override readonly shouldShuffleParticipants = false;

  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    for (const participant of roster) {
      const actionId = participant.plan.actionId as ActionId;
      if (!actionId) {
        this.clearPlan(participant);
        continue;
      }

      const targetId = collectPlanTargetIds(participant, match, {
        deadCharacterPolicy: "exclude",
      })[0];
      const target = targetId
        ? match.playerCharacters?.[targetId]
        : undefined;
      const origin = participant.character.position?.coord;
      const targetCoord = target?.position?.coord;
      const sameLocation =
        !!origin &&
        !!targetCoord &&
        origin.q === targetCoord.q &&
        origin.r === targetCoord.r;

      if (!target || !sameLocation) {
        this.clearPlan(participant);
        events.push(
          createFailedActionEvent(participant, actionId, {
            reason: "invalid_target",
          })
        );
        match.playerCharacters![participant.playerId] = participant.character;
        continue;
      }
      if (!consumeCarriedItem(participant.character, "vaccine")) {
        this.clearPlan(participant);
        events.push(
          createFailedActionEvent(participant, actionId, {
            reason: "missing_item",
            missingItemId: "vaccine",
          })
        );
        match.playerCharacters![participant.playerId] = participant.character;
        continue;
      }

      grantVaccineImmunity(target);
      this.clearPlan(participant);
      match.playerCharacters![participant.playerId] = participant.character;
      match.playerCharacters![targetId] = target;
      const targetEntry: ReplayActionTarget = {
        targetId,
        metadata: { vaccinated: true },
      };
      const action: ReplayActionDone = {
        actionId,
        originLocation: origin,
        targetLocation: targetCoord,
        metadata: {
          consumedItemId: "vaccine",
          vaccinatedTargetId: targetId,
        },
      };
      events.push({
        kind: "player",
        actorId: participant.playerId,
        action,
        targets: [targetEntry],
      });
    }
    return events;
  }
}

const injectVaccineAction = new InjectVaccineAction();

export function executeInjectVaccineAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return injectVaccineAction.execute(participants, match);
}
