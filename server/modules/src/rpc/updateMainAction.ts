/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { MatchRecord } from "../models/types";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";

export function updateMainActionRpc(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
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
  const matchId: string | undefined = json.match_id;
  const actionIdRaw: unknown = json.action_id;
  const actionId = typeof actionIdRaw === "string" ? actionIdRaw.trim() : "";
  const clearAction = actionId.length === 0;
  if (!matchId) {
    throw makeNakamaError(
      "match_id required",
      nkruntime.Codes.INVALID_ARGUMENT
    );
  }
  if (!clearAction && actionId.length === 0) {
    throw makeNakamaError(
      "action_id required",
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
  if (!match.players || match.players.indexOf(ctx.userId) === -1) {
    throw makeNakamaError("not_in_match", nkruntime.Codes.PERMISSION_DENIED);
  }
  if (!match.playerCharacters) {
    throw makeNakamaError("no_character", nkruntime.Codes.FAILED_PRECONDITION);
  }
  const character = match.playerCharacters[ctx.userId];
  if (!character) {
    throw makeNakamaError("no_character", nkruntime.Codes.FAILED_PRECONDITION);
  }
  character.actionPlan = character.actionPlan ?? {};
  if (clearAction) {
    if (character.actionPlan.main) {
      delete character.actionPlan.main;
    }
    if (
      character.actionPlan.secondary === undefined &&
      character.actionPlan.nextMain === undefined &&
      character.actionPlan.main === undefined
    ) {
      delete character.actionPlan;
    }
  } else {
    const previous = character.actionPlan.main ?? {};
    character.actionPlan.main = { ...previous, actionId };
  }
  storage.writeMatch(match, read.version);
  const response: import("@shared").UpdateMainActionPayload = {
    ok: true,
    match_id: matchId,
    user_id: ctx.userId,
    action_id: clearAction ? undefined : actionId,
  };
  return JSON.stringify(response);
}
