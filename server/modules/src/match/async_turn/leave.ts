/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { AsyncTurnState } from "../../models/types";
import { buildMatchLabel } from "../../utils/label";
import { OPCODE_SETTINGS_UPDATE } from "@shared";

export const asyncTurnMatchLeave: nkruntime.MatchLeaveFunction<AsyncTurnState> =
  function (ctx, logger, nk, dispatcher, tick, state, presences) {
    for (const p of presences) {
      if (state.players[p.userId]) {
        delete state.players[p.userId];
      }
    }

    const playerCount = state.order.length;

    try {
      const label = buildMatchLabel({
        name: state.name,
        size: state.size,
        players: playerCount,
        started: state.started,
        creator: state.creator,
      });
      dispatcher.matchLabelUpdate(label);
    } catch {}

    try {
      const payload = JSON.stringify({
        size: state.size,
        cols: state.cols,
        rows: state.rows,
        roundTime: state.roundTime,
        autoSkip: state.autoSkip,
        botPlayers: state.botPlayers,
        name: state.name,
        started: state.started,
        players: state.order,
      });
      dispatcher.broadcastMessage(
        OPCODE_SETTINGS_UPDATE,
        payload,
        null,
        null,
        true
      );
    } catch {}

    return { state };
  };
