import {
  ActionLibrary,
  ItemLibrary,
  type ActionId,
  type ReplayPlayerEvent,
} from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";

export async function animateFailedActionEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  if (!event.actorId) {
    return;
  }
  const sprite = context.getSprite(event.actorId);
  if (!sprite) {
    return;
  }
  const scene = context.scene;
  const baseOffset = sprite.displayHeight * 0.65;
  const label = scene.add.text(
    sprite.x,
    sprite.y - baseOffset,
    buildFailureMessage(event),
    {
      fontSize: "16px",
      color: "#f87171",
      fontFamily: "Montserrat, Arial, sans-serif",
      stroke: "#1f2937",
      strokeThickness: 4,
    }
  );
  label.setOrigin(0.5, 1);
  label.setDepth(sprite.depth + 2);
  label.setAlpha(0);
  context.ignoreUI(label);

  const follow = () => {
    label.setPosition(sprite.x, sprite.y - baseOffset);
  };
  scene.events.on("update", follow);

  await new Promise<void>((resolve) => {
    context.tweens.add({
      targets: label,
      alpha: { from: 0, to: 1 },
      y: label.y - 18,
      duration: 260,
      ease: "Sine.easeOut",
      yoyo: true,
      hold: 220,
      onComplete: () => {
        scene.events.off("update", follow);
        label.destroy();
        resolve();
      },
    });
  });
}

function buildFailureMessage(event: ReplayPlayerEvent): string {
  const metadata = (event.action?.metadata ?? {}) as {
    attemptedActionId?: unknown;
    missingItemId?: unknown;
  };
  const attemptedId =
    typeof metadata.attemptedActionId === "string"
      ? (metadata.attemptedActionId as ActionId)
      : null;
  const actionName = resolveActionName(attemptedId);
  if (typeof metadata.missingItemId === "string") {
    const itemName = resolveItemName(metadata.missingItemId);
    return `${actionName} failed (missing ${itemName})`;
  }
  return `${actionName} failed`;
}

function resolveActionName(actionId: ActionId | null): string {
  if (!actionId) {
    return "Action";
  }
  const definition = ActionLibrary[actionId];
  if (definition?.name) {
    return definition.name;
  }
  return actionId;
}

function resolveItemName(itemId: string): string {
  const entry = (ItemLibrary as Record<string, { name?: string }>)[itemId];
  if (entry?.name) {
    return entry.name;
  }
  return itemId;
}
