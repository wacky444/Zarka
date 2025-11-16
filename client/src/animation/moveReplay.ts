import { ActionLibrary, type ReplayEvent } from "@shared";
import type { MoveReplayContext } from "./MoveReplayContext";
import { animateFeedEvent } from "./replayActions/FeedAnimation";
import { animateDeathEvent } from "./replayActions/DeathAnimation";
import { animateMoveEvent } from "./replayActions/MoveAnimation";
import { animatePickUpEvent } from "./replayActions/PickUpAnimation";
import { animateProtectEvent } from "./replayActions/ProtectAnimation";
import { animatePunchEvent } from "./replayActions/PunchAnimation";
import { animateAxeAttackEvent } from "./replayActions/AxeAttackAnimation";
import { animateKnifeAttackEvent } from "./replayActions/KnifeAttackAnimation";
import { animateRecoverEvent } from "./replayActions/RecoverAnimation";
import { animateScareEvent } from "./replayActions/ScareAnimation";
import { animateSearchEvent } from "./replayActions/SearchAnimation";
import { animateSleepEvent } from "./replayActions/SleepAnimation";
import { animateUseBandageEvent } from "./replayActions/UseBandageAnimation";
import { animateFocusEvent } from "./replayActions/FocusAnimation";
import { animateFailedActionEvent } from "./replayActions/FailedActionAnimation";

export async function playReplayEvents(
  context: MoveReplayContext,
  events: ReplayEvent[]
): Promise<void> {
  for (const event of events) {
    if (event.kind !== "player") {
      continue;
    }
    const actionId = event.action.actionId;
    if (actionId === ActionLibrary.move.id) {
      await animateMoveEvent(context, event);
    } else if (actionId === ActionLibrary.scare.id) {
      await animateScareEvent(context, event);
    } else if (actionId === ActionLibrary.use_bandage.id) {
      await animateUseBandageEvent(context, event);
    } else if (actionId === ActionLibrary.sleep.id) {
      await animateSleepEvent(context, event);
    } else if (actionId === ActionLibrary.recover.id) {
      await animateRecoverEvent(context, event);
    } else if (actionId === ActionLibrary.feed.id) {
      await animateFeedEvent(context, event);
    } else if (actionId === ActionLibrary.protect.id) {
      await animateProtectEvent(context, event);
    } else if (actionId === ActionLibrary.focus.id) {
      await animateFocusEvent(context, event);
    } else if (actionId === ActionLibrary.knife_attack.id) {
      await animateKnifeAttackEvent(context, event);
    } else if (actionId === ActionLibrary.axe_attack.id) {
      await animateAxeAttackEvent(context, event);
    } else if (actionId === ActionLibrary.punch.id) {
      await animatePunchEvent(context, event);
    } else if (actionId === ActionLibrary.pick_up.id) {
      await animatePickUpEvent(context, event);
    } else if (actionId === ActionLibrary.search.id) {
      await animateSearchEvent(context, event);
    } else if (actionId === ActionLibrary.status_dead.id) {
      await animateDeathEvent(context, event);
    } else if (actionId === ActionLibrary.failedAction.id) {
      await animateFailedActionEvent(context, event);
    }
  }
}

export type { MoveReplayContext } from "./MoveReplayContext";
