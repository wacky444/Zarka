import type { MatchRecord, Skin, UserAccount } from "@shared";
import { THEME } from "../ColorPalette";
import type { PlayerOption } from "../PlayerSelector";
import type { PlayerOptionSkinInfo } from "./PlayerOptionSkinCache";

export type ResolvePlayerOptionSprite = (
  playerId: string,
  accountSkin: Skin | null
) => PlayerOptionSkinInfo;

export function buildPlayerOptions(
  match: MatchRecord | null,
  usernames: Record<string, string>,
  currentUserId: string | null,
  accounts: ReadonlyMap<string, UserAccount>,
  resolveSprite: ResolvePlayerOptionSprite
): PlayerOption[] {
  if (!match?.playerList) {
    return [];
  }
  const viewer = currentUserId
    ? match.playerCharacters?.[currentUserId]
    : undefined;
  const viewerTeamId =
    viewer?.secretTeamId?.trim() || viewer?.teamId?.trim() || undefined;
  const confirmedTeammates = new Set(
    viewer?.relationships?.confirmedTeammates ?? []
  );
  const options: PlayerOption[] = [];
  const seen = new Set<string>();
  for (const id of Object.keys(match.playerList)) {
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const character = match.playerCharacters?.[id] ?? null;
    const account = accounts.get(id) ?? null;
    const accountDisplayName =
      typeof account?.displayName === "string" && account.displayName.trim()
        ? account.displayName.trim()
        : null;
    const baseName =
      accountDisplayName ?? usernames[id] ?? character?.name ?? id;
    const name = baseName.length > 0 ? baseName : id;
    const label = id === currentUserId ? `${name} (You)` : name;
    const revealedTeamId =
      match.revealedTeamsByPlayerId?.[id]?.trim() ||
      viewer?.revealedTeamIdsByPlayerId?.[id]?.trim();
    const knownTeamId = revealedTeamId || character?.teamId?.trim() || undefined;
    const labelColor =
      id === currentUserId ||
      confirmedTeammates.has(id) ||
      Boolean(viewerTeamId && knownTeamId && viewerTeamId === knownTeamId)
        ? THEME.colors.healthRecover
        : viewerTeamId && knownTeamId
          ? THEME.colors.healthDamage
          : THEME.colors.textPrimary;
    options.push({
      id,
      label,
      labelColor,
      name,
      ...resolveSprite(id, account?.cosmetics.selectedSkinId ?? null)
    });
  }
  return options;
}

export interface PlayerTargetOptionSets {
  main: PlayerOption[];
  secondary: PlayerOption[];
  extraSecondary: PlayerOption[];
}

export function buildPlayerTargetOptionSets(options: {
  match: MatchRecord | null;
  playerOptions: PlayerOption[];
  currentUserId: string | null;
  mainActionId: string | null;
  secondaryActionId: string | null;
  extraSecondaryActionId: string | null;
  mainAllowsSelf: boolean;
  secondaryAllowsSelf: boolean;
  extraSecondaryAllowsSelf: boolean;
}): PlayerTargetOptionSets {
  const buildForAction = (
    actionId: string | null,
    allowsSelf: boolean
  ): PlayerOption[] => {
    const targets = options.playerOptions.filter((option) => {
      const character = options.match?.playerCharacters?.[option.id];
      const isDead =
        options.match?.deadCharacters?.[option.id] === true ||
        character?.statuses?.conditions?.includes("dead") === true ||
        (typeof character?.stats?.health?.current === "number" &&
          character.stats.health.current <= 0);
      if (isDead && actionId !== "inspect") {
        return false;
      }
      return allowsSelf || option.id !== options.currentUserId;
    });
    targets.sort((a, b) => {
      const aVisible = options.match?.playerCharacters?.[a.id] !== undefined;
      const bVisible = options.match?.playerCharacters?.[b.id] !== undefined;
      return Number(!aVisible) - Number(!bVisible);
    });
    return targets.map((option) =>
      options.match?.playerCharacters?.[option.id] !== undefined
        ? option
        : { ...option, warning: "Not visible" }
    );
  };
  return {
    main: buildForAction(options.mainActionId, options.mainAllowsSelf),
    secondary: buildForAction(
      options.secondaryActionId,
      options.secondaryAllowsSelf
    ),
    extraSecondary: buildForAction(
      options.extraSecondaryActionId,
      options.extraSecondaryAllowsSelf
    )
  };
}
