/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { isPushDispatchConfigured, isValidPushDeviceId, parsePushSubscription, registerPushSubscription } from "../services/pushSubscriptions";
import { makeNakamaError } from "../utils/errors";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function registerPushSubscriptionRpc(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx?.userId) {
    throw makeNakamaError("user context required", nkruntime.Codes.UNAUTHENTICATED);
  }
  if (!isPushDispatchConfigured(ctx.env)) {
    throw makeNakamaError("push_unavailable", nkruntime.Codes.UNAVAILABLE);
  }

  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    throw makeNakamaError("bad_json", nkruntime.Codes.INVALID_ARGUMENT);
  }
  if (
    !isRecord(json) ||
    !isValidPushDeviceId(json.device_id) ||
    (json.locale !== "en" && json.locale !== "es")
  ) {
    throw makeNakamaError("invalid_push_subscription", nkruntime.Codes.INVALID_ARGUMENT);
  }
  const subscription = parsePushSubscription(json.subscription);
  if (!subscription) {
    throw makeNakamaError("invalid_push_subscription", nkruntime.Codes.INVALID_ARGUMENT);
  }

  try {
    registerPushSubscription(
      ctx,
      nk,
      json.device_id,
      subscription,
      json.locale
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    _logger.error("registerPushSubscription error: %s", error instanceof Error && error.stack ? error.stack : message);
    if (message === "too many push subscriptions") {
      throw makeNakamaError(message, nkruntime.Codes.RESOURCE_EXHAUSTED);
    }
    if (message === "push delivery is not configured") {
      throw makeNakamaError("push_unavailable", nkruntime.Codes.UNAVAILABLE);
    }
    throw makeNakamaError("push_subscription_write_failed", nkruntime.Codes.INTERNAL);
  }

  return JSON.stringify({ ok: true });
}
