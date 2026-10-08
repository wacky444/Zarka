/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { NAKAMA_SYSTEM_USER_ID } from "@shared";
import {
  PUSH_NOTIFICATION_OUTBOX_COLLECTION,
  PUSH_SUBSCRIPTION_COLLECTION,
  PUSH_SUBSCRIPTION_DEVICE_INDEX_COLLECTION,
  SERVER_USER_ID
} from "../constants";
import type {
  PushNotificationOutbox,
  PushSubscriptionDeviceIndex,
  RankedMatchStartedOutbox,
  StoredPushSubscription,
  TurnNotificationOutbox,
  TurnNotificationTarget
} from "../models/pushNotifications";
import type { MatchRecord } from "../models/types";
import { isBotId } from "../match/botAI";
import { RANKED_MATCH_METADATA_KEY } from "@shared";
import { isPushDispatchConfigured, parsePushSubscription } from "./pushSubscriptions";

interface PushDispatchResponse {
  ok?: unknown;
  expiredDeviceIds?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getTurnOutboxId(matchId: string, turn: number): string {
  return `turn_${matchId}_${turn}`;
}

function getRankedMatchStartedOutboxId(matchId: string): string {
  return `ranked_match_started_${matchId}`;
}

function getStoredSubscription(
  value: unknown,
  userId: string,
  deviceId: string
): StoredPushSubscription | null {
  if (!isRecord(value) || value.userId !== userId || value.deviceId !== deviceId) {
    return null;
  }
  const subscription = parsePushSubscription(value.subscription);
  if (!subscription) {
    return null;
  }
  return {
    deviceId,
    userId,
    subscription,
    locale: value.locale === "es" ? "es" : "en",
    updatedAtMs:
      typeof value.updatedAtMs === "number" ? value.updatedAtMs : 0
  };
}

function parseOutbox(value: unknown): PushNotificationOutbox | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.matchId !== "string" ||
    !Array.isArray(value.targets) ||
    (value.status !== "pending" && value.status !== "delivered")
  ) {
    return null;
  }
  const targets = value.targets.filter(
    (target): target is TurnNotificationTarget =>
      isRecord(target) &&
      typeof target.userId === "string" &&
      typeof target.deviceId === "string" &&
      (target.locale === undefined ||
        target.locale === "en" ||
        target.locale === "es")
  );
  const common = {
    id: value.id,
    matchId: value.matchId,
    targets,
    status: value.status === "pending" ? "pending" as const : "delivered" as const,
    attempts: typeof value.attempts === "number" ? value.attempts : 0,
    nextAttemptAtMs:
      typeof value.nextAttemptAtMs === "number" ? value.nextAttemptAtMs : 0,
    createdAtMs: typeof value.createdAtMs === "number" ? value.createdAtMs : 0,
    ...(typeof value.deliveredAtMs === "number"
      ? { deliveredAtMs: value.deliveredAtMs }
      : {})
  };
  const event = value.event ?? "turn_advanced";
  if (event === "turn_advanced" && typeof value.turn === "number") {
    return { ...common, event: "turn_advanced", turn: value.turn };
  }
  if (event === "ranked_match_started") {
    return { ...common, event: "ranked_match_started" };
  }
  return null;
}

function createNotificationTargets(
  match: MatchRecord,
  ctx: nkruntime.Context,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): TurnNotificationTarget[] | null {
  if (
    !isPushDispatchConfigured(ctx.env) ||
    match.started !== true ||
    (typeof match.removed === "number" && match.removed !== 0) ||
    !Array.isArray(match.players)
  ) {
    return null;
  }

  const targets: TurnNotificationTarget[] = [];
  const playerIds = Array.from(new Set(match.players)).filter(
    (playerId) =>
      playerId !== NAKAMA_SYSTEM_USER_ID &&
      playerId !== SERVER_USER_ID &&
      !isBotId(playerId)
  );
  for (const userId of playerIds) {
    try {
      const response = nk.storageList(userId, PUSH_SUBSCRIPTION_COLLECTION, 20);
      for (const entry of response?.objects ?? []) {
        if (typeof entry?.key !== "string") continue;
        const subscription = getStoredSubscription(entry.value, userId, entry.key);
        if (subscription) {
          targets.push({
            userId,
            deviceId: entry.key,
            locale: subscription.locale
          });
        }
      }
    } catch (error) {
      logger.warn(
        "push subscription lookup failed for user %s: %s",
        userId,
        (error as Error).message || String(error)
      );
    }
  }
  return targets.length > 0 ? targets : null;
}

