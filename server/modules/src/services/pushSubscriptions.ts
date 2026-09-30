/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  PUSH_SUBSCRIPTION_COLLECTION,
  PUSH_SUBSCRIPTION_DEVICE_INDEX_COLLECTION,
  SERVER_USER_ID
} from "../constants";
import type {
  PushSubscriptionDeviceIndex,
  StoredPushSubscription,
  WebPushSubscription
} from "../models/pushNotifications";

export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidPushDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

function isSupportedPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) {
    return false;
  }
  const match = /^https:\/\/([^/?#:]+)(?::(\d+))?(?:\/[^#]*)?$/.exec(value);
  if (!match) {
    return false;
  }
  const host = match[1].toLowerCase();
  const port = match[2] ?? "";
  const supportedHost =
    host === "fcm.googleapis.com" ||
    host === "push.services.mozilla.com" ||
    host.endsWith(".push.services.mozilla.com") ||
    host.endsWith(".push.apple.com") ||
    host.endsWith(".notify.windows.com");
  return (port === "" || port === "443") && supportedHost;
}

function parseWebPushSubscription(value: unknown): WebPushSubscription | null {
  if (!isRecord(value) || !isRecord(value.keys)) {
    return null;
  }
  const endpoint = value.endpoint;
  const expirationTime = value.expirationTime;
  const p256dh = value.keys.p256dh;
  const auth = value.keys.auth;
  if (
    !isSupportedPushEndpoint(endpoint) ||
    (expirationTime !== null &&
      expirationTime !== undefined &&
      (typeof expirationTime !== "number" ||
        !Number.isFinite(expirationTime) ||
        expirationTime <= 0)) ||
    typeof p256dh !== "string" ||
    !/^[A-Za-z0-9_-]{80,120}$/.test(p256dh) ||
    typeof auth !== "string" ||
    !/^[A-Za-z0-9_-]{16,64}$/.test(auth)
  ) {
    return null;
  }
  return {
    endpoint,
    expirationTime:
      typeof expirationTime === "number" ? expirationTime : null,
    keys: { p256dh, auth }
  };
}

export function parsePushSubscription(value: unknown): WebPushSubscription | null {
  return parseWebPushSubscription(value);
}

export function isPushDispatchConfigured(
  env: Record<string, string> | undefined
): boolean {
  const url = env?.PUSH_DISPATCHER_URL;
  const secret = env?.PUSH_DISPATCH_SECRET;
  if (
    !url ||
    !secret ||
    secret.length < 32 ||
    /^replace[-_ ]with/i.test(secret)
  ) {
    return false;
  }
  return url === "http://push-dispatcher:7355/send";
}

export function registerPushSubscription(
  ctx: nkruntime.Context,
  nk: nkruntime.Nakama,
  deviceId: string,
  subscription: WebPushSubscription,
  locale: "en" | "es"
): void {
  const userId = ctx.userId;
  if (!userId) {
    throw new Error("authenticated user is required");
  }
  if (!isPushDispatchConfigured(ctx.env)) {
    throw new Error("push delivery is not configured");
  }

  const existingForUser = nk.storageList(
    userId,
    PUSH_SUBSCRIPTION_COLLECTION,
    MAX_PUSH_SUBSCRIPTIONS_PER_USER + 1
  ).objects ?? [];
  const hasDevice = existingForUser.some((entry) => entry?.key === deviceId);
  if (!hasDevice && existingForUser.length >= MAX_PUSH_SUBSCRIPTIONS_PER_USER) {
    throw new Error("too many push subscriptions");
  }

  const indexRead = nk.storageRead([
    {
      collection: PUSH_SUBSCRIPTION_DEVICE_INDEX_COLLECTION,
      key: deviceId,
      userId: SERVER_USER_ID
    }
  ])[0];
  const indexValue = indexRead?.value as PushSubscriptionDeviceIndex | undefined;
  const previousUserId =
    typeof indexValue?.userId === "string" ? indexValue.userId : null;
  const previousSubscriptionRead =
    previousUserId && previousUserId !== userId
      ? nk.storageRead([
          {
            collection: PUSH_SUBSCRIPTION_COLLECTION,
            key: deviceId,
            userId: previousUserId
          }
        ])[0]
      : undefined;
  const currentSubscriptionRead = nk.storageRead([
    {
      collection: PUSH_SUBSCRIPTION_COLLECTION,
      key: deviceId,
      userId
    }
  ])[0];
  const now = Date.now();
  const stored: StoredPushSubscription = {
    deviceId,
    userId,
    subscription,
    locale,
    updatedAtMs: now
  };
  const writes: nkruntime.StorageWriteRequest[] = [
    {
      collection: PUSH_SUBSCRIPTION_COLLECTION,
      key: deviceId,
      userId,
      value: stored,
      permissionRead: 0,
      permissionWrite: 0,
      version: currentSubscriptionRead?.version ?? ""
    },
    {
      collection: PUSH_SUBSCRIPTION_DEVICE_INDEX_COLLECTION,
      key: deviceId,
      userId: SERVER_USER_ID,
      value: { userId } satisfies PushSubscriptionDeviceIndex,
      permissionRead: 0,
      permissionWrite: 0,
      version: indexRead?.version ?? ""
    }
  ];
  const deletes: nkruntime.StorageDeleteRequest[] =
    previousUserId && previousUserId !== userId && previousSubscriptionRead
      ? [
          {
            collection: PUSH_SUBSCRIPTION_COLLECTION,
            key: deviceId,
            userId: previousUserId,
            version: previousSubscriptionRead.version
          }
        ]
      : [];

  nk.multiUpdate(null, writes, deletes, null);
}

export function unregisterPushSubscription(
  ctx: nkruntime.Context,
  nk: nkruntime.Nakama,
  deviceId: string
): void {
  const userId = ctx.userId;
  if (!userId) {
    throw new Error("authenticated user is required");
  }

  const indexRead = nk.storageRead([
    {
      collection: PUSH_SUBSCRIPTION_DEVICE_INDEX_COLLECTION,
      key: deviceId,
      userId: SERVER_USER_ID
    }
  ])[0];
  const indexValue = indexRead?.value as PushSubscriptionDeviceIndex | undefined;
  const ownedByCaller = indexValue?.userId === userId;
  const subscriptionRead = nk.storageRead([
    {
      collection: PUSH_SUBSCRIPTION_COLLECTION,
      key: deviceId,
      userId
    }
  ])[0];
  const deletes: nkruntime.StorageDeleteRequest[] = [];

  if (subscriptionRead) {
    deletes.push({
      collection: PUSH_SUBSCRIPTION_COLLECTION,
      key: deviceId,
      userId,
      version: subscriptionRead.version
    });
  }
  if (ownedByCaller && indexRead) {
    deletes.push({
      collection: PUSH_SUBSCRIPTION_DEVICE_INDEX_COLLECTION,
      key: deviceId,
      userId: SERVER_USER_ID,
      version: indexRead.version
    });
  }
  if (deletes.length > 0) {
    nk.multiUpdate(null, null, deletes, null);
  }
}
