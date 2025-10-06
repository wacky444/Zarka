import type { GameMap } from "./hexTile";

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
  map?: GameMap;
}

export interface TurnRecord {
  match_id: string;
  turn: number;
  player: string;
  move: unknown;
  created_at: number;
}
