/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type { ReplayPlayerEvent } from "@shared";
import type { PlannedActionParticipant } from "./utils";
import { BaseAttackAction } from "./classes/BaseAttackAction";

export class ChainsawAttackAction extends BaseAttackAction {
  readonly baseDamage = 999;
}

const chainsawAttackAction = new ChainsawAttackAction();

export function executeChainsawAttackAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return chainsawAttackAction.execute(participants, match);
}
