import { ActionLibrary, type ReplayEvent } from "@shared";
import type { MoveReplayContext } from "./MoveReplayContext";
import { animateFeedEvent } from "./replayActions/FeedAnimation";
import { animateBreakfastEvent } from "./replayActions/BreakfastAnimation";
import { animateDeathEvent } from "./replayActions/DeathAnimation";
import { animateUnconsciousEvent } from "./replayActions/UnconsciousAnimation";
import { animateMoveEvent } from "./replayActions/MoveAnimation";
import { animatePickUpEvent } from "./replayActions/PickUpAnimation";
import { animateDropEvent } from "./replayActions/DropAnimation";
import { animateProtectEvent } from "./replayActions/ProtectAnimation";
import { animatePunchEvent } from "./replayActions/PunchAnimation";
import { animateAxeAttackEvent } from "./replayActions/AxeAttackAnimation";
import { animateBatAttackEvent } from "./replayActions/BatAttackAnimation";
import { animateKnifeAttackEvent } from "./replayActions/KnifeAttackAnimation";
import { animateRecoverEvent } from "./replayActions/RecoverAnimation";
import { animateScareEvent } from "./replayActions/ScareAnimation";
import { animateSearchEvent } from "./replayActions/SearchAnimation";
import { animateSleepEvent } from "./replayActions/SleepAnimation";
import { animateUseBandageEvent } from "./replayActions/UseBandageAnimation";
import { animateFocusEvent } from "./replayActions/FocusAnimation";
import { animateFailedActionEvent } from "./replayActions/FailedActionAnimation";
import { animateDetectEvent } from "./replayActions/DetectAnimation";
import { animateChemicalWeaponEvent } from "./replayActions/ChemicalWeaponAnimation";
import { animateTrapEvent } from "./replayActions/TrapAnimation";
import { animateTileDestroyedEvent } from "./replayActions/TileDestroyedAnimation";
import { animateShootPistolEvent } from "./replayActions/ShootPistolAnimation";
import { animateShootHarpoonEvent } from "./replayActions/ShootHarpoonAnimation";
import { animateRocketLauncherEvent } from "./replayActions/RocketLauncherAnimation";
import { playRandomSound } from "./soundPlayer";

const TILE_DESTROYED_SOUNDS = ["explosion_small", "explosion_medium"];

export async function playReplayEvents(
  context: MoveReplayContext,
  events: ReplayEvent[]
): Promise<void> {
  for (const event of events) {
    if (context.shouldStopPlayback?.()) {
      return;
    }
    if (context.waitForPlaybackResume) {
      await context.waitForPlaybackResume();
    }
    if (context.shouldStopPlayback?.()) {
      return;
    }
    if (event.kind === "map" && event.action === "destroyed" && event.cell) {
      playRandomSound(context.scene, TILE_DESTROYED_SOUNDS);
      await animateTileDestroyedEvent(context, event.cell);
      if (context.showTileDestroyedBanner) {
        context.showTileDestroyedBanner(event.cell);
      }
      continue;
    }
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
    } else if (actionId === ActionLibrary.breakfast.id) {
      await animateBreakfastEvent(context, event);
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
    } else if (actionId === ActionLibrary.bat_attack.id) {
      await animateBatAttackEvent(context, event);
    } else if (actionId === ActionLibrary.shoot_pistol.id) {
      await animateShootPistolEvent(context, event);
    } else if (actionId === ActionLibrary.shoot_harpoon.id) {
      await animateShootHarpoonEvent(context, event);
    } else if (actionId === ActionLibrary.fire_rocket_launcher.id) {
      await animateRocketLauncherEvent(context, event);
    } else if (actionId === ActionLibrary.punch.id) {
      await animatePunchEvent(context, event);
    } else if (actionId === ActionLibrary.pick_up.id) {
      await animatePickUpEvent(context, event);
    } else if (actionId === ActionLibrary.drop.id) {
      await animateDropEvent(context, event);
    } else if (actionId === ActionLibrary.search.id) {
      await animateSearchEvent(context, event);
    } else if (actionId === ActionLibrary.status_dead.id) {
      await animateDeathEvent(context, event);
    } else if (actionId === ActionLibrary.status_unconscious.id) {
      await animateUnconsciousEvent(context, event);
    } else if (actionId === ActionLibrary.failedAction.id) {
      await animateFailedActionEvent(context, event);
    } else if (actionId === ActionLibrary.detect.id) {
      await animateDetectEvent(context, event);
    } else if (actionId === ActionLibrary.use_chemical_weapon.id) {
      await animateChemicalWeaponEvent(context, event);
    } else if (actionId === ActionLibrary.place_trap.id) {
      await animateTrapEvent(context, event);
    }
  }
}

export type { MoveReplayContext } from "./MoveReplayContext";
