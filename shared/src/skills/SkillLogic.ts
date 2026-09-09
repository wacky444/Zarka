import type { ActionId } from "../Action";
import type { PlayerCharacter } from "../playerCharacter";
import { SkillLibrary } from "./SkillLibrary";

const BASE_DODGE_SUCCESS_CHANCE = 0.25;

export function getDodgeSuccessChance(
  character: PlayerCharacter | undefined | null
): number {
  if (!character || !Array.isArray(character.abilities)) {
    return BASE_DODGE_SUCCESS_CHANCE;
  }
  let chance = BASE_DODGE_SUCCESS_CHANCE;
  for (const ability of character.abilities) {
    const effect = SkillLibrary[ability]?.effect;
    if (effect?.type === "dodge_success_chance_increase") {
      chance += effect.value;
    }
  }
  return Math.min(1, Math.max(0, chance));
}

export function getActionEnergyDiscount(
  character: PlayerCharacter | undefined | null,
  actionId: ActionId | string
): number {
  if (!character || !Array.isArray(character.abilities) || character.abilities.length === 0) {
    return 0;
  }
  let discount = 0;
  for (const ability of character.abilities) {
    const definition = SkillLibrary[ability];
    const effect = definition?.effect;
    if (effect && effect.type === "action_energy_discount" && effect.affectedAction) {
      const affects = Array.isArray(effect.affectedAction)
        ? effect.affectedAction.indexOf(actionId as ActionId) !== -1
        : effect.affectedAction === actionId;
      if (affects) {
        discount += effect.value;
      }
    }
  }
  return discount;
}

export function getDamageReduction(
  character: PlayerCharacter | undefined | null
): number {
  if (!character || !Array.isArray(character.abilities) || character.abilities.length === 0) {
    return 0;
  }
  let reduction = 0;
  for (const ability of character.abilities) {
    const definition = SkillLibrary[ability];
    const effect = definition?.effect;
    if (effect && effect.type === "damage_taken_reduction") {
      reduction += effect.value;
    }
  }
  return reduction;
}

export function getKnockoutThreshold(
  character: PlayerCharacter | undefined | null
): number {
  if (!character) {
    return 5;
  }
  let threshold =
    typeof character.stats?.health?.knockoutThreshold === "number" &&
    isFinite(character.stats.health.knockoutThreshold)
      ? character.stats.health.knockoutThreshold
      : 5;
  if (Array.isArray(character.abilities)) {
    for (const ability of character.abilities) {
      const definition = SkillLibrary[ability];
      const effect = definition?.effect;
      if (effect && effect.type === "set_knockout_threshold") {
        threshold = effect.value;
      }
    }
  }
  return threshold;
}

export function hasLethalDamageProtection(
  character: PlayerCharacter | undefined | null
): boolean {
  if (!character || !Array.isArray(character.abilities) || character.abilities.length === 0) {
    return false;
  }
  for (const ability of character.abilities) {
    const definition = SkillLibrary[ability];
    const effect = definition?.effect;
    if (effect && effect.type === "lethal_damage_protection") {
      return true;
    }
  }
  return false;
}
