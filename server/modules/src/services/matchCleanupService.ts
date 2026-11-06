/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../models/types";
import { StorageService } from "./storageService";
import { createNakamaWrapper } from "./nakamaWrapper";
import { deleteUnstartedLobbyAndArtifacts } from "./lobbyCleanup";
import { terminalizeMatchForInactivity } from "../match/inactivityTerminalize";
import {
  getEffectiveLastHumanActionAt,
  getEffectiveLastRosterActivityAt,
} from "../utils/activityClock";

export const DEFAULT_INACTIVE_MATCH_THRESHOLD_SECONDS = 14 * 24 * 60 * 60; // 14 days
export const DEFAULT_INACTIVE_LOBBY_THRESHOLD_SECONDS = 14 * 24 * 60 * 60; // 14 days
export const DEFAULT_EMPTY_LOBBY_THRESHOLD_SECONDS = 24 * 60 * 60; // 24 hours
export const DEFAULT_MAX_CANDIDATES_PER_RUN = 100;

export interface MatchCleanupOptions {
  dryRun?: boolean;
  nowSeconds?: number;
  inactiveMatchThresholdSec?: number;
  inactiveLobbyThresholdSec?: number;
  emptyLobbyThresholdSec?: number;
  maxCandidatesPerRun?: number;
}

export interface MatchCleanupResult {
  scannedCount: number;
  expiredEmptyLobbies: number;
  expiredStaleLobbies: number;
  expiredActiveMatches: number;
  skippedDueToRace: number;
  dryRun: boolean;
  affectedMatchIds: string[];
}

