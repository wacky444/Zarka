import Phaser from "phaser";
import { GridSelect, type GridSelectItem } from "./GridSelect";

export type ItemPriorityOption = {
  id: string;
  label: string;
  description?: string;
  texture?: string;
  frame?: string;
  iconScale?: number;
  disabled?: boolean;
};

const SELECT_LABEL = "[ Add priority item ]";
const SELECT_PENDING_LABEL = "[ Selecting... ]";
const CLEAR_OPTION_LABEL = "No priority";
const CLEAR_OPTION_DESCRIPTION = "Removes every prioritized item.";
const EMPTY_LIST_LABEL = "No prioritized items";

export class ItemPrioritySelector extends Phaser.GameObjects.Container {
  private readonly label: Phaser.GameObjects.Text;
  private readonly grid: GridSelect;
  private readonly listContainer: Phaser.GameObjects.Container;
  private readonly emptyLabel: Phaser.GameObjects.Text;
  private readonly entries: Phaser.GameObjects.Text[] = [];
  private options: ItemPriorityOption[] = [];
  private priority: string[] = [];
  private enabled = true;
  private pending = false;
  private disposed = false;
  private preferredWidth: number;
  private syncing = false;
  private listHeight = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number) {
    super(scene, x, y);
    this.preferredWidth = width;
    scene.add.existing(this);

    this.label = scene.add
      .text(0, 0, "Priority Items", {
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0, 0);

    this.grid = new GridSelect(scene, 0, 0, {
      width,
      title: "Choose Items",
      subtitle: "Tap an item to prioritize it",
      placeholder: SELECT_LABEL,
      includeEmptyOption: true,
      emptyOptionLabel: CLEAR_OPTION_LABEL,
      emptyOptionDescription: CLEAR_OPTION_DESCRIPTION,
      columns: 3,
      cellHeight: 128,
      autoSelectFirst: false,
    });
    this.grid.setPosition(0, this.label.height + 6);
    this.grid.on("change", this.handleSelection);

    this.listContainer = scene.add.container(0, 0);
    this.listContainer.setPosition(0, this.grid.y + this.grid.height + 8);

    this.emptyLabel = scene.add
      .text(0, 0, EMPTY_LIST_LABEL, {
        fontSize: "15px",
        color: "#a0b7ff",
      })
      .setOrigin(0, 0);
    this.listContainer.add(this.emptyLabel);

    this.add(this.label);
    this.add(this.grid);
    this.add(this.listContainer);

    this.refreshSize();
    this.updateState();
  }

  setOptions(options: ItemPriorityOption[]): void {
    if (this.disposed) {
      return;
    }
    const normalized = options.map((option) => ({
      ...option,
      texture: option.texture ?? "hex",
      frame: option.frame,
    }));
    this.options = normalized;
    const filtered = this.priority.filter((id) =>
      normalized.some((option) => option.id === id && option.disabled !== true)
    );
    if (filtered.length !== this.priority.length) {
      this.priority = filtered;
    }
    this.grid.setItems(this.buildGridItems());
    this.syncing = true;
    this.grid.setValue(null, false);
    this.syncing = false;
    this.updateListDisplay(false);
    this.updateState();
  }

  setValue(ids: string[], emit = false): void {
    if (this.disposed) {
      return;
    }
    const filtered = this.filterIds(ids);
    if (this.sameArray(filtered, this.priority)) {
      return;
    }
    this.priority = filtered;
    this.updateListDisplay(emit);
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
    this.listContainer.setPosition(0, this.grid.y + this.grid.height + 8);
    this.emptyLabel.setWordWrapWidth(width, true);
    this.updateListLayout();
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
    this.clearEntries();
    this.emptyLabel.destroy();
    this.label.destroy();
    this.listContainer.destroy();
    super.destroy(fromScene);
  }

  private handleSelection = (value: string | null) => {
    if (this.disposed || this.syncing) {
      return;
    }
    if (value === null) {
      if (this.priority.length > 0) {
        this.priority = [];
        this.updateListDisplay(true);
      }
      this.syncing = true;
      this.grid.setValue(null, false);
      this.syncing = false;
      return;
    }
    const option = this.options.find(
      (entry) => entry.id === value && entry.disabled !== true
    );
    if (!option) {
      this.syncing = true;
      this.grid.setValue(null, false);
      this.syncing = false;
      return;
    }
    if (this.priority.indexOf(option.id) !== -1) {
      this.syncing = true;
      this.grid.setValue(null, false);
      this.syncing = false;
      return;
    }
    this.priority = [...this.priority, option.id];
    this.updateListDisplay(true);
    this.syncing = true;
    this.grid.setValue(null, false);
    this.syncing = false;
  };

  private buildGridItems(): GridSelectItem[] {
    return this.options.map((option) => ({
      id: option.id,
      name: option.label,
      description: option.description,
      texture: option.texture ?? "hex",
      frame: option.frame,
      iconScale: option.iconScale,
      disabled: option.disabled,
    }));
  }

  private filterIds(ids: string[]): string[] {
    const seen = new Set<string>();
    const filtered: string[] = [];
    for (const id of ids) {
      if (typeof id !== "string") {
        continue;
      }
      const trimmed = id.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      const option = this.options.find(
        (entry) => entry.id === trimmed && entry.disabled !== true
      );
      if (!option) {
        continue;
      }
      seen.add(trimmed);
      filtered.push(trimmed);
    }
    return filtered;
  }

  private sameArray(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

  private updateListDisplay(emit: boolean): void {
    this.clearEntries();
    if (this.priority.length === 0) {
      this.emptyLabel.setVisible(true);
      this.listHeight = this.emptyLabel.height;
      this.refreshSize();
      if (emit) {
        this.emit("change", []);
      }
      return;
    }
    this.emptyLabel.setVisible(false);
    let cursorY = 0;
    for (let index = 0; index < this.priority.length; index += 1) {
      const id = this.priority[index];
      const option = this.options.find((entry) => entry.id === id);
      const name = option?.label ?? id;
      const text = this.scene.add
        .text(0, cursorY, `${index + 1}. ${name}`, {
          fontSize: "15px",
          color: "#e2e8f0",
        })
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: this.enabled });
      text.on(Phaser.Input.Events.POINTER_UP, () => {
        if (!this.enabled) {
          return;
        }
        this.priority.splice(index, 1);
        this.updateListDisplay(true);
      });
      this.entries.push(text);
      this.listContainer.add(text);
      cursorY += text.height + 6;
    }
    this.listHeight = cursorY;
    this.refreshSize();
    if (emit) {
      this.emit("change", [...this.priority]);
    }
  }

  private updateListLayout(): void {
    if (this.priority.length === 0) {
      this.emptyLabel.setPosition(0, 0);
      this.listHeight = this.emptyLabel.height;
      return;
    }
    let cursorY = 0;
    for (let i = 0; i < this.entries.length; i += 1) {
      const entry = this.entries[i];
      entry.setPosition(0, cursorY);
      cursorY += entry.height + 6;
    }
    this.listHeight = cursorY;
  }

  private clearEntries(): void {
    for (const entry of this.entries) {
      entry.removeAllListeners?.();
      entry.destroy();
    }
    this.entries.length = 0;
  }

  private refreshSize(): void {
    const height = this.listContainer.y + this.listHeight;
    this.setSize(this.preferredWidth, height);
  }

  private updateState(): void {
    const placeholder = this.pending ? SELECT_PENDING_LABEL : SELECT_LABEL;
    this.grid.setPlaceholder(placeholder);
    const canInteract = this.enabled && !this.pending;
    this.grid.setEnabled(canInteract);
    for (const entry of this.entries) {
      if (canInteract) {
        entry.setInteractive({ useHandCursor: true });
      } else {
        entry.disableInteractive();
      }
    }
    if (!canInteract) {
      this.grid.hideModal();
    }
  }
}
