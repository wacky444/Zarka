/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import type { DonateZarkansPayload, DonateZarkansRequest } from "@shared";
import type { MatchRecord } from "../models/types";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { makeNakamaError } from "../utils/errors";
import { getRuntimeMatchId } from "../utils/matchIds";
import { isCharacterDead } from "../utils/playerCharacter";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getBalance(character: MatchRecord["playerCharacters"][string]): number {
  const balance = character.economy?.zarkans;
  return typeof balance === "number" && Number.isFinite(balance)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(balance)))
    : 0;
}

export function donateZarkansRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx?.userId) {
    throw makeNakamaError("No user context", nkruntime.Codes.INVALID_ARGUMENT);
  }
  if (!payload) {
    throw makeNakamaError("Missing payload", nkruntime.Codes.INVALID_ARGUMENT);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    throw makeNakamaError("bad_json", nkruntime.Codes.INVALID_ARGUMENT);
  }
  if (!isRecord(parsed)) {
    throw makeNakamaError("bad_payload", nkruntime.Codes.INVALID_ARGUMENT);
  }

  const matchId =
    typeof parsed.match_id === "string" ? parsed.match_id.trim() : "";
  const recipientId =
    typeof parsed.recipient_id === "string" ? parsed.recipient_id.trim() : "";
  const amount = typeof parsed.amount === "number" ? parsed.amount : NaN;
  if (!matchId || !recipientId || !Number.isSafeInteger(amount) || amount <= 0) {
    throw makeNakamaError(
      "match_id, recipient_id and positive integer amount required",
      nkruntime.Codes.INVALID_ARGUMENT
    );
  }
  const request: DonateZarkansRequest = {
    match_id: matchId,
    recipient_id: recipientId,
    amount
  };

  const wrapper = createNakamaWrapper(nk);
  const storage = new StorageService(wrapper);
  const read = storage.getMatch(request.match_id);
  if (!read) {
    throw makeNakamaError("not_found", nkruntime.Codes.NOT_FOUND);
  }

  const match: MatchRecord = read.match;
  if (!Array.isArray(match.players) || !match.players.includes(ctx.userId)) {
    throw makeNakamaError("not_in_match", nkruntime.Codes.PERMISSION_DENIED);
  }
  if (match.started !== true || match.removed !== 0) {
    throw makeNakamaError(
      "match_not_active",
      nkruntime.Codes.FAILED_PRECONDITION
    );
  }
  if (recipientId === ctx.userId || !match.players.includes(recipientId)) {
    throw makeNakamaError(
      "invalid_donation_recipient",
      nkruntime.Codes.INVALID_ARGUMENT
    );
  }

  const donor = match.playerCharacters?.[ctx.userId];
  const recipient = match.playerCharacters?.[recipientId];
  if (!donor || !recipient) {
    throw makeNakamaError("character_not_found", nkruntime.Codes.NOT_FOUND);
  }
  if (match.deadCharacters?.[ctx.userId] === true || isCharacterDead(donor)) {
    throw makeNakamaError(
      "character_dead",
      nkruntime.Codes.FAILED_PRECONDITION
    );
  }
  if (
    match.deadCharacters?.[recipientId] === true ||
    isCharacterDead(recipient)
  ) {
    throw makeNakamaError(
      "invalid_donation_recipient",
      nkruntime.Codes.FAILED_PRECONDITION
    );
  }

  const donorBalance = getBalance(donor);
  const recipientBalance = getBalance(recipient);
  if (donorBalance < amount) {
    throw makeNakamaError(
      "insufficient_zarkans",
      nkruntime.Codes.FAILED_PRECONDITION
    );
  }
  if (recipientBalance > Number.MAX_SAFE_INTEGER - amount) {
    throw makeNakamaError(
      "recipient_balance_limit",
      nkruntime.Codes.FAILED_PRECONDITION
    );
  }

  donor.economy = donor.economy ?? {
    zarkans: donorBalance,
    pendingZarkans: 0,
    incomeInterval: 1
  };
  recipient.economy = recipient.economy ?? {
    zarkans: recipientBalance,
    pendingZarkans: 0,
    incomeInterval: 1
  };
  donor.economy.zarkans = donorBalance - amount;
  recipient.economy.zarkans = recipientBalance + amount;

  try {
    storage.writeMatch(match, read.version);
  } catch {
    throw makeNakamaError("match_update_conflict", nkruntime.Codes.ABORTED);
  }

  try {
    wrapper.matchSignal(
      getRuntimeMatchId(match),
      JSON.stringify({
        type: "zarkans_donated",
        match_id: match.match_id,
        donor_id: ctx.userId,
        recipient_id: recipientId
      })
    );
  } catch (error) {
    logger.warn("donate_zarkans realtime sync failed: %s", String(error));
  }

  const result: DonateZarkansPayload = {
    ok: true,
    match_id: match.match_id,
    donor_id: ctx.userId,
    recipient_id: recipientId,
    amount,
    donor_balance: donor.economy.zarkans
  };
  return JSON.stringify(result);
}
