import Phaser from "phaser";
import type { SkinContainer } from "../ui/PlayerSkinRenderer";

type SpritePose = {
  sprite: SkinContainer;
  x: number;
  y: number;
  angle: number;
  children: Array<{ child: Phaser.GameObjects.Image; y: number }>;
};

export function startVictoryDance(
  scene: Phaser.Scene,
  sprites: SkinContainer[],
): () => void {
  const poses: SpritePose[] = [];
  for (const sprite of sprites) {
    if (!sprite.active || sprite.scene !== scene) {
      continue;
    }
    const scaleY = Math.abs(sprite.scaleY) || 1;
    const footOffset = 8;
    const children = sprite.list
      .filter(
        (child): child is Phaser.GameObjects.Image =>
          child instanceof Phaser.GameObjects.Image
      )
      .map((child) => ({ child, y: child.y }));
    for (const { child } of children) {
      child.y -= footOffset;
    }
    const x = sprite.x;
    const y = sprite.y;
    const angle = sprite.angle;
    const pivotY = y + footOffset * scaleY;
    sprite.setPosition(x, pivotY);
    poses.push({ sprite, x, y, angle, children });
    scene.tweens.chain({
      targets: sprite,
      loop: -1,
      tweens: [
        {
          angle: angle + 12,
          x: x + 4,
          y: pivotY - 2,
          duration: 1000,
          ease: "Sine.easeInOut",
        },
        {
          angle,
          x,
          y: pivotY,
          duration: 500,
          ease: "Sine.easeInOut",
        },
        {
          angle: angle - 12,
          x: x - 4,
          y: pivotY - 2,
          duration: 1000,
          ease: "Sine.easeInOut",
        },
        {
          angle,
          x,
          y: pivotY,
          duration: 500,
          ease: "Sine.easeInOut",
        },
      ],
    });
  }

  return () => {
    for (const { sprite, x, y, angle, children } of poses) {
      scene.tweens.killTweensOf(sprite);
      if (!sprite.active || sprite.scene !== scene) {
        continue;
      }
      sprite.setPosition(x, y).setAngle(angle);
      for (const { child, y: childY } of children) {
        if (child.active) {
          child.y = childY;
        }
      }
    }
  };
}
