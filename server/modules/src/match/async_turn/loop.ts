/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { DEFAULT_REPLAY_VIEW_DISTANCE } from "@shared";
import { AsyncTurnState } from "../../models/types";
import { createNakamaWrapper } from "../../services/nakamaWrapper";
import { StorageService } from "../../services/storageService";
import { resolveTurnForMatch } from "../turnResolution";
import { validateTime } from "../../utils/validation";
import { isCharacterIncapacitated } from "../../utils/playerCharacter";
import { getAliveCharacterIds } from "../checkEndGame";

const AUTO_CHECK_INTERVAL_MS = 60 * 1000;

function getLocalOffsetMinutes(env?: { [key: string]: string }): number {
  const raw = env?.ROUND_TIME_OFFSET_MINUTES ?? env?.LOCAL_TIME_OFFSET_MINUTES;
  if (typeof raw !== "string") return 0;
  const parsed = parseInt(raw, 10);
  return isFinite(parsed) ? parsed : 0;
}

function toLocalDate(baseMs: number, offsetMinutes: number): Date {
  return new Date(baseMs + offsetMinutes * 60_000);
}

function timeToMinutes(value: string): number | null {
  const parts = value.split(":");
  if (parts.length !== 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (!isFinite(hours) || !isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function hasAutoAdvancedToday(
  lastAutoAdvanceAt: number | undefined,
  nowMs: number,
  offsetMinutes: number,
): boolean {
  if (!lastAutoAdvanceAt) return false;
  const lastLocal = toLocalDate(lastAutoAdvanceAt * 1000, offsetMinutes);
  const nowLocal = toLocalDate(nowMs, offsetMinutes);
  return (
    lastLocal.getFullYear() === nowLocal.getFullYear() &&
    lastLocal.getMonth() === nowLocal.getMonth() &&
    lastLocal.getDate() === nowLocal.getDate()
  );
}

export const asyncTurnMatchLoop: nkruntime.MatchLoopFunction<AsyncTurnState> =
  function (ctx, logger, nk, dispatcher, tick, state, messages) {
    const nowMs = Date.now();
    const offsetMinutes = getLocalOffsetMinutes(ctx.env);
    const lastCheck = state.lastAutoCheckAt ?? 0;
    if (nowMs - lastCheck < AUTO_CHECK_INTERVAL_MS) {
      return { state };
    }
    state.lastAutoCheckAt = nowMs;

    if (!state.autoSkip) {
      return { state };
    }

    const configuredRoundTime =
      typeof state.roundTime === "string"
        ? validateTime(state.roundTime)
        : undefined;
    if (!configuredRoundTime) {
      return { state };
    }

    const nowLocal = toLocalDate(nowMs, offsetMinutes);
    const currentMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
    const targetMinutes = timeToMinutes(configuredRoundTime);
    logger.debug(
      "Auto-checking turn advancement, currentMinutes/targetMinutes/offset: %d/%d/%d",
      currentMinutes,
      targetMinutes,
      offsetMinutes,
    );
    if (targetMinutes === null || currentMinutes < targetMinutes) {
      return { state };
    }

    const nkWrapper = createNakamaWrapper(nk);
    const storage = new StorageService(nkWrapper);
    const stored = storage.getMatch(ctx.matchId);
    if (!stored) {
      return { state };
    }

    const match = stored.match;
    if (match.started !== true || match.autoSkip === false) {
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

    const players = Array.isArray(match.players) ? match.players : [];
    if (players.length === 0) {
      return { state };
    }

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

    if (hasAutoAdvancedToday(match.lastAutoAdvanceAt, nowMs, offsetMinutes)) {
      return { state };
    }

    const outcome = resolveTurnForMatch(match, logger, nk);
    if (!outcome.advanced || !outcome.resolvedTurn) {
      return { state };
    }
    logger.debug("9Auto-checking turn advancement for match %s", ctx.matchId);
    const timestampSeconds = Math.floor(nowMs / 1000);
    match.lastAutoAdvanceAt = timestampSeconds;

    try {
      storage.writeMatch(match, stored.version);
    } catch (error) {
      logger.warn(
        "autoskip write failed for %s: %s",
        ctx.matchId,
        (error as Error).message,
      );
      return { state };
    }

    if (outcome.events.length > 0) {
      try {
        storage.appendReplayTurn({
          match_id: ctx.matchId,
          turn: outcome.resolvedTurn,
          events: outcome.events,
          created_at: timestampSeconds,
        });
      } catch (error) {
        logger.warn(
          "autoskip replay write failed for %s: %s",
          ctx.matchId,
          (error as Error).message,
        );
      }
    }

    try {
      nkWrapper.matchSignal(
        ctx.matchId,
        JSON.stringify({
          type: "turn_advanced",
          turn: match.current_turn,
          match_id: ctx.matchId,
          readyStates: match.readyStates,
          playerCharacters: match.playerCharacters,
          events: outcome.events,
          viewDistance: DEFAULT_REPLAY_VIEW_DISTANCE,
          map: match.map,
          items: match.items,
        }),
      );
    } catch (error) {
      logger.debug(
        "autoskip matchSignal failed for %s: %s",
        ctx.matchId,
        (error as Error).message,
      );
    }

    if (match.removed && match.removed !== 0) {
      try {
        const alive = getAliveCharacterIds(match);
        const winnerId = alive.length === 1 ? alive[0] : undefined;
        const reason = alive.length === 0 ? "all_dead" : "last_alive";
        nkWrapper.matchSignal(
          ctx.matchId,
          JSON.stringify({
            type: "match_ended",
            match_id: ctx.matchId,
            winnerId,
            reason,
          }),
        );
      } catch (error) {
        logger.debug(
          "autoskip match_ended signal failed for %s: %s",
          ctx.matchId,
          (error as Error).message,
        );
      }
      try {
        nkWrapper.matchSignal(
          ctx.matchId,
          JSON.stringify({ type: "match_removed" }),
        );
      } catch (error) {
        logger.debug(
          "autoskip match_removed signal failed for %s: %s",
          ctx.matchId,
          (error as Error).message,
        );
      }
    }

    state.lastAutoAdvanceAt = match.lastAutoAdvanceAt;
    return { state };
  };
