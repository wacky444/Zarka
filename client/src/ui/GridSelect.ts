import Phaser from "phaser";
import { t } from "../services/i18n";
import { HoverTooltip } from "./HoverTooltip";
import { THEME } from "./ColorPalette";

const ACTION_DESCRIPTION_TAG_PATTERN =
  /\[(health-damage|energy-damage|energy-recover|health-recover)\]([\s\S]*?)\[\/\1\]/g;

const ACTION_DESCRIPTION_TAG_COLORS: Record<string, string> = {
  "health-damage": THEME.colors.healthDamage,
  "energy-damage": THEME.colors.energyDamage,
  "energy-recover": THEME.colors.energyRecover,
  "health-recover": THEME.colors.healthRecover
};

export function parseActionDescription(content: string): string {
  return content.replace(
    ACTION_DESCRIPTION_TAG_PATTERN,
    (_match, tag: string, value: string) =>
      `[color=${ACTION_DESCRIPTION_TAG_COLORS[tag]}]${value}[/color]`
  );
}

function stripActionDescriptionMarkup(content: string): string {
  return parseActionDescription(content).replace(
    /\[color=[^\]]+\]|\[\/color\]/g,
    ""
  );
}

export interface GridSelectItem {
  id: string;
  name: string;
  labelColor?: string;
  description?: string | null;
  texture: string;
  frame?: string;
  iconScale?: number;
  highlighted?: boolean;
  tags?: string[];
  cooldownRemaining?: number;
  missingRequirement?: string | null;
  energyCost?: number;
  disabled?: boolean;
  isEmptyOption?: boolean;
}

interface GridSelectConfig {
  width: number;
  height?: number;
  columns?: number;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  emptyLabel?: string;
  modalWidth?: number;
  modalHeight?: number;
  cellHeight?: number;
  includeEmptyOption?: boolean;
  emptyOptionLabel?: string;
  emptyOptionDescription?: string;
  autoSelectFirst?: boolean;
  /** Keep the modal open after choosing an item until Confirm is pressed. */
  confirmSelection?: boolean;
  confirmLabel?: string;
  iconTextGap?: number;
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
  getBounds?: () => Phaser.Geom.Rectangle;
  on: (
    event: string,
    callback: (...args: unknown[]) => void,
    context?: unknown
  ) => unknown;
  resetAllCellsSize?: (width: number, height: number) => unknown;
  setMask?: (
    mask: Phaser.Display.Masks.BitmapMask | Phaser.Display.Masks.GeometryMask
  ) => Phaser.GameObjects.GameObject;
  clearMask?: (destroyMask?: boolean) => Phaser.GameObjects.GameObject;
  setScrollerEnable?: (enabled: boolean) => void;
  setMouseWheelScrollerEnable?: (enabled: boolean) => void;
  setScrollFactor?: (x: number, y?: number) => Phaser.GameObjects.GameObject;
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

export class GridSelect extends Phaser.GameObjects.Container {
  private readonly background: RexRoundRectangle;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly collapsedHeight: number;
  private readonly modalTitle: string;
  private readonly modalSubtitle: string;
  private placeholder: string;
  private readonly emptyLabel: string;
  private readonly columns: number;
  private readonly iconTargetSize: number;
  private readonly defaultModalWidth: number;
  private readonly defaultModalHeight: number;
  private modalWidth: number;
  private modalHeight: number;
  private readonly cellHeight: number;
  private readonly hitAreaZone: Phaser.GameObjects.Zone;
  private readonly emptyOptionItem: GridSelectItem | null;
  private readonly autoSelectFirst: boolean;
  private readonly confirmSelection: boolean;
  private readonly confirmLabel: string;
  private confirmButton: Phaser.GameObjects.Container | null = null;
  private items: GridSelectItem[] = [];
  private selectedItem: GridSelectItem | null = null;
  private overlay: Phaser.GameObjects.Container | null = null;
  private modalCover: Phaser.GameObjects.Rectangle | null = null;
  private modalCloseButton: Phaser.GameObjects.Container | null = null;
  private gridTable: RexGridTable | null = null;
  private gridTableMask: Phaser.Display.Masks.GeometryMask | null = null;
  private gridTableMaskShape: Phaser.GameObjects.Rectangle | null = null;
  private tooltip: HoverTooltip | null = null;
  private enabled = true;
  private tutorialHighlighted = false;
  private readonly labelActiveColor: string;
  private readonly iconTextGap: number;
  private currentWidth: number;
  private modalVisible = false;

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
    this.modalSubtitle = config.subtitle ?? "Tap an action to select it";
    this.placeholder = config.placeholder ?? "Select";
    this.emptyLabel = config.emptyLabel ?? "Unknown";
    this.iconTextGap = config.iconTextGap ?? 16;
    this.defaultModalWidth =
      config.modalWidth ?? Math.min(scene.scale.width - 80, 600);
    this.defaultModalHeight =
      config.modalHeight ?? Math.min(scene.scale.height - 80, 480);
    this.modalWidth = this.defaultModalWidth;
    this.modalHeight = this.defaultModalHeight;
    this.iconTargetSize = Math.min(this.collapsedHeight - 12, 48);
    this.cellHeight = Math.max(96, config.cellHeight ?? 240);
    this.autoSelectFirst = config.autoSelectFirst !== false;
    this.confirmSelection = config.confirmSelection === true;
    this.confirmLabel = config.confirmLabel ?? "Confirm";
    this.labelActiveColor = "#e2e8f0";
    this.currentWidth = config.width;
    const includeEmptyOption = config.includeEmptyOption === true;
    this.emptyOptionItem = includeEmptyOption
      ? {
          id: "__grid_select_empty_option__",
          name: config.emptyOptionLabel ?? "No action",
          description:
            config.emptyOptionDescription ?? "Clears the current selection.",
          texture: "hex",
          frame: "grass_01.png",
          isEmptyOption: true
        }
      : null;

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
      THEME.colors.collapsedBackground
    ) as RexRoundRectangle;
    this.background.setOrigin?.(0, 0);
    this.background.setStrokeStyle?.(2, THEME.colors.collapsedBorder, 1);

