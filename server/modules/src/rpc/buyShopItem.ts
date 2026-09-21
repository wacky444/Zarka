/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  ShopLibrary,
  type BuyShopItemPayload,
  type ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../models/types";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { isCharacterDead } from "../utils/playerCharacter";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function effectiveTeamId(character: {
  secretTeamId?: string;
  teamId?: string;
}): string | null {
  const teamId = character.secretTeamId?.trim() || character.teamId?.trim();
  return teamId && teamId.length > 0 ? teamId : null;
}

export function buyShopItemRpc(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  if (!ctx || !ctx.userId) {
    throw makeNakamaError("No user context", nkruntime.Codes.INVALID_ARGUMENT);
  }
  if (!payload) {
    throw makeNakamaError("Missing payload", nkruntime.Codes.INVALID_ARGUMENT);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    throw makeNakamaError("bad_json", nkruntime.Codes.INVALID_ARGUMENT);
  }
  if (!isRecord(parsed)) {
    throw makeNakamaError("bad_payload", nkruntime.Codes.INVALID_ARGUMENT);
  }

  const matchId =
    typeof parsed.match_id === "string" ? parsed.match_id.trim() : "";
  const shopId =
    typeof parsed.shop_id === "string" ? parsed.shop_id.trim() : "";
  const targetPlayerId =
    typeof parsed.target_player_id === "string"
      ? parsed.target_player_id.trim()
      : "";
  if (!matchId || !shopId) {
    throw makeNakamaError(
      "match_id and shop_id required",
      nkruntime.Codes.INVALID_ARGUMENT,
    );
  }
  if (shopId !== "detective" || !ShopLibrary.detective.implemented) {
    throw makeNakamaError(
      "shop_item_not_implemented",
      nkruntime.Codes.FAILED_PRECONDITION,
    );
  }
  if (!targetPlayerId) {
    throw makeNakamaError(
      "target_player_id required",
      nkruntime.Codes.INVALID_ARGUMENT,
    );
  }
  if (targetPlayerId === ctx.userId) {
    throw makeNakamaError(
      "invalid_detective_target",
      nkruntime.Codes.INVALID_ARGUMENT,
    );
  }

  const storage = new StorageService(createNakamaWrapper(nk));
  const read = storage.getMatch(matchId);
  if (!read) {
    throw makeNakamaError("not_found", nkruntime.Codes.NOT_FOUND);
  }
  const match: MatchRecord = read.match;
  if (
    !Array.isArray(match.players) ||
    match.players.indexOf(ctx.userId) === -1
  ) {
    throw makeNakamaError("not_in_match", nkruntime.Codes.PERMISSION_DENIED);
  }
  if (match.started !== true || match.removed !== 0) {
    throw makeNakamaError(
      "match_not_active",
      nkruntime.Codes.FAILED_PRECONDITION,
    );
  }

  const actor = match.playerCharacters?.[ctx.userId];
  const target = match.playerCharacters?.[targetPlayerId];
  if (!actor || !target) {
    throw makeNakamaError("character_not_found", nkruntime.Codes.NOT_FOUND);
  }
  if (isCharacterDead(actor) || isCharacterDead(target)) {
    throw makeNakamaError(
      "invalid_detective_target",
      nkruntime.Codes.FAILED_PRECONDITION,
    );
  }

  const cost = ShopLibrary.detective.cost;
  if (!actor.economy) {
    actor.economy = { zarkans: 0, pendingZarkans: 0, incomeInterval: 1 };
  }
  const balance =
    typeof actor.economy.zarkans === "number" &&
    isFinite(actor.economy.zarkans)
      ? Math.max(0, Math.floor(actor.economy.zarkans))
      : 0;
  if (balance < cost) {
    throw makeNakamaError(
      "insufficient_zarkans",
      nkruntime.Codes.FAILED_PRECONDITION,
    );
  }

  const actorTeamId = effectiveTeamId(actor);
  const targetTeamId = effectiveTeamId(target);
  if (!targetTeamId) {
    throw makeNakamaError(
      "target_team_not_available",
      nkruntime.Codes.FAILED_PRECONDITION,
    );
  }

  actor.economy.zarkans = balance - cost;
  actor.revealedTeamIdsByPlayerId = {
    ...(actor.revealedTeamIdsByPlayerId ?? {}),
    [targetPlayerId]: targetTeamId,
  };

  const opposingTeam = actorTeamId !== null && actorTeamId !== targetTeamId;
  const reward = opposingTeam ? 10 : 0;
  if (reward > 0) {
    target.economy = target.economy ?? {
      zarkans: 0,
      pendingZarkans: 0,
      incomeInterval: 1,
    };
    target.economy.pendingZarkans =
      (isFinite(target.economy.pendingZarkans)
        ? target.economy.pendingZarkans
        : 0) + reward;
  }

  const event: ReplayPlayerEvent = {
    kind: "player",
    actorId: ctx.userId,
    action: {
      actionId: "buy_detective",
      metadata: {
        shopId,
        cost,
        targetPlayerId,
        targetTeamId,
        opposingTeam,
        reward,
      },
    },
    targets: [
      {
        targetId: targetPlayerId,
        metadata: {
          teamId: targetTeamId,
          reward,
        },
      },
    ],
    visibility: { scope: "limited", playerIds: [ctx.userId] },
  };

  storage.writeMatch(match, read.version);
  const turn = Math.max(0, Math.floor(match.current_turn ?? 0));
  const existingReplay = storage.readReplay(matchId, turn);
  storage.appendReplayTurn({
    match_id: matchId,
    turn,
    events: [...(existingReplay?.events ?? []), event],
    ...(existingReplay?.snapshot ? { snapshot: existingReplay.snapshot } : {}),
    created_at: existingReplay?.created_at ?? Math.floor(Date.now() / 1000),
  });

  const response: BuyShopItemPayload = {
    ok: true,
    match_id: matchId,
    user_id: ctx.userId,
    shop_id: "detective",
    target_player_id: targetPlayerId,
    target_team_id: targetTeamId,
    character: actor,
    event,
  };
  return JSON.stringify(response);
}
