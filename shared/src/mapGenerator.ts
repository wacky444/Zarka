import {
  HexTile,
  LocalizationType,
  axialDistance,
  type Axial,
  type CellLibraryDefinition,
  type CellType,
  type GameMap,
} from "./hexTile";
import type { MatchItemRecord } from "./match";

export const DEFAULT_MAP_COLS = 5;
export const DEFAULT_MAP_ROWS = 4;

function toDimension(value: number, fallback: number): number {
  if (typeof value !== "number" || !isFinite(value)) return fallback;
  const int = Math.floor(value);
  return int > 0 ? int : fallback;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

function createRng(seed: string) {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffleInPlace<T>(values: T[], rng: () => number): void {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = values[i];
    values[i] = values[j];
    values[j] = tmp;
  }
}

function nextType(
  entries: Array<[LocalizationType, CellType]>,
  counts: Record<string, number>,
  rng: () => number
): LocalizationType {
  const pool: Array<[LocalizationType, CellType]> = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const key = entry[0];
    const cell = entry[1];
    const max = typeof cell.numberMax === "number" ? cell.numberMax : -1;
    const current = counts[key] || 0;
    if (max < 0 || current < max) {
      pool.push(entry);
    }
  }
  const list = pool.length > 0 ? pool : entries;
  const size = list.length > 0 ? list.length : entries.length;
  const index = size > 0 ? Math.floor(rng() * size) : 0;
  const chosen = list[index] || entries[0];
  return chosen[0];
}

export interface GeneratedGameMap {
  map: GameMap;
  items: MatchItemRecord[];
}

export function assignShrinkScheduleToMap(
  map: GameMap,
  turnsToBeAt1Tile: number = 30
): void {
  const safeTurns = Math.max(1, Math.floor(turnsToBeAt1Tile));
  const cols = map.cols;
  const rows = map.rows;
  const total = map.tiles.length;
  if (total <= 1) {
    return;
  }

  const minCol = Math.floor((cols - 1) / 2);
  const maxCol = Math.ceil((cols - 1) / 2);
  const minRow = Math.floor((rows - 1) / 2);
  const maxRow = Math.ceil((rows - 1) / 2);

  const middles: Axial[] = [];
  for (let c = minCol; c <= maxCol; c++) {
    for (let r = minRow; r <= maxRow; r++) {
      middles.push({ q: c, r });
    }
  }

  const getMinDistToMiddle = (coord: Axial) => {
    let minD = Infinity;
    for (const m of middles) {
      const d = axialDistance(coord, m);
      if (d < minD) minD = d;
    }
    return minD;
  };

  const rng = createRng(map.seed + "_shrink");

  const centerCandidates = map.tiles.filter(
    (t) => getMinDistToMiddle(t.coord) === 0
  );
  const chosenCenter =
    centerCandidates.length > 0
      ? centerCandidates[Math.floor(rng() * centerCandidates.length)]
      : map.tiles[0];

  const destructibleTiles = map.tiles.filter((t) => t.id !== chosenCenter.id);

  const tileData = destructibleTiles.map((t) => ({
    tile: t,
    dist: getMinDistToMiddle(t.coord),
    rnd: rng(),
  }));

  tileData.sort((a, b) => {
    if (b.dist !== a.dist) {
      return b.dist - a.dist;
    }
    return a.rnd - b.rnd;
  });

  const waveInterval = 5;
  const numWaves = Math.max(1, Math.floor(safeTurns / waveInterval));
  const tilesToDestroy = tileData.length;

  const baseCount = Math.floor(tilesToDestroy / numWaves);
  const remainder = tilesToDestroy % numWaves;

  let currentIdx = 0;
  for (let wave = 1; wave <= numWaves; wave++) {
    const count = baseCount + (wave <= remainder ? 1 : 0);
    const destructionTurn = Math.min(safeTurns, wave * waveInterval);
    const warningTurn =
      wave === 1 ? 1 : Math.min(safeTurns, (wave - 1) * waveInterval);

    for (let i = 0; i < count && currentIdx < tileData.length; i++) {
      const targetTile = tileData[currentIdx].tile;
      targetTile.meta = targetTile.meta ?? {};
      targetTile.meta.destructionTurn = destructionTurn;
      targetTile.meta.warningTurn = warningTurn;
      currentIdx++;
    }
  }
}

export function generateGameMap(
  cols: number,
  rows: number,
  library: CellLibraryDefinition,
  seed?: string,
  turnsToBeAt1Tile: number = 30
): GeneratedGameMap {
  const width = toDimension(cols, DEFAULT_MAP_COLS);
  const height = toDimension(rows, DEFAULT_MAP_ROWS);
  const total = width * height;
  const finalSeed = seed && seed.length > 0 ? seed : Date.now().toString(36);
  const rng = createRng(finalSeed);
  const entries: Array<[LocalizationType, CellType]> = [];
  for (const key in library) {
    if (Object.prototype.hasOwnProperty.call(library, key)) {
      const typedKey = key as LocalizationType;
      entries.push([typedKey, library[typedKey]]);
    }
  }

  if (entries.length === 0) {
    throw new Error("Cell library is empty");
  }

  const counts: Record<string, number> = {};
  const allocation: LocalizationType[] = [];

  for (const [key, cell] of entries) {
    counts[key] = counts[key] || 0;
    const required = Math.max(
      0,
      Math.min(total - allocation.length, cell.numberMin ?? 0)
    );
    for (let i = 0; i < required; i += 1) {
      allocation.push(key);
      counts[key] = (counts[key] || 0) + 1;
    }
  }

  while (allocation.length < total) {
    const key = nextType(entries, counts, rng);
    allocation.push(key);
    counts[key] = (counts[key] || 0) + 1;
  }

  shuffleInPlace(allocation, rng);

  const tiles = [];
  const items: MatchItemRecord[] = [];
  let itemSequence = 0;
  let index = 0;
  for (let r = 0; r < height; r += 1) {
    for (let c = 0; c < width; c += 1) {
      const loc = allocation[index++] ?? allocation[0];
      const base = library[loc];
      const tileId = `hex_${c}_${r}`;
      const tileItemIds: string[] = [];
      const starting = Array.isArray(base.startingItems)
        ? base.startingItems
        : [];
      for (const stock of starting) {
        if (!stock) {
          continue;
        }
        const quantity = Math.max(0, Math.floor(stock.quantity ?? 0));
        for (let count = 0; count < quantity; count += 1) {
          const itemId = `itm_${finalSeed}_${itemSequence.toString(36)}`;
          itemSequence += 1;
          items.push({ item_id: itemId, item_type: stock.itemId });
          tileItemIds.push(itemId);
        }
      }
      const tile = new HexTile({ q: c, r }, base, {
        id: tileId,
        frame: base.sprite,
        walkable: base.walkable,
        itemIds: tileItemIds,
      });
      tiles.push(tile.toSnapshot());
    }
  }

  const mapResult: GameMap = {
    cols: width,
    rows: height,
    seed: finalSeed,
    tiles,
  };

  assignShrinkScheduleToMap(mapResult, turnsToBeAt1Tile);

  return {
    map: mapResult,
    items,
  };
}
