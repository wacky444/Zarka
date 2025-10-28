/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type {
  ActionId,
  PlayerCharacter,
  PlayerConditionFlag,
  PlayerPlannedAction,
  ReplayPlayerEvent,
} from "@shared";

export type PlannedActionKey = "main" | "secondary";

const INJURED_MAX_HP = 5;

export interface PlannedActionParticipant {
  playerId: string;
  character: PlayerCharacter;
  plan: PlayerPlannedAction;
  planKey: PlannedActionKey;
}

export interface ActionEnergyOutcome {
  energySpent: number;
  healthLost: number;
  exhausted: boolean;
}

export interface HealthChangeResult {
  previous: number;
  current: number;
  delta: number;
  max: number;
  unconscious: boolean;
  becameUnconscious: boolean;
}

export interface HealthDeltaOutcome {
  character: PlayerCharacter;
  result: HealthChangeResult;
  event?: ReplayPlayerEvent;
}

const STATUS_UNCONSCIOUS_ACTION_ID: ActionId = "status_unconscious";

export function applyHealthDelta(
  character: PlayerCharacter,
  delta: number,
  canDamageUnconscious: boolean = false
): HealthDeltaOutcome {
  const stats = character.stats;
  const health = stats?.health;
  if (!health) {
    return {
      character,
      result: {
        previous: 0,
        current: 0,
        delta: 0,
        max: 0,
        unconscious: false,
        becameUnconscious: false,
      },
    };
  }
  const previousHP =
    typeof health.current === "number" && isFinite(health.current)
      ? health.current
      : 0;
  const max =
    typeof health.max === "number" && isFinite(health.max)
      ? health.max
      : Math.max(previousHP, 0);
  const baseStatuses = character.statuses ?? { conditions: [] };
  const baseConditions = Array.isArray(baseStatuses.conditions)
    ? baseStatuses.conditions
    : [];
  const conditions = [...baseConditions];
  const statuses = { ...baseStatuses, conditions };
  const actionPlan = character.actionPlan
    ? { ...character.actionPlan }
    : undefined;
  const knockoutThreshold =
    typeof health.knockoutThreshold === "number" &&
    isFinite(health.knockoutThreshold)
      ? health.knockoutThreshold
      : INJURED_MAX_HP;
  const injuredMax =
    typeof health.injuredMax === "number" && isFinite(health.injuredMax)
      ? health.injuredMax
      : INJURED_MAX_HP;
  const isUnconscious: boolean = conditions.indexOf("unconscious") !== -1;
  const injuredCap = injuredMax > 0 ? injuredMax : INJURED_MAX_HP;
  let nextMaxHP = health.max;
  let nextCurrent: number;
  let nextActionPlan = actionPlan;

  if (delta < 0 && isUnconscious && !canDamageUnconscious) {
    nextMaxHP = Math.min(nextMaxHP, injuredCap);
    nextCurrent = Math.min(previousHP, nextMaxHP);
  } else {
    nextCurrent = Math.max(0, previousHP + delta);
    nextCurrent = Math.min(nextCurrent, nextMaxHP);
  }

  const unconscious = nextCurrent > 0 && nextCurrent <= knockoutThreshold;
  const becameUnconscious = unconscious && previousHP > knockoutThreshold;

  if (becameUnconscious) {
    ensureCondition(conditions, "unconscious");
    ensureCondition(conditions, "injured");
    nextMaxHP = Math.min(nextMaxHP, injuredCap);
    nextCurrent = Math.min(nextCurrent, nextMaxHP);
    nextActionPlan = undefined;
  }

  const result: HealthChangeResult = {
    previous: previousHP,
    current: nextCurrent,
    delta: nextCurrent - previousHP,
    max: nextMaxHP,
    unconscious: conditions.indexOf("unconscious") !== -1,
    becameUnconscious,
  };

  const nextHealth = {
    ...health,
    current: nextCurrent,
    max: nextMaxHP,
  };

  const nextStats = {
    ...character.stats,
    health: nextHealth,
  };

  const nextCharacter: PlayerCharacter = {
    ...character,
    stats: nextStats,
    statuses,
  };

  if (nextActionPlan) {
    nextCharacter.actionPlan = nextActionPlan;
  } else if ("actionPlan" in nextCharacter) {
    delete nextCharacter.actionPlan;
  }

  const event = becameUnconscious
    ? createUnconsciousReplayEvent(
        character.id,
        result.previous,
        result.current
      )
    : undefined;

  return {
    character: nextCharacter,
    result,
    event,
  };
}

