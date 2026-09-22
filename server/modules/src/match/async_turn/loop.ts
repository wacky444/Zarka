/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { DEFAULT_REPLAY_VIEW_DISTANCE } from "@shared";
import { AsyncTurnState, MatchRecord } from "../../models/types";
import { createNakamaWrapper } from "../../services/nakamaWrapper";
import { StorageService } from "../../services/storageService";
import { resolveTurnForMatch } from "../turnResolution";
import { isBotId } from "../botAI";
import { validateTime } from "../../utils/validation";
import {
  isCharacterDead,
  isCharacterIncapacitated,
} from "../../utils/playerCharacter";
import { getAliveCharacterIds } from "../checkEndGame";
import { createReplaySnapshot } from "../replay/snapshot";

const AUTO_CHECK_INTERVAL_MS = 60 * 1000;
const BOT_AUTO_CHECK_INTERVAL_MS = 5 * 1000;

function timeToMinutes(value: string): number | null {
  const parts = value.split(":");
  if (parts.length !== 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (!isFinite(hours) || !isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function areOnlyBotsAlive(match: MatchRecord): boolean {
  const characters = match.playerCharacters;
  let aliveBots = 0;
  for (const playerId in characters) {
    if (!Object.prototype.hasOwnProperty.call(characters, playerId)) {
      continue;
    }
    const character = characters[playerId];
    if (isCharacterDead(character)) {
      continue;
    }
    if (!isBotId(playerId)) {
      return false;
    }
    aliveBots += 1;
  }
  return aliveBots > 0;
}

function hasAutoAdvancedToday(
  lastAutoAdvanceAt: number | undefined,
  nowMs: number,
): boolean {
  if (!lastAutoAdvanceAt) return false;
  const lastLocal = new Date(lastAutoAdvanceAt * 1000);
  const nowLocal = new Date(nowMs);
  return (
    lastLocal.getFullYear() === nowLocal.getFullYear() &&
    lastLocal.getMonth() === nowLocal.getMonth() &&
    lastLocal.getDate() === nowLocal.getDate()
  );
}

export const asyncTurnMatchLoop: nkruntime.MatchLoopFunction<AsyncTurnState> =
  function (ctx, logger, nk, dispatcher, tick, state, messages) {
    const runtimeMatchId = ctx.matchId;
    if (!runtimeMatchId) {
      return { state };
    }
    const nowMs = Date.now();
    const lastCheck = state.lastAutoCheckAt ?? 0;
    const lastBotCheck = state.lastBotAutoAdvanceAt ?? 0;
    const normalCheckDue = nowMs - lastCheck >= AUTO_CHECK_INTERVAL_MS;
    const botCheckDue =
      nowMs - lastBotCheck >= BOT_AUTO_CHECK_INTERVAL_MS;
    if (!normalCheckDue && !botCheckDue) {
      return { state };
    }
    if (normalCheckDue) {
      state.lastAutoCheckAt = nowMs;
    }

    const nkWrapper = createNakamaWrapper(nk);
    const storage = new StorageService(nkWrapper);
    const gameId = state.game_id || runtimeMatchId;
    const stored = storage.getMatch(gameId);
    if (!stored) {
      return { state };
    }

    const match = stored.match;
    if (match.started !== true) {
      return { state };
    }

    const botOnlyAlive = areOnlyBotsAlive(match);
    if (botOnlyAlive) {
      if (!botCheckDue) {
        return { state };
      }
      state.lastBotAutoAdvanceAt = nowMs;
      logger.debug(
        "Advancing bot-only match %s on the five-second timer",
        runtimeMatchId,
      );
    } else {
      if (!normalCheckDue || !state.autoSkip || match.autoSkip === false) {
        return { state };
      }
      const configuredRoundTime =
        typeof state.roundTime === "string"
          ? validateTime(state.roundTime)
          : undefined;
      if (!configuredRoundTime) {
        return { state };
      }
      const nowLocal = new Date(nowMs);
      const currentMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
      const targetMinutes = timeToMinutes(configuredRoundTime);
      logger.debug(
        "Auto-checking turn advancement, currentMinutes/targetMinutes: %d/%d",
        currentMinutes,
        targetMinutes,
      );
      if (targetMinutes === null || currentMinutes < targetMinutes) {
        return { state };
      }

      const matchRoundTime =
        typeof match.roundTime === "string"
          ? (validateTime(match.roundTime) ?? configuredRoundTime)
          : configuredRoundTime;
      const matchTargetMinutes = timeToMinutes(matchRoundTime);
      if (matchTargetMinutes === null || currentMinutes < matchTargetMinutes) {
        return { state };
      }
    }

    const players = Array.isArray(match.players) ? match.players : [];
    if (players.length === 0) {
      return { state };
    }

    if (!botOnlyAlive) {
      // Avoid double advancing if all players are already ready
      const allReady = players.every((playerId) => {
        const readyStates = match.readyStates ?? {};
        const character = match.playerCharacters?.[playerId] ?? null;
        return (
          isCharacterIncapacitated(character) || readyStates[playerId] === true
        );
      });
      if (allReady) {
        return { state };
      }

      if (hasAutoAdvancedToday(match.lastAutoAdvanceAt, nowMs)) {
        return { state };
      }
    }

    const outcome = resolveTurnForMatch(match, logger, nk);
    if (!outcome.advanced || !outcome.resolvedTurn) {
      return { state };
    }
    logger.debug("Auto-advancing turn for match %s", runtimeMatchId);
    const timestampSeconds = Math.floor(nowMs / 1000);
    match.lastAutoAdvanceAt = timestampSeconds;

    try {
      storage.writeMatch(match, stored.version);
    } catch (error) {
      logger.warn(
        "autoskip write failed for %s: %s",
        runtimeMatchId,
        (error as Error).message,
      );
      return { state };
    }

    try {
      storage.appendReplayTurn({
        match_id: match.match_id,
        turn: outcome.resolvedTurn,
        events: outcome.events,
        snapshot: createReplaySnapshot(match),
        created_at: timestampSeconds,
      });
    } catch (error) {
      logger.warn(
        "autoskip replay write failed for %s: %s",
        runtimeMatchId,
        (error as Error).message,
      );
    }

    try {
      nkWrapper.matchSignal(
        runtimeMatchId,
        JSON.stringify({
          type: "turn_advanced",
          turn: match.current_turn,
          match_id: match.match_id,
          readyStates: match.readyStates,
          lastAutoAdvanceAt: match.lastAutoAdvanceAt,
          playerCharacters: match.playerCharacters,
          events: outcome.events,
          viewDistance: DEFAULT_REPLAY_VIEW_DISTANCE,
          map: match.map,
          items: match.items,
          traps: match.traps,
        }),
      );
    } catch (error) {
      logger.debug(
        "autoskip matchSignal failed for %s: %s",
        runtimeMatchId,
        (error as Error).message,
      );
    }

    if (match.removed && match.removed !== 0) {
      try {
        const alive = getAliveCharacterIds(match);
        const winnerId = alive.length > 0 ? alive[0] : undefined;
        const reason = alive.length === 0 ? "all_dead" : "last_alive";
        nkWrapper.matchSignal(
          runtimeMatchId,
          JSON.stringify({
            type: "match_ended",
            match_id: match.match_id,
            winnerId,
            winnerIds: alive,
            reason,
          }),
        );
      } catch (error) {
        logger.debug(
          "autoskip match_ended signal failed for %s: %s",
          runtimeMatchId,
          (error as Error).message,
        );
      }
    }

    state.lastAutoAdvanceAt = match.lastAutoAdvanceAt;
    return { state };
  };
