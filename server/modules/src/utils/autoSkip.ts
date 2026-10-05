import { validateTime } from "./validation";

export function getInitialAutoAdvanceAt(
  roundTime: unknown,
  startedAtMs: number,
): number | undefined {
  const validRoundTime = validateTime(roundTime);
  if (!validRoundTime) {
    return undefined;
  }
  const [hoursText, minutesText] = validRoundTime.split(":");
  const targetMinutes = Number(hoursText) * 60 + Number(minutesText);
  const startedAt = new Date(startedAtMs);
  const startMinutes = startedAt.getHours() * 60 + startedAt.getMinutes();
  return startMinutes >= targetMinutes
    ? Math.floor(startedAtMs / 1000)
    : undefined;
}
