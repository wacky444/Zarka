/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { DEFAULT_MATCH_NAME } from "../constants";
import { MatchRecord } from "../models/types";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { normalizeMatchName } from "../utils/normalize";
import { clampNumber, validateTime } from "../utils/validation";

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
  if (typeof match.started !== "boolean") {
    match.started = false;
  }

  const isCreator = !!match.creator && match.creator === ctx.userId;
  if (!isCreator) {
    throw makeNakamaError("not_creator", nkruntime.Codes.PERMISSION_DENIED);
  }

  const newSize = clampNumber(settings.players, 1, 100);
  const newCols = clampNumber(settings.cols, 1, 100);
  const newRows = clampNumber(settings.rows, 1, 100);
  const newRoundTime = validateTime(settings.roundTime);
  const newAutoSkip =
    typeof settings.autoSkip === "boolean" ? settings.autoSkip : undefined;
  const newBotPlayers = clampNumber(settings.botPlayers, 0, 10);
  const newName =
    typeof settings.name === "string"
      ? normalizeMatchName(settings.name, match.name ?? DEFAULT_MATCH_NAME)
      : undefined;

  if (typeof newSize === "number") match.size = newSize;
  if (typeof newCols === "number") match.cols = newCols;
  if (typeof newRows === "number") match.rows = newRows;
  if (typeof newRoundTime === "string") match.roundTime = newRoundTime;
  if (typeof newAutoSkip === "boolean") match.autoSkip = newAutoSkip;
  if (typeof newBotPlayers === "number") match.botPlayers = newBotPlayers;
  if (typeof newName === "string") match.name = newName;

  try {
    storage.writeMatch(match, read.version);
    try {
      nkWrapper.matchSignal(
        matchId,
        JSON.stringify({
          type: "update_settings",
          size: match.size,
          cols: match.cols,
          rows: match.rows,
          roundTime: match.roundTime,
          autoSkip: match.autoSkip,
          botPlayers: match.botPlayers,
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
    name: match.name,
    started: match.started,
  };

  return JSON.stringify(response);
}
