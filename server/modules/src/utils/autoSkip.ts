import { validateTime } from "./validation";

const FIRST_TURN_AUTO_SKIP_DELAY_MS = 24 * 60 * 60 * 1000 + 1000;

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
