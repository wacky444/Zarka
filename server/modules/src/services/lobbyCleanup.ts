/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../models/types";
import type { StorageService } from "./storageService";
import type { NakamaWrapper } from "./nakamaWrapper";
import { getRuntimeMatchId } from "../utils/matchIds";

export function deleteUnstartedLobbyAndArtifacts(
  match: MatchRecord,
  version: string | undefined,
  storage: StorageService,
  nkWrapper: NakamaWrapper,
  logger: nkruntime.Logger
): void {
  match.removed = 1;
  match.started = false;
  storage.writeMatch(match, version);

  try {
    nkWrapper.matchSignal(
      getRuntimeMatchId(match),
      JSON.stringify({ type: "match_removed" })
    );
  } catch (signalError) {
    logger.debug?.(
      "deleteUnstartedLobbyAndArtifacts match_removed signal failed for %s: %s",
      match.match_id,
      (signalError && (signalError as Error).message) || String(signalError)
    );
  }

  const matchId = match.match_id;

  try {
    for (const turn of storage.listTurnsForMatch(matchId)) {
      storage.deleteTurnByKey(turn.key);
    }
  } catch (err) {
    logger.warn?.(
      "deleteUnstartedLobbyAndArtifacts failed deleting turns for %s: %s",
      matchId,
      (err && (err as Error).message) || String(err)
    );
  }

  try {
    for (const replay of storage.listReplaysForMatch(matchId)) {
      storage.deleteReplayByKey(replay.key);
    }
  } catch (err) {
    logger.warn?.(
      "deleteUnstartedLobbyAndArtifacts failed deleting replays for %s: %s",
      matchId,
      (err && (err as Error).message) || String(err)
    );
  }

  try {
    storage.deleteChatLog(matchId);
  } catch (err) {
    logger.warn?.(
      "deleteUnstartedLobbyAndArtifacts failed deleting chat log for %s: %s",
      matchId,
      (err && (err as Error).message) || String(err)
    );
  }

  try {
    storage.deleteMatchReport(matchId);
  } catch (err) {
    logger.warn?.(
      "deleteUnstartedLobbyAndArtifacts failed deleting match report for %s: %s",
      matchId,
      (err && (err as Error).message) || String(err)
    );
  }

  try {
    storage.deleteMatch(matchId);
  } catch (err) {
    logger.warn?.(
      "deleteUnstartedLobbyAndArtifacts failed deleting match record for %s: %s",
      matchId,
      (err && (err as Error).message) || String(err)
    );
  }
}
