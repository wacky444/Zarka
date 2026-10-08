import Phaser from "phaser";
import { THEME } from "../ColorPalette";

export interface ReadyWarningConfig {
  scene: Phaser.Scene;
  parent: Phaser.GameObjects.Container;
  x: number;
  y: number;
  text: string;
  emphasized?: boolean;
  tooltip?: () => string;
  onTooltipRequested?: (message: string, x: number, y: number) => void;
}

export class ReadyWarning {
  private readonly label: Phaser.GameObjects.Text;
  private readonly tooltip?: () => string;
  private readonly onTooltipRequested?: (
    message: string,
    x: number,
    y: number
  ) => void;

  constructor(config: ReadyWarningConfig) {
    const { scene, parent, x, y, text, emphasized, tooltip, onTooltipRequested } =
      config;
    this.tooltip = tooltip;
    this.onTooltipRequested = onTooltipRequested;

    this.label = scene.add
      .text(x, y, text, {
        fontSize: "14px",
        color: THEME.colors.warning,
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

    if (tooltip && onTooltipRequested) {
      this.label
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.POINTER_OVER, this.handlePointerOver)
        .on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown);
    }

    parent.add(this.label);
  }

  get gameObject(): Phaser.GameObjects.Text {
    return this.label;
  }

  setText(text: string): void {
    this.label.setText(text);
  }

  setVisible(visible: boolean): void {
    this.label.setVisible(visible);
  }

  setPosition(x: number, y: number): void {
    this.label.setPosition(x, y);
  }

  getBounds(): Phaser.Geom.Rectangle {
    return this.label.getBounds();
  }

  containsPoint(x: number, y: number): boolean {
    return Phaser.Geom.Rectangle.Contains(this.getBounds(), x, y);
  }

  destroy(): void {
    this.label.off(Phaser.Input.Events.POINTER_OVER, this.handlePointerOver);
    this.label.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown);
    this.label.destroy();
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
