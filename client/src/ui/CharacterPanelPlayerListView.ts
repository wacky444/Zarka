import Phaser from "phaser";
import type { PlayerOption } from "./PlayerSelector";

type ScrollablePanelInstance = Phaser.GameObjects.GameObject & {
  layout?: () => void;
  setMinSize?: (width: number, height: number) => void;
  setSize?: (width: number, height: number) => void;
  setOrigin?: (x: number, y?: number) => Phaser.GameObjects.GameObject;
  setPosition?: (x: number, y: number) => Phaser.GameObjects.GameObject;
};

export type PlayerListRowModel = PlayerOption & {
  ready: boolean;
  dead: boolean;
};

type RowWidgets = {
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
  nameText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
};

const ROW_HEIGHT = 48;
const ICON_SCALE = 2;

export class CharacterPanelPlayerListView {
  private readonly scene: Phaser.Scene;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly listBox: Phaser.GameObjects.Rectangle;
  private readonly overlayText: Phaser.GameObjects.Text;
  private readonly scrollContent: Phaser.GameObjects.Container;
  private readonly scrollPanel: ScrollablePanelInstance;
  private readonly elements: Phaser.GameObjects.GameObject[];
  private readonly rows: RowWidgets[] = [];
  private visible = false;
  private data: PlayerListRowModel[] = [];
  private listWidth = 0;

  constructor(options: { scene: Phaser.Scene }) {
    this.scene = options.scene;
    this.titleText = this.scene.add
      .text(0, 0, "Players", { fontSize: "16px", color: "#ffffff" })
      .setVisible(false);
    this.listBox = this.scene.add
      .rectangle(0, 0, 100, 100, 0x1b2440)
      .setOrigin(0, 0)
      .setVisible(false);
    this.listBox.setStrokeStyle?.(1, 0x253055, 0.8);
    this.overlayText = this.scene.add
      .text(0, 0, "No players.", { fontSize: "15px", color: "#7f8ab8" })
      .setOrigin(0, 0)
      .setVisible(false);

    this.scrollContent = this.scene.add.container(0, 0);
    this.scrollPanel = this.scene.rexUI.add.scrollablePanel({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      scrollMode: 0,
      panel: { child: this.scrollContent, mask: { padding: 1 } },
      slider: false,
      scroller: {
        threshold: 10,
        slidingDeceleration: 5000,
        backDeceleration: 2000,
        pointerOutRelease: true,
      },
      mouseWheelScroller: {
        focus: true,
        speed: 0.35,
      },
      space: { left: 0, right: 0, top: 0, bottom: 0 },
    }) as ScrollablePanelInstance;
    this.scrollPanel.setOrigin?.(0, 0);
    (this.scrollPanel as unknown as Phaser.GameObjects.GameObject & {
      setVisible?: (value: boolean) => void;
    }).setVisible?.(false);

    this.elements = [
      this.titleText,
      this.listBox,
      this.scrollPanel,
      this.overlayText,
    ];
  }

  getElements(): Phaser.GameObjects.GameObject[] {
    return this.elements;
  }

  destroy(): void {
    for (const row of this.rows) {
      row.icon.destroy();
      row.nameText.destroy();
      row.statusText.destroy();
      row.background.destroy();
      row.container.destroy();
    }
    this.rows.length = 0;
    this.scrollPanel.destroy();
    this.scrollContent.destroy();
    this.titleText.destroy();
    this.listBox.destroy();
    this.overlayText.destroy();
  }

  handleVisibilityChange(visible: boolean): void {
    this.visible = visible;
    for (const obj of this.elements) {
      (
        obj as Phaser.GameObjects.GameObject & {
          setVisible?: (value: boolean) => void;
          setActive?: (value: boolean) => void;
        }
      ).setVisible?.(visible);
    }
    this.refreshOverlayVisibility();
  }

