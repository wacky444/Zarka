import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";

export async function animateTrapEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent,
): Promise<void> {
  const animations: Array<Promise<void>> = [];
  for (const target of event.targets ?? []) {
    const sprite = context.getSprite(target.targetId);
    if (!sprite) {
      continue;
    }
    const label = context.getLabel(target.targetId) ?? null;
    animations.push(
      new Promise<void>((resolve) => {
        const startX = sprite.x;
        const startY = sprite.y;
        const tintInfo = {
          topLeft: sprite.tintTopLeft,
          topRight: sprite.tintTopRight,
          bottomLeft: sprite.tintBottomLeft,
          bottomRight: sprite.tintBottomRight,
          tinted: sprite.isTinted,
        };
        sprite.setTint(0xf97373);
        context.tweens.add({
          targets: sprite,
          x: startX + 8,
          duration: 90,
          ease: "Sine.easeInOut",
          yoyo: true,
          repeat: 2,
          onUpdate: () => {
            if (label) {
              context.positionLabel(label, sprite);
            }
          },
          onComplete: () => {
            sprite.setPosition(startX, startY);
            if (tintInfo.tinted) {
              sprite.setTint(
                tintInfo.topLeft,
                tintInfo.topRight,
                tintInfo.bottomLeft,
                tintInfo.bottomRight,
              );
            } else {
              sprite.clearTint();
            }
            if (label) {
              context.positionLabel(label, sprite);
            }
            resolve();
          },
        });
      }),
    );
  }
  await Promise.all(animations);
}
