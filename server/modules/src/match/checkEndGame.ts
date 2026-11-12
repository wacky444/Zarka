/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  RANKED_MATCH_METADATA_KEY,
  TUTORIAL_MATCH_METADATA_KEY,
  type ReplayEvent
} from "@shared";
import type { MatchRecord } from "../models/types";
import { isCharacterDead } from "../utils/playerCharacter";
import { isBotControlled } from "../utils/activityClock";
import { createStorageService } from "../services/storageService";
import { buildMatchReport } from "./matchReport";
import { finalizeRankedTeamPlacements } from "./rankedPlacements";
import { enqueueRankedMatchSettlement } from "./rankedElo";
import { updateAccountMetadata } from "../services/accountMetadata";
import type { NakamaWrapper } from "../services/nakamaWrapper";
import { getRuntimeMatchId } from "../utils/matchIds";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && isFinite(value) ? value : undefined;
}

function clampNonNegativeInt(value: unknown, fallback: number): number {
  const n = asNumber(value);
  if (typeof n !== "number") {
    return fallback;
  }
  const rounded = Math.floor(n);
  return Math.max(0, rounded);
}

function buildDefaultStats(): import("@shared").PlayerStats {
  return {
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    elo: 1000,
    highestElo: 1000,
    currentWinStreak: 0,
    bestWinStreak: 0,
    rankTier: "unranked",
  };
}

function parsePlayerStatsFromMetadata(
  metadataValue: unknown,
): import("@shared").PlayerStats {
  const metadata = asRecord(metadataValue);
  const zarka = asRecord(metadata?.zarka);
  const statsObj = asRecord(zarka?.stats);
  const defaults = buildDefaultStats();

  const elo = clampNonNegativeInt(statsObj?.elo, defaults.elo);
  const highestElo = clampNonNegativeInt(
    statsObj?.highestElo,
    defaults.highestElo,
  );

  return {
    matchesPlayed: clampNonNegativeInt(
      statsObj?.matchesPlayed,
      defaults.matchesPlayed,
    ),
    wins: clampNonNegativeInt(statsObj?.wins, defaults.wins),
    losses: clampNonNegativeInt(statsObj?.losses, defaults.losses),
    draws: clampNonNegativeInt(statsObj?.draws, defaults.draws),
    elo,
    highestElo: Math.max(highestElo, elo),
    currentWinStreak: clampNonNegativeInt(
      statsObj?.currentWinStreak,
      defaults.currentWinStreak,
    ),
    bestWinStreak: clampNonNegativeInt(
      statsObj?.bestWinStreak,
      defaults.bestWinStreak,
    ),
    rankTier:
      (typeof statsObj?.rankTier === "string"
        ? (statsObj.rankTier as import("@shared").UserRankTier)
        : defaults.rankTier) ?? defaults.rankTier,
    lastMatchEndedAtMs: clampNonNegativeInt(
      statsObj?.lastMatchEndedAtMs,
      Date.now(),
    ),
  };
}

function writePlayerStatsToMetadata(
  existingMetadata: UnknownRecord,
  nextStats: import("@shared").PlayerStats,
  completedTutorial: boolean
): UnknownRecord {
  const existingZarka = asRecord(existingMetadata.zarka);

  const nextZarka: UnknownRecord = {
    ...(existingZarka ?? {}),
    stats: nextStats,
  };
  if (completedTutorial) {
    nextZarka.tutorialCompleted = true;
  }
  return {
    ...existingMetadata,
    zarka: nextZarka,
  };
}

export type EndGameOutcome =
  | { ended: false; reason: "not_started" | "already_removed" | "not_ended" }
  | {
      ended: true;
      reason: "last_alive" | "all_dead" | "inactivity_timeout";
      winnerId?: string;
      aliveCharacterIds: string[];
    };

export function checkEndGameOutcome(match: MatchRecord): EndGameOutcome {
  if (match.removed && match.removed !== 0) {
    return { ended: false, reason: "already_removed" };
  }
  if (match.started !== true) {
    return { ended: false, reason: "not_started" };
  }

  const characters = match.playerCharacters ?? {};
  const characterIds = Object.keys(characters);
  const alive: string[] = [];
  for (const id of characterIds) {
    const character = characters[id];
    if (!character) {
      continue;
    }
    if (!isCharacterDead(character)) {
      alive.push(id);
    }
  }

  if (alive.length === 0) {
    return {
      ended: true,
      reason: "all_dead",
      aliveCharacterIds: [],
    };
  }

  const isRanked = Boolean(match.metadata?.[RANKED_MATCH_METADATA_KEY]);
  if (isRanked && alive.every((id) => isBotControlled(match, id))) {
    return {
      ended: true,
      reason: "all_dead",
      aliveCharacterIds: [],
    };
  }

  const uniqueAliveTeams: Record<string, boolean> = {};
  let uniqueTeamCount = 0;
  for (const id of alive) {
    const character = characters[id];
    const team =
      character?.secretTeamId?.trim() ||
      character?.teamId?.trim() ||
      `solo_${id}`;
    if (!uniqueAliveTeams[team]) {
      uniqueAliveTeams[team] = true;
      uniqueTeamCount += 1;
    }
  }

  if (uniqueTeamCount > 1) {
    return { ended: false, reason: "not_ended" };
  }

  return {
    ended: true,
    reason: "last_alive",
    winnerId: alive[0],
    aliveCharacterIds: alive,
  };
}

