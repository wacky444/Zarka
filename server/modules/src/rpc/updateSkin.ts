/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { updateAccountMetadata } from "../services/accountMetadata";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

const VALID_BODIES: readonly string[] = [
  "body_human_white.png",
  "body_human_light.png",
  "body_human_tan.png",
  "body_orc.png",
];

function isValidBody(id: string): boolean {
  return VALID_BODIES.indexOf(id) !== -1;
}

function isValidShoe(id: string): boolean {
  const match = /^shoe_(\d{2})\.png$/.exec(id);
  if (!match) return false;
  const num = parseInt(match[1], 10);
  return num >= 1 && num <= 20;
}

function isValidShirt(id: string): boolean {
  const match = /^shirt_(\d{3})\.png$/.exec(id);
  if (!match) return false;
  const num = parseInt(match[1], 10);
  return num >= 1 && num <= 120;
}

function isValidHair(id: string): boolean {
  const match = /^hair_(\d{3})\.png$/.exec(id);
  if (!match) return false;
  const num = parseInt(match[1], 10);
  return num >= 1 && num <= 96;
}

function validateSkin(skin: unknown): import("@shared").Skin | null {
  const rec = asRecord(skin);
  if (!rec) return null;

  const body = asString(rec.body);
  const shoes = asString(rec.shoes);
  const shirt = asString(rec.shirt);
  const hair = asString(rec.hair);
  const hat = asString(rec.hat);

  if (body === undefined || !isValidBody(body)) return null;
  if (shoes === undefined || !isValidShoe(shoes)) return null;
  if (shirt === undefined || !isValidShirt(shirt)) return null;
  if (hair === undefined || !isValidHair(hair)) return null;
  if (hat !== undefined && hat !== "") return null;

  return { body, shoes, shirt, hair, hat: hat ?? "" };
}

export function updateSkinRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  const callerUserId = ctx?.userId;
  if (!callerUserId) {
    return JSON.stringify({
      error: "unauthorized",
    } satisfies import("@shared").UpdateSkinPayload);
  }

  let parsed: { skin?: unknown } | undefined;
  try {
    parsed = JSON.parse(payload) as { skin?: unknown };
  } catch {
    return JSON.stringify({
      error: "bad_json",
    } satisfies import("@shared").UpdateSkinPayload);
  }

  const skin = validateSkin(parsed?.skin);
  if (!skin) {
    return JSON.stringify({
      error: "invalid_skin",
    } satisfies import("@shared").UpdateSkinPayload);
  }

  let status: ReturnType<typeof updateAccountMetadata>;
  try {
    status = updateAccountMetadata(nk, callerUserId, (metadata) => {
      const existingZarka = asRecord(metadata.zarka);
      const existingCosmetics = asRecord(existingZarka?.cosmetics);
      return {
        ...metadata,
        zarka: {
          ...(existingZarka ?? {}),
          cosmetics: {
            ...(existingCosmetics ?? {}),
            selectedSkinId: skin,
          },
        },
      };
    });
  } catch (error) {
    logger.error(
      "update_skin account metadata update failed for user %s: %s",
      callerUserId,
      (error && (error as Error).message) || String(error),
    );
    return JSON.stringify({
      error: "internal_error",
    } satisfies import("@shared").UpdateSkinPayload);
  }

  if (status === "not_found") {
    return JSON.stringify({
      error: "not_found",
    } satisfies import("@shared").UpdateSkinPayload);
  }
  if (status === "busy") {
    logger.warn("update_skin account update busy for user %s", callerUserId);
    return JSON.stringify({
      error: "internal_error",
    } satisfies import("@shared").UpdateSkinPayload);
  }

  logger.info("update_skin success for user %s", callerUserId);

  return JSON.stringify({
    ok: true,
    skin,
  } satisfies import("@shared").UpdateSkinPayload);
}
