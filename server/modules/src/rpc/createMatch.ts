/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { DEFAULT_MATCH_NAME } from "../constants";
import { MatchRecord } from "../models/types";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { normalizeMatchName } from "../utils/normalize";

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

  const params: { [key: string]: string } = {
    size: String(size),
    creator: ctx.userId,
    name,
  };

  const matchId = nkWrapper.matchCreate("async_turn", params);

  const record: MatchRecord = {
    match_id: matchId,
    players: [],
    size,
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
