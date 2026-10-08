/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { recordRankedSlotPreference } from "../services/rankedQueue";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

export function setRankedMatchSlotsRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  const userId = ctx?.userId;
  if (!userId) {
    return JSON.stringify({ error: "unauthorized" } satisfies import("@shared").SetRankedMatchSlotsPayload);
  }

  let request: UnknownRecord | undefined;
  try {
    request = asRecord(JSON.parse(payload));
  } catch {
    return JSON.stringify({ error: "bad_json" } satisfies import("@shared").SetRankedMatchSlotsPayload);
  }

  const slots = request?.ranked_match_slots;
  if (
    typeof slots !== "number" ||
    !Number.isInteger(slots) ||
    slots < 0 ||
    slots > 3
  ) {
    return JSON.stringify({
      error: "invalid_ranked_match_slots"
    } satisfies import("@shared").SetRankedMatchSlotsPayload);
  }

  let user: nkruntime.User | undefined;
  try {
    const users = nk.usersGetId([userId]);
    user = users && users.length > 0 ? users[0] : undefined;
  } catch (error) {
    logger.error(
      "set_ranked_match_slots usersGetId failed: %s",
      (error && (error as Error).message) || String(error)
    );
    return JSON.stringify({
      error: "internal_error"
    } satisfies import("@shared").SetRankedMatchSlotsPayload);
  }

  if (!user) {
    return JSON.stringify({ error: "not_found" } satisfies import("@shared").SetRankedMatchSlotsPayload);
  }

  const metadata = asRecord(
    (user as unknown as { metadata?: unknown }).metadata
  );
  const zarka = asRecord(metadata?.zarka);
  const nextMetadata = {
    ...(metadata ?? {}),
    zarka: {
      ...(zarka ?? {}),
      rankedMatchSlots: slots
    }
  };

  try {
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
  } catch (error) {
    logger.error(
      "set_ranked_match_slots accountUpdateId failed for user %s: %s",
      userId,
      (error && (error as Error).message) || String(error)
    );
    return JSON.stringify({
      error: "internal_error"
    } satisfies import("@shared").SetRankedMatchSlotsPayload);
  }

  try {
    recordRankedSlotPreference(nk, userId, slots, Date.now());
  } catch (error) {
    logger.error(
      "set_ranked_match_slots queue enrollment failed for user %s: %s",
      userId,
      (error && (error as Error).message) || String(error)
    );
    return JSON.stringify({
      error: "internal_error"
    } satisfies import("@shared").SetRankedMatchSlotsPayload);
  }

  logger.info("set_ranked_match_slots success for user %s", userId);
  return JSON.stringify({
    ok: true,
    ranked_match_slots: slots
  } satisfies import("@shared").SetRankedMatchSlotsPayload);
}
