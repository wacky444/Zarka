/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

export function isAdminUser(
  nk: nkruntime.Nakama,
  userId: string | undefined | null
): boolean {
  if (!userId) {
    return false;
  }
  try {
    const user = nk.usersGetId([userId])?.[0] as
      | (nkruntime.User & { metadata?: unknown })
      | undefined;
    const metadata = asRecord(user?.metadata);
    const zarkaMetadata = asRecord(metadata?.zarka);
    return metadata?.admin === true || zarkaMetadata?.admin === true;
  } catch {
    return false;
  }
}
