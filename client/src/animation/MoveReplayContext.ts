import type Phaser from "phaser";
import type { Axial, MatchRecord } from "@shared";
import type { SkinContainer } from "../ui/PlayerSkinRenderer";

export interface MoveReplayContext {
  tweens: Phaser.Tweens.TweenManager;
  axialToWorld: (coord: Axial) => { x: number; y: number };
  getSprite: (playerId: string) => SkinContainer | undefined;
  getLabel: (playerId: string) => Phaser.GameObjects.Text | undefined;
  positionLabel: (
    label: Phaser.GameObjects.Text,
    sprite: SkinContainer,
  ) => void;
  currentMatch: MatchRecord | null;
  scene: Phaser.Scene;
  ignoreUI: (object: Phaser.GameObjects.GameObject) => void;
}
