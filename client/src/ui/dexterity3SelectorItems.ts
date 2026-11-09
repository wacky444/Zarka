import { DEXTERITY3_PRODUCTS, ItemLibrary, type Dexterity3ProductId, type PlayerCharacter } from "@shared";
import type { GridSelectItem } from "./GridSelect";
import { resolveItemTexture } from "./itemIcons";
import { t } from "../services/i18n";

export interface Dexterity3CooldownState {
  cooldownRemaining: number;
  isOnCooldown: boolean;
  label: string;
}

export function getDexterity3CooldownState(
  character: PlayerCharacter | null | undefined,
  currentTurn: number
): Dexterity3CooldownState {
  const hasDexterity3 = character?.abilities?.includes("dexterity3") === true;
  const availableOnTurn = character?.dexterity3AvailableOnTurn ?? 0;
  const turn = typeof currentTurn === "number" ? currentTurn : 0;
  const cooldownRemaining = Math.max(0, availableOnTurn - turn);
  const isOnCooldown = hasDexterity3 && cooldownRemaining > 0;
  const label = isOnCooldown
    ? `${t("Dexterity 3")} (${t("CD")}: ${cooldownRemaining})`
    : t("Dexterity 3");
  return {
    cooldownRemaining,
    isOnCooldown,
    label,
  };
}

export function shouldShowDexterity3ActionSelector(
  selectedAction: string | null,
  character: PlayerCharacter | null | undefined
): boolean {
  if (selectedAction !== "dexterity3") {
    return false;
  }
  const abilities = Array.isArray(character?.abilities)
    ? character.abilities
    : [];
  return abilities.includes("dexterity3");
}

export function shouldShowDexterity3ExtraSelector(
  selectedAction: string | null,
  character: PlayerCharacter | null | undefined
): boolean {
  if (selectedAction !== "dexterity3") {
    return false;
  }
  const abilities = Array.isArray(character?.abilities)
    ? character.abilities
    : [];
  return abilities.includes("dexterity3");
}

export function parseDexterity3Product(value: string | null): Dexterity3ProductId | null {
  return DEXTERITY3_PRODUCTS.find((itemId) => itemId === value) ?? null;
}

export function buildDexterity3ProductItems(): GridSelectItem[] {
  return DEXTERITY3_PRODUCTS.map((itemId) => {
    const definition = ItemLibrary[itemId];
    const visual = resolveItemTexture(definition);
    return {
      id: itemId,
      name: definition.name,
      description: definition.description,
      texture: visual.texture,
      frame: visual.frame,
      weight: definition.weight,
    };
  });
}
