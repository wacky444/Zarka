/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { processRankedQueue } from "../services/rankedQueue";

export interface RankedQueueCoordinatorState extends nkruntime.MatchState {
  lastProcessAtMs: number;
}

const PROCESS_INTERVAL_MS = 10_000;

export const rankedQueueCoordinatorMatchHandler: nkruntime.MatchHandler<RankedQueueCoordinatorState> = {
  matchInit: function (
    _ctx: nkruntime.Context,
    _logger: nkruntime.Logger,
    _nk: nkruntime.Nakama,
    _params: { [key: string]: string }
  ) {
    return {
      state: { lastProcessAtMs: 0 } as RankedQueueCoordinatorState,
      tickRate: 1,
      label: "Ranked Queue Coordinator"
    };
  },
  matchLoop: function (
    _ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    _dispatcher: nkruntime.MatchDispatcher,
    _tick: number,
    state: RankedQueueCoordinatorState,
    _messages: nkruntime.MatchMessage[]
  ) {
    const nowMs = Date.now();
    if (nowMs - state.lastProcessAtMs >= PROCESS_INTERVAL_MS) {
      state.lastProcessAtMs = nowMs;
      processRankedQueue(nk, logger, nowMs);
    }
    return { state };
  },
  matchJoin: function (
    _ctx,
    _logger,
    _nk,
    _dispatcher,
    _tick,
    state,
    _presences
  ) {
    return { state };
  },
  matchLeave: function (
    _ctx,
    _logger,
    _nk,
    _dispatcher,
    _tick,
    state,
    _presences
  ) {
    return { state };
  },
  matchSignal: function (
    _ctx,
    _logger,
    _nk,
    _dispatcher,
    _tick,
    state,
    _data
  ) {
    return { state, data: "server_only" };
  },
  matchJoinAttempt: function (
    _ctx: nkruntime.Context,
    _logger: nkruntime.Logger,
    _nk: nkruntime.Nakama,
    _dispatcher: nkruntime.MatchDispatcher,
    _tick: number,
    state: RankedQueueCoordinatorState,
    _presence: nkruntime.Presence
  ) {
    return { state, accept: false, rejectMessage: "server_only" };
  },
  matchTerminate: function (
    _ctx: nkruntime.Context,
    _logger: nkruntime.Logger,
    _nk: nkruntime.Nakama,
    _dispatcher: nkruntime.MatchDispatcher,
    _tick: number,
    state: RankedQueueCoordinatorState,
    _graceSeconds: number
  ) {
    return { state };
  }
};
