/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import type {
  MatchRecord,
  PlayerCharacter,
  PlayerCharacterUnknown
} from "@shared";

export function createDefaultCharacter(userId: string): PlayerCharacter {
  return {
    id: userId,
    name: userId,
    stats: {
      health: {
        current: 10,
        max: 12,
        knockoutThreshold: 5,
        injuredMax: 5
      },
      energy: {
        current: 10,
        max: 20
      },
      load: {
        current: 0,
        max: 25
      },
      speed: 0,
      sympathy: 0,
      baseViewRange: 0
    },
    progression: {
      level: 1,
      experience: 0,
      experienceForNextLevel: 10,
      availableSkillPoints: 10,
      spentSkillPoints: 0
    },
    economy: {
      zarkans: 3,
      pendingZarkans: 0,
      incomeInterval: 1
    },
    inventory: {
      carriedItems: [
        {
          itemId: "food",
          quantity: 1,
          weight: 3
        }
      ],
      stash: []
    },
    abilities: [],
    relationships: {
      confirmedTeammates: [],
      alliances: [],
      representatives: []
    },
    statuses: {
      conditions: []
    },
    foundItems: []
  };
}

export function ensurePlayerCharacter(
  match: MatchRecord,
  userId: string
): PlayerCharacter | PlayerCharacterUnknown {
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

function radialDistance(
  tile: SpawnTile,
  centerQ: number,
  centerR: number
): number {
  const dq = tile.coord.q - centerQ;
  const dr = tile.coord.r - centerR;
  return Math.sqrt(dq * dq + dr * dr);
}

function buildSpawnGroupSizes(playerCount: number): number[] {
  if (playerCount <= 0) {
    return [];
  }
  if (playerCount <= 3) {
    const sizes: number[] = [];
    for (let index = 0; index < playerCount; index += 1) {
      sizes.push(1);
    }
    return sizes;
  }

  const preferredSize = playerCount <= 4 ? 2 : playerCount <= 12 ? 3 : 4;
  const groupCount = Math.ceil(playerCount / preferredSize);
  const baseSize = Math.floor(playerCount / groupCount);
  const remainder = playerCount % groupCount;
  const sizes: number[] = [];
  for (let index = 0; index < groupCount; index += 1) {
    sizes.push(baseSize + (index < remainder ? 1 : 0));
  }
  return sizes;
}

function buildSpawnPool(
  walkableTiles: SpawnTile[],
  cols: number,
  rows: number,
  playerCount: number,
  rng: RandomFn
): SpawnTile[] {
  if (walkableTiles.length === 0 || playerCount <= 0) {
    return [];
  }
  if (walkableTiles.length === 1) {
    const pool: SpawnTile[] = [];
    for (let index = 0; index < playerCount; index += 1) {
      pool.push(walkableTiles[0]);
    }
    return pool;
  }

  const safeCols = cols > 0 ? cols : 1;
  const safeRows = rows > 0 ? rows : 1;
  const centerQ = (safeCols - 1) / 2;
  const centerR = (safeRows - 1) / 2;
  const groupSizes = buildSpawnGroupSizes(playerCount);
  const remaining = walkableTiles.slice();
  const ordered: SpawnTile[] = [];
  const randomTieBreakers: Record<string, number> = {};
  for (const tile of remaining) {
    randomTieBreakers[tile.id] = rng();
  }

  const takeNearest = (
    targetQ: number,
    targetR: number,
    preferNearCenter: boolean
  ): SpawnTile | undefined => {
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const distance = distanceSquared(candidate, targetQ, targetR);
      const centerPenalty = preferNearCenter
        ? radialDistance(candidate, centerQ, centerR) * 0.05
        : 0;
      const score = distance + centerPenalty;
      const bestCandidate = bestIndex >= 0 ? remaining[bestIndex] : undefined;
      if (
        score < bestScore ||
        (score === bestScore &&
          bestCandidate &&
          randomTieBreakers[candidate.id] < randomTieBreakers[bestCandidate.id])
      ) {
        bestIndex = index;
        bestScore = score;
      }
    }
    if (bestIndex < 0) {
      return undefined;
    }
    const [selected] = remaining.splice(bestIndex, 1);
    return selected;
  };

  const anchors: SpawnTile[] = [];
  for (const groupSize of groupSizes) {
    const anchor =
      takeNearest(centerQ, centerR, true) ??
      (anchors.length > 0 ? anchors[0] : undefined);
    if (!anchor) {
      break;
    }
    anchors.push(anchor);
    for (let memberIndex = 0; memberIndex < groupSize; memberIndex += 1) {
      ordered.push(anchor);
    }
  }

  remaining.sort((left, right) => {
    const leftDistance = radialDistance(left, centerQ, centerR);
    const rightDistance = radialDistance(right, centerQ, centerR);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }
    return randomTieBreakers[left.id] - randomTieBreakers[right.id];
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

  for (const playerId of roster) {
    const character = match.playerCharacters?.[playerId];
    if (!character) {
      continue;
    }
    const position = character.position;
    if (!position || !tileMap[position.tileId]) {
      if (position) {
        character.position = undefined;
        mutated = true;
      }
    }
  }

  const nextSpawnTile = (): SpawnTile | undefined => pool.shift();

  for (const playerId of roster) {
    const character = match.playerCharacters?.[playerId];
    if (!character) {
      continue;
    }
    const position = character.position;
    if (
      position &&
      Object.prototype.hasOwnProperty.call(tileMap, position.tileId)
    ) {
      continue;
    }

    const tile = nextSpawnTile();
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
      coord: { ...tile.coord }
    };
    mutated = true;
  }

  return mutated;
}
