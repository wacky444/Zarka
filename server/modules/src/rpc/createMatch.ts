/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { DEFAULT_MATCH_NAME } from "../constants";
import { makeNakamaError } from "../utils/errors";
import { hasTutorialCompleted } from "../utils/tutorialProfile";
import { MatchRecord } from "../models/types";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { normalizeMatchName } from "../utils/normalize";
import { getRandomColorMatchName } from "../match/teams";
import { assertCanAddMembership, createMembershipStorage, withMatchMembershipLocks } from "../services/matchMembershipLimit";
import { clampNumber, validateTime } from "../utils/validation";
import {
  DEFAULT_MAP_COLS,
  DEFAULT_MAP_ROWS,
  DEFAULT_NORMAL_MATCH_SIZE,
  MAX_NORMAL_MATCH_SIZE
} from "@shared";

function createMatchRpcLocked(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx || !ctx.userId) {
    throw {
      message: "No user context",
      code: nkruntime.Codes.INVALID_ARGUMENT
    } as nkruntime.Error;
  }

  if (!hasTutorialCompleted(nk, ctx.userId, logger)) {
    throw makeNakamaError(
      "tutorial_incomplete",
      nkruntime.Codes.FAILED_PRECONDITION
    );
  }

  let size = DEFAULT_NORMAL_MATCH_SIZE;
  let name = DEFAULT_MATCH_NAME;
  let roundTime = "23:00";
  let autoSkip = true;
  let turnsToBeAt1Tile = 30;

  if (payload && payload !== "") {
    try {
      const json = JSON.parse(payload);
      const requestedSize = clampNumber(
        json?.size,
        2,
        MAX_NORMAL_MATCH_SIZE
      );
      if (typeof requestedSize === "number") {
        size = requestedSize;
      }
      if (json && typeof json.name === "string") {
        name = normalizeMatchName(json.name);
      }
      if (json && typeof json.roundTime === "string") {
        const valid = validateTime(json.roundTime);
        if (valid) {
          roundTime = valid;
        }
      }
      if (json && typeof json.autoSkip === "boolean") {
        autoSkip = json.autoSkip;
      }
      if (json && typeof json.turnsToBeAt1Tile === "number") {
        turnsToBeAt1Tile = Math.max(1, Math.floor(json.turnsToBeAt1Tile));
      }
    } catch (err) {
      logger.debug(
        "create_match payload parse failed: %s",
        (err as Error).message
      );
    }
  }

  name = normalizeMatchName(name);
  if (name === DEFAULT_MATCH_NAME) {
    name = getRandomColorMatchName();
  }

  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);

  const gameId = nk.uuidv4();
  const params: { [key: string]: string } = {
    size: String(size),
    creator: ctx.userId,
    name,
    cols: String(DEFAULT_MAP_COLS),
    rows: String(DEFAULT_MAP_ROWS),
    roundTime,
    autoSkip: String(autoSkip),
    turnsToBeAt1Tile: String(turnsToBeAt1Tile),
    game_id: gameId
  };

  const runtimeMatchId = nkWrapper.matchCreate("async_turn", params);

  const record: MatchRecord = {
    match_id: gameId,
    runtime_match_id: runtimeMatchId,
    players: [],
    playerCharacters: {},
    playerList: {},
    readyStates: {},
    size,
    cols: DEFAULT_MAP_COLS,
    rows: DEFAULT_MAP_ROWS,
    roundTime,
    autoSkip,
    turnsToBeAt1Tile,
    created_at: Math.floor(Date.now() / 1000),
    current_turn: 0,
    creator: ctx.userId,
    name,
    started: false,
    removed: 0
  };

  storage.writeMatch(record);

  const response: import("@shared").CreateMatchPayload = {
    match_id: gameId,
    runtime_match_id: runtimeMatchId,
    size,
    turnsToBeAt1Tile,
    name,
    started: false
  };

  return JSON.stringify(response);
}

export function createMatchRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  const userId = ctx?.userId;
  if (!userId) return createMatchRpcLocked(ctx, logger, nk, payload);
  return withMatchMembershipLocks(nk, [userId], logger, () => {
    assertCanAddMembership(nk, createMembershipStorage(nk), userId);
    return createMatchRpcLocked(ctx, logger, nk, payload);
  });
}
