/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { MAX_MAX_CURRENT_MATCHES, MIN_MAX_CURRENT_MATCHES } from "@shared";
import { updateAccountMetadata } from "../services/accountMetadata";

type RecordValue = Record<string, unknown>;
const asRecord = (value: unknown): RecordValue | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : undefined;

export function setMaxCurrentMatchesRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx?.userId) return JSON.stringify({ error: "unauthorized" } satisfies import("@shared").SetMaxCurrentMatchesPayload);
  let request: RecordValue | undefined;
  try { request = asRecord(JSON.parse(payload)); } catch { return JSON.stringify({ error: "bad_json" } satisfies import("@shared").SetMaxCurrentMatchesPayload); }
  const maximum = request?.max_current_matches;
  if (typeof maximum !== "number" || !Number.isSafeInteger(maximum) || maximum < MIN_MAX_CURRENT_MATCHES || maximum > MAX_MAX_CURRENT_MATCHES) {
    return JSON.stringify({ error: "invalid_max_current_matches" } satisfies import("@shared").SetMaxCurrentMatchesPayload);
  }
  const status = updateAccountMetadata(nk, ctx.userId, (metadata) => {
    const zarka = asRecord(metadata.zarka);
    return { ...metadata, zarka: { ...(zarka ?? {}), maxCurrentMatches: maximum } };
  }, undefined, Date.now(), logger);
  if (status !== "updated") return JSON.stringify({ error: status === "busy" ? "account_update_busy" : "not_found" } satisfies import("@shared").SetMaxCurrentMatchesPayload);
  return JSON.stringify({ ok: true, max_current_matches: maximum } satisfies import("@shared").SetMaxCurrentMatchesPayload);
}
