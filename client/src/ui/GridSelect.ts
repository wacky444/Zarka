import Phaser from "phaser";
import { t } from "../services/i18n";
import { ItemTooltipManager } from "./ItemTooltip";
import { THEME } from "./ColorPalette";
import { isMobile } from "../utils/isMobile";

const ACTION_DESCRIPTION_TAG_PATTERN =
  /\[(health-damage|energy-damage|energy-recover|health-recover)\]([\s\S]*?)\[\/\1\]/g;

const ACTION_DESCRIPTION_TAG_COLORS: Record<string, string> = {
  "health-damage": THEME.colors.healthDamage,
  "energy-damage": THEME.colors.energyDamage,
  "energy-recover": THEME.colors.energyRecover,
  "health-recover": THEME.colors.healthRecover
};

const COLLAPSED_ICON_LEFT = 12;
const ACTION_DESCRIPTION_LONG_PRESS_MS = 500;

type MobileGridCellContent = "name" | "image";

function shouldShowGridSelectImages(
  scene: Phaser.Scene,
  mobileCellContent: MobileGridCellContent,
  mobileCellIcons = false
): boolean {
  return (
    !isMobile(scene.scale.width) ||
    mobileCellContent === "image" ||
    mobileCellIcons
  );
}

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
  shortName?: string;
  labelColor?: string;
  description?: string | null;
  texture: string;
  frame?: string;
  iconScale?: number;
  centerOpaquePixels?: boolean;
  highlighted?: boolean;
  tags?: string[];
  cooldownRemaining?: number;
  missingRequirement?: string | null;
  energyCost?: number;
  disabled?: boolean;
  isEmptyOption?: boolean;
}

interface OpaquePixelCenter {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextureAlphaData {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

const OPAQUE_PIXEL_CENTERS = new Map<string, OpaquePixelCenter | null>();
const TEXTURE_ALPHA_DATA = new Map<string, TextureAlphaData | null>();

function getTextureAlphaData(
  scene: Phaser.Scene,
  textureKey: string,
  sourceIndex: number
): TextureAlphaData | null {
  const cacheKey = `${textureKey}:${sourceIndex}`;
  if (TEXTURE_ALPHA_DATA.has(cacheKey)) {
    return TEXTURE_ALPHA_DATA.get(cacheKey) ?? null;
  }
  if (typeof document === "undefined" || !scene.textures.exists(textureKey)) {
    return null;
  }

  const source = scene.textures.get(textureKey).source[sourceIndex];
  const image = source?.image;
  if (!source || !image || image instanceof Uint8Array) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    TEXTURE_ALPHA_DATA.set(cacheKey, null);
    return null;
  }

