import Phaser from "phaser";
import { ItemLibrary, type Axial, type ItemId } from "@shared";
import { t } from "../services/i18n";
import { resolveItemTexture } from "./itemIcons";
import { composeItemDescription, ItemTooltipManager } from "./ItemTooltip";
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

export interface CellContentsEntry {
  itemId: ItemId;
  quantity: number;
}

export class CellContentsPanel {
  private overlay: Phaser.GameObjects.Container | null = null;
  private content: Phaser.GameObjects.Container | null = null;
  private scrollPanel: ScrollablePanelInstance | null = null;
  private scrollMaskShape: Phaser.GameObjects.Rectangle | null = null;
  private scrollMask: Phaser.Display.Masks.GeometryMask | null = null;
  private isVisible = false;
  private coord: Axial = { q: 0, r: 0 };
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

  show(coord: Axial, entries: CellContentsEntry[]): void {
    this.coord = { ...coord };
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
        `(${this.coord.q}, ${this.coord.r})`,
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
    const rowHeight = 60;
    const entries = this.entries.filter(
      (entry) => ItemLibrary[entry.itemId] && entry.quantity > 0
    );
    if (entries.length === 0) {
      const emptyText = this.scene.add
        .text(12, 12, t("No visible items"), {
          fontFamily: "Arial",
          fontSize: "16px",
          color: THEME.colors.textMuted
        })
        .setOrigin(0, 0);
      content.add(emptyText);
      content.setSize(listWidth, 48);
    } else {
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const definition = ItemLibrary[entry.itemId];
        const rowY = index * rowHeight;
        const row = this.scene.add
          .rectangle(0, rowY, listWidth, rowHeight - 6, THEME.colors.cardBackground, 1)
          .setOrigin(0, 0)
          .setStrokeStyle(1, 0x2d3a60, 0.9);
        const textureInfo = resolveItemTexture(definition);
        const iconTexture = this.scene.textures.exists(textureInfo.texture)
          ? textureInfo.texture
          : "hex";
        const iconFrame =
          iconTexture === textureInfo.texture
            ? textureInfo.frame
            : "grass_01.png";
        const icon = this.scene.add.image(
          30,
          rowY + (rowHeight - 6) / 2,
          iconTexture,
          iconFrame
        );
        icon.setDisplaySize(34, 34);
        const showDescription = (pointer: Phaser.Input.Pointer): void => {
          if ((pointer.button !== 0 && !pointer.wasTouch) || pointer.getDistance() > 15) {
            return;
          }
          this.itemTooltip.show(
            pointer.x,
            pointer.y,
            definition.name,
            composeItemDescription(definition.description, definition.notes)
          );
        };
        icon.setInteractive({ useHandCursor: true });
        icon.on(Phaser.Input.Events.POINTER_UP, showDescription);
        const name = this.scene.add
          .text(58, rowY + 12, t(definition.name), {
            fontFamily: "Arial",
            fontSize: "16px",
            color: THEME.colors.textPrimary,
            wordWrap: { width: Math.max(80, listWidth - 144) }
          })
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: true });
        name.on(Phaser.Input.Events.POINTER_UP, showDescription);
        const quantity = this.scene.add
          .text(listWidth - 14, rowY + (rowHeight - 6) / 2, `×${entry.quantity}`, {
            fontFamily: "Arial",
            fontSize: "16px",
            fontStyle: "bold",
            color: THEME.colors.energyCost
          })
          .setOrigin(1, 0.5);
        content.add([row, icon, name, quantity]);
      }
      content.setSize(listWidth, entries.length * rowHeight);
    }

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
    this.scrollPanel?.clearMask?.();
    this.scrollPanel?.destroy(true);
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
