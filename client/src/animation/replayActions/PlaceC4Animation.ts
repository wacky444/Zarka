import type Phaser from "phaser";
import { type ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { resolveItemLabel, resolveItemVisual } from "./ItemVisuals";
import { playRandomSound } from "../soundPlayer";

const C4_PLACE_DURATION = 560;
const C4_BEEP_INTERVAL = 180;
const C4_BEEP_SOUND = "sci_fi_select";

function playC4Beep(scene: Phaser.Scene): void {
  playRandomSound(scene, C4_BEEP_SOUND, {
    volume: 0.55,
    pitchRange: 0,
    rateRange: 0,
  });
}

export async function animatePlaceC4Event(
  context: MoveReplayContext,
  event: ReplayPlayerEvent,
): Promise<void> {
  const metadata = event.action.metadata as { c4Id?: unknown } | undefined;
  const c4Id = typeof metadata?.c4Id === "string" ? metadata.c4Id : null;
  const charge = c4Id
    ? context.currentMatch?.c4s?.find((entry) => entry.id === c4Id)
    : undefined;
  const originCoord =
    charge?.coord ??
    event.action.targetLocation ??
    event.action.originLocation ??
    context.currentMatch?.playerCharacters?.[event.actorId]?.position?.coord ??
    null;
  const actorSprite =
    context.getSprite(event.actorId) ??
    context.ensureSprite?.(event.actorId, originCoord ?? undefined) ??
    null;

  if (!originCoord && !actorSprite) {
    return;
  }

  const targetWorld = originCoord
    ? context.axialToWorld(originCoord)
    : { x: actorSprite!.x, y: actorSprite!.y };
  const targetX = targetWorld.x + 28;
  const targetY = targetWorld.y - 24;
  const startX = actorSprite ? actorSprite.x : targetX - 28;
  const startY = actorSprite ? actorSprite.y - 12 : targetY + 24;
  const depth = actorSprite ? actorSprite.depth + 2 : 10;
  const scene = context.scene;
  const visual = resolveItemVisual("c4");
  let node: Phaser.GameObjects.GameObject;
  let initialScale = 0.75;

  if (
    visual &&
    scene.textures.exists(visual.texture) &&
    (!visual.frame || scene.textures.getFrame(visual.texture, visual.frame))
  ) {
    const image = scene.add.image(startX, startY, visual.texture, visual.frame);
    image.setDisplaySize(26, 26);
    image.setScale(initialScale);
    image.setAlpha(0);
    image.setDepth(depth);
    context.ignoreUI(image);
    node = image;
  } else {
    const label = scene.add.text(startX, startY, resolveItemLabel("c4"), {
      fontSize: "14px",
      color: "#ffffff",
      fontFamily: "Montserrat, Arial, sans-serif",
      stroke: "#000000",
      strokeThickness: 3,
    });
    label.setOrigin(0.5, 0.5);
    label.setAlpha(0);
    label.setDepth(depth);
    context.ignoreUI(label);
    node = label;
    initialScale = 1;
  }

  if (c4Id) {
    context.setC4MarkerVisibility?.(c4Id, false);
  }
  playC4Beep(scene);
  scene.time.delayedCall(C4_BEEP_INTERVAL, () => {
    if (!context.shouldStopPlayback?.()) {
      playC4Beep(scene);
    }
  });
  scene.time.delayedCall(C4_BEEP_INTERVAL * 2, () => {
    if (!context.shouldStopPlayback?.()) {
      playC4Beep(scene);
    }
  });

  try {
    await new Promise<void>((resolve) => {
      context.tweens.add({
        targets: node,
        x: targetX,
        y: targetY,
        alpha: { from: 0, to: 1 },
        scale: { from: initialScale, to: 1 },
        duration: C4_PLACE_DURATION,
        ease: "Sine.easeOut",
        onComplete: () => {
          node.destroy();
          resolve();
        },
      });
    });
  } finally {
    if (c4Id) {
      context.setC4MarkerVisibility?.(c4Id, true);
    }
  }
}
