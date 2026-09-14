/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { MatchRecord } from "../models/types";
import { createNakamaWrapper } from "./nakamaWrapper";
import { StorageService } from "./storageService";

export function restoreMatchesFromStorage(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama
): number {
  logger.info("Starting match restoration from storage...");

  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);

  let restoredCount = 0;
  const matchesToRestore: MatchRecord[] = [];

  try {
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

          const runtimeMatchId = match.runtime_match_id ?? match.match_id;
          if (!storage.isMatchActive(runtimeMatchId)) {
            matchesToRestore.push(match);
          } else {
            logger.debug(
              "Match %s already active with runtime ID %s, skipping",
              match.match_id,
              runtimeMatchId
            );
          }
        }
      }

      cursor = result.cursor || "";
      hasMore = !!cursor;
    }

    logger.info("Found %d matches to restore", matchesToRestore.length);

    for (const match of matchesToRestore) {
      try {
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
          game_id: match.match_id,
          restore: "true",
          players: JSON.stringify(match.players),
        };

        const newRuntimeMatchId = nkWrapper.matchCreate("async_turn", params);
        match.runtime_match_id = newRuntimeMatchId;
        storage.writeMatch(match);

        logger.info(
          "Restored match %s with new runtime ID %s (%s), %d players, turn %d",
          match.match_id,
          newRuntimeMatchId,
          match.name,
          match.players.length,
          match.current_turn
        );

        restoredCount++;
      } catch (e) {
        logger.error(
          "Failed to restore match %s: %s",
          match.match_id,
          (e as Error).message || String(e)
        );
      }
    }

    logger.info(
      "Match restoration complete. Restored %d matches.",
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
