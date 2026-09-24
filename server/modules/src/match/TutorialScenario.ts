import {
  CellLibrary,
  HexTile,
  LocalizationType,
  ShopLibrary,
  TUTORIAL_BOT_ID,
  TUTORIAL_BOT_NAME,
  TUTORIAL_CELL_COORDS,
  TUTORIAL_MATCH_METADATA_KEY,
  type Axial,
  type GameMap,
  type ItemId,
  type MatchItemRecord,
  type PlayerCharacter,
  type PlayerPlannedAction,
  type TutorialStepId
} from "@shared";
import type { MatchRecord } from "../models/types";
import { createDefaultCharacter } from "../utils/playerCharacter";

export { TUTORIAL_BOT_ID, TUTORIAL_BOT_NAME, TUTORIAL_CELL_COORDS };

const PLAYER_TEAM_ID = "tutorial-player";
const BOT_TEAM_ID = "tutorial-bot";
const TUTORIAL_MAP_COLS = 2;
const TUTORIAL_MAP_ROWS = 2;
const TUTORIAL_TURNS_TO_BE_AT_1_TILE = 30;
const TUTORIAL_DESTRUCTION_WARNING_TURN = 5;
const TUTORIAL_DESTRUCTION_TURN = 6;
const TUTORIAL_STARTING_HEALTH = 12;
const TUTORIAL_STARTING_ENERGY = 20;
const TUTORIAL_STARTING_SKILL_POINTS = 5;

type TutorialItemPlacement = {
  itemType: ItemId;
  coord: Axial;
};

const TUTORIAL_ITEM_PLACEMENTS: readonly TutorialItemPlacement[] = [
  { itemType: "bandage", coord: TUTORIAL_CELL_COORDS.playerStart },
  { itemType: "axe", coord: TUTORIAL_CELL_COORDS.playerStart },
  { itemType: "food", coord: TUTORIAL_CELL_COORDS.playerStart }
];

export interface CreateTutorialMatchOptions {
  matchId: string;
  playerId: string;
  createdAt: number;
  runtimeMatchId?: string;
}

function createTutorialTile(
  coord: Axial,
  itemIds: string[] = [],
  meta?: Record<string, unknown>
) {
  return new HexTile(
    { q: coord.q, r: coord.r },
    CellLibrary[LocalizationType.Path],
    {
      id: `hex_${coord.q}_${coord.r}`,
      itemIds,
      meta
    }
  ).toSnapshot();
}

function createTutorialMap(matchId: string): {
  map: GameMap;
  items: MatchItemRecord[];
} {
  const items: MatchItemRecord[] = [];
  const itemIdsByCoord: Record<string, string[]> = {};
  for (const placement of TUTORIAL_ITEM_PLACEMENTS) {
    const itemId = `tutorial_${matchId}_${placement.itemType}`;
    items.push({ item_id: itemId, item_type: placement.itemType });
    const key = `${placement.coord.q}:${placement.coord.r}`;
    const tileItemIds = itemIdsByCoord[key] ?? [];
    tileItemIds.push(itemId);
    itemIdsByCoord[key] = tileItemIds;
  }
  const itemIdsAt = (coord: Axial) =>
    itemIdsByCoord[`${coord.q}:${coord.r}`] ?? [];
  const map: GameMap = {
    cols: TUTORIAL_MAP_COLS,
    rows: TUTORIAL_MAP_ROWS,
    seed: `tutorial:${matchId}`,
    tiles: [
      createTutorialTile(
        TUTORIAL_CELL_COORDS.playerStart,
        itemIdsAt(TUTORIAL_CELL_COORDS.playerStart)
      ),
      createTutorialTile(TUTORIAL_CELL_COORDS.botStart),
      createTutorialTile(TUTORIAL_CELL_COORDS.doomed, [], {
        warningTurn: TUTORIAL_DESTRUCTION_WARNING_TURN,
        destructionTurn: TUTORIAL_DESTRUCTION_TURN
      }),
      createTutorialTile(TUTORIAL_CELL_COORDS.spare)
    ]
  };
  return { map, items };
}

