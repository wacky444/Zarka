/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { updateAccountMetadata } from "../services/accountMetadata";
import { createRankedSlotPreferenceWrite } from "../services/rankedQueue";

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

  const nowMs = Date.now();
  let status: ReturnType<typeof updateAccountMetadata>;
  try {
    status = updateAccountMetadata(
      nk,
      userId,
      (metadata) => {
        const zarka = asRecord(metadata.zarka);
        return {
          ...metadata,
          zarka: {
            ...(zarka ?? {}),
            rankedMatchSlots: slots
          }
        };
      },
      () => [createRankedSlotPreferenceWrite(nk, userId, slots, nowMs)],
      nowMs,
      logger
    );
  } catch (error) {
    logger.error(
      "set_ranked_match_slots atomic update failed for user %s: %s",
      userId,
      (error && (error as Error).message) || String(error)
    );
    return JSON.stringify({
      error: "internal_error"
    } satisfies import("@shared").SetRankedMatchSlotsPayload);
  }

  if (status === "not_found") {
    return JSON.stringify({ error: "not_found" } satisfies import("@shared").SetRankedMatchSlotsPayload);
  }
  if (status === "busy") {
    logger.warn("set_ranked_match_slots account update busy for user %s", userId);
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