    this.icon = scene.add.image(
      12,
      this.collapsedHeight / 2,
      "hex",
      "grass_01.png"
    );
    this.icon.setOrigin(0, 0.5);
    this.icon.setDisplaySize(this.iconTargetSize, this.iconTargetSize);

    this.label = scene.add
      .text(16, this.collapsedHeight / 2, this.placeholder, {
        fontSize: "17px",
        color: this.labelActiveColor
      })
      .setOrigin(0, 0.5);

    this.add(this.background);
    this.add(this.icon);
    this.add(this.label);
    this.add(this.hitAreaZone);

    this.icon.setVisible(false);
    this.updateLabelPosition();

    let pointerDownPos: { x: number; y: number } | null = null;
    this.hitAreaZone.on(
      Phaser.Input.Events.POINTER_DOWN,
      (pointer: Phaser.Input.Pointer) => {
        pointerDownPos = { x: pointer.x, y: pointer.y };
      }
    );
    this.hitAreaZone.on(
      Phaser.Input.Events.POINTER_UP,
      (pointer: Phaser.Input.Pointer) => {
        if (pointerDownPos) {
          const dist = Phaser.Math.Distance.Between(
            pointerDownPos.x,
            pointerDownPos.y,
            pointer.x,
            pointer.y
          );
          pointerDownPos = null;
          if (dist > 10) {
            return;
          }
        }
        if (
          pointer &&
          typeof pointer.getDistance === "function" &&
          pointer.getDistance() > 10
        ) {
          return;
        }
        this.openModal();
      }
    );
    this.hitAreaZone.on(Phaser.Input.Events.POINTER_OVER, () => {
      if (!this.enabled) {
        this.scene.input.setDefaultCursor("default");
        this.updateCollapsedBorder();
        return;
      }
      this.scene.input.setDefaultCursor("pointer");
      this.updateCollapsedBorder();
    });
    this.hitAreaZone.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.scene.input.setDefaultCursor("default");
      this.updateCollapsedBorder();
    });

    this.applyEnabledState();
  }

  override destroy(fromScene?: boolean) {
    this.closeModal(true);
    this.tooltip?.destroy();
    this.tooltip = null;
    super.destroy(fromScene);
  }

  setItems(items: GridSelectItem[]) {
    const cloned = items.slice();
    this.items = this.emptyOptionItem
      ? [
          {
            ...this.emptyOptionItem
          },
          ...cloned
        ]
      : cloned;
    const currentId = this.selectedItem?.id ?? null;
    if (currentId) {
      const current = this.items.find(
        (it) => it.id === currentId && it.disabled !== true
      );
      if (current) {
        this.applySelection(current, false);
      } else {
        if (this.autoSelectFirst) {
          this.selectFirstAvailable(false);
        } else {
          this.clearSelection();
        }
      }
    } else {
      if (this.autoSelectFirst) {
        this.selectFirstAvailable(false);
      } else {
        this.clearSelection();
      }
    }
    this.gridTable?.setItems(this.items);
    this.gridTable?.refresh?.();
    this.gridTable?.layout?.();
    return this;
  }

  setValue(id: string | null, emit = false): this {
    if (id === null) {
      const empty = this.items.find((it) => it.isEmptyOption === true);
      if (empty) {
        this.applySelection(empty, emit);
      } else {
        this.clearSelection();
      }
      return this;
    }
    if (id === "") {
      return this.setValue(null, emit);
    }
    if (!id) {
      this.clearSelection();
      return this;
    }
    const match = this.items.find((it) => it.id === id);
    if (!match || match.disabled) {
      if (emit || !this.autoSelectFirst) {
        this.clearSelection();
      } else {
        this.selectFirstAvailable(false);
      }
      return this;
    }
    this.applySelection(match, emit);
    return this;
  }

  getValue() {
    if (!this.selectedItem) {
      return null;
    }
    return this.selectedItem.isEmptyOption ? null : this.selectedItem.id;
  }

  getSelectedItem() {
    return this.selectedItem;
  }

  setDisplayWidth(width: number) {
    this.setSize(width, this.collapsedHeight);
    this.hitAreaZone.setSize(width, this.collapsedHeight);
    this.hitAreaZone.input?.hitArea.setTo(0, 0, width, this.collapsedHeight);
    this.background.setSize?.(width, this.collapsedHeight);
    this.background.setDisplaySize?.(width, this.collapsedHeight);
    this.updateLabelPosition();
    this.currentWidth = width;
    this.applyEnabledState();
    return this;
  }

  setPlaceholder(text: string) {
    this.placeholder = text;
    if (!this.selectedItem) {
      this.label.setText(text);
    }
    return this;
  }

  setTutorialHighlight(highlighted: boolean): this {
    this.tutorialHighlighted = highlighted;
    this.updateCollapsedBorder();
    return this;
  }

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) {
      return this;
    }
    this.enabled = enabled;
    if (!enabled) {
      this.closeModal();
      this.tooltip?.hide();
    }
    this.applyEnabledState();
    return this;
  }

  showModal() {
    this.openModal();
    return this;
  }

  hideModal() {
    this.closeModal();
    return this;
  }

  private updateLabelPosition() {
    if (this.icon?.visible) {
      this.label.setX(this.icon.x + this.icon.displayWidth + this.iconTextGap);
    } else {
      this.label.setX(16);
    }
  }

  private clearSelection() {
    this.selectedItem = null;
    this.icon.setVisible(false);
    this.label.setText(this.placeholder);
    this.updateLabelPosition();
    this.updateConfirmButton();
    this.applyEnabledState();
  }

  private selectFirstAvailable(emit: boolean) {
    let first =
      this.items.find(
        (it) => it.disabled !== true && it.isEmptyOption !== true
      ) ?? null;
    if (!first) {
      first =
        this.items.find((it) => it.disabled !== true && it.isEmptyOption) ??
        null;
    }
    if (first) {
      this.applySelection(first, emit);
    } else {
      this.clearSelection();
    }
  }

  private applySelection(item: GridSelectItem, emit = false) {
    if (item.disabled) {
      return;
    }
    this.selectedItem = item;
    this.updateCollapsedView(item);
    this.updateConfirmButton();
    if (emit) {
      this.emit("change", item.isEmptyOption ? null : item.id, item);
    }
    this.gridTable?.refresh?.();
  }

  private updateCollapsedView(item: GridSelectItem) {
    if (item.isEmptyOption) {
      this.icon.setVisible(false);
      this.label.setText(item.name.length > 0 ? item.name : this.emptyLabel);
      this.updateLabelPosition();
      return;
    }
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
    this.updateLabelPosition();
    this.applyEnabledState();
  }

  private isMobileModal(): boolean {
    const userAgent =
      typeof navigator === "undefined" ? "" : navigator.userAgent;
    return (
      this.scene.scale.width <= 600 ||
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        userAgent
      )
    );
  }

  private openModal() {
    if (!this.enabled || this.items.length === 0) {
      return;
    }
    if (!this.modalVisible) {
      this.modalVisible = true;
      this.emit("modal-open");
    }
    if (this.overlay) {
      this.overlay.setVisible(true);
      this.overlay.setActive(true);
      this.overlay.setDepth(10000);
      this.updateConfirmButton();
      this.modalCover?.setVisible(true);
      this.modalCover?.setInteractive();
      this.gridTable?.setItems(this.items);
      this.gridTable?.setScrollerEnable?.(true);
      this.gridTable?.setMouseWheelScrollerEnable?.(true);
      this.gridTable?.refresh?.();
      this.gridTable?.layout?.();
      this.tooltip?.hide();
      return;
    }
    const scene = this.scene;
    const { width, height } = scene.scale;
    const mobile = this.isMobileModal();
    this.modalWidth = mobile ? width : this.defaultModalWidth;
    this.modalHeight = mobile ? height : this.defaultModalHeight;

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
    let pointerDownOnCover = false;
    cover.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        pointerDownOnCover = true;
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
        if (!pointerDownOnCover) {
          return;
        }
        pointerDownOnCover = false;
        this.tooltip?.hide();
        if (!mobile) {
          this.closeModal();
        }
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
      space: { item: 16, left: 24, right: 24, top: 24, bottom: 24 }
    }) as RexSizer;

    const background = scene.rexUI.add.roundRectangle(
      0,
      0,
      this.modalWidth,
      this.modalHeight,
      14,
      THEME.colors.modalBackground
    );
    modal.addBackground(background);
    const backgroundGO = background as unknown as Phaser.GameObjects.GameObject;
    backgroundGO.setInteractive();
    backgroundGO.on(
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
    backgroundGO.on(
      Phaser.Input.Events.POINTER_UP,
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
      }
    );
    backgroundGO.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _dx: number,
        _dy: number,
        _dz: number,
        event: WheelEvent
      ) => {
        event?.stopPropagation?.();
      }
    );

    const header = scene.add
      .text(0, 0, this.modalTitle, {
        fontSize: "22px",
        color: THEME.colors.modalHeader,
        fontStyle: "bold"
      })
      .setOrigin(0.5, 0.5);
    modal.add(header, 0, "center", { bottom: 4 }, false);

    const subtitle = scene.add
      .text(0, 0, this.modalSubtitle, {
        fontSize: "15px",
        color: THEME.colors.modalText
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
    if (this.confirmSelection) {
      this.confirmButton = this.createConfirmButton(scene);
      modal.add(this.confirmButton, 0, "center", { top: 10 }, false);
    }

    modal.layout();
    modal.setPosition(width / 2, height / 2);
    overlay.add(modal);

    this.gridTableMaskShape?.destroy();
    this.gridTableMaskShape = null;
    this.gridTableMask?.destroy();
    this.gridTableMask = null;

    const bounds =
      gridTable.getBounds?.() ??
      new Phaser.Geom.Rectangle(
        (gridTable as unknown as { x?: number }).x ?? 0,
        (gridTable as unknown as { y?: number }).y ?? 0,
        (gridTable as unknown as { width?: number }).width ?? 0,
        (gridTable as unknown as { height?: number }).height ?? 0
      );
    this.gridTableMaskShape = scene.add
      .rectangle(bounds.x, bounds.y, bounds.width, bounds.height, 0xffffff, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setAlpha(0.0001);
    overlay.add(this.gridTableMaskShape);
    this.gridTableMask = this.gridTableMaskShape.createGeometryMask();
    gridTable.setMask?.(this.gridTableMask);

    if (mobile) {
      this.modalCloseButton = this.createMobileCloseButton(
        scene,
        overlay,
        width
      );
    }

    this.ensureTooltip();
    this.overlay = overlay;
    this.gridTable = gridTable;
    this.updateConfirmButton();
    scene.time.delayedCall(0, () => {
      if (this.gridTable) {
        this.gridTable.refresh?.();
        this.gridTable.layout?.();
      }
    });
  }

  private createConfirmButton(
    scene: Phaser.Scene
  ): Phaser.GameObjects.Container {
    const button = scene.add.container(0, 0);
    const background = scene.add
      .rectangle(0, 0, 150, 42, 0x2563eb, 1)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x60a5fa, 1)
      .setInteractive({ useHandCursor: true });
    const label = scene.add
      .text(0, 0, this.confirmLabel, {
        fontSize: "16px",
        color: "#ffffff",
        fontStyle: "bold"
      })
      .setOrigin(0.5);
    background.on(
      Phaser.Input.Events.POINTER_UP,
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        const selected = this.selectedItem;
        if (!selected || selected.disabled) {
          return;
        }
        this.emit("change", selected.isEmptyOption ? null : selected.id, selected);
        this.closeModal();
      }
    );
    button.add([background, label]);
    button.setSize(150, 42);
    button.setData("background", background);
    return button;
  }

  private updateConfirmButton(): void {
    if (!this.confirmButton) {
      return;
    }
    const background = this.confirmButton.getData(
      "background"
    ) as Phaser.GameObjects.Rectangle | undefined;
    const enabled = Boolean(this.selectedItem && !this.selectedItem.disabled);
    background?.setAlpha(enabled ? 1 : 0.45);
    if (enabled) {
      background?.setInteractive({ useHandCursor: true });
    } else {
      background?.disableInteractive();
    }
  }

  private createMobileCloseButton(
    scene: Phaser.Scene,
    overlay: Phaser.GameObjects.Container,
    width: number
  ): Phaser.GameObjects.Container {
    const button = scene.add.container(width - 52, 36);
    const background = scene.add
      .rectangle(0, 0, 40, 40, 0x334155, 0.95)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x94a3b8, 1)
      .setInteractive();
    const label = scene.add
      .text(0, 0, "×", {
        color: "#ffffff",
        fontSize: "28px",
        fontStyle: "bold"
      })
      .setOrigin(0.5);
    background.on(
      Phaser.Input.Events.POINTER_UP,
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        this.closeModal();
      }
    );
    button.add([background, label]);
    button.setDepth(10002);
    overlay.add(button);
    return button;
  }

  private closeModal(forceDestroy = false) {
    const wasVisible = this.modalVisible;
    if (!this.overlay) {
      if (wasVisible) {
        this.modalVisible = false;
        this.emit("modal-close");
      }
      return;
    }

    if (forceDestroy) {
      this.gridTable?.clearMask?.();
      this.gridTableMask?.destroy();
      this.gridTableMask = null;
      this.gridTableMaskShape?.destroy();
      this.gridTableMaskShape = null;

      this.overlay.destroy(true);
      this.overlay = null;
      this.confirmButton = null;
      this.modalCover = null;
      this.modalCloseButton = null;
      this.gridTable = null;
      this.tooltip?.destroy();
      this.tooltip = null;
    } else {
      this.overlay.setVisible(false);
      this.overlay.setActive(false);
      this.gridTable?.setScrollerEnable?.(false);
      this.gridTable?.setMouseWheelScrollerEnable?.(false);
      const coverScene = this.modalCover?.scene as unknown as
        | { sys?: unknown }
        | undefined;
      if (this.modalCover && coverScene?.sys) {
        try {
          this.modalCover.disableInteractive();
        } catch (e) {
          console.warn("disableInteractive skipped during teardown", e);
        }
      }
      this.tooltip?.hide();
    }
    if (wasVisible) {
      this.modalVisible = false;
      this.emit("modal-close");
    }
  }

  isModalOpen() {
    return this.modalVisible;
  }

  private createGridTable() {
    const scene = this.scene;
    const cellWidth =
      (this.modalWidth - 48 - (this.columns - 1) * 12) / this.columns;
    const cellHeight = this.cellHeight;

    const gridTable = scene.rexUI.add.gridTable({
      width: this.modalWidth - 48,
      height: this.modalHeight - (this.confirmSelection ? 190 : 140),
      scrollMode: 0,
      background: scene.rexUI.add.roundRectangle(0, 0, 10, 10, 8, 0x121c34),
      table: {
        columns: this.columns,
        reuseCellContainer: false,
        mask: { padding: 2 },
        cellWidth,
        cellHeight
      },
      slider: {
        track: scene.rexUI.add.roundRectangle(0, 0, 4, 120, 4, 0x1f2a4a),
        thumb: scene.rexUI.add.roundRectangle(0, 0, 8, 36, 4, 0x3b82f6)
      },
      scroller: {
        threshold: 10,
        rectBoundsInteractive: true,
        slidingDeceleration: 5000,
        backDeceleration: 2000,
        pointerOutRelease: true
      },
      mouseWheelScroller: {
        focus: true,
        speed: 1
      },
      space: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        table: 10
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
      ) => this.buildCellContainer(cell, cellContainer)
    }) as RexGridTable;

    gridTable.setScrollFactor?.(0);
    gridTable.setItems(this.items);
    gridTable.resetAllCellsSize?.(cellWidth, cellHeight);

    gridTable.on(
      "cell.click",
      (_cellContainer: Phaser.GameObjects.GameObject, cellIndex: number) => {
        const item = this.items[cellIndex];
        if (!item || item.disabled) {
          this.tooltip?.hide();
          return;
        }
        this.applySelection(item, !this.confirmSelection);
        if (!this.confirmSelection) {
          this.closeModal();
        }
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
        if (!pointer || pointer.wasTouch) {
          this.tooltip?.hide();
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
        const tooltipBody =
          typeof item.description === "string" &&
          item.description.trim().length > 0
            ? stripActionDescriptionMarkup(item.description)
            : undefined;
        const tooltipTitle = item.name?.length ? item.name : undefined;
        if (!tooltipTitle && !tooltipBody) {
          tooltipInstance.hide();
          return;
        }
        const tooltipGO = tooltipInstance.getGameObject();
        tooltipGO.setDepth(10002);
        this.scene.children.bringToTop(tooltipGO);
        tooltipInstance.show(pointer.worldX, pointer.worldY, {
          title: tooltipTitle,
          body: tooltipBody
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
    const layoutSpace = this.resolveLayoutSpace(cellHeight);
    const usableTextWidth =
      cellWidth - layoutSpace.padding.left - layoutSpace.padding.right;
    const maxDescriptionLines = this.resolveMaxDescriptionLines(cellHeight);

    if (!container) {
      container = scene.rexUI.add.sizer({
        orientation: 1,
        space: {
          item: 0,
          left: layoutSpace.padding.left,
          right: layoutSpace.padding.right,
          top: layoutSpace.padding.top,
          bottom: layoutSpace.padding.bottom
        }
      }) as RexSizer;

      const bg = scene.rexUI.add.roundRectangle(
        0,
        0,
        cellWidth,
        cellHeight,
        12,
        THEME.colors.cardBackground
      ) as RexRoundRectangle;
      bg.setSize?.(cellWidth, cellHeight);
      bg.setDisplaySize?.(cellWidth, cellHeight);
      container.addBackground(bg);

      const icon = scene.add
        .image(0, 0, item.texture, item.frame)
        .setOrigin(0.5, 0.5);
      if (item.isEmptyOption) {
        icon.setVisible(false);
        icon.setActive(false);
        icon.setDisplaySize(0, 0);
      } else {
        const baseIconSize = this.resolveIconSize(cellHeight);
        const iconScale = Phaser.Math.Clamp(item.iconScale ?? 1, 0.1, 4);
        const maxIconSize = this.resolveMaxIconDimension(cellHeight);
        const resolvedIconSize = Math.min(
          baseIconSize * iconScale,
          maxIconSize
        );
        icon.setDisplaySize(resolvedIconSize, resolvedIconSize);
        icon.setActive(true);
      }

      const nameText = scene.add
        .text(0, 0, item.name, {
          fontSize: "17px",
          color: item.labelColor ?? "#ffffff",
          align: "center"
        })
        .setOrigin(0.5, 0.5);

      const energyText = scene.add
        .text(0, 0, "", {
          fontSize: "14px",
          color: THEME.colors.energyCost,
          align: "center"
        })
        .setOrigin(0.5, 0.5)
        .setVisible(false);
      energyText.setFixedSize(0, 0);

      const descText = scene.rexUI.add.BBCodeText(0, 0, "", {
        fontSize: "13px",
        color: THEME.colors.modalText,
        align: "center",
        wrap: {
          mode: "word",
          width: usableTextWidth
        },
        maxLines: maxDescriptionLines
      }) as Phaser.GameObjects.Text;
      descText.setOrigin(0.5, 0.5);

      const cooldownText = (
        scene.rexUI?.add?.BBCodeText
          ? scene.rexUI.add.BBCodeText(0, 0, "", {
              fontSize: "12px",
              fontStyle: "bold",
              align: "right",
              wrap: {
                mode: "word",
                width: 95
              }
            })
          : scene.add.text(0, 0, "", {
              fontSize: "12px",
              color: THEME.colors.cooldown,
              fontStyle: "bold",
              align: "right",
              wordWrap: {
                width: 95
              }
            })
      ) as Phaser.GameObjects.Text;
      cooldownText.setOrigin(1, 0);
      cooldownText.setVisible(false);

      const nameTruncated = this.applySingleLineText(
        nameText,
        item.name,
        usableTextWidth
      );
      const descTruncated = this.applyDescriptionText(
        descText,
        item.description,
        usableTextWidth,
        maxDescriptionLines
      );

      const iconMarginBottom = item.isEmptyOption ? 0 : layoutSpace.iconGap;
      container.add(icon, 0, "center", { bottom: iconMarginBottom }, false);
      container.add(
        nameText,
        0,
        "center",
        { bottom: layoutSpace.labelGap },
        false
      );
      container.add(
        energyText,
        0,
        "center",
        { bottom: layoutSpace.labelGap },
        false
      );
      container.add(descText, 0, "center", 0, false);
      container.add(
        cooldownText,
        0,
        "right-top",
        { right: 12, top: 12 },
        false
      );

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
        "energy",
        energyText
      );
      (container as unknown as Phaser.GameObjects.GameObject).setData(
        "id",
        item.id
      );
      (container as unknown as Phaser.GameObjects.GameObject).setData(
        "showTooltip",
        nameTruncated || descTruncated
      );
      (container as unknown as Phaser.GameObjects.GameObject).setData(
        "cooldown",
        cooldownText
      );

      (
        container as unknown as { setMinSize?: (w: number, h: number) => void }
      ).setMinSize?.(cellWidth, cellHeight);

      const created = container as unknown as Phaser.GameObjects.GameObject;
      this.updateCellAppearance(created, {
        item,
        bg,
        icon,
        nameText,
        energyText,
        descText,
        cellWidth,
        cellHeight,
        textWidth: usableTextWidth,
        isSelected: this.selectedItem?.id === item.id
      });
      container.layout();
      return created;
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
    const energyText = containerGO.getData("energy") as
      | Phaser.GameObjects.Text
      | undefined;
    const cooldownText = containerGO.getData("cooldown") as
      | Phaser.GameObjects.Text
      | undefined;

    const layoutSpaceExisting = this.resolveLayoutSpace(cellHeight);

    if (icon) {
      const textureManager = scene.textures;
      const hasTexture = textureManager.exists(item.texture);
      const texture = hasTexture ? textureManager.get(item.texture) : null;
      const hasFrame = item.frame ? texture?.has(item.frame) : true;
      if (item.isEmptyOption) {
        icon.setVisible(false);
        icon.setActive(false);
        icon.setDisplaySize(0, 0);
        const iconSizerConfig = (
          icon as unknown as {
            sizerConfig?: { margin?: { bottom?: number } };
          }
        ).sizerConfig;
        if (iconSizerConfig) {
          iconSizerConfig.margin = iconSizerConfig.margin ?? {};
          iconSizerConfig.margin.bottom = 0;
        }
      } else if (hasTexture && hasFrame) {
        if (item.frame) {
          icon.setTexture(item.texture, item.frame);
        } else {
          icon.setTexture(item.texture);
        }
        const scale = Phaser.Math.Clamp(item.iconScale ?? 1, 0.1, 4);
        const baseIconSize = this.resolveIconSize(cellHeight);
        const maxIconSize = this.resolveMaxIconDimension(cellHeight);
        const resolvedIconSize = Math.min(baseIconSize * scale, maxIconSize);
        icon.setDisplaySize(resolvedIconSize, resolvedIconSize);
        icon.setVisible(true);
        icon.setActive(true);
        const iconSizerConfig = (
          icon as unknown as {
            sizerConfig?: { margin?: { bottom?: number } };
          }
        ).sizerConfig;
        if (iconSizerConfig) {
          iconSizerConfig.margin = iconSizerConfig.margin ?? {};
          iconSizerConfig.margin.bottom = layoutSpaceExisting.iconGap;
        }
      } else {
        icon.setVisible(false);
        icon.setActive(false);
        icon.setDisplaySize(0, 0);
        const iconSizerConfig = (
          icon as unknown as {
            sizerConfig?: { margin?: { bottom?: number } };
          }
        ).sizerConfig;
        if (iconSizerConfig) {
          iconSizerConfig.margin = iconSizerConfig.margin ?? {};
          iconSizerConfig.margin.bottom = 0;
        }
      }
    }
    const nameTruncated = nameText
      ? this.applySingleLineText(nameText, item.name, usableTextWidth)
      : false;
    const descTruncated = descText
      ? this.applyDescriptionText(
          descText,
          item.description,
          usableTextWidth,
          maxDescriptionLines
        )
      : false;
    containerGO.setData("id", item.id);
    containerGO.setData("showTooltip", nameTruncated || descTruncated);
    if (cooldownText) {
      cooldownText.setVisible(false);
    }

    (
      container as unknown as { setMinSize?: (w: number, h: number) => void }
    ).setMinSize?.(cellWidth, cellHeight);

    this.updateCellAppearance(containerGO, {
      item,
      bg,
      icon,
      nameText,
      descText,
      energyText,
      cellWidth,
      cellHeight,
      textWidth: usableTextWidth,
      isSelected: this.selectedItem?.id === item.id
    });

    container.layout();
    return containerGO;
  }

  private updateCellAppearance(
    container: Phaser.GameObjects.GameObject,
    config: {
      item: GridSelectItem;
      bg?: RexRoundRectangle;
      icon?: Phaser.GameObjects.Image;
      nameText?: Phaser.GameObjects.Text;
      descText?: Phaser.GameObjects.Text;
      energyText?: Phaser.GameObjects.Text;
      cellWidth: number;
      cellHeight: number;
      textWidth: number;
      isSelected: boolean;
    }
  ) {
    const disabled = config.item.disabled === true;
    const selected = config.isSelected && !disabled;
    const highlighted = config.item.highlighted === true && !disabled;
    const baseColor = selected
      ? THEME.colors.cardSelected
      : highlighted
        ? THEME.colors.cardPrioritized
        : disabled
          ? THEME.colors.cardDisabled
          : THEME.colors.cardBackground;
    config.bg?.setFillStyle?.(baseColor, 1);
    config.bg?.setSize?.(config.cellWidth, config.cellHeight);
    config.bg?.setDisplaySize?.(config.cellWidth, config.cellHeight);

    if (config.icon) {
      config.icon.setAlpha(disabled ? 0.5 : 1);
    }
    config.nameText?.setColor(
      disabled
        ? THEME.colors.textDisabled
        : highlighted
          ? THEME.colors.healthRecover
          : (config.item.labelColor ?? THEME.colors.textPrimary)
    );
    config.descText?.setColor(
      disabled ? THEME.colors.textDisabled : THEME.colors.modalText
    );
    if (config.energyText) {
      const hasCost =
        typeof config.item.energyCost === "number" &&
        Number.isFinite(config.item.energyCost);
      const shouldShow = hasCost && config.item.isEmptyOption !== true;
      if (shouldShow) {
        const label = `${t("Energy")}: ${config.item.energyCost}`;
        this.applySingleLineText(config.energyText, label, config.textWidth);
        config.energyText.setColor(
          disabled ? THEME.colors.textDisabled : THEME.colors.energyCost
        );
        config.energyText.setVisible(true);
      } else {
        config.energyText.setText("");
        config.energyText.setFixedSize(0, 0);
        config.energyText.setVisible(false);
      }
    }

    const cooldownText = container.getData("cooldown") as
      | Phaser.GameObjects.Text
      | undefined;
    if (cooldownText) {
      const remaining = config.item.cooldownRemaining ?? 0;
      const missing = config.item.missingRequirement?.trim();
      const isBBCode =
        typeof (cooldownText as unknown as { getWrappedText?: unknown })
          .getWrappedText === "function";

      const parts: string[] = [];
      if (remaining > 0) {
        parts.push(
          isBBCode
            ? `[color=${THEME.colors.cooldown}]CD: ${remaining}[/color]`
            : `CD: ${remaining}`
        );
      }
      if (missing) {
        parts.push(
          isBBCode
            ? `[color=${THEME.colors.warning}]${missing}[/color]`
            : missing
        );
      }

      if (parts.length > 0) {
        cooldownText.setText(parts.join("\n"));
        if (!isBBCode) {
          cooldownText.setColor(
            missing ? THEME.colors.warning : THEME.colors.cooldown
          );
        }
        cooldownText.setVisible(true);
      } else {
        cooldownText.setText("");
        cooldownText.setVisible(false);
      }
    }

    const typed = container as Phaser.GameObjects.GameObject & {
      setAlpha?: (value: number) => Phaser.GameObjects.GameObject;
    };
    typed.setAlpha?.(disabled ? 0.9 : 1);
  }

  private applyDescriptionText(
    target: Phaser.GameObjects.Text,
    content: string | null | undefined,
    maxWidth: number,
    maxLines: number
  ): boolean {
    const rawTextValue = typeof content === "string" ? content : "";
    const textValue = parseActionDescription(rawTextValue);
    const hasContent = rawTextValue.trim().length > 0;
    if (!hasContent) {
      target.setText("");
      target.setVisible(false);
      target.setActive(false);
      target.setFixedSize(maxWidth, 0);
      return false;
    }

    target.setVisible(true);
    target.setActive(true);

    const rich = /\[.+\]/.test(textValue) || /<.+>/.test(textValue);
    const bbcodeTarget = target as unknown as {
      setWrapWidth?: (width: number) => unknown;
      setWordWrapWidth?: (width: number, useAdvancedWrap?: boolean) => unknown;
      setMaxLines?: (lines: number) => unknown;
      style?: { [key: string]: unknown };
      getWrappedText?: (text?: string) => string[];
    };
    if (!rich) {
      if (typeof bbcodeTarget.setWrapWidth === "function") {
        bbcodeTarget.setWrapWidth(maxWidth);
      } else {
        target.setWordWrapWidth(maxWidth, true);
      }
      return this.applyMultilineText(target, textValue, maxWidth, maxLines);
    }
    if (typeof bbcodeTarget.setWrapWidth === "function") {
      bbcodeTarget.setWrapWidth(maxWidth);
    } else {
      target.setWordWrapWidth(maxWidth, true);
    }
    if (typeof bbcodeTarget.setMaxLines === "function") {
      bbcodeTarget.setMaxLines(maxLines);
    } else if (bbcodeTarget.style) {
      bbcodeTarget.style.maxLines = maxLines;
    }
    target.setText(textValue);
    const wrapped = bbcodeTarget.getWrappedText
      ? bbcodeTarget.getWrappedText(textValue)
      : target.getWrappedText();
    const truncated =
      maxLines > 0 && Array.isArray(wrapped) && wrapped.length > maxLines;
    const bounds = target.getBounds();
    target.setFixedSize(maxWidth, bounds.height);
    return truncated;
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

  private resolveMaxDescriptionLines(cellHeight: number) {
    if (cellHeight >= 220) {
      return 10;
    }
    if (cellHeight >= 180) {
      return 7;
    }
    if (cellHeight >= 150) {
      return 5;
    }
    if (cellHeight >= 132) {
      return 3;
    }
    return 2;
  }

  private resolveLayoutSpace(cellHeight: number) {
    if (cellHeight <= 132) {
      return {
        padding: { left: 10, right: 10, top: 10, bottom: 10 },
        iconGap: 2,
        labelGap: 1
      } as const;
    }
    if (cellHeight <= 180) {
      return {
        padding: { left: 12, right: 12, top: 12, bottom: 12 },
        iconGap: 4,
        labelGap: 3
      } as const;
    }
    return {
      padding: { left: 14, right: 14, top: 14, bottom: 14 },
      iconGap: 5,
      labelGap: 4
    } as const;
  }

  private resolveIconSize(cellHeight: number) {
    if (cellHeight <= 132) {
      return Math.max(26, Math.floor(cellHeight * 0.32));
    }
    if (cellHeight <= 180) {
      return Math.max(28, Math.floor(cellHeight * 0.36));
    }
    return Math.max(32, Math.min(64, Math.floor(cellHeight * 0.4)));
  }

  private resolveMaxIconDimension(cellHeight: number) {
    return Math.max(28, Math.floor(cellHeight * 0.55));
  }

  private applyEnabledState() {
    const bg = this.background as unknown as {
      setAlpha?: (value: number) => unknown;
    };
    bg.setAlpha?.(this.enabled ? 1 : 0.75);
    this.updateCollapsedBorder();
    this.icon.setAlpha(this.enabled ? 1 : 0.6);
    this.label.setColor(
      this.enabled ? this.labelActiveColor : THEME.colors.textDisabled
    );
    if (!this.enabled) {
      this.scene.input.setDefaultCursor("default");
    }
  }

  private updateCollapsedBorder(): void {
    const color = this.tutorialHighlighted
      ? 0xfbbf24
      : THEME.colors.collapsedBorder;
    this.background.setStrokeStyle?.(this.tutorialHighlighted ? 3 : 2, color, 1);
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
