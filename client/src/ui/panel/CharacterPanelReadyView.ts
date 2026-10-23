import Phaser from "phaser";
import type { TutorialStepId } from "@shared";
import { ItemTooltipManager } from "../ItemTooltip";
import { ReadyWarning } from "./ReadyWarning";
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
  mobile?: boolean;
}

export class CharacterPanelReadyView {
  private readonly scene: Phaser.Scene;
  private readonly readyToggle: Phaser.GameObjects.Text;
  private readonly checkMarkText: Phaser.GameObjects.Text;
  private readonly readyHighlightBorder: Phaser.GameObjects.Rectangle;
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
  private mobile = false;

  constructor(config: CharacterPanelReadyViewConfig) {
    const { scene, parent, x, y, onReadyChange } = config;
    this.scene = scene;
    this.onReadyChange = onReadyChange;

    this.checkMarkText = scene.add
      .text(x + 14, y + 8, "✓", {
        fontSize: "15px",
        color: "#ffffff",
        fontStyle: "bold"
      })
      .setOrigin(0, 0)
      .setStroke("#14532d", 2)
      .setShadow(0, 2, "#000000", 0.45)
      .setVisible(false);

    const checkWidth = this.checkMarkText.width;
    const checkGap = 6;
    const leftPadding = 14 + checkWidth + checkGap;

    this.readyToggle = scene.add
      .text(x, y, t("Ready"), {
        fontSize: "15px",
        color: "#ffffff",
        fontStyle: "bold",
        backgroundColor: "#c2410c",
        padding: { left: leftPadding, right: 14, top: 8, bottom: 8 }
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
    parent.add(this.checkMarkText);

    this.readyHighlightBorder = scene.add
      .rectangle(
        x,
        y,
        this.readyToggle.width,
        this.readyToggle.height,
        0x000000,
        0
      )
      .setOrigin(0, 0)
      .setStrokeStyle(3, THEME.colors.tutorialHighlight, 1)
      .setVisible(false);
    parent.add(this.readyHighlightBorder);
    this.updateHighlightBorder();

    this.unspentSkillsWarning = new ReadyWarning({
      scene,
      parent,
      x: x + this.readyToggle.width + 12,
      y: y + 1,
      text: "",
      color: THEME.colors.error,
      tooltip: () => this.unspentSkillsWarning.getText(),
      onTooltipRequested: (message, tooltipX, tooltipY) =>
        this.showWarningTooltip(message, tooltipX, tooltipY)
    });
    this.energyWarning = new ReadyWarning({
      scene,
      parent,
      x: x + this.readyToggle.width + 12,
      y: y + 1,
      text: t("Insufficient energy"),
      color: THEME.colors.warning,
      emphasized: true,
      tooltip: () =>
        t(
          "Insufficient energy, actions hurt for 1 damage and actions with extra effort will fail."
        ),
      onTooltipRequested: (message, tooltipX, tooltipY) =>
        this.showWarningTooltip(message, tooltipX, tooltipY)
    });
    this.overweightWarning = new ReadyWarning({
      scene,
      parent,
      x: x + this.readyToggle.width + 12,
      y: y + 1,
      text: t("Overweight"),
      color: THEME.colors.warning,
      emphasized: true,
      tooltip: () => t("Your current actions may make you overweight"),
      onTooltipRequested: (message, tooltipX, tooltipY) =>
        this.showWarningTooltip(message, tooltipX, tooltipY)
    });
    this.chainsawOrderWarning = new ReadyWarning({
      scene,
      parent,
      x: x + this.readyToggle.width + 12,
      y: y + 1,
      text: t("Chainsaw order"),
      color: THEME.colors.warning,
      emphasized: true,
      tooltip: () =>
        t(
          "The chainsaw attack order goes first, it won't be started, it requires two turns, first start then attack"
        ),
      onTooltipRequested: (message, tooltipX, tooltipY) =>
        this.showWarningTooltip(message, tooltipX, tooltipY)
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
      this.checkMarkText,
      this.readyHighlightBorder,
      ...this.unspentSkillsWarning.getAllGameObjects(),
      ...this.energyWarning.getAllGameObjects(),
      ...this.overweightWarning.getAllGameObjects(),
      ...this.chainsawOrderWarning.getAllGameObjects()
    ];
  }

  isHighlightActive(): boolean {
    return this.readyHighlightBorder.visible;
  }

  getHighlightedTarget(): Phaser.GameObjects.Rectangle | null {
    if (this.isHighlightActive()) {
      return this.readyHighlightBorder;
    }
    return null;
  }

  setPosition(x: number, y: number): void {
    this.readyToggle.setPosition(x, y);
    this.checkMarkText.setPosition(x + 14, y + 8);
    this.updateHighlightBorder();
    this.updateWarningPosition();
  }

  setReadyState(ready: boolean, emit = false): boolean {
    const normalized = !!ready;
    const changed = this.readyState !== normalized;
    this.readyState = normalized;

    this.readyToggle.setStyle({
      backgroundColor: normalized ? "#15803d" : "#c2410c"
    });
    this.readyToggle.setStroke(normalized ? "#14532d" : "#7c2d12", 2);
    this.checkMarkText.setVisible(normalized);
    this.checkMarkText.setStroke(normalized ? "#14532d" : "#7c2d12", 2);
    this.updateHighlightBorder();
    this.readyHighlightBorder.setVisible(this.isTutorialHighlightActive());
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

  setMobile(mobile: boolean): void {
    if (this.mobile === mobile) {
      return;
    }
    this.mobile = mobile;
    this.unspentSkillsWarning.setMobile(mobile);
    this.energyWarning.setMobile(mobile);
    this.overweightWarning.setMobile(mobile);
    this.chainsawOrderWarning.setMobile(mobile);
  }

  refresh(options: CharacterPanelReadyRefreshOptions): void {
    if (options.mobile !== undefined) {
      this.setMobile(options.mobile);
    }
    this.lastRefreshOptions = options;
    const hasUnspentSkillPoints = options.unspentSkillPoints > 0;
    const mustSpendSkillPoints =
      !options.tutorialActive &&
      options.currentTurn === 0 &&
      hasUnspentSkillPoints;
    this.readyEnabled = options.enabled && !mustSpendSkillPoints;

    const showReady =
      (options.tutorialActive
        ? options.tutorialReadyEnabled && options.tutorialReadyAllowed
        : this.readyEnabled) &&
      options.isCharacterActive &&
      options.isStatusActive;

    this.readyCanToggle = showReady;
    if (showReady) {
      this.readyToggle.setAlpha(1);
      this.readyToggle.setInteractive({ useHandCursor: true });
      this.checkMarkText.setAlpha(1);
    } else {
      this.readyToggle.setAlpha(0.5);
      this.readyToggle.disableInteractive();
      this.checkMarkText.setAlpha(0.5);
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

    this.readyToggle.setColor(THEME.colors.textPrimary);
    this.checkMarkText.setVisible(this.readyState);
    this.updateHighlightBorder();
    this.readyHighlightBorder.setVisible(this.isTutorialHighlightActive());
    this.syncReadyPulse();
  }

  disableInteractive(): void {
    this.readyCanToggle = false;
    this.readyToggle.disableInteractive();
    this.checkMarkText.setAlpha(0.5);
    this.readyHighlightBorder.setVisible(false);
    this.syncReadyPulse();
  }

  destroy(): void {
    this.readyToggle.off(
      Phaser.Input.Events.POINTER_DOWN,
      this.handlePointerDown
    );
    this.readyToggle.off(
      Phaser.Input.Events.POINTER_OUT,
      this.handlePointerOut
    );
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
    this.checkMarkText.destroy();
    this.readyHighlightBorder.destroy();
    this.unspentSkillsWarning.destroy();
    this.energyWarning.destroy();
    this.overweightWarning.destroy();
    this.chainsawOrderWarning.destroy();
  }

  private isTutorialHighlightActive(): boolean {
    if (!this.lastRefreshOptions) {
      return false;
    }
    const options = this.lastRefreshOptions;
    return (
      options.tutorialActive &&
      options.tutorialReadyEnabled &&
      options.tutorialReadyAllowed &&
      !this.readyState &&
      options.isCharacterActive &&
      options.isStatusActive
    );
  }

  private updateHighlightBorder(): void {
    if (!this.readyHighlightBorder) {
      return;
    }
    const offset = 2;
    this.readyHighlightBorder.setPosition(
      this.readyToggle.x - offset,
      this.readyToggle.y - offset
    );
    this.readyHighlightBorder.setSize(
      this.readyToggle.width + offset * 2,
      this.readyToggle.height + offset * 2
    );
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
        (this.readyToggle.height - this.energyWarning.getHeight()) / 2
    );
    this.overweightWarning.setPosition(
      warningX,
      this.readyToggle.y +
        (this.readyToggle.height - this.overweightWarning.getHeight()) / 2
    );
    this.chainsawOrderWarning.setPosition(
      warningX,
      this.readyToggle.y +
        (this.readyToggle.height - this.chainsawOrderWarning.getHeight()) / 2
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
    return this.readyCanToggle;
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
