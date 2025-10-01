/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { DEFAULT_MATCH_NAME } from "../../constants";
import { AsyncTurnState } from "../../models/types";
import { buildMatchLabel } from "../../utils/label";
import { normalizeMatchName } from "../../utils/normalize";

export const asyncTurnMatchInit: nkruntime.MatchInitFunction<AsyncTurnState> =
  function (ctx, logger, nk, params) {
    const isRestore = params && params["restore"] === "true";

    const sizeStr = params && params["size"];
    const size = Math.max(2, Math.min(8, parseInt(sizeStr || "2", 10) || 2));
    const creator = params && params["creator"];
    const nameParam = params && params["name"];
    const name =
      typeof nameParam === "string"
        ? normalizeMatchName(nameParam)
        : DEFAULT_MATCH_NAME;

    const state: AsyncTurnState = {
      players: {},
      order: [],
      size,
      cols: params && params["cols"] ? parseInt(params["cols"], 10) : undefined,
      rows: params && params["rows"] ? parseInt(params["rows"], 10) : undefined,
      roundTime: params && params["roundTime"] ? params["roundTime"] : "23:00",
      autoSkip: params && params["autoSkip"] === "true",
      botPlayers:
        params && params["botPlayers"] ? parseInt(params["botPlayers"], 10) : 0,
      current_turn:
        params && params["current_turn"]
          ? parseInt(params["current_turn"], 10)
          : 0,
      started: params && params["started"] === "true",
      creator: typeof creator === "string" ? creator : undefined,
      name,
    };

    if (isRestore && params && params["players"]) {
      try {
        const playerIds = JSON.parse(params["players"]) as string[];
        state.order = playerIds || [];
      } catch (e) {
        logger.warn(
          "Failed to parse players during restoration: %s",
          (e as Error).message
        );
      }
    }

    const label = buildMatchLabel({
      name: state.name,
      size: state.size,
      players: state.order.length,
      started: state.started,
      creator: state.creator,
    });

    const tickRate = 1;

    if (isRestore && params && params["old_match_id"]) {
      logger.info(
        "Match init for restoration. Old ID: %s, state: started=%s, turn=%d, players=%d/%d",
        params["old_match_id"],
        state.started,
        state.current_turn,
        state.order.length,
        state.size
      );
    }

    return { state, tickRate, label };
  };
