import type { Skin } from "./UserAccount";

export type MatchReportReason = "last_alive" | "all_dead";

export interface MatchReportProgressEntry {
  aliveTurns: number;
  carriedWeightTotal: number;
}

export interface MatchReportProgress {
  [playerId: string]: MatchReportProgressEntry;
}

export interface MatchReportPlayer {
  player_id: string;
  player_name: string;
  character_id: string;
  character_name: string;
  team_id?: string;
  skin?: Skin;
  alive: boolean;
  damage_dealt: number;
  damage_received: number;
  players_killed: number;
  actions_used: number;
  items_collected: number;
  items_carried: number;
  average_weight_carried: number;
}

export interface MatchReportTeam {
  team_id: string;
  rank: number;
  won: boolean;
  player_ids: string[];
  total_damage_dealt: number;
  total_damage_received: number;
  kills: number;
}

export interface MatchAchievement {
  id: string;
  player_id?: string;
  team_id?: string;
  value?: number;
}

export interface MatchReport {
  match_id: string;
  name?: string;
  created_at: number;
  ended_at: number;
  turns: number;
  reason: MatchReportReason;
  winning_team_id?: string;
  winning_character_ids: string[];
  teams: MatchReportTeam[];
  players: MatchReportPlayer[];
  achievements: MatchAchievement[];
}
