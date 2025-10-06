/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { DEFAULT_MATCH_NAME } from "../constants";
import { MatchRecord } from "../models/types";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { normalizeMatchName } from "../utils/normalize";
import { DEFAULT_MAP_COLS, DEFAULT_MAP_ROWS } from "@shared";

function getNumberOfMatches(storage: StorageService, userId: string): number {
  const existingMatches = storage.listServerMatches(100, "");
  let creatorMatchCount = 0;

  if (existingMatches && existingMatches.objects) {
    for (const obj of existingMatches.objects) {
      if (obj && obj.value) {
        const match = obj.value as MatchRecord;
        if (
          match.creator === userId &&
          (match.removed === 0 || match.removed === undefined)
        ) {
          creatorMatchCount++;
        }
      }
    }
  }

  return creatorMatchCount;
}

export function createMatchRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx || !ctx.userId) {
    throw {
      message: "No user context",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }

  let size = 2;
  let name = DEFAULT_MATCH_NAME;

  if (payload && payload !== "") {
    try {
      const json = JSON.parse(payload);
      if (json && typeof json.size === "number") {
        size = json.size;
      }
      if (json && typeof json.name === "string") {
        name = normalizeMatchName(json.name);
      }
    } catch (err) {
      logger.debug(
        "create_match payload parse failed: %s",
        (err as Error).message
      );
    }
  }

  name = normalizeMatchName(name);

  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);

  const creatorMatchCount = getNumberOfMatches(storage, ctx.userId);

  if (creatorMatchCount >= 3) {
    throw {
      message: "Maximum of 3 matches per user reached",
      code: nkruntime.Codes.RESOURCE_EXHAUSTED,
    } as nkruntime.Error;
  }

  const params: { [key: string]: string } = {
    size: String(size),
    creator: ctx.userId,
    name,
    cols: String(DEFAULT_MAP_COLS),
    rows: String(DEFAULT_MAP_ROWS),
  };

  const matchId = nkWrapper.matchCreate("async_turn", params);

  const record: MatchRecord = {
    match_id: matchId,
    players: [],
    playerCharacters: {},
    size,
    cols: DEFAULT_MAP_COLS,
    rows: DEFAULT_MAP_ROWS,
    created_at: Math.floor(Date.now() / 1000),
    current_turn: 0,
    creator: ctx.userId,
    name,
    started: false,
    removed: 0,
  };

  storage.writeMatch(record);

  const response: import("@shared").CreateMatchPayload = {
    match_id: matchId,
    size,
    name,
    started: false,
  };

  return JSON.stringify(response);
}