  try {
    context.drawImage(image as unknown as CanvasImageSource, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const alphaData = {
      width: canvas.width,
      height: canvas.height,
      pixels
    };
    TEXTURE_ALPHA_DATA.set(cacheKey, alphaData);
    return alphaData;
  } catch {
    TEXTURE_ALPHA_DATA.set(cacheKey, null);
    return null;
  }
}

function getOpaqueCenterOffset(
  scene: Phaser.Scene,
  item: GridSelectItem,
  displayWidth: number,
  displayHeight: number
): { x: number; y: number } {
  if (
    isMobile(scene.scale.width) ||
    !item.centerOpaquePixels ||
    !item.frame ||
    !scene.textures.exists(item.texture)
  ) {
    return { x: 0, y: 0 };
  }

  const cacheKey = `${item.texture}:${item.frame}`;
  let center = OPAQUE_PIXEL_CENTERS.get(cacheKey);
  if (!OPAQUE_PIXEL_CENTERS.has(cacheKey)) {
    const texture = scene.textures.get(item.texture);
    if (!texture.has(item.frame)) {
      return { x: 0, y: 0 };
    }
    const frame = texture.get(item.frame);
    const alphaData = getTextureAlphaData(
      scene,
      item.texture,
      frame.sourceIndex
    );
    if (!alphaData) {
      return { x: 0, y: 0 };
    }

    let minX = frame.cutWidth;
    let minY = frame.cutHeight;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < frame.cutHeight; y += 1) {
      for (let x = 0; x < frame.cutWidth; x += 1) {
        const pixelX = frame.cutX + x;
        const pixelY = frame.cutY + y;
        const alphaIndex = (pixelY * alphaData.width + pixelX) * 4 + 3;
        if (alphaData.pixels[alphaIndex] > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    center =
      maxX < 0
        ? null
        : {
            x: (minX + maxX + 1) / 2,
            y: (minY + maxY + 1) / 2,
            width: frame.cutWidth,
            height: frame.cutHeight
          };
    OPAQUE_PIXEL_CENTERS.set(cacheKey, center);
  }

  if (!center) {
    return { x: 0, y: 0 };
  }
  return {
    x: (center.width / 2 - center.x) * (displayWidth / center.width),
    y: (center.height / 2 - center.y) * (displayHeight / center.height)
  };
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
  mobileCellContent?: MobileGridCellContent;
  mobileCellIcons?: boolean;
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
  setMinSize: (width: number, height: number) => unknown;
  setOrigin: (x: number, y?: number) => unknown;
  setPosition: (x: number, y: number) => unknown;
  x: number;
  y: number;
};

type RexScrollablePanel = Phaser.GameObjects.GameObject & {
  clearMask?: (destroyMask?: boolean) => Phaser.GameObjects.GameObject;
  setOrigin?: (x: number, y?: number) => Phaser.GameObjects.GameObject;
  getBounds?: () => Phaser.Geom.Rectangle;
  layout?: () => unknown;
  setMask?: (
    mask: Phaser.Display.Masks.BitmapMask | Phaser.Display.Masks.GeometryMask
  ) => Phaser.GameObjects.GameObject;
  setMouseWheelScrollerEnable?: (enabled: boolean) => void;
  setScrollerEnable?: (enabled: boolean) => void;
  setScrollFactor?: (x: number, y?: number) => Phaser.GameObjects.GameObject;
  addChildOY?: (inc: number, clamp?: boolean) => void;
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

interface StaticGridCell {
  item: GridSelectItem;
  background: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  icon?: Phaser.GameObjects.Image;
  energy?: Phaser.GameObjects.Text;
  cooldown?: Phaser.GameObjects.Text;
  warning?: Phaser.GameObjects.Text;
  description?: Phaser.GameObjects.Text;
  descriptionTruncated: boolean;
}

export class GridSelect extends Phaser.GameObjects.Container {
  private readonly background: RexRoundRectangle;
  private readonly icon: Phaser.GameObjects.Image | null;
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
  private readonly mobileCellContent: MobileGridCellContent;
  private readonly mobileCellIcons: boolean;
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
  private staticGridPanel: RexScrollablePanel | null = null;
  private staticGridContent: Phaser.GameObjects.Container | null = null;
  private staticGridCells: StaticGridCell[] = [];
  private readonly longPressTimers = new Set<Phaser.Time.TimerEvent>();
  private gridViewportMask: Phaser.Display.Masks.GeometryMask | null = null;
  private gridViewportMaskShape: Phaser.GameObjects.Rectangle | null = null;
  private tooltip: ItemTooltipManager | null = null;
  private enabled = true;
  private tutorialHighlighted = false;
  private readonly labelActiveColor: string;
  private readonly iconTextGap: number;
  private currentWidth: number;
  private modalVisible = false;
  private modalViewportWidth = 0;
  private modalViewportHeight = 0;
  private modalViewportIsMobile = false;
  private resizeTimer: Phaser.Time.TimerEvent | null = null;
  private readonly handleScaleResize = (): void => {
    if (!this.modalVisible) {
      return;
    }
    if (this.resizeTimer) {
      this.scene.time.removeEvent(this.resizeTimer);
    }
    this.resizeTimer = this.scene.time.delayedCall(120, () => {
      this.resizeTimer = null;
      if (!this.modalVisible) {
        return;
      }
      this.closeModal(true);
      this.openModal();
    });
  };
  private readonly handleTooltipPointerDown = (): void => {
    if (this.modalVisible) {
      this.tooltip?.hide();
    }
  };

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    config: GridSelectConfig
  ) {
    super(scene, x, y);
    scene.add.existing(this);
    scene.input.on(
      Phaser.Input.Events.POINTER_DOWN,
      this.handleTooltipPointerDown,
      this
    );
    scene.scale.on(
      Phaser.Scale.Events.RESIZE,
      this.handleScaleResize,
      this
    );

    this.collapsedHeight = config.height ?? 64;
    this.columns = Math.max(1, config.columns ?? 3);
    this.modalTitle = config.title ?? "Select";
    this.modalSubtitle = config.subtitle ?? "Tap an action to select it";
    this.placeholder = config.placeholder ?? "Select";
    this.emptyLabel = config.emptyLabel ?? "Unknown";
    this.iconTextGap = config.iconTextGap ?? 16;
    this.defaultModalWidth = config.modalWidth ?? 600;
    this.defaultModalHeight = config.modalHeight ?? 480;
    this.modalWidth = this.defaultModalWidth;
    this.modalHeight = this.defaultModalHeight;
    this.iconTargetSize = Math.min(this.collapsedHeight - 12, 48);
    this.cellHeight = Math.max(96, config.cellHeight ?? 240);
    this.mobileCellContent = config.mobileCellContent ?? "name";
    this.mobileCellIcons = config.mobileCellIcons === true;
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

    this.icon = shouldShowGridSelectImages(
      scene,
      this.mobileCellContent,
      this.mobileCellIcons
    )
      ? scene.add.image(
          COLLAPSED_ICON_LEFT,
          this.collapsedHeight / 2,
          "hex",
          "grass_01.png"
        )
      : null;
    this.icon?.setOrigin(0, 0.5);
    this.icon?.setDisplaySize(this.iconTargetSize, this.iconTargetSize);

    this.label = scene.add
      .text(16, this.collapsedHeight / 2, this.placeholder, {
        fontSize: "17px",
        color: this.labelActiveColor
      })
      .setOrigin(0, 0.5);

    this.add(this.background);
    if (this.icon) {
      this.add(this.icon);
    }
    this.add(this.label);
    this.add(this.hitAreaZone);

    this.icon?.setVisible(false);
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
    this.scene.input.off(
      Phaser.Input.Events.POINTER_DOWN,
      this.handleTooltipPointerDown,
      this
    );
    this.scene.scale.off(
      Phaser.Scale.Events.RESIZE,
      this.handleScaleResize,
      this
    );
    if (this.resizeTimer) {
      this.scene.time.removeEvent(this.resizeTimer);
      this.resizeTimer = null;
    }
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
    if (this.modalVisible) {
      this.rebuildStaticGridContent();
    }
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
      this.label.setX(
        COLLAPSED_ICON_LEFT + this.icon.displayWidth + this.iconTextGap
      );
    } else {
      this.label.setX(16);
    }
  }

  private clearSelection() {
    this.selectedItem = null;
    this.icon?.setVisible(false);
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
    if (this.modalVisible) {
      this.refreshStaticGridCells();
    }
  }

  private updateCollapsedView(item: GridSelectItem) {
    if (item.isEmptyOption) {
      this.icon?.setVisible(false);
      this.label.setText(item.name.length > 0 ? item.name : this.emptyLabel);
      this.updateLabelPosition();
      return;
    }
    const icon = this.icon;
    if (icon) {
      const textureManager = this.scene.textures;
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
        icon.setDisplaySize(
          this.iconTargetSize * scale,
          this.iconTargetSize * scale
        );
        const offset = getOpaqueCenterOffset(
          this.scene,
          item,
          icon.displayWidth,
          icon.displayHeight
        );
        icon.setPosition(
          COLLAPSED_ICON_LEFT + offset.x,
          this.collapsedHeight / 2 + offset.y
        );
        icon.setVisible(true);
      } else {
        icon.setVisible(false);
      }
    }
    this.label.setText(item.name.length > 0 ? item.name : this.emptyLabel);
    this.updateLabelPosition();
    this.applyEnabledState();
  }

  private openModal() {
    if (!this.enabled || this.items.length === 0) {
      return;
    }
    const scene = this.scene;
    const { width, height } = scene.scale;
    const mobile = isMobile(width);
    if (
      this.overlay &&
      (this.modalViewportWidth !== width ||
        this.modalViewportHeight !== height ||
        this.modalViewportIsMobile !== mobile)
    ) {
      this.closeModal(true);
      this.openModal();
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
      this.rebuildStaticGridContent();
      this.staticGridPanel?.setScrollerEnable?.(true);
      this.staticGridPanel?.setMouseWheelScrollerEnable?.(true);
      this.staticGridPanel?.layout?.();
      this.tooltip?.hide();
      return;
    }
    this.modalWidth = mobile
      ? width
      : Math.min(this.defaultModalWidth, Math.max(1, width - 80));
    this.modalHeight = mobile
      ? height
      : Math.min(this.defaultModalHeight, Math.max(1, height - 80));

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
        this.tooltip?.hide();
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
        this.tooltip?.hide();
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
        dy: number,
        _dz: number,
        event: WheelEvent
      ) => {
        event?.stopPropagation?.();
        this.staticGridPanel?.addChildOY?.(-dy, true);
      }
    );

