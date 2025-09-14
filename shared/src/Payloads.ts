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
