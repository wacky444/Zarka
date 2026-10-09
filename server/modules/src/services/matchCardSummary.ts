import {
  LocalizationType,
  RANKED_MATCH_METADATA_KEY,
  type MatchCardSummary,
  type MatchRecord,
  type MatchPreviewCell,
  type MyMatchCardSummary
} from "@shared";
import { getNextAutoAdvanceAtMs } from "../utils/autoSkip";
import { isCharacterDead } from "../utils/playerCharacter";

function getMapPreviewCells(match: MatchRecord, currentTurn: number): MatchPreviewCell[] {
  const tiles = match.map?.tiles;
  if (!Array.isArray(tiles)) {
    return [];
  }
  const validTypes = Object.values(LocalizationType);
  return tiles.flatMap((tile) => {
    if (
      !tile ||
      !tile.coord ||
      !Number.isFinite(tile.coord.q) ||
      !Number.isFinite(tile.coord.r) ||
      !validTypes.includes(tile.localizationType)
    ) {
      return [];
    }
    const meta = tile.meta;
    const destructionTurn =
      typeof meta?.destructionTurn === "number" &&
      Number.isFinite(meta.destructionTurn)
        ? meta.destructionTurn
        : undefined;
    const destroyed =
      meta?.destroyed === true ||
      (destructionTurn !== undefined && destructionTurn <= currentTurn);
    const destructionState = destroyed
      ? "destroyed"
      : destructionTurn !== undefined
        ? "scheduled"
        : "safe";
    return [
      {
        coord: { q: tile.coord.q, r: tile.coord.r },
        localizationType: tile.localizationType,
        destructionState
      }
    ];
  });
}

function getPlayerIds(match: MatchRecord): string[] {
  if (!Array.isArray(match.players)) {
    return [];
  }
  return Array.from(
    new Set(
      match.players.filter(
        (playerId): playerId is string =>
          typeof playerId === "string" && playerId.trim().length > 0
      )
    )
  );
}

function getAlivePlayerCount(
  match: MatchRecord,
  playerIds: string[],
  totalPlayers: number
): number {
  const characters = match.playerCharacters;
  if (!characters || Object.keys(characters).length === 0) {
    return match.started ? totalPlayers : 0;
  }
  return playerIds.reduce(
    (alivePlayers, playerId) =>
      alivePlayers + (isCharacterDead(characters[playerId]) ? 0 : 1),
    0
  );
}

export function buildMatchCardSummary(
  match: MatchRecord,
  nowMs = Date.now()
): MatchCardSummary {
  const currentTurn =
    typeof match.current_turn === "number" && Number.isFinite(match.current_turn)
      ? Math.max(0, Math.floor(match.current_turn))
      : 0;
  const playerIds = getPlayerIds(match);
  const joinedPlayers = playerIds.length;
  const removed = match.removed !== undefined && match.removed !== 0;
  const status = removed
    ? "finished"
    : match.started === true
      ? "in_progress"
      : "waiting";
  const totalPlayers = joinedPlayers;
  const nextAdvanceAtMs =
    status === "in_progress"
      ? getNextAutoAdvanceAtMs(
          {
            stateRoundTime: match.roundTime,
            matchRoundTime: match.roundTime,
            stateAutoSkip: match.autoSkip !== false,
            matchAutoSkip: match.autoSkip,
            currentTurn,
            startedAtSeconds: match.started_at,
            lastAutoAdvanceAtSeconds: match.lastAutoAdvanceAt
          },
          nowMs
        ) ?? null
      : null;
  const timeStatus =
    status === "finished"
      ? "finished"
      : status === "waiting"
        ? "not_started"
        : nextAdvanceAtMs === null
          ? "manual"
          : "scheduled";
  const size =
    typeof match.size === "number" && Number.isFinite(match.size)
      ? Math.max(0, Math.floor(match.size))
      : 0;

  return {
    match_id: match.match_id,
    runtime_match_id: match.runtime_match_id ?? match.match_id,
    name: typeof match.name === "string" ? match.name : undefined,
    status,
    isRanked: Boolean(match.metadata?.[RANKED_MATCH_METADATA_KEY]),
    size,
    joinedPlayers,
    totalPlayers,
    alivePlayers: getAlivePlayerCount(match, playerIds, totalPlayers),
    currentTurn,
    nextAdvanceAtMs,
    timeStatus,
    mapPreviewCells: getMapPreviewCells(match, currentTurn)
  };
}

export function buildMyMatchCardSummary(
  match: MatchRecord,
  currentUserId: string,
  nowMs = Date.now()
): MyMatchCardSummary {
  return {
    ...buildMatchCardSummary(match, nowMs),
    players: Array.isArray(match.players) ? [...match.players] : [],
    current_turn:
      typeof match.current_turn === "number" && Number.isFinite(match.current_turn)
        ? Math.max(0, Math.floor(match.current_turn))
        : 0,
    created_at:
      typeof match.created_at === "number" && Number.isFinite(match.created_at)
        ? match.created_at
        : 0,
    creator: match.creator,
    cols: match.cols,
    rows: match.rows,
    roundTime: match.roundTime,
    autoSkip: match.autoSkip,
    botPlayers: match.botPlayers,
    turnsToBeAt1Tile: match.turnsToBeAt1Tile,
    started: match.started === true,
    currentUserReady: match.readyStates?.[currentUserId] === true
  };
}
