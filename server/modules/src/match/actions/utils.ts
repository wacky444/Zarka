/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { PlayerCharacter, PlayerPlannedAction } from "@shared";

export interface PlannedActionParticipant {
  playerId: string;
  character: PlayerCharacter;
  plan: PlayerPlannedAction;
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
  const energy = stats.energy;
  const health = stats.health;
  const effectiveCost = cost > 0 ? cost : 0;
  const previousEnergy =
    typeof energy?.current === "number" ? energy.current : 0;
  const nextEnergy = Math.max(0, previousEnergy - effectiveCost);
  if (energy) {
    energy.current = nextEnergy;
  }
  outcome.energySpent = previousEnergy - nextEnergy;
  const exhausted =
    previousEnergy <= 0 ||
    previousEnergy < effectiveCost ||
    (effectiveCost === 0 && previousEnergy <= 0);
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
