import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import {
  HEAL_TEXTURE_KEY,
  collectTargetIds,
  showGuardOverlay,
} from "./GuardOverlay";
import { playRandomSound } from "../soundPlayer";

const BANDAGE_SOUNDS = ["clothing_1", "clothing_2", "paper_tear_1"];

export async function animateUseBandageEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targets = collectTargetIds(event);
  if (targets.length === 0) {
    return;
  }
  playRandomSound(context.scene, BANDAGE_SOUNDS);
  await showGuardOverlay(context, targets, 520, HEAL_TEXTURE_KEY);
}
