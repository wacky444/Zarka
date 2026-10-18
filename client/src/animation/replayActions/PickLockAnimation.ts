import Phaser from "phaser";
import { type ItemId, type ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { resolveItemLabel, resolveItemVisual } from "./ItemVisuals";
import { playRandomSound } from "../soundPlayer";

interface PickLockMetadata {
  outcome?: "success" | "progress" | "failure" | "interrupted";
  turnsCompleted?: number;
  turnsRequired?: number;
  contents?: ItemId[];
  revealedItemIds?: string[];
  safeItemId?: string;
  tileId?: string;
  openedInstantly?: boolean;
}

export async function animatePickLockEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const metadata = (event.action.metadata ?? {}) as PickLockMetadata;
  const outcome = metadata.outcome ?? "failure";
  const scene = context.scene;

  const actorSprite = context.getSprite(event.actorId) ?? null;
  const originCoord =
    event.action.originLocation ??
    event.action.targetLocation ??
    context.currentMatch?.playerCharacters?.[event.actorId]?.position?.coord ??
    null;

  const baseWorld = actorSprite
    ? { x: actorSprite.x, y: actorSprite.y }
    : originCoord
      ? context.axialToWorld(originCoord)
      : { x: 0, y: 0 };
  const baseDepth = (actorSprite ? actorSprite.depth : 10) + 5;

  if (outcome === "progress") {
    playRandomSound(scene, ["lock_quick", "metal_blunt_tap"]);
    const current = metadata.turnsCompleted ?? 1;
    const total = metadata.turnsRequired ?? 3;
    const text = scene.add.text(
      baseWorld.x,
      baseWorld.y - 40,
      `🔓 ${current}/${total}`,
      {
        fontSize: "14px",
        color: "#fbbf24",
        fontFamily: "Montserrat, Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3,
      }
    );
    text.setOrigin(0.5, 0.5);
    text.setDepth(baseDepth);
    context.ignoreUI(text);

    await new Promise<void>((resolve) => {
      context.tweens.add({
        targets: text,
        y: baseWorld.y - 65,
        alpha: { from: 1, to: 0 },
        duration: 750,
        ease: "Sine.easeOut",
        onComplete: () => {
          text.destroy();
          resolve();
        },
      });
    });
    return;
  }

  if (outcome === "interrupted" || outcome === "failure") {
    playRandomSound(scene, ["cancel", "undesired_effect"]);
    if (actorSprite) {
      await new Promise<void>((resolve) => {
        context.tweens.add({
          targets: actorSprite,
          x: actorSprite.x + 4,
          yoyo: true,
          repeat: 3,
          duration: 40,
          onComplete: () => resolve(),
        });
      });
    }
    return;
  }

  // --- LOOTBOX SUCCESS ANIMATION ---
  const contents = Array.isArray(metadata.contents) ? metadata.contents : [];
  const safeVisual = resolveItemVisual("safe");

  // Container to hold all animated objects for clean cleanup
  const cleanups: Phaser.GameObjects.GameObject[] = [];

  // Stage 1: Safe appears in front of player
  let safeObj: Phaser.GameObjects.GameObject;
  const safeX = baseWorld.x;
  const safeY = baseWorld.y - 12;

  if (
    safeVisual &&
    scene.textures.exists(safeVisual.texture) &&
    (!safeVisual.frame || scene.textures.getFrame(safeVisual.texture, safeVisual.frame))
  ) {
    const img = scene.add.image(safeX, safeY, safeVisual.texture, safeVisual.frame);
    img.setOrigin(0.5, 0.5);
    img.setScale(0.2);
    img.setDepth(baseDepth + 2);
    context.ignoreUI(img);
    safeObj = img;
  } else {
    const txt = scene.add.text(safeX, safeY, "📦", { fontSize: "32px" });
    txt.setOrigin(0.5, 0.5);
    txt.setScale(0.2);
    txt.setDepth(baseDepth + 2);
    context.ignoreUI(txt);
    safeObj = txt;
  }
  cleanups.push(safeObj);

  // Safe pop in
  playRandomSound(scene, ["lock_quick", "metal_blunt_tap"]);
  await new Promise<void>((resolve) => {
    context.tweens.add({
      targets: safeObj,
      scale: 1.25,
      duration: 220,
      ease: "Back.easeOut",
      onComplete: () => resolve(),
    });
  });

  // Safe rattle/shake before bursting open (double duration + angle wiggle)
  await new Promise<void>((resolve) => {
    context.tweens.add({
      targets: safeObj,
      x: safeX + 4,
      angle: { from: -3.5, to: 3.5 },
      yoyo: true,
      repeat: 11,
      duration: 38,
      ease: "Linear",
      onComplete: () => {
        if ("setPosition" in safeObj) {
          (safeObj as Phaser.GameObjects.Image).setPosition(safeX, safeY);
        }
        if ("setAngle" in safeObj) {
          (safeObj as Phaser.GameObjects.Image).setAngle(0);
        }
        resolve();
      },
    });
  });

  // Stage 2: Click! Lock unlocks
  playRandomSound(scene, "lock_unlock");
  if (safeObj instanceof Phaser.GameObjects.Image) {
    safeObj.setTint(0xffea75);
  }

  // Stage 3: Heavy door opens + triumphant fanfare from 400 sound pack!
  playRandomSound(scene, "industrial_door_open");
  playRandomSound(scene, "brass_chime_positive");

  // Golden glow explosion / burst ring
  const glowCircle = scene.add.circle(safeX, safeY, 45, 0xfacc15, 0.85);
  glowCircle.setDepth(baseDepth);
  context.ignoreUI(glowCircle);
  cleanups.push(glowCircle);

  context.tweens.add({
    targets: glowCircle,
    scale: 4.5,
    alpha: 0,
    duration: 750,
    ease: "Cubic.easeOut",
    onComplete: () => glowCircle.destroy(),
  });

  // More sparkle stars and bigger (20 4-point stars with rotation and varied gold/white tones)
  const starColors = [0xffffff, 0xfef08a, 0xfacc15, 0xfde047, 0xf59e0b];
  const starCount = 20;
  for (let i = 0; i < starCount; i += 1) {
    const angle = (i / starCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const dist = 50 + Math.random() * 55;
    const color = starColors[i % starColors.length];
    const star = scene.add.star(safeX, safeY, 4, 5, 13, color);
    star.setDepth(baseDepth + 2);
    const startScale = Phaser.Math.FloatBetween(1.5, 2.3);
    star.setScale(startScale);
    context.ignoreUI(star);
    cleanups.push(star);
    context.tweens.add({
      targets: star,
      x: safeX + Math.cos(angle) * dist,
      y: safeY + Math.sin(angle) * dist,
      scale: { from: startScale, to: 0.15 },
      alpha: { from: 1, to: 0 },
      rotation: (Math.random() - 0.5) * Math.PI * 4,
      duration: 550 + Math.random() * 250,
      ease: "Quad.easeOut",
      onComplete: () => star.destroy(),
    });
  }

  // Stage 4: Loot fountain! Items pop out in an arc above the safe
  const numItems = contents.length;
  if (numItems > 0) {
    const spreadWidth = Math.min(180, Math.max(70, numItems * 44));
    const startOffset = -spreadWidth / 2;
    const step = numItems > 1 ? spreadWidth / (numItems - 1) : 0;

    const itemPromises: Promise<void>[] = [];

    for (let i = 0; i < numItems; i += 1) {
      const itemType = contents[i];
      const targetX = safeX + (numItems === 1 ? 0 : startOffset + i * step);
      const targetY = safeY - 55 - (numItems > 2 && (i === 1 || i === numItems - 2) ? 10 : 0);
      const visual = resolveItemVisual(itemType);

      // Container for item icon + label
      const itemContainer = scene.add.container(safeX, safeY);
      itemContainer.setDepth(baseDepth + 10 + i);
      itemContainer.setScale(0.1);
      itemContainer.setAlpha(0);
      context.ignoreUI(itemContainer);
      cleanups.push(itemContainer);

      // Item sprite
      if (
        visual &&
        scene.textures.exists(visual.texture) &&
        (!visual.frame || scene.textures.getFrame(visual.texture, visual.frame))
      ) {
        const itemImg = scene.add.image(0, 0, visual.texture, visual.frame);
        itemImg.setOrigin(0.5, 0.5);
        itemImg.setScale(1.2);
        itemContainer.add(itemImg);
      } else {
        const itemTxt = scene.add.text(0, 0, resolveItemLabel(itemType), {
          fontSize: "14px",
          color: "#ffffff",
        });
        itemTxt.setOrigin(0.5, 0.5);
        itemContainer.add(itemTxt);
      }

      // Small item name banner below icon
      const nameLabel = scene.add.text(0, 22, resolveItemLabel(itemType), {
        fontSize: "12px",
        color: "#fef08a",
        fontFamily: "Montserrat, Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#0f172a",
        strokeThickness: 3,
      });
      nameLabel.setOrigin(0.5, 0.5);
      itemContainer.add(nameLabel);

      // Animate item popping up with Back.easeOut
      const delay = i * 90;
      const p = new Promise<void>((resolveItem) => {
        context.tweens.add({
          targets: itemContainer,
          x: targetX,
          y: targetY,
          scale: 1.1,
          alpha: 1,
          duration: 480,
          delay,
          ease: "Back.easeOut",
          onComplete: () => {
            // Gentle hover
            context.tweens.add({
              targets: itemContainer,
              y: targetY - 6,
              duration: 450,
              yoyo: true,
              repeat: 1,
              ease: "Sine.easeInOut",
              onComplete: () => {
                // Drop and fade into ground
                context.tweens.add({
                  targets: itemContainer,
                  y: targetY + 25,
                  alpha: 0,
                  scale: 0.8,
                  duration: 350,
                  ease: "Sine.easeIn",
                  onComplete: () => {
                    itemContainer.destroy();
                    resolveItem();
                  },
                });
              },
            });
          },
        });
      });
      itemPromises.push(p);
    }

    // Wait for all items to complete their show
    await Promise.all(itemPromises);
  } else {
    // Empty safe
    await new Promise<void>((r) => setTimeout(r, 600));
  }

  // Fade out safe
  await new Promise<void>((resolve) => {
    context.tweens.add({
      targets: safeObj,
      alpha: 0,
      scale: 0.8,
      duration: 300,
      ease: "Sine.easeIn",
      onComplete: () => {
        safeObj.destroy();
        resolve();
      },
    });
  });

  // Ensure all objects destroyed
  for (const obj of cleanups) {
    if (obj && obj.active) {
      obj.destroy();
    }
  }
}
