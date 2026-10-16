import type { ReplayEvent } from "@shared";
import { ActionLibrary } from "@shared";
import type { MatchRecord } from "../../models/types";
import type { PlannedActionParticipant } from "./utils";
import { clearPlanByKey, hasCarriedItem } from "./utils";

export function executePickLockAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord,
): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  const safes = match.safeContainers ?? [];
  const tiles = match.map?.tiles ?? [];
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
    const continuing = character.lockpickProgress?.tileId === tileId &&
      character.lockpickProgress.safeItemId === safe.safeItemId;
    const completed = continuing ? character.lockpickProgress!.turnsCompleted : 0;
    const required = character.abilities?.includes("dexterity1") ? 3 : 4;
    const turnsCompleted = completed + 1;
    if (turnsCompleted < required) {
      character.lockpickProgress = { tileId, safeItemId: safe.safeItemId, turnsCompleted };
      clearPlanByKey(character, participant.planKey);
      events.push({ kind: "player", actorId: participant.playerId, action: {
        actionId: ActionLibrary.pick_lock.id,
        metadata: { outcome: "progress", turnsCompleted, turnsRequired: required },
      }});
      continue;
    }
    character.lockpickProgress = undefined;
    safe.opened = true;
    const tile = tiles.find((entry) => entry.id === tileId);
    if (tile) tile.itemIds ??= [];
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
    clearPlanByKey(character, participant.planKey);
    events.push({ kind: "player", actorId: participant.playerId, action: {
      actionId: ActionLibrary.pick_lock.id,
      metadata: { outcome: "success", revealedItemIds: revealedIds },
    }});
  }
  return events;
}
