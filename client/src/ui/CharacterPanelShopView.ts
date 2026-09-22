import Phaser from "phaser";
import {
  ShopLibrary,
  type Axial,
  type MatchRecord,
  type PlayerCharacter,
  type ShopDefinition,
  type ShopId
} from "@shared";
import { PlayerSelector, type PlayerOption } from "./PlayerSelector";
import { GridSelect, type GridSelectItem } from "./GridSelect";
import { t } from "../services/i18n";

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
const SELECTOR_TO_LIST_GAP = 155;
const CARD_PADDING = 12;
const CARD_SPACING = 8;

export class CharacterPanelShopView extends Phaser.Events.EventEmitter {
  private readonly elements: Phaser.GameObjects.GameObject[] = [];
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly headerBox: Phaser.GameObjects.Rectangle;
  private readonly balanceText: Phaser.GameObjects.Text;
  private readonly testamentSelector: PlayerSelector;
  private readonly detectiveSelector: PlayerSelector;
  private readonly droneLocationSelector: GridSelect;
  private readonly scrollContent: Phaser.GameObjects.Container;
  private readonly scrollPanel: ScrollablePanelInstance;
  private readonly scrollMaskShape: Phaser.GameObjects.Rectangle;
  private readonly scrollMask: Phaser.Display.Masks.GeometryMask;
  private readonly cards: ShopCardItem[] = [];
  private currentCharacter: PlayerCharacter | null = null;
  private visible = false;
  private droneLocations = new Map<string, Axial>();
  private locationSelectionShopId:
    | "spy_drone"
    | "pyromaniac"
    | "bomber"
    | null = null;

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

    this.detectiveSelector = new PlayerSelector(
      scene,
      layout.margin + 12,
      selectorY + 72,
      width - 24,
      { confirmSelection: true, confirmLabel: t("Confirm") }
    );
    this.detectiveSelector.setLabel(t("Detective target"));
    this.detectiveSelector.on("change", (targetPlayerId: string | null) => {
      if (targetPlayerId) {
        this.emit("shop-purchase", {
          shopId: "detective" as ShopId,
          targetPlayerId
        });
      }
    });
    this.detectiveSelector.on("modal-open", () => this.emit("modal-open"));
    this.detectiveSelector.on("modal-close", () => this.emit("modal-close"));
    this.detectiveSelector.setVisible(false);
    this.detectiveSelector.setActive(false);
    parent.add(this.detectiveSelector);

    this.droneLocationSelector = new GridSelect(scene, 0, 0, {
      width: width - 24,
      title: t("Select location"),
      subtitle: t("Choose target location"),
      placeholder: t("Select target"),
      columns: 2,
      cellHeight: 96,
      autoSelectFirst: false,
      confirmSelection: true,
      confirmLabel: t("Confirm")
    });
    this.droneLocationSelector.on(
      "change",
      (locationId: string | null) => {
        const location = locationId
          ? this.droneLocations.get(locationId)
          : undefined;
        if (location && this.locationSelectionShopId) {
          this.emit("shop-purchase", {
            shopId: this.locationSelectionShopId,
            targetLocation: location
          });
        }
      }
    );
    this.droneLocationSelector.on("modal-open", () => this.emit("modal-open"));
    this.droneLocationSelector.on("modal-close", () => this.emit("modal-close"));
    this.droneLocationSelector.setVisible(false);
    this.droneLocationSelector.setActive(false);
    parent.add(this.droneLocationSelector);

    const listTop = selectorY + SELECTOR_TO_LIST_GAP;
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
    const rawScrollPanel = this.scrollPanel as unknown as {
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
    this.scrollContent.setScrollFactor(0);
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
      this.detectiveSelector,
      this.droneLocationSelector,
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
    this.detectiveSelector.setOptions(options);
    this.detectiveSelector.setValue(null, false);
    this.updateDroneLocationOptions(match);
    const zarkans = this.currentCharacter?.economy?.zarkans ?? 0;
    this.balanceText.setText(`Zarkans: ${Math.max(0, Math.floor(zarkans))}`);
    const enabled = Boolean(
      this.currentCharacter &&
        !this.currentCharacter.statuses?.conditions?.includes("dead") &&
        !this.currentCharacter.testamentProcessed
    );
    this.testamentSelector.setEnabled(enabled);
    this.testamentSelector.setActive(enabled);
    this.detectiveSelector.setEnabled(enabled);
    this.detectiveSelector.setActive(false);
    this.droneLocationSelector.setEnabled(enabled);
    this.droneLocationSelector.setActive(false);
  }

  beginDetectivePurchase(): void {
    const canPurchase = Boolean(
      this.currentCharacter &&
        !this.currentCharacter.statuses?.conditions?.includes("dead")
    );
    if (!canPurchase) {
      return;
    }
    this.detectiveSelector.setVisible(true);
    this.detectiveSelector.setActive(true);
    this.detectiveSelector.setEnabled(true);
  }

  finishDetectivePurchase(): void {
    this.detectiveSelector.hideDropdown();
    this.detectiveSelector.setValue(null, false);
    this.detectiveSelector.setVisible(false);
    this.detectiveSelector.setActive(false);
  }

  beginSpyDronePurchase(): void {
    if (!this.currentCharacter || this.currentCharacter.statuses?.conditions?.includes("dead")) {
      return;
    }
    this.locationSelectionShopId = "spy_drone";
    this.droneLocationSelector.setVisible(true);
    this.droneLocationSelector.setActive(true);
    this.droneLocationSelector.setEnabled(true);
  }

