import Phaser from "phaser";

export interface ModalCloseButtonOptions {
  size?: number;
  depth?: number;
  onClick: () => void;
}

export class ModalCloseButton extends Phaser.GameObjects.Container {
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private isPointerDown = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    options: ModalCloseButtonOptions
  ) {
    super(scene, x, y);
    const size = options.size ?? 36;
    if (options.depth !== undefined) {
      this.setDepth(options.depth);
    }

    this.background = scene.add
      .rectangle(0, 0, size, size, 0x1e293b, 0.95)
      .setOrigin(0.5)
      .setStrokeStyle(1.5, 0x475569, 1)
      .setInteractive({ useHandCursor: true });

    this.label = scene.add
      .text(0, 0, "×", {
        color: "#ffffff",
        fontSize: `${Math.round(size * 0.72)}px`,
        fontStyle: "bold"
      })
      .setOrigin(0.5);

    this.background.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.background.setFillStyle(0x334155, 1);
      this.background.setStrokeStyle(1.5, 0x94a3b8, 1);
    });

    this.background.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.isPointerDown = false;
      this.background.setFillStyle(0x1e293b, 0.95);
      this.background.setStrokeStyle(1.5, 0x475569, 1);
    });

    this.background.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        this.isPointerDown = true;
      }
    );

    this.background.on(
      Phaser.Input.Events.POINTER_UP,
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        if (this.isPointerDown) {
          this.isPointerDown = false;
          options.onClick();
        }
      }
    );

    this.add([this.background, this.label]);
    this.setSize(size, size);
    scene.add.existing(this);
  }

  setButtonSize(size: number): this {
    this.background.setSize(size, size);
    this.label.setFontSize(`${Math.round(size * 0.72)}px`);
    this.setSize(size, size);
    return this;
  }
}
