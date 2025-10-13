import { Client, Session, Socket } from "@heroiclabs/nakama-js";
import { getEnv } from "./nakama";
import type { InMatchSettings } from "@shared";

export type Move = { n: number; ts: number };

type BasicUser = {
  id?: string;
  user_id?: string;
  username?: string;
  display_name?: string;
};

export class TurnService {
  private socket: Socket | null = null;
  private onSettingsUpdate?: (payload: {
    size?: number;
    cols?: number;
    rows?: number;
    roundTime?: string;
    autoSkip?: boolean;
    botPlayers?: number;
    name?: string;
    started?: boolean;
    players?: string[];
  }) => void;
  private onMatchRemoved?: () => void;
  private usernameCache = new Map<string, string>();

  constructor(private client: Client, private session: Session) {}

  // Resolve Nakama usernames (or display names) for the given userIds with caching.
  async resolveUsernames(userIds: string[]): Promise<Record<string, string>> {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return {};
    }

    const ids = Array.from(
      new Set(
        userIds.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0
        )
      )
    );

    if (ids.length === 0) {
      return {};
    }

    // Seed the cache with the current user if available.
    if (this.session.user_id) {
      const currentName =
        (typeof this.session.username === "string" &&
          this.session.username.trim()) ||
        this.session.user_id;
      this.usernameCache.set(this.session.user_id, currentName);
    }

    const missing = ids.filter((id) => !this.usernameCache.has(id));
    if (missing.length > 0) {
      try {
        const response = await this.client.getUsers(this.session, missing);
        const users = Array.isArray(response?.users)
          ? (response.users as BasicUser[])
          : [];
        for (const user of users) {
          if (!user || typeof user !== "object") continue;
          const id =
            typeof user.user_id === "string"
              ? user.user_id
              : typeof user.id === "string"
              ? user.id
              : null;
          if (!id) continue;
          const username =
            (typeof user.username === "string" && user.username.trim()) ||
            (typeof user.display_name === "string" &&
              user.display_name.trim()) ||
            id;
          this.usernameCache.set(id, username);
        }
      } catch (error) {
        console.warn("resolveUsernames: failed to fetch", error);
      }

      for (const id of missing) {
        if (!this.usernameCache.has(id)) {
          this.usernameCache.set(id, id);
        }
      }
    }

    const result: Record<string, string> = {};
    for (const id of ids) {
      const cached = this.usernameCache.get(id);
      if (cached) {
        result[id] = cached;
      }
    }
    return result;
  }

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

  async startMatch(match_id: string) {
    const res = await this.client.rpc(this.session, "start_match", {
      match_id,
    });
    return res;
  }

  async updateMainAction(match_id: string, action_id: string | null) {
    const res = await this.client.rpc(this.session, "update_main_action", {
      match_id,
      action_id,
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

  async removeMatch(match_id: string) {
    const res = await this.client.rpc(this.session, "remove_match", {
      match_id,
    });
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
              players?: string[];
            };
            if (this.onSettingsUpdate) this.onSettingsUpdate(payload);
          } catch (e) {
            console.warn("Failed to parse settings update", e);
          }
        } else if (m.op_code === 101) {
          try {
            const payload = JSON.parse(new TextDecoder().decode(m.data)) as {
              match_removed?: boolean;
            };
            if (payload.match_removed && this.onMatchRemoved) {
              this.onMatchRemoved();
            }
          } catch (e) {
            console.warn("Failed to parse match removed message", e);
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
      players?: string[];
    }) => void
  ) {
    this.onSettingsUpdate = cb;
  }

  setOnMatchRemoved(cb: () => void) {
    this.onMatchRemoved = cb;
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
    this.onMatchRemoved = undefined;
  }

  // Getters for client and session (used in MainScene)
  getClient(): Client {
    return this.client;
  }

  getSession(): Session {
    return this.session;
  }
}
