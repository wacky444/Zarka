import Phaser from "phaser";
import {
  formatTutorialHeader,
  type TutorialStepId
} from "@shared";
import { t } from "../services/i18n";
import { makeButton, type UIButton } from "./button";
import { TUTORIAL_INSTRUCTIONS } from "../tutorial/TutorialInstructions";
import { THEME } from "./ColorPalette";

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
  private mobileLayout = false;
  private bottomControlsClearance = 0;
  private centerVertical = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0).setDepth(1200).setScrollFactor(0);
    this.background = scene.add
      .rectangle(0, 0, 400, 124, 0x111827, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(2, THEME.colors.tutorialHighlight, 1)
      .setInteractive({ useHandCursor: false });
    this.titleText = scene.add
      .text(14, 10, "", {
        fontSize: "15px",
        fontStyle: "bold",
        color: THEME.colors.tutorialHighlightText
      })
      .setOrigin(0, 0);
    this.instructionText = scene.add
      .text(14, 36, "", {
        fontSize: "16px",
        color: THEME.colors.textPrimary,
        lineSpacing: 3,
        wordWrap: { width: 372, useAdvancedWrap: true }
      })
      .setOrigin(0, 0);
    this.hintText = scene.add
      .text(14, 122, "", {
        fontSize: "13px",
        color: THEME.colors.modalText,
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

    const copy = TUTORIAL_INSTRUCTIONS[stepId];
    this.titleText.setText(formatTutorialHeader(stepId, t));
    this.instructionText.setText(t(copy.instruction));
    this.hintText.setText(t(copy.hint));
    this.hintText.setVisible(false);
    this.container.setVisible(true);
    this.layout(this.scene.scale.width, this.scene.scale.height);
  }

  layout(
    width: number,
    height: number,
    mobileLayout = this.mobileLayout,
    bottomControlsClearance = this.bottomControlsClearance,
    centerVertical = this.centerVertical
  ): void {
    this.mobileLayout = mobileLayout;
    this.bottomControlsClearance = bottomControlsClearance;
    this.centerVertical = centerVertical;
    this.width = Math.max(240, Math.min(420, width - 24));
    this.instructionText.setWordWrapWidth(this.width - 28);
    this.hintText.setWordWrapWidth(this.width - 28);
    this.height = this.hintVisible ? 186 : 122;
    const y = mobileLayout
      ? centerVertical
        ? Math.max(8, Math.round((height - this.height) / 2))
        : Math.max(8, height - this.height - bottomControlsClearance)
      : 4;
    this.container.setPosition(12, y);
    this.background.setSize(this.width, this.height);
    this.hintText.setPosition(14, this.height - 54);
    this.hintButton.setPosition(this.width - this.hintButton.width - 12, 6);
    this.hintButton.setText(`[ ${t("Hint")} ]`);
    this.hintText.setVisible(this.hintVisible);
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
