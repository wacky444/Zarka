import type Phaser from "phaser";
import {
  ActionLibrary,
  ItemLibrary,
  ReplayActionEffect,
  type Axial,
  type ItemId,
  type MatchRecord,
  type ReplayActionEffectMask,
  type ReplayEvent,
  type ReplayPlayerEvent,
} from "@shared";
import { deriveBoardIconKey } from "../ui/actionIcons";
import { resolveItemTexture } from "../ui/itemIcons";

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
const HEAL_TEXTURE_KEY = deriveBoardIconKey("suit_hearts.png");
const FEED_TEXTURE_KEY = deriveBoardIconKey("resource_apple.png");
const SEARCH_TEXTURE_KEY = deriveBoardIconKey("cards_seek.png");

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
    } else if (actionId === ActionLibrary.scare.id) {
      await animateScareEvent(context, event);
    } else if (actionId === ActionLibrary.use_bandage.id) {
      await animateUseBandageEvent(context, event);
    } else if (actionId === ActionLibrary.sleep.id) {
      await animateSleepEvent(context, event);
    } else if (actionId === ActionLibrary.recover.id) {
      await animateRecoverEvent(context, event);
    } else if (actionId === ActionLibrary.feed.id) {
      await animateFeedEvent(context, event);
    } else if (actionId === ActionLibrary.protect.id) {
      await animateProtectEvent(context, event);
    } else if (actionId === ActionLibrary.punch.id) {
      await animatePunchEvent(context, event);
    } else if (actionId === ActionLibrary.search.id) {
      await animateSearchEvent(context, event);
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

function readMetadataAxial(value: unknown): Axial | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as { q?: unknown; r?: unknown };
  if (typeof candidate.q !== "number" || typeof candidate.r !== "number") {
    return null;
  }
  return { q: candidate.q, r: candidate.r };
}

