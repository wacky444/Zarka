import Phaser from "phaser";
import { ActionLibrary, type ActionDefinition } from "@shared";
import { t } from "../services/i18n";
import { ItemTooltipManager } from "./ItemTooltip";
import { THEME } from "./ColorPalette";
import { describeAction } from "./panel/CharacterPanelActionOptions";

const LONG_PRESS_MS = 450;
const MODAL_DEPTH = 12000;

type PressState = {
  pointerId: number;
  startX: number;
  startY: number;
  action?: ActionDefinition;
  moved: boolean;
  longPressed: boolean;
  velocityY: number;
  lastMoveTime: number;
  timer?: Phaser.Time.TimerEvent;
};

export class ActionOrderHelpModal {
  private readonly root: Phaser.GameObjects.Container;
  private readonly cover: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly content: Phaser.GameObjects.Container;
  private readonly tooltip: ItemTooltipManager;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly subtitleText: Phaser.GameObjects.Text;
  private readonly closeButton: Phaser.GameObjects.Text;
  private maskShape: Phaser.GameObjects.Rectangle | null = null;
  private mask: Phaser.Display.Masks.GeometryMask | null = null;
  private press: PressState | null = null;
  private scrollVelocityY = 0;
  private isOpen = false;
  private contentHeight = 0;
  private viewport = { x: 0, y: 0, width: 0, height: 0 };
  private selectedIds = new Set<string>();
  private onOpen?: () => void;
  private onClose?: () => void;

