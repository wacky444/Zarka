/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { ActionCategory, ActionLibrary, type ActionId } from "@shared";
import { MatchRecord } from "../models/types";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import type { ActionSubmission, Axial, PlayerPlannedAction } from "@shared";
import {
  getActionCooldownRemaining,
  isActionOnCooldown,
  updateCharacterCooldowns,
} from "../match/actions/cooldowns";
import { clearSecondaryPlan } from "../match/actions/utils";

export function updateSecondaryActionRpc(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx || !ctx.userId) {
    throw makeNakamaError("No user context", nkruntime.Codes.INVALID_ARGUMENT);
  }
  if (!payload || payload === "") {
    throw makeNakamaError("Missing payload", nkruntime.Codes.INVALID_ARGUMENT);
  }
  let json: any;
  try {
    json = JSON.parse(payload);
  } catch {
    throw makeNakamaError("bad_json", nkruntime.Codes.INVALID_ARGUMENT);
  }
  const matchId: string | undefined = json.match_id;
  const submissionRaw: unknown = json.submission;
  const submission: ActionSubmission | null =
    submissionRaw === null || submissionRaw === undefined
      ? null
      : (submissionRaw as ActionSubmission);
  if (!matchId) {
    throw makeNakamaError(
      "match_id required",
      nkruntime.Codes.INVALID_ARGUMENT
    );
  }
  const normalizeActionId = (raw: unknown) =>
    typeof raw === "string" ? raw.trim() : "";
  let actionId = "";
  let normalizedActionId: ActionId | null = null;
  let targetLocation: Axial | undefined;
  let targetPlayerIds: string[] | undefined;
  if (submission) {
    actionId = normalizeActionId(submission.actionId);
    if (actionId.length === 0) {
      throw makeNakamaError(
        "action_id required",
        nkruntime.Codes.INVALID_ARGUMENT
      );
    }
    const candidate = actionId as ActionId;
    const definition = ActionLibrary[candidate];
    if (!definition) {
      throw makeNakamaError("invalid_action", nkruntime.Codes.INVALID_ARGUMENT);
    }
    if (!definition.developed) {
      throw makeNakamaError(
        "action_not_available",
        nkruntime.Codes.FAILED_PRECONDITION
      );
    }
    if (definition.category !== ActionCategory.Secondary) {
      throw makeNakamaError(
        "invalid_action_category",
        nkruntime.Codes.INVALID_ARGUMENT
      );
    }
    normalizedActionId = candidate;
    const locationCandidate = submission.targetLocationId as Axial | undefined;
    if (locationCandidate) {
      const { q, r } = locationCandidate as Record<string, unknown>;
      const qNum = typeof q === "number" ? q : Number(q);
      const rNum = typeof r === "number" ? r : Number(r);
      if (isNaN(qNum) || isNaN(rNum)) {
        throw makeNakamaError(
          "invalid_target_location",
          nkruntime.Codes.INVALID_ARGUMENT
        );
      }
      targetLocation = { q: qNum, r: rNum };
    }
    const rawTargetPlayers = submission.targetPlayerIds;
    if (Array.isArray(rawTargetPlayers)) {
      const filtered = rawTargetPlayers
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0);
      targetPlayerIds = filtered.length > 0 ? filtered : undefined;
    }
  }
  const clearAction = !submission;
  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);
  const read = storage.getMatch(matchId);
  if (!read) {
    throw makeNakamaError("not_found", nkruntime.Codes.NOT_FOUND);
  }
  const match: MatchRecord = read.match;
  if (!match.players || match.players.indexOf(ctx.userId) === -1) {
    throw makeNakamaError("not_in_match", nkruntime.Codes.PERMISSION_DENIED);
  }
  if (!match.playerCharacters) {
    throw makeNakamaError("no_character", nkruntime.Codes.FAILED_PRECONDITION);
  }
  const character = match.playerCharacters[ctx.userId];
  if (!character) {
    throw makeNakamaError("no_character", nkruntime.Codes.FAILED_PRECONDITION);
  }
  const currentTurn = match.current_turn ?? 0;
  updateCharacterCooldowns(character, currentTurn);
  character.actionPlan = character.actionPlan ?? {};
  if (clearAction) {
    clearSecondaryPlan(character);
  } else {
    const previous: PlayerPlannedAction =
      character.actionPlan.secondary ?? ({ actionId } as PlayerPlannedAction);
    const nextPlan: PlayerPlannedAction = { ...previous, actionId };
    if (
      normalizedActionId &&
      isActionOnCooldown(character, normalizedActionId, currentTurn)
    ) {
      const remaining = getActionCooldownRemaining(
        character,
        normalizedActionId,
        currentTurn
      );
      throw makeNakamaError(
        `action_on_cooldown:${remaining}`,
        nkruntime.Codes.FAILED_PRECONDITION
      );
    }
    if (normalizedActionId) {
      nextPlan.actionId = normalizedActionId;
    }
    if (targetLocation) {
      nextPlan.targetLocationId = targetLocation;
    } else if (nextPlan.targetLocationId) {
      delete nextPlan.targetLocationId;
    }
    if (targetPlayerIds && targetPlayerIds.length > 0) {
      nextPlan.targetPlayerIds = targetPlayerIds;
    } else if (nextPlan.targetPlayerIds) {
      delete nextPlan.targetPlayerIds;
    }
    character.actionPlan.secondary = nextPlan;
  }
  storage.writeMatch(match, read.version);
  const response: import("@shared").UpdateSecondaryActionPayload = {
    ok: true,
    match_id: matchId,
    user_id: ctx.userId,
    action_id: clearAction ? undefined : actionId,
    targetLocationId: clearAction ? undefined : targetLocation,
    targetPlayerIds:
      clearAction || !targetPlayerIds || targetPlayerIds.length === 0
        ? undefined
        : targetPlayerIds,
  };
  return JSON.stringify(response);
}
