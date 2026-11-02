/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  DEFAULT_REPLAY_VIEW_DISTANCE,
  type GetLogPayload,
  type GetReplayPayload,
  type ReplayEvent,
  type ReplaySnapshot,
} from "@shared";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { tailorReplayEvents } from "../match/replay/tailorReplay";
import {
  tailorC4sForViewer,
  tailorMapForCharacter,
  tailorMatchItemsForCharacter,
  tailorPlayerCharactersForViewer,
  tailorTrapsForViewer,
} from "../utils/matchView";
import { isAdminUser } from "../utils/admin";

function tailorReplaySnapshot(
  snapshot: ReplaySnapshot,
  viewerId: string,
  viewAll: boolean,
  turn: number,
  sourceCharacters: import("@shared").MatchRecord["playerCharacters"]
): ReplaySnapshot {
  if (viewAll) {
    return snapshot;
  }
  const viewerCharacter = sourceCharacters?.[viewerId] ?? null;
  return {
    ...snapshot,
    map: tailorMapForCharacter(snapshot.map, viewerCharacter),
    items: tailorMatchItemsForCharacter(snapshot.items, viewerCharacter),
    traps: tailorTrapsForViewer(snapshot.traps, viewerId),
    c4s: tailorC4sForViewer(
      snapshot.c4s,
      viewerId,
      false,
      viewerCharacter?.discoveredC4Ids
    ),
    playerCharacters: tailorPlayerCharactersForViewer(
      snapshot.playerCharacters,
      viewerId,
      false,
      turn
    ),
  };
}

export function getReplayRpc(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx || !ctx.userId) {
    throw makeNakamaError("No user context", nkruntime.Codes.INVALID_ARGUMENT);
  }

  if (!payload) {
    throw makeNakamaError("Missing payload", nkruntime.Codes.INVALID_ARGUMENT);
  }

  let json: any;
  try {
    json = JSON.parse(payload);
  } catch {
    throw makeNakamaError("bad_json", nkruntime.Codes.INVALID_ARGUMENT);
  }

  const matchId: string = json.match_id;
  if (!matchId) {
    throw makeNakamaError(
      "match_id required",
      nkruntime.Codes.INVALID_ARGUMENT
    );
  }

  const requestedTurn =
    typeof json.turn === "number" && isFinite(json.turn)
      ? Math.floor(json.turn)
      : null;

  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);
  const matchRead = storage.getMatch(matchId);

  if (!matchRead) {
    throw makeNakamaError("not_found", nkruntime.Codes.NOT_FOUND);
  }

  const match = matchRead.match;
  const players = Array.isArray(match.players) ? match.players : [];
  const isAdmin = isAdminUser(nk, ctx.userId);
  if (players.indexOf(ctx.userId) === -1 && !isAdmin) {
    throw makeNakamaError("not_in_match", nkruntime.Codes.PERMISSION_DENIED);
  }
  const fullReplayRequested = json.full_replay === true;
  const requestedCharacter =
    typeof json.character === "string" ? json.character.trim() : undefined;
  const hasMatchReport = storage.getMatchReport(matchId) !== null;
  const isAuthorized = isAdmin || hasMatchReport;

  const maxTurn =
    typeof match.current_turn === "number" ? match.current_turn : 0;
  let turn = requestedTurn !== null ? requestedTurn : maxTurn;
  if (turn > maxTurn) {
    turn = maxTurn;
  }
  if (turn < 0) {
    turn = 0;
  }

  let viewAll = false;
  let targetViewerId = ctx.userId;

  if (isAuthorized) {
    if (requestedCharacter && requestedCharacter.toLowerCase() === "all") {
      viewAll = true;
    } else if (requestedCharacter) {
      targetViewerId = requestedCharacter;
      viewAll = false;
    } else {
      viewAll = (json.view_all === true && isAdmin) || hasMatchReport;
    }
  } else {
    targetViewerId = ctx.userId;
    viewAll = false;
  }

  let events: ReplayEvent[] = [];
  let snapshot: ReplaySnapshot | undefined;
  let preTurnSnapshot: ReplaySnapshot | undefined;
  if (turn >= 0) {
    const replay = storage.readReplay(matchId, turn);
    if (replay) {
      const sourceCharacters =
        replay.snapshot?.playerCharacters ?? match.playerCharacters;
      events = Array.isArray(replay.events)
        ? tailorReplayEvents(
            replay.events,
            targetViewerId,
            sourceCharacters,
            DEFAULT_REPLAY_VIEW_DISTANCE,
            viewAll,
          )
        : [];
      if (replay.snapshot) {
        snapshot = tailorReplaySnapshot(
          replay.snapshot,
          targetViewerId,
          viewAll,
          turn,
          sourceCharacters
        );
        preTurnSnapshot =
          turn === 0
            ? snapshot
            : undefined;
      }
    }
    if (turn > 0) {
      const previousReplay = storage.readReplay(matchId, turn - 1);
      if (previousReplay?.snapshot) {
        const previousCharacters =
          previousReplay.snapshot.playerCharacters ?? match.playerCharacters;
        preTurnSnapshot = tailorReplaySnapshot(
          previousReplay.snapshot,
          targetViewerId,
          viewAll,
          turn - 1,
          previousCharacters
        );
      }
    }
  }

  const response: GetLogPayload = {
    ok: true,
    match_id: matchId,
    turn,
    max_turn: maxTurn,
    ...(requestedCharacter !== undefined
      ? { character: isAuthorized ? requestedCharacter : ctx.userId }
      : {}),
    events,
    snapshot,
    preTurnSnapshot,
  };

  return JSON.stringify(response);
}
