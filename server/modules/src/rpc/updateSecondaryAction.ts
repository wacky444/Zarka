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
    throw makeNakamaError("bad_json", 3);
  }
  const matchId: string | undefined = json.match_id;
  const submissionRaw: unknown = json.submission;
  const submission: ActionSubmission | null =
    submissionRaw === null || submissionRaw === undefined
      ? null
      : (submissionRaw as ActionSubmission);
  if (!matchId) {
    throw makeNakamaError("match_id required", 3);
  }
  const normalizeActionId = (raw: unknown) =>
    typeof raw === "string" ? raw.trim() : "";
  let actionId = "";
  let normalizedActionId: ActionId | null = null;
  let targetLocation: Axial | undefined;
  let targetPlayerIds: string[] | undefined;
  let targetItemIds: string[] | undefined;
  if (submission) {
    actionId = normalizeActionId(submission.actionId);
    if (actionId.length === 0) {
      throw makeNakamaError("action_id required", 3);
    }
    const candidate = actionId as ActionId;
    const definition = ActionLibrary[candidate];
    if (!definition) {
      throw makeNakamaError("invalid_action", 3);
    }
    if (!definition.developed) {
      throw makeNakamaError("action_not_available", 9);
    }
    if (definition.category !== ActionCategory.Secondary) {
      throw makeNakamaError("invalid_action_category", 3);
    }
    normalizedActionId = candidate;
    const locationCandidate = submission.targetLocationId as Axial | undefined;
    if (locationCandidate) {
      const rawCandidate = locationCandidate as unknown as {
        q?: unknown;
        r?: unknown;
      };
      const qNum =
        typeof rawCandidate.q === "number"
          ? rawCandidate.q
          : Number(rawCandidate.q);
      const rNum =
        typeof rawCandidate.r === "number"
          ? rawCandidate.r
          : Number(rawCandidate.r);
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
    const rawTargetItems = submission.targetItemIds;
    if (Array.isArray(rawTargetItems)) {
      const seen: Record<string, true> = {};
      const filtered: string[] = [];
      for (const value of rawTargetItems) {
        if (typeof value !== "string") {
          continue;
        }
        const trimmed = value.trim();
        if (!trimmed) {
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(seen, trimmed)) {
          continue;
        }
        seen[trimmed] = true;
        filtered.push(trimmed);
      }
      targetItemIds = filtered.length > 0 ? filtered : undefined;
    }
  }
  const clearAction = !submission;
  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);
  const read = storage.getMatch(matchId);
  if (!read) {
    throw makeNakamaError("not_found", 5);
  }
  const match: MatchRecord = read.match;
  if (!match.players || match.players.indexOf(ctx.userId) === -1) {
    throw makeNakamaError("not_in_match", 7);
  }
  if (!match.playerCharacters) {
    throw makeNakamaError("no_character", 9);
  }
  const character = match.playerCharacters[ctx.userId];
  if (!character) {
    throw makeNakamaError("no_character", 9);
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
    if (targetItemIds && targetItemIds.length > 0) {
      nextPlan.targetItemIds = targetItemIds;
    } else if (nextPlan.targetItemIds) {
      delete nextPlan.targetItemIds;
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
    targetItemIds:
      clearAction || !targetItemIds || targetItemIds.length === 0
        ? undefined
        : targetItemIds,
  };
  return JSON.stringify(response);
}
