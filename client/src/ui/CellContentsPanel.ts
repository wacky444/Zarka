import Phaser from "phaser";
import {
  CellLibrary,
  LocalizationType,
  ItemLibrary,
  type Axial,
} from "@shared";
import { t } from "../services/i18n";
import { ItemTooltipManager } from "./ItemTooltip";
import { createCellItemGrid, type CellItemGridEntry } from "./CellItemGrid";
import { makeButton, type UIButton } from "./button";
import { THEME } from "./ColorPalette";

type ScrollablePanelInstance = Phaser.GameObjects.GameObject & {
  layout?: () => void;
  setPosition?: (x: number, y: number) => Phaser.GameObjects.GameObject;
  setDepth?: (depth: number) => Phaser.GameObjects.GameObject;
  setOrigin?: (x: number, y?: number) => Phaser.GameObjects.GameObject;
  setSize?: (width: number, height: number) => Phaser.GameObjects.GameObject;
  setScrollFactor?: (x: number, y?: number) => Phaser.GameObjects.GameObject;
  setScrollerEnable?: (enabled: boolean) => void;
  setMouseWheelScrollerEnable?: (enabled: boolean) => void;
  setMask?: (
    mask: Phaser.Display.Masks.BitmapMask | Phaser.Display.Masks.GeometryMask
  ) => Phaser.GameObjects.GameObject;
  clearMask?: (destroyMask?: boolean) => Phaser.GameObjects.GameObject;
};

export type CellContentsEntry = CellItemGridEntry;

const CELL_TYPE_LABELS: Record<LocalizationType, string> = {
  [LocalizationType.House]: "House",
  [LocalizationType.Pharmacy]: "Pharmacy",
  [LocalizationType.PoliceStation]: "Police station",
  [LocalizationType.Hardware]: "Hardware store",
  [LocalizationType.Factory]: "Factory",
  [LocalizationType.Hospital]: "Hospital",
  [LocalizationType.Workshop]: "Workshop",
  [LocalizationType.Security]: "Security room",
  [LocalizationType.GasStation]: "Gas station",
  [LocalizationType.Market]: "Market",
  [LocalizationType.Restaurant]: "Restaurant",
  [LocalizationType.Road]: "Road",
  [LocalizationType.Path]: "Path",
  [LocalizationType.Alley]: "Alley",
};

export class CellContentsPanel {
  private overlay: Phaser.GameObjects.Container | null = null;
  private content: Phaser.GameObjects.Container | null = null;
  private scrollPanel: ScrollablePanelInstance | null = null;
  private scrollMaskShape: Phaser.GameObjects.Rectangle | null = null;
  private scrollMask: Phaser.Display.Masks.GeometryMask | null = null;
  private isVisible = false;
  private coord: Axial = { q: 0, r: 0 };
  private cellType = LocalizationType.Road;
  private entries: CellContentsEntry[] = [];
  private readonly itemTooltip: ItemTooltipManager;

  private readonly handlePointerDown = (): void => {
    if (this.isVisible) {
      this.itemTooltip.hide();
    }
  };

  constructor(private readonly scene: Phaser.Scene) {
    this.itemTooltip = new ItemTooltipManager(scene, 12005);
    this.scene.input.on(
      Phaser.Input.Events.POINTER_DOWN,
      this.handlePointerDown,
      this
    );
    this.scene.scale.on(
      Phaser.Scale.Events.RESIZE,
      this.handleResize,
      this
    );
  }

  get isOpen(): boolean {
    return this.isVisible;
  }

  show(
    coord: Axial,
    cellType: LocalizationType,
    entries: CellContentsEntry[],
  ): void {
    this.coord = { ...coord };
    this.cellType = cellType;
    this.entries = [...entries];
    this.isVisible = true;
    this.render();
  }

  close(): void {
    if (!this.isVisible) {
      return;
    }
    this.isVisible = false;
    this.itemTooltip.hide();
    this.destroyOverlay();
  }

  destroy(): void {
    this.scene.input.off(
      Phaser.Input.Events.POINTER_DOWN,
      this.handlePointerDown,
      this
    );
    this.scene.scale.off(
      Phaser.Scale.Events.RESIZE,
      this.handleResize,
      this
    );
    this.isVisible = false;
    this.itemTooltip.destroy();
    this.destroyOverlay();
  }

