import type { PlayerCharacter } from "@shared";

export function isVirusInfected(character: PlayerCharacter): boolean {
  return (
    character.statuses?.conditions?.includes("infected") === true ||
    character.statuses?.virus?.containsVirus === true ||
    character.statuses?.virus?.contagious === true
  );
}