function createTutorialCharacter(
  playerId: string,
  name: string,
  teamId: string,
  coord: Axial,
  zarkans: number,
  skillPoints: number
): PlayerCharacter {
  const character = createDefaultCharacter(playerId);
  character.name = name;
  character.teamId = teamId;
  character.stats.health = {
    current: TUTORIAL_STARTING_HEALTH,
    max: TUTORIAL_STARTING_HEALTH,
    knockoutThreshold: 5,
    injuredMax: 5
  };
  character.stats.energy = {
    current: TUTORIAL_STARTING_ENERGY,
    max: TUTORIAL_STARTING_ENERGY
  };
  character.stats.load = { current: 0, max: 25 };
  character.progression.availableSkillPoints = skillPoints;
  character.economy = {
    zarkans,
    pendingZarkans: 0,
    incomeInterval: 1
  };
  character.inventory = { carriedItems: [], stash: [] };
  character.position = {
    tileId: `hex_${coord.q}_${coord.r}`,
    coord: { q: coord.q, r: coord.r }
  };
  character.discoveredItemIds = [];
  return character;
}

export function createTutorialMatch({
  matchId,
  playerId,
  createdAt,
  runtimeMatchId
}: CreateTutorialMatchOptions): MatchRecord {
  if (!matchId.trim() || !playerId.trim()) {
    throw new Error("Tutorial match and player IDs must not be empty");
  }
  if (!isFinite(createdAt)) {
    throw new Error("Tutorial match creation time must be finite");
  }

  const player = createTutorialCharacter(
    playerId,
    "Player",
    PLAYER_TEAM_ID,
    TUTORIAL_CELL_COORDS.playerStart,
    ShopLibrary.detective.cost,
    TUTORIAL_STARTING_SKILL_POINTS
  );
  const bot = createTutorialCharacter(
    TUTORIAL_BOT_ID,
    TUTORIAL_BOT_NAME,
    BOT_TEAM_ID,
    TUTORIAL_CELL_COORDS.botStart,
    0,
    0
  );
  const { map, items } = createTutorialMap(matchId);

  return {
    match_id: matchId,
    runtime_match_id: runtimeMatchId,
    players: [playerId],
    playerCharacters: {
      [playerId]: player,
      [TUTORIAL_BOT_ID]: bot
    },
    playerList: {
      [playerId]: { id: playerId, name: player.name },
      [TUTORIAL_BOT_ID]: { id: TUTORIAL_BOT_ID, name: bot.name }
    },
    readyStates: { [playerId]: false },
    size: 2,
    cols: TUTORIAL_MAP_COLS,
    rows: TUTORIAL_MAP_ROWS,
    roundTime: "23:00",
    autoSkip: false,
    botPlayers: 1,
    turnsToBeAt1Tile: TUTORIAL_TURNS_TO_BE_AT_1_TILE,
    created_at: createdAt,
    current_turn: 0,
    creator: playerId,
    name: "Tutorial",
    started: true,
    removed: 0,
    map,
    items,
    teams: [PLAYER_TEAM_ID, BOT_TEAM_ID],
    teamCounts: { [PLAYER_TEAM_ID]: 1, [BOT_TEAM_ID]: 1 },
    metadata: {
      [TUTORIAL_MATCH_METADATA_KEY]: {
        type: "guided_tutorial",
        version: 1
      }
    }
  };
}

export function getTutorialBotPlan(
  stepId: TutorialStepId,
  playerId: string
): PlayerPlannedAction | null {
  if (stepId === "feed_bot") {
    return {
      actionId: "move",
      targetLocationId: { ...TUTORIAL_CELL_COORDS.playerStart }
    };
  }
  if (stepId === "resolve_bot_scare") {
    return {
      actionId: "scare",
      extraExecutions: 1,
      targetPlayerIds: [playerId],
      targetLocationId: { ...TUTORIAL_CELL_COORDS.doomed }
    };
  }
  return null;
}
