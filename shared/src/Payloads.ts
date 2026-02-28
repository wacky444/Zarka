import type { MatchItemRecord, MatchRecord, TurnRecord } from "./match";
import type { GameMap, Axial } from "./hexTile";
import type { PlayerCharacter } from "./playerCharacter";
import type { ReplayEvent } from "./Replay";
import type { MatchChatMessage } from "./chat";
import type { Skin, UserAccount } from "./UserAccount";

export const OPCODE_SETTINGS_UPDATE = 100;
export const OPCODE_MATCH_REMOVED = 101;
export const OPCODE_TURN_ADVANCED = 102;
export const OPCODE_MATCH_ENDED = 103;

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
  targetPlayerIds?: string[];
  targetItemIds?: string[];
  error?: string;
};

export type UpdateSecondaryActionPayload = {
  ok?: boolean;
  match_id?: string;
  user_id?: string;
  action_id?: string;
  targetLocationId?: Axial;
  targetPlayerIds?: string[];
  targetItemIds?: string[];
  error?: string;
};

export type UpdateReadyStatePayload = {
  ok?: boolean;
  match_id?: string;
  ready?: boolean;
  all_ready?: boolean;
  turn?: number;
  readyStates?: Record<string, boolean>;
  advanced?: boolean;
  playerCharacters?: Record<string, PlayerCharacter>;
  map?: GameMap;
  items?: MatchItemRecord[];
  error?: string;
};

export type GetStatePayload = {
  error?: string;
  match?: MatchRecord;
  turns?: TurnRecord[];
};

export type GetReplayPayload = {
  ok?: boolean;
  match_id?: string;
  turn?: number;
  max_turn?: number;
  events?: ReplayEvent[];
  error?: string;
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

export type TurnAdvancedMessagePayload = {
  match_id: string;
  turn: number;
  readyStates?: Record<string, boolean>;
  playerCharacters?: Record<string, PlayerCharacter>;
  advanced?: boolean;
  replay?: ReplayEvent[];
  viewDistance?: number;
  map?: GameMap;
  items?: MatchItemRecord[];
};

export type MatchEndedMessagePayload = {
  match_id: string;
  winnerId?: string;
  reason: "last_alive" | "all_dead";
};

export type SaveChatMessagePayload = {
  ok?: boolean;
  match_id?: string;
  message_id?: string;
  error?: string;
};

export type GetChatHistoryPayload = {
  ok?: boolean;
  match_id?: string;
  messages?: MatchChatMessage[];
  error?: string;
};

export type GetUserAccountPayload = {
  ok?: boolean;
  account?: UserAccount;
  error?: string;
};

export type UpdateSkinPayload = {
  ok?: boolean;
  skin?: Skin;
  error?: string;
};

export type UpdateProfilePayload = {
  ok?: boolean;
  displayName?: string;
  avatarUrl?: string;
  error?: string;
};
