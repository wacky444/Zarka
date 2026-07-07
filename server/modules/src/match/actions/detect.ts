import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  ReplayActionDone,
  ReplayActionTarget,
  ReplayPlayerEvent,
} from "@shared";
import { ActionLibrary, ExtraExecutionEffect } from "@shared";
import { clearPlanByKey, type PlannedActionParticipant } from "./utils";
import { axialDistance } from "../../utils/location";

const BASE_MAX_RANGE = 1;

function buildAllowedRange(extraExecutions: number): number[] {
  const definition = ActionLibrary.detect;
  const fullRange =
    definition?.range && definition.range.length > 0
      ? [...definition.range]
      : [0];
  const hasAreaRangeEffect =
    definition?.extraExecution?.effectType ===
    ExtraExecutionEffect.IncreaseAreaRange;
  if (hasAreaRangeEffect && extraExecutions > 0) {
    return fullRange;
  }
  return fullRange.filter((d) => d <= BASE_MAX_RANGE);
}

export function executeDetectAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  const events: ReplayPlayerEvent[] = [];
  const roster = match.playerCharacters ?? {};

  for (const participant of participants) {
    const actionId = participant.plan.actionId as ActionId;
    if (!actionId) {
      clearPlanByKey(participant.character, participant.planKey);
      continue;
    }
    const actorCoord = participant.character.position?.coord;
    if (!actorCoord) {
      clearPlanByKey(participant.character, participant.planKey);
      continue;
    }
    const extraExecutions = participant.plan.extraExecutions ?? 0;
    const allowedRange = buildAllowedRange(extraExecutions);
    const targets: ReplayActionTarget[] = [];

    for (const playerId in roster) {
      if (!Object.prototype.hasOwnProperty.call(roster, playerId)) {
        continue;
      }
      if (playerId === participant.playerId) {
        continue;
      }
      const other = roster[playerId];
      const otherCoord = other?.position?.coord;
      if (!otherCoord) {
        continue;
      }
      const distance = axialDistance(actorCoord, otherCoord);
      if (allowedRange.indexOf(distance) === -1) {
        continue;
      }
      targets.push({
        targetId: playerId,
        metadata: {
          distance,
          sameLocation: distance === 0,
        },
      });
    }

    const action: ReplayActionDone = {
      actionId,
      originLocation: actorCoord,
      metadata: {
        detectedCount: targets.length,
        extraExecutions,
      },
    };

    clearPlanByKey(participant.character, participant.planKey);
    if (match.playerCharacters) {
      match.playerCharacters[participant.playerId] = participant.character;
    }

    events.push({
      kind: "player",
      actorId: participant.playerId,
      action,
      targets: targets.length > 0 ? targets : undefined,
      visibility: { scope: "limited", playerIds: [participant.playerId] },
    });
  }

  return events;
}
