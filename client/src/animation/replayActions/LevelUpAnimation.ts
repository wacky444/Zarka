import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { playRandomSound } from "../soundPlayer";

const FIREWORK_COLORS = [0xfacc15, 0x4ade80, 0x60a5fa, 0xf472b6, 0xffffff];

export async function animateLevelUpEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const actorId = event.actorId;
  if (!actorId) return;
  const sprite = context.getSprite(actorId) ??
    context.ensureSprite?.(actorId, event.action.targetLocation ?? event.action.originLocation);
  if (!sprite) return;

  playRandomSound(context.scene, "8_bit_chime_positive");

  const centerX = sprite.x;
  const centerY = sprite.y - 22;
  const stars = Array.from({ length: 10 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 10;
    const color = FIREWORK_COLORS[index % FIREWORK_COLORS.length];
    const star = context.scene.add.star(centerX, centerY, 4, 1.5, 4, color);
    star.setDepth(sprite.depth + 20).setAlpha(1).setScale(0.3);
    context.ignoreUI(star);
    return new Promise<void>((resolve) => {
      context.tweens.add({
        targets: star,
        x: centerX + Math.cos(angle) * 25,
        y: centerY + Math.sin(angle) * 22,
        alpha: 0,
        scale: 1,
        duration: 520,
        delay: index * 12,
        ease: "Cubic.Out",
        onComplete: () => {
          star.destroy();
          resolve();
        },
      });
    });
  });
  await Promise.all(stars);
}
