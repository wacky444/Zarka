/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { isGameMasterUser } from "../utils/admin";
import { MatchRecord } from "../models/types";
import {
  CellLibrary,
  DEFAULT_MAP_COLS,
  DEFAULT_MAP_ROWS,
  MAX_MAP_COLS,
  MAX_MAP_ROWS,
  generateGameMap,
  RANKED_MATCH_METADATA_KEY
} from "@shared";
import { tailorMapForCharacter } from "../utils/matchView";
import { createReplaySnapshot } from "../match/replay/snapshot";
import { getRuntimeMatchId } from "../utils/matchIds";
import { startMatchRecord } from "../match/startMatchRecord";
import { hasEnoughSpawnTiles, createDefaultCharacter } from "../utils/playerCharacter";

export function startMatchRpc(
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
    logger.warn("start_match: match not found: %s", matchId);
    throw makeNakamaError("not_found", nkruntime.Codes.NOT_FOUND);
  }

  const match: MatchRecord = read.match;
  if (match.metadata?.[RANKED_MATCH_METADATA_KEY]) {
    logger.warn("start_match: ranked start rejected for match %s", matchId);
    throw makeNakamaError(
      "ranked_start_server_only",
      nkruntime.Codes.PERMISSION_DENIED
    );
  }
  if (match.removed && match.removed !== 0) {
    logger.warn("start_match: match ended %s", matchId);
    throw makeNakamaError("match_ended", nkruntime.Codes.FAILED_PRECONDITION);
  }
  if (typeof match.started !== "boolean") {
    match.started = false;
  }

  const targetCols = Math.min(
    MAX_MAP_COLS,
    match.cols && match.cols > 0 ? match.cols : DEFAULT_MAP_COLS
  );
  const targetRows = Math.min(
    MAX_MAP_ROWS,
    match.rows && match.rows > 0 ? match.rows : DEFAULT_MAP_ROWS
  );
  const existingMap = match.map;
  const mapMismatch =
    !existingMap ||
    existingMap.cols !== targetCols ||
    existingMap.rows !== targetRows;
  let mapUpdated = false;

  if (mapMismatch) {
    const generated = generateGameMap(
      targetCols,
      targetRows,
      CellLibrary,
      existingMap?.seed,
      match.turnsToBeAt1Tile ?? 30
    );
    match.map = generated.map;
    match.cols = generated.map.cols;
    match.rows = generated.map.rows;
    match.items = generated.items;
    match.safeContainers = generated.safeContainers;
    mapUpdated = true;
  }

  if (!Array.isArray(match.items)) {
    match.items = [];
  }

  if (match.gameMasterMode) {
    const isGM = isGameMasterUser(match, ctx.userId);
    if (!isGM) {
      throw makeNakamaError("not_game_master", nkruntime.Codes.PERMISSION_DENIED);
    }
  } else {
    if (!match.creator || match.creator !== ctx.userId) {
      throw makeNakamaError("not_creator", nkruntime.Codes.PERMISSION_DENIED);
    }
  }

  if (match.gameMasterMode) {
    if (
      !Array.isArray(match.controlledCharacterRoster) ||
      match.controlledCharacterRoster.length < 2
    ) {
      throw makeNakamaError(
        "insufficient_controlled_characters",
        nkruntime.Codes.FAILED_PRECONDITION
      );
    }
    match.playerCharacters = {};
    match.readyStates = {};
    for (const entry of match.controlledCharacterRoster) {
      const char = createDefaultCharacter(entry.id);
      char.name = entry.name;
      char.skin = entry.skin;
      match.playerCharacters[entry.id] = char;
      match.readyStates[entry.id] = false;
    }
    match.autoSkip = false;
  }

  if (match.started) {
    if (mapUpdated) {
      try {
        storage.writeMatch(match, read.version);
      } catch (e) {
        throw makeNakamaError("storage_write_failed", nkruntime.Codes.INTERNAL);
      }
    }
    const isGMViewer = isGameMasterUser(match, ctx.userId);
    const viewerCharacter = match.playerCharacters?.[ctx.userId] ?? null;
    const tailored = isGMViewer
      ? match.map
      : tailorMapForCharacter(match.map, viewerCharacter);
    const already: import("@shared").StartMatchPayload = {
      ok: true,
      match_id: matchId,
      started: true,
      already_started: true,
      map: tailored
    };
    return JSON.stringify(already);
  }

  if (!hasEnoughSpawnTiles(match)) {
    logger.warn(
      "start_match: insufficient spawn tiles for match %s (cols=%s, rows=%s, players=%s, botPlayers=%s)",
      matchId,
      String(match.cols),
      String(match.rows),
      String(match.players?.length ?? 0),
      String(match.botPlayers ?? 0)
    );
    throw makeNakamaError(
      "insufficient_spawn_tiles",
      nkruntime.Codes.FAILED_PRECONDITION
    );
  }

  const startedAtMs = Date.now();
  const turn0Events = startMatchRecord(match, logger, startedAtMs);

  try {
    storage.appendReplayTurn({
      match_id: matchId,
      turn: 0,
      events: turn0Events,
      snapshot: createReplaySnapshot(match),
      created_at: Math.floor(Date.now() / 1000)
    });
  } catch (e) {
    logger.warn("start_match: replay write failed: %s", (e as Error).message);
  }

  try {
    storage.writeMatch(match, read.version);
  } catch (e) {
    throw makeNakamaError("storage_write_failed", nkruntime.Codes.INTERNAL);
  }

  try {
    nkWrapper.matchSignal(
      getRuntimeMatchId(match),
      JSON.stringify({
        type: "start_match"
      })
    );
  } catch (e) {
    logger.warn("start_match: matchSignal failed: %s", (e as Error).message);
  }

  const isGMViewer = Boolean(
    match.gameMasterMode &&
    Array.isArray(match.gameMasterUserIds) &&
    match.gameMasterUserIds.indexOf(ctx.userId) !== -1
  );
  const viewerCharacter = match.playerCharacters?.[ctx.userId] ?? null;
  const tailored = isGMViewer
    ? match.map
    : tailorMapForCharacter(match.map, viewerCharacter);
  const response: import("@shared").StartMatchPayload = {
    ok: true,
    match_id: matchId,
    started: true,
    map: tailored
  };

  return JSON.stringify(response);
}
