import type { GameMap, MatchItemRecord, PlayerCharacter } from "@shared";
import type { MatchRecord } from "../models/types";
import { axialDistance } from "./location";

type FoundLookup = Record<string, true>;

function buildFoundItemLookup(
  character: PlayerCharacter | undefined | null
): FoundLookup {
  const lookup: FoundLookup = {};
  if (!character || !Array.isArray(character.foundItems)) {
    return lookup;
  }
  for (const entry of character.foundItems) {
    if (typeof entry !== "string" || entry.length === 0) {
      continue;
    }
    lookup[entry] = true;
  }
  return lookup;
}

function filterMapByFoundLookup(
  map: GameMap | undefined,
  found: FoundLookup
): GameMap | undefined {
  if (!map) {
    return undefined;
  }
  const tiles = Array.isArray(map.tiles)
    ? map.tiles.map((tile) => ({
        ...tile,
        itemIds: Array.isArray(tile.itemIds)
          ? tile.itemIds.filter((itemId) =>
              Object.prototype.hasOwnProperty.call(found, itemId)
            )
          : [],
      }))
    : [];
  return {
    ...map,
    tiles,
  };
}

function filterItemsByFoundLookup(
  items: MatchItemRecord[] | undefined,
  found: FoundLookup
): MatchItemRecord[] | undefined {
  if (!Array.isArray(items)) {
    return items;
  }
  if (items.length === 0) {
    return [];
  }
  if (Object.keys(found).length === 0) {
    return [];
  }
  const filtered = items.filter((item) =>
    Object.prototype.hasOwnProperty.call(found, item.item_id)
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
  viewerId: string | undefined | null
): Record<string, PlayerCharacter> | undefined {
  if (!playerCharacters) {
    return playerCharacters;
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
      filtered[id] = candidate;
    }
  }
  return filtered;
}

export function tailorMapForCharacter(
  map: GameMap | undefined,
  character: PlayerCharacter | undefined | null
): GameMap | undefined {
  const found = buildFoundItemLookup(character);
  return filterMapByFoundLookup(map, found);
}

export function tailorMatchItemsForCharacter(
  items: MatchItemRecord[] | undefined,
  character: PlayerCharacter | undefined | null
): MatchItemRecord[] | undefined {
  const found = buildFoundItemLookup(character);
  return filterItemsByFoundLookup(items, found);
}

export function tailorMatchForPlayer(
  match: MatchRecord,
  playerId: string | undefined | null
): MatchRecord {
  const character =
    playerId && match.playerCharacters
      ? match.playerCharacters[playerId]
      : undefined;
  const found = buildFoundItemLookup(character);
  const map = filterMapByFoundLookup(match.map, found);
  const items = filterItemsByFoundLookup(match.items, found);
  const playerCharacters = tailorPlayerCharactersForViewer(
    match.playerCharacters,
    playerId
  );
  return {
    ...match,
    playerCharacters: playerCharacters ?? {},
    map,
    items,
  };
}
