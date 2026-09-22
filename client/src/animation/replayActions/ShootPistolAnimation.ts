import { ReplayActionEffect, type ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { hasEffect, showGuardOverlay } from "./GuardOverlay";
import { playRandomSound } from "../soundPlayer";

const PISTOL_SOUNDS = ["shot_muffled", "explosion_small", "air_burst"];
const SUPPRESSED_PISTOL_SOUNDS = ["shot_muffled", "air_burst"];

export async function animateShootPistolEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const isSuppressed =
    (event.action.metadata as { weaponUsed?: string } | undefined)
      ?.weaponUsed === "suppressed_pistol";
  playRandomSound(
    context.scene,
    isSuppressed ? SUPPRESSED_PISTOL_SOUNDS : PISTOL_SOUNDS
  );

  const attackerSprite = context.getSprite(event.actorId) ?? null;
  if (attackerSprite) {
    context.tweens.add({
      targets: attackerSprite,
      scaleX: attackerSprite.scaleX * 1.08,
      scaleY: attackerSprite.scaleY * 1.08,
      duration: 70,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  const targets = event.targets ?? [];
  if (targets.length === 0) {
    return;
  }

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
    const isDodged = hasEffect(target.effects, ReplayActionEffect.Dodged);
    const baseOffset = isDodged ? 32 : 24;
    let offsetX = 0;
    let offsetY = -baseOffset;
    if (attackerSprite) {
      const dx = sprite.x - attackerSprite.x;
      const dy = sprite.y - attackerSprite.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length > 0.0001) {
        const scale = baseOffset / length;
        offsetX = isDodged ? -dy * (scale * 0.7) : dx * scale;
        offsetY = isDodged ? dx * (scale * 0.7) : dy * scale;
      }
    }
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
        if (!isDodged) {
          sprite.setTint(0xf87171);
        }
        context.tweens.add({
          targets: sprite,
          x: startX + offsetX,
          y: startY + offsetY,
          duration: isDodged ? 200 : 140,
          ease: "Sine.easeOut",
          yoyo: true,
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
                tintInfo.bottomRight
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
