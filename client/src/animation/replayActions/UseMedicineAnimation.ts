import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import {
  HEAL_TEXTURE_KEY,
  collectTargetIds,
  showGuardOverlay,
} from "./GuardOverlay";
import { playRandomSound } from "../soundPlayer";

const MEDICINE_SOUNDS = ["power_up", "power_up_2", "heart_collect"];

export async function animateUseMedicineEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targets = collectTargetIds(event);
  if (targets.length === 0) {
    return;
  }
  playRandomSound(context.scene, MEDICINE_SOUNDS);
  await showGuardOverlay(context, targets, 520, HEAL_TEXTURE_KEY);
}
