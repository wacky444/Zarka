/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import type { ListMyMatchesPayload } from "@shared";

type MatchListEntry = NonNullable<ListMyMatchesPayload["matches"]>[number];

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

    for (const { match } of storage.listAllMatches()) {
      const players = Array.isArray(match.players) ? match.players : [];
      if (players.indexOf(ctx.userId) === -1) {
        continue;
      }

      const isActive = match.removed === 0 || match.removed === undefined;
      if (isActive) {
        const started = match.started === true;
        activeMatches.push({
          match_id: match.match_id,
          runtime_match_id: match.runtime_match_id ?? match.match_id,
          size: match.size,
          players,
          current_turn: match.current_turn,
          created_at: match.created_at,
          creator: match.creator,
          cols: match.cols,
          rows: match.rows,
          roundTime: match.roundTime,
          autoSkip: match.autoSkip,
          botPlayers: match.botPlayers,
          name: match.name,
          started,
          status: started ? "in_progress" : "waiting",
          has_report: false,
        });
        continue;
      }

      const report = storage.getMatchReport(match.match_id);
      if (!report) {
        finishedMatches.push({
          match_id: match.match_id,
          runtime_match_id: match.runtime_match_id ?? match.match_id,
          size: match.size,
          players,
          current_turn: match.current_turn,
          created_at: match.created_at,
          creator: match.creator,
          cols: match.cols,
          rows: match.rows,
          name: match.name,
          started: false,
          status: "finished",
          turns: match.current_turn,
          duration_ms: 0,
          has_report: false,
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
        match_id: report.match_id,
        runtime_match_id: match.runtime_match_id ?? match.match_id,
        size: match.size,
        players,
        current_turn: report.turns,
        created_at: report.created_at,
        creator: match.creator,
        cols: match.cols,
        rows: match.rows,
        name: report.name ?? match.name,
        started: false,
        status: "finished",
        ended_at: report.ended_at,
        turns: report.turns,
        duration_ms: Math.max(
          0,
          (report.ended_at - report.created_at) * 1000,
        ),
        player_team_won: playerTeamWon,
        has_report: true,
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
