import Phaser from "phaser";
import {
  ShopLibrary,
  type MatchRecord,
  type PlayerCharacter,
  type ShopDefinition
} from "@shared";
import { PlayerSelector, type PlayerOption } from "./PlayerSelector";

export interface CharacterPanelShopViewLayout {
  margin: number;
  contentTop: number;
  boxWidth: number;
  panelHeight: number;
}

type ScrollablePanelInstance = Phaser.GameObjects.GameObject & {
  layout?: () => void;
  setMouseWheelScrollerEnable?: (enabled: boolean) => void;
  setScrollerEnable?: (enabled: boolean) => void;
  setScrollFactor?: (x: number, y?: number) => Phaser.GameObjects.GameObject;
  setVisible?: (value: boolean) => Phaser.GameObjects.GameObject;
  setMinSize?: (width: number, height: number) => void;
  setSize?: (width: number, height: number) => void;
  setOrigin?: (x: number, y?: number) => Phaser.GameObjects.GameObject;
  setPosition?: (x: number, y: number) => Phaser.GameObjects.GameObject;
  setMask?: (
    mask: Phaser.Display.Masks.BitmapMask | Phaser.Display.Masks.GeometryMask
  ) => Phaser.GameObjects.GameObject;
  clearMask?: (destroyMask?: boolean) => Phaser.GameObjects.GameObject;
  addChildOY?: (inc: number, clamp?: boolean) => void;
};

type ShopCardItem = {
  definition: ShopDefinition;
  statusBadge: Phaser.GameObjects.Text;
};

const HEADER_HEIGHT = 44;
const CARD_PADDING = 12;
const CARD_SPACING = 8;

