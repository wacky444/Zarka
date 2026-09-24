/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  DEFAULT_REPLAY_VIEW_DISTANCE,
  TUTORIAL_CELL_COORDS,
  TUTORIAL_MATCH_METADATA_KEY
} from "@shared";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { MatchRecord } from "../models/types";
import type { AdvanceTurnResult } from "../match/advanceTurn";
import {
  tailorMapForCharacter,
  tailorMatchItemsForCharacter,
  tailorPlayerCharactersForViewer,
} from "../utils/matchView";
import { isCharacterIncapacitated } from "../utils/playerCharacter";
import { resolveTurnForMatch } from "../match/turnResolution";
import { sendTutorialBotMessageForTurn } from "../match/TutorialBotChat";
import { getAliveCharacterIds } from "../match/checkEndGame";
import { validateTime } from "../utils/validation";
import { getRuntimeMatchId } from "../utils/matchIds";
import { isAdminUser } from "../utils/admin";
import { createReplaySnapshot } from "../match/replay/snapshot";

const READY_ADVANCE_MARGIN_MINUTES = 12 * 60;

function shouldDeferAutomaticAdvance(
  match: MatchRecord,
  nowMs: number,
): boolean {
  const roundTime = validateTime(match.roundTime);
  if (!roundTime) {
    return false;
  }
  const [hoursText, minutesText] = roundTime.split(":");
  const targetMinutes = Number(hoursText) * 60 + Number(minutesText);
  const now = new Date(nowMs);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  if (currentMinutes >= targetMinutes) {
    return true;
  }
  return targetMinutes - currentMinutes <= READY_ADVANCE_MARGIN_MINUTES;
}

