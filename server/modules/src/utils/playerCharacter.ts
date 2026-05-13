/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord, PlayerCharacter } from "@shared";

export function createDefaultCharacter(userId: string): PlayerCharacter {
  return {
    id: userId,
    name: userId,
    stats: {
      health: {
        current: 10,
        max: 12,
        knockoutThreshold: 5,
        injuredMax: 5,
      },
      energy: {
        current: 10,
        max: 20,
      },
      load: {
        current: 14,
        max: 25,
      },
      speed: 0,
      sympathy: 0,
    },
    progression: {
      level: 1,
      experience: 0,
      experienceForNextLevel: 10,
      availableSkillPoints: 10,
      spentSkillPoints: 0,
    },
    economy: {
      zarkans: 3,
      pendingZarkans: 0,
      incomeInterval: 5,
    },
    inventory: {
      carriedItems: [
        {
          itemId: "food",
          quantity: 1,
          weight: 3,
        },
      ],
      stash: [],
    },
    abilities: [],
    relationships: {
      confirmedTeammates: [],
      alliances: [],
      representatives: [],
    },
    statuses: {
      conditions: [],
    },
    foundItems: [],
  };
}

export function ensurePlayerCharacter(
  match: MatchRecord,
  userId: string
): PlayerCharacter {
  if (!match.playerCharacters) {
    match.playerCharacters = {};
  }
  const existing = match.playerCharacters[userId];
  if (existing) {
    return existing;
  }
  const created = createDefaultCharacter(userId);
  match.playerCharacters[userId] = created;
  return created;
}

export function ensureAllPlayerCharacters(match: MatchRecord): boolean {
  let mutated = false;
  if (!match.playerCharacters) {
    match.playerCharacters = {};
    mutated = true;
  }

  const ensureId = (playerId: string) => {
    if (!match.playerCharacters[playerId]) {
      match.playerCharacters[playerId] = createDefaultCharacter(playerId);
      mutated = true;
    }
  };

  for (const playerId of match.players) {
    ensureId(playerId);
  }

  const totalBots =
    typeof match.botPlayers === "number" ? Math.max(0, match.botPlayers) : 0;
  for (let i = 1; i <= totalBots; i += 1) {
    ensureId(`bot${i}`);
  }

  return mutated;
}

export function isCharacterDead(
  character: PlayerCharacter | null | undefined
): boolean {
  const conditions = character?.statuses?.conditions;
  if (!Array.isArray(conditions)) {
    return false;
  }
  return conditions.indexOf("dead") !== -1;
}

export function isCharacterIncapacitated(
  character: PlayerCharacter | null | undefined
): boolean {
  if (!character) {
    return false;
  }
  if (isCharacterDead(character)) {
    return true;
  }
  const conditions = character.statuses?.conditions ?? [];
  return conditions.indexOf("unconscious") !== -1;
}

type RandomFn = () => number;
const TWO_PI = Math.PI * 2;
const SPAWN_RING_RADIUS_FACTOR = 3;

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

function createSeededRandom(seed: string): RandomFn {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

interface SpawnTile {
  id: string;
  coord: {
    q: number;
    r: number;
  };
}

function distanceSquared(
  tile: SpawnTile,
  targetQ: number,
  targetR: number
): number {
  const dq = tile.coord.q - targetQ;
  const dr = tile.coord.r - targetR;
  return dq * dq + dr * dr;
}

function radialDistance(tile: SpawnTile, centerQ: number, centerR: number): number {
  const dq = tile.coord.q - centerQ;
  const dr = tile.coord.r - centerR;
  return Math.sqrt(dq * dq + dr * dr);
}

function buildSpawnPool(
  walkableTiles: SpawnTile[],
  cols: number,
  rows: number,
  playerCount: number,
  rng: RandomFn
): SpawnTile[] {
  if (walkableTiles.length <= 1 || playerCount <= 0) {
    return walkableTiles.slice();
  }

  const safeCols = cols > 0 ? cols : 1;
  const safeRows = rows > 0 ? rows : 1;
  const centerQ = (safeCols - 1) / 2;
  const centerR = (safeRows - 1) / 2;
  const radius = Math.max(
    1,
    Math.min(safeCols, safeRows) / SPAWN_RING_RADIUS_FACTOR
  );
  const angleOffset = rng() * TWO_PI;
  const slots = Math.min(playerCount, walkableTiles.length);
  const remaining = walkableTiles.slice();
  const ordered: SpawnTile[] = [];

  for (let i = 0; i < slots; i += 1) {
    const angle = angleOffset + (i / slots) * TWO_PI;
    const targetQ = centerQ + Math.cos(angle) * radius;
    const targetR = centerR + Math.sin(angle) * radius;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const candidateDistance = distanceSquared(candidate, targetQ, targetR);
      if (
        candidateDistance < bestDistance ||
        (candidateDistance === bestDistance &&
          candidate.id < remaining[bestIndex].id)
      ) {
        bestDistance = candidateDistance;
        bestIndex = index;
      }
    }
    ordered.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }

  remaining.sort((left, right) => {
    const leftDelta = Math.abs(radialDistance(left, centerQ, centerR) - radius);
    const rightDelta = Math.abs(radialDistance(right, centerQ, centerR) - radius);
    if (leftDelta !== rightDelta) {
      return leftDelta - rightDelta;
    }
    return left.id.localeCompare(right.id);
  });

  return ordered.concat(remaining);
}

