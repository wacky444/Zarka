import type { PlayerCharacter, PlayerItemStack } from "./playerCharacter";

export const BANDOLIER_MAX_LOAD_BONUS = 5;

export function syncBandolierLoadCapacity(character: PlayerCharacter): void {
  const load = character.stats?.load;
  if (!load) {
    return;
  }
  const hasBandolier = (character.inventory?.carriedItems ?? []).some(
    (item: PlayerItemStack) =>
      item.itemId === "bandolier" &&
      typeof item.quantity === "number" &&
      item.quantity > 0,
  );
  const nextBonus = hasBandolier ? BANDOLIER_MAX_LOAD_BONUS : 0;
  const previousBonus =
    typeof load.bandolierCapacityBonus === "number" &&
    isFinite(load.bandolierCapacityBonus)
      ? Math.max(
          0,
          Math.min(BANDOLIER_MAX_LOAD_BONUS, load.bandolierCapacityBonus),
        )
      : 0;
  const max =
    typeof load.max === "number" && isFinite(load.max) ? load.max : 25;
  load.max = Math.max(0, max + nextBonus - previousBonus);
  load.bandolierCapacityBonus = nextBonus;
}
