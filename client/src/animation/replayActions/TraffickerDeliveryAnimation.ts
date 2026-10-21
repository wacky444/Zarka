import type { ItemId, ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { resolveItemLabel, resolveItemVisual } from "./ItemVisuals";

export async function animateTraffickerDeliveryEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent,
): Promise<void> {
  const metadata = event.action.metadata as { itemId?: unknown } | undefined;
  if (typeof metadata?.itemId !== "string") return;
  const itemId = metadata.itemId as ItemId;
  const sprite = context.getSprite(event.actorId);
  const origin = sprite
    ? { x: sprite.x, y: sprite.y }
    : context.currentMatch?.playerCharacters?.[event.actorId]?.position?.coord
      ? context.axialToWorld(context.currentMatch.playerCharacters[event.actorId].position!.coord)
      : { x: context.scene.scale.width / 2, y: context.scene.scale.height / 2 };
  const scene = context.scene;
  const visual = resolveItemVisual(itemId);
  const title = scene.add.text(origin.x, origin.y - 28, resolveItemLabel(itemId), {
    fontSize: "15px",
    color: "#fff2a8",
    fontStyle: "bold",
    stroke: "#172033",
    strokeThickness: 4,
    shadow: { color: "#000000", blur: 8, fill: true },
  }).setOrigin(0.5);
  title.setDepth((sprite?.depth ?? 10) + 30);
  context.ignoreUI(title);
  const icon = visual && scene.textures.exists(visual.texture)
    ? scene.add.image(origin.x, origin.y - 52, visual.texture, visual.frame)
    : scene.add.text(origin.x, origin.y - 52, "📦", { fontSize: "30px" }).setOrigin(0.5);
  icon.setDepth((sprite?.depth ?? 10) + 30);
  context.ignoreUI(icon);
  const glow = scene.add.circle(origin.x, origin.y - 45, 18, 0xfacc15, 0.35)
    .setDepth((sprite?.depth ?? 10) + 29);
  context.ignoreUI(glow);

  await new Promise<void>((resolve) => {
    context.tweens.add({
      targets: [title, icon, glow],
      y: "-=42",
      alpha: { from: 0, to: 1 },
      duration: 450,
      ease: "Back.easeOut",
      yoyo: true,
      hold: 650,
      onComplete: () => {
        title.destroy();
        icon.destroy();
        glow.destroy();
        resolve();
      },
    });
  });
}
