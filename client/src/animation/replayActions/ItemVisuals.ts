import { ItemLibrary, type ItemId } from "@shared";
import { resolveItemTexture } from "../../ui/itemIcons";

type ItemVisual = { texture: string; frame?: string };

export function resolveItemVisual(itemType: ItemId | null): ItemVisual | null {
  if (!itemType) {
    return null;
  }
  const definition = ItemLibrary[itemType as keyof typeof ItemLibrary];
  if (!definition) {
    return null;
  }
  return resolveItemTexture(definition);
}

export function resolveItemLabel(itemType: ItemId | null): string {
  if (!itemType) {
    return "?";
  }
  const definition = ItemLibrary[itemType as keyof typeof ItemLibrary];
  if (!definition) {
    return itemType;
  }
  return definition.name ?? itemType;
}
