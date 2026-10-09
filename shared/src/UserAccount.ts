export const DEFAULT_MAX_CURRENT_MATCHES = 10;

export function normalizeMaxCurrentMatches(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_MAX_CURRENT_MATCHES;
}

export type SkinId = string;

export type CosmeticUnlockId = string;

export type UserRankTier =
  | "unranked"
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond"
  | "master";

export type PlayerStats = {
  readonly matchesPlayed: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;

  // Rating
  readonly elo: number;
  readonly highestElo: number;

  readonly currentWinStreak: number;
  readonly bestWinStreak: number;

  // Optional convenience fields
  readonly rankTier?: UserRankTier;
  readonly lastMatchEndedAtMs?: number;
};

// body, shoes, shirt, hair, hat
export type Skin = {
  readonly body: SkinId;
  readonly shoes: SkinId;
  readonly shirt: SkinId;
  readonly hair: SkinId;
  readonly hat: SkinId;
};

export type UserCosmetics = {
  readonly selectedSkinId: Skin;
  readonly unlockedSkinIds?: readonly SkinId[];
  readonly unlockedCosmeticIds?: readonly CosmeticUnlockId[];
};

export type UserAccount = {
  // Nakama provides these fields
  readonly userId: string;
  readonly username: string;
  readonly displayName?: string;
  readonly avatarUrl?: string;

  // Basic Nakama profile fields
  readonly langTag?: string;
  readonly location?: string;
  readonly timezone?: string;
  readonly isAdmin?: boolean;

  // Game-specific data (stored in Nakama user metadata under `metadata.zarka`).
  readonly stats: PlayerStats;
  readonly cosmetics: UserCosmetics;
  // Present only on the self account RPC; public profile lookups omit it.
  readonly rankedMatchSlots?: number;
  readonly maxCurrentMatches?: number;
  readonly tutorialCompleted?: boolean;

  // Optional timestamps (epoch milliseconds).
  readonly createdAtMs?: number;
  readonly updatedAtMs?: number;
};
