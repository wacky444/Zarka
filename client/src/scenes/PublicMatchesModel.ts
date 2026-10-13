import type { MatchCardSummary } from "@shared";

export const PUBLIC_MATCH_PAGE_SIZE = 20;
export const PUBLIC_MATCH_MAX_PAGES = 10;
export const PUBLIC_MATCH_REFRESH_COOLDOWN_MS = 2_000;
export const PUBLIC_MATCH_PULL_REFRESH_THRESHOLD_PX = 72;

export function canStartPublicMatchRefresh(
  lastStartedAtMs: number,
  nowMs: number
): boolean {
  return nowMs - lastStartedAtMs >= PUBLIC_MATCH_REFRESH_COOLDOWN_MS;
}

export function isPullDownRefreshGesture(startY: number, endY: number): boolean {
  return endY - startY >= PUBLIC_MATCH_PULL_REFRESH_THRESHOLD_PX;
}

export function sortPublicMatches(matches: MatchCardSummary[]): MatchCardSummary[] {
  return [...matches].sort((left, right) => {
    const leftOpen = left.status === "waiting" ? 0 : 1;
    const rightOpen = right.status === "waiting" ? 0 : 1;
    if (leftOpen !== rightOpen) return leftOpen - rightOpen;
    const leftTimed = left.timeStatus === "scheduled" && left.nextAdvanceAtMs !== null;
    const rightTimed = right.timeStatus === "scheduled" && right.nextAdvanceAtMs !== null;
    if (leftTimed && rightTimed && left.nextAdvanceAtMs !== right.nextAdvanceAtMs) {
      return (left.nextAdvanceAtMs ?? 0) - (right.nextAdvanceAtMs ?? 0);
    }
    if (leftTimed !== rightTimed) return leftTimed ? -1 : 1;
    return (left.name ?? "").localeCompare(right.name ?? "") || left.match_id.localeCompare(right.match_id);
  });
}

export function appendUniquePublicMatches(
  current: MatchCardSummary[],
  page: MatchCardSummary[]
): MatchCardSummary[] {
  const known = new Set(current.map((match) => match.match_id));
  return [...current, ...page.filter((match) => !known.has(match.match_id))];
}

export function createPublicMatchSelection(
  match: MatchCardSummary,
  onSelect: (match: MatchCardSummary, joinable: boolean) => void
): () => void {
  return () => onSelect(match, match.isJoinable);
}

export type PublicMatchOpenResult = "opened" | "unavailable" | "rejected";

export async function openPublicMatchSelection(
  match: MatchCardSummary,
  isMember: boolean,
  joinAndOpen: () => Promise<boolean>
): Promise<PublicMatchOpenResult> {
  if (!match.isJoinable && !isMember) return "unavailable";
  try {
    return await joinAndOpen() ? "opened" : "rejected";
  } catch {
    return "rejected";
  }
}
