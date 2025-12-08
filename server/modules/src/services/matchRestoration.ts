/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { MatchRecord } from "../models/types";
import type { ReplayRecord } from "@shared";
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
  const matchesToRestore: Array<{ match: MatchRecord; version: string }> = [];

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

          if (!storage.isMatchActive(match.match_id)) {
            matchesToRestore.push({ match, version: obj.version });
          } else {
            logger.debug("Match %s already active, skipping", match.match_id);
          }
        }
      }

      cursor = result.cursor || "";
      hasMore = !!cursor;
    }

    logger.info("Found %d matches to restore", matchesToRestore.length);

    for (const { match, version } of matchesToRestore) {
      const oldMatchId = match.match_id;

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
          restore: "true",
          old_match_id: oldMatchId,
          players: JSON.stringify(match.players),
        };

        const newMatchId = nkWrapper.matchCreate("async_turn", params);

        logger.info(
          "Restored match. Old ID: %s, New ID: %s (%s) with %d players, turn %d",
          oldMatchId,
          newMatchId,
          match.name,
          match.players.length,
          match.current_turn
        );

        try {
          storage.deleteMatch(oldMatchId);
        } catch (deleteError) {
          logger.warn(
            "Failed to delete old match record %s: %s",
            oldMatchId,
            (deleteError as Error).message || String(deleteError)
          );
        }

        match.match_id = newMatchId;
        try {
          storage.writeMatch(match);
        } catch (writeError) {
          logger.error(
            "Failed to write new match record for %s: %s",
            newMatchId,
            (writeError as Error).message || String(writeError)
          );
        }

        const replayEntries = storage.listReplaysForMatch(oldMatchId);
        if (replayEntries.length > 0) {
          for (const entry of replayEntries) {
            const updatedReplay: ReplayRecord = {
              ...entry.replay,
              match_id: newMatchId,
            };
            try {
              storage.appendReplayTurn(updatedReplay);
              storage.deleteReplayByKey(entry.key);
            } catch (replayError) {
              logger.warn(
                "Failed to migrate replay turn %s for %s: %s",
                entry.key,
                newMatchId,
                (replayError as Error).message || String(replayError)
              );
            }
          }
        }

        try {
          storage.migrateChatLog(oldMatchId, newMatchId);
        } catch (chatError) {
          logger.warn(
            "Failed to migrate chat log for %s -> %s: %s",
            oldMatchId,
            newMatchId,
            (chatError as Error).message || String(chatError)
          );
        }

        restoredCount++;
      } catch (e) {
        logger.error(
          "Failed to restore match %s: %s",
          oldMatchId,
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