async function animateScareEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targets = event.targets ?? [];
  if (targets.length === 0) {
    return;
  }
  const animations: Array<Promise<void>> = [];
  for (const target of targets) {
    if (!target?.targetId) {
      continue;
    }
    const sprite = context.getSprite(target.targetId);
    if (!sprite) {
      continue;
    }
    const label = context.getLabel(target.targetId) ?? null;
    const metadata = target.metadata as
      | undefined
      | { movedFrom?: unknown; movedTo?: unknown };
    const fromCoord = readMetadataAxial(metadata?.movedFrom);
    const toCoord = readMetadataAxial(metadata?.movedTo);
    if (!toCoord) {
      continue;
    }
    if (fromCoord) {
      const originWorld = context.axialToWorld(fromCoord);
      sprite.setPosition(originWorld.x, originWorld.y);
      if (label) {
        context.positionLabel(label, sprite);
      }
    }
    const targetWorld = context.axialToWorld(toCoord);
    animations.push(
      new Promise<void>((resolve) => {
        context.tweens.add({
          targets: sprite,
          x: targetWorld.x,
          y: targetWorld.y,
          duration: 420,
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
      })
    );
  }
  if (animations.length === 0) {
    return;
  }
  await Promise.all(animations);
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

type ReplaySearchItemMetadata = {
  id: string | null;
  itemType: ItemId | null;
};

function parseSearchMetadata(
  metadata: unknown,
  match: MatchRecord | null,
  fallbackIds: string[]
): ReplaySearchItemMetadata[] {
  const entries: ReplaySearchItemMetadata[] = [];
  const meta = (metadata ?? {}) as
    | {
        discoveredItems?: unknown;
        discoveredItemIds?: unknown;
      }
    | undefined;
  const discoveredItems = Array.isArray(meta?.discoveredItems)
    ? (meta?.discoveredItems as unknown[])
    : [];
  for (const entry of discoveredItems) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const data = entry as { id?: unknown; itemType?: unknown };
    const id = typeof data.id === "string" ? data.id : null;
    const itemType =
      typeof data.itemType === "string" ? (data.itemType as ItemId) : null;
    entries.push({ id, itemType });
  }
  if (entries.length > 0) {
    return entries;
  }
  const fromIds = Array.isArray(meta?.discoveredItemIds)
    ? meta?.discoveredItemIds
    : fallbackIds;
  const items = Array.isArray(fromIds) ? fromIds : [];
  if (!match?.items) {
    return items.map((id) => ({
      id: typeof id === "string" ? id : null,
      itemType: null,
    }));
  }
  return items.map((entry) => {
    const id = typeof entry === "string" ? entry : null;
    const matchEntry = id
      ? match.items?.find((record) => record.item_id === id)
      : undefined;
    return {
      id,
      itemType: matchEntry?.item_type ?? null,
    };
  });
}

function resolveItemVisual(
  itemType: ItemId | null
): { texture: string; frame?: string } | null {
  if (!itemType) {
    return null;
  }
  const definition = ItemLibrary[itemType as keyof typeof ItemLibrary];
  if (!definition) {
    return null;
  }
  return resolveItemTexture(definition);
}

function resolveItemLabel(itemType: ItemId | null): string {
  if (!itemType) {
    return "?";
  }
  const definition = ItemLibrary[itemType as keyof typeof ItemLibrary];
  if (!definition) {
    return itemType;
  }
  return definition.name ?? itemType;
}

async function animateSearchEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const sprite = context.getSprite(event.actorId) ?? null;
  const match = context.currentMatch;
  const coord =
    event.action.targetLocation ??
    event.action.originLocation ??
    match?.playerCharacters?.[event.actorId]?.position?.coord ??
    null;
  if (!coord && !sprite) {
    return;
  }
  const scene = context.scene;
  const base = sprite
    ? { x: sprite.x, y: sprite.y }
    : coord
    ? context.axialToWorld(coord)
    : { x: 0, y: 0 };
  const baseDepth = sprite ? sprite.depth + 1 : 10;

  const items = parseSearchMetadata(event.action.metadata, match, []);

  const overlays: Phaser.GameObjects.GameObject[] = [];

  const indicator = scene.add.image(base.x, base.y, SEARCH_TEXTURE_KEY);
  indicator.setOrigin(0.5, 0.5);
  indicator.setAlpha(0);
  indicator.setScale(0.8);
  indicator.setDepth(baseDepth);
  context.ignoreUI(indicator);
  overlays.push(indicator);

  await new Promise<void>((resolve) => {
    context.tweens.add({
      targets: indicator,
      alpha: 1,
      scale: 1,
      duration: 200,
      ease: "Sine.easeOut",
      onComplete: () => resolve(),
    });
  });

  const verticalSpacing = 26;
  const startY = base.y - 32;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const y = startY - index * verticalSpacing;
    const depth = baseDepth + index + 1;
    const visual = resolveItemVisual(item.itemType);
    let node: Phaser.GameObjects.GameObject;
    if (
      visual &&
      scene.textures.exists(visual.texture) &&
      (!visual.frame || scene.textures.getFrame(visual.texture, visual.frame))
    ) {
      const image = scene.add.image(base.x, y, visual.texture, visual.frame);
      image.setAlpha(0);
      image.setOrigin(0.5, 0.5);
      image.setDepth(depth);
      image.setScale(0.9);
      context.ignoreUI(image);
      node = image;
    } else {
      const label = scene.add.text(base.x, y, resolveItemLabel(item.itemType), {
        fontSize: "16px",
        color: "#ffffff",
        fontFamily: "Montserrat, Arial, sans-serif",
      });
      label.setOrigin(0.5, 0.5);
      label.setAlpha(0);
      label.setDepth(depth);
      context.ignoreUI(label);
      node = label;
    }
    overlays.push(node);

    await new Promise<void>((resolve) => {
      context.tweens.add({
        targets: node,
        alpha: 1,
        duration: 220,
        ease: "Sine.easeOut",
        onComplete: () => resolve(),
      });
    });
  }

  await new Promise<void>((resolve) => {
    scene.time.delayedCall(650, resolve);
  });

  await new Promise<void>((resolve) => {
    context.tweens.add({
      targets: overlays,
      alpha: 0,
      duration: 200,
      ease: "Sine.easeIn",
      onComplete: () => {
        overlays.forEach((overlay) => overlay.destroy());
        resolve();
      },
    });
  });
}

async function animateProtectEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targets = collectTargetIds(event);
  await showGuardOverlay(context, targets);
}

async function animateSleepEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targets = collectTargetIds(event);
  await showGuardOverlay(context, targets, 520, HEAL_TEXTURE_KEY);
}

async function animateRecoverEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targets = collectTargetIds(event);
  await showGuardOverlay(context, targets, 520, HEAL_TEXTURE_KEY);
}

async function animateUseBandageEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targets = collectTargetIds(event);
  if (targets.length === 0) {
    return;
  }
  await showGuardOverlay(context, targets, 520, HEAL_TEXTURE_KEY);
}

async function animateFeedEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targets = collectTargetIds(event);
  await showGuardOverlay(context, targets, 520, FEED_TEXTURE_KEY);
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
