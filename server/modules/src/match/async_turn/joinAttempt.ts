/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { AsyncTurnState } from "../../models/types";

export const asyncTurnMatchJoinAttempt: nkruntime.MatchJoinAttemptFunction<AsyncTurnState> =
  function (ctx, logger, nk, dispatcher, tick, state, presence) {
    const alreadyJoined = !!state.players[presence.userId];
    const capacity =
      Object.keys(state.players).length + (alreadyJoined ? 0 : 1);
    const accept = capacity <= state.size;
    return accept
      ? { state, accept }
      : { state, accept: false, rejectMessage: "match_full" };
  };
