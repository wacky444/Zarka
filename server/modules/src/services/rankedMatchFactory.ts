/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  CellLibrary,
  generateGameMap,
  RANKED_MATCH_METADATA_KEY,
  type RankedMatchMetadata,
  type RankedQueueMode
} from "@shared";
import { DEFAULT_MATCH_NAME, SERVER_USER_ID } from "../constants";
import { startMatchRecord } from "../match/startMatchRecord";
import type { MatchRecord } from "../models/types";
import { createNakamaWrapper } from "./nakamaWrapper";
import { StorageService } from "./storageService";
import { getRankedMapDimensions, RANKED_MATCH_TOTAL_SEATS } from "../matchmaking/policy";
import { createReplaySnapshot } from "../match/replay/snapshot";
import { createDefaultCharacter, ensureAllPlayerCharacters } from "../utils/playerCharacter";
import { getRuntimeMatchId } from "../utils/matchIds";
import { isRankedPresenceUserId } from "./rankedPresence";
import { hasTutorialCompleted } from "../utils/tutorialProfile";
import {
  createRankedMatchStartedOutbox,
  dispatchRankedMatchStartedOutbox
} from "./turnPushNotifications";

export type RankedMatchCreationRequest = {
  assignmentId: string;
  humanIds: string[];
  botCount: number;
  queueMode: RankedQueueMode;
};

