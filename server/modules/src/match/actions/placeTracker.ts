import type { MatchRecord } from "../../models/types";
import {
  ActionLibrary,
  axialDistance,
  isCharacterHidden,
  type ActionId,
  type Axial,
  type PlayerCharacter,
  type ReplayActionDone,
  type ReplayPlayerEvent,
} from "@shared";
import { getUsableExtraExecutions } from "../../utils/energy";
import { isCharacterDead } from "../../utils/playerCharacter";
import { canReceiveTrackerSignal } from "../trackerState";
import {
  consumeCarriedItem,
  createFailedActionEvent,
  hasCarriedItem,
  type PlannedActionParticipant,
} from "./utils";
import { BaseAction } from "./classes/BaseAction";

const TRACKER_DURATION_TURNS = 10;

type TrackerTarget = {
  targetId: string;
  coord: Axial;
  targetIdKnownToOwner: boolean;
};

function createPrivateFailureEvent(
  participant: PlannedActionParticipant,
  actionId: ActionId,
  reason: "missing_item" | "invalid_target",
): ReplayPlayerEvent {
  const event = createFailedActionEvent(participant, actionId, {
    reason,
    ...(reason === "missing_item" ? { missingItemId: "tracker" } : {}),
  });
  event.visibility = {
    scope: "limited",
    playerIds: [participant.playerId],
  };
  return event;
}

function coordsEqual(a: Axial | undefined, b: Axial | undefined): boolean {
  return !!a && !!b && a.q === b.q && a.r === b.r;
}

function isValidCoord(coord: Axial | undefined): coord is Axial {
  return Boolean(
    coord && Number.isFinite(coord.q) && Number.isFinite(coord.r),
  );
}

function isTargetVisibleToActor(
  actorId: string,
  actor: PlayerCharacter,
  targetId: string,
  target: PlayerCharacter,
  match: MatchRecord,
  resolvedTurn: number,
): boolean {
  const targetCoord = target.position?.coord;
  if (!isValidCoord(targetCoord) || isCharacterHidden(target, resolvedTurn)) {
    return false;
  }
  const actorCoord = actor.position?.coord;
  if (coordsEqual(actorCoord, targetCoord)) {
    return true;
  }
  const currentTurn = match.current_turn ?? 0;
  const hasRemoteView =
    actor.remoteView?.turn === currentTurn &&
    coordsEqual(actor.remoteView.coord, targetCoord);
  const hasCameraView =
    actor.cameraView?.turn === currentTurn &&
    actor.cameraView.playerIds.includes(targetId);
  if (hasRemoteView || hasCameraView) {
    return true;
  }
  for (const [allyId, ally] of Object.entries(match.playerCharacters ?? {})) {
    if (
      allyId !== actorId &&
      coordsEqual(ally.position?.coord, targetCoord) &&
      canReceiveTrackerSignal(actorId, allyId, match.playerCharacters)
    ) {
      return true;
    }
  }
  return false;
}

function findTrackerTarget(
  participant: PlannedActionParticipant,
  match: MatchRecord,
  requestedTargetId: string | undefined,
  requestedLocation: Axial | undefined,
  resolvedTurn: number,
): TrackerTarget | undefined {
  const actorCoord = participant.character.position?.coord;
  if (!isValidCoord(actorCoord)) {
    return undefined;
  }
  const characters = match.playerCharacters ?? {};
  const fallbackLocation = isValidCoord(requestedLocation)
    ? requestedLocation
    : actorCoord;
  const requestedTarget = requestedTargetId
    ? characters[requestedTargetId]
    : undefined;
  const requestedCoord = requestedTarget?.position?.coord;
  if (requestedTargetId && requestedTarget && isValidCoord(requestedCoord)) {
    const distance = axialDistance(actorCoord, requestedCoord);
    if (
      requestedTargetId !== participant.playerId &&
      distance <= 1 &&
      !isCharacterDead(requestedTarget) &&
      (!requestedLocation || coordsEqual(requestedCoord, requestedLocation)) &&
      isTargetVisibleToActor(
        participant.playerId,
        participant.character,
        requestedTargetId,
        requestedTarget,
        match,
        resolvedTurn,
      )
    ) {
      return {
        targetId: requestedTargetId,
        coord: { q: requestedCoord.q, r: requestedCoord.r },
        targetIdKnownToOwner: true,
      };
    }
  }

  if (axialDistance(actorCoord, fallbackLocation) > 1) {
    return undefined;
  }
  let candidates = Object.entries(characters).filter(([playerId, character]) => {
    const coord = character.position?.coord;
    return (
      playerId !== participant.playerId &&
      !isCharacterDead(character) &&
      isValidCoord(coord) &&
      coordsEqual(coord, fallbackLocation)
    );
  });
  const distance = axialDistance(actorCoord, fallbackLocation);
  if (distance === 0) {
    candidates = candidates.filter(
      ([, character]) => !isCharacterHidden(character, resolvedTurn),
    );
  }
  if (candidates.length === 0) {
    return undefined;
  }
  const [targetId, target] =
    candidates[Math.floor(Math.random() * candidates.length)];
  const targetCoord = target.position?.coord;
  if (!isValidCoord(targetCoord)) {
    return undefined;
  }
  const targetIdKnownToOwner = isTargetVisibleToActor(
    participant.playerId,
    participant.character,
    targetId,
    target,
    match,
    resolvedTurn,
  );
  return {
    targetId,
    coord: { q: targetCoord.q, r: targetCoord.r },
    targetIdKnownToOwner,
  };
}

