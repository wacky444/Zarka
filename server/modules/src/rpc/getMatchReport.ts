/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { buildMatchReport } from "../match/matchReport";
import { getAliveCharacterIds } from "../match/checkEndGame";
import { isAdminUser } from "../utils/admin";
import { makeNakamaError } from "../utils/errors";
import type { MatchReport } from "@shared";

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
  const stored = storage.getMatch(matchId);
  if (!stored) {
    throw makeNakamaError("not_found", nkruntime.Codes.NOT_FOUND);
  }

  const isParticipant =
    Array.isArray(stored.match.players) &&
    stored.match.players.indexOf(ctx.userId) !== -1;
  if (!isParticipant && !isAdminUser(nk, ctx.userId)) {
    throw makeNakamaError("not_in_match", nkruntime.Codes.PERMISSION_DENIED);
  }

  let report = storage.getMatchReport(matchId);
  if (!report) {
    if (!stored.match.removed || stored.match.removed === 0) {
      throw makeNakamaError("not_ready", nkruntime.Codes.NOT_FOUND);
    }
    const aliveCharacterIds = getAliveCharacterIds(stored.match);
    const reason: MatchReport["reason"] =
      aliveCharacterIds.length > 0 ? "last_alive" : "all_dead";
    const users =
      stored.match.players.length > 0
        ? nk.usersGetId(stored.match.players) ?? []
        : [];
    report = buildMatchReport(
      stored.match,
      storage,
      Math.floor(Date.now() / 1000),
      reason,
      stored.match.current_turn,
      [],
      users,
    );
    storage.writeMatchReport(report);
  }

  return JSON.stringify({ ok: true, report });
}
