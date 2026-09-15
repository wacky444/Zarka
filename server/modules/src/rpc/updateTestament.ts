/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { type UpdateTestamentPayload } from "@shared";
import { MatchRecord } from "../models/types";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { isCharacterDead } from "../utils/playerCharacter";

export function updateTestamentRpc(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
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
  if (!matchId) {
    throw makeNakamaError(
      "match_id required",
      nkruntime.Codes.INVALID_ARGUMENT,
    );
  }

  const recipientId =
    typeof json.recipient_id === "string" && json.recipient_id.trim().length > 0
      ? json.recipient_id.trim()
      : null;
  const storage = new StorageService(createNakamaWrapper(nk));
  const read = storage.getMatch(matchId);
  if (!read) {
    throw makeNakamaError("not_found", nkruntime.Codes.NOT_FOUND);
  }

  const match: MatchRecord = read.match;
  if (!Array.isArray(match.players) ||
    match.players.indexOf(ctx.userId) === -1) {
    throw makeNakamaError("not_in_match", nkruntime.Codes.PERMISSION_DENIED);
  }

  const character = match.playerCharacters?.[ctx.userId];
  if (!character) {
    throw makeNakamaError("character_not_found", nkruntime.Codes.NOT_FOUND);
  }
  if (isCharacterDead(character) || character.testamentProcessed === true) {
    throw makeNakamaError(
      "character_dead",
      nkruntime.Codes.FAILED_PRECONDITION,
    );
  }

  if (recipientId !== null) {
    if (recipientId === ctx.userId) {
      throw makeNakamaError(
        "invalid_testament_recipient",
        nkruntime.Codes.INVALID_ARGUMENT,
      );
    }
    if (match.players.indexOf(recipientId) === -1) {
      throw makeNakamaError(
        "invalid_testament_recipient",
        nkruntime.Codes.INVALID_ARGUMENT,
      );
    }
    const recipient = match.playerCharacters?.[recipientId];
    if (!recipient || isCharacterDead(recipient)) {
      throw makeNakamaError(
        "invalid_testament_recipient",
        nkruntime.Codes.FAILED_PRECONDITION,
      );
    }
  }

  character.testamentRecipientId = recipientId ?? undefined;
  storage.writeMatch(match, read.version);

  const response: UpdateTestamentPayload = {
    ok: true,
    match_id: matchId,
    user_id: ctx.userId,
    recipient_id: recipientId ?? undefined,
    character,
  };
  return JSON.stringify(response);
}
