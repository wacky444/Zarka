/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../models/types";
import { isCharacterDead } from "../utils/playerCharacter";

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

function parsePlayerStatsFromUser(
  user: nkruntime.User,
): import("@shared").PlayerStats {
  const metadata = asRecord(
    (user as unknown as { metadata?: unknown }).metadata,
  );
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
  user: nkruntime.User,
  nextStats: import("@shared").PlayerStats,
): { [key: string]: any } {
  const existingMetadata = asRecord(
    (user as unknown as { metadata?: unknown }).metadata,
  );
  const existingZarka = asRecord(existingMetadata?.zarka);

  return {
    ...(existingMetadata ?? {}),
    zarka: {
      ...(existingZarka ?? {}),
      stats: nextStats,
    },
  };
}

export type EndGameOutcome =
  | { ended: false; reason: "not_started" | "already_removed" | "not_ended" }
  | {
      ended: true;
      reason: "last_alive" | "all_dead";
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

  if (alive.length > 1) {
    return { ended: false, reason: "not_ended" };
  }

  if (alive.length === 0) {
    return {
      ended: true,
      reason: "all_dead",
      aliveCharacterIds: [],
    };
  }

  return {
    ended: true,
    reason: "last_alive",
    winnerId: alive[0],
    aliveCharacterIds: alive,
  };
}

export function finalizeMatchIfEnded(
  match: MatchRecord,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
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

  // Mark match removed immediately to prevent duplicate finalization.
  match.removed = 1;
  match.started = false;

  const participants = Array.isArray(match.players) ? match.players : [];
  const nowMs = Date.now();
  const winnerId = outcome.winnerId;

  if (participants.length > 0) {
    let users: nkruntime.User[] = [];
    try {
      users = nk.usersGetId(participants) ?? [];
    } catch (error) {
      logger.error(
        "finalizeMatchIfEnded usersGetId failed for match %s: %s",
        match.match_id,
        (error && (error as Error).message) || String(error),
      );
      users = [];
    }

    const userMap: Record<string, nkruntime.User> = {};
    for (const user of users) {
      const userId =
        (user as unknown as { id?: string; userId?: string }).id ??
        (user as unknown as { id?: string; userId?: string }).userId;
      if (typeof userId === "string" && userId.length > 0) {
        userMap[userId] = user;
      }
    }

    for (const playerId of participants) {
      const user = userMap[playerId];
      if (!user) {
        continue;
      }

      const previous = parsePlayerStatsFromUser(user);
      const isWinner = !!winnerId && winnerId === playerId;
      const isDraw = !winnerId;

      const nextMatchesPlayed = previous.matchesPlayed + 1;
      const nextWins = previous.wins + (isWinner ? 1 : 0);
      const nextLosses = previous.losses + (!isWinner && !isDraw ? 1 : 0);
      const nextDraws = previous.draws + (isDraw ? 1 : 0);

      const nextCurrentWinStreak = isWinner ? previous.currentWinStreak + 1 : 0;
      const nextBestWinStreak = Math.max(
        previous.bestWinStreak,
        nextCurrentWinStreak,
      );

      const nextStats: import("@shared").PlayerStats = {
        ...previous,
        matchesPlayed: nextMatchesPlayed,
        wins: nextWins,
        losses: nextLosses,
        draws: nextDraws,
        currentWinStreak: nextCurrentWinStreak,
        bestWinStreak: nextBestWinStreak,
        lastMatchEndedAtMs: nowMs,
      };

      try {
        logger.info(
          "finalizeMatchIfEnded updating stats for user %s: %o",
          playerId,
          nextStats,
        );
        const nextMetadata = writePlayerStatsToMetadata(user, nextStats);
        // Nakama runtime API: metadata is replaced, so we preserve existing fields.
        nk.accountUpdateId(
          playerId,
          null,
          null,
          null,
          null,
          null,
          null,
          nextMetadata,
        );
      } catch (error) {
        logger.error(
          "finalizeMatchIfEnded accountUpdateId failed for user %s: %s",
          playerId,
          (error && (error as Error).message) || String(error),
        );
      }
    }
  }

  return outcome;
}
