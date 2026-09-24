export const NAKAMA_SYSTEM_USER_ID =
  "00000000-0000-0000-0000-000000000000" as const;
export const MATCH_CHAT_ROOM_PREFIX = "match:";
export const MATCH_CHAT_ROOM_CHANNEL_TYPE = 1 as const;

export interface MatchChatMessage {
  messageId: string;
  matchId: string;
  senderId: string;
  content: string;
  createdAt: number;
  username?: string;
  displayName?: string;
  code?: number;
  persistent?: boolean;
  system?: boolean;
}

export interface MatchChatLog {
  matchId: string;
  messages: MatchChatMessage[];
  updatedAt: number;
}

export interface SaveChatMessageRequest {
  matchId: string;
  messageId: string;
  content: string;
  createdAt?: number;
  username?: string;
  displayName?: string;
  code?: number;
  persistent?: boolean;
  system?: boolean;
}

export const MAX_CHAT_MESSAGE_LENGTH = 70;
