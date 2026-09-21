/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  ShopLibrary,
  LocalizationType,
  type Axial,
  type BuyShopItemPayload,
  type ReplayPlayerEvent,
  type ShopId,
} from "@shared";
import type { MatchRecord } from "../models/types";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { applyHealthDelta } from "../match/actions/utils";
import { isCharacterDead } from "../utils/playerCharacter";
import { tailorPlayerCharactersForViewer } from "../utils/matchView";

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

function parseAxial(value: unknown): Axial | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.q !== "number" ||
    !isFinite(value.q) ||
    typeof value.r !== "number" ||
    !isFinite(value.r)
  ) {
    return null;
  }
  return { q: value.q, r: value.r };
}

function isSameCoord(a: Axial | undefined, b: Axial | undefined): boolean {
  return !!a && !!b && a.q === b.q && a.r === b.r;
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
  const targetLocation = parseAxial(parsed.target_location);
  if (!matchId || !shopId) {
    throw makeNakamaError(
      "match_id and shop_id required",
      nkruntime.Codes.INVALID_ARGUMENT,
    );
  }
  const supportedShopIds: ShopId[] = [
    "detective",
    "security_camera_app",
    "spy_drone",
    "pyromaniac",
    "bomber",
  ];
  if (supportedShopIds.indexOf(shopId as ShopId) === -1) {
    throw makeNakamaError(
      "shop_item_not_implemented",
      nkruntime.Codes.FAILED_PRECONDITION,
    );
  }
  const resolvedShopId = shopId as ShopId;
  const definition = ShopLibrary[resolvedShopId];
  if (!definition?.implemented) {
    throw makeNakamaError(
      "shop_item_not_implemented",
      nkruntime.Codes.FAILED_PRECONDITION,
    );
  }
  if (resolvedShopId === "detective") {
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
  }
  if (
    (resolvedShopId === "spy_drone" ||
      resolvedShopId === "pyromaniac" ||
      resolvedShopId === "bomber") &&
    !targetLocation
  ) {
    throw makeNakamaError(
      "target_location required",
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

  let actor = match.playerCharacters?.[ctx.userId];
  if (!actor) {
    throw makeNakamaError("character_not_found", nkruntime.Codes.NOT_FOUND);
  }
  if (isCharacterDead(actor)) {
    throw makeNakamaError(
      "character_dead",
      nkruntime.Codes.FAILED_PRECONDITION,
    );
  }

  const target = targetPlayerId
    ? match.playerCharacters?.[targetPlayerId]
    : undefined;
  if (resolvedShopId === "detective") {
    if (!target || isCharacterDead(target)) {
      throw makeNakamaError(
        "invalid_detective_target",
        nkruntime.Codes.FAILED_PRECONDITION,
      );
    }
  }

  if (!actor.economy) {
    actor.economy = { zarkans: 0, pendingZarkans: 0, incomeInterval: 1 };
  }
  const balance =
    typeof actor.economy.zarkans === "number" &&
    isFinite(actor.economy.zarkans)
      ? Math.max(0, Math.floor(actor.economy.zarkans))
      : 0;
  const cost = definition.cost;
  if (balance < cost) {
    throw makeNakamaError(
      "insufficient_zarkans",
      nkruntime.Codes.FAILED_PRECONDITION,
    );
  }

  actor.economy.zarkans = balance - cost;
  const characters = match.playerCharacters ?? {};
  let observedPlayerIds: string[] = [];
  const targetDamages: Record<string, number> = {};
  const postPurchaseEvents: ReplayPlayerEvent[] = [];
  let targetTeamId: string | undefined;
  let reward = 0;
  let opposingTeam = false;
  let metadata: Record<string, unknown> = { shopId, cost };

  if (resolvedShopId === "detective" && target && targetPlayerId) {
    const actorTeamId = effectiveTeamId(actor);
    targetTeamId = effectiveTeamId(target) ?? undefined;
    if (!targetTeamId) {
      throw makeNakamaError(
        "target_team_not_available",
        nkruntime.Codes.FAILED_PRECONDITION,
      );
    }
    actor.revealedTeamIdsByPlayerId = {
      ...(actor.revealedTeamIdsByPlayerId ?? {}),
      [targetPlayerId]: targetTeamId,
    };
    opposingTeam = actorTeamId !== null && actorTeamId !== targetTeamId;
    reward = opposingTeam ? 10 : 0;
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
    metadata = {
      ...metadata,
      targetPlayerId,
      targetTeamId,
      opposingTeam,
      reward,
    };
    observedPlayerIds = [targetPlayerId];
  } else if (resolvedShopId === "security_camera_app") {
    const securityTileIds: Record<string, true> = {};
    for (const tile of match.map?.tiles ?? []) {
      if (tile.localizationType === LocalizationType.Security) {
        securityTileIds[tile.id] = true;
      }
    }
    observedPlayerIds = Object.keys(characters).filter((playerId) => {
      const candidate = characters[playerId];
      return (
        !!candidate &&
        !isCharacterDead(candidate) &&
        !!candidate.position?.tileId &&
        securityTileIds[candidate.position.tileId] === true
      );
    });
    actor.cameraView = {
      playerIds: observedPlayerIds,
      turn: match.current_turn,
    };
    metadata = {
      ...metadata,
      observedCount: observedPlayerIds.length,
      observedPlayerIds,
      location: LocalizationType.Security,
    };
  } else if (
    (resolvedShopId === "spy_drone" ||
      resolvedShopId === "pyromaniac" ||
      resolvedShopId === "bomber") &&
    targetLocation
  ) {
    let targetTile:
      | NonNullable<MatchRecord["map"]>["tiles"][number]
      | undefined;
    for (const tile of match.map?.tiles ?? []) {
      if (isSameCoord(tile.coord, targetLocation)) {
        targetTile = tile;
        break;
      }
    }
    if (!targetTile || targetTile.meta?.destroyed) {
      throw makeNakamaError(
        "invalid_target_location",
        nkruntime.Codes.FAILED_PRECONDITION,
      );
    }
    if (resolvedShopId === "spy_drone") {
      observedPlayerIds = Object.keys(characters).filter((playerId) => {
        const candidate = characters[playerId];
        return (
          !!candidate &&
          !isCharacterDead(candidate) &&
          isSameCoord(candidate.position?.coord, targetLocation)
        );
      });
      actor.remoteView = {
        coord: { q: targetLocation.q, r: targetLocation.r },
        turn: match.current_turn,
      };
      metadata = {
        ...metadata,
        observedCount: observedPlayerIds.length,
        observedPlayerIds,
        observedLocation: targetLocation,
      };
    } else if (resolvedShopId === "pyromaniac") {
      const fireStartTurn = Math.max(0, Math.floor(match.current_turn ?? 0)) + 1;
      const existingEndTurn =
        typeof targetTile.meta?.fireEndTurn === "number"
          ? targetTile.meta.fireEndTurn
          : 0;
      targetTile.meta = {
        ...(targetTile.meta ?? {}),
        fireStartTurn,
        fireEndTurn: Math.max(existingEndTurn, fireStartTurn + 2),
      };
      metadata = {
        ...metadata,
        fireTurns: 3,
      };
    } else {
      observedPlayerIds = Object.keys(characters).filter((playerId) => {
        const candidate = characters[playerId];
        return (
          !!candidate &&
          !isCharacterDead(candidate) &&
          isSameCoord(candidate.position?.coord, targetLocation)
        );
      });
      for (const playerId of observedPlayerIds) {
        const candidate = characters[playerId];
        if (!candidate) {
          continue;
        }
        const outcome = applyHealthDelta(candidate, -5, true, undefined, true);
        characters[playerId] = outcome.character;
        targetDamages[playerId] = Math.max(0, -outcome.result.delta);
        if (outcome.event) {
          postPurchaseEvents.push(outcome.event);
        }
      }
      metadata = {
        ...metadata,
        damage: 5,
        targetCount: observedPlayerIds.length,
        targetLocation,
      };
    }
  }

  actor = match.playerCharacters[ctx.userId] ?? actor;
  match.playerCharacters[ctx.userId] = actor;
  const actionId =
    resolvedShopId === "detective"
      ? "buy_detective"
      : resolvedShopId === "security_camera_app"
        ? "buy_security_camera_app"
        : resolvedShopId === "spy_drone"
          ? "buy_spy_drone"
          : resolvedShopId === "pyromaniac"
            ? "buy_pyromaniac"
            : "buy_bomber";
  const event: ReplayPlayerEvent = {
    kind: "player",
    actorId: ctx.userId,
    action: {
      actionId,
      metadata,
      ...(resolvedShopId === "bomber" && targetLocation
        ? { targetLocation }
        : {}),
    },
    targets:
      observedPlayerIds.length > 0
        ? observedPlayerIds.map((playerId) => ({
            targetId: playerId,
            ...(targetDamages[playerId] !== undefined
              ? {
                  damageTaken: targetDamages[playerId],
                  eliminated: isCharacterDead(match.playerCharacters[playerId]),
                }
              : {}),
          }))
        : undefined,
    visibility:
      resolvedShopId === "pyromaniac" || resolvedShopId === "bomber"
        ? { scope: "all" }
        : { scope: "limited", playerIds: [ctx.userId] },
  };

  storage.writeMatch(match, read.version);
  const turn = Math.max(0, Math.floor(match.current_turn ?? 0));
  const existingReplay = storage.readReplay(matchId, turn);
  storage.appendReplayTurn({
    match_id: matchId,
    turn,
    events: [
      ...(existingReplay?.events ?? []),
      event,
      ...postPurchaseEvents,
    ],
    ...(existingReplay?.snapshot ? { snapshot: existingReplay.snapshot } : {}),
    created_at: existingReplay?.created_at ?? Math.floor(Date.now() / 1000),
  });

  const response: BuyShopItemPayload = {
    ok: true,
    match_id: matchId,
    user_id: ctx.userId,
    shop_id: resolvedShopId,
    ...(targetPlayerId ? { target_player_id: targetPlayerId } : {}),
    ...(targetTeamId ? { target_team_id: targetTeamId } : {}),
    ...(targetLocation ? { target_location: targetLocation } : {}),
    character: actor,
    playerCharacters: tailorPlayerCharactersForViewer(
      match.playerCharacters,
      ctx.userId,
      false,
      match.current_turn,
    ),
    event,
  };
  return JSON.stringify(response);
}
