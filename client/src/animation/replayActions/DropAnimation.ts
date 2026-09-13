import type Phaser from "phaser";
import { type ItemId, type ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { resolveItemLabel, resolveItemVisual } from "./ItemVisuals";

const DROP_ANIMATION_DURATION = 420;

type ReplayDropItemMetadata = {
  itemType: ItemId | null;
};

function parseDropMetadata(metadata: unknown): {
  items: ReplayDropItemMetadata[];
  isSell: boolean;
} {
  const meta = (metadata ?? {}) as
    | {
        droppedItems?: unknown;
        sellInstead?: unknown;
      }
    | undefined;
  const isSell = meta?.sellInstead === true;
  const droppedItems = Array.isArray(meta?.droppedItems)
    ? (meta?.droppedItems as unknown[])
    : [];
  const items: ReplayDropItemMetadata[] = [];
  for (const entry of droppedItems) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const data = entry as { itemType?: unknown };
    const itemType =
      typeof data.itemType === "string" ? (data.itemType as ItemId) : null;
    items.push({ itemType });
  }
  return { items, isSell };
}

export async function animateDropEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const { items, isSell } = parseDropMetadata(event.action.metadata);
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

  const actorWorld = actorSprite
    ? { x: actorSprite.x, y: actorSprite.y, depth: actorSprite.depth + 1 }
    : originCoord
    ? { ...context.axialToWorld(originCoord), depth: 10 }
    : { x: 0, y: 0, depth: 10 };

  const scene = context.scene;
  const promises: Array<Promise<void>> = [];
  const maxVisuals = Math.min(items.length, 3);
  const angleStep = maxVisuals > 1 ? Math.PI / 3 / (maxVisuals - 1) : 0;
  const baseAngle = -((maxVisuals - 1) * angleStep) / 2;

  for (let index = 0; index < maxVisuals; index += 1) {
    const item = items[index];
    const visual = resolveItemVisual(item.itemType);
    const depth = actorWorld.depth + index;
    const startX = actorWorld.x;
    const startY = actorWorld.y;

    const angle = baseAngle + index * angleStep;
    const targetX = isSell
      ? startX + (index - (maxVisuals - 1) / 2) * 16
      : startX + Math.cos(angle) * 22;
    const targetY = isSell ? startY - 36 : startY + 20 + Math.sin(angle) * 8;

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
      image.setAlpha(1);
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
      label.setAlpha(1);
      label.setDepth(depth);
      context.ignoreUI(label);
      node = label;
      startScale = 1;
    }

    promises.push(
      new Promise<void>((resolve) => {
        context.tweens.add({
          targets: node,
          x: targetX,
          y: targetY,
          alpha: { from: 1, to: isSell ? 0 : 0.85 },
          scale: { from: startScale, to: isSell ? startScale * 1.2 : 0.5 },
          duration: DROP_ANIMATION_DURATION,
          ease: isSell ? "Sine.easeOut" : "Sine.easeIn",
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
