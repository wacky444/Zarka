/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { processRankedQueue } from "../services/rankedQueue";
import { processPendingRankedSettlements } from "../match/rankedElo";

export interface RankedQueueCoordinatorState extends nkruntime.MatchState {
  lastProcessAtMs: number;
}

const PROCESS_INTERVAL_MS = 10_000;

export function rankedQueueCoordinatorMatchInit(
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
}

export function rankedQueueCoordinatorMatchLoop(
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
    try {
      processPendingRankedSettlements(nk, logger, nowMs);
    } catch (error) {
      logger.error(
        "ranked settlement recovery failed: %s",
        (error && (error as Error).message) || String(error)
      );
    }
    processRankedQueue(nk, logger, nowMs, _ctx);
  }
  return { state };
}

export function rankedQueueCoordinatorMatchJoin(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: RankedQueueCoordinatorState,
  _presences: nkruntime.Presence[]
) {
  return { state };
}

export function rankedQueueCoordinatorMatchLeave(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: RankedQueueCoordinatorState,
  _presences: nkruntime.Presence[]
) {
  return { state };
}

export function rankedQueueCoordinatorMatchSignal(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: RankedQueueCoordinatorState,
  _data: string
) {
  return { state, data: "server_only" };
}

export function rankedQueueCoordinatorMatchJoinAttempt(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: RankedQueueCoordinatorState,
  _presence: nkruntime.Presence
) {
  return { state, accept: false, rejectMessage: "server_only" };
}

export function rankedQueueCoordinatorMatchTerminate(
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

export const rankedQueueCoordinatorMatchHandler: nkruntime.MatchHandler<RankedQueueCoordinatorState> = {
  matchInit: rankedQueueCoordinatorMatchInit,
  matchLoop: rankedQueueCoordinatorMatchLoop,
  matchJoin: rankedQueueCoordinatorMatchJoin,
  matchLeave: rankedQueueCoordinatorMatchLeave,
  matchSignal: rankedQueueCoordinatorMatchSignal,
  matchJoinAttempt: rankedQueueCoordinatorMatchJoinAttempt,
  matchTerminate: rankedQueueCoordinatorMatchTerminate
};

