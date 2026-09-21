import type {
  MatchItemRecord,
  MatchRecord,
  TrapRecord,
  TurnRecord,
} from "./match";
import type { GameMap, Axial } from "./hexTile";
import type {
  PlayerCharacter,
  PlayerCharacterUnknown
} from "./playerCharacter";
import type { ReplayEvent, ReplaySnapshot } from "./Replay";
import type { MatchChatMessage } from "./chat";
import type { Skin, UserAccount } from "./UserAccount";
import type { MatchReport } from "./matchReport";
import type { SkillId } from "./skills/Skill";
import type { ShopId } from "./Shop";

export const OPCODE_SETTINGS_UPDATE = 100;
export const OPCODE_MATCH_REMOVED = 101;
export const OPCODE_TURN_ADVANCED = 102;
export const OPCODE_MATCH_ENDED = 103;
export const OPCODE_READY_STATE_UPDATE = 104;

export type CreateMatchPayload = {
  match_id: string;
  runtime_match_id?: string;
  size: number;
  turnsToBeAt1Tile?: number;
  name?: string;
  error?: string;
  started?: boolean;
};

export type JoinMatchPayload = {
  ok?: boolean;
  joined?: boolean;
  players?: string[];
  runtime_match_id?: string;
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
  extraExecutions?: number;
  singleTarget?: boolean;
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
  extraExecutions?: number;
  prioritizeFoodDrink?: boolean;
  sellInstead?: boolean;
  singleTarget?: boolean;
  inspectAdditionalTarget?: boolean;
  error?: string;
};

export type UpdateReadyStatePayload = {
  ok?: boolean;
  match_id?: string;
  ready?: boolean;
  all_ready?: boolean;
  turn?: number;
  readyStates?: Record<string, boolean>;
  deadCharacters?: Record<string, boolean>;
  advanced?: boolean;
  lastAutoAdvanceAt?: number;
  playerCharacters?: Record<string, PlayerCharacter>;
  map?: GameMap;
  items?: MatchItemRecord[];
  traps?: TrapRecord[];
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
  snapshot?: ReplaySnapshot;
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
  turnsToBeAt1Tile?: number;
  name?: string;
  started?: boolean;
  error?: string;
};

// List matches the current user has joined
export type ListMyMatchesPayload = {
  ok?: boolean;
  matches?: Array<{
    match_id: string;
    runtime_match_id?: string;
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
    turnsToBeAt1Tile?: number;
    name?: string;
    started?: boolean;
    status?: "waiting" | "in_progress" | "finished";
    ended_at?: number;
    turns?: number;
    duration_ms?: number;
    player_team_won?: boolean;
    has_report?: boolean;
  }>;
  error?: string;
};

export type GetMatchReportPayload = {
  ok?: boolean;
  report?: MatchReport;
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
  lastAutoAdvanceAt?: number;
  deadCharacters?: Record<string, boolean>;
  playerCharacters?: Record<string, PlayerCharacter>;
  advanced?: boolean;
  replay?: ReplayEvent[];
  viewDistance?: number;
  map?: GameMap;
  items?: MatchItemRecord[];
  traps?: TrapRecord[];
};

export type MatchEndedMessagePayload = {
  match_id: string;
  winnerId?: string;
  winnerIds?: string[];
  reason: "last_alive" | "all_dead";
};

export type ReadyStateUpdateMessagePayload = {
  match_id: string;
  readyStates: Record<string, boolean>;
  deadCharacters?: Record<string, boolean>;
  traps?: TrapRecord[];
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

export type UpgradeSkillPayload = {
  ok?: boolean;
  match_id?: string;
  user_id?: string;
  skill_id?: SkillId;
  skill_ids?: SkillId[];
  character?: PlayerCharacter;
  error?: string;
};

export type UpdateTestamentPayload = {
  ok?: boolean;
  match_id?: string;
  user_id?: string;
  recipient_id?: string;
  character?: PlayerCharacter;
  error?: string;
};

export type UpdateTestamentRequest = {
  match_id: string;
  recipient_id?: string | null;
};

export type BuyShopItemRequest = {
  match_id: string;
  shop_id: ShopId;
  target_player_id?: string;
};

export type BuyShopItemPayload = {
  ok?: boolean;
  match_id?: string;
  user_id?: string;
  shop_id?: ShopId;
  target_player_id?: string;
  target_team_id?: string;
  character?: PlayerCharacter;
  event?: ReplayEvent;
  error?: string;
};

export type UpgradeSkillRequest = {
  match_id: string;
  skill_id?: SkillId;
  skill_ids?: SkillId[];
};
