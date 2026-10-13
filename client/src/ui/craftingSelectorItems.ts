import { CRAFTABLE_ITEMS, ItemLibrary, type ItemId } from "@shared";
import type { GridSelectItem } from "./GridSelect";
import { resolveItemTexture } from "./itemIcons";

export function parseCraftingProductSelection(value: string | null): ItemId | null {
  return CRAFTABLE_ITEMS.find((itemId) => itemId === value) ?? null;
}

export function buildCraftingProductItems(
  requirementWarning: string | null,
  textureResolver: typeof resolveItemTexture = resolveItemTexture
): GridSelectItem[] {
  return CRAFTABLE_ITEMS.map((itemId) => {
    const definition = ItemLibrary[itemId];
    const visual = textureResolver(definition);
    return {
      id: itemId,
      name: definition.name,
      description: definition.description,
      texture: visual.texture,
      frame: visual.frame,
      missingRequirement: requirementWarning
    };
  });
}
