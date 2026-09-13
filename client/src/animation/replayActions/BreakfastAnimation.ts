import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import {
  FEED_TEXTURE_KEY,
  collectTargetIds,
  showGuardOverlay,
} from "./GuardOverlay";
import { playRandomSound } from "../soundPlayer";

const BREAKFAST_SOUNDS = ["munching_food", "drink_slurp"];

export async function animateBreakfastEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targets = collectTargetIds(event);
  playRandomSound(context.scene, BREAKFAST_SOUNDS);
  await showGuardOverlay(context, targets, 520, FEED_TEXTURE_KEY);
}
