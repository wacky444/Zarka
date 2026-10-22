import Phaser from "phaser";
import { t } from "../services/i18n";

export interface ReplayControlsState {
  visible: boolean;
  turn: number;
  canPrevious: boolean;
  canPlayPause: boolean;
  canNext: boolean;
  canLive: boolean;
  isPlaying: boolean;
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
  private readonly previousButton: Phaser.GameObjects.Image;
  private readonly playPauseButton: Phaser.GameObjects.Image;
  private readonly nextButton: Phaser.GameObjects.Image;
  private readonly liveButton: Phaser.GameObjects.Image;
  private layoutWidth = 0;
  private layoutHeight = 0;
  private menuHeight = 0;
  private readonly callbacks: ReplayControlsCallbacks;

  constructor(
    scene: Phaser.Scene,
    camera: Phaser.Cameras.Scene2D.Camera,
    callbacks: ReplayControlsCallbacks
  ) {
    this.callbacks = callbacks;
    this.container = scene.add.container(0, 0).setDepth(5100).setVisible(false);
    this.background = scene.add.rectangle(0, 0, scene.scale.width, 44, 0x111827, 0.94).setOrigin(0, 0);
    this.turnLabel = scene.add.text(0, 0, `${t("Turn")} 0`, {
      color: "#dbeafe", fontSize: "14px", fontStyle: "bold"
    }).setOrigin(0, 0.5);
    this.previousButton = this.createButton(scene, "replay-previous", callbacks.onPrevious, "Previous turn");
    this.playPauseButton = this.createButton(scene, "replay-forward", callbacks.onPlayPause, "Play replay");
    this.nextButton = this.createButton(scene, "replay-next", callbacks.onNext, "Next turn");
    this.liveButton = this.createButton(scene, "replay-return", callbacks.onLive, "Return to live game");
    this.container.add([this.background, this.turnLabel, this.previousButton, this.playPauseButton, this.nextButton, this.liveButton]);
    camera.ignore(this.container);
  }

  private createButton(scene: Phaser.Scene, key: string, callback: () => void, label: string): Phaser.GameObjects.Image {
    return scene.add.image(0, 0, key).setDisplaySize(28, 28).setInteractive({ useHandCursor: true })
      .setData("callback", callback).setData("label", label)
      .on("pointerdown", callback)
      .on("pointerover", function (this: Phaser.GameObjects.Image) { this.setAlpha(0.75); })
      .on("pointerout", function (this: Phaser.GameObjects.Image) { this.setAlpha(1); });
  }

  layout(width: number, height: number, menuHeight: number): void {
    this.layoutWidth = width;
    this.layoutHeight = height;
    this.menuHeight = menuHeight;
    const gap = 12;
    const buttonSize = 28;
    const controlHeight = 44;
    const labelGap = 8;
    const totalWidth = this.turnLabel.width + labelGap + buttonSize * 4 + gap * 3;
    const startX = Math.max(6, (width - totalWidth) / 2);
    const y = Math.max(8, height - Math.max(0, menuHeight) - 16 - controlHeight - 8);
    this.background.setSize(width, controlHeight).setDisplaySize(width, controlHeight);
    this.container.setPosition(0, y);
    this.turnLabel.setPosition(startX, controlHeight / 2);
    const x = startX + this.turnLabel.width + labelGap + buttonSize / 2;
    const centerY = controlHeight / 2;
    this.previousButton.setPosition(x, centerY);
    this.playPauseButton.setPosition(x + buttonSize + gap, centerY);
    this.nextButton.setPosition(x + (buttonSize + gap) * 2, centerY);
    this.liveButton.setPosition(x + (buttonSize + gap) * 3, centerY);
  }

  setState(state: ReplayControlsState): void {
    this.turnLabel.setText(`${t("Turn")} ${state.turn}`);
    this.playPauseButton.setTexture(state.isPlaying ? "replay-pause" : "replay-forward");
    if (this.layoutWidth > 0) this.layout(this.layoutWidth, this.layoutHeight, this.menuHeight);
    this.container.setVisible(state.visible);
    this.setButtonEnabled(this.previousButton, state.canPrevious);
    this.setButtonEnabled(this.playPauseButton, state.canPlayPause);
    this.setButtonEnabled(this.nextButton, state.canNext);
    this.setButtonEnabled(this.liveButton, state.canLive);
  }

  destroy(): void { this.container.destroy(true); }

  private setButtonEnabled(button: Phaser.GameObjects.Image, enabled: boolean): void {
    button.setAlpha(enabled ? 1 : 0.4);
    if (enabled) button.setInteractive({ useHandCursor: true });
    else button.disableInteractive();
  }
}
