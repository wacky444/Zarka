import { DEXTERITY3_PRODUCTS, ItemLibrary, type Dexterity3ProductId } from "@shared";
import type { GridSelectItem } from "./GridSelect";
import { resolveItemTexture } from "./itemIcons";

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
    };
  });
}
