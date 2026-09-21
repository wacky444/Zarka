import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import type { SkinContainer } from "../../ui/PlayerSkinRenderer";
import { playRandomSound } from "../soundPlayer";

const FIRE_SOUNDS = ["hurt"];
const FIRE_COLOR = 0xf97316;
const FIRE_TEXT_COLOR = "#fb923c";

export async function animateFireDamageEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent,
): Promise<void> {
  const targets = event.targets ?? [];
  if (targets.length === 0) {
    return;
  }

  playRandomSound(context.scene, FIRE_SOUNDS, { volume: 0.55 });
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
      animateTarget(context, target.targetId, sprite, target.damageTaken),
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
  damageTaken: number | undefined,
): Promise<void> {
  const scene = context.scene;
  const label = context.getLabel(targetId);
  const damage =
    typeof damageTaken === "number" && damageTaken > 0
      ? Math.round(damageTaken)
      : 2;
  const effect = scene.add.circle(
    sprite.x,
    sprite.y,
    Math.max(12, sprite.displayWidth * 0.3),
    FIRE_COLOR,
    0.8,
  );
  effect.setDepth(sprite.depth + 1);
  context.ignoreUI(effect);

  const damageText = scene.add.text(sprite.x, sprite.y, `-${damage}`, {
    color: FIRE_TEXT_COLOR,
    fontFamily: "Montserrat, Arial, sans-serif",
    fontSize: "18px",
    fontStyle: "bold",
    stroke: "#431407",
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
  sprite.setTint(FIRE_COLOR);

  const animationState = { alpha: 1, offsetY: 0 };
  const follow = () => {
    effect.setPosition(sprite.x, sprite.y);
    damageText.setPosition(
      sprite.x,
      sprite.y - sprite.displayHeight * 0.4 + animationState.offsetY,
    );
    if (label) {
      context.positionLabel(label, sprite);
    }
  };
  scene.events.on("update", follow);
  follow();

  await new Promise<void>((resolve) => {
    context.tweens.add({
      targets: animationState,
      alpha: 0,
      offsetY: -24,
      duration: 520,
      ease: "Cubic.easeOut",
      onUpdate: () => {
        effect.setAlpha(animationState.alpha);
        damageText.setAlpha(animationState.alpha);
        sprite.setPosition(
          startX + (Math.random() - 0.5) * 4,
          startY + (Math.random() - 0.5) * 4,
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
