import type Phaser from "phaser";
import type { ReplayPlayerEvent, RecipeComponent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { resolveItemLabel, resolveItemVisual } from "./ItemVisuals";
import { buildCraftingAnimationPlan } from "./CraftingAnimationData";
import { playRandomSound } from "../soundPlayer";

const CRAFTING_SOUNDS = ["metal_clang", "power_up", "item_equip"];
const COMBINE_SOUNDS = ["metal_clang", "sci_fi_select", "power_up"];
const SEPARATE_SOUNDS = ["sword_clash_2", "metal_clang", "pop_1"];

interface AnimationOrigin {
  x: number;
  y: number;
  depth: number;
}

function getAnimationOrigin(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): AnimationOrigin | null {
  const sprite = context.getSprite(event.actorId);
  if (sprite) {
    return {
      x: sprite.x,
      y: sprite.y - sprite.displayHeight * 0.25,
      depth: sprite.depth + 2
    };
  }
  const coord =
    event.action.originLocation ??
    event.action.targetLocation ??
    context.currentMatch?.playerCharacters?.[event.actorId]?.position?.coord;
  if (!coord) {
    return null;
  }
  const world = context.axialToWorld(coord);
  return { x: world.x, y: world.y, depth: 10 };
}

function createItemVisual(
  context: MoveReplayContext,
  component: RecipeComponent,
  origin: AnimationOrigin,
  x: number,
  y: number
): Phaser.GameObjects.Container {
  const scene = context.scene;
  const visual = resolveItemVisual(component.itemId);
  const container = scene.add.container(x, y);
  container.setDepth(origin.depth);
  container.setAlpha(0);
  context.ignoreUI(container);
  if (
    visual &&
    scene.textures.exists(visual.texture) &&
    (!visual.frame || scene.textures.getFrame(visual.texture, visual.frame))
  ) {
    container.add(
      scene.add.image(0, 0, visual.texture, visual.frame).setDisplaySize(36, 36)
    );
  } else {
    const label = scene.add.text(0, 0, resolveItemLabel(component.itemId), {
      fontSize: "13px",
      color: "#ffffff",
      fontFamily: "Montserrat, Arial, sans-serif",
      stroke: "#111827",
      strokeThickness: 3
    });
    label.setOrigin(0.5);
    container.add(label);
  }
  if (component.quantity > 1) {
    const quantity = scene.add.text(17, 14, `×${component.quantity}`, {
      fontSize: "11px",
      color: "#ffffff",
      fontFamily: "Montserrat, Arial, sans-serif",
      stroke: "#111827",
      strokeThickness: 3
    });
    quantity.setOrigin(0.5);
    container.add(quantity);
  }
  return container;
}

function animateRing(
  context: MoveReplayContext,
  origin: AnimationOrigin,
  color: number,
  delay: number,
  scale: number
): Promise<void> {
  const ring = context.scene.add.circle(origin.x, origin.y, 30, color, 0);
  ring.setStrokeStyle(3, color, 0.95);
  ring.setDepth(origin.depth);
  ring.setScale(0.2);
  ring.setAlpha(0.85);
  context.ignoreUI(ring);
  return new Promise<void>((resolve) => {
    context.tweens.add({
      targets: ring,
      scale,
      alpha: 0,
      rotation: Math.PI * 0.3,
      duration: 470,
      delay,
      ease: "Cubic.easeOut",
      onComplete: () => {
        ring.destroy();
        resolve();
      }
    });
  });
}

function animateSparks(
  context: MoveReplayContext,
  origin: AnimationOrigin,
  color: number
): Promise<void[]> {
  const scene = context.scene;
  const sparks: Array<Promise<void>> = [];
  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI * 2 * index) / 8;
    const spark = scene.add.rectangle(
      origin.x + Math.cos(angle) * 12,
      origin.y + Math.sin(angle) * 12,
      4,
      9,
      color
    );
    spark.setDepth(origin.depth + 1);
    spark.setRotation(angle);
    context.ignoreUI(spark);
    sparks.push(
      new Promise<void>((resolve) => {
        context.tweens.add({
          targets: spark,
          x: origin.x + Math.cos(angle) * 58,
          y: origin.y + Math.sin(angle) * 48,
          alpha: 0,
          scale: 0.15,
          rotation: angle + Math.PI,
          duration: 360 + (index % 3) * 45,
          ease: "Cubic.easeOut",
          onComplete: () => {
            spark.destroy();
            resolve();
          }
        });
      })
    );
  }
  return Promise.all(sparks);
}

