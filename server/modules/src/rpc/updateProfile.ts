/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

type UpdateProfileRequest = {
  displayName?: unknown;
  avatarUrl?: unknown;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeOptionalText(value: unknown): string | undefined {
  const raw = asString(value);
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : "";
}

export function updateProfileRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  const callerUserId = ctx?.userId;
  if (!callerUserId) {
    return JSON.stringify({
      error: "unauthorized",
    } satisfies import("@shared").UpdateProfilePayload);
  }

  let parsed: UpdateProfileRequest | undefined;
  try {
    parsed = JSON.parse(payload) as UpdateProfileRequest;
  } catch {
    return JSON.stringify({
      error: "bad_json",
    } satisfies import("@shared").UpdateProfilePayload);
  }

  const displayName = normalizeOptionalText(parsed?.displayName);
  const avatarUrl = normalizeOptionalText(parsed?.avatarUrl);

  if (displayName === undefined && avatarUrl === undefined) {
    return JSON.stringify({
      error: "no_updates",
    } satisfies import("@shared").UpdateProfilePayload);
  }

  if (displayName && displayName.length > 32) {
    return JSON.stringify({
      error: "display_name_too_long",
    } satisfies import("@shared").UpdateProfilePayload);
  }

  try {
    nk.accountUpdateId(
      callerUserId,
      null,
      displayName === undefined ? null : displayName,
      avatarUrl === undefined ? null : avatarUrl,
      null,
      null,
      null,
      null,
    );
  } catch (error) {
    logger.error(
      "update_profile accountUpdateId failed for user %s: %s",
      callerUserId,
      (error && (error as Error).message) || String(error),
    );
    return JSON.stringify({
      error: "internal_error",
    } satisfies import("@shared").UpdateProfilePayload);
  }

  return JSON.stringify({
    ok: true,
    displayName: displayName === "" ? undefined : displayName,
    avatarUrl: avatarUrl === "" ? undefined : avatarUrl,
  } satisfies import("@shared").UpdateProfilePayload);
}
