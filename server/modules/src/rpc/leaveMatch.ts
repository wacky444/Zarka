/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { MatchRecord } from "../models/types";
import { getRuntimeMatchId } from "../utils/matchIds";
import {
  RANKED_MATCH_METADATA_KEY,
  TUTORIAL_MATCH_METADATA_KEY
} from "@shared";

export function leaveMatchRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx || !ctx.userId) {
    throw makeNakamaError("No user context", nkruntime.Codes.INVALID_ARGUMENT);
  }

  if (!payload || payload === "") {
    throw makeNakamaError("Missing payload", nkruntime.Codes.INVALID_ARGUMENT);
  }

  let json: any;
  try {
    json = JSON.parse(payload);
  } catch {
    throw makeNakamaError("bad_json", nkruntime.Codes.INVALID_ARGUMENT);
  }

  const matchId: string = json.match_id;
  if (!matchId || matchId === "") {
    throw makeNakamaError(
      "match_id required",
      nkruntime.Codes.INVALID_ARGUMENT
    );
  }

  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);
  const read = storage.getMatch(matchId);

  if (!read) {
    throw makeNakamaError("not_found", nkruntime.Codes.NOT_FOUND);
  }

  const match: MatchRecord = read.match;
  if (match.metadata?.[RANKED_MATCH_METADATA_KEY]) {
    throw makeNakamaError(
      "ranked_roster_locked",
      nkruntime.Codes.PERMISSION_DENIED
    );
  }
  const idx = match.players.indexOf(ctx.userId);
  const wasInMatch = idx !== -1;

  if (wasInMatch) {
    match.players.splice(idx, 1);
    if (
      match.readyStates &&
      Object.prototype.hasOwnProperty.call(match.readyStates, ctx.userId)
    ) {
      delete match.readyStates[ctx.userId];
    }
    if (match.metadata?.[TUTORIAL_MATCH_METADATA_KEY]) {
      match.removed = 1;
      match.started = false;
      try {
        storage.writeMatch(match, read.version);
      } catch {
        throw makeNakamaError("storage_write_failed", nkruntime.Codes.INTERNAL);
      }
      try {
        nkWrapper.matchSignal(
          getRuntimeMatchId(match),
          JSON.stringify({ type: "match_removed" })
        );
      } catch (signalError) {
        logger.debug(
          "leave_match tutorial removal signal failed: %s",
          (signalError as Error).message
        );
      }
      try {
        for (const replay of storage.listReplaysForMatch(matchId)) {
          storage.deleteReplayByKey(replay.key);
        }
        storage.deleteChatLog(matchId);
        storage.deleteMatch(matchId);
      } catch (cleanupError) {
        logger.warn(
          "leave_match tutorial cleanup failed for %s: %s",
          matchId,
          (cleanupError as Error).message || String(cleanupError)
        );
      }
    } else {
      const empty = match.players.length === 0;
      if (empty) {
        match.removed = 1;
        match.started = false;
      }
      try {
        storage.writeMatch(match, read.version);
        try {
          nkWrapper.matchSignal(
            getRuntimeMatchId(match),
            JSON.stringify(
              empty
                ? { type: "match_removed" }
                : {
                    type: "sync_players",
                    players: match.players,
                    size: match.size,
                    name: match.name,
                    started: match.started,
                  }
            )
          );
        } catch (signalError) {
          logger.debug(
            "leave_match: matchSignal failed: %s",
            (signalError as Error).message
          );
        }
      } catch {
        throw makeNakamaError("storage_write_failed", nkruntime.Codes.INTERNAL);
      }
      if (empty) {
        try {
          for (const turn of storage.listTurnsForMatch(matchId)) {
            storage.deleteTurnByKey(turn.key);
          }
          for (const replay of storage.listReplaysForMatch(matchId)) {
            storage.deleteReplayByKey(replay.key);
          }
          storage.deleteChatLog(matchId);
          storage.deleteMatchReport(matchId);
          storage.deleteMatch(matchId);
        } catch (cleanupError) {
          logger.warn(
            "leave_match: empty match cleanup failed for %s: %s",
            matchId,
            (cleanupError as Error).message || String(cleanupError)
          );
        }
      }
    }
  }

  const response: import("@shared").LeaveMatchPayload = {
    ok: true,
    match_id: matchId,
    players: match.players,
    left: wasInMatch,
  };

  return JSON.stringify(response);
}