export class CharacterPanelShopView extends Phaser.Events.EventEmitter {
  private readonly elements: Phaser.GameObjects.GameObject[] = [];
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly headerBox: Phaser.GameObjects.Rectangle;
  private readonly balanceText: Phaser.GameObjects.Text;
  private readonly testamentSelector: PlayerSelector;
  private readonly scrollContent: Phaser.GameObjects.Container;
  private readonly scrollPanel: ScrollablePanelInstance;
  private readonly scrollMaskShape: Phaser.GameObjects.Rectangle;
  private readonly scrollMask: Phaser.Display.Masks.GeometryMask;
  private readonly cards: ShopCardItem[] = [];
  private currentCharacter: PlayerCharacter | null = null;
  private visible = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container,
    layout: CharacterPanelShopViewLayout
  ) {
    super();
    const width = layout.boxWidth;
    const height = Math.max(180, layout.panelHeight - layout.contentTop - layout.margin);

    this.background = scene.add
      .rectangle(layout.margin, layout.contentTop, width, height, 0x1b2440)
      .setOrigin(0, 0)
      .setVisible(false);
    this.background.setStrokeStyle(1, 0x253055, 0.8);
    parent.add(this.background);

    const headerY = layout.contentTop + 8;
    const headerWidth = width - 24;
    this.headerBox = scene.add
      .rectangle(layout.margin + 12, headerY, headerWidth, HEADER_HEIGHT)
      .setOrigin(0, 0)
      .setFillStyle(0x141c33, 0.95)
      .setStrokeStyle(1, 0x2d3a60, 0.9)
      .setVisible(false);
    parent.add(this.headerBox);

    this.balanceText = scene.add
      .text(layout.margin + 24, headerY + HEADER_HEIGHT / 2, "Zarkans: 0", {
        fontSize: "15px",
        color: "#facc15",
        fontStyle: "bold"
      })
      .setOrigin(0, 0.5)
      .setVisible(false);
    parent.add(this.balanceText);

    const selectorY = headerY + HEADER_HEIGHT + 10;
    this.testamentSelector = new PlayerSelector(
      scene,
      layout.margin + 12,
      selectorY,
      width - 24
    );
    this.testamentSelector.setLabel("Testament recipient");
    this.testamentSelector.on("change", (recipientId: string | null) => {
      this.emit("testament-change", recipientId);
    });
    this.testamentSelector.on("modal-open", () => this.emit("modal-open"));
    this.testamentSelector.on("modal-close", () => this.emit("modal-close"));
    this.testamentSelector.setVisible(false);
    this.testamentSelector.setActive(false);
    parent.add(this.testamentSelector);

    const listTop = selectorY + 66;
    const listWidth = width - 24;
    const listHeight = Math.max(100, height - (listTop - layout.contentTop) - 8);
    const matrix = parent.getWorldTransformMatrix();
    this.scrollMaskShape = scene.add
      .rectangle(
        matrix.tx + layout.margin + 12,
        matrix.ty + listTop,
        listWidth,
        listHeight,
        0xffffff,
        0
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setVisible(true);
    this.scrollMask = this.scrollMaskShape.createGeometryMask();
    this.scrollContent = scene.add.container(0, 0);

    this.scrollPanel = scene.rexUI.add.scrollablePanel({
      x: layout.margin + 12,
      y: listTop,
      width: listWidth,
      height: listHeight,
      scrollMode: 0,
      panel: { child: this.scrollContent, mask: false },
      slider: {
        track: scene.rexUI.add.roundRectangle(0, 0, 4, 120, 2, 0x1f2a4a),
        thumb: scene.rexUI.add.roundRectangle(0, 0, 6, 36, 3, 0x3b82f6)
      },
      scroller: {
        threshold: 10,
        rectBoundsInteractive: true,
        slidingDeceleration: 5000,
        backDeceleration: 2000,
        pointerOutRelease: true
      },
      mouseWheelScroller: { focus: 2, speed: 0.35 },
      space: { left: 0, right: 2, top: 0, bottom: 0, panel: 6 }
    }) as ScrollablePanelInstance;
    this.scrollPanel.setOrigin?.(0, 0);
    this.scrollPanel.setScrollFactor?.(0);
    this.scrollPanel.setMask?.(this.scrollMask);
    this.scrollPanel.setVisible?.(false);
    parent.add(this.scrollPanel);

    this.layout(layout);
    this.buildShopList(listWidth - 8);
    this.elements.push(
      this.background,
      this.headerBox,
      this.balanceText,
      this.testamentSelector,
      this.scrollPanel
    );
  }

  getElements(): Phaser.GameObjects.GameObject[] {
    return this.elements;
  }

  update(
    match: MatchRecord | null,
    currentUserId: string | null,
    playerOptions: PlayerOption[]
  ): void {
    this.currentCharacter =
      currentUserId && match?.playerCharacters
        ? match.playerCharacters[currentUserId] ?? null
        : null;
    const options = playerOptions.filter((option) => {
      if (!match || option.id === currentUserId) {
        return false;
      }
      const character = match.playerCharacters?.[option.id];
      return !(
        match.deadCharacters?.[option.id] === true ||
        character?.statuses?.conditions?.includes("dead") ||
        (typeof character?.stats?.health?.current === "number" &&
          character.stats.health.current <= 0)
      );
    });
    this.testamentSelector.setOptions(options);
    this.testamentSelector.setValue(
      this.currentCharacter?.testamentRecipientId ?? null,
      false
    );
    const zarkans = this.currentCharacter?.economy?.zarkans ?? 0;
    this.balanceText.setText(`Zarkans: ${Math.max(0, Math.floor(zarkans))}`);
    const enabled = Boolean(
      this.currentCharacter &&
        !this.currentCharacter.statuses?.conditions?.includes("dead") &&
        !this.currentCharacter.testamentProcessed
    );
    this.testamentSelector.setEnabled(enabled);
    this.testamentSelector.setActive(enabled);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.background.setVisible(visible);
    this.headerBox.setVisible(visible);
    this.balanceText.setVisible(visible);
    this.testamentSelector.setVisible(visible);
    this.scrollPanel.setVisible?.(visible);
    this.setScrollerEnable(visible);
  }

  setScrollerEnable(enabled: boolean): void {
    this.scrollPanel.setMouseWheelScrollerEnable?.(enabled && this.visible);
    this.scrollPanel.setScrollerEnable?.(enabled && this.visible);
  }

  layout(options: CharacterPanelShopViewLayout): void {
    const width = options.boxWidth;
    const height = Math.max(180, options.panelHeight - options.contentTop - options.margin);
    this.background.setPosition(options.margin, options.contentTop);
    this.background.setSize(width, height);
    this.background.setDisplaySize(width, height);

    const headerY = options.contentTop + 8;
    const headerWidth = width - 24;
    this.headerBox.setPosition(options.margin + 12, headerY);
    this.headerBox.setSize(headerWidth, HEADER_HEIGHT);
    this.headerBox.setDisplaySize(headerWidth, HEADER_HEIGHT);
    this.balanceText.setPosition(options.margin + 24, headerY + HEADER_HEIGHT / 2);

    const selectorY = headerY + HEADER_HEIGHT + 10;
    this.testamentSelector.setPosition(options.margin + 12, selectorY);
    this.testamentSelector.setSelectorWidth(width - 24);

    const listTop = selectorY + 66;
    const listWidth = width - 24;
    const listHeight = Math.max(100, height - (listTop - options.contentTop) - 8);
    const matrix = this.parent.getWorldTransformMatrix();
    this.scrollMaskShape.setPosition(
      matrix.tx + options.margin + 12,
      matrix.ty + listTop
    );
    this.scrollMaskShape.setSize(listWidth, listHeight);
    this.scrollPanel.setPosition?.(options.margin + 12, listTop);
    this.scrollPanel.setSize?.(listWidth, listHeight);
    this.scrollPanel.setMinSize?.(listWidth, listHeight);
    this.scrollPanel.layout?.();
  }

  destroy(): void {
    this.scrollPanel.clearMask?.();
    this.scrollMask.destroy();
    this.scrollMaskShape.destroy();
    this.testamentSelector.destroy();
    for (const child of [...this.scrollContent.list]) {
      child.destroy();
    }
    this.scrollContent.removeAll(false);
    for (const element of this.elements) {
      if (!element.active) {
        continue;
      }
      element.destroy();
    }
    this.cards.length = 0;
    this.removeAllListeners();
  }

  private buildShopList(cardWidth: number): void {
    let currentY = 0;
    for (const definition of Object.values(ShopLibrary)) {
      currentY += this.createShopCard(definition, currentY, cardWidth) + CARD_SPACING;
    }
    this.scrollContent.setSize(cardWidth, currentY);
    this.scrollPanel.layout?.();
  }

  private createShopCard(
    definition: ShopDefinition,
    startY: number,
    cardWidth: number
  ): number {
    const textWidth = cardWidth - CARD_PADDING * 2;
    const description = this.scene.add
      .text(CARD_PADDING, startY + 54, definition.description, {
        fontSize: "13px",
        color: "#cbd5f5",
        wordWrap: { width: textWidth, useAdvancedWrap: true },
        lineSpacing: 3
      })
      .setOrigin(0, 0);
    const cardHeight = Math.max(82, 54 + description.height + CARD_PADDING);
    const card = this.scene.add
      .rectangle(0, startY, cardWidth, cardHeight, 0x202b4a, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x2f3a5d, 0.9);
    const name = this.scene.add
      .text(CARD_PADDING, startY + 8, definition.name, {
        fontSize: "15px",
        color: "#ffffff",
        fontStyle: "bold"
      })
      .setOrigin(0, 0);
    const cost = this.scene.add
      .text(
        cardWidth - CARD_PADDING,
        startY + 8,
        definition.costLabel ?? `${definition.cost} zarkans`,
        { fontSize: "12px", color: "#facc15" }
      )
      .setOrigin(1, 0);
    const category = definition.category
      ? this.scene.add
          .text(CARD_PADDING, startY + 28, `[${definition.category}]`, {
            fontSize: "12px",
            color: "#8ea4d2"
          })
          .setOrigin(0, 0)
      : null;
    const status = this.scene.add
      .text(cardWidth - CARD_PADDING, startY + 38, "Not Implemented", {
        fontSize: "11px",
        color: "#f87171"
      })
      .setOrigin(1, 0.5);
    this.scrollContent.add(card);
    this.scrollContent.add(name);
    this.scrollContent.add(cost);
    if (category) this.scrollContent.add(category);
    this.scrollContent.add(status);
    this.scrollContent.add(description);
    this.cards.push({ definition, statusBadge: status });
    return cardHeight;
  }
}
