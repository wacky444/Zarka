import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { collectTargetIds, showGuardOverlay } from "./GuardOverlay";

export async function animateProtectEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targets = collectTargetIds(event);
  await showGuardOverlay(context, targets);
}
