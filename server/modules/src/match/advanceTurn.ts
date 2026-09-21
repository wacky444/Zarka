/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { ActionLibrary } from "@shared";
import type {
  ActionDefinition,
  PlayerCharacter,
  ReplayEvent,
} from "@shared";
import type { MatchRecord } from "../models/types";
import { finalizeMatchIfEnded } from "./checkEndGame";
import { recordMatchReportProgress } from "./matchReport";
import { updateCooldownsForTurn } from "./actions/cooldowns";
import { executeAction, type TileLookup } from "./actionExecutor";
import { applyVirusInfection } from "./actions/virusInfection";
import {
  applyPendingZarkanPayout,
  applyTestaments,
  applyZarkanIncome,
} from "./turnEconomy";
import {
  applyFireDamageBeforeAction,
  clearExpiredFires,
} from "./turnFire";
import { applyScheduledDestruction } from "./turnDestruction";

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
  applyPendingZarkanPayout(match, replayEvents);
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
    replayEvents.push(
      ...applyFireDamageBeforeAction(match, action.id, resolvedTurn, logger),
    );
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
  replayEvents.push(...applyVirusInfection(match, resolvedTurn, logger));
  replayEvents.push(
    ...applyScheduledDestruction(match, resolvedTurn, logger),
  );
  clearExpiredFires(match, resolvedTurn);
  // removeProtectedState(match);

  applyTestaments(match, replayEvents);
  recordMatchReportProgress(match);
  if (nk) {
    finalizeMatchIfEnded(match, nk, logger, replayEvents, resolvedTurn);
  }
  return { events: replayEvents };
}
