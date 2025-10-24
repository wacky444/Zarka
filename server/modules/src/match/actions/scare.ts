import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  PlayerCharacter,
  PlayerPlannedAction,
  ReplayActionDone,
  ReplayActionTarget,
  ReplayPlayerEvent,
} from "@shared";
import { clearPlanByKey, type PlannedActionParticipant } from "./utils";

interface Destination {
  tileId: string;
  coord: { q: number; r: number };
}

function sameCoord(
  a: { q: number; r: number } | undefined,
  b: { q: number; r: number } | undefined
): boolean {
  if (!a || !b) {
    return false;
  }
  return a.q === b.q && a.r === b.r;
}

function hasProtection(character: PlayerCharacter | undefined): boolean {
  const conditions = character?.statuses?.conditions;
  if (!conditions) {
    return false;
  }
  return conditions.indexOf("protected") !== -1;
}

function resolveDestination(
  match: MatchRecord,
  plan: PlayerPlannedAction
): Destination | undefined {
  const target = plan.targetLocationId;
  if (!target) {
    return undefined;
  }
  const tiles = match.map?.tiles ?? [];
  for (const entry of tiles) {
    if (entry.coord.q === target.q && entry.coord.r === target.r) {
      return {
        tileId: entry.id,
        coord: { q: target.q, r: target.r },
      };
    }
  }
  return {
    tileId: `hex_${target.q}_${target.r}`,
    coord: { q: target.q, r: target.r },
  };
}

function reduceEnergy(character: PlayerCharacter, amount: number): number {
  if (!character.stats?.energy) {
    return 0;
  }
  const energy = character.stats.energy;
  const previous = typeof energy.current === "number" ? energy.current : 0;
  const spent = Math.min(previous, amount);
  energy.current = previous - spent;
  return spent;
}

function pickTarget(
  participant: PlannedActionParticipant,
  match: MatchRecord,
  originCoord: { q: number; r: number }
): { id: string; character: PlayerCharacter } | undefined {
  const map = match.playerCharacters ?? {};
  const requested = participant.plan.targetPlayerIds ?? [];
  for (const candidateId of requested) {
    if (!candidateId || candidateId === participant.playerId) {
      continue;
    }
    const candidate = map[candidateId];
    if (!candidate?.position?.coord) {
      continue;
    }
    if (!sameCoord(candidate.position.coord, originCoord)) {
      continue;
    }
    if (hasProtection(candidate)) {
      continue;
    }
    return { id: candidateId, character: candidate };
  }
  const alternatives: Array<{ id: string; character: PlayerCharacter }> = [];
  for (const playerId in map) {
    if (!Object.prototype.hasOwnProperty.call(map, playerId)) {
      continue;
    }
    if (playerId === participant.playerId) {
      continue;
    }
    const character = map[playerId];
    if (!character?.position?.coord) {
      continue;
    }
    if (!sameCoord(character.position.coord, originCoord)) {
      continue;
    }
    if (hasProtection(character)) {
      continue;
    }
    alternatives.push({ id: playerId, character });
  }
  if (alternatives.length === 0) {
    return undefined;
  }
  const index = Math.floor(Math.random() * alternatives.length);
  return alternatives[index];
}

export function executeScareAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  const roster = participants.slice();
  for (let i = roster.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = roster[i];
    roster[i] = roster[j];
    roster[j] = tmp;
  }

  const events: ReplayPlayerEvent[] = [];
  for (const participant of roster) {
    const actionId = participant.plan.actionId as ActionId;
    if (!actionId) {
      clearPlanByKey(participant.character, participant.planKey);
      continue;
    }
    const destination = resolveDestination(match, participant.plan);
    const origin = participant.character.position?.coord;
    const targetSelection = origin
      ? pickTarget(participant, match, origin)
      : undefined;
    clearPlanByKey(participant.character, participant.planKey);
    if (!destination || !origin || !targetSelection) {
      continue;
    }
    const target = targetSelection.character;
    const previous = target.position;
    target.position = {
      tileId: destination.tileId,
      coord: destination.coord,
    };
    const energyLost = reduceEnergy(target, 3);
    if (!match.playerCharacters) {
      match.playerCharacters = {};
    }
    match.playerCharacters[targetSelection.id] = target;
    const action: ReplayActionDone = {
      actionId,
      originLocation: origin,
      targetLocation: destination.coord,
    };
    const metadata: Record<string, unknown> = {
      movedTo: destination.coord,
      energyLost,
    };
    if (previous?.coord) {
      metadata.movedFrom = previous.coord;
    }
    const targetEvent: ReplayActionTarget = {
      targetId: targetSelection.id,
      metadata,
    };
    events.push({
      kind: "player",
      actorId: participant.playerId,
      action,
      targets: [targetEvent],
    });
  }
  return events;
}
