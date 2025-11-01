import type Phaser from "phaser";
import { type ItemId, type ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { resolveItemLabel, resolveItemVisual } from "./ItemVisuals";

const PICKUP_TRAIL_DURATION = 420;

type ReplayPickUpItemMetadata = {
  id: string | null;
  itemType: ItemId | null;
};

function parsePickUpMetadata(metadata: unknown): ReplayPickUpItemMetadata[] {
  const meta = (metadata ?? {}) as
    | {
        pickedItems?: unknown;
        pickedItemIds?: unknown;
      }
    | undefined;
  const pickedItems = Array.isArray(meta?.pickedItems)
    ? (meta?.pickedItems as unknown[])
    : [];
  const entries: ReplayPickUpItemMetadata[] = [];
  for (const entry of pickedItems) {
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
  const ids = Array.isArray(meta?.pickedItemIds) ? meta?.pickedItemIds : [];
  return ids
    .filter((value): value is string => typeof value === "string")
    .map((id) => ({ id, itemType: null }));
}

export async function animatePickUpEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const items = parsePickUpMetadata(event.action.metadata);
  if (items.length === 0) {
    return;
  }

  const actorSprite = context.getSprite(event.actorId) ?? null;
  const originCoord =
    event.action.originLocation ??
    event.action.targetLocation ??
    context.currentMatch?.playerCharacters?.[event.actorId]?.position?.coord ??
    null;

  if (!originCoord && !actorSprite) {
    return;
  }

  const originWorld = originCoord
    ? context.axialToWorld(originCoord)
    : actorSprite
    ? { x: actorSprite.x, y: actorSprite.y }
    : { x: 0, y: 0 };
  const destination = actorSprite
    ? { x: actorSprite.x, y: actorSprite.y, depth: actorSprite.depth + 1 }
    : { x: originWorld.x, y: originWorld.y, depth: 10 };

  const scene = context.scene;
  const promises: Array<Promise<void>> = [];
  const maxVisuals = Math.min(items.length, 3);
  const angleStep = maxVisuals > 1 ? Math.PI / 3 / (maxVisuals - 1) : 0;
  const baseAngle = -((maxVisuals - 1) * angleStep) / 2;

  for (let index = 0; index < maxVisuals; index += 1) {
    const item = items[index];
    const visual = resolveItemVisual(item.itemType);
    const angle = baseAngle + index * angleStep;
    const startX = originWorld.x + Math.cos(angle) * 18;
    const startY = originWorld.y + Math.sin(angle) * 18;
    const depth = destination.depth + index;
    let node: Phaser.GameObjects.GameObject;
    let startScale = 0.85;
    if (
      visual &&
      scene.textures.exists(visual.texture) &&
      (!visual.frame || scene.textures.getFrame(visual.texture, visual.frame))
    ) {
      const image = scene.add.image(
        startX,
        startY,
        visual.texture,
        visual.frame
      );
      image.setDepth(depth);
      image.setScale(startScale);
      image.setAlpha(0);
      context.ignoreUI(image);
      node = image;
    } else {
      const label = scene.add.text(
        startX,
        startY,
        resolveItemLabel(item.itemType),
        {
          fontSize: "14px",
          color: "#ffffff",
          fontFamily: "Montserrat, Arial, sans-serif",
          stroke: "#000000",
          strokeThickness: 3,
        }
      );
      label.setOrigin(0.5, 0.5);
      label.setAlpha(0);
      label.setDepth(depth);
      context.ignoreUI(label);
      node = label;
      startScale = 1;
    }
    promises.push(
      new Promise<void>((resolve) => {
        context.tweens.add({
          targets: node,
          x: destination.x,
          y: destination.y,
          alpha: { from: 0, to: 1 },
          scale: { from: startScale, to: 0.4 },
          duration: PICKUP_TRAIL_DURATION,
          ease: "Sine.easeIn",
          onComplete: () => {
            node.destroy();
            resolve();
          },
        });
      })
    );
  }

  if (promises.length > 0) {
    await Promise.all(promises);
  }
}
