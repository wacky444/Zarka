/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { SkillLibrary, type SkillId, type UpgradeSkillPayload } from "@shared";
import { MatchRecord } from "../models/types";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { isCharacterDead } from "../utils/playerCharacter";

export function upgradeSkillRpc(
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
  if (!matchId) {
    throw makeNakamaError(
      "match_id required",
      nkruntime.Codes.INVALID_ARGUMENT
    );
  }

  const skillIds: SkillId[] = [];
  if (Array.isArray(json.skill_ids)) {
    for (const item of json.skill_ids) {
      if (typeof item === "string" && item.trim().length > 0) {
        skillIds.push(item.trim() as SkillId);
      }
    }
  } else if (
    typeof json.skill_id === "string" &&
    json.skill_id.trim().length > 0
  ) {
    skillIds.push(json.skill_id.trim() as SkillId);
  }

  if (skillIds.length === 0) {
    throw makeNakamaError(
      "skill_id or skill_ids required",
      nkruntime.Codes.INVALID_ARGUMENT
    );
  }

  let totalCost = 0;
  for (const id of skillIds) {
    const definition = SkillLibrary[id];
    if (!definition) {
      throw makeNakamaError("invalid_skill", nkruntime.Codes.INVALID_ARGUMENT);
    }
    if (!definition.implemented) {
      throw makeNakamaError(
        "skill_not_implemented",
        nkruntime.Codes.FAILED_PRECONDITION
      );
    }
    totalCost += definition.cost;
  }

  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);
  const read = storage.getMatch(matchId);
  if (!read) {
    throw makeNakamaError("not_found", nkruntime.Codes.NOT_FOUND);
  }
  const match: MatchRecord = read.match;
  if (
    !Array.isArray(match.players) ||
    match.players.indexOf(ctx.userId) === -1
  ) {
    throw makeNakamaError("not_in_match", nkruntime.Codes.PERMISSION_DENIED);
  }

  const character = match.playerCharacters?.[ctx.userId];
  if (!character) {
    throw makeNakamaError("character_not_found", nkruntime.Codes.NOT_FOUND);
  }
  if (isCharacterDead(character)) {
    throw makeNakamaError(
      "character_dead",
      nkruntime.Codes.FAILED_PRECONDITION
    );
  }

  const progression = character.progression ?? {
    level: 1,
    experience: 0,
    experienceForNextLevel: 10,
    availableSkillPoints: 0,
    spentSkillPoints: 0
  };
  const availablePoints = progression.availableSkillPoints ?? 0;
  if (availablePoints < totalCost) {
    throw makeNakamaError(
      "not_enough_skill_points",
      nkruntime.Codes.FAILED_PRECONDITION
    );
  }

  const currentAbilities = Array.isArray(character.abilities)
    ? [...character.abilities]
    : [];
  const skillCountMap: Record<string, number> = {};
  for (const id of currentAbilities) {
    skillCountMap[id] = (skillCountMap[id] ?? 0) + 1;
  }
  for (const id of skillIds) {
    const nextCount = (skillCountMap[id] ?? 0) + 1;
    const definition = SkillLibrary[id];
    if (nextCount > definition.max) {
      throw makeNakamaError(
        "skill_max_reached",
        nkruntime.Codes.FAILED_PRECONDITION
      );
    }
    skillCountMap[id] = nextCount;
  }

  progression.availableSkillPoints = availablePoints - totalCost;
  progression.spentSkillPoints =
    (progression.spentSkillPoints ?? 0) + totalCost;
  character.progression = progression;

  for (const id of skillIds) {
    currentAbilities.push(id);
    if (id === "vitality") {
      if (!character.stats) {
        character.stats = {
          health: { current: 10, max: 12, knockoutThreshold: 5, injuredMax: 5 },
          energy: { current: 10, max: 20 },
          load: { current: 14, max: 25 },
          speed: 0,
          sympathy: 0,
          baseViewRange: 0
        };
      }
      if (!character.stats.health) {
        character.stats.health = {
          current: 10,
          max: 12,
          knockoutThreshold: 5,
          injuredMax: 5
        };
      }
      character.stats.health.max += 1;
    }
  }
  character.abilities = currentAbilities;

  storage.writeMatch(match, read.version);

  const response: UpgradeSkillPayload = {
    ok: true,
    match_id: matchId,
    user_id: ctx.userId,
    skill_id: skillIds.length === 1 ? skillIds[0] : undefined,
    skill_ids: skillIds,
    character
  };
  return JSON.stringify(response);
}
