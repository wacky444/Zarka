import Phaser from "phaser";
import {
  MAX_PICKUP_NONE_PRIORITY_ENTRIES,
  PICKUP_NONE_PRIORITY_ID
} from "@shared";
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
  private maxEntries: number | null = null;
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
      desktopMinCellWidth: 170,
      cellHeight: 128,
      autoSelectFirst: false,
      mobileCellContent: "image",
    });
    this.grid.setPosition(0, this.label.height + 6);
    this.grid.on("change", this.handleSelection);
    this.grid.on("modal-open", this.handleModalOpen);
    this.grid.on("modal-close", this.handleModalClose);

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

  setLabel(label: string): void {
    if (this.disposed) {
      return;
    }
    this.label.setText(label);
    this.refreshSize();
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
    const optionsUnchanged = this.sameOptions(this.options, normalized);
    this.options = normalized;
    const filtered = this.filterIds(this.priority);
    const priorityChanged = !this.sameArray(filtered, this.priority);
    if (optionsUnchanged && !priorityChanged) {
      return;
    }
    this.priority = filtered;
    this.syncing = true;
    this.grid.setValue(null, false);
    this.syncing = false;
    this.updateListDisplay(false);
    this.updateState();
  }

  setMaxEntries(maxEntries: number | undefined): void {
    if (this.disposed) {
      return;
    }
    const normalized =
      typeof maxEntries === "number" && Number.isFinite(maxEntries)
        ? Math.max(0, Math.floor(maxEntries))
        : null;
    if (normalized === this.maxEntries) {
      return;
    }
    this.maxEntries = normalized;
    const filtered = this.filterIds(this.priority);
    const priorityChanged = !this.sameArray(filtered, this.priority);
    this.priority = filtered;
    if (priorityChanged) {
      this.updateListDisplay(false);
    } else {
      this.grid.setItems(this.buildGridItems());
    }
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
    this.clearEntries();
    this.emptyLabel.destroy();
    this.label.destroy();
    this.listContainer.destroy();
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
    if (option.id === PICKUP_NONE_PRIORITY_ID) {
      const noneCount = this.priority.filter(
        (id) => id === PICKUP_NONE_PRIORITY_ID
      ).length;
      if (noneCount < MAX_PICKUP_NONE_PRIORITY_ENTRIES) {
        this.priority = [...this.priority, option.id];
        this.updateListDisplay(true);
      }
      this.syncing = true;
      this.grid.setValue(null, false);
      this.syncing = false;
      return;
    }
    if (this.priority.indexOf(option.id) !== -1) {
      this.priority = this.priority.filter((id) => id !== option.id);
      this.syncing = true;
      this.grid.setValue(null, false);
      this.syncing = false;
      this.updateListDisplay(true);
      return;
    }
    if (
      this.maxEntries !== null &&
      this.countPrioritizedItems() >= this.maxEntries
    ) {
      this.syncing = true;
      this.grid.setValue(null, false);
      this.syncing = false;
      return;
    }
    const stopIndex = this.priority.indexOf(PICKUP_NONE_PRIORITY_ID);
    const insertionIndex = stopIndex === -1 ? this.priority.length : stopIndex;
    this.priority = [
      ...this.priority.slice(0, insertionIndex),
      option.id,
      ...this.priority.slice(insertionIndex),
    ];
    this.updateListDisplay(true);
    this.syncing = true;
    this.grid.setValue(null, false);
    this.syncing = false;
  };

  private buildGridItems(): GridSelectItem[] {
    const prioritizedItemCount = this.countPrioritizedItems();
    return this.options.map((option) => ({
      id: option.id,
      name: option.label,
      description: option.description,
      texture: option.texture ?? "hex",
      frame: option.frame,
      iconScale: option.iconScale,
      highlighted: this.priority.includes(option.id),
      disabled:
        option.disabled === true ||
        (option.id === PICKUP_NONE_PRIORITY_ID &&
          this.priority.filter((id) => id === PICKUP_NONE_PRIORITY_ID).length >=
            MAX_PICKUP_NONE_PRIORITY_ENTRIES) ||
        (this.maxEntries !== null &&
          option.id !== PICKUP_NONE_PRIORITY_ID &&
          !this.priority.includes(option.id) &&
          prioritizedItemCount >= this.maxEntries),
    }));
  }

  private filterIds(ids: string[]): string[] {
    const seen = new Set<string>();
    const filtered: string[] = [];
    let noneCount = 0;
    let itemCount = 0;
    for (const id of ids) {
      if (typeof id !== "string") {
        continue;
      }
      const trimmed = id.trim();
      if (!trimmed) {
        continue;
      }
      if (trimmed === PICKUP_NONE_PRIORITY_ID) {
        if (noneCount >= MAX_PICKUP_NONE_PRIORITY_ENTRIES) {
          continue;
        }
        noneCount += 1;
      } else {
        if (seen.has(trimmed)) {
          continue;
        }
        if (this.maxEntries !== null && itemCount >= this.maxEntries) {
          continue;
        }
      }
      const option = this.options.find(
        (entry) => entry.id === trimmed && entry.disabled !== true
      );
      if (!option) {
        if (trimmed === PICKUP_NONE_PRIORITY_ID) {
          noneCount -= 1;
        }
        continue;
      }
      if (trimmed !== PICKUP_NONE_PRIORITY_ID) {
        itemCount += 1;
      }
      seen.add(trimmed);
      filtered.push(trimmed);
    }
    return filtered;
  }

  private countPrioritizedItems(): number {
    return this.priority.filter((id) => id !== PICKUP_NONE_PRIORITY_ID).length;
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

  private sameOptions(
    a: ItemPriorityOption[],
    b: ItemPriorityOption[]
  ): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      const optA = a[i];
      const optB = b[i];
      if (
        optA.id !== optB.id ||
        optA.label !== optB.label ||
        optA.disabled !== optB.disabled ||
        optA.texture !== optB.texture ||
        optA.frame !== optB.frame ||
        optA.iconScale !== optB.iconScale
      ) {
        return false;
      }
    }
    return true;
  }

  private updateListDisplay(emit: boolean): void {
    this.clearEntries();
    this.grid.setItems(this.buildGridItems());
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
