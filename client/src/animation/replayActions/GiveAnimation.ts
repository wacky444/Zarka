import type Phaser from "phaser";
import type { ItemId, ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { playRandomSound } from "../soundPlayer";
import { resolveItemLabel, resolveItemVisual } from "./ItemVisuals";

const GIVE_SOUNDS = ["item_equip", "weapon_pick_up"];
const GIVE_ANIMATION_DURATION = 420;

function readGivenItems(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }
  const entries = (metadata as { givenItems?: unknown }).givenItems;
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const itemType = (entry as { itemType?: unknown }).itemType;
    return typeof itemType === "string" ? [itemType] : [];
  });
}

export async function animateGiveEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targetId = event.targets?.[0]?.targetId;
  const itemTypes = readGivenItems(event.action.metadata);
  if (!targetId || itemTypes.length === 0) {
    return;
  }
  const actorSprite = context.getSprite(event.actorId) ?? null;
  const targetSprite = context.getSprite(targetId) ?? null;
  const coord = event.action.originLocation ?? event.action.targetLocation;
  if (!coord && (!actorSprite || !targetSprite)) {
    return;
  }

  const origin = actorSprite
    ? { x: actorSprite.x, y: actorSprite.y }
    : context.axialToWorld(coord!);
  const destination = targetSprite
    ? { x: targetSprite.x, y: targetSprite.y }
    : context.axialToWorld(coord!);
  const depth = Math.max(actorSprite?.depth ?? 0, targetSprite?.depth ?? 0) + 1;
  const scene = context.scene;
  const promises: Array<Promise<void>> = [];
  const visibleItems = itemTypes.slice(0, 3);
  playRandomSound(scene, GIVE_SOUNDS);

  visibleItems.forEach((itemType, index) => {
    const itemId = itemType as ItemId;
    const visual = resolveItemVisual(itemId);
    const startX = origin.x + (index - (visibleItems.length - 1) / 2) * 12;
    let node: Phaser.GameObjects.GameObject;
    let startScale = 0.85;
    if (
      visual &&
      scene.textures.exists(visual.texture) &&
      (!visual.frame || scene.textures.getFrame(visual.texture, visual.frame))
    ) {
      const image = scene.add.image(startX, origin.y, visual.texture, visual.frame);
      image.setDepth(depth + index);
      image.setScale(startScale);
      context.ignoreUI(image);
      node = image;
    } else {
      const label = scene.add.text(startX, origin.y, resolveItemLabel(itemId), {
        fontSize: "14px",
        color: "#ffffff",
        fontFamily: "Montserrat, Arial, sans-serif",
        stroke: "#000000",
        strokeThickness: 3,
      });
      label.setOrigin(0.5, 0.5);
      label.setDepth(depth + index);
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
          alpha: { from: 1, to: 0.9 },
          scale: { from: startScale, to: 0.4 },
          duration: GIVE_ANIMATION_DURATION,
          ease: "Sine.easeInOut",
          onComplete: () => {
            node.destroy();
            resolve();
          },
        });
      })
    );
  });

  await Promise.all(promises);
}