export class PlaceTrackerAction extends BaseAction {
  protected override readonly shouldShuffleParticipants = false;

  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord,
    logger?: nkruntime.Logger,
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    const resolvedTurn = (match.current_turn ?? 0) + 1;
    for (const participant of roster) {
      const actionId = participant.plan.actionId as ActionId;
      if (!actionId) {
        this.clearPlan(participant);
        continue;
      }
      if (!hasCarriedItem(participant.character, "tracker")) {
        logger?.debug(
          "place_tracker failed match=%s turn=%d owner=%s reason=missing_item",
          match.match_id,
          resolvedTurn,
          participant.playerId,
        );
        this.clearPlan(participant);
        if (match.playerCharacters) {
          match.playerCharacters[participant.playerId] = participant.character;
        }
        events.push(
          createPrivateFailureEvent(participant, actionId, "missing_item"),
        );
        continue;
      }

      const itemCount = participant.character.inventory.carriedItems
        .filter((stack) => stack.itemId === "tracker")
        .reduce(
          (count, stack) =>
            count + Math.max(0, Math.floor(stack.quantity)),
          0,
        );
      const extraExecutions =
        itemCount > 1
          ? Math.min(
              1,
              getUsableExtraExecutions(
                participant.character,
                participant.plan,
                ActionLibrary.place_tracker,
              ),
            )
          : 0;
      const placementCount = Math.min(1 + extraExecutions, itemCount);
      const requestedTargetIds = participant.plan.targetPlayerIds ?? [];
      const requestedLocation = participant.plan.targetLocationId;
      const targetLocations: Axial[] = [];
      const trackedTargets: Array<{ targetPlayerId?: string; coord: Axial }> = [];
      let placedCount = 0;
      let trackers = Array.isArray(match.trackers) ? match.trackers : [];
      match.trackers = trackers;

      for (let index = 0; index < placementCount; index += 1) {
        const requestedTargetId =
          requestedTargetIds[index] ?? requestedTargetIds[0];
        const target = findTrackerTarget(
          participant,
          match,
          requestedTargetId,
          requestedLocation,
          resolvedTurn,
        );
        if (!target || !consumeCarriedItem(participant.character, "tracker")) {
          continue;
        }
        const trackerId = `${match.match_id}:tracker:${resolvedTurn}:${trackers.length + 1}`;
        const tracker = {
          id: trackerId,
          ownerId: participant.playerId,
          targetId: target.targetId,
          targetIdKnownToOwner: target.targetIdKnownToOwner,
          placedTurn: resolvedTurn,
          expiresTurn: resolvedTurn + TRACKER_DURATION_TURNS - 1,
        };
        trackers = [...trackers, tracker];
        match.trackers = trackers;
        targetLocations.push(target.coord);
        trackedTargets.push({
          ...(target.targetIdKnownToOwner
            ? { targetPlayerId: target.targetId }
            : {}),
          coord: target.coord,
        });
        placedCount += 1;
      }

      logger?.debug(
        "place_tracker resolved match=%s turn=%d owner=%s placed=%d owned_trackers=%s",
        match.match_id,
        resolvedTurn,
        participant.playerId,
        placedCount,
        JSON.stringify(
          trackers
            .filter((tracker) => tracker.ownerId === participant.playerId)
            .map((tracker) => ({
              id: tracker.id,
              targetId: tracker.targetId,
              targetIdKnownToOwner: tracker.targetIdKnownToOwner,
              placedTurn: tracker.placedTurn,
              expiresTurn: tracker.expiresTurn,
            })),
        ),
      );
      this.clearPlan(participant);
      if (match.playerCharacters) {
        match.playerCharacters[participant.playerId] = participant.character;
      }
      if (placedCount === 0) {
        logger?.debug(
          "place_tracker failed match=%s turn=%d owner=%s reason=invalid_target requested_targets=%s requested_location=%s",
          match.match_id,
          resolvedTurn,
          participant.playerId,
          JSON.stringify(requestedTargetIds),
          JSON.stringify(requestedLocation ?? null),
        );
        events.push(
          createPrivateFailureEvent(participant, actionId, "invalid_target"),
        );
        continue;
      }
      const firstTargetLocation = targetLocations[0];
      const action: ReplayActionDone = {
        actionId,
        originLocation: participant.character.position?.coord,
        targetLocation: firstTargetLocation,
        metadata: {
          consumedItemId: "tracker",
          trackersPlaced: placedCount,
          extraExecutions,
          targetLocations,
          trackedTargets,
        },
      };
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

const placeTrackerAction = new PlaceTrackerAction();

export function executePlaceTrackerAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord,
  logger?: nkruntime.Logger,
): ReplayPlayerEvent[] {
  return placeTrackerAction.execute(participants, match, logger);
}
