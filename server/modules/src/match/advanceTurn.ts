/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { ActionLibrary } from "@shared";
import type { ActionDefinition, ReplayEvent } from "@shared";
import type { PlayerCharacter } from "@shared";
import type { MatchRecord } from "../models/types";
import { executeMoveAction } from "./actions/move";
import { executeProtectAction } from "./actions/protect";
import { executePunchAction } from "./actions/punch";
import { executeSleepAction } from "./actions/sleep";
import { executeFeedAction, hasFeedConsumable } from "./actions/feed";
import { executeFocusAction } from "./actions/focus";
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

function stripProtectedCondition(character: PlayerCharacter): void {
  const statuses = character.statuses;
  if (!statuses?.conditions) {
    return;
  }
  const filtered = statuses.conditions.filter(
    (condition) => condition !== "protected"
  );
  if (filtered.length === statuses.conditions.length) {
    return;
  }
  statuses.conditions = filtered;
}

function removeProtectedState(match: MatchRecord): void {
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
    stripProtectedCondition(character);
    match.playerCharacters[playerId] = character;
  }
}

export function advanceTurn(
  match: MatchRecord,
  resolvedTurn: number
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
  activateTemporaryEnergy(match);
  removeProtectedState(match);
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
      for (const participant of participants) {
        applyActionEnergyCost(participant.character, action.energyCost);
        match.playerCharacters[participant.playerId] = participant.character;
      }
      eventsForAction = executeMoveAction(participants, match);
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
    } else if (action.id === ActionLibrary.sleep.id) {
      const participants = collectParticipants(players, match, action.id);
      if (participants.length === 0) {
        continue;
      }
      for (const participant of participants) {
        applyActionEnergyCost(participant.character, action.energyCost);
        match.playerCharacters[participant.playerId] = participant.character;
      }
      eventsForAction = executeSleepAction(participants, match);
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
      for (const participant of eligible) {
        applyActionEnergyCost(participant.character, action.energyCost);
        match.playerCharacters[participant.playerId] = participant.character;
      }
      eventsForAction = executeFeedAction(eligible, match);
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
    } else if (action.id === ActionLibrary.focus.id) {
      const participants = collectParticipants(players, match, action.id);
      if (participants.length === 0) {
        continue;
      }
      for (const participant of participants) {
        applyActionEnergyCost(participant.character, action.energyCost);
        match.playerCharacters[participant.playerId] = participant.character;
      }
      eventsForAction = executeFocusAction(participants, match);
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
      for (const participant of participants) {
        applyActionEnergyCost(participant.character, action.energyCost);
        match.playerCharacters[participant.playerId] = participant.character;
      }
      eventsForAction = executeProtectAction(participants, match);
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
    } else if (action.id === ActionLibrary.punch.id) {
      const participants = collectParticipants(players, match, action.id);
      if (participants.length === 0) {
        continue;
      }
      for (const participant of participants) {
        applyActionEnergyCost(participant.character, action.energyCost);
        match.playerCharacters[participant.playerId] = participant.character;
      }
      eventsForAction = executePunchAction(participants, match);
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
  removeProtectedState(match);
  return { events: replayEvents };
}
