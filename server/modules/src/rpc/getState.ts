/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { MatchRecord } from "../models/types";
import { syncBandolierLoadCapacity } from "@shared";
import { tailorMatchForPlayer } from "../utils/matchView";
import { isAdminUser } from "../utils/admin";

export function getStateRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!payload || payload === "") {
    return JSON.stringify({ error: "missing_payload" });
  }

  let json: any;
  try {
    json = JSON.parse(payload);
  } catch {
    return JSON.stringify({ error: "bad_json" });
  }

  if (!json.match_id || json.match_id === "") {
    return JSON.stringify({ error: "match_id_required" });
  }

  const matchId: string = json.match_id;
  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);
  const read = storage.getMatch(matchId);

  if (!read) {
    return JSON.stringify({ error: "not_found" });
  }

  const match: MatchRecord = read.match;
  logger.debug(
    "get_state match=%s user=%s turn=%d traps=%d",
    matchId,
    ctx?.userId ?? "unknown",
    match.current_turn ?? 0,
    match.traps?.length ?? 0,
  );
  if (typeof match.started !== "boolean") {
    match.started = false;
  }

  const limit = 50;
  const start = Math.max(1, (match.current_turn || 0) - limit + 1);
  const turns = storage.readTurns(matchId, start, match.current_turn || 0);

  const viewerId = ctx?.userId ?? null;
  const viewAll = json.view_all === true && isAdminUser(nk, viewerId);
  const tailoredMatch = tailorMatchForPlayer(match, viewerId, viewAll);
  const visibleCharacters = tailoredMatch.playerCharacters;
  const trackerViews = visibleCharacters?.[viewerId ?? ""]?.trackerViews ?? [];
  logger.debug(
    "get_state tracker payload match=%s viewer=%s turn=%d stored_trackers=%s viewer_views=%s visible_positions=%s",
    matchId,
    viewerId ?? "unknown",
    match.current_turn ?? 0,
    JSON.stringify(
      (match.trackers ?? []).map((tracker) => ({
        id: tracker.id,
        ownerId: tracker.ownerId,
        targetId: tracker.targetId,
        placedTurn: tracker.placedTurn,
        expiresTurn: tracker.expiresTurn,
      })),
    ),
    JSON.stringify(trackerViews),
    JSON.stringify(
      Object.fromEntries(
        Object.entries(visibleCharacters ?? {}).map(([playerId, character]) => [
          playerId,
          character.position?.coord ?? null,
        ]),
      ),
    ),
  );
  if (visibleCharacters) {
    for (const playerId in visibleCharacters) {
      if (!Object.prototype.hasOwnProperty.call(visibleCharacters, playerId)) {
        continue;
      }
      syncBandolierLoadCapacity(visibleCharacters[playerId]);
    }
  }

  const response: import("@shared").GetStatePayload = {
    match: tailoredMatch,
    turns,
  };

  return JSON.stringify(response);
}
