import Phaser from "phaser";

export interface TopBannerPayload {
  text: string;
  texture?: string;
  frame?: string;
}

export interface TopBannerOptions {
  depth?: number;
  height?: number;
  margin?: number;
  durationMs?: number;
  camera?: Phaser.Cameras.Scene2D.Camera;
}

const DEFAULT_HEIGHT = 76;
const DEFAULT_MARGIN = 24;
const DEFAULT_DURATION_MS = 5000;
const DEFAULT_DEPTH = 5000;

export class TopBanner {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly portrait: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly duration: number;
  private readonly margin: number;
  private readonly height: number;
  private timer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, options: TopBannerOptions = {}) {
    this.scene = scene;
    this.height = Math.max(32, options.height ?? DEFAULT_HEIGHT);
    this.margin = Math.max(8, options.margin ?? DEFAULT_MARGIN);
    this.duration = Math.max(500, options.durationMs ?? DEFAULT_DURATION_MS);
    const depth = options.depth ?? DEFAULT_DEPTH;

    const container = scene.add.container(0, 0);
    container.setDepth(depth);
    container.setScrollFactor(0);
    container.setVisible(false);

    const background = scene.add
      .rectangle(0, 0, scene.scale.width, this.height, 0x200b13, 0.92)
      .setOrigin(0, 0);
    background.setScrollFactor(0);

    const portraitSize = this.height - this.margin;
    const portrait = scene.add
      .image(0, 0, "char", "body_human_white.png")
      .setOrigin(0.5, 0.5)
      .setDisplaySize(portraitSize, portraitSize);
    portrait.setScrollFactor(0);

    const label = scene.add
      .text(0, 0, "", {
        fontSize: "24px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    label.setScrollFactor(0);

    container.add([background, portrait, label]);

    const camera = options.camera;
    if (camera) {
      camera.ignore(container);
    }

    this.container = container;
    this.background = background;
    this.portrait = portrait;
    this.label = label;

    this.layout(scene.scale.width);
  }

  show(payload: TopBannerPayload): void {
    if (payload.texture && payload.frame) {
      this.portrait.setTexture(payload.texture, payload.frame);
      this.portrait.setVisible(true);
    } else {
      this.portrait.setVisible(false);
    }
    this.label.setText(payload.text ?? "");
    this.layout(this.scene.scale.width);
    this.container.setVisible(true);
    if (this.timer) {
      this.timer.remove();
    }
    this.timer = this.scene.time.addEvent({
      delay: this.duration,
      callback: () => this.hide(),
    });
  }

  hide(): void {
    this.container.setVisible(false);
    this.timer = null;
  }

  layout(width: number): void {
    const bannerHeight = this.height;
    const portraitSize = bannerHeight - this.margin;
    const centerY = bannerHeight / 2;
    const hasPortrait = this.portrait.visible;
    const imageX = this.margin + portraitSize / 2;
    const textX = hasPortrait
      ? imageX + portraitSize / 2 + this.margin
      : this.margin;
    const wrapWidth = Math.max(0, width - textX - this.margin);

    this.container.setPosition(0, 0);
    this.background
      .setSize(width, bannerHeight)
      .setDisplaySize(width, bannerHeight);
    this.portrait
      .setDisplaySize(portraitSize, portraitSize)
      .setPosition(imageX, centerY);
    this.label.setPosition(textX, centerY).setWordWrapWidth(wrapWidth);
  }

  destroy(): void {
    this.timer?.remove();
    this.timer = null;
    this.container.destroy(true);
  }
}
