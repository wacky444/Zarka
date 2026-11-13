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
  playerId: string,
  viewer: Axial | null,
  viewDistance: number
): boolean {
  if (event.visibility?.scope === "all") {
    return true;
  }
  if (event.visibility?.scope === "limited") {
    return event.visibility.playerIds.indexOf(playerId) !== -1;
  }
  if (!viewer) {
    return false;
  }
  return canSeeCoord(event.cell, viewer, Math.max(0, viewDistance));
}

function sanitizePlayerEventForViewer(
  event: ReplayPlayerEvent,
  playerId: string
): ReplayPlayerEvent {
  if (event.actorId === playerId || !event.action.metadata) {
    return event;
  }
  const metadata = event.action.metadata as Record<string, unknown>;
  if (
    metadata.levelsGained === undefined &&
    metadata.experienceGained === undefined
  ) {
    return event;
  }
  const {
    levelsGained: _levelsGained,
    experienceGained: _experienceGained,
    ...restMetadata
  } = metadata;
  const { metadata: _ignored, ...restAction } = event.action;
  return {
    ...event,
    action: {
      ...restAction,
      ...(Object.keys(restMetadata).length > 0
        ? { metadata: restMetadata }
        : {}),
    },
  };
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
    return events.map((event) => {
      if (
        event.kind === "player" &&
        event.action.actionId === "lovers_announced"
      ) {
        return {
          ...event,
          actorId: "",
          visibility: { scope: "all" },
        };
      }
      return { ...event };
    });
  }
  const character = playerCharacters?.[playerId] ?? null;
  const viewerCoord = character?.position?.coord ?? null;
  const allowedDistance = Math.max(0, viewDistance);
  const result: ReplayEvent[] = [];
  for (const event of events) {
    if (event.kind === "player") {
      if (event.action.actionId === "status_dead") {
        const metadata = event.action.metadata as
          | { teamId?: unknown; wasLover?: unknown }
          | undefined;
        const teamId = metadata?.teamId;
        const wasLover = metadata?.wasLover === true;
        const outMetadata: Record<string, unknown> = {};
        if (typeof teamId === "string" && teamId.trim()) {
          outMetadata.teamId = teamId.trim();
        }
        if (wasLover) {
          outMetadata.wasLover = true;
        }
        result.push({
          kind: "player",
          importance: 1,
          actorId: event.actorId,
          action: {
            actionId: event.action.actionId,
            ...(Object.keys(outMetadata).length > 0
              ? { metadata: outMetadata }
              : {}),
          },
          visibility: { scope: "all" },
        });
      } else if (event.action.actionId === "lovers_announced") {
        result.push({
          ...event,
          actorId: "",
          visibility: { scope: "all" },
        });
      } else if (filterPlayerEvent(event, playerId)) {
        result.push(sanitizePlayerEventForViewer(event, playerId));
      }
    } else if (event.kind === "map") {
      if (filterMapEvent(event, playerId, viewerCoord, allowedDistance)) {
        result.push(event);
      }
    }
  }
  return result;
}
