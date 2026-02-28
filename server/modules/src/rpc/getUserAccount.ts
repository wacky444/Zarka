/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  asNumber,
  clampNonNegativeInt,
  clampNonNegativeNumber,
} from "../utils/number";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseEpochMs(value: unknown): number | undefined {
  const n = asNumber(value);
  if (typeof n === "number") {
    return n;
  }

  const s = asString(value);
  if (!s) {
    return undefined;
  }

  const parsed = Date.parse(s);
  return isFinite(parsed) ? parsed : undefined;
}

function buildDefaultStats(): import("@shared").PlayerStats {
  return {
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    elo: 1000,
    highestElo: 1000,
    currentWinStreak: 0,
    bestWinStreak: 0,
    avgTurnsPerMatch: 0,
    rankTier: "unranked",
  };
}

function buildDefaultCosmetics(): import("@shared").UserCosmetics {
  return {
    selectedSkinId: {
      body: "body_human_white.png",
      shoes: "shoe_01.png",
      shirt: "shirt_001.png",
      hair: "hair_001.png",
      hat: "",
    },
    unlockedSkinIds: ["default"],
  };
}

function buildAccountFromUser(
  user: nkruntime.User,
): import("@shared").UserAccount {
  const userId =
    (user as unknown as { id?: string; userId?: string }).id ??
    (user as unknown as { id?: string; userId?: string }).userId ??
    "";

  const metadata = asRecord(
    (user as unknown as { metadata?: unknown }).metadata,
  );
  const zarka = asRecord(metadata?.zarka);

  const statsObj = asRecord(zarka?.stats);
  const cosmeticsObj = asRecord(zarka?.cosmetics);

  const defaultsStats = buildDefaultStats();
  const defaultsCosmetics = buildDefaultCosmetics();

  const stats: import("@shared").PlayerStats = {
    matchesPlayed: clampNonNegativeInt(
      statsObj?.matchesPlayed,
      defaultsStats.matchesPlayed,
    ),
    wins: clampNonNegativeInt(statsObj?.wins, defaultsStats.wins),
    losses: clampNonNegativeInt(statsObj?.losses, defaultsStats.losses),
    draws: clampNonNegativeInt(statsObj?.draws, defaultsStats.draws),
    elo: clampNonNegativeInt(statsObj?.elo, defaultsStats.elo),
    highestElo: clampNonNegativeInt(
      statsObj?.highestElo,
      defaultsStats.highestElo,
    ),
    currentWinStreak: clampNonNegativeInt(
      statsObj?.currentWinStreak,
      defaultsStats.currentWinStreak,
    ),
    bestWinStreak: clampNonNegativeInt(
      statsObj?.bestWinStreak,
      defaultsStats.bestWinStreak,
    ),
    avgTurnsPerMatch: clampNonNegativeNumber(
      statsObj?.avgTurnsPerMatch,
      defaultsStats.avgTurnsPerMatch ?? 0,
    ),
    rankTier:
      (asString(statsObj?.rankTier) as
        | import("@shared").UserRankTier
        | undefined) ?? defaultsStats.rankTier,
    lastMatchEndedAtMs: parseEpochMs(statsObj?.lastMatchEndedAtMs),
  };

  const skinObj = asRecord(cosmeticsObj?.selectedSkinId);
  const defaultSkin = defaultsCosmetics.selectedSkinId;
  const selectedSkinId: import("@shared").Skin = {
    body: asString(skinObj?.body) ?? defaultSkin.body,
    shoes: asString(skinObj?.shoes) ?? defaultSkin.shoes,
    shirt: asString(skinObj?.shirt) ?? defaultSkin.shirt,
    hair: asString(skinObj?.hair) ?? defaultSkin.hair,
    hat: asString(skinObj?.hat) ?? defaultSkin.hat,
  };
  const unlockedSkinIdsRaw = cosmeticsObj?.unlockedSkinIds;
  const unlockedSkinIds = Array.isArray(unlockedSkinIdsRaw)
    ? unlockedSkinIdsRaw.filter((x): x is string => typeof x === "string")
    : defaultsCosmetics.unlockedSkinIds;

  const cosmetics: import("@shared").UserCosmetics = {
    selectedSkinId,
    unlockedSkinIds,
    unlockedCosmeticIds: Array.isArray(cosmeticsObj?.unlockedCosmeticIds)
      ? cosmeticsObj.unlockedCosmeticIds.filter(
          (x): x is string => typeof x === "string",
        )
      : undefined,
  };

  const createdAtMs = parseEpochMs(
    (user as unknown as { createTime?: unknown }).createTime,
  );
  const updatedAtMs = parseEpochMs(
    (user as unknown as { updateTime?: unknown }).updateTime,
  );

  return {
    userId,
    username: user.username,
    displayName: user.displayName || undefined,
    avatarUrl: user.avatarUrl || undefined,
    langTag: user.langTag || undefined,
    location: user.location || undefined,
    timezone: user.timezone || undefined,
    stats,
    cosmetics,
    createdAtMs,
    updatedAtMs,
  };
}

export function getUserAccountRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  let requestedUserId: string | undefined;
  if (payload && payload !== "") {
    try {
      const json = JSON.parse(payload) as { user_id?: unknown };
      requestedUserId = asString(json.user_id);
    } catch {
      return JSON.stringify({
        error: "bad_json",
      } satisfies import("@shared").GetUserAccountPayload);
    }
  }

  const callerUserId = ctx?.userId;
  if (!callerUserId) {
    return JSON.stringify({
      error: "unauthorized",
    } satisfies import("@shared").GetUserAccountPayload);
  }

  const userId = requestedUserId ?? callerUserId;
  if (userId !== callerUserId) {
    return JSON.stringify({
      error: "forbidden",
    } satisfies import("@shared").GetUserAccountPayload);
  }

  let user: nkruntime.User | undefined;
  try {
    const users = nk.usersGetId([userId]);
    user = users && users.length > 0 ? users[0] : undefined;
  } catch (error) {
    logger.error(
      "get_user_account usersGetId failed: %s",
      (error && (error as Error).message) || String(error),
    );
    return JSON.stringify({
      error: "internal_error",
    } satisfies import("@shared").GetUserAccountPayload);
  }

  if (!user) {
    return JSON.stringify({
      error: "not_found",
    } satisfies import("@shared").GetUserAccountPayload);
  }

  const account = buildAccountFromUser(user);
  const response: import("@shared").GetUserAccountPayload = {
    ok: true,
    account,
  };

  return JSON.stringify(response);
}
