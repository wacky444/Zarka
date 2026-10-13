import Phaser from "phaser";
import { type ItemId } from "@shared";
import { GridSelect } from "./GridSelect";
import {
  buildCraftingProductItems,
  parseCraftingProductSelection
} from "./craftingSelectorItems";

export {
  buildCraftingProductItems,
  parseCraftingProductSelection
} from "./craftingSelectorItems";

export class CraftingSelector extends GridSelect {
  constructor(scene: Phaser.Scene, width: number) {
    super(scene, 0, 0, {
      width,
      title: "Choose crafted item",
      subtitle: "Crafting uses no inventory ingredients",
      placeholder: "Choose item",
      columns: 3,
      desktopMinCellWidth: 170,
      cellHeight: 180,
      mobileCellIcons: true
    });
    this.setItems(buildCraftingProductItems(null));
    this.on("change", (value: string | null) => {
      const itemId = parseCraftingProductSelection(value);
      if (itemId) {
        this.emit("product-selected", itemId);
      }
    });
  }

  setRequirementWarning(warning: string | null): void {
    this.setItems(buildCraftingProductItems(warning));
  }

  getCraftedItemId(): ItemId | null {
    return parseCraftingProductSelection(this.getValue());
  }
}
