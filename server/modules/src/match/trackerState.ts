import type { MatchTrackerRecord, PlayerTrackerView } from "@shared";
import type { MatchRecord } from "../models/types";
import { hasCarriedItem } from "./actions/utils";

function hasAuthorizedRelationship(
  ownerId: string,
  receiverId: string,
  characters: MatchRecord["playerCharacters"],
): boolean {
  const owner = characters[ownerId];
  const receiver = characters[receiverId];
  if (!owner || !receiver) {
    return false;
  }
  const ownerRelationships = owner.relationships;
  const receiverRelationships = receiver.relationships;
  return Boolean(
    ownerRelationships?.confirmedTeammates?.includes(receiverId) ||
      ownerRelationships?.alliances?.includes(receiverId) ||
      receiverRelationships?.confirmedTeammates?.includes(ownerId) ||
      receiverRelationships?.alliances?.includes(ownerId),
  );
}

export function canReceiveTrackerSignal(
  ownerId: string,
  receiverId: string,
  characters: MatchRecord["playerCharacters"],
): boolean {
  if (ownerId === receiverId) {
    return true;
  }
  const owner = characters[ownerId];
  const receiver = characters[receiverId];
  return Boolean(
    owner &&
      receiver &&
      hasAuthorizedRelationship(ownerId, receiverId, characters) &&
      hasCarriedItem(owner, "walkie_talkie") &&
      hasCarriedItem(receiver, "walkie_talkie"),
  );
}

function isValidTrackerRecord(
  tracker: MatchTrackerRecord,
  resolvedTurn: number,
): boolean {
  return (
    !!tracker &&
    typeof tracker.id === "string" &&
    typeof tracker.ownerId === "string" &&
    typeof tracker.targetId === "string" &&
    Number.isFinite(tracker.placedTurn) &&
    Number.isFinite(tracker.expiresTurn) &&
    tracker.expiresTurn >= tracker.placedTurn &&
    tracker.placedTurn <= resolvedTurn
  );
}

export function refreshTrackerViews(
  match: MatchRecord,
  resolvedTurn: number,
  logger?: nkruntime.Logger,
): void {
  const characters = match.playerCharacters;
  if (!characters) {
    logger?.debug(
      "tracker_views refresh match=%s turn=%d skipped=no_player_characters trackers=%d",
      match.match_id,
      resolvedTurn,
      match.trackers?.length ?? 0,
    );
    return;
  }

  const rawTrackers = Array.isArray(match.trackers) ? match.trackers : [];
  const allTrackers = rawTrackers.filter((tracker) =>
    isValidTrackerRecord(tracker, resolvedTurn),
  );
  const retainedTrackers = allTrackers.filter(
    (tracker) =>
      tracker.expiresTurn >= resolvedTurn ||
      tracker.discoveredByTarget !== true,
  );
  const activeTrackers = retainedTrackers.filter(
    (tracker) => tracker.expiresTurn >= resolvedTurn,
  );
  if (retainedTrackers.length > 0) {
    match.trackers = retainedTrackers;
  } else {
    delete match.trackers;
  }

  for (const character of Object.values(characters)) {
    if (character?.trackerViews) {
      delete character.trackerViews;
    }
  }

  for (const tracker of activeTrackers) {
    const target = characters[tracker.targetId];
    const coord = target?.position?.coord;
    if (
      !coord ||
      !Number.isFinite(coord.q) ||
      !Number.isFinite(coord.r)
    ) {
      continue;
    }

    for (const receiverId of Object.keys(characters)) {
      if (!canReceiveTrackerSignal(tracker.ownerId, receiverId, characters)) {
        continue;
      }
      const receiver = characters[receiverId];
      if (!receiver) {
        continue;
      }
      const view: PlayerTrackerView = {
        trackerId: tracker.id,
        coord: { q: coord.q, r: coord.r },
        expiresTurn: tracker.expiresTurn,
      };
      if (tracker.targetIdKnownToOwner) {
        view.targetPlayerId = tracker.targetId;
      }
      receiver.trackerViews = [...(receiver.trackerViews ?? []), view];
    }
  }

  if (logger) {
    const activeTrackerRecords = new Set(activeTrackers);
    const trackerDetails = rawTrackers.map((tracker) => {
      const targetId =
        typeof tracker?.targetId === "string" ? tracker.targetId : undefined;
      const targetCoord = targetId
        ? characters[targetId]?.position?.coord
        : undefined;
      return {
        trackerId: tracker?.id ?? null,
        ownerId: tracker?.ownerId ?? null,
        targetId: targetId ?? null,
        targetIdKnownToOwner: tracker?.targetIdKnownToOwner === true,
        placedTurn: tracker?.placedTurn ?? null,
        expiresTurn: tracker?.expiresTurn ?? null,
        valid: allTrackers.includes(tracker),
        active: activeTrackerRecords.has(tracker),
        targetCoord: targetCoord
          ? { q: targetCoord.q, r: targetCoord.r }
          : null,
      };
    });
    const receiverViews: Record<string, PlayerTrackerView[]> = {};
    for (const [receiverId, character] of Object.entries(characters)) {
      if (character.trackerViews?.length) {
        receiverViews[receiverId] = character.trackerViews;
      }
    }
    logger.debug(
      "tracker_views refreshed match=%s turn=%d total=%d valid=%d active=%d trackers=%s receiver_views=%s",
      match.match_id,
      resolvedTurn,
      rawTrackers.length,
      allTrackers.length,
      activeTrackers.length,
      JSON.stringify(trackerDetails),
      JSON.stringify(receiverViews),
    );
  }
}
