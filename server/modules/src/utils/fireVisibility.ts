import { getSkillRank, type Axial, type PlayerCharacter } from "@shared";
import { canSeeCoord } from "./location";

export function canCharacterDetectFire(
  character: PlayerCharacter | undefined | null,
  fireCoord: Axial
): boolean {
  if (!character) {
    return false;
  }
  if (getSkillRank(character, "perception4") > 0) {
    return true;
  }

  const rawViewRange = character.stats?.baseViewRange;
  const viewRange =
    typeof rawViewRange === "number" && isFinite(rawViewRange)
      ? Math.max(0, Math.floor(rawViewRange))
      : 0;
  return canSeeCoord(fireCoord, character.position?.coord ?? null, viewRange);
}

export function collectFireObserverIds(
  playerCharacters: Record<string, PlayerCharacter> | undefined,
  actorId: string,
  fireCoord: Axial
): string[] {
  const observerIds = [actorId];
  if (!playerCharacters) {
    return observerIds;
  }
  for (const playerId in playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(playerCharacters, playerId)) {
      continue;
    }
    if (
      canCharacterDetectFire(playerCharacters[playerId], fireCoord) &&
      observerIds.indexOf(playerId) === -1
    ) {
      observerIds.push(playerId);
    }
  }
  return observerIds;
}
