import type Phaser from "phaser";
import {
  ReplayActionEffect,
  type ReplayActionEffectMask,
  type ReplayPlayerEvent,
} from "@shared";
import { deriveBoardIconKey } from "../../ui/actionIcons";
import type { MoveReplayContext } from "../MoveReplayContext";

export const SHIELD_TEXTURE_KEY = deriveBoardIconKey("shield.png");
export const HEAL_TEXTURE_KEY = deriveBoardIconKey("suit_hearts.png");
export const FEED_TEXTURE_KEY = deriveBoardIconKey("resource_apple.png");
export const FOCUS_TEXTURE_KEY = deriveBoardIconKey("hourglass.png");

export function hasEffect(
  effects: ReplayActionEffectMask | undefined,
  effect: ReplayActionEffect
): boolean {
  if (!effects) {
    return false;
  }
  return (effects & effect) === effect;
}

export async function showGuardOverlay(
  context: MoveReplayContext,
  playerIds: string[],
  duration = 520,
  textureKey = SHIELD_TEXTURE_KEY
): Promise<void> {
  const overlays: Phaser.GameObjects.Image[] = [];
  const teardown: Array<() => void> = [];
  const scene = context.scene;
  for (const playerId of playerIds) {
    const sprite = context.getSprite(playerId);
    if (!sprite) {
      continue;
    }
    const overlay = scene.add.image(sprite.x, sprite.y, textureKey);
    overlay.setOrigin(0.5, 0.5);
    overlay.setAlpha(0);
    overlay.setDepth(sprite.depth + 1);
    overlay.setDisplaySize(
      sprite.displayWidth * 0.75,
      sprite.displayHeight * 0.75
    );
    context.ignoreUI(overlay);
    const follow = () => {
      overlay.setPosition(sprite.x, sprite.y);
    };
    follow();
    scene.events.on("update", follow);
    overlays.push(overlay);
    teardown.push(() => {
      scene.events.off("update", follow);
      overlay.destroy();
    });
    context.tweens.add({
      targets: overlay,
      alpha: { from: 0, to: 1 },
      duration: 160,
      yoyo: true,
      repeat: 1,
    });
  }
  if (overlays.length === 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    scene.time.delayedCall(duration, () => {
      teardown.forEach((fn) => fn());
      resolve();
    });
  });
}

export function collectTargetIds(event: ReplayPlayerEvent): string[] {
  const ids: string[] = [];
  if (Array.isArray(event.targets)) {
    for (const target of event.targets) {
      if (!target || !target.targetId) {
        continue;
      }
      if (ids.indexOf(target.targetId) === -1) {
        ids.push(target.targetId);
      }
    }
  }
  if (ids.length === 0 && event.actorId) {
    ids.push(event.actorId);
  }
  return ids;
}
