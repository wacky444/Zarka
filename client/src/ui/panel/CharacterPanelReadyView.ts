import Phaser from "phaser";
import type { TutorialStepId } from "@shared";
import { ItemTooltipManager } from "../ItemTooltip";
import { ReadyWarning } from "./ReadyWarning";
import { getTutorialUiPolicy } from "../../tutorial/TutorialUiPolicy";
import { t } from "../../services/i18n";
import { THEME } from "../ColorPalette";

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
  currentTurn: number;
  plannedEnergyCost: number;
  availableEnergy: number;
  willBeOverweight: boolean;
  tutorialActive: boolean;
  tutorialStepId: TutorialStepId | null;
  tutorialReadyEnabled: boolean;
  tutorialReadyAllowed: boolean;
  hasChainsawOrderConflict?: boolean;
}

export class CharacterPanelReadyView {
  private readonly scene: Phaser.Scene;
  private readonly readyToggle: Phaser.GameObjects.Text;
  private readonly unspentSkillsWarning: ReadyWarning;
  private readonly energyWarning: ReadyWarning;
  private readonly overweightWarning: ReadyWarning;
  private readonly chainsawOrderWarning: ReadyWarning;
  private readonly warningTooltip: ItemTooltipManager;
  private readonly onReadyChange?: (ready: boolean) => void;
  private readyState = false;
  private readyEnabled = false;
  private readyPointerIsDown = false;
  private readyCanToggle = false;
  private readyPulse: Phaser.Tweens.Tween | null = null;
  private lastRefreshOptions: CharacterPanelReadyRefreshOptions | null = null;
  private activeWarning: ReadyWarning | null = null;

  constructor(config: CharacterPanelReadyViewConfig) {
    const { scene, parent, x, y, onReadyChange } = config;
    this.scene = scene;
    this.onReadyChange = onReadyChange;

    this.readyToggle = scene.add
      .text(x, y, t("Ready"), {
        fontSize: "15px",
        color: "#ffffff",
        fontStyle: "bold",
        backgroundColor: "#c2410c",
        padding: { left: 14, right: 14, top: 8, bottom: 8 }
      })
      .setOrigin(0, 0)
      .setStroke("#7c2d12", 2)
      .setShadow(0, 2, "#000000", 0.45);
    this.readyToggle.setInteractive({ useHandCursor: true });

    this.readyToggle.on(
      Phaser.Input.Events.POINTER_DOWN,
      this.handlePointerDown
    );
    this.readyToggle.on(Phaser.Input.Events.POINTER_OUT, this.handlePointerOut);
    this.readyToggle.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp);
    parent.add(this.readyToggle);

    this.unspentSkillsWarning = new ReadyWarning({
      scene,
      parent,
      x: x + this.readyToggle.width + 12,
      y: y + 1,
      text: "",
    });
    this.energyWarning = new ReadyWarning({
      scene,
      parent,
      x: x + this.readyToggle.width + 12,
      y: y + 1,
      text: t("Insufficient energy"),
      emphasized: true,
      tooltip: () =>
        t("Without energy, actions hurt for 1 damage and actions with extra effort will fail."),
      onTooltipRequested: (message, tooltipX, tooltipY) =>
        this.showWarningTooltip(message, tooltipX, tooltipY),
    });
    this.overweightWarning = new ReadyWarning({
      scene,
      parent,
      x: x + this.readyToggle.width + 12,
      y: y + 1,
      text: t("Overweight"),
      emphasized: true,
      tooltip: () => t("Your current actions may make you overweight"),
      onTooltipRequested: (message, tooltipX, tooltipY) =>
        this.showWarningTooltip(message, tooltipX, tooltipY),
    });
    this.chainsawOrderWarning = new ReadyWarning({
      scene,
      parent,
      x: x + this.readyToggle.width + 12,
      y: y + 1,
      text: t("Chainsaw order"),
      emphasized: true,
      tooltip: () =>
        t(
          "The chainsaw attack order goes first, it won't be started, it requires two turns, first start then attack"
        ),
      onTooltipRequested: (message, tooltipX, tooltipY) =>
        this.showWarningTooltip(message, tooltipX, tooltipY),
    });

