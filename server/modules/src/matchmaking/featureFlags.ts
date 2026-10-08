/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

export const RANKED_MATCHMAKING_ENABLED_ENV = "RANKED_MATCHMAKING_ENABLED";

export function isRankedMatchmakingEnabled(
  ctx: nkruntime.Context | undefined
): boolean {
  return ctx?.env?.[RANKED_MATCHMAKING_ENABLED_ENV] === "true";
}
