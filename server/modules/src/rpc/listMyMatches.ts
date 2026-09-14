/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { MatchRecord } from "../models/types";

export function listMyMatchesRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx || !ctx.userId) {
    throw makeNakamaError("No user context", nkruntime.Codes.INVALID_ARGUMENT);
  }

  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);

  try {
    const allMatches = storage.listAllMatches();
    const matches: Array<{
      match_id: string;
      runtime_match_id?: string;
      size: number;
      players: string[];
      current_turn: number;
      created_at: number;
      creator?: string;
      cols?: number;
      rows?: number;
      roundTime?: string;
      autoSkip?: boolean;
      botPlayers?: number;
      name?: string;
      started?: boolean;
    }> = [];

    for (const { match } of allMatches) {
      if (typeof match.started !== "boolean") {
        match.started = false;
      }
      if (
        match.players &&
        match.players.indexOf(ctx.userId) !== -1 &&
        (match.removed === 0 || match.removed === undefined)
      ) {
        matches.push({
          match_id: match.match_id,
          runtime_match_id: match.runtime_match_id ?? match.match_id,
          size: match.size,
          players: match.players,
          current_turn: match.current_turn,
          created_at: match.created_at,
          creator: match.creator,
          cols: match.cols,
          rows: match.rows,
          roundTime: match.roundTime,
          autoSkip: match.autoSkip,
          botPlayers: match.botPlayers,
          name: match.name,
          started: match.started,
        });
      }
    }

    matches.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    const response: import("@shared").ListMyMatchesPayload = {
      ok: true,
      matches,
    };

    return JSON.stringify(response);
  } catch (e) {
    logger.error(
      "Error in list_my_matches: %s",
      (e as Error).message || String(e)
    );

    const response: import("@shared").ListMyMatchesPayload = {
      ok: false,
      error: (e as Error).message || String(e),
    };

    return JSON.stringify(response);
  }
}
