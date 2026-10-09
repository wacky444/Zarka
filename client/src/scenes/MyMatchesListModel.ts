import {
  DEFAULT_MAX_CURRENT_MATCHES,
  normalizeMaxCurrentMatches,
  type MatchCardStatus,
  type MyMatchCardSummary
} from "@shared";
import { t } from "../services/i18n";

export type SectionId = "online" | "finished";

export interface SectionCollapseState {
  onlineCollapsed: boolean;
  finishedCollapsed: boolean;
}

export interface MyMatchesGroupResult {
  onlineMatches: MyMatchCardSummary[];
  finishedMatches: MyMatchCardSummary[];
  maxCurrentMatches: number;
}

export function sortMyActiveMatches(
  matches: MyMatchCardSummary[],
  nowMs: number = Date.now()
): MyMatchCardSummary[] {
  return [...matches].sort((left, right) => {
    const leftReady = left.currentUserReady ? 1 : 0;
    const rightReady = right.currentUserReady ? 1 : 0;
    if (leftReady !== rightReady) {
      return leftReady - rightReady;
    }

    const leftTimed =
      left.timeStatus === "scheduled" && left.nextAdvanceAtMs !== null;
    const rightTimed =
      right.timeStatus === "scheduled" && right.nextAdvanceAtMs !== null;

    if (leftTimed && rightTimed) {
      const leftRemaining = Math.max(0, (left.nextAdvanceAtMs ?? 0) - nowMs);
      const rightRemaining = Math.max(0, (right.nextAdvanceAtMs ?? 0) - nowMs);
      if (leftRemaining !== rightRemaining) {
        return leftRemaining - rightRemaining;
      }
    } else if (leftTimed !== rightTimed) {
      return leftTimed ? -1 : 1;
    }

    const nameCompare = (left.name ?? "").localeCompare(right.name ?? "");
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return left.match_id.localeCompare(right.match_id);
  });
}

export function sortMyFinishedMatches(
  matches: MyMatchCardSummary[]
): MyMatchCardSummary[] {
  return [...matches].sort((left, right) => {
    const leftTime = left.ended_at ?? left.created_at ?? 0;
    const rightTime = right.ended_at ?? right.created_at ?? 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    const nameCompare = (left.name ?? "").localeCompare(right.name ?? "");
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return left.match_id.localeCompare(right.match_id);
  });
}

export function groupMyMatches(
  matches: MyMatchCardSummary[],
  maxCurrentMatches?: unknown,
  nowMs: number = Date.now()
): MyMatchesGroupResult {
  const onlineRaw: MyMatchCardSummary[] = [];
  const finishedRaw: MyMatchCardSummary[] = [];

  for (const match of matches) {
    if (match.status === "finished") {
      finishedRaw.push(match);
    } else {
      onlineRaw.push(match);
    }
  }

  const onlineMatches = sortMyActiveMatches(onlineRaw, nowMs);
  const finishedMatches = sortMyFinishedMatches(finishedRaw).slice(0, 10);
  const normalizedMax = normalizeMaxCurrentMatches(maxCurrentMatches);

  return {
    onlineMatches,
    finishedMatches,
    maxCurrentMatches: normalizedMax > 0 ? normalizedMax : DEFAULT_MAX_CURRENT_MATCHES
  };
}

export function toggleSectionCollapse(
  state: SectionCollapseState,
  section: SectionId
): SectionCollapseState {
  return section === "online"
    ? { ...state, onlineCollapsed: !state.onlineCollapsed }
    : { ...state, finishedCollapsed: !state.finishedCollapsed };
}

export function formatOnlineHeading(count: number, max: number): string {
  return `${count}/${max} ${t("Online matches")}`;
}

export function formatFinishedHeading(count: number): string {
  return `${count} ${t("Finished matches")}`;
}

export function createSelectMatchHandler(
  match: MyMatchCardSummary,
  onSelect?: (
    matchId: string,
    status: MatchCardStatus,
    match: MyMatchCardSummary
  ) => void
): () => void {
  return () => {
    onSelect?.(match.match_id, match.status, match);
  };
}

export type MyMatchRouteTarget = "lobby" | "game" | "report";

export function resolveMyMatchRoute(
  status: MatchCardStatus
): MyMatchRouteTarget {
  if (status === "finished") {
    return "report";
  }
  if (status === "in_progress") {
    return "game";
  }
  return "lobby";
}

export async function dispatchMyMatchSelection(
  matchId: string,
  status: MatchCardStatus,
  handlers: {
    openLobby: (matchId: string) => void | Promise<void>;
    openGame: (matchId: string) => void | Promise<void>;
    openReport: (matchId: string) => void | Promise<void>;
  }
): Promise<MyMatchRouteTarget> {
  const target = resolveMyMatchRoute(status);
  switch (target) {
    case "report":
      await handlers.openReport(matchId);
      break;
    case "game":
      await handlers.openGame(matchId);
      break;
    case "lobby":
      await handlers.openLobby(matchId);
      break;
  }
  return target;
}

