/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { ActionLibrary, type ReplayPlayerEvent } from "@shared";
import type { MatchRecord } from "../../models/types";
import { axialDistance } from "../../utils/location";
import { isCharacterDead } from "../../utils/playerCharacter";
import {
  clearPlanByKey,
  consumeCarriedItem,
  type PlannedActionParticipant,
} from "./utils";

export function executeStartChainsawAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  const events: ReplayPlayerEvent[] = [];

  for (const participant of participants) {
    consumeCarriedItem(participant.character, "fuel", 1);

    if (!participant.character.statuses) {
      participant.character.statuses = { conditions: [] };
    }
    participant.character.statuses.chainsaw = { remainingTurns: 5 };

    const originLocation = participant.character.position?.coord;
    const hearingRadious = ActionLibrary.start_chainsaw.hearingRadious ?? 1;
    const hearingPlayerIds: string[] = [participant.playerId];

    if (originLocation) {
      const characters = match.playerCharacters ?? {};
      for (const playerId in characters) {
        if (!Object.prototype.hasOwnProperty.call(characters, playerId)) {
          continue;
        }
        const character = characters[playerId];
        const coord = character?.position?.coord;
        if (
          !isCharacterDead(character) &&
          coord &&
          axialDistance(originLocation, coord) <= hearingRadious
        ) {
          if (hearingPlayerIds.indexOf(playerId) === -1) {
            hearingPlayerIds.push(playerId);
          }
        }
      }
    }

    clearPlanByKey(participant.character, participant.planKey);
    match.playerCharacters![participant.playerId] = participant.character;

    events.push({
      kind: "player",
      actorId: participant.playerId,
      action: {
        actionId: ActionLibrary.start_chainsaw.id,
        ...(originLocation ? { originLocation } : {}),
      },
      visibility: {
        scope: "limited",
        playerIds: hearingPlayerIds,
      },
    });
  }

  return events;
}
