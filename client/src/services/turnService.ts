import { Client, Session } from "@heroiclabs/nakama-js";
import type { InMatchSettings } from "@shared";

export type Move = { n: number; ts: number };

export class TurnService {
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
}