  beginPyromaniacPurchase(): void {
    if (!this.currentCharacter || this.currentCharacter.statuses?.conditions?.includes("dead")) {
      return;
    }
    this.locationSelectionShopId = "pyromaniac";
    this.droneLocationSelector.setVisible(true);
    this.droneLocationSelector.setActive(true);
    this.droneLocationSelector.setEnabled(true);
  }

  beginBomberPurchase(): void {
    if (!this.currentCharacter || this.currentCharacter.statuses?.conditions?.includes("dead")) {
      return;
    }
    this.locationSelectionShopId = "bomber";
    this.droneLocationSelector.setVisible(true);
    this.droneLocationSelector.setActive(true);
    this.droneLocationSelector.setEnabled(true);
  }

  finishShopPurchase(): void {
    this.finishDetectivePurchase();
    this.locationSelectionShopId = null;
    this.droneLocationSelector.hideModal();
    this.droneLocationSelector.setValue(null, false);
    this.droneLocationSelector.setVisible(false);
    this.droneLocationSelector.setActive(false);
  }

  closeModal(): void {
    this.testamentSelector.hideDropdown();
    this.detectiveSelector.hideDropdown();
    this.droneLocationSelector.hideModal();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.background.setVisible(visible);
    this.headerBox.setVisible(visible);
    this.balanceText.setVisible(visible);
    this.testamentSelector.setVisible(visible);
    if (!visible) {
      this.finishShopPurchase();
    }
    this.detectiveSelector.setVisible(visible && this.detectiveSelector.active);
    this.droneLocationSelector.setVisible(
      visible && this.droneLocationSelector.active
    );
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
    this.detectiveSelector.setPosition(options.margin + 12, selectorY + 72);
    this.detectiveSelector.setSelectorWidth(width - 24);
    this.droneLocationSelector.setPosition(options.margin + 12, selectorY + 72);
    this.droneLocationSelector.setDisplayWidth(width - 24);

    const listTop = selectorY + SELECTOR_TO_LIST_GAP;
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
    this.detectiveSelector.destroy();
    this.droneLocationSelector.destroy();
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
    const cardHeight = Math.max(
      110,
      54 +
        description.height +
        CARD_PADDING +
        (definition.implemented ? 32 : 0)
    );
    const card = this.scene.add
      .rectangle(0, startY, cardWidth, cardHeight, 0x202b4a, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x2f3a5d, 0.9)
      .setInteractive({ useHandCursor: false });
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
      .text(cardWidth - CARD_PADDING, startY + 38, t("Not Implemented"), {
        fontSize: "11px",
        color: "#f87171"
      })
      .setOrigin(1, 0.5)
      .setVisible(!definition.implemented);
    const buyBackground = definition.implemented
      ? this.scene.add
          .rectangle(
            cardWidth - CARD_PADDING - 76,
            startY + cardHeight - 26,
            76,
            22,
            0x16a34a,
            1
          )
          .setOrigin(0, 0)
          .setStrokeStyle(1, 0x4ade80, 1)
          .setInteractive({ useHandCursor: true })
      : null;
    const buyText = definition.implemented
      ? this.scene.add
          .text(
            cardWidth - CARD_PADDING - 38,
            startY + cardHeight - 15,
            t("Buy"),
            {
              fontSize: "12px",
              color: "#ffffff",
              fontStyle: "bold"
            }
          )
          .setOrigin(0.5)
      : null;
    const forwardWheel = (
      _pointer: Phaser.Input.Pointer,
      _dx: number,
      dy: number
    ) => {
      this.scrollPanel.addChildOY?.(-dy * 0.35, true);
    };
    card.on(Phaser.Input.Events.POINTER_WHEEL, forwardWheel);
    buyBackground?.on(Phaser.Input.Events.POINTER_WHEEL, forwardWheel);
    buyBackground?.on(Phaser.Input.Events.POINTER_UP, () => {
      this.beginShopPurchase(definition.id);
    });
    this.scrollContent.add(card);
    this.scrollContent.add(name);
    this.scrollContent.add(cost);
    if (category) this.scrollContent.add(category);
    this.scrollContent.add(status);
    this.scrollContent.add(description);
    if (buyBackground) {
      this.scrollContent.add(buyBackground);
      this.scrollContent.bringToTop(buyBackground);
    }
    if (buyText) {
      this.scrollContent.add(buyText);
      this.scrollContent.bringToTop(buyText);
    }
    this.cards.push({ definition, statusBadge: status });
    return cardHeight;
  }

  private beginShopPurchase(shopId: ShopId): void {
    if (shopId === "detective") {
      this.beginDetectivePurchase();
    } else if (shopId === "spy_drone") {
      this.beginSpyDronePurchase();
    } else if (shopId === "pyromaniac") {
      this.beginPyromaniacPurchase();
    } else if (shopId === "bomber") {
      this.beginBomberPurchase();
    } else if (shopId === "security_camera_app") {
      this.emit("shop-purchase", { shopId });
    }
  }

  private updateDroneLocationOptions(match: MatchRecord | null): void {
    this.droneLocations = new Map<string, Axial>();
    const items: GridSelectItem[] = [];
    for (const tile of match?.map?.tiles ?? []) {
      if (!tile?.coord || tile.meta?.destroyed) {
        continue;
      }
      const id = `${tile.coord.q}:${tile.coord.r}`;
      if (this.droneLocations.has(id)) {
        continue;
      }
      this.droneLocations.set(id, {
        q: tile.coord.q,
        r: tile.coord.r
      });
      items.push({
        id,
        name: `${t("Location")} (${tile.coord.q}, ${tile.coord.r})`,
        description: tile.localizationType,
        texture: "hex",
        frame: "grass_01.png"
      });
    }
    this.droneLocationSelector.setItems(items);
    this.droneLocationSelector.setValue(null, false);
  }
}
