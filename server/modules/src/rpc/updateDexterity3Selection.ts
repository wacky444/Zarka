/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { getSkillRank, isDexterity3ProductId } from "@shared";
import type { MatchRecord } from "../models/types";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { isCharacterIncapacitated } from "../utils/playerCharacter";

export function updateDexterity3SelectionRpc(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx?.userId) throw makeNakamaError("No user context", nkruntime.Codes.INVALID_ARGUMENT);
  let json: { match_id?: unknown; item_id?: unknown };
  try {
    json = JSON.parse(payload) as { match_id?: unknown; item_id?: unknown };
  } catch {
    throw makeNakamaError("bad_json", nkruntime.Codes.INVALID_ARGUMENT);
  }
  if (typeof json.match_id !== "string" || !json.match_id) {
    throw makeNakamaError("match_id required", nkruntime.Codes.INVALID_ARGUMENT);
  }
  const itemId = json.item_id === null ? null : json.item_id;
  if (itemId !== null && !isDexterity3ProductId(itemId)) {
    throw makeNakamaError("invalid_dexterity3_product", nkruntime.Codes.INVALID_ARGUMENT);
  }
  const storage = new StorageService(createNakamaWrapper(nk));
  const read = storage.getMatch(json.match_id);
  if (!read) throw makeNakamaError("not_found", nkruntime.Codes.NOT_FOUND);
  const match: MatchRecord = read.match;
  if (!match.players?.includes(ctx.userId)) throw makeNakamaError("not_in_match", nkruntime.Codes.PERMISSION_DENIED);
  if (match.removed !== 0) throw makeNakamaError("match_ended", nkruntime.Codes.FAILED_PRECONDITION);
  const character = match.playerCharacters?.[ctx.userId];
  if (!character) throw makeNakamaError("no_character", nkruntime.Codes.FAILED_PRECONDITION);
  if (isCharacterIncapacitated(character)) throw makeNakamaError("character_incapacitated", nkruntime.Codes.FAILED_PRECONDITION);
  if (getSkillRank(character, "dexterity3") === 0) throw makeNakamaError("skill_required:dexterity3", nkruntime.Codes.FAILED_PRECONDITION);
  character.dexterity3SelectedItemId = itemId ?? undefined;
  storage.writeMatch(match, read.version);
  return JSON.stringify({ ok: true, match_id: match.match_id, item_id: character.dexterity3SelectedItemId ?? null });
}
