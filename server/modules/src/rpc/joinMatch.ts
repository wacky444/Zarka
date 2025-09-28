/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { MatchRecord } from "../models/types";

export function joinMatchRpc(
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
  if (typeof match.started !== "boolean") {
    match.started = false;
  }

  let joinedNow = false;
  let triggeredStart = false;

  if (match.players.indexOf(ctx.userId) === -1) {
    const current = match.players.length;
    if (current >= (match.size || 2)) {
      throw makeNakamaError("match_full", nkruntime.Codes.FAILED_PRECONDITION);
    }
    match.players.push(ctx.userId);
    joinedNow = true;

    if (!match.started && match.players.length >= 2) {
      match.started = true;
      triggeredStart = true;
    }

    storage.writeMatch(match, read.version);
  } else if (!match.started && match.players.length >= 2) {
    match.started = true;
    triggeredStart = true;
    storage.writeMatch(match, read.version);
  }

  if (triggeredStart) {
    try {
      nkWrapper.matchSignal(
        matchId,
        JSON.stringify({
          type: "start_match",
        })
      );
    } catch (e) {
      logger.warn(
        "join_match: matchSignal start failed: %s",
        (e as Error).message
      );
    }
  }

  const response: import("@shared").JoinMatchPayload = {
    ok: true,
    match_id: matchId,
    size: match.size,
    players: match.players,
    joined: joinedNow,
    name: match.name,
    started: match.started,
  };

  return JSON.stringify(response);
}