export function createTurnNotificationOutbox(
  match: MatchRecord,
  ctx: nkruntime.Context,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): TurnNotificationOutbox | null {
  if (!Number.isFinite(match.current_turn)) return null;
  const targets = createNotificationTargets(match, ctx, nk, logger);
  if (!targets) return null;
  const turn = match.current_turn;
  return {
    id: getTurnOutboxId(match.match_id, turn),
    matchId: match.match_id,
    event: "turn_advanced",
    turn,
    targets,
    status: "pending",
    attempts: 0,
    nextAttemptAtMs: 0,
    createdAtMs: Date.now()
  };
}

export function createRankedMatchStartedOutbox(
  match: MatchRecord,
  ctx: nkruntime.Context,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): RankedMatchStartedOutbox | null {
  if (!match.metadata?.[RANKED_MATCH_METADATA_KEY]) return null;
  const targets = createNotificationTargets(match, ctx, nk, logger);
  if (!targets) return null;
  return {
    id: getRankedMatchStartedOutboxId(match.match_id),
    matchId: match.match_id,
    event: "ranked_match_started",
    targets,
    status: "pending",
    attempts: 0,
    nextAttemptAtMs: 0,
    createdAtMs: Date.now()
  };
}

function removeExpiredSubscription(
  nk: nkruntime.Nakama,
  target: TurnNotificationTarget
): void {
  const reads = nk.storageRead([
    {
      collection: PUSH_SUBSCRIPTION_COLLECTION,
      key: target.deviceId,
      userId: target.userId
    },
    {
      collection: PUSH_SUBSCRIPTION_DEVICE_INDEX_COLLECTION,
      key: target.deviceId,
      userId: SERVER_USER_ID
    }
  ]);
  const subscriptionRead = reads.find(
    (entry) =>
      entry.collection === PUSH_SUBSCRIPTION_COLLECTION &&
      entry.userId === target.userId
  );
  const indexRead = reads.find(
    (entry) =>
      entry.collection === PUSH_SUBSCRIPTION_DEVICE_INDEX_COLLECTION &&
      entry.userId === SERVER_USER_ID
  );
  const index = indexRead?.value as PushSubscriptionDeviceIndex | undefined;
  const deletes: nkruntime.StorageDeleteRequest[] = [];
  if (subscriptionRead) {
    deletes.push({
      collection: PUSH_SUBSCRIPTION_COLLECTION,
      key: target.deviceId,
      userId: target.userId,
      version: subscriptionRead.version
    });
  }
  if (indexRead && index?.userId === target.userId) {
    deletes.push({
      collection: PUSH_SUBSCRIPTION_DEVICE_INDEX_COLLECTION,
      key: target.deviceId,
      userId: SERVER_USER_ID,
      version: indexRead.version
    });
  }
  if (deletes.length > 0) {
    nk.multiUpdate(null, null, deletes, null);
  }
}

function persistOutbox(
  nk: nkruntime.Nakama,
  outbox: PushNotificationOutbox,
  version: string
): void {
  nk.storageWrite([
    {
      collection: PUSH_NOTIFICATION_OUTBOX_COLLECTION,
      key: outbox.id,
      userId: SERVER_USER_ID,
      value: outbox,
      permissionRead: 0,
      permissionWrite: 0,
      version
    }
  ]);
}

function retryOutbox(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  outbox: PushNotificationOutbox,
  version: string
): void {
  const attempts = outbox.attempts + 1;
  const delayMs = Math.min(60 * 60 * 1000, 5000 * 2 ** Math.min(attempts - 1, 10));
  try {
    persistOutbox(
      nk,
      {
        ...outbox,
        attempts,
        nextAttemptAtMs: Date.now() + delayMs
      },
      version
    );
  } catch (error) {
    logger.warn(
      "push outbox retry state write failed for %s: %s",
      outbox.id,
      (error as Error).message || String(error)
    );
  }
}

