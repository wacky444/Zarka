import type { Axial, ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";

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

export async function animateScareEvent(
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
