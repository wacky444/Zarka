/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { RANKED_DAILY_PRESENCE_COLLECTION, SERVER_USER_ID } from "../constants";
import { TUTORIAL_BOT_ID } from "@shared";

export const RANKED_DAILY_PRESENCE_WINDOW_MS = 24 * 60 * 60 * 1000;
const STORAGE_PAGE_SIZE = 100;

type RankedPresenceRecord = {
  userId: string;
  lastSeenAtMs: number;
};

export function isRankedPresenceUserId(userId: string): boolean {
  return (
    userId !== SERVER_USER_ID &&
    userId !== TUTORIAL_BOT_ID &&
    !/^bot\d+$/.test(userId)
  );
}

export function touchRankedPresence(
  nk: nkruntime.Nakama,
  userId: string,
  lastSeenAtMs: number
): void {
  const record: RankedPresenceRecord = { userId, lastSeenAtMs };
  nk.storageWrite([
    {
      collection: RANKED_DAILY_PRESENCE_COLLECTION,
      key: userId,
      userId: SERVER_USER_ID,
      value: record,
      permissionRead: 0,
      permissionWrite: 0
    }
  ]);
}

export function hasRecentRankedPresence(
  nk: nkruntime.Nakama,
  userId: string,
  nowMs: number
): boolean {
  if (!isRankedPresenceUserId(userId) || !Number.isFinite(nowMs)) {
    return false;
  }
  const stored = nk.storageRead([
    {
      collection: RANKED_DAILY_PRESENCE_COLLECTION,
      key: userId,
      userId: SERVER_USER_ID
    }
  ])[0]?.value as Partial<RankedPresenceRecord> | undefined;
  return (
    stored?.userId === userId &&
    typeof stored.lastSeenAtMs === "number" &&
    Number.isFinite(stored.lastSeenAtMs) &&
    stored.lastSeenAtMs >= nowMs - RANKED_DAILY_PRESENCE_WINDOW_MS &&
    stored.lastSeenAtMs <= nowMs
  );
}

export function countRankedDailyPresence(
  nk: nkruntime.Nakama,
  nowMs: number
): number {
  if (!Number.isFinite(nowMs)) {
    return 0;
  }

  const cutoff = nowMs - RANKED_DAILY_PRESENCE_WINDOW_MS;
  const activeUserIds = new Set<string>();
  const staleObjects: Array<{
    collection: string;
    key: string;
    userId: string;
  }> = [];
  let cursor = "";
  let hasMore = true;

  while (hasMore) {
    const page = nk.storageList(
      SERVER_USER_ID,
      RANKED_DAILY_PRESENCE_COLLECTION,
      STORAGE_PAGE_SIZE,
      cursor
    );
    for (const object of page?.objects ?? []) {
      if (!object?.key) {
        continue;
      }
      const userId = object.key;
      const record = object.value as Partial<RankedPresenceRecord> | undefined;
      const lastSeenAtMs = record?.lastSeenAtMs;
      if (
        typeof lastSeenAtMs !== "number" ||
        !Number.isFinite(lastSeenAtMs) ||
        lastSeenAtMs < cutoff ||
        lastSeenAtMs > nowMs ||
        !isRankedPresenceUserId(userId)
      ) {
        staleObjects.push({
          collection: RANKED_DAILY_PRESENCE_COLLECTION,
          key: object.key,
          userId: SERVER_USER_ID
        });
        continue;
      }
      activeUserIds.add(userId);
    }
    cursor = page?.cursor ?? "";
    hasMore = cursor.length > 0;
  }

  if (staleObjects.length > 0) {
    nk.storageDelete(staleObjects);
  }

  return activeUserIds.size;
}
