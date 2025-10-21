/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { PlayerCharacter, PlayerPlannedAction } from "@shared";

export type PlannedActionKey = "main" | "secondary";

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

export function applyActionEnergyCost(
  character: PlayerCharacter,
  cost: number
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
  const health = stats.health;
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
  if (!exhausted || !health || typeof health.current !== "number") {
    return outcome;
  }
  const nextHealth = Math.max(0, health.current - 1);
  outcome.healthLost = health.current - nextHealth;
  health.current = nextHealth;
  return outcome;
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
