/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  RANKED_ELO_SETTLEMENT_COLLECTION,
  RANKED_MATCH_SETTLEMENT_COLLECTION,
  RANKED_RATING_LOCK_COLLECTION,
  RANKED_RATING_STATE_COLLECTION,
  SERVER_USER_ID
} from "../constants";
import {
  RANKED_MATCH_METADATA_KEY,
  type PlayerStats,
  type UserRankTier
} from "@shared";
import type { MatchRecord } from "../models/types";
import { isBotId } from "./botAI";
import type { EndGameOutcome } from "./checkEndGame";

export const RANKED_ELO_BASE_K = 24;
export const RANKED_BOT_VIRTUAL_RATING = 1000;

function roundEloDelta(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export type RankedEloSettlementEntry = {
  userId: string;
  delta: number;
  won: boolean;
  draw: boolean;
};

type RankedMatchSettlementBatch = {
  matchId: string;
  state: "pending" | "applied";
  createdAtMs: number;
  entries: RankedEloSettlementEntry[];
};

type RankedUserSettlement = RankedEloSettlementEntry & {
  matchId: string;
  createdAtMs: number;
  sequence: number;
  state: "pending" | "applied";
};

type RankedRatingState = {
  userId: string;
  nextSequence: number;
  pendingSettlementKeys: string[];
};

type RankedRatingLock = {
  ownerId: string;
  expiresAtMs: number;
};

type StoredObject<T> = {
  key: string;
  value: T;
  version: string;
};

type UnknownRecord = Record<string, unknown>;

const RATING_LOCK_MS = 30_000;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

function readObject<T>(
  nk: nkruntime.Nakama,
  collection: string,
  key: string
): StoredObject<T> | null {
  const object = nk.storageRead([
    { collection, key, userId: SERVER_USER_ID }
  ])?.[0];
  return object?.value
    ? { key: object.key, value: object.value as T, version: object.version }
    : null;
}

function writeObject<T extends Record<string, unknown>>(
  nk: nkruntime.Nakama,
  collection: string,
  key: string,
  value: T,
  version: string
): void {
  nk.storageWrite([
    {
      collection,
      key,
      userId: SERVER_USER_ID,
      value,
      permissionRead: 0,
      permissionWrite: 0,
      version
    }
  ]);
}

function deleteObject(
  nk: nkruntime.Nakama,
  collection: string,
  key: string
): void {
  nk.storageDelete([{ collection, key, userId: SERVER_USER_ID }]);
}

function listObjects<T>(
  nk: nkruntime.Nakama,
  collection: string
): Array<StoredObject<T>> {
  const result: Array<StoredObject<T>> = [];
  let cursor = "";
  let hasMore = true;
  while (hasMore) {
    const page = nk.storageList(SERVER_USER_ID, collection, 100, cursor);
    for (const object of page?.objects ?? []) {
      if (object?.key && object.value) {
        result.push({
          key: object.key,
          value: object.value as T,
          version: object.version
        });
      }
    }
    cursor = page?.cursor ?? "";
    hasMore = cursor.length > 0;
  }
  return result;
}

function effectiveTeamId(match: MatchRecord, playerId: string): string {
  const character = match.playerCharacters[playerId];
  return (
    character?.secretTeamId?.trim() ||
    character?.teamId?.trim() ||
    `solo_${playerId}`
  );
}

export function calculateRankedEloDeltas(
  match: MatchRecord
): Record<string, number> | null {
  const ranked = match.metadata?.[RANKED_MATCH_METADATA_KEY];
  const placements = ranked?.placements;
  if (!ranked || !Array.isArray(placements) || placements.length === 0) {
    return null;
  }

  const teams = new Map<string, string[]>();
  for (const playerId of Object.keys(match.playerCharacters ?? {})) {
    const teamId = effectiveTeamId(match, playerId);
    const members = teams.get(teamId) ?? [];
    members.push(playerId);
    teams.set(teamId, members);
  }
  if (teams.size === 0) return null;

  const placementByTeam = new Map(
    placements.map((placement) => [placement.teamId, placement.place])
  );
  if (Array.from(teams.keys()).some((teamId) => !placementByTeam.has(teamId))) {
    return null;
  }

  const ratingByTeam = new Map<string, number>();
  for (const [teamId, members] of teams) {
    const totalRating = members.reduce((total, playerId) => {
      if (isBotId(playerId)) return total + RANKED_BOT_VIRTUAL_RATING;
      const snapshot = ranked.eloSnapshots[playerId];
      return (
        total +
        (typeof snapshot === "number" && Number.isFinite(snapshot)
          ? snapshot
          : RANKED_BOT_VIRTUAL_RATING)
      );
    }, 0);
    ratingByTeam.set(teamId, totalRating / members.length);
  }

  const teamCount = teams.size;
  if (teamCount < 2) {
    return Object.fromEntries(
      match.players.filter((userId) => !isBotId(userId)).map((userId) => [userId, 0])
    );
  }
  const humanCount =
    typeof ranked.humanCount === "number" && Number.isFinite(ranked.humanCount)
      ? Math.max(0, ranked.humanCount)
      : 0;
  const effectiveK =
    RANKED_ELO_BASE_K * Math.min(1, humanCount / 16);
  const deltasByTeam = new Map<string, number>();
  for (const teamId of teams.keys()) {
    const rating = ratingByTeam.get(teamId) ?? RANKED_BOT_VIRTUAL_RATING;
    const placement = placementByTeam.get(teamId) ?? 1;
    let scoreDifferenceTotal = 0;
    for (const opponentId of teams.keys()) {
      if (opponentId === teamId) continue;
      const opponentRating =
        ratingByTeam.get(opponentId) ?? RANKED_BOT_VIRTUAL_RATING;
      const opponentPlacement = placementByTeam.get(opponentId) ?? 1;
      const expected =
        1 / (1 + 10 ** ((opponentRating - rating) / 400));
      const score =
        placement < opponentPlacement
          ? 1
          : placement === opponentPlacement
            ? 0.5
            : 0;
      scoreDifferenceTotal += score - expected;
    }
    deltasByTeam.set(
      teamId,
      roundEloDelta((effectiveK / (teamCount - 1)) * scoreDifferenceTotal)
    );
  }

  const deltas: Record<string, number> = {};
  for (const userId of match.players) {
    if (isBotId(userId)) continue;
    const delta = deltasByTeam.get(effectiveTeamId(match, userId));
    if (typeof delta === "number") deltas[userId] = delta;
  }
  return deltas;
}

function readUser(nk: nkruntime.Nakama, userId: string): nkruntime.User | undefined {
  const users = nk.usersGetId([userId]);
  return users && users.length > 0 ? users[0] : undefined;
}

function parseNonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

function acquireRatingLock(
  nk: nkruntime.Nakama,
  userId: string,
  nowMs: number
): string | null {
  const current = readObject<RankedRatingLock>(
    nk,
    RANKED_RATING_LOCK_COLLECTION,
    userId
  );
  if (current && current.value.expiresAtMs > nowMs) return null;
  const ownerId = nk.uuidv4();
  try {
    writeObject(
      nk,
      RANKED_RATING_LOCK_COLLECTION,
      userId,
      { ownerId, expiresAtMs: nowMs + RATING_LOCK_MS },
      current?.version ?? ""
    );
    return ownerId;
  } catch {
    return null;
  }
}

function releaseRatingLock(
  nk: nkruntime.Nakama,
  userId: string,
  ownerId: string,
  nowMs: number
): void {
  const current = readObject<RankedRatingLock>(
    nk,
    RANKED_RATING_LOCK_COLLECTION,
    userId
  );
  if (!current || current.value.ownerId !== ownerId) return;
  try {
    writeObject(
      nk,
      RANKED_RATING_LOCK_COLLECTION,
      userId,
      { ownerId: "", expiresAtMs: nowMs },
      current.version
    );
  } catch {
    // The lock expires automatically if its owner cannot release it.
  }
}

function readStats(zarka: UnknownRecord | undefined): PlayerStats {
  const raw = asRecord(zarka?.stats);
  const elo = parseNonNegativeInt(raw?.elo, 1000);
  return {
    matchesPlayed: parseNonNegativeInt(raw?.matchesPlayed, 0),
    wins: parseNonNegativeInt(raw?.wins, 0),
    losses: parseNonNegativeInt(raw?.losses, 0),
    draws: parseNonNegativeInt(raw?.draws, 0),
    elo,
    highestElo: Math.max(parseNonNegativeInt(raw?.highestElo, 1000), elo),
    currentWinStreak: parseNonNegativeInt(raw?.currentWinStreak, 0),
    bestWinStreak: parseNonNegativeInt(raw?.bestWinStreak, 0),
    rankTier:
      typeof raw?.rankTier === "string"
        ? (raw.rankTier as UserRankTier)
        : "unranked",
    lastMatchEndedAtMs: parseNonNegativeInt(raw?.lastMatchEndedAtMs, 0)
  };
}

function readProfileSequence(zarka: UnknownRecord | undefined): number {
  return parseNonNegativeInt(zarka?.rankedRatingSequence, 0);
}

function settlementKey(matchId: string, userId: string): string {
  return `${matchId}:${userId}`;
}

function updateSettlement(
  nk: nkruntime.Nakama,
  stored: StoredObject<RankedUserSettlement>,
  value: RankedUserSettlement
): void {
  writeObject(
    nk,
    RANKED_ELO_SETTLEMENT_COLLECTION,
    stored.key,
    value,
    stored.version
  );
}

function removePendingSettlementKey(
  nk: nkruntime.Nakama,
  userId: string,
  key: string
): void {
  const state = readObject<RankedRatingState>(
    nk,
    RANKED_RATING_STATE_COLLECTION,
    userId
  );
  const pendingKeys = Array.isArray(state?.value.pendingSettlementKeys)
    ? state.value.pendingSettlementKeys
    : [];
  if (!state || !pendingKeys.includes(key)) return;
  writeObject(
    nk,
    RANKED_RATING_STATE_COLLECTION,
    userId,
    {
      ...state.value,
      pendingSettlementKeys: pendingKeys.filter(
        (pendingKey) => pendingKey !== key
      )
    },
    state.version
  );
}

function processUserSettlements(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  nowMs: number
): boolean {
  const lockOwner = acquireRatingLock(nk, userId, nowMs);
  if (!lockOwner) return false;
  try {
    const user = readUser(nk, userId);
    if (!user) return false;
    let metadata = asRecord(
      (user as unknown as { metadata?: unknown }).metadata
    ) ?? {};
    let zarka = asRecord(metadata.zarka) ?? {};
    let profileSequence = readProfileSequence(zarka);

    const ratingState = readObject<RankedRatingState>(
      nk,
      RANKED_RATING_STATE_COLLECTION,
      userId
    );
    const pendingSettlements = (ratingState?.value.pendingSettlementKeys ?? [])
      .map((key) =>
        readObject<RankedUserSettlement>(
          nk,
          RANKED_ELO_SETTLEMENT_COLLECTION,
          key
        )
      )
      .filter((entry): entry is StoredObject<RankedUserSettlement> => entry !== null)
      .sort((a, b) => a.value.sequence - b.value.sequence);

    for (const stored of pendingSettlements) {
      const settlement = stored.value;
      if (settlement.state === "applied") {
        removePendingSettlementKey(nk, userId, stored.key);
        continue;
      }
      if (settlement.sequence <= profileSequence) {
        updateSettlement(nk, stored, { ...settlement, state: "applied" });
        removePendingSettlementKey(nk, userId, stored.key);
        continue;
      }
      if (settlement.sequence !== profileSequence + 1) break;

      const previous = readStats(zarka);
      const elo = Math.max(0, previous.elo + settlement.delta);
      const nextCurrentStreak = settlement.won
        ? previous.currentWinStreak + 1
        : 0;
      const nextStats: PlayerStats = {
        ...previous,
        matchesPlayed: previous.matchesPlayed + 1,
        wins: previous.wins + (settlement.won ? 1 : 0),
        losses: previous.losses + (!settlement.won && !settlement.draw ? 1 : 0),
        draws: previous.draws + (settlement.draw ? 1 : 0),
        elo,
        highestElo: Math.max(previous.highestElo, elo),
        currentWinStreak: nextCurrentStreak,
        bestWinStreak: Math.max(previous.bestWinStreak, nextCurrentStreak),
        lastMatchEndedAtMs: settlement.createdAtMs
      };
      const nextZarka: UnknownRecord = {
        ...zarka,
        stats: nextStats,
        rankedRatingSequence: settlement.sequence
      };
      const nextMetadata = { ...metadata, zarka: nextZarka };
      try {
        nk.accountUpdateId(
          userId,
          null,
          null,
          null,
          null,
          null,
          null,
          nextMetadata
        );
      } catch (error) {
        logger.error(
          "ranked rating account update failed for user %s: %s",
          userId,
          (error && (error as Error).message) || String(error)
        );
        return false;
      }
      metadata = nextMetadata;
      zarka = nextZarka;
      profileSequence = settlement.sequence;
      const latestSettlement = readObject<RankedUserSettlement>(
        nk,
        RANKED_ELO_SETTLEMENT_COLLECTION,
        stored.key
      );
      if (latestSettlement) {
        updateSettlement(nk, latestSettlement, {
          ...latestSettlement.value,
          state: "applied"
        });
        removePendingSettlementKey(nk, userId, stored.key);
      }
    }

    return true;
  } finally {
    releaseRatingLock(nk, userId, lockOwner, Date.now());
  }
}

function enqueueUserSettlement(
  nk: nkruntime.Nakama,
  userId: string,
  entry: RankedEloSettlementEntry,
  matchId: string,
  createdAtMs: number
): void {
  const key = settlementKey(matchId, userId);
  if (readObject<RankedUserSettlement>(nk, RANKED_ELO_SETTLEMENT_COLLECTION, key)) {
    return;
  }

  const user = readUser(nk, userId);
  const metadata = asRecord(
    (user as unknown as { metadata?: unknown } | undefined)?.metadata
  );
  const zarka = asRecord(metadata?.zarka);
  const profileSequence = readProfileSequence(zarka);
  const state = readObject<RankedRatingState>(
    nk,
    RANKED_RATING_STATE_COLLECTION,
    userId
  );
  const sequence = Math.max(state?.value.nextSequence ?? 0, profileSequence) + 1;
  const nextState: RankedRatingState = {
    userId,
    nextSequence: sequence,
    pendingSettlementKeys: [
      ...(state?.value.pendingSettlementKeys ?? []),
      key
    ]
  };
  const settlement: RankedUserSettlement = {
    ...entry,
    matchId,
    sequence,
    state: "pending",
    createdAtMs
  };
  nk.storageWrite([
    {
      collection: RANKED_RATING_STATE_COLLECTION,
      key: userId,
      userId: SERVER_USER_ID,
      value: nextState,
      permissionRead: 0,
      permissionWrite: 0,
      version: state?.version ?? ""
    },
    {
      collection: RANKED_ELO_SETTLEMENT_COLLECTION,
      key,
      userId: SERVER_USER_ID,
      value: settlement,
      permissionRead: 0,
      permissionWrite: 0,
      version: ""
    }
  ]);
}

function processMatchSettlement(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  batch: StoredObject<RankedMatchSettlementBatch>,
  nowMs: number
): boolean {
  if (batch.value.state === "applied") {
    deleteObject(nk, RANKED_MATCH_SETTLEMENT_COLLECTION, batch.key);
    return true;
  }
  for (const entry of batch.value.entries) {
    try {
      enqueueUserSettlement(
        nk,
        entry.userId,
        entry,
        batch.value.matchId,
        batch.value.createdAtMs
      );
    } catch (error) {
      logger.error(
        "ranked settlement enqueue failed for match %s user %s: %s",
        batch.value.matchId,
        entry.userId,
        (error && (error as Error).message) || String(error)
      );
      return false;
    }
    if (!processUserSettlements(nk, logger, entry.userId, nowMs)) {
      return false;
    }
    const settlement = readObject<RankedUserSettlement>(
      nk,
      RANKED_ELO_SETTLEMENT_COLLECTION,
      settlementKey(batch.value.matchId, entry.userId)
    );
    if (settlement?.value.state !== "applied") return false;
  }

  deleteObject(nk, RANKED_MATCH_SETTLEMENT_COLLECTION, batch.key);
  return true;
}

function buildMatchSettlementEntries(
  match: MatchRecord,
  outcome: EndGameOutcome
): RankedEloSettlementEntry[] | null {
  if (!outcome.ended) return null;
  const deltas = calculateRankedEloDeltas(match);
  if (!deltas) return null;
  const winningCharacterId = outcome.reason === "last_alive" ? outcome.winnerId : undefined;
  const winningTeamId = winningCharacterId
    ? effectiveTeamId(match, winningCharacterId)
    : undefined;
  return match.players
    .filter((userId) => !isBotId(userId))
    .map((userId) => ({
      userId,
      delta: deltas[userId] ?? 0,
      won:
        outcome.reason === "last_alive" &&
        Boolean(winningTeamId && effectiveTeamId(match, userId) === winningTeamId),
      draw: outcome.reason === "all_dead"
    }));
}

export function enqueueRankedMatchSettlement(
  match: MatchRecord,
  outcome: EndGameOutcome,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  nowMs = Date.now()
): boolean {
  if (!match.metadata?.[RANKED_MATCH_METADATA_KEY]) return false;
  const entries = buildMatchSettlementEntries(match, outcome);
  if (!entries) {
    logger.warn("ranked match %s has incomplete placements; settlement deferred", match.match_id);
    return false;
  }

  const current = readObject<RankedMatchSettlementBatch>(
    nk,
    RANKED_MATCH_SETTLEMENT_COLLECTION,
    match.match_id
  );
  let batch = current;
  if (!batch) {
    const value: RankedMatchSettlementBatch = {
      matchId: match.match_id,
      state: "pending",
      createdAtMs: nowMs,
      entries
    };
    try {
      writeObject(
        nk,
        RANKED_MATCH_SETTLEMENT_COLLECTION,
        match.match_id,
        value,
        ""
      );
      batch = readObject<RankedMatchSettlementBatch>(
        nk,
        RANKED_MATCH_SETTLEMENT_COLLECTION,
        match.match_id
      );
    } catch (error) {
      logger.error(
        "ranked match settlement record failed for %s: %s",
        match.match_id,
        (error && (error as Error).message) || String(error)
      );
      throw error;
    }
  }
  if (!batch) return false;
  try {
    processMatchSettlement(nk, logger, batch, nowMs);
  } catch (error) {
    logger.error(
      "ranked settlement processing failed for match %s: %s",
      batch.value.matchId,
      (error && (error as Error).message) || String(error)
    );
  }
  return true;
}

export function processPendingRankedSettlements(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  nowMs = Date.now(),
  limit = 100
): number {
  let processed = 0;
  const pending = listObjects<RankedMatchSettlementBatch>(
    nk,
    RANKED_MATCH_SETTLEMENT_COLLECTION
  )
    .filter((batch) => batch.value.state === "pending")
    .sort((a, b) => a.value.createdAtMs - b.value.createdAtMs)
    .slice(0, limit);
  for (const batch of pending) {
    try {
      if (processMatchSettlement(nk, logger, batch, nowMs)) processed += 1;
    } catch (error) {
      logger.error(
        "ranked settlement recovery failed for match %s: %s",
        batch.value.matchId,
        (error && (error as Error).message) || String(error)
      );
    }
  }
  return processed;
}
