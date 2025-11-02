/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { ActionLibrary, CellLibrary } from "@shared";
import type {
  ActionDefinition,
  ActionId,
  HexTileSnapshot,
  ReplayEvent,
} from "@shared";
import type { PlayerCharacter } from "@shared";
import type { MatchRecord } from "../models/types";
import { executeMoveAction } from "./actions/move";
import { executeScareAction } from "./actions/scare";
import { executeProtectAction } from "./actions/protect";
import { executePunchAction } from "./actions/punch";
import { executeAxeAttackAction } from "./actions/axeAttack";
import { executeSleepAction } from "./actions/sleep";
import { executeRecoverAction } from "./actions/recover";
import { executeFeedAction, hasFeedConsumable } from "./actions/feed";
import { executeFocusAction } from "./actions/focus";
import { executeUseBandageAction } from "./actions/useBandage";
import { executeSearchAction } from "./actions/search";
import { executePickUpAction } from "./actions/pickup";
import {
  applyActionCooldown,
  updateCooldownsForTurn,
} from "./actions/cooldowns";
import {
  applyActionEnergyCost,
  clearPlanByKey,
  type PlannedActionParticipant,
} from "./actions/utils";

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

type TileLookup = Record<string, HexTileSnapshot>;

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

function isActionAllowedAtLocation(
  lookup: TileLookup,
  character: PlayerCharacter,
  actionId: ActionId
): boolean {
  const tileId = character.position?.tileId;
  if (!tileId) {
    return false;
  }
  const tile = lookup[tileId];
  if (!tile) {
    return false;
  }
  const definition = CellLibrary[tile.localizationType];
  if (!definition) {
    return false;
  }
  const allowed = definition.specialActionIds;
  if (!Array.isArray(allowed)) {
    return false;
  }
  return allowed.indexOf(actionId) !== -1;
}

export interface AdvanceTurnResult {
  events: ReplayEvent[];
}

function collectParticipants(
  players: string[],
  match: MatchRecord,
  actionId: string
): PlannedActionParticipant[] {
  const list: PlannedActionParticipant[] = [];
  for (const playerId of players) {
    const character = match.playerCharacters?.[playerId];
    if (!character || !character.actionPlan) {
      continue;
    }
    const { main, secondary } = character.actionPlan;
    if (main && main.actionId === actionId) {
      list.push({
        playerId,
        character,
        plan: main,
        planKey: "main",
      });
    }
    if (secondary && secondary.actionId === actionId) {
      list.push({
        playerId,
        character,
        plan: secondary,
        planKey: "secondary",
      });
    }
  }
  return list;
}

function applyEnergyForParticipants(
  participants: PlannedActionParticipant[],
  energyCost: number,
  match: MatchRecord,
  logger: any
): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  const characters = match.playerCharacters;
  if (!characters) {
    return events;
  }
  for (const participant of participants) {
    const outcome = applyActionEnergyCost(
      participant.character,
      energyCost,
      logger
    );
    if (outcome.event) {
      events.push(outcome.event);
    }
    characters[participant.playerId] = participant.character;
  }
  return events;
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
  condition: string
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

