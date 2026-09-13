import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import {
  FEED_TEXTURE_KEY,
  collectTargetIds,
  showGuardOverlay,
} from "./GuardOverlay";
import { playRandomSound } from "../soundPlayer";

const FEED_SOUNDS = ["munching_food", "drink_slurp"];

export async function animateFeedEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targets = collectTargetIds(event);
  playRandomSound(context.scene, FEED_SOUNDS);
  await showGuardOverlay(context, targets, 520, FEED_TEXTURE_KEY);
}
