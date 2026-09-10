/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

interface SignedRequestData {
  algorithm?: unknown;
  user_id?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function decodeFormValue(value: string): string {
  return decodeURIComponent(value.replace(/\+/g, " "));
}

function readFormValue(body: string, name: string): string | null {
  for (const part of body.split("&")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const key = decodeFormValue(part.slice(0, separator));
    if (key === name) {
      return decodeFormValue(part.slice(separator + 1));
    }
  }
  return null;
}

function arrayBufferToString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let result = "";
  for (let index = 0; index < bytes.length; index += 1) {
    result += String.fromCharCode(bytes[index]);
  }
  return result;
}

function normalizeBase64Url(value: string): string {
  return value.replace(/=+$/, "");
}

function signaturesMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeBase64Url(left);
  const normalizedRight = normalizeBase64Url(right);
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < normalizedLeft.length; index += 1) {
    difference |= normalizedLeft.charCodeAt(index) ^ normalizedRight.charCodeAt(index);
  }
  return difference === 0;
}

function parseSignedRequest(
  signedRequest: string,
  appSecret: string,
  nk: nkruntime.Nakama
): SignedRequestData {
  const separator = signedRequest.indexOf(".");
  if (separator <= 0 || separator === signedRequest.length - 1) {
    throw new Error("invalid signed_request format");
  }

  const encodedSignature = signedRequest.slice(0, separator);
  const encodedPayload = signedRequest.slice(separator + 1);
  const expectedSignature = nk.base64UrlEncode(
    nk.hmacSha256Hash(encodedPayload, appSecret),
    false
  );

  if (!signaturesMatch(encodedSignature, expectedSignature)) {
    throw new Error("invalid signed_request signature");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(
      arrayBufferToString(nk.base64UrlDecode(encodedPayload))
    ) as unknown;
  } catch {
    throw new Error("invalid signed_request payload");
  }

  if (!isRecord(payload)) {
    throw new Error("invalid signed_request payload");
  }
  return payload as SignedRequestData;
}

function getDeletionBaseUrl(ctx: nkruntime.Context): string {
  return (
    ctx.env["FACEBOOK_DATA_DELETION_URL"] ??
    "https://zdv.sytes.net/facebook/data-deletion"
  ).replace(/\/$/, "");
}

function createConfirmationCode(nk: nkruntime.Nakama): string {
  return nk.uuidv4().replace(/-/g, "");
}

export function facebookDataDeletionRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  const appSecret = ctx.env["FACEBOOK_APP_SECRET"];
  if (!appSecret) {
    logger.error("Facebook data deletion callback is not configured");
    throw new Error("Facebook data deletion is not configured");
  }

  const signedRequest = readFormValue(payload, "signed_request");
  if (!signedRequest) {
    throw new Error("signed_request is required");
  }

  const data = parseSignedRequest(signedRequest, appSecret, nk);
  if (typeof data.user_id !== "string" || data.user_id.length === 0) {
    throw new Error("signed_request user_id is required");
  }
  if (
    data.algorithm !== undefined &&
    data.algorithm !== "HMAC-SHA256"
  ) {
    throw new Error("unsupported signed_request algorithm");
  }

  const users = nk.usersGetId([], [data.user_id]);
  for (const user of users) {
    if (user && user.userId) {
      // Deliberately delete only the Nakama account. Match data is server-owned.
      nk.accountDeleteId(user.userId, true);
    }
  }

  const confirmationCode = createConfirmationCode(nk);
  return JSON.stringify({
    url: `${getDeletionBaseUrl(ctx)}/status/${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}

export function facebookDataDeletionStatusRpc(
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _payload: string
): string {
  const code = ctx.queryParams["code"]?.[0] ?? "";
  if (!/^[A-Za-z0-9]{20,64}$/.test(code)) {
    throw new Error("valid deletion confirmation code is required");
  }

  return JSON.stringify({
    status: "completed",
    confirmation_code: code,
    message:
      "The Zarka Nakama account data associated with this request has been deleted. Match history, turns, chats, and replays are retained.",
  });
}
