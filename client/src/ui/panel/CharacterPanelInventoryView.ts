import Phaser from "phaser";
import type { PlayerCharacter } from "@shared";
import { InventoryGrid } from "../InventoryGrid";
import type { InventoryGridItem } from "../InventoryGrid";
import { buildInventoryGridItems } from "./CharacterPanelItemOptions";
import { THEME } from "../ColorPalette";

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
  private readonly loadCurrentText: Phaser.GameObjects.Text;
  private readonly loadRemainderText: Phaser.GameObjects.Text;
  private readonly grid: InventoryGrid;
  private readonly elements: Phaser.GameObjects.GameObject[];
  private isVisible = false;
  private hasLoad = false;

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

    this.loadCurrentText = scene.add
      .text(layout.margin + 12, layout.contentTop + 12, "", {
        fontSize: "16px",
        color: THEME.colors.textPrimary
      })
      .setOrigin(0, 0)
      .setVisible(false);
    parent.add(this.loadCurrentText);

    this.loadRemainderText = scene.add
      .text(layout.margin + 12, layout.contentTop + 12, "", {
        fontSize: "16px",
        color: THEME.colors.textPrimary
      })
      .setOrigin(0, 0)
      .setVisible(false);
    parent.add(this.loadRemainderText);

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
    this.elements = [
      this.background,
      this.title,
      this.grid
    ];
  }

  getElements(): Phaser.GameObjects.GameObject[] {
    return this.elements;
  }

  setActive(active: boolean): void {
    this.grid.setActive(active);
    if (active) {
      this.grid.refreshLayout();
    }
    this.setVisible(active);
  }

  setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.background.setVisible(visible);
    this.title.setVisible(visible);
    this.grid.setVisible(visible);
    this.updateLoadVisibility();
  }

  private updateLoadVisibility(): void {
    const showLoad = this.isVisible && this.hasLoad;
    this.loadCurrentText.setVisible(showLoad);
    this.loadRemainderText.setVisible(showLoad);
  }

  update(character: PlayerCharacter | null): void {
    if (!character) {
      this.hasLoad = false;
      this.title.setText("Inventory");
      this.loadCurrentText.setText("");
      this.loadRemainderText.setText("");
      this.updateLoadVisibility();
      this.updateLoadTextPosition();
      this.grid.setItems([]);
      this.grid.refreshLayout();
      return;
    }
    const load = character.stats?.load;
    this.hasLoad = Boolean(load);
    if (load) {
      const current = normalizeWeight(load.current);
      const max = normalizeWeight(load.max);
      this.title.setText("Inventory (Load ");
      this.loadCurrentText
        .setText(`${current}`)
        .setColor(
          load.current > load.max
            ? THEME.colors.healthDamage
            : load.max > 0 && load.current > load.max * 0.75
              ? THEME.colors.warning
              : THEME.colors.textPrimary
        );
      this.loadRemainderText.setText(`/${max})`);
    } else {
      this.title.setText("Inventory");
      this.loadCurrentText.setText("");
      this.loadRemainderText.setText("");
    }
    this.updateLoadVisibility();
    this.updateLoadTextPosition();
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
    this.updateLoadTextPosition();
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
    this.loadRemainderText.destroy();
    this.loadCurrentText.destroy();
    this.title.destroy();
    this.background.destroy();
  }

  private updateLoadTextPosition(): void {
    const loadX = this.title.x + this.title.width;
    this.loadCurrentText.setPosition(loadX, this.title.y);
    this.loadRemainderText.setPosition(
      loadX + this.loadCurrentText.width,
      this.title.y
    );
  }
}

function normalizeWeight(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value * 100) / 100);
}
