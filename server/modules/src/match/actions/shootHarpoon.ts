/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  PlayerCharacter,
  ReplayActionDone,
  ReplayActionTarget,
  ReplayPlayerEvent,
} from "@shared";
import {
  ActionLibrary,
  ReplayActionEffect,
  getDamageReduction,
  getDodgeSuccessChance,
} from "@shared";
import {
  applyHealthDelta,
  buildGuardedEffectMask,
  consumeCarriedItem,
  hasCarriedItem,
  isTargetProtected,
  mergeCharacterState,
  resolveGuardedDamage,
  type PlannedActionParticipant,
} from "./utils";
import { getUsableExtraExecutions } from "../../utils/energy";
import { collectTargets } from "./targeting";
import { BaseAction } from "./classes/BaseAction";

function resolveDodge(target: PlayerCharacter): boolean {
  const attempts = target.statuses?.dodgeAttempts ?? 0;
  if (attempts <= 0) {
    return false;
  }
  const isDodged = Math.random() < getDodgeSuccessChance(target);
  if (isDodged && target.statuses) {
    target.statuses.dodgeAttempts = attempts - 1;
  }
  return isDodged;
}

export class ShootHarpoonAction extends BaseAction {
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

      const definition = ActionLibrary[actionId];
      const usableExtra = definition
        ? getUsableExtraExecutions(
            participant.character,
            participant.plan,
            definition
          )
        : 0;
      const canAffordExtraAmmo = hasCarriedItem(
        participant.character,
        "arrow",
        2
      );
      const extraExecutions = usableExtra > 0 && canAffordExtraAmmo ? 1 : 0;
      const arrowsConsumed = 1 + extraExecutions;

      consumeCarriedItem(participant.character, "arrow", arrowsConsumed);

      const targets = collectTargets(actionId, participant, match, {
        allowMultiple: false,
      });

      const targetEntries: ReplayActionTarget[] = [];
      let totalDamage = 0;
      const postEvents: ReplayPlayerEvent[] = [];
      const primaryTargetCandidate = targets[0] ?? null;

      for (const targetCandidate of targets) {
        const targetId = targetCandidate.id;
        const target = match.playerCharacters?.[targetId];
        if (!target) {
          continue;
        }

        if (resolveDodge(target)) {
          match.playerCharacters[targetId] = target;
          targetEntries.push({
            targetId,
            damageTaken: 0,
            effects: ReplayActionEffect.Dodged,
          });
          continue;
        }

        const guarded = isTargetProtected(target);
        const distance = targetCandidate.distance;
        const perShotDamage = distance === 0 ? 7 : 6;
        const baseDamage = perShotDamage * (1 + extraExecutions);
        const guardedDamage = resolveGuardedDamage(baseDamage, guarded);
        const damageReduction = getDamageReduction(target);
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

      const actionMetadata: Record<string, unknown> = {
        weaponUsed: "harpoon",
        arrowsConsumed,
        ...(extraExecutions > 0 ? { extraExecutions } : {}),
      };

      const action: ReplayActionDone = {
        actionId,
        damageDealt: totalDamage,
        effects: ReplayActionEffect.Hit,
        metadata: actionMetadata,
      };

      if (participant.character.position?.coord) {
        action.originLocation = participant.character.position.coord;
      }
      if (participant.plan.targetLocationId) {
        action.targetLocation = participant.plan.targetLocationId;
      } else if (primaryTargetCandidate?.coord) {
        action.targetLocation = primaryTargetCandidate.coord;
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

const shootHarpoonAction = new ShootHarpoonAction();

export function executeShootHarpoonAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return shootHarpoonAction.execute(participants, match);
}
