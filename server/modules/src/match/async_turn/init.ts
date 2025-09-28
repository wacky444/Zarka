/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { DEFAULT_MATCH_NAME } from "../../constants";
import { AsyncTurnState } from "../../models/types";
import { buildMatchLabel } from "../../utils/label";
import { normalizeMatchName } from "../../utils/normalize";

export const asyncTurnMatchInit: nkruntime.MatchInitFunction<AsyncTurnState> =
  function (ctx, logger, nk, params) {
    const sizeStr = params && params["size"];
    const size = Math.max(2, Math.min(8, parseInt(sizeStr || "2", 10) || 2));
    const creator = params && params["creator"]; // optional
    const nameParam = params && params["name"];
    const name =
      typeof nameParam === "string"
        ? normalizeMatchName(nameParam)
        : DEFAULT_MATCH_NAME;

    const state: AsyncTurnState = {
      players: {},
      order: [],
      size,
      cols: undefined,
      rows: undefined,
      roundTime: "23:00", // Default round time
      autoSkip: true, // Default auto-skip enabled
      botPlayers: 0, // Default no bot players
      current_turn: 0,
      started: false,
      creator: typeof creator === "string" ? creator : undefined,
      name,
    };

    const label = buildMatchLabel({
      name: state.name,
      size: state.size,
      players: 0,
      started: false,
      creator: state.creator,
    });

    const tickRate = 1;
    return { state, tickRate, label };
  };
