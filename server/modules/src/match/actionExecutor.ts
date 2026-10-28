/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  ActionLibrary,
  CellLibrary,
  getActionEnergyDiscount,
  ReplayImportance
} from "@shared";
import type {
  ActionDefinition,
  ActionId,
  HexTileSnapshot,
  ReplayEvent,
  ReplayPlayerEvent,
  PlayerCharacter,
} from "@shared";
import type { MatchRecord } from "../models/types";
import { executeMoveAction } from "./actions/move";
import { executePlaceC4Action } from "./actions/placeC4";
import { executeDetonateC4Action } from "./actions/detonateC4";
import { executePlaceTrapAction } from "./actions/placeTrap";
import { executeCreateFireAction } from "./actions/createFire";
import { executeDodgeAction } from "./actions/dodge";
import { executeScareAction } from "./actions/scare";
import { executeProtectAction } from "./actions/protect";
import { executePunchAction } from "./actions/punch";
import { executeKnifeAttackAction } from "./actions/knifeAttack";
import { executeAxeAttackAction } from "./actions/axeAttack";
import { executeBatAttackAction } from "./actions/batAttack";
import { executeChainsawAttackAction } from "./actions/chainsawAttack";
import { executeStartChainsawAction } from "./actions/startChainsaw";
import { executeShootPistolAction } from "./actions/shootPistol";
import { executeShootHarpoonAction } from "./actions/shootHarpoon";
import { executeShootRocketLauncherAction } from "./actions/shootRocketLauncher";
import { executeSleepAction } from "./actions/sleep";
import { executeRecoverAction } from "./actions/recover";
import { executeBreakfastAction } from "./actions/breakfast";
import { executeRefuelAction } from "./actions/refuel";
import { executeFabricateAction } from "./actions/fabricate";
import { executeManipulateAction } from "./actions/manipulate";
import { canFeedParticipant, executeFeedAction } from "./actions/feed";
import { executeFocusAction } from "./actions/focus";
import { executeUseBandageAction } from "./actions/useBandage";
import { executeUseMedicineAction } from "./actions/useMedicine";
import { executePoisonFoodAction } from "./actions/poisonFood";
import { executeUseAntidoteAction } from "./actions/useAntidote";
import { executeUseChemicalWeaponAction } from "./actions/UseChemicalWeapon";
import { executeSearchAction } from "./actions/search";
import { executePlaceTrackerAction } from "./actions/placeTracker";
import { executeInspectAction } from "./actions/inspect";
import { executeInjectVirusAction } from "./actions/injectVirus";
import { executeInjectVaccineAction } from "./actions/injectVaccine";
import {
  executeActivateCamerasAction,
  executeLookThroughWindowAction,
  executeUseBinocularsAction,
} from "./actions/observeLocation";
import { executeStealAction } from "./actions/steal";
import { executeGiveAction } from "./actions/give";
import { executeBlackMarketTradeAction } from "./actions/blackMarketTrade";
import { executePickUpAction } from "./actions/pickup";
import { executePickLockAction } from "./actions/pickLock";
import { executeDropAction } from "./actions/drop";
import { executeThrowObjectAction } from "./actions/throwObject";
import { applyActionCooldown } from "./actions/cooldowns";
import {
  applyActionEnergyCost,
  clearPlanByKey,
  createFailedActionEvent,
  hasCarriedItem,
  type PlannedActionKey,
  type PlannedActionParticipant,
} from "./actions/utils";
import { executeDetectAction } from "./actions/detect";
import { awardExperience } from "./progression";

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
    if (!character) {
      continue;
    }
    const plan = character.actionPlan;
    const main = plan?.main;
    const secondary = plan?.secondary;
    const extraSecondary = plan?.extraSecondary;
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
    } else if (
      actionId === ActionLibrary.pick_lock.id &&
      character.lockpickProgress &&
      character.position?.tileId === character.lockpickProgress.tileId
    ) {
      list.push({
        playerId,
        character,
        plan: { actionId: ActionLibrary.pick_lock.id },
        planKey: "lockpick_progress" as PlannedActionKey,
      });
    }
    if (extraSecondary && extraSecondary.actionId === actionId) {
      list.push({
        playerId,
        character,
        plan: extraSecondary,
        planKey: "extraSecondary",
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
  actionId?: ActionId | string,
): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  const characters = match.playerCharacters;
  if (!characters) {
    return events;
  }
  for (const participant of participants) {
    const resolvedActionId = actionId ?? participant.plan?.actionId;
    const discount = resolvedActionId
      ? getActionEnergyDiscount(participant.character, resolvedActionId)
      : 0;
    const effectiveCost = Math.max(0, energyCost - discount);
    const outcome = applyActionEnergyCost(
      participant.character,
      effectiveCost,
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

  if (action.id === ActionLibrary.pick_lock.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyParticipants = participants.filter(
        (p) =>
          p.planKey === "secondary" &&
          p.plan.actionId === ActionLibrary.pick_lock.id
      );
      const energyEvents = applyEnergyForParticipants(
        energyParticipants,
        action.energyCost,
        match,
        logger
      );
      const actionEvents = executePickLockAction(participants, match);
      eventsForAction = [...energyEvents, ...actionEvents];
      for (const participant of participants) {
        if (
          participant.planKey === "secondary" &&
          participant.plan.actionId === ActionLibrary.pick_lock.id
        ) {
          applyActionCooldown(
            participant.character,
            action.id,
            action.cooldown,
            resolvedTurn
          );
        }
        match.playerCharacters![participant.playerId] = participant.character;
      }
      handled = true;
    }
  } else if (action.id === ActionLibrary.dodge.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = executeDodgeAction(participants, match);
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
  } else if (action.id === ActionLibrary.move.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = executeMoveAction(participants, match, logger);
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
  } else if (action.id === ActionLibrary.place_c4.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      const missing: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (hasCarriedItem(participant.character, "c4")) {
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
        ? executePlaceC4Action(eligible, match, logger)
        : [];
      const failureEvents = missing.map((participant) =>
        createFailedActionEvent(participant, action.id, {
          reason: "missing_item",
          missingItemId: "c4",
        }),
      );
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
  } else if (action.id === ActionLibrary.detonate_c4.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      const missing: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (hasCarriedItem(participant.character, "detonator")) {
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
        ? executeDetonateC4Action(eligible, match)
        : [];
      const failureEvents = missing.map((participant) =>
        createFailedActionEvent(participant, action.id, {
          reason: "missing_item",
          missingItemId: "detonator",
        }),
      );
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
  } else if (action.id === ActionLibrary.place_trap.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      const missing: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (hasCarriedItem(participant.character, "trap")) {
          eligible.push(participant);
        } else {
          missing.push(participant);
          clearPlanByKey(participant.character, participant.planKey);
          match.playerCharacters![participant.playerId] = participant.character;
        }
      }
      for (const participant of missing) {
        logger.debug(
          "place_trap missing item match=%s player=%s",
          match.match_id,
          participant.playerId,
        );
      }
      const trapsBefore = match.traps?.length ?? 0;
      logger.debug(
        "place_trap resolve match=%s turn=%d participants=%d eligible=%d missing=%d traps_before=%d",
        match.match_id,
        match.current_turn ?? 0,
        participants.length,
        eligible.length,
        missing.length,
        trapsBefore,
      );
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = eligible.length
        ? executePlaceTrapAction(eligible, match, logger)
        : [];
      logger.debug(
        "place_trap resolved match=%s turn=%d action_events=%d traps_before=%d traps_after=%d",
        match.match_id,
        match.current_turn ?? 0,
        actionEvents.length,
        trapsBefore,
        match.traps?.length ?? 0,
      );
      const failureEvents = missing.length
        ? missing.map((participant) =>
            createFailedActionEvent(participant, action.id, {
              reason: "missing_item",
              missingItemId: "trap",
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
  } else if (action.id === ActionLibrary.create_fire.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = executeCreateFireAction(participants, match);
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
      const actionEvents = executeScareAction(participants, match, logger);
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
  } else if (action.id === ActionLibrary.use_medicine.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      const missing: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (hasCarriedItem(participant.character, "medicine")) {
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
        ? executeUseMedicineAction(eligible, match)
        : [];
      const failureEvents = missing.length
        ? missing.map((participant) =>
            createFailedActionEvent(participant, action.id, {
              reason: "missing_item",
              missingItemId: "medicine",
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
  } else if (action.id === ActionLibrary.use_antidote.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(participants, action.energyCost, match, logger);
      const actionEvents = executeUseAntidoteAction(participants, match);
      eventsForAction = [...energyEvents, ...actionEvents];
      for (const participant of participants) {
        applyActionCooldown(participant.character, action.id, action.cooldown, resolvedTurn);
        match.playerCharacters![participant.playerId] = participant.character;
      }
      handled = true;
    }
  } else if (action.id === ActionLibrary.poison_food.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(participants, action.energyCost, match, logger);
      const actionEvents = executePoisonFoodAction(participants, match);
      eventsForAction = [...energyEvents, ...actionEvents];
      for (const participant of participants) {
        applyActionCooldown(participant.character, action.id, action.cooldown, resolvedTurn);
        match.playerCharacters![participant.playerId] = participant.character;
      }
      handled = true;
    }
  } else if (action.id === ActionLibrary.use_chemical_weapon.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      const missing: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (hasCarriedItem(participant.character, "chemical_weapon")) {
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
        ? executeUseChemicalWeaponAction(eligible, match)
        : [];
      const failureEvents = missing.length
        ? missing.map((participant) =>
            createFailedActionEvent(participant, action.id, {
              reason: "missing_item",
              missingItemId: "chemical_weapon",
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
  } else if (action.id === ActionLibrary.inject_virus.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      const missing: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (hasCarriedItem(participant.character, "virus")) {
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
        ? executeInjectVirusAction(eligible, match)
        : [];
      const failureEvents = missing.length
        ? missing.map((participant) =>
            createFailedActionEvent(participant, action.id, {
              reason: "missing_item",
              missingItemId: "virus",
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
  } else if (action.id === ActionLibrary.inject_vaccine.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      const missing: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (hasCarriedItem(participant.character, "vaccine")) {
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
        ? executeInjectVaccineAction(eligible, match)
        : [];
      const failureEvents = missing.length
        ? missing.map((participant) =>
            createFailedActionEvent(participant, action.id, {
              reason: "missing_item",
              missingItemId: "vaccine",
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
  } else if (action.id === ActionLibrary.breakfast.id) {
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
        const actionEvents = executeBreakfastAction(eligible, match);
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
  } else if (action.id === ActionLibrary.refuel.id) {
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
        const actionEvents = executeRefuelAction(eligible, match);
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
  } else if (action.id === ActionLibrary.give.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = executeGiveAction(participants, match);
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
  } else if (action.id === ActionLibrary.feed.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (canFeedParticipant(participant.character, match)) {
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
  } else if (action.id === ActionLibrary.black_market_trade.id) {
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
        const actionEvents = executeBlackMarketTradeAction(eligible, match);
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
  } else if (action.id === ActionLibrary.drop.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = executeDropAction(participants, match);
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
  } else if (action.id === ActionLibrary.throw_object.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = executeThrowObjectAction(participants, match);
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
  } else if (action.id === ActionLibrary.manipulate.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = executeManipulateAction(participants, match);
      eventsForAction = [...energyEvents, ...actionEvents];
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
  } else if (action.id === ActionLibrary.place_tracker.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = executePlaceTrackerAction(participants, match, logger);
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
  } else if (action.id === ActionLibrary.inspect.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = executeInspectAction(participants, match);
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
  } else if (action.id === ActionLibrary.steal.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = executeStealAction(participants, match);
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
  } else if (action.id === ActionLibrary.fabricate.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = executeFabricateAction(participants, match);
      eventsForAction = [...energyEvents, ...actionEvents];
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
  } else if (action.id === ActionLibrary.activate_cameras.id) {
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
        const actionEvents = executeActivateCamerasAction(eligible, match);
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
  } else if (action.id === ActionLibrary.look_through_window.id) {
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
        const actionEvents = executeLookThroughWindowAction(eligible, match);
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
  } else if (action.id === ActionLibrary.use_binoculars.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      const missing: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (hasCarriedItem(participant.character, "binoculars")) {
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
        ? executeUseBinocularsAction(eligible, match)
        : [];
      const failureEvents = missing.length
        ? missing.map((participant) =>
            createFailedActionEvent(participant, action.id, {
              reason: "missing_item",
              missingItemId: "binoculars",
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
  } else if (action.id === ActionLibrary.bat_attack.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      const missing: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (
          hasCarriedItem(participant.character, "nail_bat") ||
          hasCarriedItem(participant.character, "bat")
        ) {
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
        ? executeBatAttackAction(eligible, match)
        : [];
      const failureEvents = missing.length
        ? missing.map((participant) =>
            createFailedActionEvent(participant, action.id, {
              reason: "missing_item",
              missingItemId: "bat",
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
  } else if (action.id === ActionLibrary.chainsaw_attack.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      const failures: ReplayPlayerEvent[] = [];
      for (const participant of participants) {
        if (!hasCarriedItem(participant.character, "chainsaw")) {
          failures.push(
            createFailedActionEvent(participant, action.id, {
              reason: "missing_item",
              missingItemId: "chainsaw",
            })
          );
          clearPlanByKey(participant.character, participant.planKey);
          match.playerCharacters![participant.playerId] = participant.character;
        } else if ((participant.character.statuses?.chainsaw?.remainingTurns ?? 0) <= 0) {
          failures.push(
            createFailedActionEvent(participant, action.id, {
              reason: "chainsaw_not_running",
            })
          );
          clearPlanByKey(participant.character, participant.planKey);
          match.playerCharacters![participant.playerId] = participant.character;
        } else {
          eligible.push(participant);
        }
      }
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = eligible.length
        ? executeChainsawAttackAction(eligible, match)
        : [];
      eventsForAction = [...energyEvents, ...actionEvents, ...failures];
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
  } else if (action.id === ActionLibrary.start_chainsaw.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      const failures: ReplayPlayerEvent[] = [];
      for (const participant of participants) {
        if (!hasCarriedItem(participant.character, "chainsaw")) {
          failures.push(
            createFailedActionEvent(participant, action.id, {
              reason: "missing_item",
              missingItemId: "chainsaw",
            })
          );
          clearPlanByKey(participant.character, participant.planKey);
          match.playerCharacters![participant.playerId] = participant.character;
        } else if (!hasCarriedItem(participant.character, "fuel")) {
          failures.push(
            createFailedActionEvent(participant, action.id, {
              reason: "missing_item",
              missingItemId: "fuel",
            })
          );
          clearPlanByKey(participant.character, participant.planKey);
          match.playerCharacters![participant.playerId] = participant.character;
        } else {
          eligible.push(participant);
        }
      }
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = eligible.length
        ? executeStartChainsawAction(eligible, match)
        : [];
      eventsForAction = [...energyEvents, ...actionEvents, ...failures];
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
  } else if (action.id === ActionLibrary.fire_rocket_launcher.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      const missing: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        if (hasCarriedItem(participant.character, "rocket_launcher")) {
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
        ? executeShootRocketLauncherAction(eligible, match)
        : [];
      const failureEvents = missing.length
        ? missing.map((participant) =>
            createFailedActionEvent(participant, action.id, {
              reason: "missing_item",
              missingItemId: "rocket_launcher",
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
  } else if (action.id === ActionLibrary.shoot_pistol.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      const missing: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        const hasWeapon =
          hasCarriedItem(participant.character, "suppressed_pistol") ||
          hasCarriedItem(participant.character, "pistol");
        const hasAmmo = hasCarriedItem(participant.character, "bullet", 1);
        if (hasWeapon && hasAmmo) {
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
        ? executeShootPistolAction(eligible, match)
        : [];
      const failureEvents = missing.length
        ? missing.map((participant) => {
            const hasWeapon =
              hasCarriedItem(participant.character, "suppressed_pistol") ||
              hasCarriedItem(participant.character, "pistol");
            return createFailedActionEvent(participant, action.id, {
              reason: "missing_item",
              missingItemId: hasWeapon ? "bullet" : "pistol",
            });
          })
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
  } else if (action.id === ActionLibrary.shoot_harpoon.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const eligible: PlannedActionParticipant[] = [];
      const missing: PlannedActionParticipant[] = [];
      for (const participant of participants) {
        const hasWeapon = hasCarriedItem(participant.character, "harpoon");
        const hasAmmo = hasCarriedItem(participant.character, "arrow", 1);
        if (hasWeapon && hasAmmo) {
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
        ? executeShootHarpoonAction(eligible, match)
        : [];
      const failureEvents = missing.length
        ? missing.map((participant) => {
            const hasWeapon = hasCarriedItem(participant.character, "harpoon");
            return createFailedActionEvent(participant, action.id, {
              reason: "missing_item",
              missingItemId: hasWeapon ? "arrow" : "harpoon",
            });
          })
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
  } else if (action.id === ActionLibrary.train.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const extraParticipants = participants.filter(
        (participant) => (participant.plan.extraExecutions ?? 0) > 0,
      );
      const extraEnergyEvents = extraParticipants.length
        ? applyEnergyForParticipants(
            extraParticipants,
            action.extraExecution?.cost ?? 0,
            match,
            logger,
          )
        : [];
      const actionEvents: ReplayEvent[] = participants.map((participant) => {
        const extraExperience = (participant.plan.extraExecutions ?? 0) > 0 ? 3 : 0;
        const awarded = awardExperience(participant.character, 5 + extraExperience);
        applyActionCooldown(
          participant.character,
          action.id,
          action.cooldown,
          resolvedTurn,
        );
        match.playerCharacters![participant.playerId] = participant.character;
        return {
          kind: "player",
          importance: 1,
          actorId: participant.playerId,
          action: {
            actionId: action.id,
            metadata: {
              experienceGained: awarded.experienceGained,
              levelsGained: awarded.levelsGained,
            },
          },
        };
      });
      eventsForAction = [...energyEvents, ...extraEnergyEvents, ...actionEvents];
      handled = true;
    }
  } else if (action.id === ActionLibrary.detect.id) {
    const participants = collectParticipants(match, action.id);
    if (participants.length > 0) {
      const energyEvents = applyEnergyForParticipants(
        participants,
        action.energyCost,
        match,
        logger,
      );
      const actionEvents = executeDetectAction(participants, match);
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

function calculateActionExperience(
  action: ActionDefinition,
  event: ReplayPlayerEvent
): number {
  let exp = action.experience?.base ?? 0;

  // 1. Attack actions
  if (
    action.id === ActionLibrary.knife_attack.id ||
    action.id === ActionLibrary.axe_attack.id ||
    action.id === ActionLibrary.bat_attack.id ||
    action.id === ActionLibrary.chainsaw_attack.id ||
    action.id === ActionLibrary.shoot_pistol.id ||
    action.id === ActionLibrary.shoot_harpoon.id ||
    action.id === ActionLibrary.fire_rocket_launcher.id ||
    action.id === ActionLibrary.punch.id ||
    action.id === ActionLibrary.throw_object.id ||
    action.id === ActionLibrary.use_chemical_weapon.id
  ) {
    const targets = event.targets ?? [];
    const damageDealt =
      typeof event.action.damageDealt === "number"
        ? event.action.damageDealt
        : targets.reduce((sum, t) => sum + (t.damageTaken ?? 0), 0);

    const anyEliminated = targets.some((t) => t.eliminated === true);
    if (anyEliminated) {
      exp += 5;
    }

    if (
      action.id === ActionLibrary.bat_attack.id ||
      action.id === ActionLibrary.use_chemical_weapon.id ||
      action.id === ActionLibrary.fire_rocket_launcher.id
    ) {
      const affectedCount = targets.filter((t) => (t.damageTaken ?? 0) > 0).length;
      exp += affectedCount * 1;
    } else if (damageDealt > 0) {
      exp += 2;
    }
    return exp;
  }

  // 2. Robar (steal): +4 per stolen item
  if (action.id === ActionLibrary.steal.id) {
    const metadata = event.action.metadata as { stolenCount?: number } | undefined;
    const stolenCount = metadata?.stolenCount ?? 0;
    return stolenCount * 4;
  }

  // 3. Forzar cerradura (pick_lock): +2 if safe opened
  if (action.id === ActionLibrary.pick_lock.id) {
    const metadata = event.action.metadata as { outcome?: string } | undefined;
    if (metadata?.outcome === "success") {
      return 2;
    }
    return 0;
  }

  // 4. Proteger (protect): +3 if successfully protected
  if (action.id === ActionLibrary.protect.id) {
    const targets = event.targets ?? [];
    if (targets.length > 0) {
      return 3;
    }
    return 0;
  }

  // 5. Dormir (sleep): +4 if with extra execution
  if (action.id === ActionLibrary.sleep.id) {
    const extra = (event.action.metadata as { extraExecutions?: number })?.extraExecutions ?? 0;
    if (extra > 0) {
      return 4;
    }
    return 0;
  }

  // 6. Envenenar alimento (poison_food): +3 per poisoned target
  if (action.id === ActionLibrary.poison_food.id) {
    const targets = event.targets ?? [];
    return targets.length * 3;
  }

  return exp;
}

  for (const event of eventsForAction) {
    if (
      event.kind !== "player" ||
      event.action.actionId !== action.id ||
      event.actorId === undefined
    ) {
      continue;
    }
    if (
      (event.action.metadata as { experienceGained?: unknown } | undefined)
        ?.experienceGained !== undefined
    ) {
      continue;
    }
    if (event.action.actionId === "failedAction") {
      continue;
    }
    const character = match.playerCharacters?.[event.actorId];
    if (!character) {
      continue;
    }
    const exp = calculateActionExperience(action, event);
    if (exp > 0) {
      const awarded = awardExperience(character, exp);
      event.action.metadata = {
        ...event.action.metadata,
        experienceGained: awarded.experienceGained,
        levelsGained: awarded.levelsGained,
      };
      match.playerCharacters[event.actorId] = character;
    }
  }

  const criticalActionIds = new Set<ActionId>([
    "axe_attack",
    "bat_attack",
    "chainsaw_attack",
    "detonate_c4",
    "fire_rocket_launcher",
    "knife_attack",
    "punch",
    "poison_food",
    "shoot_harpoon",
    "shoot_pistol",
    "throw_object",
    "use_chemical_weapon"
  ]);
  for (const event of eventsForAction) {
    if (
      event.kind === "player" &&
      criticalActionIds.has(event.action.actionId)
    ) {
      event.importance = ReplayImportance.Critical;
    }
  }
  return eventsForAction;
}
