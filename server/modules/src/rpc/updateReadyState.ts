/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { MatchRecord } from "../models/types";
import { advanceTurn } from "../match/advanceTurn";

export function updateReadyStateRpc(
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

  const ready = json.ready === true;

  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);
  const read = storage.getMatch(matchId);

  if (!read) {
    throw makeNakamaError("not_found", nkruntime.Codes.NOT_FOUND);
  }

  const match: MatchRecord = read.match;
  if (
    !Array.isArray(match.players) ||
    match.players.indexOf(ctx.userId) === -1
  ) {
    throw makeNakamaError("not_in_match", nkruntime.Codes.PERMISSION_DENIED);
  }
  turn: match.current_turn, (match.readyStates = match.readyStates ?? {});
  match.readyStates[ctx.userId] = ready;

  let advanced = false;
  const players = Array.isArray(match.players) ? match.players : [];
  const allReady =
    players.length > 0 &&
    players.every(
      (playerId) =>
        match.readyStates !== undefined && match.readyStates[playerId] === true
    );

  if (allReady) {
    advanceTurn(match);
    match.current_turn = (match.current_turn || 0) + 1;
    const resetStates: Record<string, boolean> = {};
    for (const playerId of players) {
      resetStates[playerId] = false;
    }
    match.readyStates = resetStates;
    advanced = true;
  }

  try {
    storage.writeMatch(match, read.version);
  } catch (e) {
    logger.warn(
      "update_ready_state storage write failed: %s",
      (e as Error).message
    );
    throw makeNakamaError("storage_write_failed", nkruntime.Codes.INTERNAL);
  }

  if (advanced) {
    try {
      nkWrapper.matchSignal(
        matchId,
        JSON.stringify({
          type: "turn_advanced",
          match_id: matchId,
          current_turn: match.current_turn,
          readyStates: match.readyStates,
          playerCharacters: match.playerCharacters,
        })
      );
    } catch (e) {
      logger.debug(
        "update_ready_state matchSignal failed: %s",
        (e as Error).message
      );
    }
  }

  const response: import("@shared").UpdateReadyStatePayload = {
    ok: true,
    match_id: matchId,
    ready: advanced ? false : ready,
    all_ready: allReady,
    turn: match.current_turn,
    readyStates: match.readyStates,
    advanced,
    playerCharacters: match.playerCharacters,
  };

  return JSON.stringify(response);
}
