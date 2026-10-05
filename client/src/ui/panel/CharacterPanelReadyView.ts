import Phaser from "phaser";
import type { TutorialStepId } from "@shared";
import { THEME } from "../ColorPalette";
import { getTutorialUiPolicy } from "../../tutorial/TutorialUiPolicy";
import { t } from "../../services/i18n";

export interface CharacterPanelReadyViewConfig {
  scene: Phaser.Scene;
  parent: Phaser.GameObjects.Container;
  x: number;
  y: number;
  onReadyChange?: (ready: boolean) => void;
}

export interface CharacterPanelReadyRefreshOptions {
  enabled: boolean;
  isCharacterActive: boolean;
  isStatusActive: boolean;
  unspentSkillPoints: number;
  tutorialActive: boolean;
  tutorialStepId: TutorialStepId | null;
  tutorialReadyEnabled: boolean;
  tutorialReadyAllowed: boolean;
}

export class CharacterPanelReadyView {
  private readonly readyToggle: Phaser.GameObjects.Text;
  private readonly unspentSkillsWarning: Phaser.GameObjects.Text;
  private readonly onReadyChange?: (ready: boolean) => void;
  private readyState = false;
  private readyEnabled = false;
  private readyPointerIsDown = false;
  private lastRefreshOptions: CharacterPanelReadyRefreshOptions | null = null;

  constructor(config: CharacterPanelReadyViewConfig) {
    const { scene, parent, x, y, onReadyChange } = config;
    this.onReadyChange = onReadyChange;

    this.readyToggle = scene.add
      .text(x, y, "[ ] Ready", {
        fontSize: "15px",
        color: "#ffffff"
      })
      .setOrigin(0, 0);
    this.readyToggle.setInteractive({ useHandCursor: true });

    this.readyToggle.on(
      Phaser.Input.Events.POINTER_DOWN,
      this.handlePointerDown
    );
    this.readyToggle.on(Phaser.Input.Events.POINTER_OUT, this.handlePointerOut);
    this.readyToggle.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp);
    parent.add(this.readyToggle);

    this.unspentSkillsWarning = scene.add
      .text(x + this.readyToggle.width + 12, y + 1, "", {
        fontSize: "14px",
        color: THEME.colors.warning
      })
      .setOrigin(0, 0)
      .setVisible(false);
    parent.add(this.unspentSkillsWarning);

    this.readyToggle.setAlpha(0.5);
    this.readyToggle.disableInteractive();
  }

  get text(): Phaser.GameObjects.Text {
    return this.readyToggle;
  }

  get height(): number {
    return this.readyToggle.height;
  }

  get width(): number {
    return this.readyToggle.width;
  }

  getElements(): Phaser.GameObjects.GameObject[] {
    return [this.readyToggle, this.unspentSkillsWarning];
  }

  setPosition(x: number, y: number): void {
    this.readyToggle.setPosition(x, y);
    this.updateWarningPosition();
  }

  setReadyState(ready: boolean, emit = false): boolean {
    const normalized = !!ready;
    const changed = this.readyState !== normalized;
    this.readyState = normalized;

    this.readyToggle.setText(normalized ? "[x] Ready" : "[ ] Ready");
    this.updateWarningPosition();

    if (emit && changed) {
      this.onReadyChange?.(normalized);
    }
    return changed;
  }

  getReadyState(): boolean {
    return this.readyState;
  }

  getReadyEnabled(): boolean {
    return this.readyEnabled;
  }

  refresh(options: CharacterPanelReadyRefreshOptions): void {
    this.lastRefreshOptions = options;
    this.readyEnabled = options.enabled;

    const hasUnspentSkillPoints = options.unspentSkillPoints > 0;
    const showReady =
      options.enabled &&
      !hasUnspentSkillPoints &&
      (!options.tutorialActive ||
        (options.tutorialReadyEnabled && options.tutorialReadyAllowed)) &&
      options.isCharacterActive &&
      options.isStatusActive;

    if (showReady) {
      this.readyToggle.setAlpha(1);
      this.readyToggle.setInteractive({ useHandCursor: true });
    } else {
      this.readyToggle.setAlpha(0.5);
      this.readyToggle.disableInteractive();
      if (
        options.tutorialActive &&
        !options.tutorialReadyAllowed &&
        this.readyState
      ) {
        this.setReadyState(false, true);
      }
      if (hasUnspentSkillPoints && this.readyState) {
        this.setReadyState(false, true);
      }
    }

    if (
      hasUnspentSkillPoints &&
      options.isCharacterActive &&
      options.isStatusActive
    ) {
      this.unspentSkillsWarning.setText(
        `${t("Unspent points")}: ${options.unspentSkillPoints}`
      );
      this.updateWarningPosition();
      this.unspentSkillsWarning.setVisible(true);
    } else {
      this.unspentSkillsWarning.setVisible(false);
    }

    if (options.tutorialActive) {
      const isReadyHighlighted =
        options.tutorialStepId === "return_to_bot" ||
        options.tutorialStepId === "scare_bot_to_doomed_cell"
          ? options.tutorialReadyAllowed
          : options.tutorialStepId
            ? getTutorialUiPolicy(
                options.tutorialStepId
              ).highlightedControls.includes("ready")
            : false;
      this.readyToggle.setColor(isReadyHighlighted ? "#fbbf24" : "#ffffff");
    } else {
      this.readyToggle.setColor("#ffffff");
    }
  }

  disableInteractive(): void {
    this.readyToggle.disableInteractive();
  }

  destroy(): void {
    this.readyToggle.off(
      Phaser.Input.Events.POINTER_DOWN,
      this.handlePointerDown
    );
    this.readyToggle.off(Phaser.Input.Events.POINTER_OUT, this.handlePointerOut);
    this.readyToggle.off(Phaser.Input.Events.POINTER_UP, this.handlePointerUp);
    this.readyToggle.destroy();
    this.unspentSkillsWarning.destroy();
  }

  private updateWarningPosition(): void {
    this.unspentSkillsWarning.setPosition(
      this.readyToggle.x + this.readyToggle.width + 12,
      this.readyToggle.y + 1
    );
  }

  private canToggle(): boolean {
    if (!this.readyEnabled) {
      return false;
    }
    if (this.lastRefreshOptions) {
      if (this.lastRefreshOptions.unspentSkillPoints > 0) {
        return false;
      }
      if (
        this.lastRefreshOptions.tutorialActive &&
        !this.lastRefreshOptions.tutorialReadyAllowed
      ) {
        return false;
      }
    }
    return true;
  }

  private readonly handlePointerDown = (
    _pointer: Phaser.Input.Pointer,
    _localX: number,
    _localY: number,
    event: Phaser.Types.Input.EventData
  ) => {
    if (!this.canToggle()) {
      return;
    }
    this.readyPointerIsDown = true;
    event.stopPropagation();
  };

  private readonly handlePointerOut = () => {
    this.readyPointerIsDown = false;
  };

  private readonly handlePointerUp = (
    _pointer: Phaser.Input.Pointer,
    _localX: number,
    _localY: number,
    event: Phaser.Types.Input.EventData
  ) => {
    if (this.readyPointerIsDown) {
      this.readyPointerIsDown = false;
      if (this.canToggle()) {
        this.setReadyState(!this.readyState, true);
      }
    }
    event.stopPropagation();
  };
}
