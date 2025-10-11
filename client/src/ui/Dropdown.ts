import Phaser from "phaser";

type DropdownOption =
  | string
  | { value?: string; label?: string; text?: string };

type RexDropDownList = Phaser.GameObjects.GameObject & {
  setOptions?: (options: DropdownOption[]) => unknown;
  setValue?: (value: DropdownOption) => unknown;
  value?: unknown;
  layout?: () => unknown;
  setOrigin?: (x: number, y?: number) => unknown;
  setDepth?: (depth: number) => unknown;
  setMinWidth?: (width: number) => unknown;
  options?: unknown[];
};

interface DropdownConfig {
  width: number;
  height?: number;
  placeholder?: string;
  emptyLabel?: string;
  listMaxHeight?: number;
  depth?: number;
}

export class Dropdown extends Phaser.GameObjects.Container {
  private readonly dropdown: RexDropDownList;
  private readonly text: Phaser.GameObjects.Text;
  private readonly background: Phaser.GameObjects.GameObject;
  private options: DropdownOption[] = [];
  private selectedValue: string | null = null;
  private dropdownWidth: number;
  private dropdownHeight: number;
  private placeholder: string;
  private emptyLabel: string;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    config: DropdownConfig
  ) {
    super(scene, x, y);
    scene.add.existing(this);
    this.dropdownWidth = config.width;
    this.dropdownHeight = config.height ?? 32;
    this.placeholder = config.placeholder ?? "Select";
    this.emptyLabel = config.emptyLabel ?? "Unknown";
    this.setSize(this.dropdownWidth, this.dropdownHeight);
    this.setScrollFactor(0);
    const background = scene.rexUI.add.roundRectangle(
      0,
      0,
      this.dropdownWidth,
      this.dropdownHeight,
      6,
      0x101828
    );
    this.background = background;
    this.setScrollFactorZero(background);
    const text = scene.add
      .text(0, 0, this.placeholder, {
        fontSize: "15px",
        color: "#ffffff",
      })
      .setOrigin(0, 0);
    text.setScrollFactor(0);
    this.text = text;
    const dropDownList = scene.rexUI.add.dropDownList({
      x: 0,
      y: 0,
      origin: 0,
      width: this.dropdownWidth,
      height: this.dropdownHeight,
      background,
      text,
      space: { left: 8, right: 8, top: 6, bottom: 6 },
      list: {
        maxHeight: config.listMaxHeight ?? 200,
        createBackgroundCallback: (listScene: Phaser.Scene) =>
          listScene.rexUI.add.roundRectangle(
            0,
            0,
            this.dropdownWidth,
            this.dropdownHeight,
            6,
            0x1b2440
          ),
        createButtonCallback: (
          listScene: Phaser.Scene,
          option: DropdownOption
        ) =>
          listScene.rexUI.add.label({
            background: listScene.rexUI.add.roundRectangle(
              0,
              0,
              this.dropdownWidth,
              this.dropdownHeight - 4,
              4,
              0x1b2440
            ),
            text: listScene.add
              .text(0, 0, this.getOptionLabel(option), {
                fontSize: "15px",
                color: "#e2e8f0",
              })
              .setOrigin(0, 0),
            space: { left: 10, right: 10, top: 6, bottom: 6 },
          }),
      },
      setValueCallback: (_list: unknown, value: unknown) => {
        const resolved = this.resolveOptionValue(value);
        this.applySelection(resolved);
      },
    }) as RexDropDownList;
    dropDownList.setOrigin?.(0, 0);
    dropDownList.setDepth?.(config.depth ?? 20);
    this.setScrollFactorZero(dropDownList);
    this.add(dropDownList);
    this.dropdown = dropDownList;
    dropDownList.on(
      "button.click",
      (
        _dropdown: unknown,
        _list: unknown,
        _button: unknown,
        index: number | undefined
      ) => {
        if (typeof index !== "number") {
          return;
        }
        const option = this.options[index];
        const resolved = this.resolveOptionValue(option);
        if (resolved.length === 0) {
          return;
        }
        this.dropdown.setValue?.(resolved);
      }
    );
  }

  setOptions(options: DropdownOption[]) {
    this.options = options.slice();
    if (this.dropdown.setOptions) {
      this.dropdown.setOptions(this.options);
    } else {
      this.dropdown.options = this.options;
    }
    this.dropdown.layout?.();
    if (!this.selectedValue) {
      this.text.setText(this.placeholder);
    } else if (!this.hasOptionValue(this.selectedValue)) {
      this.applySelection("");
    }
    return this;
  }

  setValue(value: string) {
    if (this.dropdown.setValue) {
      this.dropdown.setValue(value);
    } else {
      this.dropdown.value = value;
      this.applySelection(value);
    }
    return this;
  }

  getValue() {
    return this.selectedValue;
  }

  setPlaceholder(placeholder: string) {
    this.placeholder = placeholder;
    if (!this.selectedValue) {
      this.text.setText(this.placeholder);
    }
    return this;
  }

  setDropdownWidth(width: number) {
    this.dropdownWidth = width;
    this.setSize(width, this.dropdownHeight);
    const resizable = this.background as {
      setSize?: (w: number, h: number) => unknown;
      setDisplaySize?: (w: number, h: number) => unknown;
    };
    resizable.setSize?.(width, this.dropdownHeight);
    resizable.setDisplaySize?.(width, this.dropdownHeight);
    this.dropdown.setMinWidth?.(width);
    this.dropdown.layout?.();
    return this;
  }

  private applySelection(value: string) {
    const targetOption = this.getOptionByValue(value);
    const label = targetOption ? this.getOptionLabel(targetOption) : value;
    const trimmedLabel = label.trim();
    const display = trimmedLabel.length > 0 ? trimmedLabel : this.emptyLabel;
    const trimmedValue = value.trim();
    this.selectedValue = trimmedValue.length > 0 ? trimmedValue : null;
    this.text.setText(this.selectedValue ? display : this.emptyLabel);
    this.emit("change", this.selectedValue);
  }

  private resolveOptionValue(option: unknown) {
    if (typeof option === "string") {
      return option;
    }
    if (option && typeof option === "object") {
      const candidate = option as {
        value?: unknown;
        text?: unknown;
        label?: unknown;
      };
      if (typeof candidate.value === "string") {
        return candidate.value;
      }
      if (typeof candidate.text === "string") {
        return candidate.text;
      }
      if (typeof candidate.label === "string") {
        return candidate.label;
      }
    }
    return "";
  }

  private getOptionLabel(option: DropdownOption) {
    if (typeof option === "string") {
      return option;
    }
    if (typeof option.label === "string" && option.label.trim().length > 0) {
      return option.label;
    }
    if (typeof option.text === "string" && option.text.trim().length > 0) {
      return option.text;
    }
    if (typeof option.value === "string") {
      return option.value;
    }
    return "";
  }

  private getOptionByValue(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return this.options.find(
      (option) => this.resolveOptionValue(option) === trimmed
    );
  }

  private hasOptionValue(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }
    return this.options.some(
      (option) => this.resolveOptionValue(option) === trimmed
    );
  }

  private setScrollFactorZero(go: Phaser.GameObjects.GameObject | null) {
    if (!go) {
      return;
    }
    const candidate = go as Phaser.GameObjects.GameObject & {
      setScrollFactor?: (
        x: number,
        y?: number
      ) => Phaser.GameObjects.GameObject;
    };
    candidate.setScrollFactor?.(0);
  }
}

export type { DropdownOption };
