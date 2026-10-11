/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { normalizeMaxCurrentMatches, TUTORIAL_MATCH_METADATA_KEY } from "@shared";
import { acquireAccountMetadataLock, releaseAccountMetadataLock } from "./accountMetadata";
import { StorageService } from "./storageService";
import { createNakamaWrapper } from "./nakamaWrapper";

type AccountRecord = { metadata?: unknown };

export function countActiveMemberships(storage: StorageService, userId: string): number {
  return storage.listAllMatches().reduce((count, { match }) => {
    if (match.metadata?.[TUTORIAL_MATCH_METADATA_KEY] || (match.removed !== undefined && match.removed !== 0)) return count;
    const active = Array.isArray(match.players) && match.players.includes(userId);
    const ownWaiting = match.creator === userId && match.started !== true;
    return count + (active || ownWaiting ? 1 : 0);
  }, 0);
}

export function getMaxCurrentMatches(nk: nkruntime.Nakama, userId: string): number {
  const account = nk.usersGetId([userId])?.[0] as unknown as AccountRecord | undefined;
  const metadata = account?.metadata && typeof account.metadata === "object" && !Array.isArray(account.metadata)
    ? account.metadata as Record<string, unknown>
    : {};
  const zarka = metadata.zarka && typeof metadata.zarka === "object" && !Array.isArray(metadata.zarka)
    ? metadata.zarka as Record<string, unknown>
    : {};
  return normalizeMaxCurrentMatches(zarka.maxCurrentMatches);
}

export function withMatchMembershipLocks<T>(
  nk: nkruntime.Nakama,
  userIds: string[],
  logger: nkruntime.Logger,
  action: () => T
): T {
  const locks: Array<{ userId: string; ownerId: string }> = [];
  try {
    for (const userId of [...new Set(userIds)].sort()) {
      const ownerId = acquireAccountMetadataLock(nk, userId, Date.now(), logger);
      if (!ownerId) throw new Error("match_limit_busy");
      locks.push({ userId, ownerId });
    }
    return action();
  } finally {
    for (const lock of locks.reverse()) releaseAccountMetadataLock(nk, lock.userId, lock.ownerId);
  }
}

export function assertCanAddMembership(
  nk: nkruntime.Nakama,
  storage: StorageService,
  userId: string
): void {
  const maximum = getMaxCurrentMatches(nk, userId);
  const current = countActiveMemberships(storage, userId);
  if (current >= maximum) throw new Error("max_current_matches_reached");
}

export function createMembershipStorage(nk: nkruntime.Nakama): StorageService {
  return new StorageService(createNakamaWrapper(nk));
}
