/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  TUTORIAL_MATCH_METADATA_KEY,
  type CreateTutorialMatchPayload
} from "@shared";
import { createTutorialMatch } from "../match/TutorialScenario";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";

export function createTutorialMatchRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  if (!ctx?.userId) {
    throw makeNakamaError("No user context", nkruntime.Codes.INVALID_ARGUMENT);
  }

  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);
  let existingMatch: ReturnType<StorageService["listAllMatches"]>[number] | undefined;
  for (const candidate of storage.listAllMatches()) {
    const match = candidate.match;
    if (
      match.metadata?.[TUTORIAL_MATCH_METADATA_KEY] &&
      match.creator === ctx.userId &&
      match.players.indexOf(ctx.userId) !== -1 &&
      match.started === true &&
      match.removed === 0
    ) {
      existingMatch = candidate;
      break;
    }
  }
  if (existingMatch) {
    const response: CreateTutorialMatchPayload = {
      ok: true,
      match_id: existingMatch.match.match_id,
      runtime_match_id:
        existingMatch.match.runtime_match_id ?? existingMatch.match.match_id
    };
    return JSON.stringify(response);
  }

  const matchId = nk.uuidv4();
  const match = createTutorialMatch({
    matchId,
    playerId: ctx.userId,
    createdAt: Math.floor(Date.now() / 1000)
  });
  let runtimeMatchId: string;
  try {
    runtimeMatchId = nkWrapper.matchCreate("async_turn", {
      game_id: matchId,
      creator: ctx.userId,
      name: match.name,
      size: String(match.size),
      cols: String(match.cols),
      rows: String(match.rows),
      roundTime: match.roundTime ?? "23:00",
      autoSkip: String(match.autoSkip === true),
      botPlayers: String(match.botPlayers ?? 1),
      turnsToBeAt1Tile: String(match.turnsToBeAt1Tile ?? 30),
      current_turn: String(match.current_turn ?? 0),
      started: String(match.started === true)
    });
  } catch (error) {
    logger.error(
      "create_tutorial_match runtime creation failed: %s",
      (error && (error as Error).message) || String(error)
    );
    throw makeNakamaError(
      "tutorial_match_create_failed",
      nkruntime.Codes.INTERNAL
    );
  }

  match.runtime_match_id = runtimeMatchId;
  try {
    storage.writeMatch(match);
  } catch (error) {
    logger.error(
      "create_tutorial_match storage write failed: %s",
      (error && (error as Error).message) || String(error)
    );
    throw makeNakamaError(
      "tutorial_match_store_failed",
      nkruntime.Codes.INTERNAL
    );
  }

  const response: CreateTutorialMatchPayload = {
    ok: true,
    match_id: matchId,
    runtime_match_id: runtimeMatchId
  };
  return JSON.stringify(response);
}