  private readonly handleResize = (): void => {
    if (this.isVisible) {
      this.render();
    }
  };

  private render(): void {
    this.itemTooltip.hide();
    this.destroyOverlay();

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const modalWidth = Math.max(220, Math.min(640, width - 24));
    const modalHeight = Math.max(180, Math.min(640, height - 24));
    const modalX = (width - modalWidth) / 2;
    const modalY = (height - modalHeight) / 2;
    const listWidth = modalWidth - 32;
    const listY = modalY + 96;
    const listHeight = Math.max(64, modalHeight - 152);

    const overlay = this.scene.add.container(0, 0).setDepth(12000);
    overlay.setScrollFactor(0);
    this.scene.cameras.main.ignore(overlay);
    this.overlay = overlay;

    let pointerDownOnCover = false;
    const cover = this.scene.add
      .rectangle(width / 2, height / 2, width, height, 0x020617, 0.78)
      .setInteractive();
    cover.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        pointerDownOnCover = true;
        event.stopPropagation();
      }
    );
    cover.on(
      Phaser.Input.Events.POINTER_MOVE,
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => event.stopPropagation()
    );
    cover.on(
      Phaser.Input.Events.POINTER_UP,
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        if (pointerDownOnCover) {
          pointerDownOnCover = false;
          this.close();
        }
      }
    );
    cover.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _dx: number,
        _dy: number,
        _dz: number,
        event: WheelEvent
      ) => event.stopPropagation()
    );
    overlay.add(cover);

    const background = this.scene.add
      .rectangle(
        width / 2,
        height / 2,
        modalWidth,
        modalHeight,
        THEME.colors.modalBackground,
        1
      )
      .setStrokeStyle(2, 0x334155, 1)
      .setInteractive();
    overlay.add(background);

    const title = this.scene.add
      .text(width / 2, modalY + 24, t("Cell contents"), {
        fontFamily: "Arial",
        fontSize: "22px",
        fontStyle: "bold",
        color: THEME.colors.modalHeader
      })
      .setOrigin(0.5, 0);
    overlay.add(title);

    const subtitle = this.scene.add
      .text(
        width / 2,
        modalY + 56,
        `${t(CELL_TYPE_LABELS[this.cellType])} (${this.coord.q}, ${this.coord.r})`,
        {
          fontFamily: "Arial",
          fontSize: "14px",
          color: THEME.colors.modalText
        }
      )
      .setOrigin(0.5, 0);
    overlay.add(subtitle);

    const content = this.scene.add.container(0, 0);
    this.content = content;
    const rowHeight = Math.max(
      38,
      Math.min(52, Math.floor((listWidth / 5) * 0.78)),
    );
    const actualEntries = this.entries.filter(
      (entry) => ItemLibrary[entry.itemId] && entry.quantity > 0,
    );
    const cellDefinition = CellLibrary[this.cellType];
    const possibleEntries: CellContentsEntry[] = (
      cellDefinition.startingItems ?? []
    ).filter((entry) => ItemLibrary[entry.itemId] && entry.quantity > 0);
    const safeCount = cellDefinition.safes?.length ?? 0;
    if (safeCount > 0) {
      possibleEntries.push({ itemId: "safe", quantity: safeCount });
    }
    let contentHeight = 8;

    const addItemSection = (
      heading: string,
      entries: CellContentsEntry[],
      emptyMessage: string,
    ): void => {
      const sectionHeading = this.scene.add
        .text(12, contentHeight, t(heading), {
          fontFamily: "Arial",
          fontSize: "15px",
          fontStyle: "bold",
          color: THEME.colors.modalHeader,
        })
        .setOrigin(0, 0);
      content.add(sectionHeading);
      contentHeight += 24;

      if (entries.length === 0) {
        const emptyText = this.scene.add
          .text(12, contentHeight + 8, t(emptyMessage), {
            fontFamily: "Arial",
            fontSize: "14px",
            color: THEME.colors.textMuted,
          })
          .setOrigin(0, 0);
        content.add(emptyText);
        contentHeight += rowHeight;
      } else {
        const grid = createCellItemGrid(
          this.scene,
          this.itemTooltip,
          entries,
          0,
          contentHeight,
          listWidth,
          rowHeight,
        );
        content.add(grid.container);
        contentHeight += grid.height;
      }
      contentHeight += 10;
    };

    addItemSection("Items in cell", actualEntries, "No visible items");
    addItemSection(
      "Possible items for this cell",
      possibleEntries,
      "No possible items",
    );
    content.setSize(listWidth, Math.max(contentHeight, 48));

    this.scrollMaskShape = this.scene.add
      .rectangle(
        modalX + 16,
        listY,
        listWidth,
        listHeight,
        0xffffff,
        0
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setVisible(true);
    this.scrollMask = this.scrollMaskShape.createGeometryMask();

    const scrollPanel = this.scene.rexUI.add.scrollablePanel({
      x: modalX + 16,
      y: listY,
      width: listWidth,
      height: listHeight,
      scrollMode: 0,
      panel: { child: content, mask: false },
      slider: {
        track: this.scene.rexUI.add.roundRectangle(0, 0, 4, 120, 2, 0x1f2a4a),
        thumb: this.scene.rexUI.add.roundRectangle(0, 0, 6, 36, 3, 0x3b82f6)
      },
      scroller: {
        threshold: 10,
        rectBoundsInteractive: true,
        slidingDeceleration: 5000,
        backDeceleration: 2000,
        pointerOutRelease: true
      },
      mouseWheelScroller: { focus: 2, speed: 0.45 },
      space: { left: 0, right: 8, top: 0, bottom: 0, panel: 6 }
    }) as ScrollablePanelInstance;
    this.scrollPanel = scrollPanel;
    scrollPanel.setOrigin?.(0, 0);
    scrollPanel.setScrollFactor?.(0);
    scrollPanel.setMask?.(this.scrollMask);
    scrollPanel.setDepth?.(12001);
    this.scene.cameras.main.ignore(scrollPanel);
    const rawScrollPanel = scrollPanel as unknown as {
      childrenMap?: {
        scrollableBlock?: {
          setScrollFactor?: (x: number, y?: number) => void;
          scrollFactorX?: number;
          scrollFactorY?: number;
        };
        child?: {
          setScrollFactor?: (x: number, y?: number) => void;
          scrollFactorX?: number;
          scrollFactorY?: number;
        };
      };
    };
    if (rawScrollPanel.childrenMap?.scrollableBlock) {
      rawScrollPanel.childrenMap.scrollableBlock.setScrollFactor?.(0);
      rawScrollPanel.childrenMap.scrollableBlock.scrollFactorX = 0;
      rawScrollPanel.childrenMap.scrollableBlock.scrollFactorY = 0;
    }
    if (rawScrollPanel.childrenMap?.child) {
      rawScrollPanel.childrenMap.child.setScrollFactor?.(0);
      rawScrollPanel.childrenMap.child.scrollFactorX = 0;
      rawScrollPanel.childrenMap.child.scrollFactorY = 0;
    }
    content.setScrollFactor(0);
    scrollPanel.setScrollerEnable?.(true);
    scrollPanel.setMouseWheelScrollerEnable?.(true);
    scrollPanel.layout?.();

    const closeButton: UIButton = makeButton(
      this.scene,
      width / 2,
      modalY + modalHeight - 30,
      t("Close"),
      () => this.close(),
      ["inMatch"]
    )
      .setOrigin(0.5)
      .setScrollFactor(0);
    overlay.add(closeButton);
  }

  private destroyOverlay(): void {
    this.scrollPanel?.setScrollerEnable?.(false);
    this.scrollPanel?.setMouseWheelScrollerEnable?.(false);
    this.scrollPanel?.clearMask?.();
    this.scrollPanel?.destroy();
    this.scrollPanel = null;
    this.scrollMask?.destroy();
    this.scrollMask = null;
    this.scrollMaskShape?.destroy();
    this.scrollMaskShape = null;
    this.overlay?.destroy(true);
    this.overlay = null;
    if (this.content?.active) {
      this.content.destroy(true);
    }
    this.content = null;
  }
}
