/// <reference path="../../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../../models/types";
import type { ReplayPlayerEvent } from "@shared";
import {
  clearPlanByKey,
  sortParticipantsBySpeed,
  type PlannedActionParticipant,
} from "../utils";

export abstract class BaseAction {
  protected readonly shouldShuffleParticipants: boolean = true;

  public execute(
    participants: PlannedActionParticipant[],
    match: MatchRecord
  ): ReplayPlayerEvent[] {
    const roster = sortParticipantsBySpeed(
      participants,
      this.shouldShuffleParticipants
    );
    return this.processRoster(roster, match);
  }

  protected abstract processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord
  ): ReplayPlayerEvent[];

  protected clearPlan(participant: PlannedActionParticipant): void {
    clearPlanByKey(participant.character, participant.planKey);
  }
}
