import Phaser from "phaser";
import {
  isManipulateRecipeId,
  type ManipulateOperationSelection
} from "@shared";
import { GridSelect } from "./GridSelect";
import { t } from "../services/i18n";
import {
  applyProjectedManipulateOperation,
  buildManipulateOperationItems,
  type InventoryProjection
} from "./manipulateSelectorItems";

export {
  applyProjectedManipulateOperation,
  buildManipulateOperationItems,
  type InventoryProjection
} from "./manipulateSelectorItems";

const MAX_OPERATIONS = 4;
const ROW_HEIGHT = 92;

function parseSelection(value: string | null): ManipulateOperationSelection | null {
  if (!value) {
    return null;
  }
  const separator = value.indexOf(":");
  if (separator < 0) {
    return null;
  }
  const mode = value.slice(0, separator);
  const recipeId = value.slice(separator + 1);
  if (
    (mode !== "combine" && mode !== "separate") ||
    !isManipulateRecipeId(recipeId)
  ) {
    return null;
  }
  return { mode, recipeId };
}

export class ManipulateSelector extends Phaser.GameObjects.Container {
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly selectors: GridSelect[] = [];
  private inventory: InventoryProjection = {};
  private operations: Array<ManipulateOperationSelection | null> = Array(
    MAX_OPERATIONS
  ).fill(null);
  private operationCount = 1;
  private preferredWidth: number;
  private selectorEnabled = true;

  constructor(scene: Phaser.Scene, width: number) {
    super(scene, 0, 0);
    this.preferredWidth = width;
    scene.add.existing(this);
    for (let index = 0; index < MAX_OPERATIONS; index += 1) {
      const label = scene.add
        .text(0, index * ROW_HEIGHT, t(`Operation ${index + 1}`), {
          fontSize: "14px",
          color: "#ffffff"
        })
        .setOrigin(0, 0);
      const selector = new GridSelect(scene, 0, 0, {
        width,
        title: `Choose operation ${index + 1}`,
        subtitle: "Choose Combine or Separate recipe",
        placeholder: "Choose operation",
        columns: 2,
        desktopMinCellWidth: 180,
        cellHeight: 210,
        autoSelectFirst: false,
        mobileCellIcons: true
      });
      selector.setPosition(0, index * ROW_HEIGHT + 22);
      selector.on("change", (id: string | null) => {
        this.operations[index] = parseSelection(id);
        this.refreshOptions();
        this.emit("change", this.getOperations());
      });
      selector.on("modal-open", () => this.emit("modal-open"));
      selector.on("modal-close", () => this.emit("modal-close"));
      this.labels.push(label);
      this.selectors.push(selector);
      this.add([label, selector]);
    }
    this.setVisible(false);
    this.setOperationCount(1);
    this.refreshOptions();
  }

  setInventory(inventory: InventoryProjection): void {
    this.inventory = { ...inventory };
    this.refreshOptions();
  }

  setOperations(operations: readonly ManipulateOperationSelection[]): void {
    this.operations = Array(MAX_OPERATIONS).fill(null);
    for (let index = 0; index < Math.min(MAX_OPERATIONS, operations.length); index += 1) {
      this.operations[index] = operations[index] ?? null;
    }
    this.setOperationCount(Math.max(1, Math.min(MAX_OPERATIONS, operations.length)));
    this.refreshOptions();
  }

  setOperationCount(count: number): void {
    const nextCount = Math.max(1, Math.min(MAX_OPERATIONS, Math.floor(count)));
    if (nextCount < this.operationCount) {
      for (let index = nextCount; index < MAX_OPERATIONS; index += 1) {
        this.operations[index] = null;
        this.selectors[index]?.setValue(null, false);
      }
    }
    this.operationCount = nextCount;
    this.labels.forEach((label, index) => label.setVisible(index < nextCount));
    this.selectors.forEach((selector, index) => {
      selector.setVisible(this.visible && index < nextCount);
      selector.setActive(this.active && index < nextCount);
      selector.setEnabled(this.selectorEnabled && index < nextCount);
    });
    this.setSize(this.preferredWidth, ROW_HEIGHT * nextCount);
    this.refreshOptions();
  }

  setSelectorWidth(width: number): void {
    this.preferredWidth = width;
    this.selectors.forEach((selector) => selector.setDisplayWidth(width));
    this.setSize(width, ROW_HEIGHT * this.operationCount);
  }

  setSelectorEnabled(enabled: boolean): void {
    this.selectorEnabled = enabled;
    this.selectors.forEach((selector, index) =>
      selector.setEnabled(enabled && index < this.operationCount)
    );
  }

  closeModals(): void {
    this.selectors.forEach((selector) => selector.hideModal());
  }

  getOperations(): ManipulateOperationSelection[] | null {
    const selected = this.operations.slice(0, this.operationCount);
    if (selected.some((operation) => operation === null)) {
      return null;
    }
    return selected as ManipulateOperationSelection[];
  }

  openFirstEmptyOperation(): void {
    const index = this.operations
      .slice(0, this.operationCount)
      .findIndex((operation) => operation === null);
    this.selectors[index < 0 ? 0 : index]?.showModal();
  }

  override setVisible(visible: boolean): this {
    super.setVisible(visible);
    this.selectors.forEach((selector, index) =>
      selector.setVisible(visible && index < this.operationCount)
    );
    return this;
  }

  override setActive(active: boolean): this {
    super.setActive(active);
    this.selectors.forEach((selector, index) =>
      selector.setActive(active && index < this.operationCount)
    );
    return this;
  }

  destroy(fromScene?: boolean): void {
    this.selectors.forEach((selector) => selector.destroy(fromScene));
    this.labels.forEach((label) => label.destroy(fromScene));
    this.labels.length = 0;
    this.selectors.length = 0;
    this.removeAllListeners();
    super.destroy(fromScene);
  }

  private refreshOptions(): void {
    let projected = { ...this.inventory };
    for (let index = 0; index < MAX_OPERATIONS; index += 1) {
      const selector = this.selectors[index];
      if (!selector) {
        continue;
      }
      const selected = this.operations[index];
      selector.setItems(buildManipulateOperationItems(projected));
      selector.setValue(
        selected ? `${selected.mode}:${selected.recipeId}` : null,
        false
      );
      if (index < this.operationCount && selected) {
        const next = applyProjectedManipulateOperation(
          projected,
          selected
        );
        if (next) {
          projected = next;
        }
      }
    }
  }
}