export function applyActionEnergyCost(
  character: PlayerCharacter,
  cost: number,
  logger: nkruntime.Logger
): ActionEnergyOutcome {
  const outcome: ActionEnergyOutcome = {
    energySpent: 0,
    healthLost: 0,
    exhausted: false,
  };
  const stats = character.stats;
  if (!stats) {
    return outcome;
  }
  const energy = stats.energy as typeof stats.energy & {
    activeTemporary?: number;
  };
  const effectiveCost = cost > 0 ? cost : 0;
  if (!energy) {
    return outcome;
  }
  const tempAvailable =
    typeof energy.activeTemporary === "number" && energy.activeTemporary > 0
      ? energy.activeTemporary
      : 0;
  let remainingCost = effectiveCost;
  let tempConsumed = 0;
  if (tempAvailable > 0 && remainingCost > 0) {
    tempConsumed = Math.min(tempAvailable, remainingCost);
    energy.activeTemporary = Math.max(0, tempAvailable - tempConsumed);
    remainingCost -= tempConsumed;
  }
  const previousEnergy =
    typeof energy.current === "number" ? energy.current : 0;
  const nextEnergy = Math.max(0, previousEnergy - remainingCost);
  energy.current = nextEnergy;
  outcome.energySpent = tempConsumed + (previousEnergy - nextEnergy);
  const totalAvailableBefore = tempAvailable + previousEnergy;
  const exhausted =
    totalAvailableBefore <= 0 ||
    totalAvailableBefore < effectiveCost ||
    (effectiveCost === 0 && totalAvailableBefore <= 0);
  outcome.exhausted = exhausted;
  // debug log
  logger.debug("exhausted Action energy cost:", outcome, exhausted);
  if (!exhausted) {
    // TODO mirar si es por esto que no baja la vida
    return outcome;
  }
  const healthOutcome = applyHealthDelta(character, -1);
  logger.debug("exhausted healthOutcome:", healthOutcome);

  mergeCharacterState(character, healthOutcome.character);
  outcome.healthLost = Math.max(0, -healthOutcome.result.delta);

  logger.debug("exhausted outcome after health:", outcome);

  return outcome;
}

export function mergeCharacterState(
  target: PlayerCharacter,
  source: PlayerCharacter
): void {
  target.stats = source.stats;
  target.statuses = source.statuses;
  if (source.actionPlan !== undefined) {
    target.actionPlan = source.actionPlan;
  } else if ("actionPlan" in target) {
    delete target.actionPlan;
  }
}

export function clearMainPlan(character: PlayerCharacter): void {
  if (!character.actionPlan) {
    return;
  }
  delete character.actionPlan.main;
  if (
    character.actionPlan.secondary === undefined &&
    character.actionPlan.nextMain === undefined &&
    character.actionPlan.main === undefined
  ) {
    delete character.actionPlan;
  }
}

export function clearSecondaryPlan(character: PlayerCharacter): void {
  if (!character.actionPlan) {
    return;
  }
  delete character.actionPlan.secondary;
  if (
    character.actionPlan.secondary === undefined &&
    character.actionPlan.nextMain === undefined &&
    character.actionPlan.main === undefined
  ) {
    delete character.actionPlan;
  }
}

export function clearPlanByKey(
  character: PlayerCharacter,
  key: PlannedActionKey
): void {
  if (key === "secondary") {
    clearSecondaryPlan(character);
  } else {
    clearMainPlan(character);
  }
}

export function clearAllPlans(character: PlayerCharacter): void {
  if (!character.actionPlan) {
    return;
  }
  delete character.actionPlan;
}

function ensureCondition(
  conditions: PlayerConditionFlag[],
  flag: PlayerConditionFlag
): void {
  if (conditions.indexOf(flag) === -1) {
    conditions.push(flag);
  }
}

function createUnconsciousReplayEvent(
  actorId: string | undefined,
  previous: number,
  current: number
): ReplayPlayerEvent | undefined {
  if (!actorId) {
    return undefined;
  }
  return {
    kind: "player",
    actorId,
    action: {
      actionId: STATUS_UNCONSCIOUS_ACTION_ID,
      metadata: {
        previous,
        current,
      },
    },
  };
}
