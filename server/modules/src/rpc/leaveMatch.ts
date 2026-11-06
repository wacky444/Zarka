/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { deleteUnstartedLobbyAndArtifacts } from "../services/lobbyCleanup";
import { makeNakamaError } from "../utils/errors";
import { MatchRecord } from "../models/types";
import { getRuntimeMatchId } from "../utils/matchIds";
import { recordRosterActivity } from "../utils/activityClock";
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
  const gmIdx = Array.isArray(match.gameMasterUserIds)
    ? match.gameMasterUserIds.indexOf(ctx.userId)
    : -1;
  const wasInMatch = idx !== -1 || gmIdx !== -1;

  if (wasInMatch) {
    if (idx !== -1) {
      match.players.splice(idx, 1);
    }
    if (gmIdx !== -1 && Array.isArray(match.gameMasterUserIds)) {
      match.gameMasterUserIds.splice(gmIdx, 1);
    }
    if (
      match.readyStates &&
      Object.prototype.hasOwnProperty.call(match.readyStates, ctx.userId)
    ) {
      delete match.readyStates[ctx.userId];
    }
    if (match.metadata?.[TUTORIAL_MATCH_METADATA_KEY]) {
      try {
        deleteUnstartedLobbyAndArtifacts(
          match,
          read.version,
          storage,
          nkWrapper,
          logger
        );
      } catch {
        throw makeNakamaError("storage_write_failed", nkruntime.Codes.INTERNAL);
      }
    } else {
      const empty = match.players.length === 0;
      if (empty) {
        try {
          deleteUnstartedLobbyAndArtifacts(
            match,
            read.version,
            storage,
            nkWrapper,
            logger
          );
        } catch {
          throw makeNakamaError("storage_write_failed", nkruntime.Codes.INTERNAL);
        }
      } else {
        recordRosterActivity(match);
        try {
          storage.writeMatch(match, read.version);
          try {
            nkWrapper.matchSignal(
              getRuntimeMatchId(match),
              JSON.stringify({
                type: "sync_players",
                players: match.players,
                size: match.size,
                name: match.name,
                started: match.started,
                gameMasterUserIds: match.gameMasterUserIds,
              })
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
