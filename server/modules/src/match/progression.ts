import type { PlayerCharacter } from "@shared";

export interface ExperienceAward {
  experienceGained: number;
  levelsGained: number;
}

export function awardExperience(
  character: PlayerCharacter,
  amount: number
): ExperienceAward {
  const progression = character.progression ?? {
    level: 1,
    experience: 0,
    experienceForNextLevel: 10,
    availableSkillPoints: 0,
    spentSkillPoints: 0
  };
  progression.level = Math.min(10, Math.max(1, progression.level || 1));
  progression.experience = Math.max(0, progression.experience || 0);
  progression.availableSkillPoints = Math.max(
    0,
    progression.availableSkillPoints || 0
  );
  progression.spentSkillPoints = Math.max(0, progression.spentSkillPoints || 0);

  const gained = Math.max(0, Math.floor(amount));
  progression.experience += gained;
  let levelsGained = 0;
  while (progression.level < 10 && progression.experience >= 10) {
    progression.experience -= 10;
    progression.level += 1;
    progression.availableSkillPoints += 1;
    levelsGained += 1;
  }
  progression.experienceForNextLevel = progression.level >= 10 ? 0 : 10;
  if (progression.level >= 10) {
    progression.experience = Math.min(progression.experience, 9);
  }
  character.progression = progression;
  return { experienceGained: gained, levelsGained };
}
