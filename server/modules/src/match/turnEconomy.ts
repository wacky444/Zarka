/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { getSkillEffectTotal, ItemLibrary, type ItemId } from "@shared";
import type { ActionId, ReplayEvent } from "@shared";
import type { MatchRecord } from "../models/types";
import { isCharacterDead } from "../utils/playerCharacter";

export function applyZarkanIncome(
  match: MatchRecord,
  replayEvents: ReplayEvent[],
): void {
  if (!match.playerCharacters) {
    return;
  }
  for (const playerId in match.playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(match.playerCharacters, playerId)) {
      continue;
    }
    const character = match.playerCharacters[playerId];
    if (!character || isCharacterDead(character)) {
      continue;
    }
    const skillIncome = getSkillEffectTotal(
      character,
      "daily_zarkan_income",
    );
    if (!character.economy) {
      character.economy = {
        zarkans: 0,
        pendingZarkans: 0,
        incomeInterval: 1,
      };
    }
    const current =
      typeof character.economy.zarkans === "number" &&
      isFinite(character.economy.zarkans)
        ? character.economy.zarkans
        : 0;
    const income = 1 + Math.max(0, skillIncome);
    character.economy.zarkans = current + income;
    character.economy.incomeInterval = 1;
    replayEvents.push({
      kind: "player",
      importance: 0,
      actorId: playerId,
      action: {
        actionId: "zarkan_income" as ActionId,
        metadata: {
          zarkansReceived: income,
          daily: true,
        },
      },
    });
  }
}

export function applyPendingZarkanPayout(
  match: MatchRecord,
  replayEvents: ReplayEvent[],
): void {
  if (!match.playerCharacters) {
    return;
  }
  for (const playerId in match.playerCharacters) {
    if (
      !Object.prototype.hasOwnProperty.call(match.playerCharacters, playerId)
    ) {
      continue;
    }
    const character = match.playerCharacters[playerId];
    if (!character || isCharacterDead(character) || !character.economy) {
      continue;
    }
    const pending =
      typeof character.economy.pendingZarkans === "number" &&
      isFinite(character.economy.pendingZarkans)
        ? character.economy.pendingZarkans
        : 0;
    if (pending > 0) {
      const current =
        typeof character.economy.zarkans === "number" &&
        isFinite(character.economy.zarkans)
          ? character.economy.zarkans
          : 0;
      character.economy.zarkans = current + pending;
      character.economy.pendingZarkans = 0;
      replayEvents.push({
        kind: "player",
        importance: 1,
        actorId: playerId,
        action: {
          actionId: "detective_reward",
          metadata: {
            zarkansReceived: pending,
            source: "detective",
          },
        },
        visibility: { scope: "limited", playerIds: [playerId] },
      });
    }
  }
}

