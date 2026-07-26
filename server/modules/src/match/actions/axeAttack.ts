/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type { ReplayPlayerEvent } from "@shared";
import type { PlannedActionParticipant } from "./utils";
import { BaseAttackAction } from "./classes/BaseAttackAction";

export class AxeAttackAction extends BaseAttackAction {
  readonly baseDamage = 8;
}

const axeAttackAction = new AxeAttackAction();

export function executeAxeAttackAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return axeAttackAction.execute(participants, match);
}
