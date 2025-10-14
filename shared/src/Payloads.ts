import type { MatchRecord, TurnRecord } from "./match";
import type { GameMap, Axial } from "./hexTile";

export type CreateMatchPayload = {
  match_id: string;
  size: number;
  name?: string;
  error?: string;
  started?: boolean;
};

export type JoinMatchPayload = {
  ok?: boolean;
  joined?: boolean;
  players?: string[];
  size?: number;
  match_id?: string;
  name?: string;
  started?: boolean;
  error?: string;
};

export type SubmitTurnPayload = {
  ok?: boolean;
  turn?: number;
  error?: string;
};

export type UpdateMainActionPayload = {
  ok?: boolean;
  match_id?: string;
  user_id?: string;
  action_id?: string;
  targetLocationId?: Axial;
  error?: string;
};

export type GetStatePayload = {
  error?: string;
  match?: MatchRecord;
  turns?: TurnRecord[];
};

export type LeaveMatchPayload = {
  ok?: boolean;
  players?: string[];
  match_id?: string;
  left?: boolean;
  error?: string;
};

// Update match settings
export type UpdateSettingsPayload = {
  ok?: boolean;
  match_id?: string;
  // Echo back applied settings if successful
  size?: number; // players capacity
  cols?: number;
  rows?: number;
  roundTime?: string;
  autoSkip?: boolean;
  botPlayers?: number;
  name?: string;
  started?: boolean;
  error?: string;
};

// List matches the current user has joined
export type ListMyMatchesPayload = {
  ok?: boolean;
  matches?: Array<{
    match_id: string;
    size: number;
    players: string[];
    current_turn: number;
    created_at: number;
    creator?: string;
    cols?: number;
    rows?: number;
    roundTime?: string;
    autoSkip?: boolean;
    botPlayers?: number;
    name?: string;
    started?: boolean;
  }>;
  error?: string;
};

export type StartMatchPayload = {
  ok?: boolean;
  match_id?: string;
  started?: boolean;
  already_started?: boolean;
  map?: GameMap;
  error?: string;
};

export type RemoveMatchPayload = {
  ok?: boolean;
  match_id?: string;
  error?: string;
};
