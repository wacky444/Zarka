import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";

const WOBBLE_ANGLE = 12;
const UNCONSCIOUS_TILT = -18;
const WOBBLE_DURATION = 150;
const SETTLE_DURATION = 180;

export async function animateUnconsciousEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent,
): Promise<void> {
  if (!event.actorId) {
    return;
  }
  const sprite = context.getSprite(event.actorId);
  if (!sprite) {
    return;
  }

  context.showDizzyStars?.(event.actorId);
  const label = context.getLabel(event.actorId) ?? null;
  sprite.setAngle(0);

  await new Promise<void>((resolve) => {
    context.tweens.add({
      targets: sprite,
      angle: WOBBLE_ANGLE,
      duration: WOBBLE_DURATION,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: 2,
      onUpdate: () => {
        if (label) {
          context.positionLabel(label, sprite);
        }
      },
      onComplete: () => {
        context.tweens.add({
          targets: sprite,
          angle: UNCONSCIOUS_TILT,
          duration: SETTLE_DURATION,
          ease: "Cubic.easeOut",
          onUpdate: () => {
            if (label) {
              context.positionLabel(label, sprite);
            }
          },
          onComplete: () => {
            sprite.setAngle(UNCONSCIOUS_TILT);
            if (label) {
              context.positionLabel(label, sprite);
            }
            resolve();
          },
        });
      },
    });
  });
}
