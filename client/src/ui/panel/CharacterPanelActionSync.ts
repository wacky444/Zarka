import type { Axial } from "@shared";

export function normalizeAxial(target: Axial | null): Axial | null {
  if (!target) {
    return null;
  }
  const q = typeof target.q === "number" ? target.q : Number(target.q);
  const r = typeof target.r === "number" ? target.r : Number(target.r);
  if (Number.isNaN(q) || Number.isNaN(r)) {
    return null;
  }
  return { q, r };
}

export function normalizePlayerId(
  value: string | null | undefined
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isSameAxial(a: Axial | null, b: Axial | null): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.q === b.q && a.r === b.r;
}

export function isSameTargetItems(
  local: string[] | undefined | null,
  remote: string[] | undefined | null
): boolean {
  const normalize = (input: string[] | undefined | null): string[] => {
    if (!input || input.length === 0) {
      return [];
    }
    const result: string[] = [];
    for (const value of input) {
      if (typeof value !== "string") {
        continue;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }
      result.push(trimmed);
    }
    return result;
  };
  const a = normalize(local);
  const b = normalize(remote);
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

export interface LocalMainActionSyncState {
  actionId: string | null;
  targetLocation: Axial | null;
  secondTargetLocation: Axial | null;
  targetPlayerId: string | null;
  secondTargetPlayerId: string | null;
  priorityItems: string[];
  secondPriorityItems: string[];
}

export interface ServerMainActionSyncState {
  actionId: string | null;
  targetLocation: Axial | null;
  secondTargetLocation: Axial | null;
  targetPlayerId: string | null;
  secondTargetPlayerId: string | null;
  targetItems: string[] | null;
  secondTargetItems: string[] | null;
}

export function shouldSyncMainActionWithServer(
  local: LocalMainActionSyncState,
  server: ServerMainActionSyncState
): boolean {
  const matchesSelection = (local.actionId ?? null) === (server.actionId ?? null);
  const matchesLocation = isSameAxial(local.targetLocation, server.targetLocation);
  const matchesSecondLocation = isSameAxial(
    local.secondTargetLocation,
    server.secondTargetLocation
  );
  const matchesPlayer =
    (local.targetPlayerId ?? null) === (server.targetPlayerId ?? null);
  const matchesSecondPlayer =
    (local.secondTargetPlayerId ?? null) ===
    (server.secondTargetPlayerId ?? null);
  const matchesItems = isSameTargetItems(local.priorityItems, server.targetItems);
  const matchesSecondItems = isSameTargetItems(
    local.secondPriorityItems,
    server.secondTargetItems
  );

  return (
    !matchesSelection ||
    !matchesLocation ||
    !matchesSecondLocation ||
    !matchesPlayer ||
    !matchesSecondPlayer ||
    !matchesItems ||
    !matchesSecondItems
  );
}

export interface LocalSecondaryActionSyncState {
  actionId: string | null;
  targetLocation: Axial | null;
  targetPlayerId: string | null;
  priorityItems: string[];
  prioritizeFoodDrink: boolean;
  sellInstead: boolean;
}

export interface ServerSecondaryActionSyncState {
  actionId: string | null;
  targetLocation: Axial | null;
  targetPlayerId: string | null;
  targetItems: string[] | null;
  prioritizeFoodDrink: boolean;
  sellInstead: boolean;
}

export function shouldSyncSecondaryActionWithServer(
  local: LocalSecondaryActionSyncState,
  server: ServerSecondaryActionSyncState
): boolean {
  const matchesSelection = (local.actionId ?? null) === (server.actionId ?? null);
  const matchesLocation = isSameAxial(local.targetLocation, server.targetLocation);
  const matchesPlayer =
    (local.targetPlayerId ?? null) === (server.targetPlayerId ?? null);
  const matchesItems = isSameTargetItems(local.priorityItems, server.targetItems);
  const matchesFoodDrinkPriority =
    local.actionId !== "search" ||
    local.prioritizeFoodDrink === server.prioritizeFoodDrink;
  const matchesSellInstead =
    local.actionId !== "drop" || local.sellInstead === server.sellInstead;

  return (
    !matchesSelection ||
    !matchesLocation ||
    !matchesPlayer ||
    !matchesItems ||
    !matchesFoodDrinkPriority ||
    !matchesSellInstead
  );
}
