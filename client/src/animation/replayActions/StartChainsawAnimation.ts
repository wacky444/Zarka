import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { ACTION_SOUNDS, playRandomSound } from "../soundPlayer";

export async function animateStartChainsawEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const sprite = context.getSprite(event.actorId);
  if (!sprite) {
    return;
  }
  const label = context.getLabel(event.actorId) ?? null;

  playRandomSound(context.scene, ACTION_SOUNDS.start_chainsaw);

  await new Promise<void>((resolve) => {
    const startX = sprite.x;
    const startY = sprite.y;
    const startAngle = sprite.angle;
    const startTime = context.scene.time.now;
    const duration = 900;
    const jitterAmount = 3.5;

    const timerEvent = context.scene.time.addEvent({
      delay: 25,
      repeat: Math.floor(duration / 25),
      callback: () => {
        const elapsed = context.scene.time.now - startTime;
        if (elapsed >= duration) {
          timerEvent.remove();
          sprite.setPosition(startX, startY);
          sprite.setAngle(startAngle);
          if (label) {
            context.positionLabel(label, sprite);
          }
          resolve();
          return;
        }

        const offsetX = (Math.random() * 2 - 1) * jitterAmount;
        const offsetY = (Math.random() * 2 - 1) * (jitterAmount * 0.5);
        const offsetAngle = (Math.random() * 2 - 1) * 2.5;

        sprite.setPosition(startX + offsetX, startY + offsetY);
        sprite.setAngle(startAngle + offsetAngle);
        if (label) {
          context.positionLabel(label, sprite);
        }
      },
    });
  });
}
