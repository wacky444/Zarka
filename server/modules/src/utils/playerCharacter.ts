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
        current: 0,
        max: 25,
      },
      speed: 0,
      sympathy: 0,
    },
    progression: {
      level: 1,
      experience: 0,
      experienceForNextLevel: 10,
      availableSkillPoints: 0,
      spentSkillPoints: 0,
    },
    economy: {
      zarkans: 3,
      pendingZarkans: 0,
      incomeInterval: 5,
    },
    inventory: {
      carriedItems: [],
      equippedItems: [],
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

function shuffleInPlace<T>(items: T[], rng: RandomFn): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
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
  const pool = walkableTiles.slice();
  shuffleInPlace(pool, rng);

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

  const nextAvailableTile = (): (typeof walkableTiles)[number] | undefined => {
    while (pool.length > 0) {
      const tile = pool.pop();
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
