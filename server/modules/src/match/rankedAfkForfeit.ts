/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { RANKED_MATCH_METADATA_KEY, type ReplayEvent } from "@shared";
import type { MatchRecord } from "../models/types";
import {
  getConsecutiveAfkTurns,
  isActiveHumanPlayer
} from "../utils/activityClock";
import { isCharacterDead } from "../utils/playerCharacter";
import {
  recordRankedTeamForfeit,
  finalizeRankedPlacementsForSoleHumanWinner
} from "./rankedPlacements";
import {
  finalizeMatchWithOutcome,
  type EndGameOutcome
} from "./checkEndGame";

export function checkAndProcessRankedAfkForfeits(
  match: MatchRecord,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  currentTurnEvents: ReplayEvent[] = [],
  resolvedTurn: number = match.current_turn
): {
  forfeitedPlayerIds: string[];
  matchEnded: boolean;
  outcome?: EndGameOutcome;
} {
  if (!match.metadata?.[RANKED_MATCH_METADATA_KEY]) {
    return { forfeitedPlayerIds: [], matchEnded: false };
  }
  if (match.removed && match.removed !== 0) {
    return { forfeitedPlayerIds: [], matchEnded: false };
  }
  if (match.started !== true) {
    return { forfeitedPlayerIds: [], matchEnded: false };
  }

  const forfeitedPlayerIds: string[] = [];
  const players = Array.isArray(match.players) ? match.players : [];

  for (const playerId of players) {
    if (!isActiveHumanPlayer(match, playerId)) {
      continue;
    }
    if (getConsecutiveAfkTurns(match, playerId) >= 3) {
      match.forfeited_players = {
        ...(match.forfeited_players ?? {}),
        [playerId]: true
      };
      recordRankedTeamForfeit(match, playerId, resolvedTurn);
      forfeitedPlayerIds.push(playerId);
      logger.info(
        "ranked_player_forfeited %s",
        JSON.stringify({
          event: "ranked_player_forfeited",
          match_id: match.match_id,
          player_id: playerId,
          turn: resolvedTurn
        })
      );
    }
  }

  const hasForfeits =
    forfeitedPlayerIds.length > 0 ||
    (Boolean(match.forfeited_players) &&
      Object.keys(match.forfeited_players ?? {}).length > 0);

  if (!hasForfeits) {
    return { forfeitedPlayerIds: [], matchEnded: false };
  }

  const livingActiveHumans = players.filter(
    (pId) =>
      isActiveHumanPlayer(match, pId) &&
      !isCharacterDead(match.playerCharacters?.[pId])
  );

  if (livingActiveHumans.length === 1) {
    const soleHumanId = livingActiveHumans[0];
    finalizeRankedPlacementsForSoleHumanWinner(match, soleHumanId, resolvedTurn);
    const outcome: EndGameOutcome = {
      ended: true,
      reason: "last_alive",
      winnerId: soleHumanId,
      aliveCharacterIds: [soleHumanId]
    };
    finalizeMatchWithOutcome(
      match,
      outcome,
      nk,
      logger,
      currentTurnEvents,
      resolvedTurn
    );
    return {
      forfeitedPlayerIds,
      matchEnded: true,
      outcome
    };
  }

  return {
    forfeitedPlayerIds,
    matchEnded: false
  };
}
