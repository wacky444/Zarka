import type Phaser from "phaser";
import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { playRandomSound } from "../soundPlayer";
import { resolveItemLabel, resolveItemVisual } from "./ItemVisuals";

const INJECTION_SOUNDS = ["cork_stabbed", "squelching_1", "squelching_2"];

export async function animateInjectVirusEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const metadata = event.action.metadata as
    | { infectedTargetId?: unknown; infectionTick?: unknown }
    | undefined;
  if (metadata?.infectionTick === true) {
    return;
  }
  const targetId =
    typeof metadata?.infectedTargetId === "string"
      ? metadata.infectedTargetId
      : event.targets?.[0]?.targetId;
  if (!targetId) {
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
  const item = resolveItemVisual("virus");
  const scene = context.scene;
  let object: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
  if (
    item &&
    scene.textures.exists(item.texture) &&
    (!item.frame || scene.textures.getFrame(item.texture, item.frame))
  ) {
    object = scene.add.image(origin.x, origin.y, item.texture, item.frame);
  } else {
    const label = scene.add.text(origin.x, origin.y, resolveItemLabel("virus"), {
      fontSize: "14px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 3,
    });
    label.setOrigin(0.5, 0.5);
    object = label;
  }
  object.setDepth(Math.max(actorSprite?.depth ?? 0, targetSprite?.depth ?? 0) + 1);
  object.setScale(0.8);
  context.ignoreUI(object);
  playRandomSound(scene, INJECTION_SOUNDS);

  await new Promise<void>((resolve) => {
    context.tweens.add({
      targets: object,
      x: destination.x,
      y: destination.y,
      alpha: { from: 1, to: 0.25 },
      scale: { from: 0.8, to: 0.25 },
      duration: 360,
      ease: "Sine.easeIn",
      onComplete: () => {
        object.destroy();
        resolve();
      },
    });
  });
}