  layout(bounds: {
    margin: number;
    contentTop: number;
    boxWidth: number;
    panelHeight: number;
  }): void {
    const { margin, contentTop, boxWidth, panelHeight } = bounds;
    this.titleText.setPosition(margin, contentTop);
    const boxY = contentTop + 32;
    const boxHeight = Math.max(160, panelHeight - boxY - margin);
    this.listBox.setPosition(margin, boxY);
    this.listBox.setSize(boxWidth, boxHeight);
    this.listBox.setDisplaySize(boxWidth, boxHeight);
    this.scrollPanel.setPosition?.(margin, boxY);
    this.scrollPanel.setSize?.(boxWidth, boxHeight);
    this.scrollPanel.setMinSize?.(boxWidth, boxHeight);
    this.overlayText.setPosition(margin + 16, boxY + 16);
    this.listWidth = boxWidth;
    this.layoutRows();
    this.refreshOverlayVisibility();
  }

  setPlayers(players: PlayerListRowModel[]): void {
    this.data = Array.isArray(players) ? players.slice() : [];
    this.ensureRows(this.data.length);
    this.refreshRows();
    this.refreshOverlayVisibility();
  }

  private ensureRows(count: number): void {
    while (this.rows.length < count) {
      this.rows.push(this.createRow());
    }
    for (let index = 0; index < this.rows.length; index += 1) {
      const row = this.rows[index];
      const enabled = index < count;
      row.container.setVisible(enabled);
      row.container.setActive(enabled);
    }
  }

  private createRow(): RowWidgets {
    const container = this.scene.add.container(0, 0);
    const background = this.scene.add
      .rectangle(0, 0, 100, ROW_HEIGHT, 0x11152a)
      .setOrigin(0, 0);
    background.setStrokeStyle?.(1, 0x2c3557, 0.9);
    const icon = this.scene.add
      .image(0, ROW_HEIGHT / 2, "char")
      .setOrigin(0, 0.5);
    icon.setScale(ICON_SCALE);
    const nameText = this.scene.add
      .text(0, 0, "", { fontSize: "15px", color: "#ffffff" })
      .setOrigin(0, 0);
    const statusText = this.scene.add
      .text(0, 0, "", { fontSize: "14px", color: "#a0b7ff" })
      .setOrigin(1, 0);
    container.add([background, icon, nameText, statusText]);
    this.scrollContent.add(container);
    return { container, background, icon, nameText, statusText };
  }

  private refreshRows(): void {
    const innerWidth = Math.max(0, this.listWidth);
    const horizontalPadding = 12;
    const iconGap = 12;
    const iconDisplayWidth = 16 * ICON_SCALE;
    const nameX = horizontalPadding + iconDisplayWidth + iconGap;

    let cursorY = 0;
    for (let index = 0; index < this.data.length; index += 1) {
      const model = this.data[index];
      const row = this.rows[index];
      row.container.setPosition(0, cursorY);
      row.background.setPosition(0, 0);
      row.background.setSize(innerWidth, ROW_HEIGHT);
      row.background.setDisplaySize(innerWidth, ROW_HEIGHT);
      row.background.setFillStyle(index % 2 === 0 ? 0x11152a : 0x0f1426);
      row.icon.setPosition(horizontalPadding, ROW_HEIGHT / 2);
      row.icon.setTexture(model.texture ?? "char", model.frame);
      const iconScale =
        typeof model.iconScale === "number" && model.iconScale > 0
          ? model.iconScale
          : 1;
      row.icon.setScale(ICON_SCALE * iconScale);
      row.nameText.setText(model.label ?? model.id);
      row.nameText.setPosition(nameX, 14);
      row.nameText.setWordWrapWidth(Math.max(20, innerWidth - nameX - 140));

      const status = model.dead ? "Dead" : model.ready ? "Ready" : "Not ready";
      const statusColor = model.dead
        ? "#94a3b8"
        : model.ready
          ? "#4ade80"
          : "#fbbf24";
      row.statusText.setText(status);
      row.statusText.setColor(statusColor);
      row.statusText.setPosition(innerWidth - horizontalPadding, 14);

      cursorY += ROW_HEIGHT;
    }
    this.scrollContent.setPosition(0, 0);
    this.scrollContent.setSize(innerWidth, cursorY);
    this.scrollPanel.layout?.();
  }

  private layoutRows(): void {
    if (this.data.length === 0) {
      this.scrollContent.setSize(Math.max(0, this.listWidth), 0);
      this.scrollPanel.layout?.();
      return;
    }
    this.refreshRows();
  }

  private refreshOverlayVisibility(): void {
    const hasPlayers = this.data.length > 0;
    this.overlayText.setVisible(this.visible && !hasPlayers);
  }
}
