import type Phaser from "phaser";
import { type ItemId, type MatchRecord, type ReplayPlayerEvent } from "@shared";
import { deriveBoardIconKey } from "../../ui/actionIcons";
import type { MoveReplayContext } from "../MoveReplayContext";
import { resolveItemLabel, resolveItemVisual } from "./ItemVisuals";

const SEARCH_TEXTURE_KEY = deriveBoardIconKey("cards_seek.png");

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

export async function animateSearchEvent(
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
