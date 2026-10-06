import type { Axial, GameMap } from "./hexTile";
import type {
  PlayerCharacter,
  PlayerCharacterUnknown
} from "./playerCharacter";
import type { ItemId } from "./Item";
import type { MatchReportProgress } from "./matchReport";
import type { MatchMetadata } from "./Tutorial";

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

export interface C4Record {
  id: string;
  ownerId: string;
  tileId: string;
  coord: Axial;
  placedTurn: number;
}

export interface MatchTrackerRecord {
  id: string;
  ownerId: string;
  targetId: string;
  targetIdKnownToOwner: boolean;
  /** Target discovered the attached device through Inspect. */
  discoveredByTarget?: boolean;
  placedTurn: number;
  expiresTurn: number;
}

export interface ZarkanDonationRecord {
  donor_id: string;
  recipient_id: string;
  amount: number;
  turn: number;
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
  started_at?: number;
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
  /** Server-private placed C4; omitted from other players' views. */
  c4s?: C4Record[];
  /** Server-private tracker placements; omitted from normal player views. */
  trackers?: MatchTrackerRecord[];
  /** Donation history; match views expose entries only to participants involved. */
  zarkanDonations?: ZarkanDonationRecord[];
  teams?: string[];
  teamCounts?: Record<string, number>;
  /** Team identities revealed to the viewing player by Detective purchases. */
  revealedTeamsByPlayerId?: Record<string, string>;
  lastAutoAdvanceAt?: number;
  reportProgress?: MatchReportProgress;
  metadata?: MatchMetadata;
}

export interface TurnRecord {
  match_id: string;
  turn: number;
  player: string;
  move: unknown;
  created_at: number;
}
