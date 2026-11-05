import { isBotId } from "@shared";
import type { MatchRecord } from "../models/types";

export function getEffectiveLastHumanActionAt(match: MatchRecord): number {
  return match.last_human_action_at ?? match.started_at ?? match.created_at ?? 0;
}

export function getEffectiveLastRosterActivityAt(match: MatchRecord): number {
  return match.last_roster_activity_at ?? match.created_at ?? 0;
}

export function getConsecutiveAfkTurns(
  match: MatchRecord,
  playerId: string
): number {
  return match.consecutive_afk_turns?.[playerId] ?? 0;
}

export function isPlayerForfeited(
  match: MatchRecord,
  playerId: string
): boolean {
  return match.forfeited_players?.[playerId] === true;
}

export function isBotControlled(
  match: MatchRecord,
  playerId: string
): boolean {
  return isBotId(playerId) || isPlayerForfeited(match, playerId);
}

export function isActiveHumanPlayer(
  match: MatchRecord,
  playerId: string
): boolean {
  return Boolean(playerId) && !isBotControlled(match, playerId);
}
