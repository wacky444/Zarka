/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { AsyncTurnState } from "../../models/types";

// TODO we are using manual turn advancement for async turn matches for now, remove this?
export const asyncTurnMatchLoop: nkruntime.MatchLoopFunction<AsyncTurnState> =
  function (ctx, logger, nk, dispatcher, tick, state, messages) {
    return { state };
  };
