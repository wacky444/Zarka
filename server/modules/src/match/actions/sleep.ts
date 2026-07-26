/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type { ReplayPlayerEvent } from "@shared";
import type { PlannedActionParticipant } from "./utils";
import { BaseSelfHealAction } from "./classes/BaseSelfHealAction";

export class SleepAction extends BaseSelfHealAction {
  readonly healAmount = 2;
}

const sleepAction = new SleepAction();

export function executeSleepAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return sleepAction.execute(participants, match);
}
