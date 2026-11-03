/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { DEFAULT_MATCH_NAME } from "../constants";
import { MatchRecord } from "../models/types";
import { getRuntimeMatchId } from "../utils/matchIds";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { normalizeMatchName } from "../utils/normalize";
import { clampNumber, validateTime } from "../utils/validation";
import { ensureAllPlayerCharacters } from "../utils/playerCharacter";
import { isAdminUser } from "../utils/admin";
import {
  MAX_BOT_PLAYERS,
  MAX_NORMAL_MATCH_SIZE,
  RANKED_MATCH_METADATA_KEY,
  assignShrinkScheduleToMap
} from "@shared";

export function updateSettingsRpc(
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
  const settings = json.settings || {};

  if (!matchId) {
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
  if (match.metadata?.[RANKED_MATCH_METADATA_KEY]) {
    throw makeNakamaError(
      "ranked_settings_locked",
      nkruntime.Codes.PERMISSION_DENIED
    );
  }
  if (typeof match.started !== "boolean") {
    match.started = false;
  }

  const isCreator = !!match.creator && match.creator === ctx.userId;
  if (!isCreator) {
    throw makeNakamaError("not_creator", nkruntime.Codes.PERMISSION_DENIED);
  }

  const newSize = clampNumber(settings.players, 2, MAX_NORMAL_MATCH_SIZE);
  const newCols = clampNumber(settings.cols, 1, 100);
  const newRows = clampNumber(settings.rows, 1, 100);
  const newRoundTime = validateTime(settings.roundTime);
  const newAutoSkip =
    typeof settings.autoSkip === "boolean" ? settings.autoSkip : undefined;
  const newBotPlayers = clampNumber(
    settings.botPlayers,
    0,
    MAX_BOT_PLAYERS,
  );
  const newTurnsToBeAt1Tile = clampNumber(settings.turnsToBeAt1Tile, 1, 500);
  const newName =
    typeof settings.name === "string"
      ? normalizeMatchName(settings.name, match.name ?? DEFAULT_MATCH_NAME)
      : undefined;

  if (typeof newSize === "number") match.size = newSize;
  if (typeof newCols === "number") match.cols = newCols;
  if (typeof newRows === "number") match.rows = newRows;
  if (typeof newRoundTime === "string") match.roundTime = newRoundTime;
  if (typeof newAutoSkip === "boolean") match.autoSkip = newAutoSkip;
  if (typeof newBotPlayers === "number") {
    match.botPlayers = newBotPlayers;
    ensureAllPlayerCharacters(match);
  }
  if (typeof newTurnsToBeAt1Tile === "number") {
    match.turnsToBeAt1Tile = newTurnsToBeAt1Tile;
    if (match.map) {
      assignShrinkScheduleToMap(match.map, match.turnsToBeAt1Tile);
    }
  }
  if (typeof newName === "string") match.name = newName;

  const kickedNonAdminIds: string[] = [];
  if (settings.gameMasterMode === true) {
    if (!isAdminUser(nk, ctx.userId)) {
      throw makeNakamaError(
        "Game Master matches are restricted to administrators",
        nkruntime.Codes.PERMISSION_DENIED
      );
    }
    match.gameMasterMode = true;
    match.autoSkip = false;
    if (Array.isArray(settings.controlledCharacterRoster)) {
      match.controlledCharacterRoster = settings.controlledCharacterRoster;
    }
    match.gameMasterUserIds = Array.isArray(match.gameMasterUserIds)
      ? match.gameMasterUserIds
      : [];
    if (match.gameMasterUserIds.indexOf(ctx.userId) === -1) {
      match.gameMasterUserIds.push(ctx.userId);
    }

    // Purge non-admins from lobby
    if (Array.isArray(match.players)) {
      const remainingPlayers: string[] = [];
      for (const playerId of match.players) {
        if (!isAdminUser(nk, playerId)) {
          kickedNonAdminIds.push(playerId);
          if (match.readyStates) {
            delete match.readyStates[playerId];
          }
          if (match.playerCharacters && !match.started) {
            delete match.playerCharacters[playerId];
          }
          if (match.playerList && !match.started) {
            delete match.playerList[playerId];
          }
        } else {
          remainingPlayers.push(playerId);
        }
      }
      match.players = remainingPlayers;
    }
  } else if (settings.gameMasterMode === false) {
    match.gameMasterMode = false;
  }

  if (Array.isArray(settings.controlledCharacterRoster) && match.gameMasterMode) {
    match.controlledCharacterRoster = settings.controlledCharacterRoster;
  }

  try {
    storage.writeMatch(match, read.version);
    try {
      nkWrapper.matchSignal(
        getRuntimeMatchId(match),
        JSON.stringify({
          type: "update_settings",
          size: match.size,
          cols: match.cols,
          rows: match.rows,
          roundTime: match.roundTime,
          autoSkip: match.autoSkip,
          botPlayers: match.botPlayers,
          turnsToBeAt1Tile: match.turnsToBeAt1Tile,
          name: match.name,
          started: match.started,
        })
      );
    } catch (signalError) {
      logger.debug(
        "update_settings: matchSignal failed: %s",
        (signalError as Error).message
      );
    }
    if (kickedNonAdminIds.length > 0) {
      for (const kickedId of kickedNonAdminIds) {
        try {
          nkWrapper.matchSignal(
            getRuntimeMatchId(match),
            JSON.stringify({
              type: "player_kicked",
              player_id: kickedId,
              kicked_reason: "gm_mode_enabled",
            })
          );
        } catch (kickSignalError) {
          logger.debug(
            "update_settings: kick matchSignal failed: %s",
            (kickSignalError as Error).message
          );
        }
      }
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
      } catch {}
    }
  } catch (e) {
    throw makeNakamaError("storage_write_failed", nkruntime.Codes.INTERNAL);
  }

  const response: import("@shared").UpdateSettingsPayload = {
    ok: true,
    match_id: matchId,
    size: match.size,
    cols: match.cols,
    rows: match.rows,
    roundTime: match.roundTime,
    autoSkip: match.autoSkip,
    botPlayers: match.botPlayers,
    turnsToBeAt1Tile: match.turnsToBeAt1Tile,
    name: match.name,
    started: match.started,
    gameMasterMode: match.gameMasterMode,
    controlledCharacterRoster: match.controlledCharacterRoster,
  };

  return JSON.stringify(response);
}
