import Phaser from "phaser";
import LineProgress from "phaser3-rex-plugins/plugins/lineprogress.js";

export interface ProgressBarConfig {
  width: number;
  height: number;
  barColor?: number | string;
  trackColor?: number | string;
  trackStrokeColor?: number | string;
  trackStrokeThickness?: number;
  rtl?: boolean;
  easeDuration?: number;
  easeFunction?: string;
  initialValue?: number;
}

export class ProgressBar extends Phaser.GameObjects.Container {
  private readonly progress: LineProgress;
  private currentValue: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    config: ProgressBarConfig
  ) {
    super(scene, x, y);
    scene.add.existing(this);
    const width = config.width;
    const height = config.height;
    this.setSize(width, height);
    this.progress = new LineProgress(
      scene,
      0,
      0,
      width,
      height,
      config.barColor ?? 0xffffff,
      config.initialValue ?? 0,
      {
        trackColor: config.trackColor ?? 0x000000,
        trackStrokeColor: config.trackStrokeColor,
        trackStrokeThickness: config.trackStrokeThickness,
        rtl: config.rtl ?? false,
        easeValue: {
          duration: config.easeDuration ?? 0,
          ease: config.easeFunction ?? "Linear",
        },
      }
    );
    this.progress.setOrigin(0, 0);
    this.add(this.progress);
    this.currentValue = Phaser.Math.Clamp(config.initialValue ?? 0, 0, 1);
    this.progress.setValue(this.currentValue);
  }

  setValue(ratio: number) {
    this.currentValue = Phaser.Math.Clamp(ratio, 0, 1);
    this.progress.setValue(this.currentValue);
    return this;
  }

  getValue() {
    return this.currentValue;
  }

  setBarColor(color: number | string) {
    this.progress.setBarColor(color);
    return this;
  }

  setTrackColor(color: number | string) {
    this.progress.setTrackColor(color);
    return this;
  }

  setEase(duration: number, ease: string) {
    this.progress.setEaseValueDuration(duration);
    this.progress.setEaseValueFunction(ease);
    return this;
  }

  resize(width: number, height: number) {
    this.setSize(width, height);
    this.progress.setDisplaySize(width, height);
    this.progress.setValue(this.currentValue);
    return this;
  }
}
