/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { DEFAULT_REPLAY_VIEW_DISTANCE } from "@shared";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { MatchRecord } from "../models/types";
import type { AdvanceTurnResult } from "../match/advanceTurn";
import {
  tailorMapForCharacter,
  tailorMatchItemsForCharacter,
} from "../utils/matchView";
import { isCharacterIncapacitated } from "../utils/playerCharacter";
import { resolveTurnForMatch } from "../match/turnResolution";

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

  const requestedReady = json.ready === true;

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
  const viewerCharacter = match.playerCharacters?.[ctx.userId] ?? null;
  const viewerIsIncapadited = isCharacterIncapacitated(viewerCharacter);
  if (viewerIsIncapadited) {
    // throw makeNakamaError("character_incapacitated", 9); TODO uncomment when the turn advances automatically when only bots remain
  }

  const effectiveReady = viewerIsIncapadited ? true : requestedReady;
  match.readyStates = match.readyStates ?? {};
  match.readyStates[ctx.userId] = effectiveReady;

  let advanced = false;
  const players = Array.isArray(match.players) ? match.players : [];
  const allReady =
    players.length > 0 &&
    players.every(
      (playerId) =>
        match.readyStates !== undefined &&
        (isCharacterIncapacitated(match.playerCharacters?.[playerId]) ||
          match.readyStates[playerId] === true)
    );
  let advanceResult: AdvanceTurnResult | null = null;
  let resolvedTurnNumber: number | null = null;

  if (allReady) {
    const outcome = resolveTurnForMatch(match, logger);
    if (outcome.advanced) {
      resolvedTurnNumber = outcome.resolvedTurn ?? null;
      advanceResult = { events: outcome.events };
      advanced = true;
    }
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

  if (
    advanced &&
    advanceResult &&
    advanceResult.events.length > 0 &&
    resolvedTurnNumber !== null
  ) {
    try {
      storage.appendReplayTurn({
        match_id: matchId,
        turn: resolvedTurnNumber,
        events: advanceResult.events,
        created_at: Math.floor(Date.now() / 1000),
      });
    } catch (e) {
      logger.warn(
        "update_ready_state replay write failed: %s",
        (e as Error).message
      );
    }
  }

  if (advanced) {
    const viewDistance = DEFAULT_REPLAY_VIEW_DISTANCE;
    const events = advanceResult?.events ?? [];
    try {
      nkWrapper.matchSignal(
        matchId,
        JSON.stringify({
          type: "turn_advanced",
          turn: match.current_turn,
          match_id: matchId,
          readyStates: match.readyStates,
          playerCharacters: match.playerCharacters,
          events,
          viewDistance,
          map: match.map,
          items: match.items,
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
    ready: advanced ? false : effectiveReady,
    all_ready: allReady,
    turn: match.current_turn,
    readyStates: match.readyStates,
    advanced,
    playerCharacters: match.playerCharacters,
    map: tailorMapForCharacter(match.map, viewerCharacter),
    items: tailorMatchItemsForCharacter(match.items, viewerCharacter),
  };

  return JSON.stringify(response);
}
