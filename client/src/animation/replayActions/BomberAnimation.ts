import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import type { SkinContainer } from "../../ui/PlayerSkinRenderer";
import { playRandomSound } from "../soundPlayer";

const BOMBER_SOUNDS = ["explosion_large", "explosion_medium", "explosion_small"];
const BLAST_COLOR = 0xfacc15;
const DAMAGE_TEXT_COLOR = "#f87171";

export async function animateBomberEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent,
): Promise<void> {
  const targets = event.targets ?? [];
  if (targets.length === 0) {
    return;
  }
  playRandomSound(context.scene, BOMBER_SOUNDS, { volume: 0.65 });
  const animations: Array<Promise<void>> = [];
  for (const target of targets) {
    if (!target?.targetId) {
      continue;
    }
    const sprite = context.getSprite(target.targetId);
    if (!sprite) {
      continue;
    }
    animations.push(
      animateTarget(
        context,
        target.targetId,
        sprite,
        typeof target.damageTaken === "number" ? target.damageTaken : 5,
      ),
    );
  }
  if (animations.length > 0) {
    await Promise.all(animations);
  }
}

async function animateTarget(
  context: MoveReplayContext,
  targetId: string,
  sprite: SkinContainer,
  damage: number,
): Promise<void> {
  const scene = context.scene;
  const label = context.getLabel(targetId);
  const effect = scene.add.circle(
    sprite.x,
    sprite.y,
    Math.max(14, sprite.displayWidth * 0.35),
    BLAST_COLOR,
    0.9,
  );
  effect.setDepth(sprite.depth + 1);
  context.ignoreUI(effect);

  const damageText = scene.add.text(sprite.x, sprite.y, `-${Math.round(damage)}`, {
    color: DAMAGE_TEXT_COLOR,
    fontFamily: "Montserrat, Arial, sans-serif",
    fontSize: "18px",
    fontStyle: "bold",
    stroke: "#450a0a",
    strokeThickness: 4,
  });
  damageText.setOrigin(0.5, 1);
  damageText.setDepth(sprite.depth + 2);
  context.ignoreUI(damageText);

  const startX = sprite.x;
  const startY = sprite.y;
  const tintInfo = {
    topLeft: sprite.tintTopLeft,
    topRight: sprite.tintTopRight,
    bottomLeft: sprite.tintBottomLeft,
    bottomRight: sprite.tintBottomRight,
    tinted: sprite.isTinted,
  };
  sprite.setTint(BLAST_COLOR);
  const state = { alpha: 1, offsetY: 0, scale: 0.7 };
  const follow = () => {
    effect.setPosition(sprite.x, sprite.y);
    effect.setScale(state.scale);
    damageText.setPosition(
      sprite.x,
      sprite.y - sprite.displayHeight * 0.4 + state.offsetY,
    );
    if (label) {
      context.positionLabel(label, sprite);
    }
  };
  scene.events.on("update", follow);
  follow();

  await new Promise<void>((resolve) => {
    context.tweens.add({
      targets: state,
      alpha: 0,
      offsetY: -26,
      scale: 1.8,
      duration: 560,
      ease: "Cubic.easeOut",
      onUpdate: () => {
        effect.setAlpha(state.alpha);
        damageText.setAlpha(state.alpha);
        sprite.setPosition(
          startX + (Math.random() - 0.5) * 5,
          startY + (Math.random() - 0.5) * 5,
        );
        follow();
      },
      onComplete: () => {
        scene.events.off("update", follow);
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
        effect.destroy();
        damageText.destroy();
        if (label) {
          context.positionLabel(label, sprite);
        }
        resolve();
      },
    });
  });
}
