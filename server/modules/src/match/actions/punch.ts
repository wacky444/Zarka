/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type { ReplayPlayerEvent } from "@shared";
import type { PlannedActionParticipant } from "./utils";
import { BaseAttackAction } from "./classes/BaseAttackAction";

export class PunchAction extends BaseAttackAction {
  readonly baseDamage = 2;
}

const punchAction = new PunchAction();

export function executePunchAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return punchAction.execute(participants, match);
}