    const titleMaxWidth = Math.max(1, this.modalWidth - 48);
    const header = scene.add
      .text(0, 0, this.modalTitle, {
        fontSize: "22px",
        color: THEME.colors.modalHeader,
        fontStyle: "bold",
        align: "center"
      })
      .setOrigin(0.5, 0.5);
    const singleLineHeaderHeight = header.height;
    header.setWordWrapWidth(titleMaxWidth, true);
    modal.add(header, 0, "center", { bottom: 4 }, false);

    const subtitle = scene.add
      .text(0, 0, this.modalSubtitle, {
        fontSize: "15px",
        color: THEME.colors.modalText,
        align: "center"
      })
      .setOrigin(0.5, 0.5);
    const singleLineSubtitleHeight = subtitle.height;
    subtitle.setWordWrapWidth(titleMaxWidth, true);
    modal.add(subtitle, 0, "center", { bottom: 4 }, false);

    const extraHeaderHeight =
      Math.max(0, header.height - singleLineHeaderHeight) +
      Math.max(0, subtitle.height - singleLineSubtitleHeight);
    const gridView = this.createStaticGridPanel(
      this.modalHeight -
        (this.confirmSelection ? 190 : 140) -
        extraHeaderHeight
    );
    modal.add(
      gridView as unknown as Phaser.GameObjects.GameObject,
      1,
      "center",
      0,
      true
    );
    if (this.confirmSelection) {
      this.confirmButton = this.createConfirmButton(scene);
      modal.add(this.confirmButton, 0, "center", { top: 10 }, false);
    }

