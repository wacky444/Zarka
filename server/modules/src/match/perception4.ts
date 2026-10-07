import {
  ActionLibrary,
  getSkillEffectTotal,
  isCharacterUndetectable,
  type Axial,
  type ReplayActionTarget,
  type ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../models/types";
import { axialDistance } from "../utils/location";
import {
  isCharacterDead,
  isCharacterIncapacitated,
} from "../utils/playerCharacter";

function isValidCoord(coord: Axial | undefined): coord is Axial {
  return !!coord && Number.isFinite(coord.q) && Number.isFinite(coord.r);
}

export function createPerception4DetectionEvents(
  match: MatchRecord,
): ReplayPlayerEvent[] {
  const characters = match.playerCharacters;
  if (!characters) {
    return [];
  }

  const events: ReplayPlayerEvent[] = [];
  for (const [viewerId, viewer] of Object.entries(characters)) {
    const range = getSkillEffectTotal(viewer, "perceive_nearby_players");
    const origin = viewer.position?.coord;
    if (
      range <= 0 ||
      isCharacterIncapacitated(viewer) ||
      !isValidCoord(origin)
    ) {
      continue;
    }

    const targets: ReplayActionTarget[] = [];
    for (const [targetId, target] of Object.entries(characters)) {
      if (
        targetId === viewerId ||
        match.deadCharacters?.[targetId] === true ||
        isCharacterDead(target) ||
        isCharacterUndetectable(target)
      ) {
        continue;
      }
      const targetCoord = target.position?.coord;
      if (!isValidCoord(targetCoord)) {
        continue;
      }
      const distance = axialDistance(origin, targetCoord);
      if (distance > range) {
        continue;
      }
      targets.push({
        targetId,
        metadata: {
          distance,
          sameLocation: distance === 0,
        },
      });
    }

    if (targets.length === 0) {
      continue;
    }
    events.push({
      kind: "player",
      actorId: viewerId,
      action: {
        actionId: ActionLibrary.detect.id,
        metadata: {
          detectedCount: targets.length,
          passive: true,
        },
      },
      targets,
      visibility: { scope: "limited", playerIds: [viewerId] },
    });
  }
  return events;
}
