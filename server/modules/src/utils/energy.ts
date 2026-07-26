import type { ActionDefinition, ActionId, PlayerCharacter } from "@shared";
import { ActionLibrary } from "@shared";

export function getAvailableEnergy(character: PlayerCharacter): number {
  const energy = character.stats?.energy;
  if (!energy) {
    return 0;
  }
  const current =
    typeof energy.current === "number" && isFinite(energy.current)
      ? energy.current
      : 0;
  const energyTrack = energy as typeof energy & { activeTemporary?: number };
  const activeTemp =
    typeof energyTrack.activeTemporary === "number" &&
    isFinite(energyTrack.activeTemporary)
      ? energyTrack.activeTemporary
      : 0;
  const temp =
    typeof energy.temporary === "number" && isFinite(energy.temporary)
      ? energy.temporary
      : 0;
  const total = Math.max(0, current) + Math.max(0, activeTemp) + Math.max(0, temp);
  return total;
}

export function getRequestedExtraExecutions(plan?: {
  extraExecutions?: number;
  extraEffort?: number;
}): number {
  if (!plan) {
    return 0;
  }
  if (
    typeof plan.extraExecutions === "number" &&
    isFinite(plan.extraExecutions)
  ) {
    return Math.floor(Math.max(0, plan.extraExecutions));
  }
  if (typeof plan.extraEffort === "number" && isFinite(plan.extraEffort)) {
    return Math.floor(Math.max(0, plan.extraEffort));
  }
  return 0;
}

export function deductEnergyFromCharacter(
  character: PlayerCharacter,
  cost: number
): number {
  const stats = character.stats;
  if (!stats || cost <= 0) {
    return 0;
  }
  const energy = stats.energy as typeof stats.energy & {
    activeTemporary?: number;
  };
  if (!energy) {
    return 0;
  }
  const tempAvailable =
    typeof energy.activeTemporary === "number" && energy.activeTemporary > 0
      ? energy.activeTemporary
      : 0;
  let remainingCost = cost;
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
  return tempConsumed + (previousEnergy - nextEnergy);
}

export function getUsableExtraExecutions(
  character: PlayerCharacter,
  plan?: {
    extraExecutions?: number;
    extraEffort?: number;
    actionId?: ActionId | string;
  },
  definition?: ActionDefinition,
  deductEnergy: boolean = true
): number {
  const requested = getRequestedExtraExecutions(plan);
  if (requested <= 0) {
    return 0;
  }
  const resolvedDefinition =
    definition ??
    (plan?.actionId ? ActionLibrary[plan.actionId as ActionId] : undefined);
  const costPerRep = resolvedDefinition?.extraExecution?.cost ?? 1;
  if (costPerRep <= 0) {
    return requested;
  }
  const available = getAvailableEnergy(character);
  const maxAffordable = Math.floor(available / costPerRep);
  const usable = Math.min(requested, maxAffordable);
  if (usable > 0 && deductEnergy) {
    deductEnergyFromCharacter(character, usable * costPerRep);
  }
  return Math.max(0, usable);
}
