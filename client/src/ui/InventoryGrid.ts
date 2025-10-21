import Phaser from "phaser";

export interface InventoryGridItem {
  id: string;
  name: string;
  category?: string;
  description: string;
  notes?: string[];
  quantity: number;
  totalWeight: number;
  weightPerItem: number;
  texture: string;
  frame?: string;
}

interface InventoryGridOptions {
  columns?: number;
  columnGap?: number;
  rowGap?: number;
  padding?: number;
  cardHeight?: number;
  iconSize?: number;
}

const DEFAULT_CARD_HEIGHT = 132;
const DEFAULT_ICON_SIZE = 56;
const BACKGROUND_COLOR = 0x212b4a;
const BORDER_COLOR = 0x2c3a64;
const TITLE_COLOR = "#ffffff";
const META_COLOR = "#a5b4fc";
const BODY_COLOR = "#cbd5f5";

export class InventoryGrid extends Phaser.GameObjects.Container {
  private readonly options: Required<InventoryGridOptions>;
  private items: InventoryGridItem[] = [];
  private cards: Phaser.GameObjects.Container[] = [];
  private containerWidth: number;
  private containerHeight: number;
  private emptyLabel: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    options: InventoryGridOptions = {}
  ) {
    super(scene, x, y);
    scene.add.existing(this);
    this.containerWidth = width;
    this.containerHeight = height;
    this.setSize(width, height);
    this.options = {
      columns: Math.max(1, options.columns ?? 2),
      columnGap: options.columnGap ?? 16,
      rowGap: options.rowGap ?? 16,
      padding: options.padding ?? 8,
      cardHeight: options.cardHeight ?? DEFAULT_CARD_HEIGHT,
      iconSize: options.iconSize ?? DEFAULT_ICON_SIZE,
    };

    this.emptyLabel = scene.add
      .text(width / 2, height / 2, "No items carried.", {
        fontSize: "14px",
        color: "#94a3b8",
      })
      .setOrigin(0.5, 0.5);
    this.add(this.emptyLabel);
  }

  override destroy(fromScene?: boolean) {
    this.clearCards();
    super.destroy(fromScene);
  }

  setItems(items: InventoryGridItem[]) {
    this.items = items.slice();
    this.rebuild();
  }

  refreshLayout() {
    this.layoutCards();
  }

  setDimensions(width: number, height: number) {
    this.containerWidth = Math.max(1, width);
    this.containerHeight = Math.max(1, height);
    this.setSize(this.containerWidth, this.containerHeight);
    this.layoutEmptyLabel();
    this.layoutCards();
  }

  private rebuild() {
    this.clearCards();
    if (this.items.length === 0) {
      this.emptyLabel.setVisible(true);
      this.emptyLabel.setActive(true);
      this.layoutEmptyLabel();
      return;
    }
    this.emptyLabel.setVisible(false);
    this.emptyLabel.setActive(false);
    for (const item of this.items) {
      const card = this.buildCard(item);
      this.cards.push(card);
      this.add(card);
    }
    this.layoutCards();
  }

  private clearCards() {
    for (const card of this.cards) {
      card.destroy(true);
    }
    this.cards = [];
  }

  private layoutCards() {
    if (this.cards.length === 0) {
      this.layoutEmptyLabel();
      return;
    }
    const { columns, columnGap, rowGap, padding, cardHeight } = this.options;
    const usableWidth = Math.max(
      1,
      this.containerWidth - padding * 2 - columnGap * (columns - 1)
    );
    const cardWidth = usableWidth / columns;
    this.cards.forEach((card, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + col * (cardWidth + columnGap);
      const y = padding + row * (cardHeight + rowGap);
      card.setPosition(x, y);
    });
  }

  private buildCard(item: InventoryGridItem) {
    const card = this.scene.add.container(0, 0);
    const { cardHeight, iconSize } = this.options;
    const cardWidth = this.computeCardWidth();
    const bg = this.scene.add
      .rectangle(0, 0, cardWidth, cardHeight, BACKGROUND_COLOR, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(1, BORDER_COLOR, 0.8);
    const icon = this.scene.add
      .image(4, iconSize / 2 + 4, item.texture, item.frame)
      .setOrigin(0, 0.5);
    this.updateIconSize(icon, iconSize);
    const textStartX = icon.x + icon.displayWidth + 4;
    const textMaxWidth = Math.max(170, cardWidth - textStartX - 16);
    const nameText = this.scene.add
      .text(textStartX, 4, item.name, {
        fontSize: "17px",
        color: TITLE_COLOR,
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    const metaParts = [] as string[];
    if (item.quantity > 1) {
      metaParts.push(`x${item.quantity}`);
    }
    const weightLabel = this.formatWeight(item.totalWeight, item.weightPerItem);
    metaParts.push(weightLabel);
    const metaText = this.scene.add
      .text(textStartX, nameText.y + nameText.height + 2, metaParts.join("•"), {
        fontSize: "13px",
        color: META_COLOR,
      })
      .setOrigin(0, 0);
    const description = this.composeDescription(item.description, item.notes);
    const bodyText = this.scene.add
      .text(
        textStartX - icon.x - icon.displayWidth,
        metaText.y + metaText.height + 6,
        description,
        {
          fontSize: "13px",
          color: BODY_COLOR,
          wordWrap: { width: textMaxWidth, useAdvancedWrap: true },
          lineSpacing: 2,
        }
      )
      .setOrigin(0, 0);
    bodyText.setText(this.truncateText(bodyText, description, textMaxWidth, 6));
    card.add(bg);
    card.add(icon);
    card.add(nameText);
    card.add(metaText);
    card.add(bodyText);
    return card;
  }

  private layoutEmptyLabel() {
    this.emptyLabel.setPosition(
      this.containerWidth / 2,
      this.containerHeight / 2
    );
  }

  private computeCardWidth() {
    const { columns, columnGap, padding } = this.options;
    const usableWidth = Math.max(
      1,
      this.containerWidth - padding * 2 - columnGap * (columns - 1)
    );
    return usableWidth / columns;
  }

  private updateIconSize(icon: Phaser.GameObjects.Image, targetSize: number) {
    const textureManager = this.scene.textures;
    if (!textureManager.exists(icon.texture.key)) {
      icon.setTexture("hex", "grass_01.png");
    }
    const width = icon.width;
    const height = icon.height;
    if (width === 0 || height === 0) {
      icon.setDisplaySize(targetSize, targetSize);
      return;
    }
    const ratio = Math.min(targetSize / width, targetSize / height);
    icon.setDisplaySize(width * ratio, height * ratio);
  }

  private truncateText(
    text: Phaser.GameObjects.Text,
    content: string,
    maxWidth: number,
    maxLines: number
  ) {
    text.setWordWrapWidth(maxWidth, true);
    text.setText(content);
    const wrapped = text.getWrappedText();
    if (wrapped.length <= maxLines) {
      return wrapped.join("\n");
    }
    const trimmed = wrapped.slice(0, maxLines);
    const lastIndex = trimmed.length - 1;
    trimmed[lastIndex] = this.ellipsize(trimmed[lastIndex], text, maxWidth);
    return trimmed.join("\n");
  }

  private ellipsize(
    candidate: string,
    text: Phaser.GameObjects.Text,
    maxWidth: number
  ) {
    const style = text.style as Phaser.GameObjects.TextStyle & {
      syncFont?: (
        canvas: HTMLCanvasElement,
        context: CanvasRenderingContext2D
      ) => void;
    };
    const context = text.context;
    if (!context) {
      return candidate;
    }
    style.syncFont?.(text.canvas, context);
    if (context.measureText(candidate).width <= maxWidth) {
      return candidate;
    }
    const base = candidate.trimEnd();
    let current = base;
    while (current.length > 1) {
      current = current.slice(0, -1).trimEnd();
      const attempt = `${current}…`;
      if (context.measureText(attempt).width <= maxWidth) {
        return attempt;
      }
    }
    return "…";
  }

  private composeDescription(description: string, notes?: string[]) {
    if (!notes || notes.length === 0) {
      return description;
    }
    return `${description}\n\n${notes.join("\n")}`;
  }

  private formatWeight(total: number, perItem: number) {
    const normalizedTotal = Math.max(0, Number.isFinite(total) ? total : 0);
    const normalizedPerItem = Math.max(
      0,
      Number.isFinite(perItem) ? perItem : 0
    );
    if (normalizedPerItem > 0 && normalizedTotal > normalizedPerItem) {
      return `Weight: ${normalizedTotal} (${normalizedPerItem} ea)`;
    }
    return `Weight: ${normalizedTotal}`;
  }
}
