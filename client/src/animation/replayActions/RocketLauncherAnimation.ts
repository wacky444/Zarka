import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { playRandomSound } from "../soundPlayer";

const ROCKET_SOUNDS = ["explosion_large", "explosion_medium", "explosion_small"];
const EXPLOSION_DURATION = 520;

export async function animateRocketLauncherEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent,
): Promise<void> {
  playRandomSound(context.scene, ROCKET_SOUNDS);
  const target = event.action.targetLocation;
  if (!target) {
    return;
  }

  const position = context.axialToWorld(target);
  const flash = context.scene.add
    .circle(position.x, position.y, 24, 0xf97316, 0.9)
    .setDepth(25);
  const ring = context.scene.add
    .circle(position.x, position.y, 20)
    .setFillStyle(0, 0)
    .setStrokeStyle(5, 0xfef08a, 1)
    .setDepth(26);
  const debris = Array.from({ length: 10 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 10;
    const piece = context.scene.add
      .rectangle(position.x, position.y, 8, 8, 0xfbbf24, 1)
      .setDepth(27);
    return {
      piece,
      targetX: position.x + Math.cos(angle) * 56,
      targetY: position.y + Math.sin(angle) * 56,
    };
  });
  const effects = [flash, ring, ...debris.map((entry) => entry.piece)];
  for (const effect of effects) {
    context.ignoreUI(effect);
  }

  await new Promise<void>((resolve) => {
    let completed = 0;
    const finish = () => {
      completed += 1;
      if (completed < debris.length + 1) {
        return;
      }
      for (const effect of effects) {
        effect.destroy();
      }
      resolve();
    };

    context.tweens.add({
      targets: [flash, ring],
      scaleX: 2.4,
      scaleY: 2.4,
      alpha: 0,
      duration: EXPLOSION_DURATION,
      ease: "Cubic.easeOut",
      onComplete: finish,
    });
    for (const debrisEntry of debris) {
      context.tweens.add({
        targets: debrisEntry.piece,
        x: debrisEntry.targetX,
        y: debrisEntry.targetY,
        angle: 180,
        alpha: 0,
        duration: EXPLOSION_DURATION,
        ease: "Cubic.easeOut",
        onComplete: finish,
      });
    }
  });
}
