import Phaser from "phaser";
import { GridSelect, type GridSelectItem } from "./GridSelect";

export type PlayerOption = {
  id: string;
  label: string;
  description?: string;
  texture?: string;
  frame?: string;
  iconScale?: number;
  disabled?: boolean;
};

const SELECT_LABEL = "[ Select player ]";
const SELECT_PENDING_LABEL = "[ Selecting... ]";
const CLEAR_OPTION_LABEL = "[ Clear target ]";
const CLEAR_OPTION_DESCRIPTION = "Removes the current target.";
const NO_OPTIONS_PLACEHOLDER = "No available players";

export class PlayerSelector extends Phaser.GameObjects.Container {
  private readonly label: Phaser.GameObjects.Text;
  private readonly grid: GridSelect;
  private options: PlayerOption[] = [];
  private current: string | null = null;
  private enabled = true;
  private pending = false;
  private disposed = false;
  private preferredWidth: number;
  private syncing = false;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number) {
    super(scene, x, y);
    this.preferredWidth = width;
    scene.add.existing(this);

    this.label = scene.add
      .text(0, 0, "Target Player", {
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0, 0);

    this.grid = new GridSelect(scene, 0, 0, {
      width,
      title: "Select Target Player",
      subtitle: "Tap a player to target them",
      placeholder: SELECT_LABEL,
      includeEmptyOption: true,
      emptyOptionLabel: CLEAR_OPTION_LABEL,
      emptyOptionDescription: CLEAR_OPTION_DESCRIPTION,
      columns: 3,
      cellHeight: 120,
      autoSelectFirst: false,
    });
    this.grid.setPosition(0, this.label.height + 6);
    this.grid.on("change", this.handleSelection);

    this.add(this.label);
    this.add(this.grid);

    this.refreshSize();
    this.updateState();
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
    this.grid.setPosition(0, this.label.height + 6);
    this.refreshSize();
  }

  hideDropdown(): void {
    if (this.disposed) {
      return;
    }
    this.grid.hideModal();
  }

  override destroy(fromScene?: boolean): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.grid.off("change", this.handleSelection);
    this.grid.destroy();
    this.label.destroy();
    super.destroy(fromScene);
  }

  private readonly handleSelection = (value: string | null) => {
    if (this.disposed) {
      return;
    }
    if (this.syncing) {
      return;
    }
    this.current = value ?? null;
    this.emit("change", this.current);
    this.updateState();
  };

  private buildGridItems(): GridSelectItem[] {
    return this.options.map((option) => ({
      id: option.id,
      name: option.label,
      description: option.description,
      texture: option.texture ?? "char",
      frame: option.frame,
      iconScale: option.iconScale,
      disabled: option.disabled,
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
    const placeholder = this.pending
      ? SELECT_PENDING_LABEL
      : hasSelectable
      ? SELECT_LABEL
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
