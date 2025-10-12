import Phaser from "phaser";
import { HoverTooltip } from "./HoverTooltip";

export interface GridSelectItem {
  id: string;
  name: string;
  description: string;
  texture: string;
  frame?: string;
  iconScale?: number;
}

interface GridSelectConfig {
  width: number;
  height?: number;
  columns?: number;
  title?: string;
  placeholder?: string;
  emptyLabel?: string;
  modalWidth?: number;
  modalHeight?: number;
}

type RexSizer = Phaser.GameObjects.GameObject & {
  add: (
    child: Phaser.GameObjects.GameObject,
    proportion?: number,
    align?: string,
    padding?: number | Record<string, number>,
    expand?: boolean
  ) => unknown;
  addBackground: (background: Phaser.GameObjects.GameObject) => unknown;
  layout: () => unknown;
  setPosition: (x: number, y: number) => unknown;
  x: number;
  y: number;
};

type RexGridTable = Phaser.GameObjects.GameObject & {
  setItems: (items?: unknown[]) => unknown;
  refresh?: () => unknown;
  layout?: () => unknown;
  on: (
    event: string,
    callback: (...args: unknown[]) => void,
    context?: unknown
  ) => unknown;
  resetAllCellsSize?: (width: number, height: number) => unknown;
};

type RexRoundRectangle = Phaser.GameObjects.GameObject & {
  setFillStyle?: (color: number, alpha?: number) => unknown;
  setStrokeStyle?: (
    lineWidth: number,
    color?: number,
    alpha?: number
  ) => unknown;
  setSize?: (width: number, height: number) => unknown;
  setDisplaySize?: (width: number, height: number) => unknown;
  setOrigin?: (x: number, y?: number) => unknown;
};

const MODAL_BACKGROUND_COLOR = 0x0f172a;
const MODAL_HEADER_COLOR = "#ffffff";
const MODAL_TEXT_COLOR = "#cbd5f5";
const CARD_BACKGROUND_COLOR = 0x1b2440;
const CARD_BACKGROUND_SELECTED = 0x2b3a6b;
const COLLAPSED_BACKGROUND_COLOR = 0x101828;
const COLLAPSED_BORDER_COLOR = 0x1f2a4a;

