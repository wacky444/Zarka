import type { ReplayEvent, ReplayPlayerEvent, PlayerCharacter } from "@shared";
import type { MatchRecord } from "../../models/types";
import { applyHealthDelta, mergeCharacterState } from "./utils";
import { isCharacterDead, isCharacterIncapacitated } from "../../utils/playerCharacter";

function sameLocation(a: PlayerCharacter, b: PlayerCharacter): boolean {
  const first = a.position?.coord;
  const second = b.position?.coord;
  return !!first && !!second && first.q === second.q && first.r === second.r;
}

export function applyVirusInfection(
  match: MatchRecord,
  resolvedTurn: number,
  logger: nkruntime.Logger,
): ReplayEvent[] {
  const characters = match.playerCharacters ?? {};
  const infectedSources: Array<[string, PlayerCharacter]> = [];
  for (const playerId in characters) {
    if (!Object.prototype.hasOwnProperty.call(characters, playerId)) {
      continue;
    }
    const character = characters[playerId];
    if (
      character &&
      !isCharacterDead(character) &&
      (character.statuses?.virus?.containsVirus === true ||
        character.statuses?.virus?.contagious === true)
    ) {
      infectedSources.push([playerId, character]);
    }
  }

  const events: ReplayEvent[] = [];
  for (const [sourceId, source] of infectedSources) {
    if (source.statuses?.virus) {
      source.statuses.virus.lastTickTurn = resolvedTurn;
    }
    for (const targetId in characters) {
      if (!Object.prototype.hasOwnProperty.call(characters, targetId)) {
        continue;
      }
      if (targetId === sourceId) {
        continue;
      }
      const target = characters[targetId];
      if (
        !target ||
        isCharacterIncapacitated(target) ||
        target.statuses?.vaccine?.immune === true ||
        !sameLocation(source, target)
      ) {
        continue;
      }

      const outcome = applyHealthDelta(target, -1, false, logger);
      mergeCharacterState(target, outcome.character);
      characters[targetId] = target;
      const damageTaken = Math.max(0, -outcome.result.delta);
      const infectionEvent: ReplayPlayerEvent = {
        kind: "player",
        actorId: sourceId,
        action: {
          actionId: "inject_virus",
          damageDealt: damageTaken,
          metadata: { infectionTick: true },
        },
        targets: [{ targetId, damageTaken }],
      };
      events.push(infectionEvent);
      if (outcome.event) {
        events.push(outcome.event);
      }
    }
  }
  return events;
}
