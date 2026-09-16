import type { MatchRecord } from "../../models/types";
import {
  ActionLibrary,
  ExtraExecutionEffect,
  type ActionId,
  type Axial,
  type ReplayActionDone,
  type ReplayPlayerEvent,
} from "@shared";
import { axialDistance } from "../../utils/location";
import { getUsableExtraExecutions } from "../../utils/energy";
import { type PlannedActionParticipant } from "./utils";
import { BaseAction } from "./classes/BaseAction";

function isSameCoord(a: Axial | undefined, b: Axial | undefined): boolean {
  return !!a && !!b && a.q === b.q && a.r === b.r;
}

function getAllowedRange(actionId: ActionId, extraExecutions: number): number[] {
  const definition = ActionLibrary[actionId];
  const configuredRange =
    definition?.range && definition.range.length > 0
      ? definition.range
      : [0];
  if (
    actionId === "use_binoculars" &&
    definition?.extraExecution?.effectType !== ExtraExecutionEffect.IncreaseRange
  ) {
    return extraExecutions > 0
      ? configuredRange.filter((distance) => distance <= 2)
      : configuredRange.filter((distance) => distance <= 1);
  }
  return configuredRange;
}

export class ObserveLocationAction extends BaseAction {
  protected override readonly shouldShuffleParticipants = false;

  constructor(private readonly actionId: ActionId) {
    super();
  }

  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    const mapTiles = match.map?.tiles ?? [];

    for (const participant of roster) {
      const actionId = participant.plan.actionId as ActionId;
      if (!actionId) {
        this.clearPlan(participant);
        continue;
      }
      const extraExecutions =
        actionId === "use_binoculars"
          ? getUsableExtraExecutions(
              participant.character,
              participant.plan,
              ActionLibrary.use_binoculars
            )
          : 0;
      const origin = participant.character.position?.coord;
      const target = participant.plan.targetLocationId;
      let targetTile: (typeof mapTiles)[number] | undefined;
      if (target) {
        for (const tile of mapTiles) {
          if (isSameCoord(tile.coord, target)) {
            targetTile = tile;
            break;
          }
        }
      }
      const distance = origin && target ? axialDistance(origin, target) : -1;
      const allowedRange = getAllowedRange(actionId, extraExecutions);
      const validTarget =
        !!origin &&
        !!target &&
        !!targetTile &&
        !targetTile.meta?.destroyed &&
        allowedRange.indexOf(distance) !== -1;

      if (validTarget && target) {
        participant.character.remoteView = {
          coord: { q: target.q, r: target.r },
          turn: match.current_turn + 1,
        };
      } else if (participant.character.remoteView) {
        delete participant.character.remoteView;
      }

      const action: ReplayActionDone = {
        actionId,
        originLocation: origin,
        targetLocation: target,
        metadata: {
          observed: validTarget,
          observedLocation: validTarget ? target : undefined,
          distance,
          extraExecutions,
        },
      };
      this.clearPlan(participant);
      match.playerCharacters![participant.playerId] = participant.character;
      events.push({
        kind: "player",
        actorId: participant.playerId,
        action,
        visibility: { scope: "limited", playerIds: [participant.playerId] },
      });
    }

    return events;
  }
}

const lookThroughWindowAction = new ObserveLocationAction("look_through_window");
const binocularsAction = new ObserveLocationAction("use_binoculars");

export function executeLookThroughWindowAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return lookThroughWindowAction.execute(participants, match);
}

export function executeUseBinocularsAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return binocularsAction.execute(participants, match);
}
