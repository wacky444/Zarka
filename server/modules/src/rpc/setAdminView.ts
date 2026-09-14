/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { isAdminUser } from "../utils/admin";
import { makeNakamaError } from "../utils/errors";
import { getRuntimeMatchId } from "../utils/matchIds";

export function setAdminViewRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId || !isAdminUser(nk, ctx.userId)) {
    throw makeNakamaError("admin_required", nkruntime.Codes.PERMISSION_DENIED);
  }

  let json: { match_id?: unknown; enabled?: unknown };
  try {
    json = JSON.parse(payload || "{}") as {
      match_id?: unknown;
      enabled?: unknown;
    };
  } catch {
    throw makeNakamaError("bad_json", nkruntime.Codes.INVALID_ARGUMENT);
  }

  const matchId = typeof json.match_id === "string" ? json.match_id : "";
  if (!matchId) {
    throw makeNakamaError(
      "match_id required",
      nkruntime.Codes.INVALID_ARGUMENT
    );
  }

  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);
  const stored = storage.getMatch(matchId);
  if (!stored) {
    throw makeNakamaError("not_found", nkruntime.Codes.NOT_FOUND);
  }

  try {
    nkWrapper.matchSignal(
      getRuntimeMatchId(stored.match),
      JSON.stringify({
        type: "set_admin_view",
        user_id: ctx.userId,
        enabled: json.enabled === true
      })
    );
  } catch (error) {
    logger.warn(
      "set_admin_view signal failed: %s",
      (error as Error).message || String(error)
    );
    throw makeNakamaError("match_unavailable", nkruntime.Codes.NOT_FOUND);
  }

  return JSON.stringify({ ok: true, enabled: json.enabled === true });
}
