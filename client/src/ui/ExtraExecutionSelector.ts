import Phaser from "phaser";
import { makeButton, type UIButton } from "./button";
import { ENERGY_ACCENT_COLOR } from "./ColorPalette";

const ENERGY_HEX = "#" + ENERGY_ACCENT_COLOR.toString(16).padStart(6, "0");

export class ExtraExecutionSelector extends Phaser.GameObjects.Container {
  private readonly label: Phaser.GameObjects.Text;
  private readonly descriptionText: Phaser.GameObjects.Text;
  private readonly totalCostBar: Phaser.GameObjects.Rectangle;
  private readonly totalCostFill: Phaser.GameObjects.Rectangle;
  private readonly totalCostText: Phaser.GameObjects.Text;
  private readonly decButton: UIButton;
  private readonly incButton: UIButton;
  private readonly countText: Phaser.GameObjects.Text;

  private baseCost = 0;
  private extraCostPerRep = 0;
  private maxReps = 0;
  private currentReps = 0;
  private maxTotalCost = 0;
  private currentEnergy = 0;
  private enabled = false;
  private preferredWidth: number;
  private disposed = false;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number) {
    super(scene, x, y);
    this.preferredWidth = width;
    scene.add.existing(this);

    this.label = scene.add
      .text(0, 0, "Extra power", {
        fontSize: "16px",
        color: "#ffffff"
      })
      .setOrigin(0, 0);

    this.descriptionText = scene.add
      .text(0, this.label.height + 6, "", {
        fontSize: "13px",
        color: "#a0b7ff",
        wordWrap: { width: width - 32, useAdvancedWrap: true }
      })
      .setOrigin(0, 0);

    this.decButton = makeButton(scene, 0, 0, "-", () => {
      this.step(-1);
    });

    this.countText = scene.add
      .text(0, 0, "0", {
        fontSize: "18px",
        color: "#ffffff",
        fixedWidth: 24,
        align: "center"
      })
      .setOrigin(0, 0);

    this.incButton = makeButton(scene, 0, 0, "+", () => {
      this.step(1);
    });

    const barTrackHeight = 10;
    this.totalCostBar = scene.add
      .rectangle(0, 0, width - 32, barTrackHeight, 0x25304c)
      .setOrigin(0, 0);

    this.totalCostFill = scene.add
      .rectangle(0, 0, 0, barTrackHeight, ENERGY_ACCENT_COLOR)
      .setOrigin(0, 0);

    this.totalCostText = scene.add
      .text(0, 0, "Cost: 0", {
        fontSize: "14px",
        color: ENERGY_HEX
      })
      .setOrigin(0, 0);

    this.add(this.label);
    this.add(this.descriptionText);
    this.add(this.decButton);
    this.add(this.countText);
    this.add(this.incButton);
    this.add(this.totalCostBar);
    this.add(this.totalCostFill);
    this.add(this.totalCostText);

    this.applyEnabled();
    this.layoutChildren();
  }

  configure(opts: {
    baseCost: number;
    extraCostPerRep: number;
    maxReps: number;
    description: string;
    energy: number;
  }): void {
    if (this.disposed) {
      return;
    }
    this.currentEnergy = opts.energy;
    this.baseCost = opts.baseCost;
    this.extraCostPerRep = opts.extraCostPerRep;
    this.maxReps = Math.max(0, opts.maxReps);
    this.maxTotalCost = this.baseCost + this.maxReps * this.extraCostPerRep;
    this.currentReps = 0;
    this.descriptionText.setText(opts.description);
    this.descriptionText.setWordWrapWidth(this.preferredWidth - 32, true);
    this.updateCostDisplay();
    this.applyEnabled();
    this.layoutChildren();
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed) {
      return;
    }
    this.enabled = enabled;
    this.applyEnabled();
  }

  getValue(): number {
    return this.currentReps;
  }

  setValue(reps: number): void {
    if (this.disposed) {
      return;
    }
    const maxAllowed = this.currentEnergy <= 0 ? 0 : this.maxReps;
    const clamped = Math.max(0, Math.min(maxAllowed, reps));
    if (this.currentReps === clamped) {
      return;
    }
    this.currentReps = clamped;
    this.updateCostDisplay();
    this.applyEnabled();
  }

  setSelectorWidth(width: number): void {
    if (this.disposed) {
      return;
    }
    this.preferredWidth = width;
    this.descriptionText.setWordWrapWidth(width - 32, true);
    this.totalCostBar.setSize(width - 32, this.totalCostBar.height);
    this.layoutChildren();
  }

  private step(delta: number): void {
    if (!this.enabled || this.disposed) {
      return;
    }
    const maxAllowed = this.currentEnergy <= 0 ? 0 : this.maxReps;
    const next = Math.max(0, Math.min(maxAllowed, this.currentReps + delta));
    if (next === this.currentReps) {
      return;
    }
    this.currentReps = next;
    this.updateCostDisplay();
    this.applyEnabled();
    this.emit("change", this.currentReps);
  }

  private updateCostDisplay(): void {
    const total = this.baseCost + this.currentReps * this.extraCostPerRep;
    this.countText.setText(`${this.currentReps}`);
    this.totalCostText.setText(`Energy: ${total} / ${this.maxTotalCost}`);

    const barWidth = this.totalCostBar.width;
    const ratio =
      this.maxTotalCost > 0 ? Math.min(1, total / this.maxTotalCost) : 0;
    this.totalCostFill.setSize(
      Math.max(0, barWidth * ratio),
      this.totalCostBar.height
    );
  }

  private applyEnabled(): void {
    if (this.disposed) {
      return;
    }
    const maxAllowed = this.currentEnergy <= 0 ? 0 : this.maxReps;
    const canDec = this.enabled && this.currentReps > 0;
    const canInc = this.enabled && this.currentReps < maxAllowed;

    if (canDec) {
      this.decButton.setAlpha(1);
      this.decButton.setInteractive({ useHandCursor: true });
    } else {
      this.decButton.setAlpha(0.4);
      this.decButton.disableInteractive();
    }

    if (canInc) {
      this.incButton.setAlpha(1);
      this.incButton.setInteractive({ useHandCursor: true });
    } else {
      this.incButton.setAlpha(0.4);
      this.incButton.disableInteractive();
    }
  }

  private layoutChildren(): void {
    if (this.disposed) {
      return;
    }
    this.label.setPosition(0, 0);
    const descY = this.label.height + 6;
    this.descriptionText.setPosition(0, descY);

    const stepperY = descY + this.descriptionText.height + 10;
    this.decButton.setPosition(0, stepperY);
    const countX = this.decButton.width + 8;
    this.countText.setPosition(countX, stepperY + 2);
    this.incButton.setPosition(countX + this.countText.width + 8, stepperY);

    const barY = stepperY + this.decButton.height + 10;
    const barW = Math.max(1, this.preferredWidth - 32);
    this.totalCostBar.setPosition(0, barY);
    this.totalCostBar.setSize(barW, this.totalCostBar.height);
    this.totalCostFill.setPosition(0, barY);

    this.totalCostText.setPosition(0, barY + this.totalCostBar.height + 6);

    const height =
      barY + this.totalCostBar.height + this.totalCostText.height + 6;
    this.setSize(this.preferredWidth, height);
  }

  override destroy(fromScene?: boolean): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.decButton.removeAllListeners?.();
    this.incButton.removeAllListeners?.();
    super.destroy(fromScene);
  }
}
