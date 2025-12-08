import type {
  Channel,
  ChannelMessage,
  ChannelMessageAck,
  RpcResponse,
  Socket,
} from "@heroiclabs/nakama-js";
import type {
  GetChatHistoryPayload,
  MatchChatMessage,
  SaveChatMessageRequest,
} from "@shared";
import { getEnv } from "./nakama";
import type { TurnService } from "./turnService";

const HISTORY_LIMIT = 50;
const MAX_MESSAGE_LENGTH = 240;
const CHANNEL_TYPE_ROOM = 1; // Nakama: 1 = room, 2 = DM, 3 = group

function stringFromContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!value) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function decodeMessageContent(raw: unknown): string {
  const stringified = stringFromContent(raw);
  if (!stringified) {
    return "";
  }
  const trimmed = stringified.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        message?: unknown;
        text?: unknown;
        content?: unknown;
      };
      const candidate = [parsed.message, parsed.text, parsed.content].find(
        (value) => typeof value === "string"
      );
      if (typeof candidate === "string") {
        return candidate;
      }
    } catch {
      return stringified;
    }
  }
  return stringified;
}

export class MatchChatService {
  private socket: Socket | null = null;
  private channel: Channel | null = null;
  private matchId: string | null = null;
  private readonly listeners = new Set<(message: MatchChatMessage) => void>();

  constructor(private readonly turnService: TurnService) {}

  async connect(matchId: string): Promise<MatchChatMessage[]> {
    const normalized = matchId.trim();
    if (!normalized) {
      throw new Error("matchId is required");
    }
    const socket = await this.ensureSocket();
    if (this.channel && this.matchId === normalized) {
      return this.fetchRecentMessages();
    }
    await this.leaveChannel();
    const room = this.buildRoomName(normalized);
    this.channel = await socket.joinChat(room, CHANNEL_TYPE_ROOM, true, false);
    this.matchId = normalized;
    return this.fetchRecentMessages();
  }

  async disconnect(): Promise<void> {
    await this.leaveChannel();
    if (this.socket) {
      try {
        this.socket.disconnect(true);
      } catch (error) {
        console.warn("chat socket disconnect failed", error);
      }
      this.socket = null;
    }
    this.matchId = null;
    this.listeners.clear();
  }

  onMessage(handler: (message: MatchChatMessage) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  async send(text: string): Promise<void> {
    if (!this.socket || !this.channel) {
      throw new Error("Chat is not connected");
    }
    if (!this.matchId) {
      throw new Error("Match context missing");
    }
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const message = trimmed.slice(0, MAX_MESSAGE_LENGTH);
    const ack = await this.socket.writeChatMessage(this.channel.id, {
      message,
    });
    this.persistSentMessage(ack, message).catch((error) => {
      console.warn("chat persist failed", error);
    });
  }

  async refreshHistory(): Promise<MatchChatMessage[]> {
    return this.fetchRecentMessages();
  }

  private async ensureSocket(): Promise<Socket> {
    if (this.socket) {
      return this.socket;
    }
    const client = this.turnService.getClient();
    const session = this.turnService.getSession();
    const { useSSL } = getEnv();
    const socket = client.createSocket(useSSL, false);
    socket.onchannelmessage = (payload) => {
      this.handleChannelMessage(payload);
    };
    await socket.connect(session, false);
    this.socket = socket;
    return socket;
  }

  private async leaveChannel(): Promise<void> {
    if (!this.channel || !this.socket) {
      this.channel = null;
      return;
    }
    try {
      await this.socket.leaveChat(this.channel.id);
    } catch (error) {
      console.warn("chat channel leave failed", error);
    }
    this.channel = null;
  }

  private async fetchRecentMessages(): Promise<MatchChatMessage[]> {
    if (!this.matchId) {
      return [];
    }
    try {
      const res = await this.turnService.getChatHistory(
        this.matchId,
        HISTORY_LIMIT
      );
      const payload = this.parseRpcPayload<GetChatHistoryPayload>(res);
      if (payload.error) {
        throw new Error(payload.error);
      }
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      return messages;
    } catch (error) {
      console.warn("chat history fetch failed", error);
      return [];
    }
  }

  private handleChannelMessage(payload: ChannelMessage): void {
    if (!this.channel || payload.channel_id !== this.channel.id) {
      return;
    }
    const message = this.mapMessage(payload);
    this.notify(message);
  }

  private notify(message: MatchChatMessage) {
    for (const handler of this.listeners) {
      handler(message);
    }
  }

  private mapMessage(payload: ChannelMessage): MatchChatMessage {
    const createdAt = payload.create_time
      ? Date.parse(payload.create_time)
      : Date.now();
    return {
      messageId: payload.message_id || "",
      matchId: this.matchId ?? "",
      senderId: payload.user_id_one ?? "",
      username: payload.username ?? undefined,
      content: decodeMessageContent(payload.content),
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      code: payload.code,
      persistent: payload.persistent,
      system: typeof payload.code === "number" && payload.code !== 0,
    };
  }

  private buildRoomName(matchId: string) {
    return `match:${matchId}`;
  }

  private parseRpcPayload<T>(res: RpcResponse): T {
    const raw: unknown = (res as RpcResponse).payload as unknown;
    if (typeof raw === "string") {
      return JSON.parse(raw) as T;
    }
    if (raw && typeof raw === "object") {
      return raw as T;
    }
    throw new Error("Unsupported payload type: " + typeof raw);
  }

  private async persistSentMessage(
    ack: ChannelMessageAck,
    content: string
  ): Promise<void> {
    if (!this.matchId) {
      return;
    }
    const createdAt = ack.create_time
      ? Date.parse(ack.create_time)
      : Date.now();
    const request: SaveChatMessageRequest = {
      matchId: this.matchId,
      messageId:
        typeof ack.message_id === "string" && ack.message_id.trim().length > 0
          ? ack.message_id
          : `${this.matchId}:${Date.now()}`,
      content,
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      username: ack.username ?? undefined,
      code: typeof ack.code === "number" ? ack.code : undefined,
      persistent:
        typeof ack.persistence === "boolean" ? ack.persistence : undefined,
    };
    await this.turnService.saveChatMessage(request);
  }
}
