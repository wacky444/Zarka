import type { GameMap, MatchItemRecord, PlayerCharacter } from "@shared";
import type { MatchRecord } from "../models/types";

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
  return {
    ...match,
    map,
    items,
  };
}