function dispatchNotificationOutbox(
  id: string,
  ctx: nkruntime.Context,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): void {
  const stored = nk.storageRead([
    {
      collection: PUSH_NOTIFICATION_OUTBOX_COLLECTION,
      key: id,
      userId: SERVER_USER_ID
    }
  ])[0];
  const outbox = parseOutbox(stored?.value);
  if (
    !outbox ||
    outbox.status !== "pending" ||
    outbox.nextAttemptAtMs > Date.now()
  ) {
    return;
  }

  const env = ctx.env ?? {};
  const dispatcherUrl = env.PUSH_DISPATCHER_URL;
  const dispatchSecret = env.PUSH_DISPATCH_SECRET;
  if (!isPushDispatchConfigured(env) || !dispatcherUrl || !dispatchSecret) {
    return;
  }

  const subscriptionReads = nk.storageRead(
    outbox.targets.map((target) => ({
      collection: PUSH_SUBSCRIPTION_COLLECTION,
      key: target.deviceId,
      userId: target.userId
    }))
  );
  const subscriptions: Array<{
    userId: string;
    deviceId: string;
    subscription: StoredPushSubscription["subscription"];
    locale: StoredPushSubscription["locale"];
  }> = [];
  for (const target of outbox.targets) {
    const match = subscriptionReads.find(
      (entry) =>
        entry.collection === PUSH_SUBSCRIPTION_COLLECTION &&
        entry.key === target.deviceId &&
        entry.userId === target.userId
    );
    const subscription = getStoredSubscription(
      match?.value,
      target.userId,
      target.deviceId
    );
    if (subscription) {
      subscriptions.push({
        userId: target.userId,
        deviceId: target.deviceId,
        subscription: subscription.subscription,
        locale: target.locale ?? subscription.locale
      });
    }
  }

  if (subscriptions.length === 0) {
    try {
      persistOutbox(
        nk,
        { ...outbox, status: "delivered", deliveredAtMs: Date.now() },
        stored.version
      );
    } catch (error) {
      logger.warn(
        "push outbox completion write failed for %s: %s",
        id,
        (error as Error).message || String(error)
      );
    }
    return;
  }

  try {
    const response = nk.httpRequest(
      dispatcherUrl,
      "post",
      {
        Authorization: `Bearer ${dispatchSecret}`,
        "Content-Type": "application/json"
      },
      JSON.stringify({
        idempotencyKey: id,
        event: outbox.event,
        matchId: outbox.matchId,
        ...(outbox.event === "turn_advanced" ? { turn: outbox.turn } : {}),
        subscriptions
      }),
      1500
    );
    let result: PushDispatchResponse | null = null;
    try {
      const parsed: unknown = JSON.parse(response.body);
      result = isRecord(parsed) ? (parsed as PushDispatchResponse) : null;
    } catch {
      result = null;
    }

    const expiredIds = Array.isArray(result?.expiredDeviceIds)
      ? result.expiredDeviceIds.filter(
          (deviceId): deviceId is string => typeof deviceId === "string"
        )
      : [];
    for (const target of outbox.targets) {
      if (expiredIds.includes(target.deviceId)) {
        removeExpiredSubscription(nk, target);
      }
    }

    if (response.code >= 200 && response.code < 300 && result?.ok === true) {
      persistOutbox(
        nk,
        { ...outbox, status: "delivered", deliveredAtMs: Date.now() },
        stored.version
      );
      return;
    }
    retryOutbox(nk, logger, outbox, stored.version);
  } catch (error) {
    logger.warn(
      "push dispatch failed for %s: %s",
      id,
      (error as Error).message || String(error)
    );
    retryOutbox(nk, logger, outbox, stored.version);
  }
}

export function dispatchTurnNotificationOutbox(
  matchId: string,
  turn: number,
  ctx: nkruntime.Context,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): void {
  dispatchNotificationOutbox(getTurnOutboxId(matchId, turn), ctx, nk, logger);
}

export function dispatchRankedMatchStartedOutbox(
  matchId: string,
  ctx: nkruntime.Context,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): void {
  dispatchNotificationOutbox(
    getRankedMatchStartedOutboxId(matchId),
    ctx,
    nk,
    logger
  );
}
