import Phaser from "phaser";
import { makeButton, type UIButton } from "./button";

export interface ReplayControlsState {
  visible: boolean;
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
  private readonly previousButton: UIButton;
  private readonly playPauseButton: UIButton;
  private readonly nextButton: UIButton;
  private readonly liveButton: UIButton;

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
      this.previousButton,
      this.playPauseButton,
      this.nextButton,
      this.liveButton,
    ]);
    camera.ignore(this.container);
  }

  layout(width: number, height: number, menuHeight: number): void {
    const gap = 6;
    const horizontalPadding = 6;
    const controlHeight = 44;
    const totalWidth =
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
    this.previousButton.setPosition(startX, 4);
    this.playPauseButton.setPosition(
      this.previousButton.x + this.previousButton.width + gap,
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
