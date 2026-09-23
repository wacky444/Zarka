import type {
  Axial,
  PlayerCharacter,
  ReplayEvent,
  ReplayMapEvent,
  ReplayPlayerEvent,
} from "@shared";
import { canSeeCoord } from "../../utils/location";

function affectsPlayer(event: ReplayPlayerEvent, playerId: string): boolean {
  return Array.isArray(event.targets)
    ? event.targets.some((target) => target.targetId === playerId)
    : false;
}

function filterPlayerEvent(
  event: ReplayPlayerEvent,
  playerId: string
): boolean {
  if (event.visibility?.scope === "all") {
    return true;
  }
  if (event.visibility && event.visibility.scope === "limited") {
    return event.visibility.playerIds.indexOf(playerId) !== -1;
  }
  if (event.actorId === playerId || affectsPlayer(event, playerId)) {
    return true;
  }
  return false;
}

function filterMapEvent(
  event: ReplayMapEvent,
  viewer: Axial | null,
  viewDistance: number
): boolean {
  if (!viewer) {
    return false;
  }
  return canSeeCoord(event.cell, viewer, Math.max(0, viewDistance));
}

export function tailorReplayEvents(
  events: ReplayEvent[],
  playerId: string,
  playerCharacters: Record<string, PlayerCharacter> | undefined,
  viewDistance: number,
  viewAll = false
): ReplayEvent[] {
  if (!Array.isArray(events) || events.length === 0) {
    return [];
  }
  if (viewAll) {
    return events.map((event) => ({ ...event }));
  }
  const character = playerCharacters?.[playerId] ?? null;
  const viewerCoord = character?.position?.coord ?? null;
  const allowedDistance = Math.max(0, viewDistance);
  const result: ReplayEvent[] = [];
  for (const event of events) {
    if (event.kind === "player") {
      if (event.action.actionId === "status_dead") {
        result.push({
          kind: "player",
          actorId: event.actorId,
          action: { actionId: event.action.actionId },
          visibility: { scope: "all" },
        });
      } else if (filterPlayerEvent(event, playerId)) {
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
