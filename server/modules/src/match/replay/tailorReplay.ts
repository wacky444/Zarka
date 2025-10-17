import type {
  Axial,
  PlayerCharacter,
  ReplayEvent,
  ReplayMapEvent,
  ReplayPlayerEvent,
} from "@shared";
import { axialDistance, canSeeCoord } from "../../utils/location";

function canSenseMoveDirection(
  event: ReplayPlayerEvent,
  viewer: Axial | null,
  viewDistance: number
): boolean {
  if (!viewer || event.action.actionId !== "move") {
    return false;
  }
  const origin = event.action.originLocation;
  const target = event.action.targetLocation;
  if (!origin || !target) {
    return false;
  }
  const canSeeOrigin = canSeeCoord(origin, viewer, viewDistance);
  if (!canSeeOrigin) {
    return false;
  }
  return axialDistance(target, viewer) <= viewDistance + 1;
}

function filterPlayerEvent(
  event: ReplayPlayerEvent,
  playerId: string,
  viewer: Axial | null,
  viewDistance: number
): boolean {
  if (event.actorId === playerId) {
    return true;
  }
  if (!viewer) {
    return false;
  }
  if (canSeeCoord(event.action.originLocation, viewer, viewDistance)) {
    return true;
  }
  if (canSeeCoord(event.action.targetLocation, viewer, viewDistance)) {
    return true;
  }
  return canSenseMoveDirection(event, viewer, viewDistance);
}

function filterMapEvent(
  event: ReplayMapEvent,
  viewer: Axial | null,
  viewDistance: number
): boolean {
  if (!viewer) {
    return false;
  }
  return canSeeCoord(event.cell, viewer, viewDistance);
}

export function tailorReplayEvents(
  events: ReplayEvent[],
  playerId: string,
  playerCharacters: Record<string, PlayerCharacter> | undefined,
  viewDistance: number
): ReplayEvent[] {
  if (!Array.isArray(events) || events.length === 0) {
    return [];
  }
  const character = playerCharacters?.[playerId] ?? null;
  const viewerCoord = character?.position?.coord ?? null;
  const allowedDistance = Math.max(0, viewDistance);
  const result: ReplayEvent[] = [];
  for (const event of events) {
    if (event.kind === "player") {
      if (filterPlayerEvent(event, playerId, viewerCoord, allowedDistance)) {
        result.push(event);
      }
    } else if (event.kind === "map") {
      if (filterMapEvent(event, viewerCoord, allowedDistance)) {
        result.push(event);
      }
    }
  }
  return result;
}
