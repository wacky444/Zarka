/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import type {
  GameMap,
  MatchRecord as SharedMatchRecord,
  TurnRecord as SharedTurnRecord,
} from "@shared";

export type MatchRecord = SharedMatchRecord;
export type TurnRecord = SharedTurnRecord;

export interface AsyncTurnState extends nkruntime.MatchState {
  players: { [userId: string]: nkruntime.Presence };
  order: string[];
  size: number;
  cols?: number;
  rows?: number;
  roundTime?: string;
  autoSkip?: boolean;
  botPlayers?: number;
  current_turn: number;
  started: boolean;
  creator?: string;
  name?: string;
  map?: GameMap;
}
