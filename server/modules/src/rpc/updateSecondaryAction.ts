/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  ActionCategory,
  ActionLibrary,
  getSkillEffectTotal,
  type ActionId
} from "@shared";
import { MatchRecord } from "../models/types";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import type { ActionSubmission, Axial, PlayerPlannedAction } from "@shared";
import {
  getActionCooldownRemaining,
  isActionOnCooldown,
  updateCharacterCooldowns
} from "../match/actions/cooldowns";
import {
  clearExtraSecondaryPlan,
  clearSecondaryPlan
} from "../match/actions/utils";
import { isCharacterIncapacitated } from "../utils/playerCharacter";

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
  const planKey: "secondary" | "extraSecondary" =
    json.slot === "extra_secondary" ? "extraSecondary" : "secondary";
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
  let extraExecutions: number | undefined;
  let prioritizeFoodDrink = false;
  let sellInstead = false;
  let singleTarget = false;
  let inspectAdditionalTarget = false;
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
    prioritizeFoodDrink = submission.prioritizeFoodDrink === true;
    sellInstead = submission.sellInstead === true;
    singleTarget = submission.singleTarget === true;
    inspectAdditionalTarget = submission.inspectAdditionalTarget === true;
    if (inspectAdditionalTarget && candidate !== "inspect") {
      throw makeNakamaError(
        "inspect_additional_target_requires_inspect",
        nkruntime.Codes.INVALID_ARGUMENT
      );
    }
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
    const rawExtraExecutions = submission.extraExecutions;
    if (
      typeof rawExtraExecutions === "number" &&
      isFinite(rawExtraExecutions)
    ) {
      const clamped = Math.max(0, Math.floor(rawExtraExecutions));
      const extraExecutionDef = definition.extraExecution;
      if (clamped > 0 && !extraExecutionDef) {
        throw makeNakamaError(
          "action_does_not_support_extra_execution",
          nkruntime.Codes.INVALID_ARGUMENT
        );
      }
      if (
        clamped > 0 &&
        clamped > (extraExecutionDef?.maxRepetitions ?? 1)
      ) {
        throw makeNakamaError(
          "too_many_extra_executions",
          nkruntime.Codes.INVALID_ARGUMENT
        );
      }
      extraExecutions = clamped > 0 ? clamped : undefined;
    }
    if (inspectAdditionalTarget) {
      if (!extraExecutions || extraExecutions < 1) {
        throw makeNakamaError(
          "inspect_additional_target_requires_extra_execution",
          nkruntime.Codes.INVALID_ARGUMENT
        );
      }
      if (!targetPlayerIds || targetPlayerIds.length < 2) {
        throw makeNakamaError(
          "inspect_additional_target_requires_two_players",
          nkruntime.Codes.INVALID_ARGUMENT
        );
      }
      if (targetPlayerIds[0] === targetPlayerIds[1]) {
        throw makeNakamaError(
          "inspect_additional_target_must_differ",
          nkruntime.Codes.INVALID_ARGUMENT
        );
      }
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
  if (match.removed && match.removed !== 0) {
    throw makeNakamaError(
      "match_ended",
      nkruntime.Codes.FAILED_PRECONDITION
    );
  }
  if (!match.playerCharacters) {
    throw makeNakamaError("no_character", 9);
  }
  const character = match.playerCharacters[ctx.userId];
  if (!character) {
    throw makeNakamaError("no_character", 9);
  }
  if (
    planKey === "extraSecondary" &&
    getSkillEffectTotal(character, "extra_secondary_action") < 1
  ) {
    throw makeNakamaError("skill_required:agility4", 9);
  }
  if (!clearAction && normalizedActionId) {
    const otherPlanKey =
      planKey === "extraSecondary" ? "secondary" : "extraSecondary";
    const otherActionId = character.actionPlan?.[otherPlanKey]?.actionId;
    if (otherActionId && otherActionId === normalizedActionId) {
      throw makeNakamaError(
        "duplicate_secondary_action",
        nkruntime.Codes.INVALID_ARGUMENT
      );
    }
  }
  if (prioritizeFoodDrink) {
    if (normalizedActionId !== "search") {
      throw makeNakamaError("search_priority_requires_search", 3);
    }
    if (getSkillEffectTotal(character, "search_food_drink_priority") < 1) {
      throw makeNakamaError("skill_required:perception5", 9);
    }
  }
  if (sellInstead && normalizedActionId !== "drop") {
    throw makeNakamaError("sell_requires_drop", 3);
  }
  const isDead = isCharacterIncapacitated(character);
  if (!clearAction && isDead) {
    throw makeNakamaError("character_incapacitated", 9);
  }
  const currentTurn = match.current_turn ?? 0;
  updateCharacterCooldowns(character, currentTurn);
  character.actionPlan = character.actionPlan ?? {};
  if (clearAction) {
    if (planKey === "extraSecondary") {
      clearExtraSecondaryPlan(character);
    } else {
      clearSecondaryPlan(character);
    }
  } else {
    const previous: PlayerPlannedAction =
      character.actionPlan[planKey] ?? ({ actionId } as PlayerPlannedAction);
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
    if (extraExecutions !== undefined) {
      if (extraExecutions > 0) {
        nextPlan.extraExecutions = extraExecutions;
      } else if (nextPlan.extraExecutions) {
        delete nextPlan.extraExecutions;
      }
    } else if (nextPlan.extraExecutions) {
      delete nextPlan.extraExecutions;
    }
    if (prioritizeFoodDrink) {
      nextPlan.prioritizeFoodDrink = true;
    } else {
      delete nextPlan.prioritizeFoodDrink;
    }
    if (sellInstead) {
      nextPlan.sellInstead = true;
    } else {
      delete nextPlan.sellInstead;
    }
    if (singleTarget) {
      nextPlan.singleTarget = true;
    } else {
      delete nextPlan.singleTarget;
    }
    if (inspectAdditionalTarget) {
      nextPlan.inspectAdditionalTarget = true;
    } else {
      delete nextPlan.inspectAdditionalTarget;
    }
    character.actionPlan[planKey] = nextPlan;
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
    extraExecutions: clearAction ? undefined : extraExecutions,
    prioritizeFoodDrink: clearAction ? undefined : prioritizeFoodDrink,
    sellInstead: clearAction ? undefined : sellInstead,
    singleTarget: clearAction ? undefined : singleTarget,
    inspectAdditionalTarget: clearAction
      ? undefined
      : inspectAdditionalTarget
  };
  return JSON.stringify(response);
}