function animateInputs(
  context: MoveReplayContext,
  components: RecipeComponent[],
  origin: AnimationOrigin
): Promise<void[]> {
  return Promise.all(
    components.map((component, index) => {
      const angle = (Math.PI * 2 * index) / components.length;
      const startX = origin.x + Math.cos(angle) * 48;
      const startY = origin.y + Math.sin(angle) * 34;
      const visual = createItemVisual(
        context,
        component,
        origin,
        startX,
        startY
      );
      visual.setAlpha(1);
      visual.setScale(0.82);
      return new Promise<void>((resolve) => {
        context.tweens.add({
          targets: visual,
          x: origin.x,
          y: origin.y,
          alpha: 0,
          scale: 0.15,
          rotation: Math.PI * (index % 2 === 0 ? 0.35 : -0.35),
          duration: 300,
          ease: "Sine.easeIn",
          onComplete: () => {
            visual.destroy();
            resolve();
          }
        });
      });
    })
  );
}

function animateOutputs(
  context: MoveReplayContext,
  components: RecipeComponent[],
  origin: AnimationOrigin,
  kind: "fabricate" | "combine" | "separate"
): Promise<void[]> {
  return Promise.all(
    components.slice(0, 3).map((component, index) => {
      const spread = (index - (Math.min(components.length, 3) - 1) / 2) * 44;
      const targetX = origin.x + (kind === "separate" ? spread : 0);
      const targetY = origin.y - (kind === "fabricate" ? 48 : 38);
      const visual = createItemVisual(
        context,
        component,
        origin,
        origin.x,
        origin.y
      );
      visual.setScale(0.12);
      return new Promise<void>((resolve) => {
        context.tweens.add({
          targets: visual,
          x: targetX,
          y: targetY,
          alpha: 1,
          scale: kind === "fabricate" ? 1.12 : 1,
          rotation: kind === "separate" ? (index % 2 ? -0.12 : 0.12) : 0,
          duration: kind === "fabricate" ? 510 : 430,
          delay: index * 45,
          ease: "Back.easeOut",
          onComplete: () => {
            if (kind === "fabricate") {
              context.tweens.add({
                targets: visual,
                scale: 1,
                duration: 110,
                ease: "Sine.easeOut",
                onComplete: () => {
                  visual.destroy();
                  resolve();
                }
              });
            } else {
              visual.destroy();
              resolve();
            }
          }
        });
      });
    })
  );
}

async function animateCraftingEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const plan = buildCraftingAnimationPlan(
    event.action.actionId,
    event.action.metadata
  );
  const origin = getAnimationOrigin(context, event);
  if (!plan || !origin) {
    return;
  }

  const color =
    plan.kind === "fabricate"
      ? 0xffc857
      : plan.kind === "combine"
        ? 0x43e6c0
        : 0xc084fc;
  const sounds =
    plan.kind === "fabricate"
      ? CRAFTING_SOUNDS
      : plan.kind === "combine"
        ? COMBINE_SOUNDS
        : SEPARATE_SOUNDS;
  playRandomSound(context.scene, sounds);

  const effects: Array<Promise<unknown>> = [
    animateRing(context, origin, color, 0, 1.35),
    animateRing(context, origin, color, 75, 1.75),
    animateSparks(context, origin, color)
  ];
  if (plan.kind === "combine") {
    effects.push(animateInputs(context, plan.inputs, origin));
  } else if (plan.kind === "separate") {
    effects.push(animateInputs(context, plan.inputs, origin));
  }
  effects.push(animateOutputs(context, plan.outputs, origin, plan.kind));
  await Promise.all(effects);
}

export function animateFabricateEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  return animateCraftingEvent(context, event);
}

export function animateManipulateEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  return animateCraftingEvent(context, event);
}
