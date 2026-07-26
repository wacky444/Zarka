/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { ActionLibrary } from "@shared";
import type {
  ActionDefinition,
  ReplayEvent,
  HexTileSnapshot,
  PlayerCharacter,
} from "@shared";
import type { MatchRecord } from "../models/types";
import { finalizeMatchIfEnded } from "./checkEndGame";
import { updateCooldownsForTurn } from "./actions/cooldowns";
import { executeAction, type TileLookup } from "./actionExecutor";

function sortedActions(): ActionDefinition[] {
  const keys = Object.keys(ActionLibrary) as Array<keyof typeof ActionLibrary>;
  const items: ActionDefinition[] = [];
  for (const key of keys) {
    items.push(ActionLibrary[key]);
  }
  items.sort((a, b) => {
    if (a.actionOrder === b.actionOrder) {
      return a.actionSubOrder - b.actionSubOrder;
    }
    return a.actionOrder - b.actionOrder;
  });
  return items;
}

function buildTileLookup(match: MatchRecord): TileLookup {
  const lookup: TileLookup = {};
  const tiles = match.map?.tiles;
  if (!Array.isArray(tiles)) {
    return lookup;
  }
  for (const tile of tiles) {
    if (!tile || typeof tile.id !== "string") {
      continue;
    }
    lookup[tile.id] = tile;
  }
  return lookup;
}

export interface AdvanceTurnResult {
  events: ReplayEvent[];
}

function activateTemporaryEnergy(match: MatchRecord): void {
  if (!match.playerCharacters) {
    return;
  }
  for (const playerId in match.playerCharacters) {
    if (
      !Object.prototype.hasOwnProperty.call(match.playerCharacters, playerId)
    ) {
      continue;
    }
    const character = match.playerCharacters[playerId];
    if (!character?.stats?.energy) {
      continue;
    }
    const energy = character.stats.energy as typeof character.stats.energy & {
      activeTemporary?: number;
    };
    const stored =
      typeof energy.temporary === "number" && energy.temporary > 0
        ? energy.temporary
        : 0;
    energy.activeTemporary = stored;
    energy.temporary = 0;
    match.playerCharacters[playerId] = character;
  }
}

function stripCondition(character: PlayerCharacter, condition: string): void {
  const statuses = character.statuses;
  if (!statuses?.conditions) {
    return;
  }

  const filtered = statuses.conditions.filter((c) => c !== condition);
  if (filtered.length === statuses.conditions.length) {
    return;
  }
  statuses.conditions = filtered;
}

function removeStateFromAllCharacters(
  match: MatchRecord,
  condition: string,
): void {
  if (!match.playerCharacters) {
    return;
  }
  for (const playerId in match.playerCharacters) {
    if (
      !Object.prototype.hasOwnProperty.call(match.playerCharacters, playerId)
    ) {
      continue;
    }
    const character = match.playerCharacters[playerId];
    if (!character) {
      continue;
    }
    stripCondition(character, condition);
    match.playerCharacters[playerId] = character;
  }
}

import { applyHealthDelta } from "./actions/utils";
import { isCharacterDead } from "../utils/playerCharacter";

export function advanceTurn(
  match: MatchRecord,
  resolvedTurn: number,
  logger: nkruntime.Logger,
  nk?: nkruntime.Nakama,
): AdvanceTurnResult {
  if (!Array.isArray(match.players) || !match.playerCharacters) {
    return { events: [] };
  }
  const characters = match.playerCharacters;
  if (Object.keys(characters).length === 0) {
    return { events: [] };
  }
  const tileLookup = buildTileLookup(match);
  activateTemporaryEnergy(match);
  removeStateFromAllCharacters(match, "protected");
  removeStateFromAllCharacters(match, "unconscious");
  updateCooldownsForTurn(match, resolvedTurn);
  const actions = sortedActions();
  const replayEvents: ReplayEvent[] = [];
  for (const action of actions) {
    const events = executeAction(
      match,
      action,
      resolvedTurn,
      tileLookup,
      logger,
    );
    if (events.length) {
      replayEvents.push(...events);
    }
  }
  // removeProtectedState(match);

  if (match.map?.tiles) {
    for (const tile of match.map.tiles) {
      if (tile.meta?.destructionTurn === resolvedTurn) {
        tile.meta.destroyed = true;
        tile.walkable = false;
        replayEvents.push({
          kind: "map",
          cell: tile.coord,
          action: "destroyed",
        });
      }
    }
  }

  for (const playerId in characters) {
    if (!Object.prototype.hasOwnProperty.call(characters, playerId)) {
      continue;
    }
    const character = characters[playerId];
    if (!character || isCharacterDead(character)) {
      continue;
    }
    const coord = character.position?.coord;
    if (!coord) {
      continue;
    }
    let standingTile: HexTileSnapshot | undefined;
    if (match.map?.tiles) {
      for (const t of match.map.tiles) {
        if (t.coord.q === coord.q && t.coord.r === coord.r) {
          standingTile = t;
          break;
        }
      }
    }
    if (
      standingTile &&
      (standingTile.meta?.destroyed === true ||
        (typeof standingTile.meta?.destructionTurn === "number" &&
          standingTile.meta.destructionTurn <= resolvedTurn))
    ) {
      const outcome = applyHealthDelta(character, -999, true, logger);
      match.playerCharacters[playerId] = outcome.character;
      replayEvents.push({
        kind: "player",
        actorId: character.id,
        action: {
          actionId: "status_dead",
        },
        targets: [
          {
            targetId: character.id,
            eliminated: true,
          },
        ],
      });
    }
  }

  if (nk) {
    finalizeMatchIfEnded(match, nk, logger);
  }
  return { events: replayEvents };
}
