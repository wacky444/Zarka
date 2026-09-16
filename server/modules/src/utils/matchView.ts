import type {
  GameMap,
  MatchItemRecord,
  MatchRecord as SharedMatchRecord,
  PlayerCharacter,
  PlayerCharacterUnknown
} from "@shared";
import type { MatchRecord } from "../models/types";
import { axialDistance } from "./location";
import { isCharacterDead } from "./playerCharacter";

type DiscoveredItemLookup = Record<string, true>;

function buildDiscoveredItemLookup(
  character: PlayerCharacter | undefined | null
): DiscoveredItemLookup {
  const lookup: DiscoveredItemLookup = {};
  if (!character || !Array.isArray(character.discoveredItemIds)) {
    return lookup;
  }
  for (const entry of character.discoveredItemIds) {
    if (typeof entry !== "string" || entry.length === 0) {
      continue;
    }
    lookup[entry] = true;
  }
  return lookup;
}

function filterMapByDiscoveredLookup(
  map: GameMap | undefined,
  discovered: DiscoveredItemLookup
): GameMap | undefined {
  if (!map) {
    return undefined;
  }
  const tiles = Array.isArray(map.tiles)
    ? map.tiles.map((tile) => ({
        ...tile,
        itemIds: Array.isArray(tile.itemIds)
          ? tile.itemIds.filter((itemId) =>
              Object.prototype.hasOwnProperty.call(discovered, itemId)
            )
          : []
      }))
    : [];
  return {
    ...map,
    tiles
  };
}

function filterItemsByDiscoveredLookup(
  items: MatchItemRecord[] | undefined,
  discovered: DiscoveredItemLookup
): MatchItemRecord[] | undefined {
  if (!Array.isArray(items)) {
    return items;
  }
  if (items.length === 0) {
    return [];
  }
  if (Object.keys(discovered).length === 0) {
    return [];
  }
  const filtered = items.filter((item) =>
    Object.prototype.hasOwnProperty.call(discovered, item.item_id)
  );
  if (filtered.length === 0) {
    return [];
  }
  return filtered.map((item) => ({ ...item }));
}

function computeViewRange(
  character: PlayerCharacter | undefined | null
): number {
  const raw = character?.stats?.baseViewRange;
  if (typeof raw !== "number" || !isFinite(raw)) {
    return 0;
  }
  return Math.max(0, Math.floor(raw));
}

export function tailorPlayerCharactersForViewer(
  playerCharacters: Record<string, PlayerCharacter> | undefined,
  viewerId: string | undefined | null,
  viewAll = false
): Record<string, PlayerCharacter> | undefined {
  if (!playerCharacters) {
    return playerCharacters;
  }
  if (viewAll) {
    return { ...playerCharacters };
  }
  const viewerKey = typeof viewerId === "string" ? viewerId : "";
  if (!viewerKey) {
    return { ...playerCharacters };
  }
  const viewer = playerCharacters[viewerKey];
  if (!viewer) {
    return { ...playerCharacters };
  }
  const viewerCoord = viewer.position?.coord;
  const viewRange = computeViewRange(viewer);
  const filtered: Record<string, PlayerCharacter> = {};
  for (const id in playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(playerCharacters, id)) {
      continue;
    }
    const candidate = playerCharacters[id];
    if (id === viewerKey) {
      filtered[id] = candidate;
      continue;
    }
    if (!viewerCoord) {
      continue;
    }
    const candidateCoord = candidate?.position?.coord;
    if (!candidateCoord) {
      continue;
    }
    if (axialDistance(viewerCoord, candidateCoord) <= viewRange) {
      const isDead =
        isCharacterDead(candidate) ||
        (typeof candidate.stats?.health?.current === "number" &&
          candidate.stats.health.current <= 0);
      const isConfirmedTeammate =
        Array.isArray(viewer.relationships?.confirmedTeammates) &&
        viewer.relationships.confirmedTeammates.indexOf(id) !== -1;
      const sanitized = { ...candidate };
      delete sanitized.discoveredItemIds;
      delete sanitized.revealedItemTypesByPlayerId;
      if (!isDead && !isConfirmedTeammate && candidate.teamId !== undefined) {
        delete sanitized.teamId;
      }
      filtered[id] = sanitized;
    }
  }
  return filtered;
}

export function tailorMapForCharacter(
  map: GameMap | undefined,
  character: PlayerCharacter | undefined | null
): GameMap | undefined {
  const discovered = buildDiscoveredItemLookup(character);
  return filterMapByDiscoveredLookup(map, discovered);
}

export function tailorMatchItemsForCharacter(
  items: MatchItemRecord[] | undefined,
  character: PlayerCharacter | undefined | null
): MatchItemRecord[] | undefined {
  const discovered = buildDiscoveredItemLookup(character);
  return filterItemsByDiscoveredLookup(items, discovered);
}

export function tailorMatchForPlayer(
  match: MatchRecord,
  playerId: string | undefined | null,
  viewAll = false
): SharedMatchRecord {
  const character =
    playerId && match.playerCharacters
      ? match.playerCharacters[playerId]
      : undefined;
  const discovered = buildDiscoveredItemLookup(character);
  const map = viewAll
    ? match.map
    : filterMapByDiscoveredLookup(match.map, discovered);
  const items = viewAll
    ? match.items
    : filterItemsByDiscoveredLookup(match.items, discovered);
  const playerCharacters = tailorPlayerCharactersForViewer(
    match.playerCharacters,
    playerId,
    viewAll
  );
  const playerList: Record<string, PlayerCharacterUnknown> = {};
  const deadCharacters: Record<string, boolean> = {};
  for (const id in match.playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(match.playerCharacters, id)) {
      continue;
    }
    const char = match.playerCharacters[id];
    playerList[id] = {
      id: char.id,
      name: char.name
    };
    const isDead =
      isCharacterDead(char) ||
      (typeof char.stats?.health?.current === "number" &&
        char.stats.health.current <= 0);
    deadCharacters[id] = !!isDead;
  }
  const teamCounts: Record<string, number> = {};
  if (Array.isArray(match.teams)) {
    for (const teamName of match.teams) {
      teamCounts[teamName] = 0;
    }
  }
  for (const id in match.playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(match.playerCharacters, id)) {
      continue;
    }
    const char = match.playerCharacters[id];
    const isDead =
      isCharacterDead(char) ||
      (typeof char.stats?.health?.current === "number" &&
        char.stats.health.current <= 0);
    if (!isDead) {
      if (char.teamId) {
        teamCounts[char.teamId] = (teamCounts[char.teamId] ?? 0) + 1;
      }
      if (char.secretTeamId) {
        teamCounts[char.secretTeamId] = (teamCounts[char.secretTeamId] ?? 0) + 1;
      }
    }
  }
  const publicMatch = { ...match };
  delete publicMatch.reportProgress;
  return {
    ...publicMatch,
    playerCharacters: playerCharacters ?? {},
    playerList: playerList ?? {},
    deadCharacters,
    teams: match.teams ? [...match.teams] : Object.keys(teamCounts),
    teamCounts,
    map,
    items
  };
}
