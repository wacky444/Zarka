import type { ReplayEvent } from "@shared";
import { ActionLibrary, getSkillRank } from "@shared";
import type { MatchRecord } from "../../models/types";
import type { PlannedActionParticipant } from "./utils";
import { clearPlanByKey, consumeCarriedItem, hasCarriedItem } from "./utils";

function openSafe(match: MatchRecord, safe: NonNullable<MatchRecord["safeContainers"]>[number], character: PlannedActionParticipant["character"]): string[] {
  safe.opened = true;
  const tile = match.map?.tiles.find((entry) => entry.id === safe.tileId);
  const newTileItemIds: string[] = [];
  if (tile && Array.isArray(tile.itemIds)) {
    for (let i = 0; i < tile.itemIds.length; i += 1) {
      if (tile.itemIds[i] !== safe.safeItemId) {
        newTileItemIds.push(tile.itemIds[i]);
      }
    }
  }
  const newMatchItems: NonNullable<MatchRecord["items"]> = [];
  if (Array.isArray(match.items)) {
    for (let i = 0; i < match.items.length; i += 1) {
      if (match.items[i]?.item_id !== safe.safeItemId) {
        newMatchItems.push(match.items[i]);
      }
    }
  }
  for (const pc of Object.values(match.playerCharacters ?? {})) {
    if (Array.isArray(pc.discoveredItemIds)) {
      const newDiscovered: string[] = [];
      for (let i = 0; i < pc.discoveredItemIds.length; i += 1) {
        if (pc.discoveredItemIds[i] !== safe.safeItemId) {
          newDiscovered.push(pc.discoveredItemIds[i]);
        }
      }
      pc.discoveredItemIds = newDiscovered;
    }
  }
  const discovered = new Set(character.discoveredItemIds ?? []);
  discovered.delete(safe.safeItemId);
  const revealedIds: string[] = [];
  for (let index = 0; index < safe.contents.length; index += 1) {
    const itemId = `${safe.safeItemId}_contents_${index}`;
    newMatchItems.push({ item_id: itemId, item_type: safe.contents[index] });
    newTileItemIds.push(itemId);
    revealedIds.push(itemId);
  }
  if (tile) {
    tile.itemIds = newTileItemIds;
  }
  match.items = newMatchItems;
  character.discoveredItemIds = [...new Set([...discovered, ...revealedIds])];
  return revealedIds;
}

export function instantUnlockWithLockpick(
  match: MatchRecord,
  safe: NonNullable<MatchRecord["safeContainers"]>[number],
  character: PlannedActionParticipant["character"],
  playerId: string,
  hasDexterity1: boolean,
  tileId: string
): ReplayEvent {
  character.lockpickProgress = undefined;
  if (!hasDexterity1) consumeCarriedItem(character, "lockpick");
  const contents = [...safe.contents];
  const revealedIds = openSafe(match, safe, character);
  if (character.actionPlan?.secondary?.actionId === ActionLibrary.pick_lock.id) {
    clearPlanByKey(character, "secondary");
  }
  return {
    kind: "player",
    importance: 1,
    actorId: playerId,
    action: {
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
    },
  };
}

export function checkOngoingLockpickWithItem(
  match: MatchRecord,
  events: ReplayEvent[]
): void {
  const safes = match.safeContainers ?? [];
  for (const playerId in match.playerCharacters ?? {}) {
    const character = match.playerCharacters?.[playerId];
    if (!character || !character.lockpickProgress) {
      continue;
    }
    const tileId = character.position?.tileId;
    if (!tileId || tileId !== character.lockpickProgress.tileId) {
      continue;
    }
    const hasLockpick = hasCarriedItem(character, "lockpick");
    if (!hasLockpick) {
      continue;
    }
    const safe = safes.find(
      (entry) =>
        entry.tileId === tileId &&
        entry.safeItemId === character.lockpickProgress?.safeItemId &&
        !entry.opened
    );
    if (!safe) {
      continue;
    }
    const dexRank = getSkillRank(character, "dexterity1");
    const hasDexterity1 = dexRank > 0;
    const event = instantUnlockWithLockpick(
      match,
      safe,
      character,
      playerId,
      hasDexterity1,
      tileId
    );
    events.push(event);
  }
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
      events.push({ kind: "player",
  importance: 1, actorId: participant.playerId, action: {
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
      events.push(
        instantUnlockWithLockpick(
          match,
          safe,
          character,
          participant.playerId,
          hasDexterity1,
          tileId
        )
      );
      continue;
    }
    if (turnsCompleted < required) {
      character.lockpickProgress = { tileId, safeItemId: safe.safeItemId, turnsCompleted };
      if (participant.plan.actionId === ActionLibrary.pick_lock.id) {
        clearPlanByKey(character, participant.planKey);
      }
      events.push({ kind: "player",
  importance: 1, actorId: participant.playerId, action: {
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
    events.push({ kind: "player",
  importance: 1, actorId: participant.playerId, action: {
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
