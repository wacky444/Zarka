/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { MatchRecord, TurnRecord } from "../models/types";

// Maybe we don't need this, we just update the state and mark ready
// The turn will advance when all players are ready
export function submitTurnRpc(
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

  if (!json.match_id) {
    throw makeNakamaError(
      "match_id required",
      nkruntime.Codes.INVALID_ARGUMENT
    );
  }

  const matchId: string = json.match_id;
  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);
  const read = storage.getMatch(matchId);

  if (!read) {
    throw makeNakamaError("Match not found", nkruntime.Codes.NOT_FOUND);
  }

  const match: MatchRecord = read.match;
  if (typeof match.started !== "boolean") {
    match.started = false;
  }

  const wasStarted = match.started === true;
  if (!match.started) {
    match.started = true;
  }

  if (match.players.indexOf(ctx.userId) === -1) {
    match.players.push(ctx.userId);
  }

  match.current_turn = (match.current_turn || 0) + 1;

  if (!match.readyStates) {
    match.readyStates = {};
  }
  for (const playerId of match.players) {
    match.readyStates[playerId] = false;
  }

  const turnRecord: TurnRecord = {
    match_id: matchId,
    turn: match.current_turn,
    player: ctx.userId,
    move: json.move,
    created_at: Math.floor(Date.now() / 1000),
  };

  storage.writeMatchWithTurn(match, turnRecord, read.version);

  if (!wasStarted) {
    try {
      nkWrapper.matchSignal(
        matchId,
        JSON.stringify({
          type: "start_match",
        })
      );
    } catch (e) {
      logger.warn(
        "submit_turn: matchSignal start failed: %s",
        (e as Error).message
      );
    }
  }

  const response: import("@shared").SubmitTurnPayload = {
    ok: true,
    turn: match.current_turn,
  };

  return JSON.stringify(response);
}
