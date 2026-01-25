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

export type UserCosmetics = {
  readonly selectedSkinId: SkinId;
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

  // Game-specific data (stored in Nakama user metadata under `metadata.zarka`).
  readonly stats: PlayerStats;
  readonly cosmetics: UserCosmetics;

  // Optional timestamps (epoch milliseconds).
  readonly createdAtMs?: number;
  readonly updatedAtMs?: number;
};
