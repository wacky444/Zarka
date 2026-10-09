import type {
  MatchCardSummary,
  MatchPreviewDestructionState
} from "@shared";

export const MATCH_PREVIEW_COLORS: Record<MatchPreviewDestructionState, number> = {
  safe: 0x4ade80,
  scheduled: 0xfacc15,
  destroyed: 0xef4444
};

const URGENT_TIME_THRESHOLD_MS = 3 * 60 * 60 * 1000;

export interface MatchCardPresentation {
  playerCount: string;
  timeLeft: string;
  urgentTimeLeft: boolean;
  showPlayOverlay: boolean;
}

export function getMatchTypeBadge(isRanked: boolean): "R" | "UR" {
  return isRanked ? "R" : "UR";
}

export function formatMatchTimeLeft(milliseconds: number): string {
  const totalMinutes = Math.floor(Math.max(0, milliseconds) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}`;
}

export function getMatchCardPresentation(
  match: MatchCardSummary,
  nowMs: number,
  options: { isMyMatch: boolean; currentUserReady?: boolean }
): MatchCardPresentation {
  const playerCount =
    match.status === "waiting"
      ? `${match.joinedPlayers}/${match.size}`
      : match.status === "in_progress"
        ? `${match.alivePlayers}/${match.totalPlayers}`
        : `${match.totalPlayers}`;
  const timeLeft =
    match.timeStatus === "finished"
      ? "—"
      : match.timeStatus === "manual"
        ? "Manual"
        : match.timeStatus === "not_started"
          ? "Waiting"
          : match.nextAdvanceAtMs === null
            ? "Manual"
            : formatMatchTimeLeft(match.nextAdvanceAtMs - nowMs);
  const active = match.status !== "finished";
  const notReady = options.currentUserReady === false;
  const nextAdvanceAtMs = match.nextAdvanceAtMs;
  const urgentTimeLeft =
    options.isMyMatch &&
    active &&
    notReady &&
    match.timeStatus === "scheduled" &&
    nextAdvanceAtMs !== null &&
    Math.max(0, nextAdvanceAtMs - nowMs) < URGENT_TIME_THRESHOLD_MS;

  return {
    playerCount,
    timeLeft,
    urgentTimeLeft,
    showPlayOverlay: options.isMyMatch && active && notReady
  };
}

export function createMatchCardClickHandler(
  match: MatchCardSummary,
  onSelect: (match: MatchCardSummary) => void
): () => void {
  return () => onSelect(match);
}
