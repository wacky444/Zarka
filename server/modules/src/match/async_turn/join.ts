/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { OPCODE_SETTINGS_UPDATE } from "../../constants";
import { AsyncTurnState } from "../../models/types";
import { buildMatchLabel } from "../../utils/label";

export const asyncTurnMatchJoin: nkruntime.MatchJoinFunction<AsyncTurnState> =
  function (ctx, logger, nk, dispatcher, tick, state, presences) {
    for (const p of presences) {
      if (!state.players[p.userId]) {
        state.players[p.userId] = p;
        state.order.push(p.userId);
      }
    }

    const playerCount = Object.keys(state.players).length;
    if (!state.started && playerCount >= 2) {
      state.started = true;
      try {
        dispatcher.broadcastMessage(
          OPCODE_SETTINGS_UPDATE,
          JSON.stringify({
            size: state.size,
            cols: state.cols,
            rows: state.rows,
            roundTime: state.roundTime,
            autoSkip: state.autoSkip,
            botPlayers: state.botPlayers,
            name: state.name,
            started: state.started,
            players: Object.keys(state.players),
          }),
          null,
          null,
          true
        );
      } catch {}
    }

    try {
      const label = buildMatchLabel({
        name: state.name,
        size: state.size,
        players: playerCount,
        started: state.started,
        creator: state.creator,
      });
      dispatcher.matchLabelUpdate(label);
    } catch (e) {
      // ignore label update errors
    }

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
        players: Object.keys(state.players),
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
