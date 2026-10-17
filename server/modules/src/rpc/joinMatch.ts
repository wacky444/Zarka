/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { hasTutorialCompleted } from "../utils/tutorialProfile";
import { MatchRecord } from "../models/types";
import {
  CellLibrary,
  DEFAULT_MAP_COLS,
  DEFAULT_MAP_ROWS,
  generateGameMap,
  RANKED_MATCH_METADATA_KEY,
  TUTORIAL_MATCH_METADATA_KEY
} from "@shared";
import {
  ensureAllPlayerCharacters,
  ensurePlayerCharacter,
} from "../utils/playerCharacter";
import { getRuntimeMatchId } from "../utils/matchIds";
import { assertCanAddMembership, withMatchMembershipLocks } from "../services/matchMembershipLimit";

function joinMatchRpcLocked(
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

  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);
  const read = storage.getMatch(matchId);

  if (!read) {
    throw makeNakamaError("not_found", nkruntime.Codes.NOT_FOUND);
  }

  const match: MatchRecord = read.match;
  if (
    match.metadata?.[RANKED_MATCH_METADATA_KEY] &&
    (!Array.isArray(match.players) || match.players.indexOf(ctx.userId) === -1)
  ) {
    throw makeNakamaError(
      "ranked_roster_locked",
      nkruntime.Codes.PERMISSION_DENIED
    );
  }
  if (match.metadata?.[TUTORIAL_MATCH_METADATA_KEY]) {
    if (!Array.isArray(match.players) || match.players.indexOf(ctx.userId) === -1) {
      throw makeNakamaError(
        "not_in_tutorial_match",
        nkruntime.Codes.PERMISSION_DENIED
      );
    }
  } else if (!hasTutorialCompleted(nk, ctx.userId, logger)) {
    throw makeNakamaError(
      "tutorial_incomplete",
      nkruntime.Codes.FAILED_PRECONDITION
    );
  }
  if (typeof match.started !== "boolean") {
    match.started = false;
  }

  let joinedNow = false;
  let shouldWrite = false;

  if (!match.readyStates) {
    match.readyStates = {};
    shouldWrite = true;
  }

  if (ensureAllPlayerCharacters(match)) {
    shouldWrite = true;
  }

  const ensureMap = (): boolean => {
    const cols = match.cols && match.cols > 0 ? match.cols : DEFAULT_MAP_COLS;
    const rows = match.rows && match.rows > 0 ? match.rows : DEFAULT_MAP_ROWS;
    const existing = match.map;
    const needsMap =
      !existing || existing.cols !== cols || existing.rows !== rows;
    if (!needsMap) {
      if (!Array.isArray(match.items)) {
        match.items = [];
      }
      return false;
    }
    const generated = generateGameMap(
      cols,
      rows,
      CellLibrary,
      existing?.seed,
      match.turnsToBeAt1Tile ?? 30
    );
    match.map = generated.map;
    match.cols = generated.map.cols;
    match.rows = generated.map.rows;
    match.items = generated.items;
    match.safeContainers = generated.safeContainers;
    return true;
  };

  if (match.players.indexOf(ctx.userId) === -1) {
    assertCanAddMembership(nk, storage, ctx.userId);
    const current = match.players.length;
    if (current >= (match.size || 2)) {
      throw makeNakamaError("match_full", nkruntime.Codes.FAILED_PRECONDITION);
    }
    match.players.push(ctx.userId);
    joinedNow = true;
    shouldWrite = true;
    if (!match.playerCharacters[ctx.userId]) {
      ensurePlayerCharacter(match, ctx.userId);
      shouldWrite = true;
    }
    match.readyStates[ctx.userId] = false;
  }

  if (!Object.prototype.hasOwnProperty.call(match.readyStates, ctx.userId)) {
    match.readyStates[ctx.userId] = false;
    shouldWrite = true;
  }

  if (!storage.isMatchActive(getRuntimeMatchId(match))) {
    const isRanked = Boolean(match.metadata?.[RANKED_MATCH_METADATA_KEY]);
    const params: { [key: string]: string } = {
      size: String(match.size),
      creator: match.creator || "",
      name: match.name || "",
      cols: String(match.cols || 0),
      rows: String(match.rows || 0),
      roundTime: match.roundTime || "23:00",
      autoSkip: String(match.autoSkip !== false),
      botPlayers: String(match.botPlayers || 0),
      current_turn: String(match.current_turn),
      started: String(match.started),
      lastAutoAdvanceAt: String(match.lastAutoAdvanceAt || 0),
      game_id: match.match_id,
      restore: "true",
      ranked: String(isRanked),
      players: JSON.stringify(match.players),
    };
    try {
      const runtimeMatchId = nkWrapper.matchCreate("async_turn", params);
      match.runtime_match_id = runtimeMatchId;
      shouldWrite = true;
      logger.info(
        "join_match: restored missing runtime match %s for game %s",
        runtimeMatchId,
        match.match_id
      );
    } catch (createErr) {
      logger.error(
        "join_match: failed to recreate runtime match for %s: %s",
        match.match_id,
        (createErr as Error).message || String(createErr)
      );
    }
  }

  if (shouldWrite) {
    storage.writeMatch(match, read.version);
    try {
      nkWrapper.matchSignal(
        getRuntimeMatchId(match),
        JSON.stringify({
          type: "sync_players",
          players: match.players,
          size: match.size,
          name: match.name,
          started: match.started,
        })
      );
    } catch (signalError) {
      logger.debug(
        "join_match: matchSignal sync failed: %s",
        (signalError as Error).message
      );
    }
  }

  const response: import("@shared").JoinMatchPayload = {
    ok: true,
    match_id: matchId,
    runtime_match_id: getRuntimeMatchId(match),
    size: match.size,
    players: match.players,
    joined: joinedNow,
    name: match.name,
    started: match.started,
  };

  return JSON.stringify(response);
}

export function joinMatchRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx?.userId) return joinMatchRpcLocked(ctx, logger, nk, payload);
  return withMatchMembershipLocks(nk, [ctx.userId], logger, () =>
    joinMatchRpcLocked(ctx, logger, nk, payload)
  );
}
