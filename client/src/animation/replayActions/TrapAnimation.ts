import type { Axial, ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";

const PLACEMENT_DURATION = 520;

function isPlacedTrapEvent(event: ReplayPlayerEvent): boolean {
  return event.action.metadata?.placed === true;
}

function animateTrapPlacement(
  context: MoveReplayContext,
  origin: Axial,
  destination: Axial,
): Promise<void> {
  const from = context.axialToWorld(origin);
  const to = context.axialToWorld(destination);
  const midpoint = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  };
  const line = context.scene.add.graphics().setDepth(20);
  line.lineStyle(5, 0xf97316, 0.9);
  line.beginPath();
  line.moveTo(from.x, from.y);
  line.lineTo(to.x, to.y);
  line.strokePath();
  const marker = context.scene.add
    .circle(midpoint.x, midpoint.y, 9, 0xf97316, 1)
    .setDepth(21);
  const ring = context.scene.add
    .circle(midpoint.x, midpoint.y, 13)
    .setFillStyle(0, 0)
    .setStrokeStyle(3, 0xfde68a, 0.95)
    .setDepth(22);
  const effectObjects = [line, marker, ring];
  for (const effect of effectObjects) {
    context.ignoreUI(effect);
  }

  return new Promise<void>((resolve) => {
    context.tweens.add({
      targets: marker,
      scaleX: 1.55,
      scaleY: 1.55,
      alpha: 0,
      duration: PLACEMENT_DURATION,
      ease: "Cubic.easeOut",
    });
    context.tweens.add({
      targets: [line, ring],
      alpha: 0,
      duration: PLACEMENT_DURATION,
      ease: "Cubic.easeInOut",
      onComplete: () => {
        for (const effect of effectObjects) {
          effect.destroy();
        }
        resolve();
      },
    });
  });
}

export async function animateTrapEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent,
): Promise<void> {
  if (
    isPlacedTrapEvent(event) &&
    event.action.originLocation &&
    event.action.targetLocation
  ) {
    await animateTrapPlacement(
      context,
      event.action.originLocation,
      event.action.targetLocation,
    );
    return;
  }

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
