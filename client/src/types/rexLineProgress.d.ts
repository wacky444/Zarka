declare module "phaser3-rex-plugins/plugins/lineprogress.js" {
  import Phaser from "phaser";

  export interface LineProgressConfig {
    trackColor?: number | string;
    trackStrokeColor?: number | string;
    trackStrokeThickness?: number;
    skewX?: number;
    rtl?: boolean;
    easeValue?: {
      duration?: number;
      ease?: string;
    };
    value?: number;
    valuechangeCallback?: (
      newValue: number,
      oldValue: number,
      lineProgress: LineProgress
    ) => void;
  }

  export default class LineProgress extends Phaser.GameObjects.Shape {
    constructor(
      scene: Phaser.Scene,
      x: number,
      y: number,
      width: number,
      height: number,
      barColor?: number | string,
      value?: number,
      config?: LineProgressConfig
    );
    setValue(value: number, min?: number, max?: number): this;
    getValue(min?: number, max?: number): number;
    setBarColor(color?: number | string): this;
    setTrackColor(color?: number | string): this;
    setEaseValueDuration(duration: number): this;
    setEaseValueFunction(ease: string | ((t: number) => number)): this;
    easeValueTo(value: number, min?: number, max?: number): this;
    stopEaseValue(): this;
    setRTL(rtl: boolean): this;
    setSkewX(skewX: number): this;
  }
}
