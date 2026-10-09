import { validateTime } from "./validation";

const FIRST_TURN_AUTO_SKIP_DELAY_MS = 24 * 60 * 60 * 1000 + 1000;

export interface AutoAdvanceSchedule {
  stateRoundTime: unknown;
  matchRoundTime: unknown;
  stateAutoSkip: boolean | undefined;
  matchAutoSkip: boolean | undefined;
  currentTurn: number;
  startedAtSeconds?: number;
  lastAutoAdvanceAtSeconds?: number;
}

export function getInitialAutoAdvanceAt(
  roundTime: unknown,
  startedAtMs: number,
): number | undefined {
  if (!validateTime(roundTime)) {
    return undefined;
  }
  return Math.floor(startedAtMs / 1000);
}

export function hasFirstTurnAutoSkipGraceElapsed(
  currentTurn: number,
  startedAtSeconds: number | undefined,
  nowMs: number,
): boolean {
  if (
    currentTurn !== 0 ||
    typeof startedAtSeconds !== "number" ||
    !Number.isFinite(startedAtSeconds)
  ) {
    return true;
  }
  return nowMs > startedAtSeconds * 1000 + FIRST_TURN_AUTO_SKIP_DELAY_MS;
}

export function getNextAutoAdvanceAtMs(
  schedule: AutoAdvanceSchedule,
  nowMs: number,
): number | undefined {
  if (!schedule.stateAutoSkip || schedule.matchAutoSkip === false) {
    return undefined;
  }
  const stateRoundTime = validateTime(schedule.stateRoundTime);
  if (!stateRoundTime) {
    return undefined;
  }
  const matchRoundTime = validateTime(schedule.matchRoundTime) ?? stateRoundTime;
  const [stateHours, stateMinutes] = stateRoundTime.split(":").map(Number);
  const [matchHours, matchMinutes] = matchRoundTime.split(":").map(Number);
  const targetMinutes = Math.max(
    stateHours * 60 + stateMinutes,
    matchHours * 60 + matchMinutes
  );

  const nextAdvanceAt = new Date(nowMs);
  nextAdvanceAt.setHours(
    Math.floor(targetMinutes / 60),
    targetMinutes % 60,
    0,
    0
  );
  if (hasAutoAdvancedToday(schedule.lastAutoAdvanceAtSeconds, nowMs)) {
    nextAdvanceAt.setDate(nextAdvanceAt.getDate() + 1);
  } else if (nextAdvanceAt.getTime() < nowMs) {
    nextAdvanceAt.setTime(nowMs);
  }

  let timestamp = nextAdvanceAt.getTime();
  if (
    schedule.currentTurn === 0 &&
    typeof schedule.startedAtSeconds === "number" &&
    Number.isFinite(schedule.startedAtSeconds)
  ) {
    timestamp = Math.max(
      timestamp,
      schedule.startedAtSeconds * 1000 + FIRST_TURN_AUTO_SKIP_DELAY_MS + 1
    );
  }
  return timestamp;
}

export function hasAutoAdvancedToday(
  lastAutoAdvanceAt: number | undefined,
  nowMs: number
): boolean {
  if (typeof lastAutoAdvanceAt !== "number" || !Number.isFinite(lastAutoAdvanceAt)) {
    return false;
  }
  const lastLocal = new Date(lastAutoAdvanceAt * 1000);
  const nowLocal = new Date(nowMs);
  return (
    lastLocal.getFullYear() === nowLocal.getFullYear() &&
    lastLocal.getMonth() === nowLocal.getMonth() &&
    lastLocal.getDate() === nowLocal.getDate()
  );
}
