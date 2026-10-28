import {
  ActionLibrary,
  LocalizationType,
  getSkillRank,
  isCraftableItemId,
  isDexterity3ProductId
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
import { isCharacterIncapacitated } from "../../utils/playerCharacter";
import { awardExperience } from "../progression";

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
        const coord = participant.character.position?.coord;
        const metadata: FabricateReplayMetadata = {
          craftedItemId: itemId,
          outcome: "success"
        };
        events.push({
          kind: "player",
          importance: 1,
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

export function executeDexterity3Fabrication(
  match: MatchRecord,
  resolvedTurn: number
): ReplayPlayerEvent[] {
  const events: ReplayPlayerEvent[] = [];
  for (const [playerId, character] of Object.entries(match.playerCharacters ?? {})) {
    const itemId = character.dexterity3SelectedItemId;
    const availableOnTurn = character.dexterity3AvailableOnTurn ?? 0;
    if (
      !itemId ||
      isCharacterIncapacitated(character) ||
      getSkillRank(character, "dexterity3") === 0 ||
      resolvedTurn < availableOnTurn
    ) {
      continue;
    }
    const failure = isDexterity3ProductId(itemId)
      ? applyInventoryTransform(character, [], [{ itemId, quantity: 1 }])
      : "invalid_selection";
    if (failure) {
      events.push({
        kind: "player",
        importance: 1,
        actorId: playerId,
        action: {
          actionId: ActionLibrary.fabricate.id,
          metadata: {
            attemptedActionId: ActionLibrary.fabricate.id,
            craftedItemId: itemId,
            outcome: "failure",
            reason: failure === "inventory_capacity" ? "inventory_capacity" : "invalid_selection",
            dexterity3: true,
          },
        },
      });
      continue;
    }
    character.dexterity3SelectedItemId = undefined;
    character.dexterity3AvailableOnTurn = resolvedTurn + 7;
    const awarded = awardExperience(character, ActionLibrary.fabricate.experience?.base ?? 0);
    const coord = character.position?.coord;
    events.push({
      kind: "player",
      importance: 1,
      actorId: playerId,
      action: {
        actionId: ActionLibrary.fabricate.id,
        ...(coord ? { originLocation: { ...coord }, targetLocation: { ...coord } } : {}),
        metadata: {
          craftedItemId: itemId,
          outcome: "success",
          dexterity3: true,
          experienceGained: awarded.experienceGained,
          levelsGained: awarded.levelsGained,
        },
      },
    });
  }
  return events;
}
