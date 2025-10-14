import Phaser from "phaser";
import type { Axial } from "@shared";
import { makeButton, type UIButton } from "./button";

const SELECT_LABEL = "[ Select target ]";
const SELECT_PENDING_LABEL = "[ Selecting... ]";
const CLEAR_LABEL = "[ Clear ]";

export class LocationSelector extends Phaser.GameObjects.Container {
  private readonly label: Phaser.GameObjects.Text;
  private readonly valueText: Phaser.GameObjects.Text;
  private readonly selectButton: UIButton;
  private readonly clearButton: UIButton;
  private current: Axial | null = null;
  private enabled = true;
  private pending = false;
  private preferredWidth: number;
  private disposed = false;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number) {
    super(scene, x, y);
    this.preferredWidth = width;
    scene.add.existing(this);

    this.label = scene.add
      .text(0, 0, "Target Location", {
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0, 0);

    this.valueText = scene.add
      .text(0, this.label.height + 6, "None selected", {
        fontSize: "14px",
        color: "#cbd5f5",
      })
      .setOrigin(0, 0);
    this.valueText.setWordWrapWidth(width, true);

    this.selectButton = makeButton(scene, 0, 0, "Select target", () => {
      if (!this.enabled || this.pending) {
        return;
      }
      this.emit("pick-request");
    });

    this.clearButton = makeButton(scene, 0, 0, "Clear", () => {
      if (!this.current || this.pending) {
        return;
      }
      this.emit("clear-request");
    });

    this.add(this.label);
    this.add(this.valueText);
    this.add(this.selectButton);
    this.add(this.clearButton);

    this.updateButtons();
  }

  setValue(value: Axial | null): void {
    if (this.disposed) {
      return;
    }
    const normalized = value ? { q: value.q, r: value.r } : null;
    if (this.isSameAxial(normalized, this.current)) {
      return;
    }
    this.current = normalized;
    if (!normalized) {
      this.valueText.setText("None selected");
    } else {
      this.valueText.setText(`(${normalized.q}, ${normalized.r})`);
    }
    this.updateButtons();
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed) {
      return;
    }
    this.enabled = enabled;
    this.updateButtons();
  }

  setPending(active: boolean): void {
    if (this.disposed) {
      return;
    }
    this.pending = active;
    this.updateButtons();
  }

  setSelectorWidth(width: number): void {
    if (this.disposed) {
      return;
    }
    this.preferredWidth = width;
    this.valueText.setWordWrapWidth(width, true);
    this.layoutChildren();
  }

  private updateButtons() {
    if (this.disposed) {
      return;
    }
    const selectEnabled = this.enabled && !this.pending;
    if (selectEnabled) {
      this.selectButton.setAlpha(1);
      this.selectButton.setText(SELECT_LABEL);
      this.selectButton.setInteractive({ useHandCursor: true });
    } else {
      this.selectButton.setAlpha(this.pending ? 0.8 : 0.5);
      this.selectButton.setText(
        this.pending ? SELECT_PENDING_LABEL : SELECT_LABEL
      );
      this.selectButton.disableInteractive();
    }

    const clearEnabled = !!this.current && !this.pending;
    if (clearEnabled) {
      this.clearButton.setAlpha(1);
      this.clearButton.setText(CLEAR_LABEL);
      this.clearButton.setInteractive({ useHandCursor: true });
    } else {
      this.clearButton.setAlpha(0.5);
      this.clearButton.setText(CLEAR_LABEL);
      this.clearButton.disableInteractive();
    }

    this.layoutChildren();
  }

  private layoutChildren() {
    if (this.disposed) {
      return;
    }
    this.label.setPosition(0, 0);
    this.valueText.setPosition(0, this.label.height + 6);
    const buttonY = this.valueText.y + this.valueText.height + 10;
    this.selectButton.setPosition(0, buttonY);
    const clearX = Math.min(
      this.selectButton.x + this.selectButton.width + 12,
      Math.max(this.preferredWidth - this.clearButton.width, 0)
    );
    this.clearButton.setPosition(clearX, buttonY);
    const height = buttonY + this.selectButton.height;
    this.setSize(this.preferredWidth, height);
  }

  private isSameAxial(a: Axial | null, b: Axial | null) {
    if (!a && !b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.q === b.q && a.r === b.r;
  }

  override destroy(fromScene?: boolean): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.selectButton.removeAllListeners?.();
    this.clearButton.removeAllListeners?.();
    super.destroy(fromScene);
  }
}
