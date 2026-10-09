/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  TUTORIAL_MATCH_METADATA_KEY,
  type ListMatchCardsPayload,
  type ListMatchCardsRequest
} from "@shared";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { buildMatchCardSummary } from "../services/matchCardSummary";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

function parseRequest(payload: string):
  | { request: Required<ListMatchCardsRequest> }
  | { error: string } {
  if (!payload) {
    return { request: { offset: 0, limit: DEFAULT_PAGE_SIZE } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { error: "bad_json" };
  }
  const record = asRecord(parsed);
  if (!record) {
    return { error: "invalid_pagination" };
  }
  const offset = record.offset ?? 0;
  const requestedLimit = record.limit ?? DEFAULT_PAGE_SIZE;
  if (
    typeof offset !== "number" ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    typeof requestedLimit !== "number" ||
    !Number.isSafeInteger(requestedLimit) ||
    requestedLimit < 1
  ) {
    return { error: "invalid_pagination" };
  }
  return {
    request: {
      offset,
      limit: Math.min(requestedLimit, MAX_PAGE_SIZE)
    }
  };
}

export function listMatchCardsRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx?.userId) {
    return JSON.stringify({ ok: false, error: "unauthorized" } satisfies ListMatchCardsPayload);
  }
  const parsed = parseRequest(payload);
  if ("error" in parsed) {
    return JSON.stringify({ ok: false, error: parsed.error } satisfies ListMatchCardsPayload);
  }

  try {
    const storage = new StorageService(createNakamaWrapper(nk));
    const matches = storage
      .listAllMatches()
      .map(({ match }) => match)
      .filter(
        (match) =>
          !match.metadata?.[TUTORIAL_MATCH_METADATA_KEY] &&
          (match.removed === 0 || match.removed === undefined)
      )
      .sort(
        (left, right) =>
          Number(right.created_at ?? 0) - Number(left.created_at ?? 0) ||
          left.match_id.localeCompare(right.match_id)
      );
    const { offset, limit } = parsed.request;
    const page = matches.slice(offset, offset + limit);
    const response: ListMatchCardsPayload = {
      ok: true,
      matches: page.map((match) => buildMatchCardSummary(match)),
      nextOffset:
        offset + page.length < matches.length ? offset + page.length : null
    };
    return JSON.stringify(response);
  } catch (error) {
    logger.error(
      "Error in list_match_cards: %s",
      (error as Error).message || String(error)
    );
    return JSON.stringify({
      ok: false,
      error: (error as Error).message || String(error)
    } satisfies ListMatchCardsPayload);
  }
}
