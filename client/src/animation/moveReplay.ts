import type Phaser from "phaser";
import type {
  Axial,
  MatchRecord,
  ReplayEvent,
  ReplayPlayerEvent,
} from "@shared";

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
}

export async function playReplayEvents(
  context: MoveReplayContext,
  events: ReplayEvent[]
): Promise<void> {
  for (const event of events) {
    if (event.kind === "player" && event.action.actionId === "move") {
      await animateMoveEvent(context, event);
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
