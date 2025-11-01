import type Phaser from "phaser";
import type { Axial, MatchRecord } from "@shared";

export interface MoveReplayContext {
  tweens: Phaser.Tweens.TweenManager;
  axialToWorld: (coord: Axial) => { x: number; y: number };
  getSprite: (playerId: string) => Phaser.GameObjects.Image | undefined;
  getLabel: (playerId: string) => Phaser.GameObjects.Text | undefined;
  positionLabel: (
    label: Phaser.GameObjects.Text,
    sprite: Phaser.GameObjects.Image
  ) => void;
  currentMatch: MatchRecord | null;
  scene: Phaser.Scene;
  ignoreUI: (object: Phaser.GameObjects.GameObject) => void;
}
