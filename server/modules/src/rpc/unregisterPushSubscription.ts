/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { isValidPushDeviceId, unregisterPushSubscription } from "../services/pushSubscriptions";
import { makeNakamaError } from "../utils/errors";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function unregisterPushSubscriptionRpc(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx?.userId) {
    throw makeNakamaError("user context required", nkruntime.Codes.UNAUTHENTICATED);
  }

  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    throw makeNakamaError("bad_json", nkruntime.Codes.INVALID_ARGUMENT);
  }
  if (!isRecord(json) || !isValidPushDeviceId(json.device_id)) {
    throw makeNakamaError("invalid_device_id", nkruntime.Codes.INVALID_ARGUMENT);
  }

  try {
    unregisterPushSubscription(ctx, nk, json.device_id);
  } catch {
    throw makeNakamaError("push_subscription_delete_failed", nkruntime.Codes.INTERNAL);
  }
  return JSON.stringify({ ok: true });
}