export function applyTraffickerDeliveries(
  match: MatchRecord,
  replayEvents: ReplayEvent[],
  logger: nkruntime.Logger,
): void {
  const characters = match.playerCharacters;
  if (!characters) {
    logger.warn(
      "trafficker_delivery_skipped match=%s turn=%d reason=no_player_characters",
      match.match_id,
      match.current_turn ?? 0,
    );
    return;
  }
  let queuedCount = 0;
  for (const playerId in characters) {
    const deliveries = characters[playerId]?.pendingTraffickerDeliveries;
    if (Array.isArray(deliveries)) queuedCount += deliveries.length;
  }
  logger.info(
    "trafficker_delivery_scan match=%s turn=%d characters=%d queued=%d",
    match.match_id,
    match.current_turn ?? 0,
    Object.keys(characters).length,
    queuedCount,
  );
  for (const playerId in characters) {
    const deceased = characters[playerId];
    const deliveries = deceased?.pendingTraffickerDeliveries;
    if (!deceased || !Array.isArray(deliveries) || deliveries.length === 0) continue;
    logger.info(
      "trafficker_delivery_pending match=%s turn=%d owner=%s items=%s",
      match.match_id,
      match.current_turn ?? 0,
      playerId,
      JSON.stringify(deliveries),
    );
    const recipient = isCharacterDead(deceased)
      ? characters[deceased.testamentRecipientId ?? ""]
      : deceased;
    deceased.pendingTraffickerDeliveries = [];
    if (!recipient || isCharacterDead(recipient)) {
      logger.warn(
        "trafficker_delivery_abandoned match=%s turn=%d owner=%s recipient=%s reason=%s",
        match.match_id,
        match.current_turn ?? 0,
        playerId,
        recipient?.id ?? deceased.testamentRecipientId ?? "none",
        recipient ? "recipient_dead" : "recipient_missing",
      );
      continue;
    }
    recipient.inventory ??= { carriedItems: [] };
    const carriedItems = Array.isArray(recipient.inventory.carriedItems)
      ? [...recipient.inventory.carriedItems]
      : [];
    for (const itemId of deliveries) {
      const definition = ItemLibrary[itemId as ItemId];
      if (!definition) {
        logger?.error?.(
          "trafficker_delivery_unknown_item match=%s turn=%d owner=%s item=%s",
          match.match_id,
          match.current_turn ?? 0,
          playerId,
          itemId,
        );
        continue;
      }
      const existing = carriedItems.find((stack) => stack.itemId === itemId);
      if (existing) existing.quantity += 1;
      else carriedItems.push({ itemId, quantity: 1, weight: definition.weight });
      replayEvents.push({
        kind: "player",
        importance: 1,
        actorId: recipient.id,
        action: { actionId: "give", metadata: { traffickerDelivery: true, itemId, fromPlayerId: playerId } },
        visibility: { scope: "limited", playerIds: [recipient.id] },
      });
      logger?.info?.(
        "trafficker_delivery_complete match=%s turn=%d owner=%s recipient=%s item=%s quantity=%d",
        match.match_id,
        match.current_turn ?? 0,
        playerId,
        recipient.id,
        itemId,
        existing ? existing.quantity : 1,
      );
    }
    recipient.inventory.carriedItems = carriedItems;
    match.playerCharacters[recipient.id] = recipient;
  }
  logger.info(
    "trafficker_delivery_scan_complete match=%s turn=%d queued_at_scan=%d",
    match.match_id,
    match.current_turn ?? 0,
    queuedCount,
  );
}

export function applyTestaments(
  match: MatchRecord,
  replayEvents: ReplayEvent[],
): void {
  if (!match.playerCharacters) {
    return;
  }
  for (const playerId in match.playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(match.playerCharacters, playerId)) {
      continue;
    }
    const deceased = match.playerCharacters[playerId];
    if (
      !deceased ||
      !isCharacterDead(deceased) ||
      deceased.testamentProcessed === true
    ) {
      continue;
    }
    deceased.testamentProcessed = true;
    const recipientId = deceased.testamentRecipientId;
    const recipient = recipientId
      ? match.playerCharacters[recipientId]
      : undefined;
    const amount =
      typeof deceased.economy?.zarkans === "number" &&
      isFinite(deceased.economy.zarkans)
        ? Math.max(0, Math.floor(deceased.economy.zarkans))
        : 0;
    if (
      !recipientId ||
      recipientId === playerId ||
      !recipient ||
      isCharacterDead(recipient) ||
      amount <= 0
    ) {
      continue;
    }
    if (!recipient.economy) {
      recipient.economy = {
        zarkans: 0,
        pendingZarkans: 0,
        incomeInterval: 1,
      };
    }
    const recipientBalance =
      typeof recipient.economy.zarkans === "number" &&
      isFinite(recipient.economy.zarkans)
        ? recipient.economy.zarkans
        : 0;
    recipient.economy.zarkans = recipientBalance + amount;
    deceased.economy.zarkans = 0;
    replayEvents.push({
      kind: "player",
      importance: 1,
      actorId: deceased.id,
      action: {
        actionId: "give",
        metadata: {
          testament: true,
        },
      },
      targets: [
        {
          targetId: recipientId,
          metadata: {
            testament: true,
            zarkansReceived: amount,
          },
        },
      ],
    });
  }
}
