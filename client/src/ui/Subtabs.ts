import Phaser from "phaser";

export interface SubtabConfig<T extends string = string> {
  key: T;
  label: string;
}

export interface SubtabsOptions<T extends string = string> {
  scene: Phaser.Scene;
  parent?: Phaser.GameObjects.Container;
  x: number;
  y: number;
  width: number;
  height?: number;
  gap?: number;
  tabs: SubtabConfig<T>[];
  defaultKey?: T;
  onChange?: (key: T, previousKey: T) => void;
  activeFillColor?: number;
  activeFillAlpha?: number;
  activeStrokeColor?: number;
  activeStrokeAlpha?: number;
  activeTextColor?: string;
  inactiveFillColor?: number;
  inactiveFillAlpha?: number;
  inactiveStrokeColor?: number;
  inactiveStrokeAlpha?: number;
  inactiveTextColor?: string;
  fontSize?: string;
}

interface SubtabEntry<T extends string> {
  key: T;
  button: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

const DEFAULT_HEIGHT = 28;
const DEFAULT_GAP = 6;
const DEFAULT_ACTIVE_FILL = 0x253055;
const DEFAULT_ACTIVE_FILL_ALPHA = 0.95;
const DEFAULT_ACTIVE_STROKE = 0x4d74b8;
const DEFAULT_ACTIVE_STROKE_ALPHA = 0.8;
const DEFAULT_ACTIVE_TEXT_COLOR = "#ffffff";
const DEFAULT_INACTIVE_FILL = 0x141c33;
const DEFAULT_INACTIVE_FILL_ALPHA = 0.95;
const DEFAULT_INACTIVE_STROKE = 0x253055;
const DEFAULT_INACTIVE_STROKE_ALPHA = 0.8;
const DEFAULT_INACTIVE_TEXT_COLOR = "#8ea4d2";
const DEFAULT_FONT_SIZE = "14px";

export class Subtabs<T extends string = string> {
  private activeKey: T;
  private entries: SubtabEntry<T>[] = [];
  private readonly elements: Phaser.GameObjects.GameObject[] = [];
  private height: number;
  private gap: number;

  constructor(private readonly options: SubtabsOptions<T>) {
    this.activeKey = options.defaultKey ?? options.tabs[0]?.key;
    this.height = options.height ?? DEFAULT_HEIGHT;
    this.gap = options.gap ?? DEFAULT_GAP;
    this.createEntries();
    this.updateStyles();
  }

  getActiveKey(): T {
    return this.activeKey;
  }

  setActiveKey(key: T, emitChange = true): void {
    if (this.activeKey === key) {
      return;
    }
    const previous = this.activeKey;
    this.activeKey = key;
    this.updateStyles();
    if (emitChange) {
      this.options.onChange?.(key, previous);
    }
  }

  getElements(): Phaser.GameObjects.GameObject[] {
    return this.elements;
  }

  setVisible(visible: boolean): void {
    for (const element of this.elements) {
      const target = element as Phaser.GameObjects.GameObject & {
        setVisible?: (value: boolean) => void;
      };
      target.setVisible?.(visible);
    }
  }

  layout(x: number, y: number, width: number, height?: number): void {
    if (height !== undefined) {
      this.height = height;
    }
    const count = this.entries.length;
    if (count === 0) {
      return;
    }
    const totalGaps = (count - 1) * this.gap;
    const tabWidth = Math.max(20, (width - totalGaps) / count);

    this.entries.forEach((entry, index) => {
      const tabX = x + index * (tabWidth + this.gap);
      entry.button.setPosition(tabX, y);
      entry.button.setSize(tabWidth, this.height);
      entry.button.setDisplaySize(tabWidth, this.height);

      entry.label.setPosition(tabX + tabWidth / 2, y + this.height / 2);
    });
  }

  destroy(): void {
    for (const entry of this.entries) {
      entry.button.destroy();
      entry.label.destroy();
    }
    this.entries = [];
    this.elements.length = 0;
  }

  private createEntries(): void {
    const { scene, parent, tabs, x, y, width } = this.options;
    const count = tabs.length;
    const totalGaps = (count - 1) * this.gap;
    const tabWidth = Math.max(20, (width - totalGaps) / count);

    tabs.forEach((tab, index) => {
      const tabX = x + index * (tabWidth + this.gap);
      const button = scene.add
        .rectangle(tabX, y, tabWidth, this.height, DEFAULT_INACTIVE_FILL)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .setVisible(false);

      const label = scene.add
        .text(tabX + tabWidth / 2, y + this.height / 2, tab.label, {
          fontSize: this.options.fontSize ?? DEFAULT_FONT_SIZE,
          color: DEFAULT_INACTIVE_TEXT_COLOR
        })
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true })
        .setVisible(false);

      button.on(Phaser.Input.Events.POINTER_UP, () => {
        this.setActiveKey(tab.key);
      });
      label.on(Phaser.Input.Events.POINTER_UP, () => {
        this.setActiveKey(tab.key);
      });

      if (parent) {
        parent.add(button);
        parent.add(label);
      }

      this.entries.push({ key: tab.key, button, label });
      this.elements.push(button, label);
    });
  }

  private updateStyles(): void {
    const activeFill = this.options.activeFillColor ?? DEFAULT_ACTIVE_FILL;
    const activeFillAlpha =
      this.options.activeFillAlpha ?? DEFAULT_ACTIVE_FILL_ALPHA;
    const activeStroke =
      this.options.activeStrokeColor ?? DEFAULT_ACTIVE_STROKE;
    const activeStrokeAlpha =
      this.options.activeStrokeAlpha ?? DEFAULT_ACTIVE_STROKE_ALPHA;
    const activeTextColor =
      this.options.activeTextColor ?? DEFAULT_ACTIVE_TEXT_COLOR;

    const inactiveFill =
      this.options.inactiveFillColor ?? DEFAULT_INACTIVE_FILL;
    const inactiveFillAlpha =
      this.options.inactiveFillAlpha ?? DEFAULT_INACTIVE_FILL_ALPHA;
    const inactiveStroke =
      this.options.inactiveStrokeColor ?? DEFAULT_INACTIVE_STROKE;
    const inactiveStrokeAlpha =
      this.options.inactiveStrokeAlpha ?? DEFAULT_INACTIVE_STROKE_ALPHA;
    const inactiveTextColor =
      this.options.inactiveTextColor ?? DEFAULT_INACTIVE_TEXT_COLOR;

    for (const entry of this.entries) {
      const isActive = entry.key === this.activeKey;
      entry.button.setFillStyle(
        isActive ? activeFill : inactiveFill,
        isActive ? activeFillAlpha : inactiveFillAlpha
      );
      entry.button.setStrokeStyle(
        1,
        isActive ? activeStroke : inactiveStroke,
        isActive ? activeStrokeAlpha : inactiveStrokeAlpha
      );
      entry.label.setColor(isActive ? activeTextColor : inactiveTextColor);
      entry.label.setAlpha(isActive ? 1 : 0.7);
    }
  }
}
