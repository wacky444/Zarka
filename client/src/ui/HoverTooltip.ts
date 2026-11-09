import Phaser from "phaser";
import { t } from "../services/i18n";

export interface TooltipContent {
  title?: string;
  body?: string;
  weight?: number | null;
}

export class HoverTooltip {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly weightText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly padding = 12;
  private readonly maxWidth = 280;
  private readonly bounds = new Phaser.Geom.Rectangle();

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

    this.weightText = scene.add
      .text(0, 0, "", {
        fontSize: "13px",
        fontStyle: "bold",
        color: "#94a3b8",
      })
      .setOrigin(1, 0);

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
    this.container.add(this.weightText);
    this.container.add(this.bodyText);
  }

  getGameObject() {
    return this.container;
  }

  show(x: number, y: number, content: TooltipContent) {
    const hasWeight = content.weight !== undefined && content.weight !== null;
    if (!content.title && !content.body && !hasWeight) {
      return;
    }

    const mainCam = this.scene.cameras.main;
    const uiCams = this.scene.cameras.cameras.filter((cam) => cam !== mainCam);
    if (uiCams.length > 0) {
      mainCam.ignore(this.container);
    }

    const availableWidth = this.maxWidth - this.padding * 2;
    const titleGap = 12;

    if (hasWeight) {
      const weightValue = Number.isInteger(content.weight)
        ? content.weight
        : Math.round((content.weight as number) * 10) / 10;
      this.weightText.setVisible(true);
      this.weightText.setText(`${t("Weight")} ${weightValue}`);
    } else {
      this.weightText.setVisible(false);
      this.weightText.setText("");
    }

    const weightWidth = this.weightText.visible
      ? this.weightText.getBounds().width
      : 0;
    const titleAvailableWidth = this.weightText.visible
      ? Math.max(60, availableWidth - weightWidth - titleGap)
      : availableWidth;

    if (content.title) {
      this.titleText.setVisible(true);
      this.titleText.setWordWrapWidth(titleAvailableWidth, true);
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

    const titleWidth = this.titleText.visible
      ? this.titleText.getBounds().width
      : 0;
    const titleRowWidth =
      titleWidth + (this.weightText.visible ? titleGap + weightWidth : 0);
    const bodyWidth = this.bodyText.visible
      ? this.bodyText.getBounds().width
      : 0;
    const contentWidth = Math.min(
      this.maxWidth,
      Math.max(titleRowWidth, bodyWidth) + this.padding * 2
    );

    const titleHeight = Math.max(
      this.titleText.visible ? this.titleText.getBounds().height : 0,
      this.weightText.visible ? this.weightText.getBounds().height : 0
    );
    const gap =
      (this.titleText.visible || this.weightText.visible) &&
      this.bodyText.visible
        ? 6
        : 0;
    const bodyHeight = this.bodyText.visible
      ? this.bodyText.getBounds().height
      : 0;

    this.titleText.setPosition(this.padding, this.padding);
    const weightY = this.titleText.visible
      ? this.padding + 2
      : this.padding;
    this.weightText.setPosition(contentWidth - this.padding, weightY);
    this.bodyText.setPosition(this.padding, this.padding + titleHeight + gap);

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
    if (posX < 12) {
      posX = 12;
    }
    if (posY + contentHeight > height) {
      posY = height - contentHeight - 12;
    }
    if (posY < 12) {
      posY = 12;
    }

    this.bounds.setTo(posX, posY, contentWidth, contentHeight);
    this.scene.children.bringToTop(this.container);
    this.container.setPosition(posX, posY);
    this.container.setVisible(true);
  }

  containsPoint(x: number, y: number): boolean {
    return (
      this.container.visible &&
      Phaser.Geom.Rectangle.Contains(this.bounds, x, y)
    );
  }

  hide() {
    this.container.setVisible(false);
  }

  destroy() {
    this.container.destroy(true);
  }
}
