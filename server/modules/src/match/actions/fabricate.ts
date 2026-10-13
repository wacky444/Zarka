import {
  ActionLibrary,
  LocalizationType,
  getSkillRank,
  isCraftableItemId
} from "@shared";
import type {
  FabricateReplayMetadata,
  ReplayPlayerEvent
} from "@shared";
import type { MatchRecord } from "../../models/types";
import { BaseAction } from "./classes/BaseAction";
import type { PlannedActionParticipant } from "./utils";
import { createFailedActionEvent } from "./utils";
import { applyInventoryTransform } from "./itemTransform";

function isAtWorkshop(
  match: MatchRecord,
  participant: PlannedActionParticipant
): boolean {
  const position = participant.character.position;
  const tiles = match.map?.tiles ?? [];
  const tileById = position?.tileId
    ? tiles.find((entry) => entry.id === position.tileId)
    : undefined;
  const tile =
    tileById ??
    tiles.find(
      (entry) =>
        entry.coord.q === position?.coord.q &&
        entry.coord.r === position?.coord.r
    );
  return tile?.localizationType === LocalizationType.Workshop;
}

export class FabricateAction extends BaseAction {
  protected override readonly shouldShuffleParticipants = false;

  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    for (const participant of roster) {
      const rawItemId: unknown = participant.plan.craftedItemId;
      const itemId = isCraftableItemId(rawItemId) ? rawItemId : null;
      let failureReason:
        | FabricateReplayMetadata["reason"]
        | undefined;
      if (!itemId) {
        failureReason = "invalid_selection";
      } else if (
        !isAtWorkshop(match, participant) &&
        getSkillRank(participant.character, "dexterity4") === 0
      ) {
        failureReason = "location_skill_requirement";
      } else {
        const failure = applyInventoryTransform(participant.character, [], [
          { itemId, quantity: 1 }
        ]);
        if (failure) {
          failureReason = failure === "inventory_capacity"
            ? "inventory_capacity"
            : "invalid_selection";
        }
      }

      if (failureReason) {
        events.push(
          createFailedActionEvent(participant, ActionLibrary.fabricate.id, {
            reason: failureReason,
            ...(itemId ? { craftedItemId: itemId } : {})
          })
        );
      } else if (itemId) {
        const progression = participant.character.progression;
        progression.experience =
          (Number.isFinite(progression.experience)
            ? Math.max(0, progression.experience)
            : 0) + 2;
        const coord = participant.character.position?.coord;
        const metadata: FabricateReplayMetadata = {
          craftedItemId: itemId,
          outcome: "success"
        };
        events.push({
          kind: "player",
          actorId: participant.playerId,
          action: {
            actionId: ActionLibrary.fabricate.id,
            ...(coord ? { originLocation: { ...coord } } : {}),
            ...(coord ? { targetLocation: { ...coord } } : {}),
            metadata: { ...metadata }
          }
        });
      }

      this.clearPlan(participant);
      match.playerCharacters![participant.playerId] = participant.character;
    }
    return events;
  }
}

const fabricateAction = new FabricateAction();

export function executeFabricateAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return fabricateAction.execute(participants, match);
}
