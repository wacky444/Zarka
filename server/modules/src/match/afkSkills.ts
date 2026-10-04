import { SkillLibrary, type SkillId, type PlayerCharacter } from "@shared";
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

export function assignRandomSkillsUntilZero(
  character: PlayerCharacter
): SkillId[] {
  const assigned: SkillId[] = [];
  while ((character.progression?.availableSkillPoints ?? 0) > 0) {
    const available = character.progression!.availableSkillPoints;
    const currentAbilities = character.abilities ?? [];
    const abilityCounts: Record<string, number> = {};
    for (const id of currentAbilities) {
      abilityCounts[id] = (abilityCounts[id] ?? 0) + 1;
    }

    const candidates = Object.values(SkillLibrary).filter((def) => {
      if (!def.implemented) {
        return false;
      }
      if (def.cost > available) {
        return false;
      }
      const count = abilityCounts[def.id] ?? 0;
      return count < def.max;
    });

    if (candidates.length === 0) {
      break;
    }

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
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
