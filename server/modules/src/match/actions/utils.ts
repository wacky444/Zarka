/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type {
  ActionId,
  PlayerCharacter,
  PlayerConditionFlag,
  PlayerPlannedAction,
  ReplayActionEffectMask,
  ReplayPlayerEvent,
  Axial,
} from "@shared";
import { ReplayActionEffect } from "@shared";
import type { MatchRecord } from "../../models/types";
import { isCharacterDead } from "../../utils/playerCharacter";

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
  event?: ReplayPlayerEvent;
}

export interface HealthChangeResult {
  previous: number;
  current: number;
  delta: number;
  max: number;
  unconscious: boolean;
  becameUnconscious: boolean;
  dead: boolean;
  becameDead: boolean;
}

export interface HealthDeltaOutcome {
  character: PlayerCharacter;
  result: HealthChangeResult;
  event?: ReplayPlayerEvent;
}

export function isTargetProtected(
  target: PlayerCharacter | undefined
): boolean {
  const conditions = target?.statuses?.conditions;
  return Array.isArray(conditions) && conditions.indexOf("protected") !== -1;
}

export function resolveGuardedDamage(
  baseDamage: number,
  guarded: boolean
): number {
  if (!guarded) {
    return baseDamage;
  }
  const reduction = Math.ceil(baseDamage / 3);
  const dealt = baseDamage - reduction;
  return dealt > 0 ? dealt : 0;
}

export function buildGuardedEffectMask(
  guarded: boolean,
  baseMask: ReplayActionEffectMask = ReplayActionEffect.Hit
): ReplayActionEffectMask {
  return guarded ? baseMask | ReplayActionEffect.Guard : baseMask;
}

export type FailedActionReason = "missing_item";

export interface FailedActionDetails {
  reason: FailedActionReason;
  missingItemId?: string;
}

export function createFailedActionEvent(
  participant: PlannedActionParticipant,
  attemptedActionId: ActionId,
  details: FailedActionDetails
): ReplayPlayerEvent {
  return {
    kind: "player",
    actorId: participant.playerId,
    action: {
      actionId: "failedAction",
      metadata: {
        attemptedActionId,
        ...details,
      },
    },
  };
}

export function shuffleParticipants<T extends PlannedActionParticipant>(
  participants: T[]
): T[] {
  const roster = participants.slice();
  for (let i = roster.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = roster[i];
    roster[i] = roster[j];
    roster[j] = tmp;
  }
  return roster;
}

export interface PlanTargetOptions {
  fallbackToSelf?: boolean;
}

export interface PlanDestination {
  tileId: string;
  coord: Axial;
}

export function collectPlanTargetIds(
  participant: PlannedActionParticipant,
  match: MatchRecord,
  options?: PlanTargetOptions
): string[] {
  const characters = match.playerCharacters ?? {};
  const requested = participant.plan.targetPlayerIds ?? [];
  const targets: string[] = [];
  for (const candidate of requested) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      continue;
    }
    if (!characters[candidate]) {
      continue;
    }
    if (targets.indexOf(candidate) === -1) {
      targets.push(candidate);
    }
  }
  if (targets.length === 0 && options?.fallbackToSelf !== false) {
    targets.push(participant.playerId);
  }
  return targets;
}

export function resolvePlanDestination(
  match: MatchRecord,
  plan: PlayerPlannedAction
): PlanDestination | undefined {
  const target = plan.targetLocationId;
  if (!target) {
    return undefined;
  }
  const tiles = match.map?.tiles ?? [];
  for (const entry of tiles) {
    if (entry.coord.q === target.q && entry.coord.r === target.r) {
      return {
        tileId: entry.id,
        coord: { q: target.q, r: target.r },
      };
    }
  }
  return {
    tileId: `hex_${target.q}_${target.r}`,
    coord: { q: target.q, r: target.r },
  };
}

export function hasCarriedItem(
  character: PlayerCharacter,
  itemId: string,
  minimumQuantity: number = 1
): boolean {
  if (!itemId) {
    return false;
  }
  const carried = character.inventory?.carriedItems;
  if (!Array.isArray(carried) || carried.length === 0) {
    return false;
  }
  return carried.some(
    (stack) =>
      !!stack &&
      stack.itemId === itemId &&
      typeof stack.quantity === "number" &&
      stack.quantity >= minimumQuantity
  );
}

const STATUS_UNCONSCIOUS_ACTION_ID: ActionId = "status_unconscious";
const STATUS_DEAD_ACTION_ID: ActionId = "status_dead";

export function applyHealthDelta(
  character: PlayerCharacter,
  delta: number,
  canDamageUnconscious: boolean = false,
  logger: any = undefined
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
        dead: false,
        becameDead: false,
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
  const wasUnconscious = conditions.indexOf("unconscious") !== -1;
  const wasDead = isCharacterDead(character);
  const injuredCap = injuredMax > 0 ? injuredMax : INJURED_MAX_HP;
  let nextMaxHP = health.max;
  let nextCurrent: number;
  let nextActionPlan = actionPlan;

  if (delta < 0 && wasUnconscious && !canDamageUnconscious) {
    nextMaxHP = Math.min(nextMaxHP, injuredCap);
    nextCurrent = Math.min(previousHP, nextMaxHP);
  } else {
    nextCurrent = Math.max(0, previousHP + delta);
    nextCurrent = Math.min(nextCurrent, nextMaxHP);
  }

  let becameDead = false;
  let isDead = false;
  if (nextCurrent <= 0) {
    isDead = true;
    becameDead = !wasDead && previousHP > 0;
    ensureCondition(conditions, "dead");
    removeCondition(conditions, "unconscious");
    nextMaxHP = Math.min(nextMaxHP, injuredCap);
    nextCurrent = 0;
    nextActionPlan = undefined;
    if (logger) {
      logger.debug("dead character: %s", character.id);
    }
  } else if (wasDead) {
    removeCondition(conditions, "dead");
  }

  const unconscious =
    !isDead && nextCurrent > 0 && nextCurrent <= knockoutThreshold;
  const becameUnconscious =
    !isDead && unconscious && previousHP > knockoutThreshold;

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
    dead: isDead,
    becameDead,
  };

  if (logger) {
    logger.debug("dead HealthChangeResult:", result);
  }

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

  if (logger) {
    logger.debug("dead becameDead:", becameDead);
  }

  const event = becameDead
    ? createDeathReplayEvent(character.id, result.previous, result.current)
    : becameUnconscious
    ? createUnconsciousReplayEvent(
        character.id,
        result.previous,
        result.current
      )
    : undefined;

  if (logger) {
    logger.debug("dead event:", event);
  }

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
  if (!exhausted) {
    return outcome;
  }
  const healthOutcome = applyHealthDelta(character, -1, false, logger);

  mergeCharacterState(character, healthOutcome.character);
  outcome.healthLost = Math.max(0, -healthOutcome.result.delta);
  outcome.event = healthOutcome.event;

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

function removeCondition(
  conditions: PlayerConditionFlag[],
  flag: PlayerConditionFlag
): void {
  const index = conditions.indexOf(flag);
  if (index !== -1) {
    conditions.splice(index, 1);
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

function createDeathReplayEvent(
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
      actionId: STATUS_DEAD_ACTION_ID,
      metadata: {
        previous,
        current,
      },
    },
  };
}
