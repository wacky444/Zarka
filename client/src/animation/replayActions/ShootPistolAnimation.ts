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
  const metadata = event.action.metadata as
    | { weaponUsed?: unknown; bulletsConsumed?: unknown }
    | undefined;
  const isSuppressed = metadata?.weaponUsed === "suppressed_pistol";
  const bulletsConsumed =
    typeof metadata?.bulletsConsumed === "number" &&
    Number.isFinite(metadata.bulletsConsumed)
      ? Math.max(1, Math.floor(metadata.bulletsConsumed))
      : Math.max(1, event.targets?.length ?? 0);
  for (let shot = 0; shot < bulletsConsumed; shot += 1) {
    playRandomSound(
      context.scene,
      isSuppressed ? SUPPRESSED_PISTOL_SOUNDS : PISTOL_SOUNDS
    );
  }

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

  for (const target of event.targets ?? []) {
    if (!target?.targetId) {
      continue;
    }
    const sprite = context.getSprite(target.targetId);
    if (!sprite) {
      continue;
    }
    const label = context.getLabel(target.targetId) ?? null;
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
    const animation = new Promise<void>((resolve) => {
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
    });
    const guardAnimation = hasEffect(
      target.effects,
      ReplayActionEffect.Guard
    )
      ? showGuardOverlay(context, [target.targetId], 420)
      : null;
    if (guardAnimation) {
      await Promise.all([animation, guardAnimation]);
    } else {
      await animation;
    }
  }
}
