import Phaser from "phaser";
import type { PlayerCharacter } from "@shared";
import { InventoryGrid } from "../InventoryGrid";
import type { InventoryGridItem } from "../InventoryGrid";
import { buildInventoryGridItems } from "./CharacterPanelItemOptions";

export interface CharacterPanelInventoryViewLayout {
  margin: number;
  contentTop: number;
  boxWidth: number;
  panelHeight: number;
}

const MIN_BOX_HEIGHT = 360;

export class CharacterPanelInventoryView {
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly grid: InventoryGrid;
  private readonly elements: Phaser.GameObjects.GameObject[];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container,
    layout: CharacterPanelInventoryViewLayout
  ) {
    const boxHeight = Math.max(
      MIN_BOX_HEIGHT,
      layout.panelHeight - layout.contentTop - layout.margin
    );
    this.background = scene.add
      .rectangle(
        layout.margin,
        layout.contentTop,
        layout.boxWidth,
        boxHeight,
        0x1b2440
      )
      .setOrigin(0, 0)
      .setVisible(false);
    this.background.setStrokeStyle?.(1, 0x253055, 0.8);
    parent.add(this.background);

    this.title = scene.add
      .text(layout.margin + 12, layout.contentTop + 12, "Inventory", {
        fontSize: "16px",
        color: "#ffffff"
      })
      .setOrigin(0, 0)
      .setVisible(false);
    parent.add(this.title);

    this.grid = new InventoryGrid(
      scene,
      layout.margin + 12,
      layout.contentTop + 48,
      layout.boxWidth - 24,
      Math.max(0, boxHeight - 60),
      { columns: 2, iconSize: 32 }
    );
    this.grid.setVisible(false);
    this.grid.setActive(false);
    this.grid.setItems([]);
    parent.add(this.grid);
    this.elements = [this.background, this.title, this.grid];
  }

  getElements(): Phaser.GameObjects.GameObject[] {
    return this.elements;
  }

  setActive(active: boolean): void {
    this.grid.setActive(active);
    if (active) {
      this.grid.refreshLayout();
    }
  }

  update(character: PlayerCharacter | null): void {
    if (!character) {
      this.title.setText("Inventory");
      this.grid.setItems([]);
      this.grid.refreshLayout();
      return;
    }
    const load = character.stats?.load;
    this.title.setText(
      load
        ? `Inventory (Load ${normalizeWeight(load.current)}/${normalizeWeight(load.max)})`
        : "Inventory"
    );
    const stacks = Array.isArray(character.inventory?.carriedItems)
      ? character.inventory.carriedItems
      : [];
    const items = buildInventoryGridItems(
      stacks,
      character.economy?.zarkans ?? 0
    );
    this.grid.setItems(items);
    this.grid.refreshLayout();
  }

  layout(layout: CharacterPanelInventoryViewLayout): void {
    const boxHeight = Math.max(
      MIN_BOX_HEIGHT,
      layout.panelHeight - layout.contentTop - layout.margin
    );
    this.background
      .setPosition(layout.margin, layout.contentTop)
      .setSize(layout.boxWidth, boxHeight)
      .setDisplaySize(layout.boxWidth, boxHeight);
    this.title.setPosition(layout.margin + 12, layout.contentTop + 12);
    this.grid.setPosition(layout.margin + 12, layout.contentTop + 48);
    this.grid.setDimensions(
      layout.boxWidth - 24,
      Math.max(0, boxHeight - 60)
    );
  }

  setItems(items: InventoryGridItem[]): void {
    this.grid.setItems(items);
  }

  destroy(): void {
    this.grid.destroy();
    this.title.destroy();
    this.background.destroy();
  }
}

function normalizeWeight(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value * 100) / 100);
}