export function advanceTurn(
  match: MatchRecord,
  resolvedTurn: number,
  logger: any
): AdvanceTurnResult {
  if (!Array.isArray(match.players) || !match.playerCharacters) {
    return { events: [] };
  }
  const players = match.players.filter(
    (playerId) => !!match.playerCharacters?.[playerId]
  );
  if (players.length === 0) {
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
    let handled = false;
    let eventsForAction: ReplayEvent[] = [];
    if (action.id === ActionLibrary.move.id) {
      const participants = collectParticipants(players, match, action.id);
      if (participants.length === 0) {
        continue;
      }
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger
      );
      const actionEvents = executeMoveAction(participants, match);
      eventsForAction = energyEvents.length
        ? [...energyEvents, ...actionEvents]
        : actionEvents;
      for (const participant of participants) {
        applyActionCooldown(
          participant.character,
          action.id,
          action.cooldown,
          resolvedTurn
        );
        match.playerCharacters[participant.playerId] = participant.character;
      }
      handled = true;
    } else if (action.id === ActionLibrary.scare.id) {
      const participants = collectParticipants(players, match, action.id);
      if (participants.length === 0) {
        continue;
      }
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger
      );
      const actionEvents = executeScareAction(participants, match);
      eventsForAction = energyEvents.length
        ? [...energyEvents, ...actionEvents]
        : actionEvents;
      for (const participant of participants) {
        applyActionCooldown(
          participant.character,
          action.id,
          action.cooldown,
          resolvedTurn
        );
        match.playerCharacters[participant.playerId] = participant.character;
      }
      handled = true;
    } else if (action.id === ActionLibrary.use_bandage.id) {
      const participants = collectParticipants(players, match, action.id);
      if (participants.length === 0) {
        continue;
      }
      const eligible: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        const carried = participant.character.inventory?.carriedItems ?? [];
        const hasItem = carried.some(
          (stack) =>
            !!stack &&
            stack.itemId === "bandage" &&
            typeof stack.quantity === "number" &&
            stack.quantity > 0
        );
        if (hasItem) {
          eligible.push(participant);
        } else {
          clearPlanByKey(participant.character, participant.planKey);
          match.playerCharacters[participant.playerId] = participant.character;
        }
      }
      if (eligible.length === 0) {
        continue;
      }
      const energyEvents = applyEnergyForParticipants(
        eligible,
        action.energyCost,
        match,
        logger
      );
      const actionEvents = executeUseBandageAction(eligible, match);
      eventsForAction = energyEvents.length
        ? [...energyEvents, ...actionEvents]
        : actionEvents;
      for (const participant of eligible) {
        applyActionCooldown(
          participant.character,
          action.id,
          action.cooldown,
          resolvedTurn
        );
        match.playerCharacters[participant.playerId] = participant.character;
      }
      handled = true;
    } else if (action.id === ActionLibrary.sleep.id) {
      const participants = collectParticipants(players, match, action.id);
      if (participants.length === 0) {
        continue;
      }
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger
      );
      const actionEvents = executeSleepAction(participants, match);
      eventsForAction = energyEvents.length
        ? [...energyEvents, ...actionEvents]
        : actionEvents;
      for (const participant of participants) {
        applyActionCooldown(
          participant.character,
          action.id,
          action.cooldown,
          resolvedTurn
        );
        match.playerCharacters[participant.playerId] = participant.character;
      }
      handled = true;
    } else if (action.id === ActionLibrary.recover.id) {
      const participants = collectParticipants(players, match, action.id);
      if (participants.length === 0) {
        continue;
      }
      const eligible: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (
          isActionAllowedAtLocation(
            tileLookup,
            participant.character,
            action.id
          )
        ) {
          eligible.push(participant);
        } else {
          clearPlanByKey(participant.character, participant.planKey);
          match.playerCharacters[participant.playerId] = participant.character;
        }
      }
      if (eligible.length === 0) {
        continue;
      }
      const energyEvents = applyEnergyForParticipants(
        eligible,
        action.energyCost,
        match,
        logger
      );
      const actionEvents = executeRecoverAction(eligible, match);
      eventsForAction = energyEvents.length
        ? [...energyEvents, ...actionEvents]
        : actionEvents;
      for (const participant of eligible) {
        applyActionCooldown(
          participant.character,
          action.id,
          action.cooldown,
          resolvedTurn
        );
        match.playerCharacters[participant.playerId] = participant.character;
      }
      handled = true;
    } else if (action.id === ActionLibrary.feed.id) {
      const participants = collectParticipants(players, match, action.id);
      if (participants.length === 0) {
        continue;
      }
      const eligible: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (hasFeedConsumable(participant.character)) {
          eligible.push(participant);
        } else {
          clearPlanByKey(participant.character, participant.planKey);
          match.playerCharacters[participant.playerId] = participant.character;
        }
      }
      if (eligible.length === 0) {
        continue;
      }
      const energyEvents = applyEnergyForParticipants(
        eligible,
        action.energyCost,
        match,
        logger
      );
      const actionEvents = executeFeedAction(eligible, match);
      eventsForAction = energyEvents.length
        ? [...energyEvents, ...actionEvents]
        : actionEvents;
      for (const participant of eligible) {
        applyActionCooldown(
          participant.character,
          action.id,
          action.cooldown,
          resolvedTurn
        );
        match.playerCharacters[participant.playerId] = participant.character;
      }
      handled = true;
    } else if (action.id === ActionLibrary.pick_up.id) {
      const participants = collectParticipants(players, match, action.id);
      if (participants.length === 0) {
        continue;
      }
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger
      );
      const actionEvents = executePickUpAction(participants, match);
      eventsForAction = energyEvents.length
        ? [...energyEvents, ...actionEvents]
        : actionEvents;
      for (const participant of participants) {
        applyActionCooldown(
          participant.character,
          action.id,
          action.cooldown,
          resolvedTurn
        );
        match.playerCharacters[participant.playerId] = participant.character;
      }
      handled = true;
    } else if (action.id === ActionLibrary.search.id) {
      const participants = collectParticipants(players, match, action.id);
      if (participants.length === 0) {
        continue;
      }
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger
      );
      const actionEvents = executeSearchAction(participants, match);
      eventsForAction = energyEvents.length
        ? [...energyEvents, ...actionEvents]
        : actionEvents;
      for (const participant of participants) {
        applyActionCooldown(
          participant.character,
          action.id,
          action.cooldown,
          resolvedTurn
        );
        match.playerCharacters[participant.playerId] = participant.character;
      }
      handled = true;
    } else if (action.id === ActionLibrary.focus.id) {
      const participants = collectParticipants(players, match, action.id);
      if (participants.length === 0) {
        continue;
      }
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger
      );
      const actionEvents = executeFocusAction(participants, match);
      eventsForAction = energyEvents.length
        ? [...energyEvents, ...actionEvents]
        : actionEvents;
      for (const participant of participants) {
        applyActionCooldown(
          participant.character,
          action.id,
          action.cooldown,
          resolvedTurn
        );
        match.playerCharacters[participant.playerId] = participant.character;
      }
      handled = true;
    } else if (action.id === ActionLibrary.protect.id) {
      const participants = collectParticipants(players, match, action.id);
      if (participants.length === 0) {
        continue;
      }
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger
      );
      const actionEvents = executeProtectAction(participants, match);
      eventsForAction = energyEvents.length
        ? [...energyEvents, ...actionEvents]
        : actionEvents;
      for (const participant of participants) {
        applyActionCooldown(
          participant.character,
          action.id,
          action.cooldown,
          resolvedTurn
        );
        match.playerCharacters[participant.playerId] = participant.character;
      }
      handled = true;
    } else if (action.id === ActionLibrary.axe_attack.id) {
      const participants = collectParticipants(players, match, action.id);
      if (participants.length === 0) {
        continue;
      }
      const eligible: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        const carried = participant.character.inventory?.carriedItems ?? [];
        const hasAxe = carried.some(
          (stack) =>
            !!stack &&
            stack.itemId === "axe" &&
            typeof stack.quantity === "number" &&
            stack.quantity > 0
        );
        if (hasAxe) {
          eligible.push(participant);
        } else {
          clearPlanByKey(participant.character, participant.planKey);
          match.playerCharacters[participant.playerId] = participant.character;
        }
      }
      if (eligible.length === 0) {
        continue;
      }
      const energyEvents = applyEnergyForParticipants(
        eligible,
        action.energyCost,
        match,
        logger
      );
      const actionEvents = executeAxeAttackAction(eligible, match);
      eventsForAction = energyEvents.length
        ? [...energyEvents, ...actionEvents]
        : actionEvents;
      for (const participant of eligible) {
        applyActionCooldown(
          participant.character,
          action.id,
          action.cooldown,
          resolvedTurn
        );
        match.playerCharacters[participant.playerId] = participant.character;
      }
      handled = true;
    } else if (action.id === ActionLibrary.punch.id) {
      const participants = collectParticipants(players, match, action.id);
      if (participants.length === 0) {
        continue;
      }
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger
      );
      const actionEvents = executePunchAction(participants, match);
      eventsForAction = energyEvents.length
        ? [...energyEvents, ...actionEvents]
        : actionEvents;
      for (const participant of participants) {
        applyActionCooldown(
          participant.character,
          action.id,
          action.cooldown,
          resolvedTurn
        );
        match.playerCharacters[participant.playerId] = participant.character;
      }
      handled = true;
    }
    if (!handled) {
      continue;
    }
    if (eventsForAction.length) {
      replayEvents.push(...eventsForAction);
    }
  }
  // removeProtectedState(match);
  return { events: replayEvents };
}
