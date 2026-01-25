/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { ActionLibrary, CellLibrary } from "@shared";
import type {
  ActionDefinition,
  ActionId,
  HexTileSnapshot,
  ReplayEvent,
  PlayerCharacter,
} from "@shared";
import type { MatchRecord } from "../models/types";
import { executeMoveAction } from "./actions/move";
import { executeScareAction } from "./actions/scare";
import { executeProtectAction } from "./actions/protect";
import { executePunchAction } from "./actions/punch";
import { executeKnifeAttackAction } from "./actions/knifeAttack";
import { executeAxeAttackAction } from "./actions/axeAttack";
import { executeSleepAction } from "./actions/sleep";
import { executeRecoverAction } from "./actions/recover";
import { executeFeedAction, hasFeedConsumable } from "./actions/feed";
import { executeFocusAction } from "./actions/focus";
import { executeUseBandageAction } from "./actions/useBandage";
import { executeSearchAction } from "./actions/search";
import { executePickUpAction } from "./actions/pickup";
import { applyActionCooldown } from "./actions/cooldowns";
import {
  applyActionEnergyCost,
  clearPlanByKey,
  createFailedActionEvent,
  hasCarriedItem,
  type PlannedActionParticipant,
} from "./actions/utils";

export type TileLookup = Record<string, HexTileSnapshot>;

function isActionAllowedAtLocation(
  lookup: TileLookup,
  character: PlayerCharacter,
  actionId: ActionId,
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

function collectParticipants(
  match: MatchRecord,
  actionId: string,
): PlannedActionParticipant[] {
  const list: PlannedActionParticipant[] = [];
  const characters = match.playerCharacters;
  if (!characters) {
    return list;
  }
  for (const playerId in characters) {
    if (!Object.prototype.hasOwnProperty.call(characters, playerId)) {
      continue;
    }
    const character = characters[playerId];
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
  logger: nkruntime.Logger,
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
      logger,
    );
    if (outcome.event) {
      events.push(outcome.event);
    }
    characters[participant.playerId] = participant.character;
  }
  return events;
}

