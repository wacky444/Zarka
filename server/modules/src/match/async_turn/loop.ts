/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { AsyncTurnState } from "../../models/types";

export const asyncTurnMatchLoop: nkruntime.MatchLoopFunction<AsyncTurnState> =
  function (ctx, logger, nk, dispatcher, tick, state, messages) {
    return { state };
  };
