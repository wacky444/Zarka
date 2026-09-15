/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { isAdminUser } from "../utils/admin";
import { makeNakamaError } from "../utils/errors";

export function getMatchReportRpc(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  if (!ctx?.userId) {
    throw makeNakamaError("No user context", nkruntime.Codes.INVALID_ARGUMENT);
  }
  if (!payload) {
    throw makeNakamaError("Missing payload", nkruntime.Codes.INVALID_ARGUMENT);
  }

  let parsed: { match_id?: unknown };
  try {
    parsed = JSON.parse(payload) as { match_id?: unknown };
  } catch {
    throw makeNakamaError("bad_json", nkruntime.Codes.INVALID_ARGUMENT);
  }
  const matchId = typeof parsed.match_id === "string" ? parsed.match_id : "";
  if (!matchId) {
    throw makeNakamaError(
      "match_id required",
      nkruntime.Codes.INVALID_ARGUMENT,
    );
  }

  const storage = new StorageService(createNakamaWrapper(nk));
  const report = storage.getMatchReport(matchId);
  if (!report) {
    throw makeNakamaError("not_ready", nkruntime.Codes.NOT_FOUND);
  }

  const isParticipant = report.players.some(
    (player) => player.player_id === ctx.userId,
  );
  if (!isParticipant && !isAdminUser(nk, ctx.userId)) {
    throw makeNakamaError("not_in_match", nkruntime.Codes.PERMISSION_DENIED);
  }

  return JSON.stringify({ ok: true, report });
}
