/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { generateGuestDisplayName } from "@shared";

export function afterAuthenticateDevice(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  data: nkruntime.Session,
  request: nkruntime.AuthenticateDeviceRequest
): void {
  try {
    if (!ctx.userId) return;

    let existingDisplayName: string | undefined;
    let hasEmail = false;

    if (typeof nk.accountGetId === "function") {
      const account = nk.accountGetId(ctx.userId);
      existingDisplayName = account?.user?.displayName;
      hasEmail = Boolean(account?.email && account.email.trim().length > 0);
    } else if (typeof nk.usersGetId === "function") {
      const user = nk.usersGetId([ctx.userId])?.[0];
      existingDisplayName = user?.displayName;
    }

    if (existingDisplayName && existingDisplayName.trim().length > 0) return;
    if (hasEmail) return;

    const guestDisplayName = generateGuestDisplayName();
    nk.accountUpdateId(ctx.userId, null, guestDisplayName);
    logger.info(
      "Assigned guest display name %s to user %s",
      guestDisplayName,
      ctx.userId
    );
  } catch (error) {
    logger.error(
      "Failed to assign guest display name for user %s: %s",
      ctx.userId,
      (error && (error as Error).message) || String(error)
    );
  }
}
