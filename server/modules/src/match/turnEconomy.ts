/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { getSkillEffectTotal } from "@shared";
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
