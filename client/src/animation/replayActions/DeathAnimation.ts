import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { playRandomSound } from "../soundPlayer";

const DEATH_SOUNDS = ["lose", "8_bit_defeated", "hurt"];

export async function animateDeathEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  if (!event.actorId) {
    return;
  }
  const sprite = context.getSprite(event.actorId);
  if (!sprite) {
    return;
  }
  playRandomSound(context.scene, DEATH_SOUNDS);
  const label = context.getLabel(event.actorId) ?? null;
  const alreadyProne = sprite.angle <= -80 || sprite.angle >= 80;
  const targetAngle = alreadyProne ? sprite.angle : -90;
  await new Promise<void>((resolve) => {
    context.tweens.add({
      targets: sprite,
      angle: targetAngle,
      duration: 260,
      ease: "Cubic.easeOut",
      onUpdate: () => {
        if (label) {
          context.positionLabel(label, sprite);
        }
      },
      onComplete: () => {
        sprite.setAngle(targetAngle);
        if (label) {
          context.positionLabel(label, sprite);
        }
        resolve();
      },
    });
  });
}
