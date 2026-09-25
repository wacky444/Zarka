/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  ActionLibrary,
  getSkillRank,
  isCharacterHidden,
  syncBandolierLoadCapacity,
  type ActionDefinition,
  type PlayerCharacter,
  type ReplayEvent,
  type ReplayPlayerEvent,
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

function getPlannedPlayerIds(
  match: MatchRecord,
  actionId: string
): string[] {
  const playerIds: string[] = [];
  for (const playerId in match.playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(match.playerCharacters, playerId)) {
      continue;
    }
    const plan = match.playerCharacters[playerId]?.actionPlan;
    if (
      plan?.main?.actionId === actionId ||
      plan?.secondary?.actionId === actionId ||
      plan?.extraSecondary?.actionId === actionId
    ) {
      playerIds.push(playerId);
    }
  }
  return playerIds;
}

function findActionEvent(
  events: ReplayEvent[],
  playerId: string,
  actionId: string
): ReplayPlayerEvent | undefined {
  for (const event of events) {
    if (
      event.kind === "player" &&
      event.actorId === playerId &&
      event.action.actionId === actionId
    ) {
      return event;
    }
  }
  return undefined;
}

function doesCowardActionReveal(
  action: ActionDefinition,
  event: ReplayPlayerEvent,
  playerId: string,
  match: MatchRecord,
  resolvedTurn: number
): boolean {
  if (action.id === "shoot_pistol") {
    const weaponUsed = (event.action.metadata as { weaponUsed?: unknown } | undefined)
      ?.weaponUsed;
    return weaponUsed !== "suppressed_pistol";
  }
  if (action.id === "sleep") {
    const extraExecutions = (
      event.action.metadata as { extraExecutions?: unknown } | undefined
    )?.extraExecutions;
    return typeof extraExecutions === "number" && extraExecutions > 0;
  }
  if (action.id === "protect") {
    for (const target of event.targets ?? []) {
      if (
        target.targetId !== playerId &&
        !isCharacterHidden(match.playerCharacters?.[target.targetId], resolvedTurn)
      ) {
        return true;
      }
    }
    return false;
  }
  return action.revealsHidden === true;
}

function revealCowardActors(
  match: MatchRecord,
  action: ActionDefinition,
  events: ReplayEvent[],
  playerIds: string[],
  resolvedTurn: number
): void {
  if (action.revealsHidden !== true || !match.playerCharacters) {
    return;
  }
  for (const playerId of playerIds) {
    const character = match.playerCharacters[playerId];
    if (!character || getSkillRank(character, "coward") <= 0) {
      continue;
    }
    const event = findActionEvent(events, playerId, action.id);
    if (!event || !doesCowardActionReveal(action, event, playerId, match, resolvedTurn)) {
      continue;
    }
    character.cowardRevealedTurn = resolvedTurn;
    match.playerCharacters[playerId] = character;
  }
}

function appendHiddenStatusEvents(
  match: MatchRecord,
  resolvedTurn: number,
  events: ReplayEvent[]
): void {
  for (const playerId in match.playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(match.playerCharacters, playerId)) {
      continue;
    }
    const character = match.playerCharacters[playerId];
    if (!isCharacterHidden(character, resolvedTurn)) {
      continue;
    }
    events.push({
      kind: "player",
      actorId: playerId,
      action: { actionId: ActionLibrary.status_hidden.id },
      visibility: { scope: "all" },
    });
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
  for (const playerId in characters) {
    if (Object.prototype.hasOwnProperty.call(characters, playerId)) {
      syncBandolierLoadCapacity(characters[playerId]);
    }
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
    const playerIds = getPlannedPlayerIds(match, action.id);
    const events = executeAction(
      match,
      action,
      resolvedTurn,
      tileLookup,
      logger,
    );
    revealCowardActors(match, action, events, playerIds, resolvedTurn);
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
  appendHiddenStatusEvents(match, resolvedTurn, replayEvents);
  recordMatchReportProgress(match);
  if (nk) {
    finalizeMatchIfEnded(match, nk, logger, replayEvents, resolvedTurn);
  }
  return { events: replayEvents };
}