  private readonly handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    const press = this.press;
    if (!press || press.pointerId !== pointer.id) return;
    const deltaY = pointer.y - press.startY;
    if (Math.abs(pointer.x - press.startX) > 8 || Math.abs(deltaY) > 8) {
      press.moved = true;
      if (press.timer) {
        this.scene.time.removeEvent(press.timer);
        press.timer = undefined;
      }
    }
    if (!press.moved || this.viewport.height <= 0) return;
    const now = this.scene.time.now;
    const elapsed = Math.max(8, now - press.lastMoveTime);
    const instantVelocity = Phaser.Math.Clamp(deltaY / elapsed, -2, 2);
    press.velocityY = press.velocityY * 0.35 + instantVelocity * 0.65;
    press.lastMoveTime = now;
    const minY = this.viewport.y - Math.max(0, this.contentHeight - this.viewport.height);
    this.content.y = Phaser.Math.Clamp(this.content.y + deltaY, minY, this.viewport.y);
    press.startY = pointer.y;
  };

  private readonly handlePointerUp = (pointer: Phaser.Input.Pointer): void => {
    const press = this.press;
    if (!press || press.pointerId !== pointer.id) return;
    if (press.timer) this.scene.time.removeEvent(press.timer);
    if (!press.moved && !press.longPressed && press.action) {
      this.showActionTooltip(pointer, press.action);
    }
    const moveAge = this.scene.time.now - press.lastMoveTime;
    this.scrollVelocityY = press.moved && moveAge < 90 ? press.velocityY : 0;
    this.press = null;
  };

  private readonly handleScrollMomentum = (_time: number, delta: number): void => {
    if (!this.isOpen || Math.abs(this.scrollVelocityY) < 0.025) {
      this.scrollVelocityY = 0;
      return;
    }
    const minY = this.viewport.y - Math.max(0, this.contentHeight - this.viewport.height);
    const nextY = this.content.y + this.scrollVelocityY * Math.min(delta, 50);
    const clampedY = Phaser.Math.Clamp(nextY, minY, this.viewport.y);
    this.content.y = clampedY;
    if (clampedY !== nextY) {
      this.scrollVelocityY = 0;
      return;
    }
    this.scrollVelocityY *= Math.pow(0.92, delta / 16.67);
  };

  private readonly handleEscape = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.isOpen) this.close();
  };

  constructor(private readonly scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(MODAL_DEPTH).setScrollFactor(0);
    this.cover = scene.add.rectangle(0, 0, 1, 1, 0x020617, 0.82)
      .setOrigin(0, 0).setInteractive();
    this.cover.on(Phaser.Input.Events.POINTER_UP, () => this.close());
    this.panel = scene.add.rectangle(0, 0, 1, 1, THEME.colors.modalBackground, 1)
      .setOrigin(0, 0).setStrokeStyle(2, 0x334155, 1).setInteractive();
    this.panel.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.beginPress(pointer);
    });
    this.panel.on(Phaser.Input.Events.POINTER_UP, (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
    this.titleText = scene.add.text(0, 0, t("Orden de sucesos"), {
      fontSize: "20px", color: THEME.colors.modalHeader, fontStyle: "bold"
    }).setOrigin(0, 0);
    this.subtitleText = scene.add.text(0, 0, t("Orden descendente, y dentro de la misma línea, de izquierda a derecha"), {
      fontSize: "13px", color: THEME.colors.modalText, wordWrap: { width: 400 }
    }).setOrigin(0, 0);
    this.closeButton = scene.add.text(0, 0, "×", {
      fontSize: "30px", color: THEME.colors.modalText
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.closeButton.on(Phaser.Input.Events.POINTER_UP, () => this.close());
    this.content = scene.add.container(0, 0);
    this.tooltip = new ItemTooltipManager(scene, MODAL_DEPTH + 1);
    this.root.add([this.cover, this.panel, this.content, this.titleText, this.subtitleText, this.closeButton]);
    this.root.setVisible(false);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.handleScrollMomentum);
    scene.input.keyboard?.on("keydown", this.handleEscape);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
  }

  setCallbacks(onOpen: () => void, onClose: () => void): void {
    this.onOpen = onOpen;
    this.onClose = onClose;
  }

  open(selectedIds: readonly (string | null)[]): void {
    this.selectedIds = new Set(selectedIds.filter((id): id is string => Boolean(id)));
    this.build();
    this.isOpen = true;
    this.root.setVisible(true);
    this.onOpen?.();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.scrollVelocityY = 0;
    this.cancelPress();
    this.tooltip.hide();
    this.root.setVisible(false);
    this.onClose?.();
  }

  destroy(): void {
    this.close();
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.handlePointerUp);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.handleScrollMomentum);
    this.scene.input.keyboard?.off("keydown", this.handleEscape);
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.mask?.destroy();
    this.maskShape?.destroy();
    this.tooltip.destroy();
    this.root.destroy(true);
  }

  private readonly handleResize = (): void => {
    if (this.isOpen) this.build();
  };

  private build(): void {
    this.scrollVelocityY = 0;
    this.cancelPress();
    this.mask?.destroy();
    this.mask = null;
    this.maskShape?.destroy();
    this.maskShape = null;
    this.content.removeAll(true);

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    this.cover.setSize(width, height).setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    const panelWidth = Math.min(width - 24, 920);
    const panelHeight = Math.min(height - 24, 720);
    const panelX = (width - panelWidth) / 2;
    const panelY = (height - panelHeight) / 2;
    this.panel.setPosition(panelX, panelY).setSize(panelWidth, panelHeight).setInteractive(
      new Phaser.Geom.Rectangle(0, 0, panelWidth, panelHeight),
      Phaser.Geom.Rectangle.Contains,
    );
    this.titleText.setPosition(panelX + 18, panelY + 14);
    this.subtitleText.setWordWrapWidth(Math.max(120, panelWidth - 92));
    this.subtitleText.setPosition(panelX + 18, panelY + 44);
    this.closeButton.setPosition(panelX + panelWidth - 24, panelY + 23);

    const inset = 14;
    this.viewport = {
      x: panelX + inset,
      y: panelY + 82,
      width: panelWidth - inset * 2,
      height: panelHeight - 96,
    };
    this.maskShape = this.scene.add.rectangle(
      this.viewport.x, this.viewport.y, this.viewport.width, this.viewport.height, 0xffffff, 0
    ).setOrigin(0, 0).setScrollFactor(0);
    this.mask = this.maskShape.createGeometryMask();
    this.content.setPosition(this.viewport.x, this.viewport.y).setMask(this.mask);
    this.root.add(this.maskShape);
    this.root.bringToTop(this.maskShape);
    this.root.bringToTop(this.content);
    const leftInset = 8;
    this.contentHeight = this.drawActions(
      Math.max(0, this.viewport.width - leftInset),
      leftInset,
    );
    this.content.y = this.viewport.y;
  }

  private drawActions(width: number, leftInset: number): number {
    const actions = Object.values(ActionLibrary).sort((a, b) =>
      a.actionOrder - b.actionOrder || a.actionSubOrder - b.actionSubOrder || a.id.localeCompare(b.id)
    );
    const padding = 8;
    const chipHeight = 36;
    const rowGap = 8;
    const arrowWidth = 18;
    let x = leftInset;
    let y = 8;
    let rowHasAction = false;
    let previousOrder: number | null = null;

    for (const action of actions) {
      if (previousOrder !== null && action.actionOrder !== previousOrder) {
        x = leftInset;
        y += chipHeight + rowGap;
        rowHasAction = false;
      }
      previousOrder = action.actionOrder;
      const name = t(action.name);
      const measure = this.scene.add.text(0, 0, name, { fontSize: "13px", color: "#ffffff" });
      const chipWidth = Math.min(width, Math.max(54, measure.width + padding * 2));
      measure.destroy();
      const neededWidth = chipWidth + (rowHasAction ? arrowWidth : 0);
      if (rowHasAction && x + neededWidth > width) {
        x = leftInset;
        y += chipHeight + rowGap;
        rowHasAction = false;
      }
      if (rowHasAction) {
        const arrow = this.scene.add.text(x + arrowWidth / 2, y + chipHeight / 2, "›", {
          fontSize: "18px", color: THEME.colors.textMuted
        }).setOrigin(0.5).setInteractive();
        this.content.add(arrow);
        this.bindDragSource(arrow);
        x += arrowWidth;
      }

      const selected = this.selectedIds.has(action.id);
      const background = this.scene.add.rectangle(x + chipWidth / 2, y + chipHeight / 2, chipWidth, chipHeight,
        selected ? THEME.colors.cardSelected : THEME.colors.cardBackground, 1)
        .setStrokeStyle(1, selected ? 0x93c5fd : 0x475569, 1)
        .setInteractive({ useHandCursor: true });
      const label = this.scene.add.text(x + chipWidth / 2, y + chipHeight / 2, name, {
        fontSize: "13px",
        color: selected ? "#bfdbfe" : THEME.colors.textPrimary,
        align: "center",
        wordWrap: { width: Math.max(34, chipWidth - padding * 2) },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      this.content.add([background, label]);
      this.bindDragSource(background, action);
      this.bindDragSource(label, action);
      x += chipWidth;
      rowHasAction = true;
    }
    return y + chipHeight + padding;
  }

  private bindDragSource(
    object: Phaser.GameObjects.GameObject & { on: Phaser.GameObjects.GameObject["on"] },
    action?: ActionDefinition,
  ): void {
    object.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.beginPress(pointer, action);
    });
  }

  private beginPress(pointer: Phaser.Input.Pointer, action?: ActionDefinition): void {
    this.scrollVelocityY = 0;
    this.cancelPress();
    const press: PressState = {
      pointerId: pointer.id,
      startX: pointer.x,
      startY: pointer.y,
      action,
      moved: false,
      longPressed: false,
      velocityY: 0,
      lastMoveTime: this.scene.time.now,
    };
    this.press = press;
    if (action) {
      press.timer = this.scene.time.delayedCall(LONG_PRESS_MS, () => {
        if (this.press === press && !press.moved) {
          press.longPressed = true;
          this.showActionTooltip(pointer, action);
        }
      });
    }
  }

  private showActionTooltip(pointer: Phaser.Input.Pointer, action: ActionDefinition): void {
    const description = describeAction(action).replace(/\[[^\]]+\]/g, "");
    this.tooltip.show(pointer.x, pointer.y, t(action.name), description);
  }

  private cancelPress(): void {
    if (this.press?.timer) this.scene.time.removeEvent(this.press.timer);
    this.press = null;
  }
}
