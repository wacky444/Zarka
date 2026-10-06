import {
  SkillLibrary,
  type PlayerCharacter,
  type SkillCategory,
  type SkillDefinition,
  type SkillId
} from "@shared";
import type { MatchRecord } from "../models/types";
import { isCharacterDead } from "../utils/playerCharacter";

export function applySkillToCharacter(
  character: PlayerCharacter,
  skillId: SkillId
): void {
  const definition = SkillLibrary[skillId];
  if (!definition) {
    return;
  }
  const progression = character.progression ?? {
    level: 1,
    experience: 0,
    experienceForNextLevel: 10,
    availableSkillPoints: 0,
    spentSkillPoints: 0
  };
  progression.availableSkillPoints = Math.max(
    0,
    (progression.availableSkillPoints ?? 0) - definition.cost
  );
  progression.spentSkillPoints =
    (progression.spentSkillPoints ?? 0) + definition.cost;
  character.progression = progression;

  character.abilities = Array.isArray(character.abilities)
    ? [...character.abilities, skillId]
    : [skillId];

  const effect = definition.effect;
  if (!effect) {
    return;
  }

  if (!character.stats) {
    character.stats = {
      health: { current: 10, max: 12, knockoutThreshold: 5, injuredMax: 5 },
      energy: { current: 10, max: 20 },
      load: { current: 0, max: 25 },
      speed: 0,
      sympathy: 0,
      baseViewRange: 0
    };
  }

  if (effect.type === "max_health_increase") {
    if (!character.stats.health) {
      character.stats.health = {
        current: 10,
        max: 12,
        knockoutThreshold: 5,
        injuredMax: 5
      };
    }
    character.stats.health.max += effect.value;
  } else if (effect.type === "max_load_increase") {
    if (!character.stats.load) {
      character.stats.load = {
        current: 3,
        max: 25,
        bandolierCapacityBonus: 0
      };
    }
    character.stats.load.max += effect.value;
  } else if (effect.type === "speed_increase") {
    const currentSpeed =
      typeof character.stats.speed === "number" &&
      isFinite(character.stats.speed)
        ? character.stats.speed
        : 0;
    character.stats.speed = currentSpeed + effect.value;
  } else if (effect.type === "set_knockout_threshold") {
    if (!character.stats.health) {
      character.stats.health = {
        current: 10,
        max: 12,
        knockoutThreshold: 5,
        injuredMax: 5
      };
    }
    character.stats.health.knockoutThreshold = effect.value;
    character.stats.health.injuredMax = effect.value;
  }
}

export interface RandomSkillAssignmentOptions {
  allowedCategories?: readonly SkillCategory[];
  categoryWeights?: Partial<Record<SkillCategory, number>>;
  random?: () => number;
}

function chooseWeightedSkill(
  candidates: SkillDefinition[],
  categoryWeights: Partial<Record<SkillCategory, number>> | undefined,
  random: () => number
): SkillDefinition | undefined {
  const totalWeight = candidates.reduce(
    (sum, candidate) =>
      sum + (categoryWeights?.[candidate.category] ?? 1),
    0
  );
  if (totalWeight <= 0) {
    return undefined;
  }
  const threshold = random() * totalWeight;
  let accumulated = 0;
  for (const candidate of candidates) {
    accumulated += categoryWeights?.[candidate.category] ?? 1;
    if (threshold < accumulated) {
      return candidate;
    }
  }
  return candidates[candidates.length - 1];
}

export function assignRandomSkillsUntilZero(
  character: PlayerCharacter,
  options: RandomSkillAssignmentOptions = {}
): SkillId[] {
  const random = options.random ?? Math.random;
  const assigned: SkillId[] = [];
  while ((character.progression?.availableSkillPoints ?? 0) > 0) {
    const available = character.progression!.availableSkillPoints;
    const currentAbilities = character.abilities ?? [];
    const abilityCounts: Record<string, number> = {};
    for (const id of currentAbilities) {
      abilityCounts[id] = (abilityCounts[id] ?? 0) + 1;
    }

    const candidates = Object.values(SkillLibrary).filter((def) => {
      if (
        !def.implemented ||
        def.cost > available ||
        (options.allowedCategories &&
          !options.allowedCategories.includes(def.category))
      ) {
        return false;
      }
      const weight = options.categoryWeights?.[def.category] ?? 1;
      const count = abilityCounts[def.id] ?? 0;
      return Number.isFinite(weight) && weight > 0 && count < def.max;
    });

    const chosen = chooseWeightedSkill(
      candidates,
      options.categoryWeights,
      random
    );
    if (!chosen) {
      break;
    }
    applySkillToCharacter(character, chosen.id);
    assigned.push(chosen.id);
  }
  return assigned;
}

export function assignAfkSkillPoints(match: MatchRecord): void {
  for (const playerId of match.players ?? []) {
    const character = match.playerCharacters?.[playerId];
    if (!character || isCharacterDead(character)) {
      continue;
    }
    if ((character.progression?.availableSkillPoints ?? 0) > 0) {
      assignRandomSkillsUntilZero(character);
    }
  }
}
