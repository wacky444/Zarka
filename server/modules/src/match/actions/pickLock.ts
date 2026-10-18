import type { ReplayEvent } from "@shared";
import { ActionLibrary, getSkillRank } from "@shared";
import type { MatchRecord } from "../../models/types";
import type { PlannedActionParticipant } from "./utils";
import { clearPlanByKey, consumeCarriedItem, hasCarriedItem } from "./utils";

function openSafe(match: MatchRecord, safe: NonNullable<MatchRecord["safeContainers"]>[number], character: PlannedActionParticipant["character"]): string[] {
  safe.opened = true;
  const tile = match.map?.tiles.find((entry) => entry.id === safe.tileId);
  if (tile) {
    tile.itemIds = (tile.itemIds ?? []).filter((id) => id !== safe.safeItemId);
  }
  if (match.items) {
    match.items = match.items.filter((item) => item.item_id !== safe.safeItemId);
  }
  for (const pc of Object.values(match.playerCharacters ?? {})) {
    if (pc.discoveredItemIds) {
      pc.discoveredItemIds = pc.discoveredItemIds.filter(
        (id) => id !== safe.safeItemId
      );
    }
  }
  const discovered = new Set(character.discoveredItemIds ?? []);
  discovered.delete(safe.safeItemId);
  const revealedIds: string[] = [];
  for (let index = 0; index < safe.contents.length; index += 1) {
    const itemId = `${safe.safeItemId}_contents_${index}`;
    if (!match.items?.some((item) => item.item_id === itemId)) {
      (match.items ??= []).push({ item_id: itemId, item_type: safe.contents[index] });
    }
    if (tile && !tile.itemIds!.includes(itemId)) tile.itemIds!.push(itemId);
    revealedIds.push(itemId);
  }
  character.discoveredItemIds = [...new Set([...discovered, ...revealedIds])];
  return revealedIds;
}

export function executePickLockAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord,
): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  const safes = match.safeContainers ?? [];
  for (const participant of participants) {
    const character = participant.character;
    const tileId = character.position?.tileId;
    const discovered = new Set(character.discoveredItemIds ?? []);
    const safe = safes.find((entry) =>
      entry.tileId === tileId && discovered.has(entry.safeItemId) && !entry.opened
    );
    if (!tileId || !safe) {
      character.lockpickProgress = undefined;
      clearPlanByKey(participant.character, participant.planKey);
      events.push({ kind: "player", actorId: participant.playerId, action: {
        actionId: ActionLibrary.pick_lock.id,
        metadata: { outcome: "failure", reason: "safe_not_visible" },
      }});
      continue;
    }
    const dexRank = getSkillRank(character, "dexterity1");
    const hasDexterity1 = dexRank > 0;
    const hasLockpick = hasCarriedItem(character, "lockpick");
    const continuing = character.lockpickProgress?.tileId === tileId &&
      character.lockpickProgress.safeItemId === safe.safeItemId;
    const completed = continuing ? character.lockpickProgress!.turnsCompleted : 0;
    const required = Math.max(1, 4 - dexRank);
    const turnsCompleted = completed + 1;
    if (hasLockpick) {
      character.lockpickProgress = undefined;
      if (!hasDexterity1) consumeCarriedItem(character, "lockpick");
      const contents = [...safe.contents];
      const revealedIds = openSafe(match, safe, character);
      if (participant.plan.actionId === ActionLibrary.pick_lock.id) {
        clearPlanByKey(character, participant.planKey);
      }
      events.push({ kind: "player", actorId: participant.playerId, action: {
        actionId: ActionLibrary.pick_lock.id,
        metadata: {
          outcome: "success",
          openedInstantly: true,
          lockpickConsumed: !hasDexterity1,
          contents,
          revealedItemIds: revealedIds,
          safeItemId: safe.safeItemId,
          tileId,
        },
      }});
      continue;
    }
    if (turnsCompleted < required) {
      character.lockpickProgress = { tileId, safeItemId: safe.safeItemId, turnsCompleted };
      if (participant.plan.actionId === ActionLibrary.pick_lock.id) {
        clearPlanByKey(character, participant.planKey);
      }
      events.push({ kind: "player", actorId: participant.playerId, action: {
        actionId: ActionLibrary.pick_lock.id,
        metadata: { outcome: "progress", turnsCompleted, turnsRequired: required, safeItemId: safe.safeItemId, tileId },
      }});
      continue;
    }
    character.lockpickProgress = undefined;
    const contents = [...safe.contents];
    const revealedIds = openSafe(match, safe, character);
    if (participant.plan.actionId === ActionLibrary.pick_lock.id) {
      clearPlanByKey(character, participant.planKey);
    }
    events.push({ kind: "player", actorId: participant.playerId, action: {
      actionId: ActionLibrary.pick_lock.id,
      metadata: {
        outcome: "success",
        contents,
        revealedItemIds: revealedIds,
        safeItemId: safe.safeItemId,
        tileId,
      },
    }});
  }
  return events;
}
