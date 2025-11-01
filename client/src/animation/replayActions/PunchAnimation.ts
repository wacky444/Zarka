import { ReplayActionEffect, type ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { hasEffect, showGuardOverlay } from "./GuardOverlay";

export async function animatePunchEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targets = event.targets ?? [];
  if (!targets || targets.length === 0) {
    return;
  }
  const attackerSprite = context.getSprite(event.actorId) ?? null;
  const animations: Array<Promise<void>> = [];
  const guardedIds: string[] = [];
  for (const target of targets) {
    if (!target?.targetId) {
      continue;
    }
    const sprite = context.getSprite(target.targetId);
    if (!sprite) {
      continue;
    }
    const label = context.getLabel(target.targetId) ?? null;
    if (hasEffect(target.effects, ReplayActionEffect.Guard)) {
      guardedIds.push(target.targetId);
    }
    const baseOffset = 18;
    let offsetX = 0;
    let offsetY = -baseOffset;
    if (attackerSprite) {
      const dx = sprite.x - attackerSprite.x;
      const dy = sprite.y - attackerSprite.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length > 0.0001) {
        const scale = baseOffset / length;
        offsetX = dx * scale;
        offsetY = dy * scale;
      }
    }
    animations.push(
      new Promise<void>((resolve) => {
        const startX = sprite.x;
        const startY = sprite.y;
        context.tweens.add({
          targets: sprite,
          x: startX + offsetX,
          y: startY + offsetY,
          duration: 140,
          ease: "Sine.easeOut",
          yoyo: true,
          onUpdate: () => {
            if (label) {
              context.positionLabel(label, sprite);
            }
          },
          onComplete: () => {
            sprite.setPosition(startX, startY);
            if (label) {
              context.positionLabel(label, sprite);
            }
            resolve();
          },
        });
      })
    );
  }
  if (animations.length === 0) {
    return;
  }
  const guardPromise =
    guardedIds.length > 0 ? showGuardOverlay(context, guardedIds, 420) : null;
  if (guardPromise) {
    await Promise.all([...animations, guardPromise]);
  } else {
    await Promise.all(animations);
  }
}
