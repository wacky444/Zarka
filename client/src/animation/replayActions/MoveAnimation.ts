import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";

export async function animateMoveEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const sprite = context.getSprite(event.actorId);
  if (!sprite) {
    return;
  }
  const label = context.getLabel(event.actorId) ?? null;
  const origin = event.action.originLocation;
  if (origin) {
    const originWorld = context.axialToWorld(origin);
    sprite.setPosition(originWorld.x, originWorld.y);
    if (label) {
      context.positionLabel(label, sprite);
    }
  }
  const targetCoord =
    event.action.targetLocation ??
    context.currentMatch?.playerCharacters?.[event.actorId]?.position?.coord ??
    null;
  if (!targetCoord) {
    return;
  }
  const targetWorld = context.axialToWorld(targetCoord);
  await new Promise<void>((resolve) => {
    context.tweens.add({
      targets: sprite,
      x: targetWorld.x,
      y: targetWorld.y,
      duration: 450,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        if (label) {
          context.positionLabel(label, sprite);
        }
      },
      onComplete: () => {
        if (label) {
          context.positionLabel(label, sprite);
        }
        resolve();
      },
    });
  });
}
