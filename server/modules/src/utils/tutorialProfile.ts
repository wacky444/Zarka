/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

export function isTutorialCompletedUser(
  user: nkruntime.User | undefined
): boolean {
  const metadata = asRecord(
    (user as unknown as { metadata?: unknown } | undefined)?.metadata
  );
  const zarka = asRecord(metadata?.zarka);
  return zarka?.tutorialCompleted === true;
}

export function hasTutorialCompleted(
  nk: nkruntime.Nakama,
  userId: string,
  logger: nkruntime.Logger
): boolean {
  try {
    const users = nk.usersGetId([userId]);
    const user = users && users.length > 0 ? users[0] : undefined;
    return isTutorialCompletedUser(user);
  } catch (error) {
    logger.error(
      "tutorial profile lookup failed for %s: %s",
      userId,
      (error && (error as Error).message) || String(error)
    );
    return false;
  }
}