export function getAliveCharacterIds(match: MatchRecord): string[] {
  const characters = match.playerCharacters ?? {};
  const characterIds = Object.keys(characters);
  const alive: string[] = [];
  for (const id of characterIds) {
    const character = characters[id];
    if (!character) {
      continue;
    }
    if (!isCharacterDead(character)) {
      alive.push(id);
    }
  }
  return alive;
}

export function finalizeMatchWithOutcome(
  match: MatchRecord,
  outcome: EndGameOutcome,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  currentTurnEvents: ReplayEvent[] = [],
  resolvedTurn = match.current_turn,
  nowMs = Date.now(),
): EndGameOutcome {
  if (!outcome.ended) {
    return outcome;
  }

  finalizeRankedTeamPlacements(match, resolvedTurn);
  const rankedMetadata = match.metadata?.[RANKED_MATCH_METADATA_KEY];
  const isRanked = Boolean(rankedMetadata);
  if (rankedMetadata) {
    const placements = rankedMetadata.placements ?? [];
    logger.info(
      "ranked_placements_recorded %s",
      JSON.stringify({
        event: "ranked_placements_recorded",
        match_id: match.match_id,
        team_count: placements.length,
        distinct_places: new Set(placements.map((placement) => placement.place)).size,
        eliminated_team_count: placements.filter((placement) => placement.eliminated).length,
        resolved_turn: resolvedTurn
      })
    );
  }
  if (
    isRanked &&
    !enqueueRankedMatchSettlement(match, outcome, nk, logger, nowMs)
  ) {
    throw new Error(`ranked settlement could not be recorded for ${match.match_id}`);
  }

  // Mark match removed immediately to prevent duplicate finalization.
  match.removed = 1;
  match.started = false;
  if (isRanked) {
    logger.info(
      "ranked_match_completed %s",
      JSON.stringify({
        event: "ranked_match_completed",
        match_id: match.match_id,
        reason: outcome.reason,
        resolved_turn: resolvedTurn
      })
    );
  }

  const participants = Array.isArray(match.players) ? match.players : [];
  let users: nkruntime.User[] = [];

  if (participants.length > 0) {
    try {
      users = nk.usersGetId(participants) ?? [];
    } catch (error) {
      logger.error(
        "finalizeMatchWithOutcome usersGetId failed for match %s: %s",
        match.match_id,
        (error && (error as Error).message) || String(error),
      );
      users = [];
    }
  }

  try {
    const storage = createStorageService(nk);
    if (!storage.getMatchReport(match.match_id)) {
      const report = buildMatchReport(
        match,
        storage,
        Math.floor(nowMs / 1000),
        outcome.reason,
        resolvedTurn,
        currentTurnEvents,
        users,
        outcome.reason === "last_alive" ? outcome.winnerId : undefined,
      );
      storage.writeMatchReport(report);
    }
  } catch (error) {
    logger.error(
      "finalizeMatchWithOutcome report write failed for match %s: %s",
      match.match_id,
      (error && (error as Error).message) || String(error),
    );
  }

  if (!isRanked && !match.gameMasterMode && participants.length > 0) {
    const characters = match.playerCharacters ?? {};
    const winnerId = outcome.winnerId ?? outcome.aliveCharacterIds[0];
    const winningCharacter = winnerId ? characters[winnerId] : undefined;
    const winningTeamId = winningCharacter
      ? winningCharacter.secretTeamId?.trim() ||
        winningCharacter.teamId?.trim() ||
        `solo_${winnerId}`
      : undefined;

    for (const playerId of participants) {
      const playerCharacter = characters[playerId];
      const playerTeamId = playerCharacter
        ? playerCharacter.secretTeamId?.trim() ||
          playerCharacter.teamId?.trim() ||
          `solo_${playerId}`
        : undefined;
      const isWinner =
        outcome.reason === "last_alive" &&
        Boolean(winningTeamId && playerTeamId === winningTeamId);
      const isDraw =
        outcome.reason === "all_dead" || outcome.reason === "inactivity_timeout";

      try {
        const status = updateAccountMetadata(nk, playerId, (metadata) => {
          const previous = parsePlayerStatsFromMetadata(metadata);
          const nextCurrentWinStreak = isWinner
            ? previous.currentWinStreak + 1
            : 0;
          const nextStats: import("@shared").PlayerStats = {
            ...previous,
            matchesPlayed: previous.matchesPlayed + 1,
            wins: previous.wins + (isWinner ? 1 : 0),
            losses: previous.losses + (!isWinner && !isDraw ? 1 : 0),
            draws: previous.draws + (isDraw ? 1 : 0),
            currentWinStreak: nextCurrentWinStreak,
            bestWinStreak: Math.max(
              previous.bestWinStreak,
              nextCurrentWinStreak,
            ),
            lastMatchEndedAtMs: nowMs,
          };
          logger.info(
            "finalizeMatchWithOutcome updating stats for user %s: %o",
            playerId,
            nextStats,
          );
          return writePlayerStatsToMetadata(
            metadata,
            nextStats,
            isWinner && !!match.metadata?.[TUTORIAL_MATCH_METADATA_KEY]
          );
        });
        if (status !== "updated") {
          logger.error(
            "finalizeMatchWithOutcome account metadata update %s for user %s",
            status,
            playerId,
          );
        }
      } catch (error) {
        logger.error(
          "finalizeMatchWithOutcome account metadata update failed for user %s: %s",
          playerId,
          (error && (error as Error).message) || String(error),
        );
      }
    }
  }

  return outcome;
}

