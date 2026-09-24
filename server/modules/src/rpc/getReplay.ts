/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  DEFAULT_REPLAY_VIEW_DISTANCE,
  type GetReplayPayload,
  type ReplayEvent,
  type ReplaySnapshot,
} from "@shared";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { tailorReplayEvents } from "../match/replay/tailorReplay";
import {
  tailorMapForCharacter,
  tailorMatchItemsForCharacter,
  tailorPlayerCharactersForViewer,
} from "../utils/matchView";
import { isAdminUser } from "../utils/admin";

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
  if (players.indexOf(ctx.userId) === -1) {
    throw makeNakamaError("not_in_match", nkruntime.Codes.PERMISSION_DENIED);
  }

  const maxTurn =
    typeof match.current_turn === "number" ? match.current_turn : 0;
  let turn = requestedTurn !== null ? requestedTurn : maxTurn;
  if (turn > maxTurn) {
    turn = maxTurn;
  }
  if (turn < 0) {
    turn = 0;
  }

  const viewAll = json.view_all === true && isAdminUser(nk, ctx.userId);
  let events: ReplayEvent[] = [];
  let snapshot: ReplaySnapshot | undefined;
  if (turn >= 0) {
    const replay = storage.readReplay(matchId, turn);
    if (replay) {
      const sourceCharacters =
        replay.snapshot?.playerCharacters ?? match.playerCharacters;
      events = Array.isArray(replay.events)
        ? tailorReplayEvents(
            replay.events,
            ctx.userId,
            sourceCharacters,
            DEFAULT_REPLAY_VIEW_DISTANCE,
            viewAll,
          )
        : [];
      if (replay.snapshot) {
        if (viewAll) {
          snapshot = replay.snapshot;
        } else {
          const viewerCharacter = sourceCharacters?.[ctx.userId] ?? null;
          snapshot = {
            ...replay.snapshot,
            map: tailorMapForCharacter(replay.snapshot.map, viewerCharacter),
            items: tailorMatchItemsForCharacter(
              replay.snapshot.items,
              viewerCharacter,
            ),
            playerCharacters: tailorPlayerCharactersForViewer(
              replay.snapshot.playerCharacters,
              ctx.userId,
              false,
              turn,
            ),
          };
        }
      }
    }
  }

  const response: GetReplayPayload = {
    ok: true,
    match_id: matchId,
    turn,
    max_turn: maxTurn,
    events,
    snapshot,
  };

  return JSON.stringify(response);
}
