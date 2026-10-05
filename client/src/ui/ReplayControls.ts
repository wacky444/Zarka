import Phaser from "phaser";
import { t } from "../services/i18n";
import { makeButton, type UIButton } from "./button";

export interface ReplayControlsState {
  visible: boolean;
  turn: number;
  canPrevious: boolean;
  canPlayPause: boolean;
  canNext: boolean;
  canLive: boolean;
}

export interface ReplayControlsCallbacks {
  onPrevious: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onLive: () => void;
}

export class ReplayControls {
  private readonly container: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly turnLabel: Phaser.GameObjects.Text;
  private readonly previousButton: UIButton;
  private readonly playPauseButton: UIButton;
  private readonly nextButton: UIButton;
  private readonly liveButton: UIButton;
  private layoutWidth = 0;
  private layoutHeight = 0;
  private menuHeight = 0;

  constructor(
    scene: Phaser.Scene,
    camera: Phaser.Cameras.Scene2D.Camera,
    callbacks: ReplayControlsCallbacks
  ) {
    this.container = scene.add
      .container(0, 0)
      .setDepth(5100)
      .setVisible(false);
    this.background = scene.add
      .rectangle(0, 0, scene.scale.width, 44, 0x111827, 0.94)
      .setOrigin(0, 0);
    this.turnLabel = scene.add
      .text(0, 0, `${t("Turn")} 0`, {
        color: "#dbeafe",
        fontSize: "14px",
        fontStyle: "bold"
      })
      .setOrigin(0, 0.5);
    this.previousButton = makeButton(
      scene,
      0,
      0,
      "<",
      callbacks.onPrevious
    );
    this.playPauseButton = makeButton(
      scene,
      0,
      0,
      "R/P",
      callbacks.onPlayPause
    );
    this.nextButton = makeButton(scene, 0, 0, ">", callbacks.onNext);
    this.liveButton = makeButton(scene, 0, 0, "Live", callbacks.onLive);
    this.container.add([
      this.background,
      this.turnLabel,
      this.previousButton,
      this.playPauseButton,
      this.nextButton,
      this.liveButton,
    ]);
    camera.ignore(this.container);
  }

  layout(width: number, height: number, menuHeight: number): void {
    this.layoutWidth = width;
    this.layoutHeight = height;
    this.menuHeight = menuHeight;
    const gap = 6;
    const horizontalPadding = 6;
    const controlHeight = 44;
    const labelGap = 8;
    const totalWidth =
      this.turnLabel.width +
      labelGap +
      this.previousButton.width +
      this.playPauseButton.width +
      this.nextButton.width +
      this.liveButton.width +
      gap * 3;
    const startX = Math.max(horizontalPadding, (width - totalWidth) / 2);
    const y = Math.max(
      8,
      height - Math.max(0, menuHeight) - 16 - controlHeight - 8
    );

    this.background.setSize(width, controlHeight).setDisplaySize(width, controlHeight);
    this.container.setPosition(0, y);
    this.turnLabel.setPosition(startX, controlHeight / 2);
    const buttonStartX = startX + this.turnLabel.width + labelGap;
    this.previousButton.setPosition(buttonStartX, 4);
    this.playPauseButton.setPosition(
      buttonStartX + this.previousButton.width + gap,
      4
    );
    this.nextButton.setPosition(
      this.playPauseButton.x + this.playPauseButton.width + gap,
      4
    );
    this.liveButton.setPosition(
      this.nextButton.x + this.nextButton.width + gap,
      4
    );
  }

  setState(state: ReplayControlsState): void {
    this.turnLabel.setText(`${t("Turn")} ${state.turn}`);
    if (this.layoutWidth > 0) {
      this.layout(this.layoutWidth, this.layoutHeight, this.menuHeight);
    }
    this.container.setVisible(state.visible);
    this.setButtonEnabled(this.previousButton, state.canPrevious);
    this.setButtonEnabled(this.playPauseButton, state.canPlayPause);
    this.setButtonEnabled(this.nextButton, state.canNext);
    this.setButtonEnabled(this.liveButton, state.canLive);
  }

  destroy(): void {
    this.container.destroy(true);
  }

  private setButtonEnabled(button: UIButton, enabled: boolean): void {
    if (enabled) {
      button.setAlpha(1);
      button.setInteractive({ useHandCursor: true });
    } else {
      button.setAlpha(0.4);
      button.disableInteractive();
    }
  }
}