export function executeAction(
  match: MatchRecord,
  action: ActionDefinition,
  resolvedTurn: number,
  tileLookup: TileLookup,
  logger: nkruntime.Logger,
): ReplayEvent[] {
  let eventsForAction: ReplayEvent[] = [];
  let handled = false;

  if (action.id === ActionLibrary.move.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
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
          resolvedTurn,
        );
        match.playerCharacters![participant.playerId] = participant.character;
      }
      handled = true;
    }
  } else if (action.id === ActionLibrary.scare.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
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
          resolvedTurn,
        );
        match.playerCharacters![participant.playerId] = participant.character;
      }
      handled = true;
    }
  } else if (action.id === ActionLibrary.use_bandage.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      const missing: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (hasCarriedItem(participant.character, "bandage")) {
          eligible.push(participant);
        } else {
          missing.push(participant);
          clearPlanByKey(participant.character, participant.planKey);
          match.playerCharacters![participant.playerId] = participant.character;
        }
      }
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = eligible.length
        ? executeUseBandageAction(eligible, match)
        : [];
      const failureEvents = missing.length
        ? missing.map((participant) =>
            createFailedActionEvent(participant, action.id, {
              reason: "missing_item",
              missingItemId: "bandage",
            }),
          )
        : [];
      eventsForAction = [...energyEvents, ...actionEvents, ...failureEvents];
      for (const participant of participants) {
        applyActionCooldown(
          participant.character,
          action.id,
          action.cooldown,
          resolvedTurn,
        );
        match.playerCharacters![participant.playerId] = participant.character;
      }
      handled = true;
    }
  } else if (action.id === ActionLibrary.sleep.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
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
          resolvedTurn,
        );
        match.playerCharacters![participant.playerId] = participant.character;
      }
      handled = true;
    }
  } else if (action.id === ActionLibrary.recover.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (
          isActionAllowedAtLocation(
            tileLookup,
            participant.character,
            action.id,
          )
        ) {
          eligible.push(participant);
        } else {
          clearPlanByKey(participant.character, participant.planKey);
          match.playerCharacters![participant.playerId] = participant.character;
        }
      }
      if (eligible.length > 0) {
        const energyEvents = applyEnergyForParticipants(
          eligible,
          action.energyCost,
          match,
          logger,
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
            resolvedTurn,
          );
          match.playerCharacters![participant.playerId] = participant.character;
        }
        handled = true;
      }
    }
  } else if (action.id === ActionLibrary.feed.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (hasFeedConsumable(participant.character)) {
          eligible.push(participant);
        } else {
          clearPlanByKey(participant.character, participant.planKey);
          match.playerCharacters![participant.playerId] = participant.character;
        }
      }
      if (eligible.length > 0) {
        const energyEvents = applyEnergyForParticipants(
          eligible,
          action.energyCost,
          match,
          logger,
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
            resolvedTurn,
          );
          match.playerCharacters![participant.playerId] = participant.character;
        }
        handled = true;
      }
    }
  } else if (action.id === ActionLibrary.pick_up.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
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
          resolvedTurn,
        );
        match.playerCharacters![participant.playerId] = participant.character;
      }
      handled = true;
    }
  } else if (action.id === ActionLibrary.search.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
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
          resolvedTurn,
        );
        match.playerCharacters![participant.playerId] = participant.character;
      }
      handled = true;
    }
  } else if (action.id === ActionLibrary.focus.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
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
          resolvedTurn,
        );
        match.playerCharacters![participant.playerId] = participant.character;
      }
      handled = true;
    }
  } else if (action.id === ActionLibrary.protect.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
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
          resolvedTurn,
        );
        match.playerCharacters![participant.playerId] = participant.character;
      }
      handled = true;
    }
  } else if (action.id === ActionLibrary.knife_attack.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      const missing: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (hasCarriedItem(participant.character, "knife")) {
          eligible.push(participant);
        } else {
          missing.push(participant);
          clearPlanByKey(participant.character, participant.planKey);
          match.playerCharacters![participant.playerId] = participant.character;
        }
      }
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = eligible.length
        ? executeKnifeAttackAction(eligible, match)
        : [];
      const failureEvents = missing.length
        ? missing.map((participant) =>
            createFailedActionEvent(participant, action.id, {
              reason: "missing_item",
              missingItemId: "knife",
            }),
          )
        : [];
      eventsForAction = [...energyEvents, ...actionEvents, ...failureEvents];
      for (const participant of participants) {
        applyActionCooldown(
          participant.character,
          action.id,
          action.cooldown,
          resolvedTurn,
        );
        match.playerCharacters![participant.playerId] = participant.character;
      }
      handled = true;
    }
  } else if (action.id === ActionLibrary.axe_attack.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      const missing: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (hasCarriedItem(participant.character, "axe")) {
          eligible.push(participant);
        } else {
          missing.push(participant);
          clearPlanByKey(participant.character, participant.planKey);
          match.playerCharacters![participant.playerId] = participant.character;
        }
      }
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = eligible.length
        ? executeAxeAttackAction(eligible, match)
        : [];
      const failureEvents = missing.length
        ? missing.map((participant) =>
            createFailedActionEvent(participant, action.id, {
              reason: "missing_item",
              missingItemId: "axe",
            }),
          )
        : [];
      eventsForAction = [...energyEvents, ...actionEvents, ...failureEvents];
      for (const participant of participants) {
        applyActionCooldown(
          participant.character,
          action.id,
          action.cooldown,
          resolvedTurn,
        );
        match.playerCharacters![participant.playerId] = participant.character;
      }
      handled = true;
    }
  } else if (action.id === ActionLibrary.punch.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
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
          resolvedTurn,
        );
        match.playerCharacters![participant.playerId] = participant.character;
      }
      handled = true;
    }
  }

  return eventsForAction;
}
