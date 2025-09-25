import { Client, Session, Socket } from "@heroiclabs/nakama-js";
import { getEnv } from "./nakama";
import type { InMatchSettings } from "@shared";

export type Move = { n: number; ts: number };

export class TurnService {
  private socket: Socket | null = null;
  private onSettingsUpdate?: (payload: {
    size?: number;
    cols?: number;
    rows?: number;
    started?: boolean;
  }) => void;

  constructor(private client: Client, private session: Session) {}

  async createMatch(size = 2, name?: string) {
    const payload: { size: number; name?: string } = { size };
    if (typeof name === "string" && name.trim()) {
      payload.name = name;
    }
    const res = await this.client.rpc(this.session, "create_match", payload);
    return res;
  }

  async submitTurn(match_id: string, move: Move) {
    const res = await this.client.rpc(this.session, "submit_turn", {
      match_id,
      move,
    });
    return res;
  }

  async getState(match_id: string) {
    const res = await this.client.rpc(this.session, "get_state", { match_id });
    return res;
  }

  async joinMatch(match_id: string) {
    const res = await this.client.rpc(this.session, "join_match", { match_id });
    return res;
  }

  async leaveMatch(match_id: string) {
    const res = await this.client.rpc(this.session, "leave_match", {
      match_id,
    });
    return res;
  }

  async updateSettings(match_id: string, settings: InMatchSettings) {
    const res = await this.client.rpc(this.session, "update_settings", {
      match_id,
      settings,
    });
    return res;
  }

  async listMyMatches() {
    const res = await this.client.rpc(this.session, "list_my_matches", {});
    return res;
  }

  // Realtime (authoritative) helpers
  // Ensure there's a connected socket we can use to join/leave the match for presence.
  private async ensureSocketConnected(): Promise<Socket> {
    // Create socket if missing
    if (!this.socket) {
      const { useSSL } = getEnv();
      this.socket = this.client.createSocket(useSSL, false);
      // Listen for match data packets (settings updates, etc.)
      this.socket.onmatchdata = (m) => {
        // We reserved 100 as the server opcode for settings updates
        if (m.op_code === 100) {
          try {
            const payload = JSON.parse(new TextDecoder().decode(m.data)) as {
              size?: number;
              cols?: number;
              rows?: number;
              roundTime?: string;
              autoSkip?: boolean;
              botPlayers?: number;
              started?: boolean;
              name?: string;
            };
            if (this.onSettingsUpdate) this.onSettingsUpdate(payload);
          } catch (e) {
            // ignore malformed packet
            console.warn("Failed to parse settings update", e);
          }
        }
      };
    }
    // Attempt to connect; if already connected, Nakama JS will no-op or throw a benign error we can ignore
    try {
      await this.socket.connect(this.session, false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Ignore if connection is already established
      if (!/already been established/i.test(msg)) throw e;
    }
    return this.socket;
  }

  // Join the authoritative match over the realtime socket so presence shows up in match state.
  async joinRealtimeMatch(match_id: string) {
    const sock = await this.ensureSocketConnected();
    // If already in this match, do nothing.
    try {
      await sock.joinMatch(match_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/Socket connection has not been established/i.test(msg)) {
        // try one reconnect then retry join
        await this.ensureSocketConnected();
        await sock.joinMatch(match_id);
        return;
      }
      throw e;
    }
  }

  // Leave the authoritative match over the realtime socket.
  async leaveRealtimeMatch(match_id: string) {
    if (!this.socket) return;
    try {
      await this.socket.leaveMatch(match_id);
    } catch {
      // ignore; leaving a non-joined match is a no-op for our flow
    }
  }

  // Allow consumers to react to settings updates pushed by the server
  setOnSettingsUpdate(
    cb: (payload: {
      size?: number;
      cols?: number;
      rows?: number;
      roundTime?: string;
      autoSkip?: boolean;
      botPlayers?: number;
      started?: boolean;
      name?: string;
    }) => void
  ) {
    this.onSettingsUpdate = cb;
  }

  // Optionally allow callers to pre-connect the socket
  async connectSocket(): Promise<void> {
    await this.ensureSocketConnected();
  }

  // Disconnect the socket and clean up
  disconnect(): void {
    if (this.socket) {
      try {
        this.socket.disconnect(true);
      } catch (error) {
        console.warn("Error disconnecting socket:", error);
      }
      this.socket = null;
    }
    this.onSettingsUpdate = undefined;
  }

  // Getters for client and session (used in MainScene)
  getClient(): Client {
    return this.client;
  }

  getSession(): Session {
    return this.session;
  }
}
