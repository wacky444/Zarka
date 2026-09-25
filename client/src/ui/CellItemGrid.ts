import Phaser from "phaser";
import { ItemLibrary, type ItemId } from "@shared";
import { resolveItemTexture } from "./itemIcons";
import { composeItemDescription, ItemTooltipManager } from "./ItemTooltip";
import { THEME } from "./ColorPalette";

export interface CellItemGridEntry {
  itemId: ItemId;
  quantity: number;
}

const GRID_COLUMNS = 5;

export function createCellItemGrid(
  scene: Phaser.Scene,
  itemTooltip: ItemTooltipManager,
  entries: CellItemGridEntry[],
  x: number,
  y: number,
  width: number,
  rowHeight: number
): { container: Phaser.GameObjects.Container; height: number } {
  const validEntries = entries.filter(
    (entry) => ItemLibrary[entry.itemId] && entry.quantity > 0
  );
  const container = scene.add.container(x, y);
  const cellWidth = width / GRID_COLUMNS;
  const iconSize = Math.max(18, Math.min(32, cellWidth * 0.55, rowHeight - 16));

  for (let index = 0; index < validEntries.length; index += 1) {
    const entry = validEntries[index];
    const definition = ItemLibrary[entry.itemId];
    const row = Math.floor(index / GRID_COLUMNS);
    const column = index % GRID_COLUMNS;
    const cellX = column * cellWidth + cellWidth / 2;
    const cellY = row * rowHeight;
    const background = scene.add
      .rectangle(
        cellX,
        cellY + rowHeight / 2,
        Math.max(1, cellWidth - 4),
        Math.max(1, rowHeight - 4),
        THEME.colors.cardBackground,
        1
      )
      .setStrokeStyle(1, 0x2d3a60, 0.9);
    const textureInfo = resolveItemTexture(definition);
    const iconTexture = scene.textures.exists(textureInfo.texture)
      ? textureInfo.texture
      : "hex";
    const iconFrame =
      iconTexture === textureInfo.texture ? textureInfo.frame : "grass_01.png";
    const topPadding = Math.max(2, (rowHeight - iconSize - 14) / 2);
    const icon = scene.add.image(
      cellX,
      cellY + topPadding + iconSize / 2,
      iconTexture,
      iconFrame
    );
    icon.setDisplaySize(iconSize, iconSize);
    icon.setInteractive({ useHandCursor: true });
    icon.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (
        (pointer.button !== 0 && !pointer.wasTouch) ||
        pointer.getDistance() > 15
      ) {
        return;
      }
      itemTooltip.show(
        pointer.x,
        pointer.y,
        definition.name,
        composeItemDescription(definition.description, definition.notes)
      );
    });
    const quantity = scene.add
      .text(cellX, cellY + rowHeight - 3, `×${entry.quantity}`, {
        fontFamily: "Arial",
        fontSize: "12px",
        fontStyle: "bold",
        color: THEME.colors.energyCost
      })
      .setOrigin(0.5, 1);
    container.add([background, icon, quantity]);
  }

  return {
    container,
    height: Math.ceil(validEntries.length / GRID_COLUMNS) * rowHeight
  };
}
