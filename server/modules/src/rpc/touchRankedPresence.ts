/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  isRankedPresenceUserId,
  touchRankedPresence
} from "../services/rankedPresence";
import { hasTutorialCompleted } from "../utils/tutorialProfile";

export function touchRankedPresenceRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string
): string {
  const userId = ctx?.userId;
  if (!userId) {
    return JSON.stringify({ error: "unauthorized" } satisfies import("@shared").TouchRankedPresencePayload);
  }
  if (!isRankedPresenceUserId(userId) || !hasTutorialCompleted(nk, userId, logger)) {
    return JSON.stringify({ error: "ineligible" } satisfies import("@shared").TouchRankedPresencePayload);
  }

  try {
    touchRankedPresence(nk, userId, Date.now());
  } catch (error) {
    logger.error(
      "touch_ranked_presence storage write failed: %s",
      (error && (error as Error).message) || String(error)
    );
    return JSON.stringify({ error: "internal_error" } satisfies import("@shared").TouchRankedPresencePayload);
  }

  return JSON.stringify({ ok: true } satisfies import("@shared").TouchRankedPresencePayload);
}
