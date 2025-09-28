/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { AsyncTurnState } from "../../models/types";
import { buildMatchLabel } from "../../utils/label";

export const asyncTurnMatchLeave: nkruntime.MatchLeaveFunction<AsyncTurnState> =
  function (ctx, logger, nk, dispatcher, tick, state, presences) {
    for (const p of presences) {
      if (state.players[p.userId]) {
        delete state.players[p.userId];
        const idx = state.order.indexOf(p.userId);
        if (idx !== -1) {
          state.order.splice(idx, 1);
        }
      }
    }

    const playerCount = Object.keys(state.players).length;

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

    if (playerCount === 0) {
      return null;
    }

    return { state };
  };