export function finalizeMatchIfEnded(
  match: MatchRecord,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  currentTurnEvents: ReplayEvent[] = [],
  resolvedTurn = match.current_turn,
): EndGameOutcome {
  const outcome = checkEndGameOutcome(match);
  logger.info(
    "finalizeMatchIfEnded match %s outcome: %o",
    match.match_id,
    outcome,
  );
  if (!outcome.ended) {
    logger.info(
      "finalizeMatchIfEnded match %s not ended, reason: %s",
      match.match_id,
      outcome.reason,
    );
    return outcome;
  }

  return finalizeMatchWithOutcome(
    match,
    outcome,
    nk,
    logger,
    currentTurnEvents,
    resolvedTurn,
  );
}

export function emitMatchEndedSignal(
  nkWrapper: NakamaWrapper,
  match: MatchRecord,
  outcome?: EndGameOutcome,
): void {
  try {
    const endedOutcome = outcome && outcome.ended ? outcome : undefined;
    const characters = match.playerCharacters ?? {};
    const alive = endedOutcome?.aliveCharacterIds ?? getAliveCharacterIds(match);

    let winnerId = endedOutcome?.winnerId;
    if (
      endedOutcome?.reason === "inactivity_timeout" ||
      endedOutcome?.reason === "all_dead"
    ) {
      winnerId = undefined;
    } else {
      if (!winnerId) {
        const ranked = match.metadata?.[RANKED_MATCH_METADATA_KEY];
        const winningPlacement = ranked?.placements?.find(
          (p) => p.place === 1 && !p.eliminated,
        );
        if (winningPlacement) {
          const winningTeamId = winningPlacement.teamId;
          const memberOnTeam = (match.players ?? []).find((pId) => {
            const char = characters[pId];
            const team =
              char?.secretTeamId?.trim() ||
              char?.teamId?.trim() ||
              `solo_${pId}`;
            return team === winningTeamId;
          });
          if (memberOnTeam) {
            winnerId = memberOnTeam;
          }
        }
      }
      if (!winnerId) {
        winnerId = alive.length > 0 ? alive[0] : undefined;
      }
    }

    const reason =
      endedOutcome?.reason ?? (alive.length === 0 ? "all_dead" : "last_alive");
    const winningChar = winnerId ? characters[winnerId] : undefined;
    const winningTeamId = winningChar
      ? winningChar.secretTeamId?.trim() ||
        winningChar.teamId?.trim() ||
        `solo_${winnerId}`
      : undefined;

    const winnerIds =
      reason === "inactivity_timeout" || reason === "all_dead"
        ? []
        : winningTeamId
        ? (match.players ?? []).filter((pId) => {
            const char = characters[pId];
            const team =
              char?.secretTeamId?.trim() ||
              char?.teamId?.trim() ||
              `solo_${pId}`;
            return team === winningTeamId;
          })
        : alive;

    nkWrapper.matchSignal(
      getRuntimeMatchId(match),
      JSON.stringify({
        type: "match_ended",
        match_id: match.match_id,
        winnerId,
        winnerIds,
        reason,
      }),
    );
  } catch (error) {
    // signal emission is best effort
  }
}
