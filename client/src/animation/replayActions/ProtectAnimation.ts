import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { collectTargetIds, showGuardOverlay } from "./GuardOverlay";
import { playRandomSound } from "../soundPlayer";

const PROTECT_SOUNDS = ["sword_clash", "sword_clash_2", "metal_clang"];

export async function animateProtectEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targets = collectTargetIds(event);
  playRandomSound(context.scene, PROTECT_SOUNDS);
  await showGuardOverlay(context, targets);
}
