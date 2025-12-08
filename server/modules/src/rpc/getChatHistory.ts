/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import type { GetChatHistoryPayload } from "@shared";

export function getChatHistoryRpc(
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

  const matchId: string | undefined =
    typeof json.match_id === "string" ? json.match_id : undefined;
  if (!matchId || !matchId.trim()) {
    throw makeNakamaError(
      "match_id required",
      nkruntime.Codes.INVALID_ARGUMENT
    );
  }

  const limit =
    typeof json.limit === "number"
      ? Math.max(1, Math.min(200, Math.floor(json.limit)))
      : undefined;

  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);
  const storedMatch = storage.getMatch(matchId);
  if (!storedMatch || !storedMatch.match) {
    throw makeNakamaError("Match not found", nkruntime.Codes.NOT_FOUND);
  }

  const match = storedMatch.match;
  if (
    !Array.isArray(match.players) ||
    match.players.indexOf(ctx.userId) === -1
  ) {
    throw makeNakamaError(
      "Not a match participant",
      nkruntime.Codes.PERMISSION_DENIED
    );
  }

  const messages = storage.listChatMessages(matchId, limit);
  const response: GetChatHistoryPayload = {
    ok: true,
    match_id: matchId,
    messages,
  };
  return JSON.stringify(response);
}
