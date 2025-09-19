// Unified RPC payload types shared between client and server

export type CreateMatchPayload = {
  match_id: string;
  size: number;
  error?: string;
};

export type JoinMatchPayload = {
  ok?: boolean;
  joined?: boolean;
  players?: string[];
  size?: number;
  match_id?: string;
  error?: string;
};

export type SubmitTurnPayload = {
  ok?: boolean;
  turn?: number;
  error?: string;
};

export type GetStatePayload = {
  error?: string;
  match?: unknown;
  turns?: unknown[];
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
  }>;
  error?: string;
};
