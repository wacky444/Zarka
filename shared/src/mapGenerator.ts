import {
  HexTile,
  LocalizationType,
  type CellLibraryDefinition,
  type CellType,
  type GameMap,
} from "./hexTile";

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

export function generateGameMap(
  cols: number,
  rows: number,
  library: CellLibraryDefinition,
  seed?: string
): GameMap {
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

  const tiles = [];
  let index = 0;
  for (let r = 0; r < height; r += 1) {
    for (let c = 0; c < width; c += 1) {
      const loc = allocation[index++] ?? allocation[0];
      const base = library[loc];
      const tile = new HexTile({ q: c, r }, base, {
        frame: base.sprite,
        walkable: base.walkable,
      });
      tiles.push(tile.toSnapshot());
    }
  }

  return {
    cols: width,
    rows: height,
    seed: finalSeed,
    tiles,
  };
}
