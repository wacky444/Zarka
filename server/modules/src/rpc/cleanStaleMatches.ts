/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  scanAndCleanStaleMatches,
  MatchCleanupOptions,
} from "../services/matchCleanupService";
import { isAdminUser } from "../utils/admin";
import { makeNakamaError } from "../utils/errors";

export function cleanStaleMatchesRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId || !isAdminUser(nk, ctx.userId)) {
    throw makeNakamaError("admin_required", nkruntime.Codes.PERMISSION_DENIED);
  }

  let parsed: Record<string, unknown> = {};
  if (payload && payload.trim().length > 0) {
    try {
      const decoded = JSON.parse(payload);
      if (
        typeof decoded === "object" &&
        decoded !== null &&
        !Array.isArray(decoded)
      ) {
        parsed = decoded as Record<string, unknown>;
      } else {
        throw new Error("Payload must be a JSON object");
      }
    } catch {
      throw makeNakamaError("bad_json", nkruntime.Codes.INVALID_ARGUMENT);
    }
  }

  const options: MatchCleanupOptions = {};
  if (typeof parsed.dryRun === "boolean") {
    options.dryRun = parsed.dryRun;
  }
  if (typeof parsed.inactiveMatchThresholdSec === "number") {
    options.inactiveMatchThresholdSec = parsed.inactiveMatchThresholdSec;
  }
  if (typeof parsed.inactiveLobbyThresholdSec === "number") {
    options.inactiveLobbyThresholdSec = parsed.inactiveLobbyThresholdSec;
  }
  if (typeof parsed.emptyLobbyThresholdSec === "number") {
    options.emptyLobbyThresholdSec = parsed.emptyLobbyThresholdSec;
  }
  if (typeof parsed.maxCandidatesPerRun === "number") {
    options.maxCandidatesPerRun = parsed.maxCandidatesPerRun;
  }
  if (typeof parsed.nowSeconds === "number") {
    options.nowSeconds = parsed.nowSeconds;
  }

  const result = scanAndCleanStaleMatches(nk, logger, options);
  return JSON.stringify({ ok: true, result });
}
