/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import type { ReplayEvent } from "@shared";
import type { MatchRecord } from "../models/types";
import { distributeTeams } from "./teams";
import { assignSpawnPositions } from "../utils/playerCharacter";
import { getInitialAutoAdvanceAt } from "../utils/autoSkip";

export function startMatchRecord(
  match: MatchRecord,
  logger: nkruntime.Logger,
  startedAtMs: number
): ReplayEvent[] {
  assignSpawnPositions(match, logger);
  distributeTeams(match, logger);

  match.started = true;
  match.started_at = Math.floor(startedAtMs / 1000);
  if (match.autoSkip !== false) {
    const initialAutoAdvanceAt = getInitialAutoAdvanceAt(
      match.roundTime,
      startedAtMs
    );
    if (initialAutoAdvanceAt !== undefined) {
      match.lastAutoAdvanceAt = initialAutoAdvanceAt;
    }
  }

  const turn0Events: ReplayEvent[] = [];
  for (const playerId in match.playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(match.playerCharacters, playerId)) {
      continue;
    }
    const character = match.playerCharacters[playerId];
    const effectiveTeam = character?.secretTeamId || character?.teamId;
    if (character && effectiveTeam) {
      turn0Events.push({
        kind: "player",
        actorId: character.id,
        action: {
          actionId: "team_assigned",
          metadata: {
            teamId: effectiveTeam,
            coverTeamId: character.secretTeamId ? character.teamId : undefined
          }
        },
        visibility: {
          scope: "limited",
          playerIds: [character.id]
        }
      });
    }
  }
  return turn0Events;
}
