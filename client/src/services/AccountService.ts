import type { Client, Session } from "@heroiclabs/nakama-js";
import { DEFAULT_SKIN } from "@shared";
import type { UserAccount, GetUserAccountPayload, UserRankTier } from "@shared";

type NakamaUserRaw = {
  id?: string;
  user_id?: string;
  username?: string;
  display_name?: string;
  metadata?: unknown;
};

function parseAccountFromRaw(raw: NakamaUserRaw): UserAccount | null {
  const userId = raw.user_id ?? raw.id;
  if (!userId) return null;

  let metadataObj: Record<string, unknown> | undefined;
  if (typeof raw.metadata === "string") {
    try {
      metadataObj = JSON.parse(raw.metadata);
    } catch {
      metadataObj = undefined;
    }
  } else if (raw.metadata && typeof raw.metadata === "object") {
    metadataObj = raw.metadata as Record<string, unknown>;
  }

  const zarka = metadataObj?.zarka as Record<string, unknown> | undefined;
  const cosmetics = zarka?.cosmetics as Record<string, unknown> | undefined;
  const statsObj = zarka?.stats as Record<string, unknown> | undefined;
  const skinRaw = cosmetics?.selectedSkinId as
    | Record<string, unknown>
    | undefined;

  const skin = skinRaw
    ? {
        body: (skinRaw.body as string) || DEFAULT_SKIN.body,
        shoes: (skinRaw.shoes as string) || DEFAULT_SKIN.shoes,
        shirt: (skinRaw.shirt as string) || DEFAULT_SKIN.shirt,
        hair: (skinRaw.hair as string) || DEFAULT_SKIN.hair,
        hat: (skinRaw.hat as string) || DEFAULT_SKIN.hat,
      }
    : DEFAULT_SKIN;

  const elo =
    typeof statsObj?.elo === "number" && isFinite(statsObj.elo)
      ? statsObj.elo
      : 1000;
  const highestElo =
    typeof statsObj?.highestElo === "number" && isFinite(statsObj.highestElo)
      ? statsObj.highestElo
      : Math.max(elo, 1000);

  return {
    userId,
    username: raw.username ?? userId,
    displayName: raw.display_name || undefined,
    tutorialCompleted: zarka?.tutorialCompleted === true,
    stats: {
      matchesPlayed:
        typeof statsObj?.matchesPlayed === "number"
          ? statsObj.matchesPlayed
          : 0,
      wins: typeof statsObj?.wins === "number" ? statsObj.wins : 0,
      losses: typeof statsObj?.losses === "number" ? statsObj.losses : 0,
      draws: typeof statsObj?.draws === "number" ? statsObj.draws : 0,
      elo,
      highestElo,
      currentWinStreak:
        typeof statsObj?.currentWinStreak === "number"
          ? statsObj.currentWinStreak
          : 0,
      bestWinStreak:
        typeof statsObj?.bestWinStreak === "number"
          ? statsObj.bestWinStreak
          : 0,
      rankTier: (statsObj?.rankTier as UserRankTier) ?? "unranked",
    },
    cosmetics: { selectedSkinId: skin },
  };
}

export class AccountService {
  private cache = new Map<string, UserAccount>();

  constructor(
    private client: Client,
    private session: Session,
  ) {}

  async getAccount(userId?: string): Promise<UserAccount | null> {
    const id = userId ?? this.session.user_id;
    if (!id) return null;

    const cached = this.cache.get(id);
    if (cached) return cached;

    try {
      const payload = userId ? { user_id: userId } : {};
      const rpcRes = await this.client.rpc(
        this.session,
        "get_user_account",
        payload,
      );
      const raw = (rpcRes as unknown as { payload?: unknown }).payload;
      const response = (typeof raw === "string" ? JSON.parse(raw) : raw) as
        | GetUserAccountPayload
        | undefined;
      if (response?.ok && response.account) {
        this.cache.set(id, response.account);
        return response.account;
      }
    } catch (e) {
      console.warn("AccountService.getAccount failed:", e);
    }
    return null;
  }

  async getAccounts(userIds: string[]): Promise<Map<string, UserAccount>> {
    const result = new Map<string, UserAccount>();
    if (userIds.length === 0) return result;

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const missing = userIds.filter((id) => !this.cache.has(id));
    for (const id of userIds) {
      const hit = this.cache.get(id);
      if (hit) result.set(id, hit);
    }

    const validIds = missing.filter((id) => uuidPattern.test(id));

    if (validIds.length > 0) {
      try {
        const response = await this.client.getUsers(this.session, validIds);
        const users = Array.isArray(response?.users)
          ? (response.users as NakamaUserRaw[])
          : [];
        for (const raw of users) {
          const account = parseAccountFromRaw(raw);
          if (account) {
            this.cache.set(account.userId, account);
            result.set(account.userId, account);
          }
        }
      } catch (e) {
        console.warn("AccountService.getAccounts failed:", e);
      }
    }

    return result;
  }

  getCached(userId: string): UserAccount | null {
    return this.cache.get(userId) ?? null;
  }

  setAccount(userId: string, account: UserAccount): void {
    this.cache.set(userId, account);
  }

  invalidate(userId?: string): void {
    if (userId) {
      this.cache.delete(userId);
    } else {
      this.cache.clear();
    }
  }
}
