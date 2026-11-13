import {
  axialDistance,
  isBot,
  type MatchRecord,
  type Skin,
  type UserAccount
} from "@shared";
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
    const listEntry = match.playerList[id];
    const baseName = isBot(id)
      ? (character?.name ?? listEntry?.name ?? usernames[id] ?? id)
      : (accountDisplayName ?? usernames[id] ?? character?.name ?? listEntry?.name ?? id);
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
      ...resolveSprite(
        id,
        character?.skin ??
          listEntry?.skin ??
          account?.cosmetics.selectedSkinId ??
          null
      )
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
  const isFirstTurn = (options.match?.current_turn ?? 0) === 0;
  const actorCoord = options.currentUserId
    ? options.match?.playerCharacters?.[options.currentUserId]?.position?.coord
    : undefined;

  const isVisibleTarget = (targetId: string): boolean => {
    const character = options.match?.playerCharacters?.[targetId];
    if (!character) {
      return false;
    }
    if (isFirstTurn) {
      if (options.currentUserId && targetId === options.currentUserId) {
        return true;
      }
      const targetCoord = character.position?.coord;
      if (!actorCoord || !targetCoord) {
        return false;
      }
      return axialDistance(actorCoord, targetCoord) === 0;
    }
    return true;
  };

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
      if (isDead && actionId !== "inspect" && actionId !== "steal") {
        return false;
      }
      return allowsSelf || option.id !== options.currentUserId;
    });
    targets.sort((a, b) => {
      const aVisible = isVisibleTarget(a.id);
      const bVisible = isVisibleTarget(b.id);
      return Number(!aVisible) - Number(!bVisible);
    });
    return targets.map((option) =>
      isVisibleTarget(option.id)
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