export function assignSpawnPositions(
  match: MatchRecord,
  logger: nkruntime.Logger
): boolean {
  const map = match.map;
  if (!map || !Array.isArray(map.tiles) || map.tiles.length === 0) {
    logger.warn(
      "assignSpawnPositions: missing map for match %s",
      match.match_id
    );
    return false;
  }

  let mutated = ensureAllPlayerCharacters(match);

  const totalBots =
    typeof match.botPlayers === "number" ? Math.max(0, match.botPlayers) : 0;
  const roster: string[] = [...match.players];
  for (let i = 1; i <= totalBots; i += 1) {
    roster.push(`bot${i}`);
  }

  const characterIds = match.playerCharacters
    ? Object.keys(match.playerCharacters)
    : [];
  for (const characterId of characterIds) {
    if (roster.indexOf(characterId) === -1) {
      roster.push(characterId);
    }
  }

  const walkableTiles = map.tiles.filter((tile) => tile.walkable);
  if (walkableTiles.length === 0) {
    logger.warn(
      "assignSpawnPositions: no walkable tiles available for match %s",
      match.match_id
    );
    return mutated;
  }

  const tileMap: Record<string, (typeof walkableTiles)[number]> = {};
  for (const tile of walkableTiles) {
    tileMap[tile.id] = tile;
  }

  const rng = createSeededRandom(`${map.seed}:${match.match_id}`);
  const pool = buildSpawnPool(
    walkableTiles,
    map.cols,
    map.rows,
    roster.length,
    rng
  );

  const used: Record<string, boolean> = {};

  for (const playerId of roster) {
    const character = match.playerCharacters?.[playerId];
    if (!character) {
      continue;
    }
    const position = character.position;
    if (!position) {
      continue;
    }
    const tile = tileMap[position.tileId];
    if (tile && !used[tile.id]) {
      used[tile.id] = true;
    } else {
      character.position = undefined;
      mutated = true;
    }
  }

  const nextAvailableTile = (): SpawnTile | undefined => {
    while (pool.length > 0) {
      const tile = pool.shift();
      if (tile && !used[tile.id]) {
        return tile;
      }
    }
    return undefined;
  };

  for (const playerId of roster) {
    const character = match.playerCharacters?.[playerId];
    if (!character) {
      continue;
    }
    const position = character.position;
    if (
      position &&
      Object.prototype.hasOwnProperty.call(tileMap, position.tileId) &&
      used[position.tileId]
    ) {
      continue;
    }
    if (
      position &&
      Object.prototype.hasOwnProperty.call(tileMap, position.tileId) &&
      !used[position.tileId]
    ) {
      used[position.tileId] = true;
      continue;
    }

    const tile = nextAvailableTile();
    if (!tile) {
      logger.warn(
        "assignSpawnPositions: insufficient spawn tiles for player %s in match %s",
        playerId,
        match.match_id
      );
      break;
    }

    character.position = {
      tileId: tile.id,
      coord: { ...tile.coord },
    };
    used[tile.id] = true;
    mutated = true;
  }

  return mutated;
}
