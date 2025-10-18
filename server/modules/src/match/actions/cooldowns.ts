/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  PlayerActionCooldown,
  PlayerCharacter,
  PlayerStatusState,
} from "@shared";

function ensureStatusState(character: PlayerCharacter): PlayerStatusState {
  if (!character.statuses) {
    character.statuses = { conditions: [] } as PlayerStatusState;
  } else if (!character.statuses.conditions) {
    character.statuses.conditions = [];
  }
  return character.statuses;
}

function normalizeAvailableOnTurn(
  entry: PlayerActionCooldown,
  currentTurn: number
): number {
  const fallback = currentTurn + 1 + Math.max(0, entry.remainingTurns);
  const available =
    typeof entry.availableOnTurn === "number"
      ? entry.availableOnTurn
      : fallback;
  return available;
}

function computeRemainingFromAvailable(
  availableOnTurn: number,
  currentTurn: number
): number {
  const remaining = availableOnTurn - (currentTurn + 1);
  return remaining > 0 ? Math.ceil(remaining) : 0;
}

function rebuildCooldowns(
  cooldowns: PlayerActionCooldown[] | undefined,
  currentTurn: number
): PlayerActionCooldown[] | undefined {
  if (!cooldowns || cooldowns.length === 0) {
    return undefined;
  }
  const next: PlayerActionCooldown[] = [];
  for (const entry of cooldowns) {
    if (!entry || typeof entry.actionId !== "string") {
      continue;
    }
    const availableOnTurn = normalizeAvailableOnTurn(entry, currentTurn);
    const remaining = computeRemainingFromAvailable(
      availableOnTurn,
      currentTurn
    );
    if (remaining <= 0) {
      continue;
    }
    next.push({
      actionId: entry.actionId,
      availableOnTurn,
      remainingTurns: remaining,
    });
  }
  return next.length > 0 ? next : undefined;
}

export function updateCharacterCooldowns(
  character: PlayerCharacter,
  currentTurn: number
): void {
  const statuses = character.statuses;
  if (!statuses) {
    return;
  }
  const updated = rebuildCooldowns(statuses.cooldowns, currentTurn);
  if (updated) {
    statuses.cooldowns = updated;
  } else if (statuses.cooldowns && statuses.cooldowns.length > 0) {
    delete statuses.cooldowns;
  }
}

export function updateCooldownsForTurn(
  match: MatchRecord,
  currentTurn: number
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
    if (!character) {
      continue;
    }
    updateCharacterCooldowns(character, currentTurn);
  }
}

export function getActionCooldownRemaining(
  character: PlayerCharacter,
  actionId: ActionId,
  currentTurn: number
): number {
  updateCharacterCooldowns(character, currentTurn);
  const statuses = character.statuses;
  if (!statuses?.cooldowns) {
    return 0;
  }
  for (const entry of statuses.cooldowns) {
    if (!entry || entry.actionId !== actionId) {
      continue;
    }
    const availableOnTurn = normalizeAvailableOnTurn(entry, currentTurn);
    const remaining = computeRemainingFromAvailable(
      availableOnTurn,
      currentTurn
    );
    if (remaining <= 0) {
      continue;
    }
    entry.availableOnTurn = availableOnTurn;
    entry.remainingTurns = remaining;
    return remaining;
  }
  return 0;
}

export function isActionOnCooldown(
  character: PlayerCharacter,
  actionId: ActionId,
  currentTurn: number
): boolean {
  return getActionCooldownRemaining(character, actionId, currentTurn) > 0;
}

export function applyActionCooldown(
  character: PlayerCharacter,
  actionId: ActionId,
  cooldown: number,
  turnNumber: number
): void {
  const statuses = ensureStatusState(character);
  const existing = statuses.cooldowns ? [...statuses.cooldowns] : [];
  const filtered: PlayerActionCooldown[] = [];
  for (const entry of existing) {
    if (!entry || typeof entry.actionId !== "string") {
      continue;
    }
    if (entry.actionId === actionId) {
      continue;
    }
    const availableOnTurn = normalizeAvailableOnTurn(entry, turnNumber);
    const remaining = computeRemainingFromAvailable(
      availableOnTurn,
      turnNumber
    );
    if (remaining <= 0) {
      continue;
    }
    filtered.push({
      actionId: entry.actionId,
      availableOnTurn,
      remainingTurns: remaining,
    });
  }

  if (cooldown > 1) {
    const availableOnTurn = turnNumber + cooldown;
    const remaining = computeRemainingFromAvailable(
      availableOnTurn,
      turnNumber
    );
    if (remaining > 0) {
      filtered.push({
        actionId,
        availableOnTurn,
        remainingTurns: remaining,
      });
    }
  }

  if (filtered.length > 0) {
    statuses.cooldowns = filtered;
  } else if (statuses.cooldowns) {
    delete statuses.cooldowns;
  }
}
