import type { Axial } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";

const DESTRUCTION_DURATION = 560;
const FLASH_COLOR = 0xf97316;
const RING_COLOR = 0xfacc15;
const DEBRIS_COLOR = 0x94a3b8;

export async function animateTileDestroyedEvent(
  context: MoveReplayContext,
  cell: Axial
): Promise<void> {
  const worldPosition = context.axialToWorld(cell);
  const flash = context.scene.add
    .circle(worldPosition.x, worldPosition.y, 24, FLASH_COLOR)
    .setAlpha(0.9)
    .setDepth(20);
  const ring = context.scene.add
    .circle(worldPosition.x, worldPosition.y, 22)
    .setFillStyle(0, 0)
    .setStrokeStyle(5, RING_COLOR, 0.95)
    .setDepth(21);
  const debris = Array.from({ length: 8 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 8;
    const piece = context.scene.add
      .rectangle(
        worldPosition.x,
        worldPosition.y,
        7,
        7,
        DEBRIS_COLOR,
        0.95
      )
      .setAngle((index * 37) % 180)
      .setDepth(22);
    return {
      piece,
      targetX: worldPosition.x + Math.cos(angle) * 42,
      targetY: worldPosition.y + Math.sin(angle) * 42
    };
  });
  const effectObjects = [flash, ring, ...debris.map(({ piece }) => piece)];
  for (const effect of effectObjects) {
    context.ignoreUI(effect);
  }

  return new Promise<void>((resolve) => {
    let remaining = debris.length + 1;
    const finish = () => {
      remaining -= 1;
      if (remaining > 0) {
        return;
      }
      for (const effect of effectObjects) {
        effect.destroy();
      }
      resolve();
    };

    context.tweens.add({
      targets: [flash, ring],
      scaleX: 2.4,
      scaleY: 2.4,
      alpha: 0,
      duration: DESTRUCTION_DURATION,
      ease: "Cubic.easeOut",
      onComplete: finish
    });
    for (const { piece, targetX, targetY } of debris) {
      context.tweens.add({
        targets: piece,
        x: targetX,
        y: targetY,
        angle: piece.angle + 180,
        alpha: 0,
        duration: DESTRUCTION_DURATION,
        ease: "Cubic.easeOut",
        onComplete: finish
      });
    }
  });
}