export function updateReadyStateRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
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
  if (!matchId || matchId === "") {
    throw makeNakamaError(
      "match_id required",
      nkruntime.Codes.INVALID_ARGUMENT,
    );
  }

  const requestedReady = json.ready === true;
  const viewAll = json.view_all === true && isAdminUser(nk, ctx.userId);

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
  if (match.removed && match.removed !== 0) {
    throw makeNakamaError("match_ended", nkruntime.Codes.FAILED_PRECONDITION);
  }
  const viewerCharacter = match.playerCharacters?.[ctx.userId] ?? null;
  const viewerIsIncapadited = isCharacterIncapacitated(viewerCharacter);
  if (viewerIsIncapadited) {
    // throw makeNakamaError("character_incapacitated", 9); TODO uncomment when the turn advances automatically when only bots remain
  }

  if (
    match.metadata?.[TUTORIAL_MATCH_METADATA_KEY] &&
    requestedReady &&
    match.current_turn === 4 &&
    viewerCharacter
  ) {
    const mainPlan = viewerCharacter.actionPlan?.main;
    const isMoveToStart =
      mainPlan?.actionId === "move" &&
      mainPlan.targetLocationId?.q === TUTORIAL_CELL_COORDS.playerStart.q &&
      mainPlan.targetLocationId?.r === TUTORIAL_CELL_COORDS.playerStart.r;
    if (!isMoveToStart) {
      throw makeNakamaError(
        "tutorial_must_move_to_bot",
        nkruntime.Codes.FAILED_PRECONDITION,
      );
    }
  }

  if (
    match.metadata?.[TUTORIAL_MATCH_METADATA_KEY] &&
    requestedReady &&
    match.current_turn === 5 &&
    viewerCharacter
  ) {
    const mainPlan = viewerCharacter.actionPlan?.main;
    const isScareToDoomed =
      mainPlan?.actionId === "scare" &&
      (mainPlan.extraExecutions ?? 0) >= 1 &&
      mainPlan.targetLocationId?.q === TUTORIAL_CELL_COORDS.doomed.q &&
      mainPlan.targetLocationId?.r === TUTORIAL_CELL_COORDS.doomed.r;
    if (!isScareToDoomed) {
      throw makeNakamaError(
        "tutorial_must_scare_to_doomed_cell",
        nkruntime.Codes.FAILED_PRECONDITION,
      );
    }
  }

  const effectiveReady = viewerIsIncapadited ? true : requestedReady;
  match.readyStates = match.readyStates ?? {};
  match.readyStates[ctx.userId] = effectiveReady;

  let advanced = false;
  const trapsBeforeTurn = match.traps?.length ?? 0;
  const players = Array.isArray(match.players) ? match.players : [];
  const allReady =
    players.length > 0 &&
    players.every(
      (playerId) =>
        match.readyStates !== undefined &&
        (isCharacterIncapacitated(match.playerCharacters?.[playerId]) ||
          match.readyStates[playerId] === true),
    );
  let advanceResult: AdvanceTurnResult | null = null;
  let resolvedTurnNumber: number | null = null;

  if (allReady) {
    const outcome = resolveTurnForMatch(match, logger, nk);
    if (outcome.advanced) {
      resolvedTurnNumber = outcome.resolvedTurn ?? null;
      advanceResult = { events: outcome.events };
      advanced = true;
      const advancedAtMs = Date.now();
      if (shouldDeferAutomaticAdvance(match, advancedAtMs)) {
        match.lastAutoAdvanceAt = Math.floor(advancedAtMs / 1000);
      }
    }
  }

  const trapEvents = advanceResult?.events.filter(
    (event) => event.kind === "player" && event.action.actionId === "place_trap",
  ) ?? [];
  if (trapEvents.length > 0) {
    logger.debug(
      "update_ready_state traps resolved match=%s turn=%d before=%d after=%d trap_events=%d",
      matchId,
      match.current_turn,
      trapsBeforeTurn,
      match.traps?.length ?? 0,
      trapEvents.length,
    );
  }

  try {
    storage.writeMatch(match, read.version);
    if (trapEvents.length > 0) {
      const persisted = storage.getMatch(matchId);
      logger.debug(
        "update_ready_state traps persisted match=%s turn=%d in_memory=%d stored=%d",
        matchId,
        match.current_turn,
        match.traps?.length ?? 0,
        persisted?.match.traps?.length ?? -1,
      );
    }
  } catch (e) {
    logger.warn(
      "update_ready_state storage write failed: %s",
      (e as Error).message,
    );
    throw makeNakamaError("storage_write_failed", nkruntime.Codes.INTERNAL);
  }

  if (advanced && advanceResult && resolvedTurnNumber !== null) {
    try {
      storage.appendReplayTurn({
        match_id: matchId,
        turn: resolvedTurnNumber,
        events: advanceResult.events,
        snapshot: createReplaySnapshot(match),
        created_at: Math.floor(Date.now() / 1000),
      });
    } catch (e) {
      logger.warn(
        "update_ready_state replay write failed: %s",
        (e as Error).message,
      );
    }
  }

  if (advanced && advanceResult) {
    sendTutorialBotMessageForTurn(
      match,
      advanceResult.events,
      nk,
      logger
    );
  }

  if (!advanced) {
    try {
      nkWrapper.matchSignal(
        getRuntimeMatchId(match),
        JSON.stringify({
          type: "ready_state_changed",
          match_id: matchId,
          readyStates: match.readyStates,
        }),
      );
    } catch (e) {
      logger.debug(
        "update_ready_state ready_state_changed signal failed: %s",
        (e as Error).message,
      );
    }
  }

  if (advanced) {
    const viewDistance = DEFAULT_REPLAY_VIEW_DISTANCE;
    const events = advanceResult?.events ?? [];
    try {
      nkWrapper.matchSignal(
        getRuntimeMatchId(match),
        JSON.stringify({
          type: "turn_advanced",
          turn: match.current_turn,
          match_id: matchId,
          readyStates: match.readyStates,
          lastAutoAdvanceAt: match.lastAutoAdvanceAt,
          deadCharacters: match.deadCharacters,
          playerCharacters: match.playerCharacters,
          teams: match.teams,
          events,
          viewDistance,
          map: match.map,
          items: match.items,
          traps: match.traps,
        }),
      );
    } catch (e) {
      logger.debug(
        "update_ready_state matchSignal failed: %s",
        (e as Error).message,
      );
    }

    if (match.removed && match.removed !== 0) {
      try {
        const alive = getAliveCharacterIds(match);
        const winnerId = alive.length > 0 ? alive[0] : undefined;
        const reason = alive.length === 0 ? "all_dead" : "last_alive";
        nkWrapper.matchSignal(
          getRuntimeMatchId(match),
          JSON.stringify({
            type: "match_ended",
            match_id: matchId,
            winnerId,
            winnerIds: alive,
            reason,
          }),
        );
      } catch (e) {
        logger.debug(
          "update_ready_state match_ended signal failed: %s",
          (e as Error).message,
        );
      }
    }
  }

  const response: import("@shared").UpdateReadyStatePayload = {
    ok: true,
    match_id: matchId,
    ready: advanced ? false : effectiveReady,
    all_ready: allReady,
    turn: match.current_turn,
    readyStates: match.readyStates,
    deadCharacters: match.deadCharacters,
    advanced,
    lastAutoAdvanceAt: match.lastAutoAdvanceAt,
    playerCharacters: tailorPlayerCharactersForViewer(
      match.playerCharacters,
      ctx.userId,
      viewAll,
      match.current_turn,
    ),
    map: viewAll ? match.map : tailorMapForCharacter(match.map, viewerCharacter),
    items: viewAll
      ? match.items
      : tailorMatchItemsForCharacter(match.items, viewerCharacter),
    traps: match.traps,
  };

  return JSON.stringify(response);
}
