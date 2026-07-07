import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";

const PULSE_DURATION = 500;
const PULSE_RADIUS_START = 8;
const PULSE_RADIUS_END = 64;
const PULSE_COLOR = 0x7ec8e3;
const PULSE_ALPHA_START = 0.7;

export async function animateDetectEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const originCoord = event.action.originLocation;
  if (!originCoord) {
    return;
  }
  const worldPos = context.axialToWorld(originCoord);

  return new Promise<void>((resolve) => {
    const circle = context.scene.add
      .circle(worldPos.x, worldPos.y, PULSE_RADIUS_START, PULSE_COLOR)
      .setAlpha(PULSE_ALPHA_START)
      .setDepth(10);

    context.ignoreUI(circle);

    context.tweens.add({
      targets: circle,
      scaleX: PULSE_RADIUS_END / PULSE_RADIUS_START,
      scaleY: PULSE_RADIUS_END / PULSE_RADIUS_START,
      alpha: 0,
      duration: PULSE_DURATION,
      ease: "Sine.easeOut",
      onComplete: () => {
        circle.destroy();
        resolve();
      },
    });
  });
}
