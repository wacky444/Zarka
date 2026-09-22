/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  ReplayActionDone,
  ReplayActionTarget,
  ReplayPlayerEvent,
} from "@shared";
import {
  ReplayActionEffect,
  getDamageReduction,
} from "@shared";
import {
  applyHealthDelta,
  buildGuardedEffectMask,
  consumeCarriedItem,
  getInventoryDamageReduction,
  isTargetProtected,
  mergeCharacterState,
  resolveGuardedDamage,
  type PlannedActionParticipant,
} from "./utils";
import { collectTargets } from "./targeting";
import { BaseAction } from "./classes/BaseAction";

const CHEMICAL_WEAPON_ITEM_ID = "chemical_weapon";
const DAMAGE_SINGLE_TARGET = 11;
const DAMAGE_AREA = 9;

export class ChemicalWeaponAction extends BaseAction {
  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    for (const participant of roster) {
      const actionId = participant.plan.actionId as ActionId;
      if (!actionId) {
        this.clearPlan(participant);
        continue;
      }

      consumeCarriedItem(participant.character, CHEMICAL_WEAPON_ITEM_ID, 1);

      const isSingleTarget =
        participant.plan.singleTarget === true ||
        (Array.isArray(participant.plan.targetPlayerIds) &&
          participant.plan.targetPlayerIds.length > 0);

      const baseDamage = isSingleTarget ? DAMAGE_SINGLE_TARGET : DAMAGE_AREA;
      const targets = collectTargets(actionId, participant, match, {
        allowMultiple: !isSingleTarget,
        filter: (candidate) => candidate.distance === 0,
      });

      const targetEntries: ReplayActionTarget[] = [];
      let totalDamage = 0;
      const postEvents: ReplayPlayerEvent[] = [];

      for (const targetCandidate of targets) {
        const targetId = targetCandidate.id;
        const target = match.playerCharacters?.[targetId];
        if (!target) {
          continue;
        }

        const guarded = isTargetProtected(target);
        const guardedDamage = resolveGuardedDamage(baseDamage, guarded);
        const damageReduction =
          getDamageReduction(target) +
          getInventoryDamageReduction(target, "chemical");
        const dealtAmount = Math.max(0, guardedDamage - damageReduction);

        const {
          result: healthChange,
          character: updatedTarget,
          event,
        } = applyHealthDelta(target, -dealtAmount);
        mergeCharacterState(target, updatedTarget);
        match.playerCharacters[targetId] = target;

        if (event) {
          postEvents.push(event);
        }

        const applied = Math.max(0, -healthChange.delta);
        totalDamage += applied;
        const eliminated =
          healthChange.current === 0 && healthChange.previous > 0;

        const targetEntry: ReplayActionTarget = {
          targetId,
          damageTaken: applied,
          effects: buildGuardedEffectMask(guarded),
        };
        if (eliminated) {
          targetEntry.eliminated = true;
        }
        targetEntries.push(targetEntry);
      }

      this.clearPlan(participant);

      const action: ReplayActionDone = {
        actionId,
        damageDealt: totalDamage,
        effects: ReplayActionEffect.Hit,
      };
      if (participant.character.position?.coord) {
        action.originLocation = participant.character.position.coord;
      }

      events.push({
        kind: "player",
        actorId: participant.playerId,
        action,
        targets: targetEntries,
      });

      if (postEvents.length > 0) {
        events.push(...postEvents);
      }
    }
    return events;
  }
}

const chemicalWeaponAction = new ChemicalWeaponAction();

export function executeUseChemicalWeaponAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return chemicalWeaponAction.execute(participants, match);
}
