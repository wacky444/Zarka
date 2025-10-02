/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

export interface MatchRecord {
  match_id: string;
  players: string[];
  size: number;
  cols?: number;
  rows?: number;
  roundTime?: string;
  autoSkip?: boolean;
  botPlayers?: number;
  created_at: number;
  current_turn: number;
  creator?: string;
  name?: string;
  started: boolean;
  removed: number;
}

export interface TurnRecord {
  match_id: string;
  turn: number;
  player: string;
  move: any;
  created_at: number;
}

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
}
