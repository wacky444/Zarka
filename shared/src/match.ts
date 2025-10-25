import type { GameMap } from "./hexTile";
import type { PlayerCharacter } from "./playerCharacter";
import type { ItemId } from "./Item";

export interface MatchItemRecord {
  item_id: string;
  item_type: ItemId;
}

export interface MatchRecord {
  match_id: string;
  players: string[];
  playerCharacters: Record<string, PlayerCharacter>;
  readyStates?: Record<string, boolean>;
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
  items?: MatchItemRecord[];
}

export interface TurnRecord {
  match_id: string;
  turn: number;
  player: string;
  move: unknown;
  created_at: number;
}
