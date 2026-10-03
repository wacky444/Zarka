/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  PlayerCharacter,
  ReplayActionTarget,
  ReplayPlayerEvent,
} from "@shared";
import {
  ReplayActionEffect,
  getDamageReduction,
  getDodgeSuccessChance,
  getSkillRank,
} from "@shared";
import {
  applyHealthDelta,
  buildGuardedEffectMask,
  getInventoryDamageReduction,
  hasCarriedItem,
  isTargetProtected,
  mergeCharacterState,
  resolveGuardedDamage,
} from "./utils";
import { isCharacterDead } from "../../utils/playerCharacter";

export interface CounterAttackWeapon {
  actionId: ActionId;
  baseDamage: number;
  metadata?: Record<string, unknown>;
}

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

export function selectVengefulWeapon(
  character: PlayerCharacter
): CounterAttackWeapon {
  const options: CounterAttackWeapon[] = [];

  if (hasCarriedItem(character, "knife")) {
    options.push({ actionId: "knife_attack", baseDamage: 4 });
  }

  const hasNailBat = hasCarriedItem(character, "nail_bat");
  const hasBat = hasCarriedItem(character, "bat");
  if (hasNailBat || hasBat) {
    options.push({
      actionId: "bat_attack",
      baseDamage: hasNailBat ? 7 : 5,
      metadata: { weaponUsed: hasNailBat ? "nail_bat" : "bat" },
    });
  }

  if (hasCarriedItem(character, "axe")) {
    options.push({ actionId: "axe_attack", baseDamage: 8 });
  }

  if (options.length === 0) {
    return { actionId: "punch", baseDamage: 2 };
  }

  const selectedIndex = Math.floor(Math.random() * options.length);
  return options[selectedIndex];
}

export function maybeTriggerVengefulCounterAttack(
  match: MatchRecord,
  aggressorId: string,
  targetId: string,
  isCounterAttack?: boolean
): ReplayPlayerEvent[] {
  if (isCounterAttack === true) {
    return [];
  }
  if (!aggressorId || !targetId || aggressorId === targetId) {
    return [];
  }

  const defender = match.playerCharacters?.[targetId];
  if (!defender || getSkillRank(defender, "vengeful") <= 0) {
    return [];
  }

  if (isCharacterDead(defender)) {
    return [];
  }

  const aggressor = match.playerCharacters?.[aggressorId];
  if (!aggressor || isCharacterDead(aggressor)) {
    return [];
  }

  const defenderCoord = defender.position?.coord;
  const aggressorCoord = aggressor.position?.coord;
  if (
    !defenderCoord ||
    !aggressorCoord ||
    typeof defenderCoord.q !== "number" ||
    typeof defenderCoord.r !== "number" ||
    typeof aggressorCoord.q !== "number" ||
    typeof aggressorCoord.r !== "number" ||
    defenderCoord.q !== aggressorCoord.q ||
    defenderCoord.r !== aggressorCoord.r
  ) {
    return [];
  }

  const weapon = selectVengefulWeapon(defender);
  const postEvents: ReplayPlayerEvent[] = [];

  let applied = 0;
  let targetEntry: ReplayActionTarget;

  if (resolveDodge(aggressor)) {
    match.playerCharacters[aggressorId] = aggressor;
    targetEntry = {
      targetId: aggressorId,
      damageTaken: 0,
      effects: ReplayActionEffect.Dodged,
    };
  } else {
    const guarded = isTargetProtected(aggressor);
    const guardedDamage = resolveGuardedDamage(weapon.baseDamage, guarded);
    const damageReduction =
      getDamageReduction(aggressor) +
      getInventoryDamageReduction(aggressor, "physical");
    const dealtAmount = Math.max(0, guardedDamage - damageReduction);

    const {
      result: healthChange,
      character: updatedAggressor,
      event: healthEvent,
    } = applyHealthDelta(aggressor, -dealtAmount);

    mergeCharacterState(aggressor, updatedAggressor);
    match.playerCharacters[aggressorId] = aggressor;

    if (healthEvent) {
      postEvents.push(healthEvent);
    }

    applied = Math.max(0, -healthChange.delta);
    const eliminated =
      healthChange.current === 0 && healthChange.previous > 0;

    targetEntry = {
      targetId: aggressorId,
      damageTaken: applied,
      effects: buildGuardedEffectMask(guarded),
      ...(eliminated ? { eliminated: true } : {}),
    };
  }

  if (getSkillRank(defender, "coward") > 0) {
    defender.cowardRevealedTurn = match.current_turn;
    match.playerCharacters[targetId] = defender;
  }

  const actionMetadata: Record<string, unknown> = {
    isCounterAttack: true,
    ...(weapon.metadata ?? {}),
  };

  const counterEvent: ReplayPlayerEvent = {
    kind: "player",
    actorId: targetId,
    action: {
      actionId: weapon.actionId,
      damageDealt: applied,
      effects: ReplayActionEffect.Hit,
      originLocation: defender.position?.coord,
      metadata: actionMetadata,
    },
    targets: [targetEntry],
  };

  return [counterEvent, ...postEvents];
}
