import type { Axial, GameMap } from "./hexTile";
import type {
  PlayerCharacter,
  PlayerCharacterUnknown
} from "./playerCharacter";
import type { ItemId } from "./Item";
import type { MatchReportProgress } from "./matchReport";

export interface MatchItemRecord {
  item_id: string;
  item_type: ItemId;
}

export interface TrapRecord {
  id: string;
  ownerId: string;
  from: {
    tileId: string;
    coord: Axial;
  };
  to: {
    tileId: string;
    coord: Axial;
  };
  damage: number;
  placedTurn: number;
}

export interface MatchRecord {
  /** Stable logical game identifier used by storage and client RPCs. */
  match_id: string;
  /** Current Nakama authoritative match identifier. It changes after a restart. */
  runtime_match_id?: string;
  players: string[];
  playerCharacters: Record<string, PlayerCharacter>;
  playerList: Record<string, PlayerCharacterUnknown>;
  readyStates?: Record<string, boolean>;
  deadCharacters?: Record<string, boolean>;
  size: number;
  cols?: number;
  rows?: number;
  roundTime?: string;
  autoSkip?: boolean;
  botPlayers?: number;
  turnsToBeAt1Tile?: number;
  created_at: number;
  current_turn: number;
  creator?: string;
  name?: string;
  started: boolean;
  removed: number;
  map?: GameMap;
  items?: MatchItemRecord[];
  traps?: TrapRecord[];
  teams?: string[];
  teamCounts?: Record<string, number>;
  lastAutoAdvanceAt?: number;
  reportProgress?: MatchReportProgress;
}

export interface TurnRecord {
  match_id: string;
  turn: number;
  player: string;
  move: unknown;
  created_at: number;
}
