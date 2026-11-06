/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchReport } from "@shared";
import type { MatchRecord } from "../models/types";
import { StorageService } from "../services/storageService";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { getRuntimeMatchId } from "../utils/matchIds";
import {
  finalizeMatchWithOutcome,
  emitMatchEndedSignal,
  type EndGameOutcome,
} from "./checkEndGame";

export function terminalizeMatchForInactivity(
  match: MatchRecord,
  storage: StorageService,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  expectedVersion?: string,
  nowSeconds?: number,
): MatchReport | null {
  const existingReport = storage.getMatchReport(match.match_id);
  if (existingReport) {
    if (match.removed !== 1 || match.started !== false) {
      match.removed = 1;
      match.started = false;
      storage.writeMatch(match, expectedVersion);
    }
    return existingReport;
  }

  if (
    match.started !== true ||
    (match.removed !== 0 && match.removed !== undefined)
  ) {
    return null;
  }

  const outcome: EndGameOutcome = {
    ended: true,
    reason: "inactivity_timeout",
    aliveCharacterIds: [],
  };

  const nowMs =
    typeof nowSeconds === "number" ? nowSeconds * 1000 : Date.now();

  finalizeMatchWithOutcome(
    match,
    outcome,
    nk,
    logger,
    [],
    match.current_turn ?? 0,
    nowMs,
  );

  storage.writeMatch(match, expectedVersion);

  const nkWrapper = createNakamaWrapper(nk);
  emitMatchEndedSignal(nkWrapper, match, outcome);

  try {
    nkWrapper.matchSignal(
      getRuntimeMatchId(match),
      JSON.stringify({ type: "match_removed" }),
    );
  } catch (error) {
    logger.warn?.(
      "terminalizeMatchForInactivity match_removed signal failed for match %s: %s",
      match.match_id,
      (error && (error as Error).message) || String(error),
    );
  }

  return storage.getMatchReport(match.match_id);
}
