import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { playRandomSound } from "../soundPlayer";

const MOVE_SOUNDS = [
  "foley_footstep_concrete_1",
  "foley_footstep_concrete_2",
  "foley_footstep_concrete_3",
  "foley_footstep_concrete_4",
];

export async function animateMoveEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const origin = event.action.originLocation;
  const targetCoord =
    event.action.targetLocation ??
    context.currentMatch?.playerCharacters?.[event.actorId]?.position?.coord ??
    null;
  let sprite = context.getSprite(event.actorId);
  if (!sprite && context.ensureSprite) {
    sprite = context.ensureSprite(
      event.actorId,
      origin ?? targetCoord ?? undefined
    );
  }
  if (!sprite) {
    return;
  }
  const label = context.getLabel(event.actorId) ?? null;
  if (origin) {
    const originWorld = context.axialToWorld(origin);
    sprite.setPosition(originWorld.x, originWorld.y);
    if (label) {
      context.positionLabel(label, sprite);
    }
  }
  if (!targetCoord) {
    return;
  }
  const targetWorld = context.axialToWorld(targetCoord);
  playRandomSound(context.scene, MOVE_SOUNDS);
  await new Promise<void>((resolve) => {
    context.tweens.add({
      targets: sprite,
      x: targetWorld.x,
      y: targetWorld.y,
      duration: 450,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        sprite.setDepth(5 + sprite.y / 1000);
        if (label) {
          context.positionLabel(label, sprite);
        }
      },
      onComplete: () => {
        sprite.setDepth(5 + sprite.y / 1000);
        if (label) {
          context.positionLabel(label, sprite);
        }
        resolve();
      },
    });
  });
}
