/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type { ReplayPlayerEvent } from "@shared";
import type { PlannedActionParticipant } from "./utils";
import { BaseAttackAction } from "./classes/BaseAttackAction";

export class KnifeAttackAction extends BaseAttackAction {
  readonly baseDamage = 4;
}

const knifeAttackAction = new KnifeAttackAction();

export function executeKnifeAttackAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return knifeAttackAction.execute(participants, match);
}
