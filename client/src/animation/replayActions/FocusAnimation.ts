import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import {
  FOCUS_TEXTURE_KEY,
  collectTargetIds,
  showGuardOverlay,
} from "./GuardOverlay";
import { playRandomSound } from "../soundPlayer";

const FOCUS_SOUNDS = ["whoosh_1", "whoosh_2", "air_burst"];

export async function animateFocusEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targets = collectTargetIds(event);
  playRandomSound(context.scene, FOCUS_SOUNDS);
  await showGuardOverlay(context, targets, 520, FOCUS_TEXTURE_KEY);
}