export function scanAndCleanStaleMatches(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  options?: MatchCleanupOptions
): MatchCleanupResult {
  const dryRun = options?.dryRun === true;
  const nowSeconds =
    typeof options?.nowSeconds === "number"
      ? options.nowSeconds
      : Math.floor(Date.now() / 1000);
  const inactiveMatchThresholdSec =
    typeof options?.inactiveMatchThresholdSec === "number"
      ? options.inactiveMatchThresholdSec
      : DEFAULT_INACTIVE_MATCH_THRESHOLD_SECONDS;
  const inactiveLobbyThresholdSec =
    typeof options?.inactiveLobbyThresholdSec === "number"
      ? options.inactiveLobbyThresholdSec
      : DEFAULT_INACTIVE_LOBBY_THRESHOLD_SECONDS;
  const emptyLobbyThresholdSec =
    typeof options?.emptyLobbyThresholdSec === "number"
      ? options.emptyLobbyThresholdSec
      : DEFAULT_EMPTY_LOBBY_THRESHOLD_SECONDS;
  const maxCandidatesPerRun =
    typeof options?.maxCandidatesPerRun === "number"
      ? options.maxCandidatesPerRun
      : DEFAULT_MAX_CANDIDATES_PER_RUN;

  const result: MatchCleanupResult = {
    scannedCount: 0,
    expiredEmptyLobbies: 0,
    expiredStaleLobbies: 0,
    expiredActiveMatches: 0,
    skippedDueToRace: 0,
    dryRun,
    affectedMatchIds: [],
  };

  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);

  let cursor = "";
  let hasMore = true;

  while (hasMore) {
    if (result.affectedMatchIds.length >= maxCandidatesPerRun) {
      break;
    }

    const response = storage.listServerMatches(100, cursor);
    const objects = response?.objects ?? [];
    if (!objects.length) {
      break;
    }

    for (const obj of objects) {
      if (result.affectedMatchIds.length >= maxCandidatesPerRun) {
        break;
      }
      if (!obj || !obj.value) {
        continue;
      }

      result.scannedCount += 1;
      const match = obj.value as MatchRecord;
      if (!match || !match.match_id) {
        continue;
      }

      // Skip finished matches (match.removed !== 0 && match.removed !== undefined)
      if (match.removed !== 0 && match.removed !== undefined) {
        continue;
      }

      // Legacy record fallback:
      // Records missing activity timestamps fall back to started_at or created_at via helpers from Task 1.
      // If both started_at and created_at are missing/0, log a warning and skip the record rather than deleting it.
      const hasCreationAnchor =
        (typeof match.created_at === "number" && match.created_at > 0) ||
        (typeof match.started_at === "number" && match.started_at > 0);

      if (!hasCreationAnchor) {
        logger.warn?.(
          "scanAndCleanStaleMatches: skipping match %s due to missing or zero created_at/started_at",
          match.match_id
        );
        continue;
      }

      let candidateType: "empty" | "stale_lobby" | "inactive_match" | null = null;

      if (match.started !== true) {
        const playerCount = match.players?.length ?? 0;
        const lastRosterActivity = getEffectiveLastRosterActivityAt(match);
        if (
          playerCount === 0 &&
          nowSeconds - lastRosterActivity >= emptyLobbyThresholdSec
        ) {
          candidateType = "empty";
        } else if (
          playerCount > 0 &&
          nowSeconds - lastRosterActivity >= inactiveLobbyThresholdSec
        ) {
          candidateType = "stale_lobby";
        }
      } else {
        const lastHumanAction = getEffectiveLastHumanActionAt(match);
        if (nowSeconds - lastHumanAction >= inactiveMatchThresholdSec) {
          const existingReport = storage.getMatchReport(match.match_id);
          if (!existingReport) {
            candidateType = "inactive_match";
          }
        }
      }

      if (!candidateType) {
        continue;
      }

      if (dryRun) {
        if (candidateType === "empty") {
          result.expiredEmptyLobbies += 1;
        } else if (candidateType === "stale_lobby") {
          result.expiredStaleLobbies += 1;
        } else if (candidateType === "inactive_match") {
          result.expiredActiveMatches += 1;
        }
        result.affectedMatchIds.push(match.match_id);
        continue;
      }

      // In live mode (dryRun !== true), re-read the match record and its latest version from storage
      const fresh = storage.getMatch(match.match_id);
      if (!fresh || !fresh.match) {
        result.skippedDueToRace += 1;
        continue;
      }

      const freshMatch = fresh.match;
      const freshVersion = fresh.version;

      if (freshMatch.removed !== 0 && freshMatch.removed !== undefined) {
        result.skippedDueToRace += 1;
        continue;
      }

      // Re-verify eligibility against the freshly read record
      if (candidateType === "empty") {
        const freshPlayerCount = freshMatch.players?.length ?? 0;
        const freshRosterActivity = getEffectiveLastRosterActivityAt(freshMatch);
        if (
          freshMatch.started === true ||
          freshPlayerCount !== 0 ||
          nowSeconds - freshRosterActivity < emptyLobbyThresholdSec
        ) {
          result.skippedDueToRace += 1;
          continue;
        }

        try {
          deleteUnstartedLobbyAndArtifacts(
            freshMatch,
            freshVersion,
            storage,
            nkWrapper,
            logger
          );
          result.expiredEmptyLobbies += 1;
          result.affectedMatchIds.push(freshMatch.match_id);
        } catch (writeError) {
          logger.warn?.(
            "scanAndCleanStaleMatches: version conflict or write failure deleting empty lobby %s: %s",
            freshMatch.match_id,
            (writeError as Error).message || String(writeError)
          );
          result.skippedDueToRace += 1;
        }
      } else if (candidateType === "stale_lobby") {
        const freshPlayerCount = freshMatch.players?.length ?? 0;
        const freshRosterActivity = getEffectiveLastRosterActivityAt(freshMatch);
        if (
          freshMatch.started === true ||
          freshPlayerCount === 0 ||
          nowSeconds - freshRosterActivity < inactiveLobbyThresholdSec
        ) {
          result.skippedDueToRace += 1;
          continue;
        }

        try {
          deleteUnstartedLobbyAndArtifacts(
            freshMatch,
            freshVersion,
            storage,
            nkWrapper,
            logger
          );
          result.expiredStaleLobbies += 1;
          result.affectedMatchIds.push(freshMatch.match_id);
        } catch (writeError) {
          logger.warn?.(
            "scanAndCleanStaleMatches: version conflict or write failure deleting stale lobby %s: %s",
            freshMatch.match_id,
            (writeError as Error).message || String(writeError)
          );
          result.skippedDueToRace += 1;
        }
      } else if (candidateType === "inactive_match") {
        const freshHumanAction = getEffectiveLastHumanActionAt(freshMatch);
        if (
          freshMatch.started !== true ||
          nowSeconds - freshHumanAction < inactiveMatchThresholdSec
        ) {
          result.skippedDueToRace += 1;
          continue;
        }

        const existingReport = storage.getMatchReport(freshMatch.match_id);
        if (existingReport) {
          result.skippedDueToRace += 1;
          continue;
        }

        try {
          terminalizeMatchForInactivity(
            freshMatch,
            storage,
            nk,
            logger,
            freshVersion,
            nowSeconds
          );
          result.expiredActiveMatches += 1;
          result.affectedMatchIds.push(freshMatch.match_id);
        } catch (writeError) {
          logger.warn?.(
            "scanAndCleanStaleMatches: version conflict or write failure terminalizing inactive match %s: %s",
            freshMatch.match_id,
            (writeError as Error).message || String(writeError)
          );
          result.skippedDueToRace += 1;
        }
      }
    }

    cursor = response?.cursor ?? "";
    hasMore = Boolean(cursor);
  }

  return result;
}
