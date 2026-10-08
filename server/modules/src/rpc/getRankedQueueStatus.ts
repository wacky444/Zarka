/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { getRankedQueueStatus } from "../services/rankedQueue";

export function getRankedQueueStatusRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  const userId = ctx?.userId;
  if (!userId) {
    return JSON.stringify({
      error: "unauthorized"
    } satisfies import("@shared").GetRankedQueueStatusPayload);
  }

  try {
    return JSON.stringify(getRankedQueueStatus(nk, userId));
  } catch (error) {
    logger.error(
      "get_ranked_queue_status failed for user %s: %s",
      userId,
      (error && (error as Error).message) || String(error)
    );
    return JSON.stringify({
      error: "internal_error"
    } satisfies import("@shared").GetRankedQueueStatusPayload);
  }
}
