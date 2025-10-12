import Phaser from "phaser";

interface TooltipContent {
  title?: string;
  body?: string;
}

export class HoverTooltip {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly padding = 12;
  private readonly maxWidth = 280;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(10001);
    this.container.setVisible(false);
    this.container.setScrollFactor(0);

    this.background = scene.add
      .rectangle(0, 0, this.maxWidth, 10, 0x111827, 0.95)
      .setOrigin(0, 0);

    this.titleText = scene.add
      .text(0, 0, "", {
        fontSize: "16px",
        fontStyle: "bold",
        color: "#f8fafc",
        wordWrap: {
          width: this.maxWidth - this.padding * 2,
          useAdvancedWrap: true,
        },
      })
      .setOrigin(0, 0);

    this.bodyText = scene.add
      .text(0, 0, "", {
        fontSize: "13px",
        color: "#cbd5f5",
        wordWrap: {
          width: this.maxWidth - this.padding * 2,
          useAdvancedWrap: true,
        },
      })
      .setOrigin(0, 0);

    this.container.add(this.background);
    this.container.add(this.titleText);
    this.container.add(this.bodyText);
  }

  getGameObject() {
    return this.container;
  }

  show(x: number, y: number, content: TooltipContent) {
    if (!content.title && !content.body) {
      return;
    }

    const mainCam = this.scene.cameras.main;
    const uiCams = this.scene.cameras.cameras.filter((cam) => cam !== mainCam);
    if (uiCams.length > 0) {
      mainCam.ignore(this.container);
    }


    const availableWidth = this.maxWidth - this.padding * 2;

    if (content.title) {
      this.titleText.setVisible(true);
      this.titleText.setWordWrapWidth(availableWidth, true);
      this.titleText.setText(content.title);
    } else {
      this.titleText.setVisible(false);
      this.titleText.setText("");
    }

    if (content.body) {
      this.bodyText.setVisible(true);
      this.bodyText.setWordWrapWidth(availableWidth, true);
      this.bodyText.setText(content.body);
    } else {
      this.bodyText.setVisible(false);
      this.bodyText.setText("");
    }

    const titleHeight = this.titleText.visible
      ? this.titleText.getBounds().height
      : 0;
    const gap = this.titleText.visible && this.bodyText.visible ? 6 : 0;
    const bodyHeight = this.bodyText.visible
      ? this.bodyText.getBounds().height
      : 0;

    this.titleText.setPosition(this.padding, this.padding);
    this.bodyText.setPosition(this.padding, this.padding + titleHeight + gap);

    const titleWidth = this.titleText.visible
      ? this.titleText.getBounds().width
      : 0;
    const bodyWidth = this.bodyText.visible
      ? this.bodyText.getBounds().width
      : 0;
    const contentWidth = Math.min(
      this.maxWidth,
      Math.max(titleWidth, bodyWidth) + this.padding * 2
    );
    const contentHeight = this.padding * 2 + titleHeight + gap + bodyHeight;

    this.background.setSize(contentWidth, contentHeight);
    this.background.setDisplaySize(contentWidth, contentHeight);

    const offset = 18;
    const { width, height } = this.scene.scale;
    let posX = x + offset;
    let posY = y + offset;

    if (posX + contentWidth > width) {
      posX = width - contentWidth - 12;
    }
    if (posY + contentHeight > height) {
      posY = height - contentHeight - 12;
    }

    this.container.setPosition(posX, posY);
    this.container.setVisible(true);
  }

  hide() {
    this.container.setVisible(false);
  }

  destroy() {
    this.container.destroy(true);
  }
}
