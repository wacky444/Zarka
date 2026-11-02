import Phaser from "phaser";
import { GridSelect, type GridSelectItem } from "./GridSelect";

export type PlayerOption = {
  id: string;
  label: string;
  labelColor?: string;
  name?: string;
  description?: string;
  warning?: string;
  texture?: string;
  frame?: string;
  iconScale?: number;
  disabled?: boolean;
  highlighted?: boolean;
};

const SELECT_LABEL = "[ Select player ]";
const SELECT_PENDING_LABEL = "[ Selecting... ]";
const CLEAR_OPTION_LABEL = "No target";
const CLEAR_OPTION_DESCRIPTION = "Removes the current priority target.";
const NO_OPTIONS_PLACEHOLDER = "No available players";

export interface PlayerSelectorOptions {
  confirmSelection?: boolean;
  confirmLabel?: string;
  label?: string;
  placeholder?: string;
  includeEmptyOption?: boolean;
  emptyOptionLabel?: string;
  emptyOptionDescription?: string;
  title?: string;
  subtitle?: string;
  emitAllSentinel?: boolean;
}

export class PlayerSelector extends Phaser.GameObjects.Container {
  private readonly label: Phaser.GameObjects.Text;
  private readonly grid: GridSelect;
  private readonly optionsConfig?: PlayerSelectorOptions;
  private options: PlayerOption[] = [];
  private current: string | null = null;
  private enabled = true;
  private pending = false;
  private disposed = false;
  private preferredWidth: number;
  private syncing = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    options?: PlayerSelectorOptions
  ) {
    super(scene, x, y);
    this.preferredWidth = width;
    this.optionsConfig = options;
    scene.add.existing(this);

    const labelText =
      options?.label !== undefined ? options.label : "Target Player";
    this.label = scene.add
      .text(0, 0, labelText, {
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0, 0);

    const showLabel = labelText.length > 0;
    this.label.setVisible(showLabel);

    const emptyLabel = options?.emptyOptionLabel ?? CLEAR_OPTION_LABEL;
    const emptyDesc =
      options?.emptyOptionDescription ?? CLEAR_OPTION_DESCRIPTION;
    const includeEmpty = options?.includeEmptyOption !== false;

    this.grid = new GridSelect(scene, 0, 0, {
      width,
      title: options?.title ?? "Select Target Player",
      subtitle: options?.subtitle ?? "Tap a player to target them",
      placeholder: options?.placeholder ?? SELECT_LABEL,
      includeEmptyOption: includeEmpty,
      emptyOptionLabel: emptyLabel,
      emptyOptionDescription: emptyDesc,
      columns: 3,
      desktopMinCellWidth: 160,
      cellHeight: 120,
      autoSelectFirst: false,
      mobileCellContent: "image",
      confirmSelection: options?.confirmSelection,
      confirmLabel: options?.confirmLabel
    });
    const gridY = showLabel ? this.label.height + 6 : 0;
    this.grid.setPosition(0, gridY);
    this.grid.on("change", this.handleSelection);
    this.grid.on("modal-open", this.handleModalOpen);
    this.grid.on("modal-close", this.handleModalClose);

    this.add(this.label);
    this.add(this.grid);

    this.refreshSize();
    this.updateState();
  }

  setLabel(label: string): void {
    this.label.setText(label);
    const showLabel = label.length > 0;
    this.label.setVisible(showLabel);
    const gridY = showLabel ? this.label.height + 6 : 0;
    this.grid.setPosition(0, gridY);
    this.refreshSize();
  }

  setTutorialHighlight(highlighted: boolean): void {
    this.grid.setTutorialHighlight(highlighted);
  }

  isTutorialHighlighted(): boolean {
    return this.grid.isTutorialHighlighted();
  }

  getTutorialHighlightedTarget(): Phaser.GameObjects.GameObject | null {
    return this.grid.getTutorialHighlightedTarget();
  }

  setOptions(options: PlayerOption[]): void {
    if (this.disposed) {
      return;
    }
    const normalized = options.map((option) => ({ ...option }));
    this.options = normalized;
    if (
      this.current &&
      !this.options.some(
        (option) => option.id === this.current && option.disabled !== true
      )
    ) {
      this.current = null;
    }
    this.grid.setItems(this.buildGridItems());
    if (this.current) {
      this.syncing = true;
      this.grid.setValue(this.current, false);
      this.syncing = false;
    } else {
      this.syncing = true;
      this.grid.setValue(null, false);
      this.syncing = false;
    }
    this.grid.hideModal();
    this.updateState();
  }

  setValue(value: string | null, emit = false): void {
    if (this.disposed) {
      return;
    }
    if (
      value &&
      !this.options.some(
        (option) => option.id === value && option.disabled !== true
      )
    ) {
      return;
    }
    this.current = value ?? null;
    this.syncing = true;
    this.grid.setValue(this.current, emit);
    this.syncing = false;
    if (!emit) {
      this.updateState();
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed) {
      return;
    }
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    this.updateState();
  }

  setPending(active: boolean): void {
    if (this.disposed) {
      return;
    }
    if (this.pending === active) {
      return;
    }
    this.pending = active;
    this.updateState();
  }

  setSelectorWidth(width: number): void {
    if (this.disposed) {
      return;
    }
    this.preferredWidth = width;
    this.label.setWordWrapWidth(width, true);
    this.grid.setDisplayWidth(width);
    const gridY =
      this.label.visible && this.label.text.length > 0
        ? this.label.height + 6
        : 0;
    this.grid.setPosition(0, gridY);
    this.refreshSize();
  }

  showDropdown(): void {
    if (this.disposed) {
      return;
    }
    this.grid.showModal();
  }

  hideDropdown(): void {
    if (this.disposed) {
      return;
    }
    this.grid.hideModal();
  }

  isModalOpen(): boolean {
    return this.grid.isModalOpen();
  }

  override destroy(fromScene?: boolean): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.grid.off("change", this.handleSelection);
    this.grid.off("modal-open", this.handleModalOpen);
    this.grid.off("modal-close", this.handleModalClose);
    this.grid.destroy();
    this.label.destroy();
    super.destroy(fromScene);
  }

  private readonly handleModalOpen = () => {
    if (this.disposed) {
      return;
    }
    this.emit("modal-open");
  };

  private readonly handleModalClose = () => {
    if (this.disposed) {
      return;
    }
    this.emit("modal-close");
  };

  private readonly handleSelection = (value: string | null) => {
    if (this.disposed) {
      return;
    }
    if (this.syncing) {
      return;
    }
    this.current = value ?? null;
    const emitted =
      this.current === null && this.optionsConfig?.emitAllSentinel
        ? "all"
        : this.current;
    this.emit("change", emitted);
    this.updateState();
  };

  private buildGridItems(): GridSelectItem[] {
    return this.options.map((option) => ({
      id: option.id,
      name: option.label,
      labelColor: option.labelColor,
      description: option.description,
      missingRequirement: option.warning,
      texture: option.texture ?? "char",
      frame: option.frame,
      iconScale: option.iconScale,
      disabled: option.disabled,
      highlighted: option.highlighted,
    }));
  }

  private refreshSize(): void {
    const height = this.grid.y + this.grid.height;
    this.setSize(this.preferredWidth, height);
  }

  private updateState(): void {
    const hasSelectable = this.options.some(
      (option) => option.disabled !== true
    );
    const defaultPlaceholder =
      this.optionsConfig?.placeholder ?? SELECT_LABEL;
    const placeholder = this.pending
      ? SELECT_PENDING_LABEL
      : hasSelectable
      ? defaultPlaceholder
      : NO_OPTIONS_PLACEHOLDER;
    this.grid.setPlaceholder(placeholder);
    const canInteract = this.enabled && !this.pending && hasSelectable;
    this.grid.setEnabled(canInteract);
    if (!hasSelectable) {
      this.current = null;
      this.syncing = true;
      this.grid.setValue(null, false);
      this.syncing = false;
    }
    this.refreshSize();
  }
}
