/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  ActionLibrary,
  TUTORIAL_BOT_ID,
  TUTORIAL_MATCH_METADATA_KEY,
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
import { isCharacterIncapacitated } from "../utils/playerCharacter";
import { parseAxial } from "../utils/location";
import { sendTutorialBotMessage } from "../match/TutorialBotChat";

export function updateMainActionRpc(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx || !ctx.userId) {
    throw makeNakamaError("No user context", 3);
  }
  if (!payload || payload === "") {
    throw makeNakamaError("Missing payload", 3);
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
  let secondTargetLocation: Axial | undefined;
  let targetPlayerIds: string[] | undefined;
  let secondTargetPlayerId: string | undefined;
  let targetItemIds: string[] | undefined;
  let extraExecutions: number | undefined;
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
    normalizedActionId = candidate;
    const rawTargetLocation = submission.targetLocationId;
    const parsedTargetLocation = parseAxial(rawTargetLocation, {
      coerceNumericCoordinates: true,
    });
    if (
      rawTargetLocation !== undefined &&
      rawTargetLocation !== null &&
      parsedTargetLocation === null
    ) {
      throw makeNakamaError("invalid_target_location", 3);
    }
    targetLocation = parsedTargetLocation ?? undefined;

    const rawSecondTargetLocation = submission.secondTargetLocationId;
    const parsedSecondTargetLocation = parseAxial(
      rawSecondTargetLocation,
      { coerceNumericCoordinates: true }
    );
    if (
      rawSecondTargetLocation !== undefined &&
      rawSecondTargetLocation !== null &&
      parsedSecondTargetLocation === null
    ) {
      throw makeNakamaError("invalid_target_location", 3);
    }
    secondTargetLocation = parsedSecondTargetLocation ?? undefined;
    const rawTargetPlayerId = submission.secondTargetPlayerId;
    if (typeof rawTargetPlayerId === "string") {
      const trimmed = rawTargetPlayerId.trim();
      secondTargetPlayerId = trimmed.length > 0 ? trimmed : undefined;
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
      const maxRepetitions =
        definition?.extraExecution?.maxRepetitions ??
        (definition?.extraExecution ? 1 : 0);
      const clamped = Math.max(
        0,
        Math.min(maxRepetitions, Math.floor(rawExtraExecutions))
      );
      if (!definition?.extraExecution && clamped > 0) {
        throw makeNakamaError("extra_execution_not_supported", 3);
      }
      extraExecutions = clamped > 0 ? clamped : undefined;
    }
    if (normalizedActionId !== "shoot_pistol" || !extraExecutions) {
      secondTargetLocation = undefined;
      secondTargetPlayerId = undefined;
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
    throw makeNakamaError("match_ended", nkruntime.Codes.FAILED_PRECONDITION);
  }
  if (!match.playerCharacters) {
    throw makeNakamaError("no_character", 9);
  }
  const character = match.playerCharacters[ctx.userId];
  if (!character) {
    throw makeNakamaError("no_character", 9);
  }
  const isIncapacitated = isCharacterIncapacitated(character);
  if (!clearAction && isIncapacitated) {
    throw makeNakamaError("character_incapacitated", 9);
  }
  const currentTurn = match.current_turn ?? 0;
  updateCharacterCooldowns(character, currentTurn);
  character.actionPlan = character.actionPlan ?? {};
  if (clearAction) {
    if (character.actionPlan.main) {
      delete character.actionPlan.main;
    }
    if (
      character.actionPlan.secondary === undefined &&
      character.actionPlan.extraSecondary === undefined &&
      character.actionPlan.nextMain === undefined &&
      character.actionPlan.main === undefined
    ) {
      delete character.actionPlan;
    }
  } else {
    const previous: PlayerPlannedAction =
      character.actionPlan.main ?? ({ actionId } as PlayerPlannedAction);
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
      throw makeNakamaError(`action_on_cooldown:${remaining}`, 9);
    }
    if (normalizedActionId) {
      nextPlan.actionId = normalizedActionId;
    }
    if (targetLocation) {
      nextPlan.targetLocationId = targetLocation;
    } else if (nextPlan.targetLocationId) {
      delete nextPlan.targetLocationId;
    }
    if (secondTargetLocation) {
      nextPlan.secondTargetLocationId = secondTargetLocation;
    } else if (nextPlan.secondTargetLocationId) {
      delete nextPlan.secondTargetLocationId;
    }
    if (secondTargetPlayerId) {
      nextPlan.secondTargetPlayerId = secondTargetPlayerId;
    } else if (nextPlan.secondTargetPlayerId) {
      delete nextPlan.secondTargetPlayerId;
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
    character.actionPlan.main = nextPlan;
  }
  storage.writeMatch(match, read.version);
  const bot = match.playerCharacters[TUTORIAL_BOT_ID];
  if (
    match.metadata?.[TUTORIAL_MATCH_METADATA_KEY] &&
    character.actionPlan?.main?.actionId === "axe_attack" &&
    character.inventory.carriedItems.some(
      (item) => item.itemId === "axe" && item.quantity > 0
    ) &&
    character.actionPlan.main.targetPlayerIds?.indexOf(TUTORIAL_BOT_ID) !== -1 &&
    character.position?.tileId === bot?.position?.tileId
  ) {
    sendTutorialBotMessage(match, "axe_ordering", nk, _logger);
  }
  const response: import("@shared").UpdateMainActionPayload = {
    ok: true,
    match_id: matchId,
    user_id: ctx.userId,
    action_id: clearAction ? undefined : actionId,
    targetLocationId: clearAction ? undefined : targetLocation,
    secondTargetLocationId: clearAction ? undefined : secondTargetLocation,
    secondTargetPlayerId: clearAction ? undefined : secondTargetPlayerId,
    targetPlayerIds:
      clearAction || !targetPlayerIds || targetPlayerIds.length === 0
        ? undefined
        : targetPlayerIds,
    targetItemIds:
      clearAction || !targetItemIds || targetItemIds.length === 0
        ? undefined
        : targetItemIds,
    extraExecutions: clearAction ? undefined : extraExecutions
  };
  return JSON.stringify(response);
}
