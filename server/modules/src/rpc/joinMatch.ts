/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { MatchRecord } from "../models/types";
import {
  CellLibrary,
  DEFAULT_MAP_COLS,
  DEFAULT_MAP_ROWS,
  generateGameMap,
} from "@shared";
import {
  ensureAllPlayerCharacters,
  ensurePlayerCharacter,
} from "../utils/playerCharacter";

export function joinMatchRpc(
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

  let matchId: string = typeof json.match_id === "string" ? json.match_id : "";
  let inviteCode: string | undefined =
    typeof json.inviteCode === "string" ? json.inviteCode : undefined;
  const inviteToken: string | undefined =
    typeof json.inviteToken === "string" ? json.inviteToken : undefined;

  if (inviteToken && inviteToken.indexOf(":") !== -1) {
    const [tokenMatchId, tokenCode] = inviteToken.split(":");
    if (!matchId) {
      matchId = tokenMatchId;
    }
    if (!inviteCode && tokenCode) {
      inviteCode = tokenCode;
    }
  }

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
  if (typeof match.started !== "boolean") {
    match.started = false;
  }

  let joinedNow = false;
  let shouldWrite = false;

  if (match.isPrivate) {
    const isCreator = match.creator === ctx.userId;
    const invitedList = Array.isArray(match.invited) ? match.invited : [];
    const isInvited = invitedList.indexOf(ctx.userId) !== -1;
    if (!isCreator && !isInvited) {
      if (!inviteCode || inviteCode !== match.inviteCode) {
        throw makeNakamaError(
          "invite_required",
          nkruntime.Codes.PERMISSION_DENIED
        );
      }
      invitedList.push(ctx.userId);
      match.invited = invitedList;
      shouldWrite = true;
    }
  }

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
    const generated = generateGameMap(cols, rows, CellLibrary, existing?.seed);
    match.map = generated.map;
    match.cols = generated.map.cols;
    match.rows = generated.map.rows;
    match.items = generated.items;
    return true;
  };

  if (match.players.indexOf(ctx.userId) === -1) {
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

  if (shouldWrite) {
    storage.writeMatch(match, read.version);
    try {
      nkWrapper.matchSignal(
        matchId,
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

  const inviteTokenResponse =
    match.isPrivate && match.inviteCode
      ? `${matchId}:${match.inviteCode}`
      : undefined;

  const response: import("@shared").JoinMatchPayload = {
    ok: true,
    match_id: matchId,
    size: match.size,
    players: match.players,
    joined: joinedNow,
    name: match.name,
    started: match.started,
    isPrivate: match.isPrivate,
    inviteCode: match.inviteCode,
    inviteToken: inviteTokenResponse,
  };

  return JSON.stringify(response);
}
