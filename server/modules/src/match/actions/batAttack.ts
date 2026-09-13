/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type { ActionId, ReplayPlayerEvent } from "@shared";
import { ActionLibrary } from "@shared";
import { hasCarriedItem, type PlannedActionParticipant } from "./utils";
import { BaseAttackAction } from "./classes/BaseAttackAction";
import { getUsableExtraExecutions } from "../../utils/energy";

export class BatAttackAction extends BaseAttackAction {
  readonly baseDamage = 5;

  protected override getBaseDamage(
    participant: PlannedActionParticipant,
    _targetId: string,
    _match: MatchRecord
  ): number {
    const hasNailBat = hasCarriedItem(participant.character, "nail_bat");
    const weaponBase = hasNailBat ? 7 : 5;
    const actionId = participant.plan.actionId as ActionId;
    const definition = actionId ? ActionLibrary[actionId] : undefined;
    const usableExtra = definition
      ? getUsableExtraExecutions(
          participant.character,
          participant.plan,
          definition
        )
      : 0;

    return weaponBase + usableExtra;
  }

  protected override getActionMetadata(
    participant: PlannedActionParticipant,
    _match: MatchRecord
  ): Record<string, unknown> {
    const hasNailBat = hasCarriedItem(participant.character, "nail_bat");
    return {
      weaponUsed: hasNailBat ? "nail_bat" : "bat",
    };
  }
}

const batAttackAction = new BatAttackAction();

export function executeBatAttackAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return batAttackAction.execute(participants, match);
}
