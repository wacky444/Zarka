/// <reference path="../../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../../models/types";
import type {
  ActionId,
  ReplayActionDone,
  ReplayActionTarget,
  ReplayPlayerEvent,
} from "@shared";
import { ReplayActionEffect } from "@shared";
import {
  applyHealthDelta,
  mergeCharacterState,
  buildGuardedEffectMask,
  isTargetProtected,
  resolveGuardedDamage,
  type PlannedActionParticipant,
} from "../utils";
import { ActionLibrary } from "@shared";
import { getUsableExtraExecutions } from "../../../utils/energy";
import { collectTargets } from "../targeting";
import { BaseAction } from "./BaseAction";

export abstract class BaseAttackAction extends BaseAction {
  abstract readonly baseDamage: number;
  readonly effectType: ReplayActionEffect = ReplayActionEffect.Hit;

  protected getBaseDamage(
    participant: PlannedActionParticipant,
    _targetId: string,
    _match: MatchRecord
  ): number {
    const actionId = participant.plan.actionId as ActionId;
    const definition = actionId ? ActionLibrary[actionId] : undefined;
    const usableExtra = definition
      ? getUsableExtraExecutions(participant.character, participant.plan, definition)
      : 0;

    return this.baseDamage + usableExtra;
  }

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
      const targets = collectTargets(actionId, participant, match);
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
        const baseDamage = this.getBaseDamage(participant, targetId, match);
        const dealtAmount = resolveGuardedDamage(baseDamage, guarded);
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
        if (applied <= 0) {
          continue;
        }
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
      if (targetEntries.length === 0) {
        continue;
      }
      const action: ReplayActionDone = {
        actionId,
        damageDealt: totalDamage,
        effects: this.effectType,
      };
      if (participant.character.position?.coord) {
        action.originLocation = participant.character.position.coord;
      }
      if (participant.plan.targetLocationId) {
        action.targetLocation = participant.plan.targetLocationId;
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