    modal.setMinSize(this.modalWidth, this.modalHeight);
    modal.setOrigin(0.5, 0.5);
    modal.layout();
    modal.setPosition(width / 2, height / 2);
    overlay.add(modal);

    this.gridViewportMaskShape?.destroy();
    this.gridViewportMaskShape = null;
    this.gridViewportMask?.destroy();
    this.gridViewportMask = null;

    const bounds =
      gridView.getBounds?.() ??
      new Phaser.Geom.Rectangle(
        (gridView as unknown as { x?: number }).x ?? 0,
        (gridView as unknown as { y?: number }).y ?? 0,
        (gridView as unknown as { width?: number }).width ?? 0,
        (gridView as unknown as { height?: number }).height ?? 0
      );
    this.gridViewportMaskShape = scene.add
      .rectangle(bounds.x, bounds.y, bounds.width, bounds.height, 0xffffff, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setAlpha(0.0001);
    overlay.add(this.gridViewportMaskShape);
    this.gridViewportMask = this.gridViewportMaskShape.createGeometryMask();
    gridView.setMask?.(this.gridViewportMask);

    if (mobile) {
      this.modalCloseButton = this.createMobileCloseButton(
        scene,
        overlay,
        width
      );
    }

    this.ensureTooltip();
    this.overlay = overlay;
    this.modalViewportWidth = width;
    this.modalViewportHeight = height;
    this.modalViewportIsMobile = mobile;
    this.staticGridPanel = gridView as RexScrollablePanel;
    this.updateConfirmButton();
    scene.time.delayedCall(0, () => this.staticGridPanel?.layout?.());
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
        this.emit(
          "change",
          selected.isEmptyOption ? null : selected.id,
          selected
        );
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
    const background = this.confirmButton.getData("background") as
      | Phaser.GameObjects.Rectangle
      | undefined;
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

  private clearLongPressTimers(): void {
    for (const timer of this.longPressTimers) {
      this.scene.time.removeEvent(timer);
    }
    this.longPressTimers.clear();
  }

  private closeModal(forceDestroy = false) {
    this.clearLongPressTimers();
    if (this.resizeTimer) {
      this.scene.time.removeEvent(this.resizeTimer);
      this.resizeTimer = null;
    }
    const wasVisible = this.modalVisible;
    if (!this.overlay) {
      if (wasVisible) {
        this.modalVisible = false;
        this.emit("modal-close");
      }
      return;
    }

    if (forceDestroy) {
      this.staticGridPanel?.clearMask?.();
      this.gridViewportMask?.destroy();
      this.gridViewportMask = null;
      this.gridViewportMaskShape?.destroy();
      this.gridViewportMaskShape = null;

      this.overlay.destroy(true);
      this.overlay = null;
      this.confirmButton = null;
      this.modalCover = null;
      this.modalCloseButton = null;
      this.staticGridPanel = null;
      this.staticGridContent = null;
      this.staticGridCells = [];
      this.modalViewportWidth = 0;
      this.modalViewportHeight = 0;
      this.modalViewportIsMobile = false;
      this.tooltip?.destroy();
      this.tooltip = null;
    } else {
      this.overlay.setVisible(false);
      this.overlay.setActive(false);
      this.staticGridPanel?.setScrollerEnable?.(false);
      this.staticGridPanel?.setMouseWheelScrollerEnable?.(false);
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

  private createStaticGridPanel(height: number): RexScrollablePanel {
    const scene = this.scene;
    const content = scene.add.container(0, 0);
    content.setScrollFactor(0);
    this.staticGridContent = content;
    this.rebuildStaticGridContent();

    const panel = scene.rexUI.add.scrollablePanel({
      width: this.modalWidth - 48,
      height: Math.max(1, height),
      scrollMode: 0,
      panel: {
        child: content,
        mask: false
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
      space: { left: 0, right: 8, top: 0, bottom: 0, panel: 0 }
    }) as RexScrollablePanel;
    panel.setOrigin?.(0, 0);
    panel.setScrollFactor?.(0);
    panel.layout?.();
    return panel;
  }

  private rebuildStaticGridContent(): void {
    const content = this.staticGridContent;
    if (!content) {
      return;
    }
    this.clearLongPressTimers();
    this.tooltip?.hide();
    content.removeAll(true);
    this.staticGridCells = [];

    const gridWidth = this.modalWidth - 48;
    const columnGap = 12;
    const rowGap = 10;
    const cellWidth =
      (gridWidth - (this.columns - 1) * columnGap) / this.columns;
    const rowCount = Math.ceil(this.items.length / this.columns);

    this.items.forEach((item, index) => {
      const column = index % this.columns;
      const row = Math.floor(index / this.columns);
      const x = column * (cellWidth + columnGap);
      const y = row * (this.cellHeight + rowGap);
      const background = this.scene.add
        .rectangle(
          x,
          y,
          cellWidth,
          this.cellHeight,
          this.getGridCellBackground(item)
        )
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x2d3a60, 0.9);
      const hasActionIcon =
        shouldShowGridSelectImages(
          this.scene,
          this.mobileCellContent,
          this.mobileCellIcons
        ) &&
        item.isEmptyOption !== true &&
        this.scene.textures.exists(item.texture) &&
        (!item.frame || this.scene.textures.get(item.texture).has(item.frame));
      const iconScale = Phaser.Math.Clamp(item.iconScale ?? 1, 0.1, 4);
      const iconSize = hasActionIcon
        ? Math.max(
            1,
            Math.min(
              this.resolveIconSize(this.cellHeight) * iconScale,
              this.resolveMaxIconDimension(this.cellHeight),
              cellWidth - 20,
              54
            )
          )
        : 0;
      const icon = hasActionIcon
        ? this.scene.add
            .image(
              x + cellWidth / 2,
              y + 10 + iconSize / 2,
              item.texture,
              item.frame
            )
            .setDisplaySize(iconSize, iconSize)
            .setAlpha(item.disabled ? 0.5 : 1)
        : undefined;
      const label = this.scene.add
        .text(x + cellWidth / 2, y, item.name, {
          fontSize: "15px",
          color: item.disabled
            ? THEME.colors.textDisabled
            : (item.labelColor ?? THEME.colors.textPrimary),
          align: "center",
          wordWrap: { width: Math.max(1, cellWidth - 16) }
        })
        .setOrigin(0.5);
      const hasEnergyCost =
        item.isEmptyOption !== true &&
        typeof item.energyCost === "number" &&
        Number.isFinite(item.energyCost);
      const energy = hasEnergyCost
        ? this.scene.add
            .text(x + cellWidth / 2, y, `${t("Energy")}: ${item.energyCost}`, {
              fontSize: "12px",
              color: item.disabled
                ? THEME.colors.textDisabled
                : THEME.colors.energyCost,
              align: "center"
            })
            .setOrigin(0.5)
        : undefined;
      const cooldownRemaining = item.cooldownRemaining ?? 0;
      const cooldown =
        cooldownRemaining > 0
          ? (
              this.scene.rexUI.add.BBCodeText(
                x + cellWidth / 2,
                y,
                `[color=${THEME.colors.cooldown}]CD: ${cooldownRemaining}[/color]`,
                {
                  fontSize: "11px",
                  color: THEME.colors.cooldown,
                  align: "center",
                  wrap: { mode: "word", width: Math.max(1, cellWidth - 16) },
                  maxLines: 1
                }
              ) as Phaser.GameObjects.Text
            ).setOrigin(0.5)
          : undefined;
      const missingRequirement = item.missingRequirement?.trim();
      const warning = missingRequirement
        ? (
            this.scene.rexUI.add.BBCodeText(
              x + cellWidth / 2,
              y,
              `[color=${THEME.colors.warning}]${missingRequirement}[/color]`,
              {
                fontSize: "11px",
                color: THEME.colors.warning,
                align: "center",
                wrap: { mode: "word", width: Math.max(1, cellWidth - 16) },
                maxLines: 2
              }
            ) as Phaser.GameObjects.Text
          ).setOrigin(0.5)
        : undefined;
      const descriptionContent =
        typeof item.description === "string" ? item.description.trim() : "";
      const descriptionMaxLines = icon
        ? Math.min(6, this.resolveMaxDescriptionLines(this.cellHeight))
        : this.resolveMaxDescriptionLines(this.cellHeight);
      const description = descriptionContent
        ? (
            this.scene.rexUI.add.BBCodeText(x + cellWidth / 2, y, "", {
              fontSize: "12px",
              color: THEME.colors.modalText,
              align: "center",
              wrap: {
                mode: "word",
                width: Math.max(1, cellWidth - 16)
              },
              maxLines: descriptionMaxLines
            }) as Phaser.GameObjects.Text
          ).setOrigin(0.5)
        : undefined;
      const descriptionTruncated = description
        ? this.applyDescriptionText(
            description,
            descriptionContent,
            Math.max(1, cellWidth - 16),
            descriptionMaxLines
          )
        : false;
      const textParts = [label, energy, cooldown, warning, description].filter(
        (part): part is Phaser.GameObjects.Text => part !== undefined
      );
      const partGap = 4;
      const groupHeight =
        textParts.reduce((height, part) => height + part.height, 0) +
        Math.max(0, textParts.length - 1) * partGap;
      const textAreaTop = icon ? y + iconSize + 18 : y + 10;
      const textAreaHeight = this.cellHeight - (icon ? iconSize + 28 : 20);
      let nextTextY =
        textAreaTop + Math.max(0, textAreaHeight - groupHeight) / 2;
      for (const part of textParts) {
        part.setY(nextTextY + part.height / 2);
        nextTextY += part.height + partGap;
      }
      background.setInteractive({ useHandCursor: !item.disabled });

      let pointerDownPosition: {
        id: number;
        x: number;
        y: number;
      } | null = null;
      let longPressTimer: Phaser.Time.TimerEvent | null = null;
      let longPressTriggered = false;
      const cancelLongPress = (): void => {
        if (!longPressTimer) {
          return;
        }
        this.scene.time.removeEvent(longPressTimer);
        this.longPressTimers.delete(longPressTimer);
        longPressTimer = null;
      };
      const showActionDescription = (pointer: Phaser.Input.Pointer): void => {
        if (!descriptionContent) {
          return;
        }
        this.ensureTooltip();
        this.tooltip?.show(
          pointer.x,
          pointer.y,
          item.name,
          stripActionDescriptionMarkup(descriptionContent)
        );
      };
      background.on(
        Phaser.Input.Events.POINTER_DOWN,
        (pointer: Phaser.Input.Pointer) => {
          this.tooltip?.hide();
          cancelLongPress();
          longPressTriggered = false;
          pointerDownPosition = {
            id: pointer.id,
            x: pointer.x,
            y: pointer.y
          };
          if (!descriptionContent) {
            return;
          }
          const timer = this.scene.time.delayedCall(
            ACTION_DESCRIPTION_LONG_PRESS_MS,
            () => {
              this.longPressTimers.delete(timer);
              if (longPressTimer === timer) {
                longPressTimer = null;
              }
              const down = pointerDownPosition;
              if (
                !down ||
                down.id !== pointer.id ||
                Phaser.Math.Distance.Between(
                  down.x,
                  down.y,
                  pointer.x,
                  pointer.y
                ) > 10
              ) {
                return;
              }
              longPressTriggered = true;
              showActionDescription(pointer);
            }
          );
          longPressTimer = timer;
          this.longPressTimers.add(timer);
        }
      );
      background.on(
        Phaser.Input.Events.POINTER_MOVE,
        (pointer: Phaser.Input.Pointer) => {
          const down = pointerDownPosition;
          if (
            down &&
            down.id === pointer.id &&
            Phaser.Math.Distance.Between(down.x, down.y, pointer.x, pointer.y) >
              10
          ) {
            cancelLongPress();
            if (longPressTriggered) {
              longPressTriggered = false;
              this.tooltip?.hide();
            }
          }
        }
      );
      background.on(
        Phaser.Input.Events.POINTER_UP,
        (pointer: Phaser.Input.Pointer) => {
          const wasLongPress = longPressTriggered;
          cancelLongPress();
          const down = pointerDownPosition;
          pointerDownPosition = null;
          if (wasLongPress) {
            return;
          }
          if (
            !down ||
            down.id !== pointer.id ||
            pointer.button !== 0 ||
            Phaser.Math.Distance.Between(down.x, down.y, pointer.x, pointer.y) >
              10 ||
            item.disabled
          ) {
            return;
          }
          this.applySelection(item, !this.confirmSelection);
          if (!this.confirmSelection) {
            this.closeModal();
          }
        }
      );
      background.on(
        Phaser.Input.Events.POINTER_OVER,
        (pointer: Phaser.Input.Pointer) => {
          if (!item.disabled) {
            this.scene.input.setDefaultCursor("pointer");
          }
          if (!descriptionTruncated || pointer.wasTouch) {
            return;
          }
          showActionDescription(pointer);
        }
      );
      background.on(Phaser.Input.Events.POINTER_OUT, () => {
        cancelLongPress();
        this.scene.input.setDefaultCursor("default");
        if (!longPressTriggered) {
          this.tooltip?.hide();
        }
      });
      background.on(
        Phaser.Input.Events.POINTER_WHEEL,
        (_pointer: Phaser.Input.Pointer, _dx: number, dy: number) => {
          this.staticGridPanel?.addChildOY?.(-dy, true);
        }
      );

      content.add(background);
      if (icon) {
        content.add(icon);
      }
      content.add(label);
      if (energy) {
        content.add(energy);
      }
      if (cooldown) {
        content.add(cooldown);
      }
      if (warning) {
        content.add(warning);
      }
      if (description) {
        content.add(description);
      }
      this.staticGridCells.push({
        item,
        background,
        label,
        ...(icon ? { icon } : {}),
        ...(energy ? { energy } : {}),
        ...(cooldown ? { cooldown } : {}),
        ...(warning ? { warning } : {}),
        ...(description ? { description } : {}),
        descriptionTruncated
      });
    });

    content.setSize(
      gridWidth,
      rowCount === 0 ? 0 : rowCount * (this.cellHeight + rowGap) - rowGap
    );
    this.refreshStaticGridCells();
    this.staticGridPanel?.layout?.();
  }

  private refreshStaticGridCells(): void {
    for (const cell of this.staticGridCells) {
      cell.background.setFillStyle(this.getGridCellBackground(cell.item), 1);
      cell.label.setColor(
        cell.item.disabled
          ? THEME.colors.textDisabled
          : cell.item.highlighted
            ? THEME.colors.healthRecover
            : (cell.item.labelColor ?? THEME.colors.textPrimary)
      );
      cell.icon?.setAlpha(cell.item.disabled ? 0.5 : 1);
      cell.energy?.setColor(
        cell.item.disabled ? THEME.colors.textDisabled : THEME.colors.energyCost
      );
      cell.cooldown?.setColor(
        cell.item.disabled ? THEME.colors.textDisabled : THEME.colors.cooldown
      );
      cell.warning?.setColor(
        cell.item.disabled ? THEME.colors.textDisabled : THEME.colors.warning
      );
      cell.description?.setColor(
        cell.item.disabled ? THEME.colors.textDisabled : THEME.colors.modalText
      );
    }
  }

  private getGridCellBackground(item: GridSelectItem): number {
    if (item.disabled) {
      return THEME.colors.cardDisabled;
    }
    if (this.selectedItem?.id === item.id) {
      return THEME.colors.cardSelected;
    }
    if (item.highlighted) {
      return THEME.colors.cardPrioritized;
    }
    return THEME.colors.cardBackground;
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
      this.tooltip = new ItemTooltipManager(this.scene);
    }
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
    this.icon?.setAlpha(this.enabled ? 1 : 0.6);
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
    this.background.setStrokeStyle?.(
      this.tutorialHighlighted ? 3 : 2,
      color,
      1
    );
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