export class GridSelect extends Phaser.GameObjects.Container {
  private readonly background: RexRoundRectangle;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly collapsedHeight: number;
  private readonly modalTitle: string;
  private readonly placeholder: string;
  private readonly emptyLabel: string;
  private readonly columns: number;
  private readonly iconTargetSize: number;
  private readonly modalWidth: number;
  private readonly modalHeight: number;
  private readonly hitAreaZone: Phaser.GameObjects.Zone;
  private items: GridSelectItem[] = [];
  private selectedItem: GridSelectItem | null = null;
  private overlay: Phaser.GameObjects.Container | null = null;
  private modalCover: Phaser.GameObjects.Rectangle | null = null;
  private gridTable: RexGridTable | null = null;
  private tooltip: HoverTooltip | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    config: GridSelectConfig
  ) {
    super(scene, x, y);
    scene.add.existing(this);

    this.collapsedHeight = config.height ?? 64;
    this.columns = Math.max(1, config.columns ?? 3);
    this.modalTitle = config.title ?? "Select";
    this.placeholder = config.placeholder ?? "Select";
    this.emptyLabel = config.emptyLabel ?? "Unknown";
    this.modalWidth =
      config.modalWidth ?? Math.min(scene.scale.width - 80, 600);
    this.modalHeight =
      config.modalHeight ?? Math.min(scene.scale.height - 80, 480);
    this.iconTargetSize = Math.min(this.collapsedHeight - 12, 52);

    this.setSize(config.width, this.collapsedHeight);

    this.hitAreaZone = scene.add
      .zone(0, 0, config.width, this.collapsedHeight)
      .setOrigin(0, 0)
      .setInteractive(
        new Phaser.Geom.Rectangle(0, 0, config.width, this.collapsedHeight),
        Phaser.Geom.Rectangle.Contains
      );

    this.background = scene.rexUI.add.roundRectangle(
      0,
      0,
      config.width,
      this.collapsedHeight,
      10,
      COLLAPSED_BACKGROUND_COLOR
    ) as RexRoundRectangle;
    this.background.setOrigin?.(0, 0);
    this.background.setStrokeStyle?.(2, COLLAPSED_BORDER_COLOR, 1);

    this.icon = scene.add.image(
      12,
      this.collapsedHeight / 2,
      "hex",
      "grass_01.png"
    );
    this.icon.setOrigin(0, 0.5);
    this.icon.setDisplaySize(this.iconTargetSize, this.iconTargetSize);

    this.label = scene.add
      .text(
        this.icon.x + this.iconTargetSize + 12,
        this.collapsedHeight / 2,
        this.placeholder,
        {
          fontSize: "17px",
          color: "#e2e8f0",
        }
      )
      .setOrigin(0, 0.5);

    this.add(this.background);
    this.add(this.icon);
    this.add(this.label);
    this.add(this.hitAreaZone);

    this.icon.setVisible(false);

    this.hitAreaZone.on(Phaser.Input.Events.POINTER_UP, this.openModal, this);
    this.hitAreaZone.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.scene.input.setDefaultCursor("pointer");
      this.background.setStrokeStyle?.(2, 0x3b82f6, 1);
    });
    this.hitAreaZone.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.scene.input.setDefaultCursor("default");
      this.background.setStrokeStyle?.(2, COLLAPSED_BORDER_COLOR, 1);
    });
  }

  override destroy(fromScene?: boolean) {
    this.closeModal(true);
    this.tooltip?.destroy();
    this.tooltip = null;
    super.destroy(fromScene);
  }

  setItems(items: GridSelectItem[]) {
    this.items = items.slice();
    if (
      !this.selectedItem ||
      !this.items.find((it) => it.id === this.selectedItem?.id)
    ) {
      const first = this.items[0] ?? null;
      if (first) {
        this.applySelection(first, false);
      } else {
        this.clearSelection();
      }
    } else {
      this.applySelection(this.selectedItem, false);
    }
    this.gridTable?.setItems(this.items);
    this.gridTable?.refresh?.();
    this.gridTable?.layout?.();
    return this;
  }

  setValue(id: string | null, emit = false) {
    if (!id) {
      this.clearSelection();
      return this;
    }
    const match = this.items.find((it) => it.id === id);
    if (!match) {
      this.clearSelection();
      return this;
    }
    this.applySelection(match, emit);
    return this;
  }

  getValue() {
    return this.selectedItem?.id ?? null;
  }

  setDisplayWidth(width: number) {
    this.setSize(width, this.collapsedHeight);
    this.hitAreaZone.setSize(width, this.collapsedHeight);
    this.hitAreaZone.input?.hitArea.setTo(0, 0, width, this.collapsedHeight);
    this.background.setSize?.(width, this.collapsedHeight);
    this.background.setDisplaySize?.(width, this.collapsedHeight);
    this.label.setX(this.icon.x + this.iconTargetSize + 12);
    return this;
  }

  private clearSelection() {
    this.selectedItem = null;
    this.icon.setVisible(false);
    this.label.setText(this.placeholder);
  }

  private applySelection(item: GridSelectItem, emit = false) {
    this.selectedItem = item;
    this.updateCollapsedView(item);
    if (emit) {
      this.emit("change", item.id, item);
    }
    this.gridTable?.refresh?.();
  }

  private updateCollapsedView(item: GridSelectItem) {
    const textureManager = this.scene.textures;
    const hasTexture = textureManager.exists(item.texture);
    const texture = hasTexture ? textureManager.get(item.texture) : null;
    const hasFrame = item.frame ? texture?.has(item.frame) : true;

    if (hasTexture && hasFrame) {
      if (item.frame) {
        this.icon.setTexture(item.texture, item.frame);
      } else {
        this.icon.setTexture(item.texture);
      }
      const scale = Phaser.Math.Clamp(item.iconScale ?? 1, 0.1, 4);
      this.icon.setDisplaySize(
        this.iconTargetSize * scale,
        this.iconTargetSize * scale
      );
      this.icon.setVisible(true);
    } else {
      this.icon.setVisible(false);
    }
    this.label.setText(item.name.length > 0 ? item.name : this.emptyLabel);
  }

  private openModal() {
    if (this.items.length === 0) {
      return;
    }
    if (this.overlay) {
      this.overlay.setVisible(true);
      this.overlay.setActive(true);
      this.overlay.setDepth(10000);
      this.modalCover?.setVisible(true);
      this.modalCover?.setInteractive();
      this.gridTable?.setItems(this.items);
      this.gridTable?.refresh?.();
      this.gridTable?.layout?.();
      this.tooltip?.hide();
      return;
    }
    const scene = this.scene;
    const { width, height } = scene.scale;

    const overlay = scene.add.container(0, 0);
    overlay.setDepth(10000);
    overlay.setScrollFactor(0);

    const mainCam = scene.cameras.main;
    const uiCams = scene.cameras.cameras.filter((cam) => cam !== mainCam);
    if (uiCams.length > 0) {
      mainCam.ignore(overlay);
    }

    const cover = scene.add
      .rectangle(0, 0, width, height, 0x020617, 0.75)
      .setOrigin(0, 0)
      .setInteractive();
    cover.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
      }
    );
    cover.on(
      Phaser.Input.Events.POINTER_MOVE,
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
      }
    );
    cover.on(
      Phaser.Input.Events.POINTER_UP,
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        this.tooltip?.hide();
        this.closeModal();
      }
    );
    cover.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _dx: number,
        _dy: number,
        _dz: number,
        event: WheelEvent
      ) => {
        event.stopPropagation();
      }
    );
    overlay.add(cover);

    this.modalCover = cover;

    const modal = scene.rexUI.add.sizer({
      orientation: 1,
      space: { item: 16, left: 24, right: 24, top: 24, bottom: 24 },
    }) as RexSizer;

    const background = scene.rexUI.add.roundRectangle(
      0,
      0,
      this.modalWidth,
      this.modalHeight,
      14,
      MODAL_BACKGROUND_COLOR
    );
    modal.addBackground(background);

    const header = scene.add
      .text(0, 0, this.modalTitle, {
        fontSize: "22px",
        color: MODAL_HEADER_COLOR,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5);
    modal.add(header, 0, "center", { bottom: 4 }, false);

    const subtitle = scene.add
      .text(0, 0, "Tap an action to select it", {
        fontSize: "15px",
        color: MODAL_TEXT_COLOR,
      })
      .setOrigin(0.5, 0.5);
    modal.add(subtitle, 0, "center", { bottom: 4 }, false);

    const gridTable = this.createGridTable();
    modal.add(
      gridTable as unknown as Phaser.GameObjects.GameObject,
      1,
      "center",
      0,
      true
    );

    modal.layout();
    modal.setPosition(width / 2, height / 2);
    overlay.add(modal);
    this.ensureTooltip();
    this.overlay = overlay;
    this.gridTable = gridTable;
  }

  private closeModal(forceDestroy = false) {
    if (!this.overlay) {
      return;
    }
    if (forceDestroy) {
      this.overlay.destroy(true);
      this.overlay = null;
      this.modalCover = null;
      this.gridTable = null;
      this.tooltip?.destroy();
      this.tooltip = null;
      return;
    }
    this.overlay.setVisible(false);
    this.overlay.setActive(false);
    this.modalCover?.disableInteractive();
    this.tooltip?.hide();
  }

  private createGridTable() {
    const scene = this.scene;
    const cellWidth =
      (this.modalWidth - 48 - (this.columns - 1) * 12) / this.columns;
    const cellHeight = 240;

    const gridTable = scene.rexUI.add.gridTable({
      width: this.modalWidth - 48,
      height: this.modalHeight - 140,
      scrollMode: 0,
      background: scene.rexUI.add.roundRectangle(0, 0, 10, 10, 8, 0x121c34),
      table: {
        columns: this.columns,
        mask: { padding: 2 },
        cellWidth,
        cellHeight,
      },
      slider: {
        track: scene.rexUI.add.roundRectangle(0, 0, 4, 120, 4, 0x1f2a4a),
        thumb: scene.rexUI.add.roundRectangle(0, 0, 8, 36, 4, 0x3b82f6),
      },
      mouseWheelScroller: {
        focus: false,
        speed: 0.3,
      },
      space: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        table: 10,
      },
      createCellContainerCallback: (
        cell: {
          scene: Phaser.Scene;
          index: number;
          width: number;
          height: number;
          item: GridSelectItem;
        },
        cellContainer: Phaser.GameObjects.GameObject | undefined
      ) => this.buildCellContainer(cell, cellContainer),
    }) as RexGridTable;

    gridTable.setItems(this.items);
    gridTable.resetAllCellsSize?.(cellWidth, cellHeight);

    gridTable.on(
      "cell.click",
      (_cellContainer: Phaser.GameObjects.GameObject, cellIndex: number) => {
        const item = this.items[cellIndex];
        if (!item) {
          return;
        }
        this.applySelection(item, true);
        this.closeModal();
      },
      this
    );

    gridTable.on(
      "cell.up",
      (_cellContainer: Phaser.GameObjects.GameObject, cellIndex: number) => {
        const item = this.items[cellIndex];
        if (!item) {
          return;
        }
        this.applySelection(item, true);
        this.closeModal();
      },
      this
    );

    gridTable.on(
      "cell.over",
      (
        cellContainer: Phaser.GameObjects.GameObject,
        cellIndex: number,
        pointer?: Phaser.Input.Pointer
      ) => {
        if (!pointer) {
          return;
        }
        const shouldShow =
          (
            cellContainer as Phaser.GameObjects.GameObject & {
              getData?: (key: string) => unknown;
            }
          ).getData?.("showTooltip") === true;
        if (!shouldShow) {
          this.tooltip?.hide();
          return;
        }
        if (!this.tooltip) {
          this.ensureTooltip();
        }
        const item = this.items[cellIndex];
        if (!item) {
          return;
        }
        const tooltipInstance = this.tooltip;
        if (!tooltipInstance) {
          return;
        }
        const tooltipGO = tooltipInstance.getGameObject();
        tooltipGO.setDepth(10002);
        this.scene.children.bringToTop(tooltipGO);
        tooltipInstance.show(pointer.worldX, pointer.worldY, {
          title: item.name,
          body: item.description,
        });
      },
      this
    );

    gridTable.on(
      "cell.out",
      () => {
        this.tooltip?.hide();
      },
      this
    );

    return gridTable;
  }

  private buildCellContainer(
    cell: {
      index: number;
      width: number;
      height: number;
      item: GridSelectItem;
    },
    existing: Phaser.GameObjects.GameObject | undefined
  ) {
    const scene = this.scene;
    const item = cell.item;
    let container = existing as unknown as RexSizer | undefined;
    const cellWidth = cell.width;
    const cellHeight = cell.height;
    const usableTextWidth = cellWidth - 24;
    const maxDescriptionLines = 10;

    if (!container) {
      container = scene.rexUI.add.sizer({
        orientation: 1,
        space: { item: 6, left: 12, right: 12, top: 12, bottom: 12 },
      }) as RexSizer;

      const bg = scene.rexUI.add.roundRectangle(
        0,
        0,
        cellWidth,
        cellHeight,
        12,
        CARD_BACKGROUND_COLOR
      ) as RexRoundRectangle;
      bg.setSize?.(cellWidth, cellHeight);
      bg.setDisplaySize?.(cellWidth, cellHeight);
      container.addBackground(bg);

      const icon = scene.add
        .image(0, 0, item.texture, item.frame)
        .setOrigin(0.5, 0.5);
      icon.setDisplaySize(56, 56);

      const nameText = scene.add
        .text(0, 0, item.name, {
          fontSize: "17px",
          color: "#ffffff",
          align: "center",
        })
        .setOrigin(0.5, 0.5);

      const descText = scene.add
        .text(0, 0, item.description, {
          fontSize: "13px",
          color: MODAL_TEXT_COLOR,
          align: "center",
        })
        .setOrigin(0.5, 0.5);

      const nameTruncated = this.applySingleLineText(
        nameText,
        item.name,
        usableTextWidth
      );
      const descTruncated = this.applyMultilineText(
        descText,
        item.description,
        usableTextWidth,
        maxDescriptionLines
      );

      container.add(icon, 0, "center", { bottom: 4 }, false);
      container.add(nameText, 0, "center", { bottom: 2 }, false);
      container.add(descText, 0, "center", 0, false);

      (container as unknown as Phaser.GameObjects.GameObject).setData("bg", bg);
      (container as unknown as Phaser.GameObjects.GameObject).setData(
        "icon",
        icon
      );
      (container as unknown as Phaser.GameObjects.GameObject).setData(
        "name",
        nameText
      );
      (container as unknown as Phaser.GameObjects.GameObject).setData(
        "desc",
        descText
      );
      (container as unknown as Phaser.GameObjects.GameObject).setData(
        "id",
        item.id
      );
      (container as unknown as Phaser.GameObjects.GameObject).setData(
        "showTooltip",
        nameTruncated || descTruncated
      );

      (
        container as unknown as { setMinSize?: (w: number, h: number) => void }
      ).setMinSize?.(cellWidth, cellHeight);

      container.layout();
      return container as unknown as Phaser.GameObjects.GameObject;
    }

    const containerGO = container as unknown as Phaser.GameObjects.GameObject;
    const bg = containerGO.getData("bg") as RexRoundRectangle | undefined;
    const icon = containerGO.getData("icon") as
      | Phaser.GameObjects.Image
      | undefined;
    const nameText = containerGO.getData("name") as
      | Phaser.GameObjects.Text
      | undefined;
    const descText = containerGO.getData("desc") as
      | Phaser.GameObjects.Text
      | undefined;

    if (icon) {
      const textureManager = scene.textures;
      const hasTexture = textureManager.exists(item.texture);
      const texture = hasTexture ? textureManager.get(item.texture) : null;
      const hasFrame = item.frame ? texture?.has(item.frame) : true;
      if (hasTexture && hasFrame) {
        if (item.frame) {
          icon.setTexture(item.texture, item.frame);
        } else {
          icon.setTexture(item.texture);
        }
        const scale = Phaser.Math.Clamp(item.iconScale ?? 1, 0.1, 4);
        icon.setDisplaySize(56 * scale, 56 * scale);
        icon.setVisible(true);
      } else {
        icon.setVisible(false);
      }
    }
    const nameTruncated = nameText
      ? this.applySingleLineText(nameText, item.name, usableTextWidth)
      : false;
    const descTruncated = descText
      ? this.applyMultilineText(
          descText,
          item.description,
          usableTextWidth,
          maxDescriptionLines
        )
      : false;
    containerGO.setData("id", item.id);
    containerGO.setData("showTooltip", nameTruncated || descTruncated);

    const isSelected = this.selectedItem?.id === item.id;
    bg?.setFillStyle?.(
      isSelected ? CARD_BACKGROUND_SELECTED : CARD_BACKGROUND_COLOR,
      1
    );
    bg?.setSize?.(cellWidth, cellHeight);
    bg?.setDisplaySize?.(cellWidth, cellHeight);

    (
      container as unknown as { setMinSize?: (w: number, h: number) => void }
    ).setMinSize?.(cellWidth, cellHeight);

    container.layout();
    return containerGO;
  }

  private ensureTooltip() {
    if (!this.tooltip) {
      this.tooltip = new HoverTooltip(this.scene);
    }
    const tooltipGO = this.tooltip.getGameObject();
    tooltipGO.setDepth(10002);
    this.scene.children.bringToTop(tooltipGO);
    this.tooltip.hide();
  }

  private syncTextFont(target: Phaser.GameObjects.Text) {
    const style = target.style as Phaser.GameObjects.TextStyle & {
      syncFont?: (
        canvas: HTMLCanvasElement,
        context: CanvasRenderingContext2D
      ) => void;
    };
    const context = target.context;
    if (!context) {
      return;
    }
    style.syncFont?.(target.canvas, context);
  }

  private measureText(target: Phaser.GameObjects.Text, content: string) {
    const context = target.context;
    if (!context) {
      return target.width;
    }
    this.syncTextFont(target);
    return context.measureText(content).width;
  }

  private ellipsize(
    content: string,
    target: Phaser.GameObjects.Text,
    maxWidth: number
  ) {
    const ellipsis = "…";
    const base = content.trimEnd();
    if (base.length === 0) {
      return "";
    }
    if (this.measureText(target, base) <= maxWidth) {
      return base;
    }
    let current = base;
    while (current.length > 1) {
      current = current.slice(0, -1);
      const candidate = `${current.trimEnd()}${ellipsis}`;
      if (this.measureText(target, candidate) <= maxWidth) {
        return candidate;
      }
    }
    return ellipsis;
  }

  private applySingleLineText(
    target: Phaser.GameObjects.Text,
    content: string,
    maxWidth: number
  ): boolean {
    const trimmed = content.trimEnd();
    const display = this.ellipsize(trimmed, target, maxWidth);
    target.setText(display);
    const bounds = target.getBounds();
    target.setFixedSize(maxWidth, bounds.height);
    return display !== trimmed;
  }

  private applyMultilineText(
    target: Phaser.GameObjects.Text,
    content: string,
    maxWidth: number,
    maxLines: number
  ): boolean {
    target.setWordWrapWidth(maxWidth, true);
    target.setText(content);
    const wrapped = target.getWrappedText();
    if (wrapped.length === 0) {
      target.setText("");
      target.setFixedSize(maxWidth, 0);
      return false;
    }
    let truncated = false;
    let lines = wrapped.slice();
    if (wrapped.length > maxLines) {
      lines = wrapped.slice(0, maxLines);
      const lastIndex = lines.length - 1;
      lines[lastIndex] = this.ellipsize(lines[lastIndex], target, maxWidth);
      truncated = true;
    } else {
      const lastIndex = lines.length - 1;
      const ellipsized = this.ellipsize(lines[lastIndex], target, maxWidth);
      if (ellipsized !== lines[lastIndex]) {
        truncated = true;
      }
      lines[lastIndex] = ellipsized;
    }
    target.setText(lines.join("\n"));
    const bounds = target.getBounds();
    target.setFixedSize(maxWidth, bounds.height);
    return truncated;
  }
}
