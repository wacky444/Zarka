/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { AsyncTurnState } from "../../models/types";

export const asyncTurnMatchTerminate: nkruntime.MatchTerminateFunction<AsyncTurnState> =
  function (ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
    return { state };
  };
