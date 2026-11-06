import { isBotId } from "@shared";
import type { MatchRecord } from "../models/types";
import { isCharacterDead, isCharacterIncapacitated } from "./playerCharacter";

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

export function recordRosterActivity(
  match: MatchRecord,
  nowSeconds?: number
): void {
  match.last_roster_activity_at = nowSeconds ?? Math.floor(Date.now() / 1000);
}

export function recordHumanGameplayActivity(
  match: MatchRecord,
  playerId: string,
  nowSeconds?: number
): void {
  if (!isActiveHumanPlayer(match, playerId)) {
    return;
  }
  match.last_human_action_at = nowSeconds ?? Math.floor(Date.now() / 1000);
  match.consecutive_afk_turns = match.consecutive_afk_turns ?? {};
  match.consecutive_afk_turns[playerId] = 0;
}

export function incrementAutoAdvanceAfkCounters(match: MatchRecord): string[] {
  const incrementedPlayerIds: string[] = [];
  match.consecutive_afk_turns = match.consecutive_afk_turns ?? {};

  const players = Array.isArray(match.players) ? match.players : [];
  for (const playerId of players) {
    if (!isActiveHumanPlayer(match, playerId)) {
      continue;
    }

    const char = match.playerCharacters?.[playerId];
    if (!char || isCharacterDead(char) || isCharacterIncapacitated(char)) {
      continue;
    }

    const isReady = match.readyStates?.[playerId] === true;
    const hasPlannedAction = Boolean(
      char.actionPlan?.main?.actionId ||
        char.actionPlan?.secondary?.actionId ||
        char.actionPlan?.extraSecondary?.actionId
    );

    if (!isReady && !hasPlannedAction) {
      match.consecutive_afk_turns[playerId] =
        (match.consecutive_afk_turns[playerId] ?? 0) + 1;
      incrementedPlayerIds.push(playerId);
    } else {
      match.consecutive_afk_turns[playerId] = 0;
    }
  }

  return incrementedPlayerIds;
}
