/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { ActionLibrary, getSkillEffectTotal } from "@shared";
import type {
  ActionDefinition,
  ActionId,
  ReplayEvent,
  HexTileSnapshot,
  PlayerCharacter,
} from "@shared";
import type { MatchRecord } from "../models/types";
import { finalizeMatchIfEnded } from "./checkEndGame";
import { recordMatchReportProgress } from "./matchReport";
import { updateCooldownsForTurn } from "./actions/cooldowns";
import { executeAction, type TileLookup } from "./actionExecutor";
import { applyHealthDelta } from "./actions/utils";
import { isCharacterDead } from "../utils/playerCharacter";

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

function applyZarkanIncome(
  match: MatchRecord,
  replayEvents: ReplayEvent[],
): void {
  if (!match.playerCharacters) {
    return;
  }
  for (const playerId in match.playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(match.playerCharacters, playerId)) {
      continue;
    }
    const character = match.playerCharacters[playerId];
    if (!character || isCharacterDead(character)) {
      continue;
    }
    const skillIncome = getSkillEffectTotal(
      character,
      "daily_zarkan_income",
    );
    if (!character.economy) {
      character.economy = {
        zarkans: 0,
        pendingZarkans: 0,
        incomeInterval: 1,
      };
    }
    const current =
      typeof character.economy.zarkans === "number" &&
      isFinite(character.economy.zarkans)
        ? character.economy.zarkans
        : 0;
    const income = 1 + Math.max(0, skillIncome);
    character.economy.zarkans = current + income;
    character.economy.incomeInterval = 1;
    replayEvents.push({
      kind: "player",
      actorId: playerId,
      action: {
        actionId: "zarkan_income" as ActionId,
        metadata: {
          zarkansReceived: income,
          daily: true,
        },
      },
    });
  }
}

function applyPendingZarkanPayout(match: MatchRecord): void {
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
    if (!character || isCharacterDead(character) || !character.economy) {
      continue;
    }
    const pending =
      typeof character.economy.pendingZarkans === "number" &&
      isFinite(character.economy.pendingZarkans)
        ? character.economy.pendingZarkans
        : 0;
    if (pending > 0) {
      const current =
        typeof character.economy.zarkans === "number" &&
        isFinite(character.economy.zarkans)
          ? character.economy.zarkans
          : 0;
      character.economy.zarkans = current + pending;
      character.economy.pendingZarkans = 0;
    }
  }
}

function applyTestaments(match: MatchRecord, replayEvents: ReplayEvent[]): void {
  if (!match.playerCharacters) {
    return;
  }
  for (const playerId in match.playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(match.playerCharacters, playerId)) {
      continue;
    }
    const deceased = match.playerCharacters[playerId];
    if (
      !deceased ||
      !isCharacterDead(deceased) ||
      deceased.testamentProcessed === true
    ) {
      continue;
    }
    deceased.testamentProcessed = true;
    const recipientId = deceased.testamentRecipientId;
    const recipient = recipientId
      ? match.playerCharacters[recipientId]
      : undefined;
    const amount =
      typeof deceased.economy?.zarkans === "number" &&
      isFinite(deceased.economy.zarkans)
        ? Math.max(0, Math.floor(deceased.economy.zarkans))
        : 0;
    if (
      !recipientId ||
      recipientId === playerId ||
      !recipient ||
      isCharacterDead(recipient) ||
      amount <= 0
    ) {
      continue;
    }
    if (!recipient.economy) {
      recipient.economy = {
        zarkans: 0,
        pendingZarkans: 0,
        incomeInterval: 1
      };
    }
    const recipientBalance =
      typeof recipient.economy.zarkans === "number" &&
      isFinite(recipient.economy.zarkans)
        ? recipient.economy.zarkans
        : 0;
    recipient.economy.zarkans = recipientBalance + amount;
    deceased.economy.zarkans = 0;
    replayEvents.push({
      kind: "player",
      actorId: deceased.id,
      action: {
        actionId: "give",
        metadata: {
          testament: true
        }
      },
      targets: [
        {
          targetId: recipientId,
          metadata: {
            testament: true,
            zarkansReceived: amount
          }
        }
      ]
    });
  }
}

function clearDodgeAttempts(match: MatchRecord) {
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
    if (character?.statuses) {
      delete character.statuses.dodgeAttempts;
    }
  }
}

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
  const replayEvents: ReplayEvent[] = [];
  activateTemporaryEnergy(match);
  applyZarkanIncome(match, replayEvents);
  clearDodgeAttempts(match);
  removeStateFromAllCharacters(match, "protected");
  removeStateFromAllCharacters(match, "unconscious");
  updateCooldownsForTurn(match, resolvedTurn);
  const actions = sortedActions();

  if (resolvedTurn === 0) {
    for (const playerId in characters) {
      if (!Object.prototype.hasOwnProperty.call(characters, playerId)) {
        continue;
      }
      const character = characters[playerId];
      const effectiveTeam = character?.secretTeamId || character?.teamId;
      if (character && effectiveTeam) {
        replayEvents.push({
          kind: "player",
          actorId: character.id,
          action: {
            actionId: "team_assigned",
            metadata: {
              teamId: effectiveTeam,
              coverTeamId: character.secretTeamId ? character.teamId : undefined
            }
          },
          visibility: {
            scope: "limited",
            playerIds: [character.id]
          }
        });
      }
    }
  }

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
  applyPendingZarkanPayout(match);
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
      const outcome = applyHealthDelta(character, -999, true, logger, true);
      match.playerCharacters[playerId] = outcome.character;
      const deadTeamId = character.secretTeamId || character.teamId;
      replayEvents.push({
        kind: "player",
        actorId: character.id,
        action: {
          actionId: "status_dead",
          metadata: {
            teamId: deadTeamId,
          },
        },
        targets: [
          {
            targetId: character.id,
            eliminated: true,
            metadata: {
              teamId: deadTeamId,
            },
          },
        ],
      });
    }
  }

  applyTestaments(match, replayEvents);
  recordMatchReportProgress(match);
  if (nk) {
    finalizeMatchIfEnded(match, nk, logger, replayEvents, resolvedTurn);
  }
  return { events: replayEvents };
}
