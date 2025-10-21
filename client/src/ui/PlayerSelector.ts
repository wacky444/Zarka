import Phaser from "phaser";
import { makeButton, type UIButton } from "./button";

export type PlayerOption = {
  id: string;
  label: string;
};

const SELECT_LABEL = "[ Select player ]";
const SELECT_PENDING_LABEL = "[ Selecting... ]";
const CLEAR_LABEL = "[ Clear ]";

export class PlayerSelector extends Phaser.GameObjects.Container {
  private readonly label: Phaser.GameObjects.Text;
  private readonly valueText: Phaser.GameObjects.Text;
  private readonly selectButton: UIButton;
  private readonly clearButton: UIButton;
  private readonly optionsContainer: Phaser.GameObjects.Container;
  private readonly optionsBackground: Phaser.GameObjects.Rectangle;
  private optionsButtons: Phaser.GameObjects.Text[] = [];
  private options: PlayerOption[] = [];
  private current: string | null = null;
  private enabled = true;
  private pending = false;
  private dropdownOpen = false;
  private preferredWidth: number;
  private disposed = false;

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

    this.valueText = scene.add
      .text(0, this.label.height + 6, "None selected", {
        fontSize: "14px",
        color: "#cbd5f5",
      })
      .setOrigin(0, 0);
    this.valueText.setWordWrapWidth(width, true);

    this.selectButton = makeButton(scene, 0, 0, "Select player", () => {
      if (!this.enabled || this.pending) {
        return;
      }
      this.toggleDropdown(!this.dropdownOpen);
    });

    this.clearButton = makeButton(scene, 0, 0, "Clear", () => {
      if (!this.current || this.pending) {
        return;
      }
      this.setValue(null, true);
    });

    this.optionsBackground = scene.add
      .rectangle(0, 0, width, 10, 0x121735, 0.92)
      .setOrigin(0, 0)
      .setVisible(false)
      .setActive(false);

    this.optionsContainer = scene.add
      .container(0, 0)
      .setVisible(false)
      .setActive(false);
    this.optionsContainer.add(this.optionsBackground);

    this.add(this.label);
    this.add(this.valueText);
    this.add(this.selectButton);
    this.add(this.clearButton);
    this.add(this.optionsContainer);

    this.updateButtons();
    this.layoutChildren();
  }

  setOptions(options: PlayerOption[]): void {
    if (this.disposed) {
      return;
    }
    const normalized = options.map((option) => ({
      id: option.id,
      label: option.label,
    }));
    this.options = normalized;
    const stillValid = this.current
      ? normalized.some((option) => option.id === this.current)
      : true;
    if (!stillValid) {
      this.current = null;
      this.valueText.setText("None selected");
    }
    this.rebuildOptions();
    this.toggleDropdown(false);
    this.updateButtons();
  }

  setValue(value: string | null, emit = false): void {
    if (this.disposed) {
      return;
    }
    const normalized = value ?? null;
    if (
      normalized &&
      !this.options.some((option) => option.id === normalized)
    ) {
      return;
    }
    if (normalized === this.current) {
      return;
    }
    this.current = normalized;
    if (!normalized) {
      this.valueText.setText("None selected");
    } else {
      const option = this.options.find(
        (candidate) => candidate.id === normalized
      );
      this.valueText.setText(option ? option.label : normalized);
    }
    this.updateButtons();
    if (emit) {
      this.emit("change", this.current);
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed) {
      return;
    }
    this.enabled = enabled;
    if (!enabled && this.dropdownOpen) {
      this.toggleDropdown(false);
    }
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
    this.optionsBackground.setSize(width, this.optionsBackground.height);
    this.layoutChildren();
    this.repositionOptions();
  }

  hideDropdown(): void {
    if (this.dropdownOpen) {
      this.toggleDropdown(false);
    }
  }

  private rebuildOptions(): void {
    if (this.disposed) {
      return;
    }
    for (const button of this.optionsButtons) {
      button.removeAllListeners?.();
      if (button.parentContainer === this.optionsContainer) {
        this.optionsContainer.remove(button, true);
      } else {
        button.destroy();
      }
    }
    this.optionsButtons = [];
    const scene = this.scene;
    const buttons: Phaser.GameObjects.Text[] = [];
    const rowHeight = 26;
    let maxWidth = this.preferredWidth;
    if (this.optionsBackground.parentContainer !== this.optionsContainer) {
      this.optionsContainer.addAt(this.optionsBackground, 0);
    } else {
      this.optionsContainer.sendToBack(this.optionsBackground);
    }
    this.options.forEach((option, index) => {
      const txt = scene.add
        .text(0, index * rowHeight, option.label, {
          fontSize: "14px",
          color: "#ffffff",
          backgroundColor: "#1b2440",
          padding: { x: 6, y: 4 },
        })
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on("pointerover", () => txt.setStyle({ backgroundColor: "#28345d" }))
        .on("pointerout", () => txt.setStyle({ backgroundColor: "#1b2440" }))
        .on("pointerup", () => {
          if (!this.enabled || this.pending) {
            return;
          }
          this.setValue(option.id, true);
          this.toggleDropdown(false);
        });
      buttons.push(txt);
      const width = txt.width + 12;
      if (width > maxWidth) {
        maxWidth = width;
      }
    });
    this.optionsButtons = buttons;
    if (buttons.length > 0) {
      this.optionsContainer.add(buttons);
    }
    const backgroundWidth = Math.max(this.preferredWidth, maxWidth);
    const height = buttons.length > 0 ? buttons.length * rowHeight : rowHeight;
    this.optionsBackground.setSize(backgroundWidth, height);
    buttons.forEach((button, index) => {
      button.setFixedSize(backgroundWidth, rowHeight);
      button.setPosition(0, index * rowHeight);
    });
    this.repositionOptions();
  }

  private updateButtons(): void {
    if (this.disposed) {
      return;
    }
    const selectEnabled =
      this.enabled && !this.pending && this.options.length > 0;
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
  }

  private toggleDropdown(visible: boolean): void {
    if (this.disposed) {
      return;
    }
    if (visible && this.options.length === 0) {
      visible = false;
    }
    this.dropdownOpen = visible;
    this.optionsContainer.setVisible(visible);
    this.optionsContainer.setActive(visible);
    this.optionsBackground.setVisible(visible);
    this.optionsBackground.setActive(visible);
    this.optionsButtons.forEach((button) => {
      button.setVisible(visible);
      button.setActive(visible);
    });
  }

  private layoutChildren(): void {
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
    this.repositionOptions();
  }

  private repositionOptions(): void {
    if (this.disposed) {
      return;
    }
    const dropdownY = this.selectButton.y + this.selectButton.height + 6;
    this.optionsContainer.setPosition(0, dropdownY);
  }

  override destroy(fromScene?: boolean): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.selectButton.removeAllListeners?.();
    this.clearButton.removeAllListeners?.();
    this.optionsButtons.forEach((button) => button.removeAllListeners?.());
    this.optionsButtons.forEach((button) => button.destroy());
    this.optionsContainer.destroy();
    this.optionsBackground.destroy();
    super.destroy(fromScene);
  }
}
