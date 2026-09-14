/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { MatchRecord } from "../models/types";
import { createNakamaWrapper, NakamaWrapper } from "./nakamaWrapper";
import { StorageService } from "./storageService";

type StoredMatch = {
  match: MatchRecord;
  version: string;
};

type ActiveRuntimeMatch = {
  matchId: string;
};

function readGameIdFromLabel(label: string): string | null {
  try {
    const parsed = JSON.parse(label) as { game_id?: unknown };
    return typeof parsed.game_id === "string" && parsed.game_id.length > 0
      ? parsed.game_id
      : null;
  } catch {
    return null;
  }
}

function listActiveMatchesByGameId(
  nk: NakamaWrapper
): { [gameId: string]: ActiveRuntimeMatch[] } {
  const activeMatchesByGameId: {
    [gameId: string]: ActiveRuntimeMatch[];
  } = {};
  const activeMatches = nk.matchList(1000, true, "", 0, 500, "");

  for (const activeMatch of activeMatches) {
    const gameId = readGameIdFromLabel(activeMatch.label);
    if (!gameId) {
      continue;
    }
    const matches = activeMatchesByGameId[gameId] ?? [];
    matches.push({ matchId: activeMatch.matchId });
    activeMatchesByGameId[gameId] = matches;
  }

  return activeMatchesByGameId;
}

function persistRuntimeMatchId(
  storage: StorageService,
  storedMatch: StoredMatch,
  runtimeMatchId: string
): MatchRecord {
  const match = {
    ...storedMatch.match,
    runtime_match_id: runtimeMatchId,
  };
  storage.writeMatch(match, storedMatch.version);

  const verified = storage.getMatch(match.match_id);
  if (verified?.match.runtime_match_id !== runtimeMatchId) {
    throw new Error(
      `Failed to verify runtime match ID for game ${match.match_id}`
    );
  }

  return match;
}

export function restoreMatchesFromStorage(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama
): number {
  logger.info("Starting match restoration from storage...");

  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);

  let restoredCount = 0;
  const matchesToRestore: StoredMatch[] = [];

  try {
    const activeMatchesByGameId = listActiveMatchesByGameId(nkWrapper);
    let cursor = "";
    let hasMore = true;

    while (hasMore) {
      const result = storage.listServerMatches(100, cursor);

      if (!result || !result.objects || result.objects.length === 0) {
        hasMore = false;
        break;
      }

      for (const obj of result.objects) {
        if (obj && obj.value) {
          const match = obj.value as MatchRecord;

          if (typeof match.started !== "boolean") {
            match.started = false;
          }

          if (match.removed && match.removed !== 0) {
            logger.debug("Match %s marked removed, skipping", match.match_id);
            continue;
          }

          matchesToRestore.push({ match, version: obj.version });
        }
      }

      cursor = result.cursor || "";
      hasMore = !!cursor;
    }

    logger.info("Found %d stored matches to reconcile", matchesToRestore.length);

    for (const storedMatch of matchesToRestore) {
      const gameId = storedMatch.match.match_id;
      const candidates = activeMatchesByGameId[gameId] ?? [];

      try {
        if (candidates.length > 1) {
          const storedRuntimeMatchId = storedMatch.match.runtime_match_id;
          let matchingCandidate: ActiveRuntimeMatch | null = null;
          for (const candidate of candidates) {
            if (candidate.matchId === storedRuntimeMatchId) {
              matchingCandidate = candidate;
              break;
            }
          }
          if (!matchingCandidate) {
            logger.error(
              "Found %d runtime matches for game %s with no matching stored runtime ID; skipping automatic reconciliation",
              candidates.length,
              gameId
            );
            continue;
          }
          logger.warn(
            "Found %d runtime matches for game %s; keeping stored runtime ID %s",
            candidates.length,
            gameId,
            matchingCandidate.matchId
          );
          persistRuntimeMatchId(storage, storedMatch, matchingCandidate.matchId);
          restoredCount++;
          continue;
        }

        if (candidates.length === 1) {
          const candidate = candidates[0];
          if (storedMatch.match.runtime_match_id !== candidate.matchId) {
            persistRuntimeMatchId(storage, storedMatch, candidate.matchId);
            logger.info(
              "Adopted runtime match %s for game %s from startup reconciliation",
              candidate.matchId,
              gameId
            );
            restoredCount++;
          } else {
            logger.debug(
              "Match %s already active with runtime ID %s, skipping",
              gameId,
              candidate.matchId
            );
          }
          continue;
        }

        const legacyRuntimeMatchId = storedMatch.match.runtime_match_id;
        if (
          legacyRuntimeMatchId &&
          storage.isMatchActive(legacyRuntimeMatchId)
        ) {
          logger.debug(
            "Match %s is active with legacy runtime ID %s but has no game ID label, skipping",
            gameId,
            legacyRuntimeMatchId
          );
          continue;
        }

        const match = storedMatch.match;
        const params: { [key: string]: string } = {
          size: String(match.size),
          creator: match.creator || "",
          name: match.name || "",
          cols: String(match.cols || 0),
          rows: String(match.rows || 0),
          roundTime: match.roundTime || "23:00",
          autoSkip: String(match.autoSkip !== false),
          botPlayers: String(match.botPlayers || 0),
          current_turn: String(match.current_turn),
          started: String(match.started),
          lastAutoAdvanceAt: String(match.lastAutoAdvanceAt || 0),
          game_id: gameId,
          restore: "true",
          players: JSON.stringify(match.players),
        };

        const runtimeMatchId = nkWrapper.matchCreate("async_turn", params);
        if (!storage.isMatchActive(runtimeMatchId)) {
          throw new Error(
            `Created runtime match ${runtimeMatchId} could not be verified`
          );
        }

        persistRuntimeMatchId(storage, storedMatch, runtimeMatchId);
        activeMatchesByGameId[gameId] = [{ matchId: runtimeMatchId }];

        logger.info(
          "Restored game %s with new runtime ID %s (%s), %d players, turn %d",
          gameId,
          runtimeMatchId,
          match.name,
          match.players.length,
          match.current_turn
        );

        restoredCount++;
      } catch (e) {
        logger.error(
          "Failed to reconcile game %s: %s",
          gameId,
          (e as Error).message || String(e)
        );
      }
    }

    logger.info(
      "Match restoration complete. Reconciled %d matches.",
      restoredCount
    );
    return restoredCount;
  } catch (e) {
    logger.error(
      "Error during match restoration: %s",
      (e as Error).message || String(e)
    );
    return restoredCount;
  }
}
