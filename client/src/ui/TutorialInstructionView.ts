import Phaser from "phaser";
import { TUTORIAL_STEP_IDS, type TutorialStepId } from "@shared";
import { t } from "../services/i18n";
import { makeButton, type UIButton } from "./button";
import { TUTORIAL_INSTRUCTIONS } from "../tutorial/TutorialInstructions";

export class TutorialInstructionView {
  private readonly container: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly instructionText: Phaser.GameObjects.Text;
  private readonly hintText: Phaser.GameObjects.Text;
  private readonly hintButton: UIButton;
  private currentStep: TutorialStepId | null = null;
  private hintVisible = false;
  private width = 0;
  private height = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0).setDepth(1200).setScrollFactor(0);
    this.background = scene.add
      .rectangle(0, 0, 400, 124, 0x111827, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xfbbf24, 1)
      .setInteractive({ useHandCursor: false });
    this.titleText = scene.add
      .text(14, 10, "", {
        fontSize: "15px",
        fontStyle: "bold",
        color: "#fbbf24"
      })
      .setOrigin(0, 0);
    this.instructionText = scene.add
      .text(14, 36, "", {
        fontSize: "16px",
        color: "#ffffff",
        lineSpacing: 3,
        wordWrap: { width: 372, useAdvancedWrap: true }
      })
      .setOrigin(0, 0);
    this.hintText = scene.add
      .text(14, 122, "", {
        fontSize: "13px",
        color: "#cbd5f5",
        lineSpacing: 2,
        wordWrap: { width: 240, useAdvancedWrap: true }
      })
      .setOrigin(0, 0)
      .setVisible(false);
    this.hintButton = makeButton(
      scene,
      0,
      0,
      "[ Hint ]",
      () => this.toggleHint(),
      []
    );
    this.container.add([
      this.background,
      this.titleText,
      this.instructionText,
      this.hintText,
      this.hintButton
    ]);
    this.container.setVisible(false);
  }

  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  setStep(stepId: TutorialStepId | null): void {
    if (this.currentStep === stepId) {
      return;
    }
    this.currentStep = stepId;
    this.hintVisible = false;
    if (!stepId) {
      this.container.setVisible(false);
      return;
    }

    const index = TUTORIAL_STEP_IDS.indexOf(stepId) + 1;
    const copy = TUTORIAL_INSTRUCTIONS[stepId];
    this.titleText.setText(
      `${t("Tutorial")} · ${t("Step")} ${index}/${TUTORIAL_STEP_IDS.length}`
    );
    this.instructionText.setText(t(copy.instruction));
    this.hintText.setText(t(copy.hint));
    this.hintText.setVisible(false);
    this.container.setVisible(true);
    this.layout(this.scene.scale.width, this.scene.scale.height);
  }

  layout(width: number, height: number): void {
    this.width = Math.max(240, Math.min(420, width - 24));
    this.height = this.hintVisible ? 174 : 110;
    this.container.setPosition(12, 4);
    this.background.setSize(this.width, this.height);
    this.instructionText.setWordWrapWidth(this.width - 28);
    this.hintText.setWordWrapWidth(this.width - 28);
    this.hintText.setPosition(14, this.height - 54);
    this.hintButton.setPosition(this.width - this.hintButton.width - 12, 6);
    this.hintButton.setText(`[ ${t("Hint")} ]`);
    this.hintText.setVisible(this.hintVisible);
    if (height < this.height + 60) {
      this.container.setY(Math.max(8, height - this.height - 8));
    }
  }

  containsPoint(x: number, y: number): boolean {
    return this.container.visible && this.container.getBounds().contains(x, y);
  }

  destroy(): void {
    this.container.destroy(true);
  }

  private toggleHint(): void {
    this.hintVisible = !this.hintVisible;
    this.layout(this.scene.scale.width, this.scene.scale.height);
  }

}
