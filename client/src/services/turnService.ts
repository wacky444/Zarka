import { Client, Session, Socket } from "@heroiclabs/nakama-js";
import { getEnv } from "./nakama";
import type { InMatchSettings } from "@shared";

export type Move = { n: number; ts: number };

export class TurnService {
  private socket: Socket | null = null;

  constructor(private client: Client, private session: Session) {}

  async createMatch(size = 2) {
    const res = await this.client.rpc(this.session, "create_match", { size });
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

  // Realtime (authoritative) helpers
  // Ensure there's a connected socket we can use to join/leave the match for presence.
  private async ensureSocketConnected(): Promise<Socket> {
    if (this.socket) return this.socket;
    const { useSSL } = getEnv();
    const sock = this.client.createSocket(useSSL, false);
    await sock.connect(this.session, false);
    this.socket = sock;
    return sock;
  }

  // Join the authoritative match over the realtime socket so presence shows up in match state.
  async joinRealtimeMatch(match_id: string) {
    const sock = await this.ensureSocketConnected();
    // If already in this match, do nothing.
    await sock.joinMatch(match_id);
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
}