function findExistingRuntimeMatchId(
  nk: nkruntime.Nakama,
  gameId: string
): string | undefined {
  for (const runtimeMatch of nk.matchList(1000, true, "", 0, 500, "")) {
    try {
      const label = JSON.parse(runtimeMatch.label) as { game_id?: unknown };
      if (label.game_id === gameId) {
        return runtimeMatch.matchId;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function readRatingSnapshots(
  nk: nkruntime.Nakama,
  humanIds: string[]
): Record<string, number> {
  const snapshots: Record<string, number> = {};
  const users = nk.usersGetId(humanIds) ?? [];
  for (const user of users) {
    const userRecord = user as unknown as {
      id?: string;
      userId?: string;
      metadata?: unknown;
    };
    const userId = userRecord.id ?? userRecord.userId;
    if (!userId || humanIds.indexOf(userId) === -1) {
      continue;
    }
    const metadata = userRecord.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      snapshots[userId] = 1000;
      continue;
    }
    const zarka = (metadata as Record<string, unknown>).zarka;
    if (!zarka || typeof zarka !== "object" || Array.isArray(zarka)) {
      snapshots[userId] = 1000;
      continue;
    }
    const stats = (zarka as Record<string, unknown>).stats;
    const elo =
      stats && typeof stats === "object" && !Array.isArray(stats)
        ? (stats as Record<string, unknown>).elo
        : undefined;
    snapshots[userId] =
      typeof elo === "number" && Number.isInteger(elo) && elo >= 0
        ? elo
        : 1000;
  }
  for (const userId of humanIds) {
    if (snapshots[userId] === undefined) {
      snapshots[userId] = 1000;
    }
  }
  return snapshots;
}

function validateRequest(request: RankedMatchCreationRequest): number {
  if (!request.assignmentId || request.assignmentId.trim().length === 0) {
    throw new Error("ranked_assignment_id_required");
  }
  if (!Array.isArray(request.humanIds) || request.humanIds.length === 0) {
    throw new Error("ranked_humans_required");
  }
  if (new Set(request.humanIds).size !== request.humanIds.length) {
    throw new Error("ranked_duplicate_human");
  }
  for (const userId of request.humanIds) {
    if (!isRankedPresenceUserId(userId)) {
      throw new Error("ranked_invalid_human");
    }
  }
  if (!Number.isInteger(request.botCount) || request.botCount < 0) {
    throw new Error("ranked_invalid_bot_count");
  }
  const totalRoster = request.humanIds.length + request.botCount;
  if (totalRoster < 8 || totalRoster > RANKED_MATCH_TOTAL_SEATS) {
    throw new Error("ranked_invalid_roster_size");
  }
  if (
    request.queueMode === "low_population" &&
    (request.humanIds.length < 2 ||
      request.humanIds.length >= RANKED_MATCH_TOTAL_SEATS ||
      request.botCount !== RANKED_MATCH_TOTAL_SEATS - request.humanIds.length)
  ) {
    throw new Error("ranked_invalid_low_population_roster");
  }
  if (
    request.queueMode === "high_population" &&
    (request.humanIds.length < 8 || request.botCount !== 0)
  ) {
    throw new Error("ranked_invalid_high_population_roster");
  }
  return totalRoster;
}

export function createRankedMatch(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  request: RankedMatchCreationRequest,
  nowMs = Date.now(),
  ctx?: nkruntime.Context
): MatchRecord {
  const totalRoster = validateRequest(request);
  for (const userId of request.humanIds) {
    if (!hasTutorialCompleted(nk, userId, logger)) {
      throw new Error("ranked_human_ineligible");
    }
  }

  const matchId = `ranked_${request.assignmentId}`;
  const storage = new StorageService(createNakamaWrapper(nk));
  const existing = storage.getMatch(matchId);
  if (existing) {
    const ranked = existing.match.metadata?.[RANKED_MATCH_METADATA_KEY];
    if (ranked?.assignmentId === request.assignmentId) {
      return existing.match;
    }
    throw new Error("ranked_match_id_conflict");
  }

  const dimensions = getRankedMapDimensions(totalRoster);
  const generated = generateGameMap(
    dimensions.cols,
    dimensions.rows,
    CellLibrary,
    undefined,
    30
  );
  const runtimeMatchId = findExistingRuntimeMatchId(nk, matchId) ??
    nk.matchCreate("async_turn", {
    game_id: matchId,
    ranked: "true",
    size: String(totalRoster),
    players: JSON.stringify(request.humanIds),
    creator: SERVER_USER_ID,
    name: DEFAULT_MATCH_NAME,
    cols: String(dimensions.cols),
    rows: String(dimensions.rows),
    roundTime: "23:00",
    autoSkip: "true",
    botPlayers: String(request.botCount),
    turnsToBeAt1Tile: "30",
    started: "true"
  });

  const playerCharacters = Object.fromEntries(
    request.humanIds.map((userId) => [userId, createDefaultCharacter(userId)])
  );
  const initialReadyStates = Object.fromEntries(
    request.humanIds.map((userId) => [userId, false])
  );
  const metadata: RankedMatchMetadata = {
    assignmentId: request.assignmentId,
    humanCount: request.humanIds.length,
    botCount: request.botCount,
    queueMode: request.queueMode,
    eloSnapshots: readRatingSnapshots(nk, request.humanIds)
  };
  const match: MatchRecord = {
    match_id: matchId,
    runtime_match_id: runtimeMatchId,
    players: [...request.humanIds],
    playerCharacters,
    playerList: {},
    readyStates: initialReadyStates,
    size: totalRoster,
    cols: generated.map.cols,
    rows: generated.map.rows,
    roundTime: "23:00",
    autoSkip: true,
    botPlayers: request.botCount,
    turnsToBeAt1Tile: 30,
    created_at: Math.floor(nowMs / 1000),
    current_turn: 0,
    creator: SERVER_USER_ID,
    name: DEFAULT_MATCH_NAME,
    started: false,
    removed: 0,
    map: generated.map,
    items: generated.items,
    safeContainers: generated.safeContainers,
    metadata: { [RANKED_MATCH_METADATA_KEY]: metadata }
  };
  ensureAllPlayerCharacters(match);
  const readyStates = match.readyStates ?? {};
  match.readyStates = readyStates;
  for (const playerId of Object.keys(match.playerCharacters)) {
    match.playerList[playerId] = {
      id: playerId,
      name: match.playerCharacters[playerId].name
    };
    if (readyStates[playerId] === undefined) {
      readyStates[playerId] = false;
    }
  }

  const turn0Events = startMatchRecord(match, logger, nowMs);
  const replayTurn0 = {
    match_id: matchId,
    turn: 0,
    events: turn0Events,
    snapshot: createReplaySnapshot(match),
    created_at: Math.floor(nowMs / 1000)
  };
  const startOutbox = ctx
    ? createRankedMatchStartedOutbox(match, ctx, nk, logger)
    : null;
  if (startOutbox) {
    storage.writeMatchWithReplayTurn0AndPushOutbox(
      match,
      replayTurn0,
      startOutbox
    );
  } else {
    storage.writeMatchWithReplayTurn0(match, replayTurn0);
  }
  logger.info(
    "ranked_match_created %s",
    JSON.stringify({
      event: "ranked_match_created",
      assignment_id: request.assignmentId,
      match_id: match.match_id,
      population_mode: request.queueMode,
      human_count: request.humanIds.length,
      bot_count: request.botCount,
      roster_size: totalRoster
    })
  );
  if (startOutbox && ctx) {
    dispatchRankedMatchStartedOutbox(match.match_id, ctx, nk, logger);
  }
  try {
    nk.matchSignal(
      getRuntimeMatchId(match),
      JSON.stringify({ type: "start_match" })
    );
  } catch (error) {
    logger.warn(
      "ranked match start signal failed for %s: %s",
      matchId,
      (error && (error as Error).message) || String(error)
    );
  }
  return match;
}