    this.warningTooltip = new ItemTooltipManager(scene);
    scene.input.on(
      Phaser.Input.Events.POINTER_DOWN,
      this.handleScenePointerDown
    );
    scene.input.on(
      Phaser.Input.Events.POINTER_MOVE,
      this.handleScenePointerMove
    );
    scene.input.on(Phaser.Input.Events.GAME_OUT, this.handleSceneGameOut);
    this.updateWarningPosition();
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
    return [
      this.readyToggle,
      this.unspentSkillsWarning.gameObject,
      this.energyWarning.gameObject,
      this.overweightWarning.gameObject,
      this.chainsawOrderWarning.gameObject,
    ];
  }

  setPosition(x: number, y: number): void {
    this.readyToggle.setPosition(x, y);
    this.updateWarningPosition();
  }

  setReadyState(ready: boolean, emit = false): boolean {
    const normalized = !!ready;
    const changed = this.readyState !== normalized;
    this.readyState = normalized;

    this.readyToggle.setText(normalized ? `✓ ${t("Ready")}` : t("Ready"));
    this.readyToggle.setStyle({
      backgroundColor: normalized ? "#15803d" : "#c2410c"
    });
    this.readyToggle.setStroke(normalized ? "#14532d" : "#7c2d12", 2);
    this.syncReadyPulse();
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
    const hasUnspentSkillPoints = options.unspentSkillPoints > 0;
    const mustSpendSkillPoints =
      options.currentTurn === 0 && hasUnspentSkillPoints;
    this.readyEnabled = options.enabled && !mustSpendSkillPoints;

    const showReady =
      this.readyEnabled &&
      (!options.tutorialActive ||
        (options.tutorialReadyEnabled && options.tutorialReadyAllowed)) &&
      options.isCharacterActive &&
      options.isStatusActive;

    this.readyCanToggle = showReady;
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
      if (mustSpendSkillPoints && this.readyState) {
        this.setReadyState(false, true);
      }
    }

    const warningRowIsActive =
      options.isCharacterActive && options.isStatusActive;
    const showSkillsWarning = hasUnspentSkillPoints && warningRowIsActive;
    const showEnergyWarning =
      !hasUnspentSkillPoints &&
      options.plannedEnergyCost > options.availableEnergy &&
      warningRowIsActive;
    const showOverweightWarning =
      !hasUnspentSkillPoints &&
      !showEnergyWarning &&
      options.willBeOverweight &&
      warningRowIsActive;
    const showChainsawOrderWarning =
      !hasUnspentSkillPoints &&
      !showEnergyWarning &&
      !showOverweightWarning &&
      options.hasChainsawOrderConflict === true &&
      warningRowIsActive;

    if (showSkillsWarning) {
      this.unspentSkillsWarning.setText(
        `${t("Unspent points")}: ${options.unspentSkillPoints}`
      );
      this.unspentSkillsWarning.setVisible(true);
    } else {
      this.unspentSkillsWarning.setVisible(false);
    }

    const previousWarning = this.activeWarning;
    this.energyWarning.setText(t("Insufficient energy"));
    this.energyWarning.setVisible(showEnergyWarning);
    this.overweightWarning.setText(t("Overweight"));
    this.overweightWarning.setVisible(showOverweightWarning);
    this.chainsawOrderWarning.setText(t("Chainsaw order"));
    this.chainsawOrderWarning.setVisible(showChainsawOrderWarning);
    this.activeWarning = showSkillsWarning
      ? this.unspentSkillsWarning
      : showEnergyWarning
        ? this.energyWarning
        : showOverweightWarning
          ? this.overweightWarning
          : showChainsawOrderWarning
            ? this.chainsawOrderWarning
            : null;
    if (this.activeWarning !== previousWarning || this.activeWarning === null) {
      this.hideWarningTooltip();
    }
    this.updateWarningPosition();

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
      this.readyToggle.setColor(
        isReadyHighlighted
          ? THEME.colors.tutorialHighlightText
          : THEME.colors.textPrimary
      );
    } else {
      this.readyToggle.setColor(THEME.colors.textPrimary);
    }
    this.syncReadyPulse();
  }

  disableInteractive(): void {
    this.readyCanToggle = false;
    this.readyToggle.disableInteractive();
    this.syncReadyPulse();
  }

  destroy(): void {
    this.readyToggle.off(
      Phaser.Input.Events.POINTER_DOWN,
      this.handlePointerDown
    );
    this.readyToggle.off(Phaser.Input.Events.POINTER_OUT, this.handlePointerOut);
    this.readyToggle.off(Phaser.Input.Events.POINTER_UP, this.handlePointerUp);
    this.scene.input.off(
      Phaser.Input.Events.POINTER_DOWN,
      this.handleScenePointerDown
    );
    this.scene.input.off(
      Phaser.Input.Events.POINTER_MOVE,
      this.handleScenePointerMove
    );
    this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.handleSceneGameOut);
    this.readyPulse?.stop();
    this.readyPulse = null;
    this.warningTooltip.destroy();
    this.readyToggle.destroy();
    this.unspentSkillsWarning.destroy();
    this.energyWarning.destroy();
    this.overweightWarning.destroy();
    this.chainsawOrderWarning.destroy();
  }

  private syncReadyPulse(): void {
    const shouldPulse = this.readyCanToggle && !this.readyState;
    if (shouldPulse && !this.readyPulse) {
      this.readyPulse = this.scene.tweens.add({
        targets: this.readyToggle,
        alpha: { from: 1, to: 0.68 },
        duration: 750,
        yoyo: true,
        repeat: -1
      });
    } else if (!shouldPulse && this.readyPulse) {
      this.readyPulse.stop();
      this.readyPulse = null;
      this.readyToggle.setAlpha(this.readyCanToggle ? 1 : 0.5);
    }
  }

  private updateWarningPosition(): void {
    const warningX = this.readyToggle.x + this.readyToggle.width + 12;
    this.unspentSkillsWarning.setPosition(warningX, this.readyToggle.y + 1);
    this.energyWarning.setPosition(
      warningX,
      this.readyToggle.y +
        (this.readyToggle.height - this.energyWarning.gameObject.height) / 2
    );
    this.overweightWarning.setPosition(
      warningX,
      this.readyToggle.y +
        (this.readyToggle.height - this.overweightWarning.gameObject.height) / 2
    );
    this.chainsawOrderWarning.setPosition(
      warningX,
      this.readyToggle.y +
        (this.readyToggle.height - this.chainsawOrderWarning.gameObject.height) / 2
    );
  }

  private showWarningTooltip(message: string, x: number, y: number): void {
    this.warningTooltip.show(x, y, "", message);
  }

  private hideWarningTooltip(): void {
    this.warningTooltip.hide();
  }

  private readonly handleScenePointerDown = (): void => {
    this.hideWarningTooltip();
  };

  private readonly handleScenePointerMove = (
    pointer: Phaser.Input.Pointer
  ): void => {
    if (pointer.wasTouch) {
      return;
    }
    const pointerOverWarning =
      this.activeWarning?.containsPoint(pointer.x, pointer.y) ?? false;
    if (
      !pointerOverWarning &&
      !this.warningTooltip.containsPoint(pointer.x, pointer.y)
    ) {
      this.hideWarningTooltip();
    }
  };

  private readonly handleSceneGameOut = (): void => {
    this.hideWarningTooltip();
  };

  private canToggle(): boolean {
    if (!this.readyEnabled) {
      return false;
    }
    if (this.lastRefreshOptions) {
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
