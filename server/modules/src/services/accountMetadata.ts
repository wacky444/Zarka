/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { ACCOUNT_METADATA_LOCK_COLLECTION, SERVER_USER_ID } from "../constants";

type AccountMetadataLock = {
  ownerId: string;
  expiresAtMs: number;
};

type StoredLock = {
  value: AccountMetadataLock;
  version: string;
};

export type AccountMetadataUpdateStatus = "updated" | "not_found" | "busy";

export type AccountMetadataMutator = (
  metadata: Record<string, unknown>
) => Record<string, unknown>;

const ACCOUNT_METADATA_LOCK_MS = 30_000;

function readLock(
  nk: nkruntime.Nakama,
  userId: string
): StoredLock | null {
  const object = nk.storageRead([
    {
      collection: ACCOUNT_METADATA_LOCK_COLLECTION,
      key: userId,
      userId: SERVER_USER_ID
    }
  ])?.[0];
  if (!object?.value || typeof object.value !== "object") return null;
  const value = object.value as unknown as AccountMetadataLock;
  return typeof value.ownerId === "string" &&
    typeof value.expiresAtMs === "number"
    ? { value, version: object.version }
    : null;
}

export function acquireAccountMetadataLock(
  nk: nkruntime.Nakama,
  userId: string,
  nowMs = Date.now(),
  logger?: nkruntime.Logger
): string | null {
  const current = readLock(nk, userId);
  if (current && current.value.expiresAtMs > nowMs) return null;

  const ownerId = nk.uuidv4();
  try {
    nk.storageWrite([
      {
        collection: ACCOUNT_METADATA_LOCK_COLLECTION,
        key: userId,
        userId: SERVER_USER_ID,
        value: { ownerId, expiresAtMs: nowMs + ACCOUNT_METADATA_LOCK_MS },
        permissionRead: 0,
        permissionWrite: 0,
        ...(current ? { version: current.version } : { version: "*" })
      }
    ]);
    return ownerId;
  } catch (error) {
    logger?.error(
      "acquireAccountMetadataLock failed for user %s: %s",
      userId,
      (error && (error as Error).message) || String(error)
    );
    return null;
  }
}

export function releaseAccountMetadataLock(
  nk: nkruntime.Nakama,
  userId: string,
  ownerId: string,
  nowMs = Date.now()
): void {
  const current = readLock(nk, userId);
  if (!current || current.value.ownerId !== ownerId) return;
  try {
    nk.storageWrite([
      {
        collection: ACCOUNT_METADATA_LOCK_COLLECTION,
        key: userId,
        userId: SERVER_USER_ID,
        value: { ownerId: "", expiresAtMs: nowMs },
        permissionRead: 0,
        permissionWrite: 0,
        version: current.version
      }
    ]);
  } catch {
    // The lock expires automatically if its owner cannot release it.
  }
}

export function updateAccountMetadata(
  nk: nkruntime.Nakama,
  userId: string,
  mutate: AccountMetadataMutator,
  storageWrites?: () => nkruntime.StorageWriteRequest[],
  nowMs = Date.now(),
  logger?: nkruntime.Logger
): AccountMetadataUpdateStatus {
  const ownerId = acquireAccountMetadataLock(nk, userId, nowMs, logger);
  if (!ownerId) return "busy";

  try {
    const user = nk.usersGetId([userId])?.[0];
    if (!user) return "not_found";

    const metadata = user.metadata && typeof user.metadata === "object" && !Array.isArray(user.metadata)
      ? user.metadata as Record<string, unknown>
      : {};
    const nextMetadata = mutate(metadata);
    const writes = storageWrites?.();

    if (writes) {
      nk.multiUpdate(
        [{ userId, metadata: nextMetadata }],
        writes,
        null,
        null
      );
    } else {
      nk.accountUpdateId(
        userId,
        null,
        null,
        null,
        null,
        null,
        null,
        nextMetadata
      );
    }
    return "updated";
  } finally {
    releaseAccountMetadataLock(nk, userId, ownerId);
  }
}
