/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import type {
  MatchChatMessage,
  SaveChatMessagePayload,
  SaveChatMessageRequest,
} from "@shared";

export function saveChatMessageRpc(
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

  let json: SaveChatMessageRequest;
  try {
    json = JSON.parse(payload) as SaveChatMessageRequest;
  } catch {
    throw makeNakamaError("bad_json", nkruntime.Codes.INVALID_ARGUMENT);
  }

  const matchId = typeof json.matchId === "string" ? json.matchId : undefined;
  if (!matchId || !matchId.trim()) {
    throw makeNakamaError("matchId required", nkruntime.Codes.INVALID_ARGUMENT);
  }

  const messageId =
    typeof json.messageId === "string" ? json.messageId : undefined;
  if (!messageId || !messageId.trim()) {
    throw makeNakamaError(
      "messageId required",
      nkruntime.Codes.INVALID_ARGUMENT
    );
  }

  const trimmedContent =
    typeof json.content === "string" ? json.content.trim() : "";
  if (!trimmedContent) {
    throw makeNakamaError("content required", nkruntime.Codes.INVALID_ARGUMENT);
  }
  const normalizedContent = trimmedContent.toLowerCase().replace(/\s+/g, " ");

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

  const createdAt =
    typeof json.createdAt === "number" && isFinite(json.createdAt)
      ? json.createdAt
      : Date.now();

  const history = storage.listChatMessages(matchId, 200);
  const senderHistory = history.filter(
    (entry) => entry.senderId === ctx.userId
  );
  const lastFromSender = senderHistory[senderHistory.length - 1];
  if (lastFromSender && createdAt - lastFromSender.createdAt < 750) {
    throw makeNakamaError(
      "rate_limited_fast",
      nkruntime.Codes.RESOURCE_EXHAUSTED
    );
  }
  if (
    lastFromSender &&
    typeof lastFromSender.content === "string" &&
    lastFromSender.content.trim().toLowerCase().replace(/\s+/g, " ") ===
      normalizedContent
  ) {
    throw makeNakamaError(
      "duplicate_message",
      nkruntime.Codes.RESOURCE_EXHAUSTED
    );
  }
  const window10s = senderHistory.filter(
    (entry) => createdAt - entry.createdAt <= 10_000
  );
  if (window10s.length >= 4) {
    throw makeNakamaError(
      "rate_limited_10s",
      nkruntime.Codes.RESOURCE_EXHAUSTED
    );
  }
  const window5m = senderHistory.filter(
    (entry) => createdAt - entry.createdAt <= 300_000
  );
  if (window5m.length >= 25) {
    throw makeNakamaError(
      "rate_limited_5m",
      nkruntime.Codes.RESOURCE_EXHAUSTED
    );
  }

  const message: MatchChatMessage = {
    matchId,
    messageId,
    senderId: ctx.userId,
    content: trimmedContent,
    createdAt,
    username: typeof json.username === "string" ? json.username : undefined,
    code: typeof json.code === "number" ? json.code : undefined,
    persistent:
      typeof json.persistent === "boolean" ? json.persistent : undefined,
    system: typeof json.system === "boolean" ? json.system : undefined,
  };

  try {
    storage.appendChatMessage(message);
  } catch (error) {
    logger.error(
      "Failed to persist chat message %s for %s: %s",
      message.messageId,
      message.matchId,
      (error as Error).message || String(error)
    );
    throw makeNakamaError("persist_failed", nkruntime.Codes.INTERNAL);
  }

  const response: SaveChatMessagePayload = {
    ok: true,
    match_id: matchId,
    message_id: messageId,
  };
  return JSON.stringify(response);
}
