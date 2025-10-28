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
import { collectTargets } from "./targeting";

interface Destination {
  tileId: string;
  coord: { q: number; r: number };
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
    const selection = origin
      ? collectTargets(actionId, participant, match, {
          allowMultiple: false,
          filter: (candidate) => !hasProtection(candidate.character),
        })
      : [];
    clearPlanByKey(participant.character, participant.planKey);
    const targetSelection = selection[0];
    if (!destination || !origin || !targetSelection) {
      continue;
    }
    const target = match.playerCharacters?.[targetSelection.id];
    if (!target) {
      continue;
    }
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
