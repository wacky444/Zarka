import type { ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { animatePickUpEvent } from "./PickUpAnimation";

export async function animateStealEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent,
): Promise<void> {
  const metadata = event.action.metadata as
    | { stolenItems?: unknown }
    | undefined;
  if (!Array.isArray(metadata?.stolenItems)) {
    return;
  }

  const pickedItems: Array<{ itemType: string }> = [];
  for (const entry of metadata.stolenItems) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const itemType = (entry as { itemType?: unknown }).itemType;
    if (typeof itemType === "string") {
      pickedItems.push({ itemType });
    }
  }
  if (pickedItems.length === 0) {
    return;
  }

  await animatePickUpEvent(context, {
    ...event,
    action: {
      ...event.action,
      originLocation:
        event.action.targetLocation ?? event.action.originLocation,
      metadata: { pickedItems },
    },
  });
}
