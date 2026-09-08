import type { ActionId } from "../Action";
import type { PlayerCharacter } from "../playerCharacter";
import { SkillLibrary } from "./SkillLibrary";

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
  return character.abilities.indexOf("resilience4") !== -1;
}
