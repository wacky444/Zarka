/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type { ReplayPlayerEvent } from "@shared";
import type { PlannedActionParticipant } from "./utils";
import { BaseSelfHealAction } from "./classes/BaseSelfHealAction";

export class RecoverAction extends BaseSelfHealAction {
  readonly healAmount = 5;
}

const recoverAction = new RecoverAction();

export function executeRecoverAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return recoverAction.execute(participants, match);
}
