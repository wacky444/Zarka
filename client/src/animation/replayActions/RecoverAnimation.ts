import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import {
  HEAL_TEXTURE_KEY,
  collectTargetIds,
  showGuardOverlay,
} from "./GuardOverlay";
import { playRandomSound } from "../soundPlayer";

const RECOVER_SOUNDS = ["power_up", "power_up_2", "heart_collect"];

export async function animateRecoverEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targets = collectTargetIds(event);
  playRandomSound(context.scene, RECOVER_SOUNDS);
  await showGuardOverlay(context, targets, 520, HEAL_TEXTURE_KEY);
}
