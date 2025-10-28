import type { Axial, ActionId, PlayerCharacter } from "@shared";
import { ActionLibrary } from "@shared";
import { axialDistance } from "../../utils/location";
import type { MatchRecord } from "../../models/types";
import type { PlannedActionParticipant } from "./utils";

export interface TargetCandidate {
  id: string;
  character: PlayerCharacter;
  coord: Axial;
  distance: number;
}

export interface CollectTargetsOptions {
  filter?: (candidate: TargetCandidate) => boolean;
  allowMultiple?: boolean;
}

function coordsEqual(a: Axial | undefined, b: Axial | undefined): boolean {
  if (!a || !b) {
    return false;
  }
  return a.q === b.q && a.r === b.r;
}

function pushUnique(
  target: TargetCandidate[],
  candidate: TargetCandidate
): void {
  if (target.some((entry) => entry.id === candidate.id)) {
    return;
  }
  target.push(candidate);
}

function findCandidate(
  list: TargetCandidate[],
  id: string
): TargetCandidate | undefined {
  for (const entry of list) {
    if (entry.id === id) {
      return entry;
    }
  }
  return undefined;
}

export function collectTargets(
  actionId: ActionId,
  participant: PlannedActionParticipant,
  match: MatchRecord,
  options: CollectTargetsOptions = {}
): TargetCandidate[] {
  const definition = ActionLibrary[actionId];
  const allowed =
    definition?.range && definition.range.length > 0 ? definition.range : [0];
  const actorCoord = participant.character.position?.coord;
  if (!actorCoord) {
    return [];
  }
  const roster = match.playerCharacters ?? {};
  const candidates: TargetCandidate[] = [];
  for (const playerId in roster) {
    if (!Object.prototype.hasOwnProperty.call(roster, playerId)) {
      continue;
    }
    if (playerId === participant.playerId) {
      continue;
    }
    const character = roster[playerId];
    const coord = character?.position?.coord;
    if (!coord) {
      continue;
    }
    const distance = axialDistance(actorCoord, coord);
    if (allowed.indexOf(distance) === -1) {
      continue;
    }
    candidates.push({ id: playerId, character, coord, distance });
  }
  if (candidates.length === 0) {
    return [];
  }
  const filtered = options.filter
    ? candidates.filter((candidate) => options.filter!(candidate))
    : candidates.slice();
  if (filtered.length === 0) {
    return [];
  }
  const requested = (participant.plan.targetPlayerIds ?? [])
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry): entry is string => entry.length > 0);
  const selected: TargetCandidate[] = [];
  let priorityMissed = false;
  const primaryId = requested[0];
  if (primaryId) {
    const primaryCandidate = findCandidate(filtered, primaryId);
    if (primaryCandidate) {
      pushUnique(selected, primaryCandidate);
      for (let index = 1; index < requested.length; index += 1) {
        const candidate = findCandidate(filtered, requested[index]);
        if (candidate) {
          pushUnique(selected, candidate);
        }
      }
    } else {
      priorityMissed = true;
    }
  }
  if (priorityMissed) {
    const randomCandidate =
      filtered[Math.floor(Math.random() * filtered.length)];
    if (randomCandidate) {
      pushUnique(selected, randomCandidate);
    }
  }
  if (selected.length === 0) {
    const targetLocation = participant.plan.targetLocationId;
    if (targetLocation) {
      for (const candidate of filtered) {
        if (coordsEqual(candidate.coord, targetLocation)) {
          pushUnique(selected, candidate);
        }
      }
    }
  }
  if (selected.length === 0) {
    for (const candidate of filtered) {
      if (candidate.distance === 0) {
        pushUnique(selected, candidate);
      }
    }
  }
  if (selected.length === 0) {
    selected.push(...filtered);
  }
  if (options.allowMultiple === false && selected.length > 1) {
    return [selected[0]];
  }
  return selected;
}
