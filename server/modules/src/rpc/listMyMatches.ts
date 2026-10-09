/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { SERVER_USER_ID } from "../constants";
import {
  normalizeMaxCurrentMatches,
  RANKED_MATCH_METADATA_KEY,
  TUTORIAL_MATCH_METADATA_KEY,
  type ListMyMatchesPayload
} from "@shared";
import { buildMyMatchCardSummary } from "../services/matchCardSummary";

type MatchListEntry = NonNullable<ListMyMatchesPayload["matches"]>[number];
type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

function getMaxCurrentMatches(nk: nkruntime.Nakama, userId: string): number {
  const user = nk.usersGetId([userId])?.[0] as
    | (nkruntime.User & { metadata?: unknown })
    | undefined;
  const metadata = asRecord(user?.metadata);
  const zarka = asRecord(metadata?.zarka);
  return normalizeMaxCurrentMatches(zarka?.maxCurrentMatches);
}

export function listMyMatchesRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string,
): string {
  if (!ctx || !ctx.userId) {
    throw makeNakamaError("No user context", nkruntime.Codes.INVALID_ARGUMENT);
  }

  const storage = new StorageService(createNakamaWrapper(nk));
  try {
    const activeMatches: MatchListEntry[] = [];
    const finishedMatches: MatchListEntry[] = [];
    const maxCurrentMatches = getMaxCurrentMatches(nk, ctx.userId);

    for (const { match } of storage.listAllMatches()) {
      if (match.metadata?.[TUTORIAL_MATCH_METADATA_KEY]) {
        continue;
      }
      const players = Array.isArray(match.players) ? match.players : [];
      if (players.indexOf(ctx.userId) === -1) {
        continue;
      }

      const isRanked = Boolean(match.metadata?.[RANKED_MATCH_METADATA_KEY]);
      const creator =
        isRanked && (!match.creator || match.creator === SERVER_USER_ID)
          ? "Ranked"
          : match.creator;

      const isActive = match.removed === 0 || match.removed === undefined;
      if (isActive) {
        activeMatches.push({
          ...buildMyMatchCardSummary(match, ctx.userId),
          creator,
          cols: match.cols,
          rows: match.rows,
          roundTime: match.roundTime,
          autoSkip: match.autoSkip,
          botPlayers: match.botPlayers,
          turnsToBeAt1Tile: match.turnsToBeAt1Tile,
          has_report: false
        });
        continue;
      }

      const report = storage.getMatchReport(match.match_id);
      if (!report) {
        finishedMatches.push({
          ...buildMyMatchCardSummary(match, ctx.userId),
          creator,
          cols: match.cols,
          rows: match.rows,
          started: false,
          turns: match.current_turn,
          duration_ms: 0,
          has_report: false
        });
        continue;
      }
      let player: import("@shared").MatchReportPlayer | undefined;
      for (const entry of report.players) {
        if (entry.player_id === ctx.userId) {
          player = entry;
          break;
        }
      }
      const playerTeamWon = Boolean(
        report.winning_team_id &&
          player?.team_id === report.winning_team_id,
      );
      finishedMatches.push({
        ...buildMyMatchCardSummary(match, ctx.userId),
        creator,
        cols: match.cols,
        rows: match.rows,
        name: report.name ?? match.name,
        current_turn: report.turns,
        currentTurn: report.turns,
        created_at: report.created_at,
        started: false,
        ended_at: report.ended_at,
        turns: report.turns,
        duration_ms: Math.max(
          0,
          (report.ended_at - report.created_at) * 1000,
        ),
        player_team_won: playerTeamWon,
        has_report: true
      });
    }

    activeMatches.sort(
      (a, b) => Number(b.created_at ?? 0) - Number(a.created_at ?? 0),
    );
    finishedMatches.sort(
      (a, b) => Number(b.ended_at ?? 0) - Number(a.ended_at ?? 0),
    );

    const response: import("@shared").ListMyMatchesPayload = {
      ok: true,
      maxCurrentMatches,
      matches: [...activeMatches, ...finishedMatches.slice(0, 10)],
    };
    return JSON.stringify(response);
  } catch (error) {
    logger.error(
      "Error in list_my_matches: %s",
      (error as Error).message || String(error),
    );
    const response: import("@shared").ListMyMatchesPayload = {
      ok: false,
      error: (error as Error).message || String(error),
    };
    return JSON.stringify(response);
  }
}
