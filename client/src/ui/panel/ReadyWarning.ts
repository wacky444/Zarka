import Phaser from "phaser";
import { THEME } from "../ColorPalette";

export const WARNING_IMAGE_KEY = "ready-warning-icon";

export interface ReadyWarningConfig {
  scene: Phaser.Scene;
  parent: Phaser.GameObjects.Container;
  x: number;
  y: number;
  text: string;
  color?: string;
  emphasized?: boolean;
  tooltip?: () => string;
  onTooltipRequested?: (message: string, x: number, y: number) => void;
  mobile?: boolean;
}

const ICON_SIZE = 28;

export class ReadyWarning {
  private readonly label: Phaser.GameObjects.Text;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly tooltip?: () => string;
  private readonly onTooltipRequested?: (
    message: string,
    x: number,
    y: number
  ) => void;
  private mobile: boolean;
  private visible = false;
  private readonly color: string;

  constructor(config: ReadyWarningConfig) {
    const {
      scene,
      parent,
      x,
      y,
      text,
      color,
      emphasized,
      tooltip,
      onTooltipRequested,
      mobile,
    } = config;
    this.tooltip = tooltip;
    this.onTooltipRequested = onTooltipRequested;
    this.mobile = mobile ?? false;
    this.color = color ?? THEME.colors.warning;

    this.label = scene.add
      .text(x, y, text, {
        fontSize: "14px",
        color: this.color,
        ...(emphasized
          ? {
              fontStyle: "bold",
              backgroundColor: "#2b211c",
              padding: { x: 6, y: 4 },
            }
          : {}),
      })
      .setOrigin(0, 0)
      .setVisible(false);

    const tintHex = parseInt(this.color.replace("#", ""), 16);
    this.icon = scene.add
      .image(x, y, WARNING_IMAGE_KEY)
      .setOrigin(0, 0)
      .setDisplaySize(ICON_SIZE, ICON_SIZE)
      .setTint(tintHex)
      .setVisible(false);

    if (tooltip && onTooltipRequested) {
      this.label
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.POINTER_OVER, this.handlePointerOver)
        .on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown);

      this.icon
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.POINTER_OVER, this.handlePointerOver)
        .on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown);
    }

    parent.add(this.label);
    parent.add(this.icon);
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this.mobile ? this.icon : this.label;
  }

  getAllGameObjects(): Phaser.GameObjects.GameObject[] {
    return [this.label, this.icon];
  }

  setMobile(mobile: boolean): void {
    if (this.mobile === mobile) {
      return;
    }
    this.mobile = mobile;
    this.applyVisibility();
  }

  getText(): string {
    return this.label.text;
  }

  getHeight(): number {
    return this.mobile ? this.icon.displayHeight : this.label.height;
  }

  setText(text: string): void {
    this.label.setText(text);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.applyVisibility();
  }

  setPosition(x: number, y: number): void {
    this.label.setPosition(x, y);
    this.icon.setPosition(x, y);
  }

  getBounds(): Phaser.Geom.Rectangle {
    return (this.mobile ? this.icon : this.label).getBounds();
  }

  containsPoint(x: number, y: number): boolean {
    return Phaser.Geom.Rectangle.Contains(this.getBounds(), x, y);
  }

  destroy(): void {
    this.label.off(Phaser.Input.Events.POINTER_OVER, this.handlePointerOver);
    this.label.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown);
    this.icon.off(Phaser.Input.Events.POINTER_OVER, this.handlePointerOver);
    this.icon.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown);
    this.label.destroy();
    this.icon.destroy();
  }

  private applyVisibility(): void {
    this.label.setVisible(this.visible && !this.mobile);
    this.icon.setVisible(this.visible && this.mobile);
  }

  private readonly handlePointerOver = (
    pointer: Phaser.Input.Pointer
  ): void => {
    if (!pointer.wasTouch) {
      this.requestTooltip(pointer.x, pointer.y);
    }
  };

  private readonly handlePointerDown = (
    pointer: Phaser.Input.Pointer,
    _localX: number,
    _localY: number,
    event: Phaser.Types.Input.EventData
  ): void => {
    if (pointer.wasTouch) {
      this.requestTooltip(pointer.x, pointer.y);
    }
    event.stopPropagation();
  };

  private requestTooltip(x: number, y: number): void {
    const message = this.tooltip?.();
    if (message) {
      this.onTooltipRequested?.(message, x, y);
    }
  }
}
