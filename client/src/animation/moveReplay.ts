import type Phaser from "phaser";
import {
  ActionLibrary,
  ReplayActionEffect,
  type Axial,
  type MatchRecord,
  type ReplayActionEffectMask,
  type ReplayEvent,
  type ReplayPlayerEvent,
} from "@shared";
import { deriveBoardIconKey } from "../ui/actionIcons";

export interface MoveReplayContext {
  tweens: Phaser.Tweens.TweenManager;
  axialToWorld: (coord: Axial) => { x: number; y: number };
  getSprite: (playerId: string) => Phaser.GameObjects.Image | undefined;
  getLabel: (playerId: string) => Phaser.GameObjects.Text | undefined;
  positionLabel: (
    label: Phaser.GameObjects.Text,
    sprite: Phaser.GameObjects.Image
  ) => void;
  currentMatch: MatchRecord | null;
  scene: Phaser.Scene;
  ignoreUI: (object: Phaser.GameObjects.GameObject) => void;
}

const SHIELD_TEXTURE_KEY = deriveBoardIconKey("shield.png");

export async function playReplayEvents(
  context: MoveReplayContext,
  events: ReplayEvent[]
): Promise<void> {
  for (const event of events) {
    if (event.kind !== "player") {
      continue;
    }
    const actionId = event.action.actionId;
    if (actionId === ActionLibrary.move.id) {
      await animateMoveEvent(context, event);
    } else if (actionId === ActionLibrary.protect.id) {
      await animateProtectEvent(context, event);
    } else if (actionId === ActionLibrary.punch.id) {
      await animatePunchEvent(context, event);
    }
  }
}

async function animateMoveEvent(
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

function hasEffect(
  effects: ReplayActionEffectMask | undefined,
  effect: ReplayActionEffect
): boolean {
  if (!effects) {
    return false;
  }
  return (effects & effect) === effect;
}

async function showGuardOverlay(
  context: MoveReplayContext,
  playerIds: string[],
  duration = 520
): Promise<void> {
  const overlays: Phaser.GameObjects.Image[] = [];
  const teardown: Array<() => void> = [];
  const scene = context.scene;
  for (const playerId of playerIds) {
    const sprite = context.getSprite(playerId);
    if (!sprite) {
      continue;
    }
    const overlay = scene.add.image(sprite.x, sprite.y, SHIELD_TEXTURE_KEY);
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

function collectTargetIds(event: ReplayPlayerEvent): string[] {
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

async function animateProtectEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targets = collectTargetIds(event);
  await showGuardOverlay(context, targets);
}

async function animatePunchEvent(
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
