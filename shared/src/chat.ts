export interface MatchChatMessage {
  messageId: string;
  matchId: string;
  senderId: string;
  content: string;
  createdAt: number;
  username?: string;
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
  code?: number;
  persistent?: boolean;
  system?: boolean;
}

export const MAX_CHAT_MESSAGE_LENGTH = 70;
