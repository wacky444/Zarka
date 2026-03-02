/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import { makeNakamaError } from "../utils/errors";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { MatchRecord } from "../models/types";

const FRIEND_STATE_MAP: Record<number, import("@shared").FriendState> = {
  0: "friend",
  1: "invite_sent",
  2: "invite_received",
  3: "blocked",
};

function resolveUserId(
  nk: nkruntime.Nakama,
  username?: string
): string | undefined {
  if (!username) return undefined;
  const users = nk.usersGetUsername([username]);
  if (!users || users.length === 0) return undefined;
  const user = users[0];
  return user && typeof user.userId === "string" ? user.userId : undefined;
}

export function listFriendsRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx || !ctx.userId) {
    throw makeNakamaError("No user context", nkruntime.Codes.INVALID_ARGUMENT);
  }

  try {
    const result = nk.friendsList(ctx.userId, 100);
    const friends = (result?.friends || []).map((friend) => {
      const user = friend.user;
      const stateValue =
        typeof friend.state === "number" ? friend.state : 0;
      const state = FRIEND_STATE_MAP[stateValue] ?? "friend";
      return {
        userId: user?.userId ?? "",
        username: user?.username,
        displayName: user?.displayName,
        state,
      } as import("@shared").FriendEntry;
    });

    const response: import("@shared").ListFriendsPayload = {
      ok: true,
      friends,
    };

    return JSON.stringify(response);
  } catch (error) {
    logger.error("list_friends error: %s", (error as Error).message);
    const response: import("@shared").ListFriendsPayload = {
      ok: false,
      error: (error as Error).message,
    };
    return JSON.stringify(response);
  }
}

export function friendActionRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
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

  const action = typeof json.action === "string" ? json.action : "";
  const username = typeof json.username === "string" ? json.username : undefined;
  const userId = typeof json.userId === "string" ? json.userId : undefined;

  if (!action) {
    throw makeNakamaError("action required", nkruntime.Codes.INVALID_ARGUMENT);
  }

  const ids: string[] = [];
  const usernames: string[] = [];
  if (userId) ids.push(userId);
  if (username) usernames.push(username);

  if (ids.length === 0 && usernames.length === 0) {
    throw makeNakamaError(
      "target required",
      nkruntime.Codes.INVALID_ARGUMENT
    );
  }

  try {
    if (action === "send" || action === "accept") {
      nk.friendsAdd(ctx.userId, ctx.username ?? "", ids, usernames);
    } else if (action === "deny") {
      nk.friendsDelete(ctx.userId, ctx.username ?? "", ids, usernames);
    } else if (action === "block") {
      nk.friendsBlock(ctx.userId, ctx.username ?? "", ids, usernames);
    } else {
      throw makeNakamaError(
        "unknown action",
        nkruntime.Codes.INVALID_ARGUMENT
      );
    }

    const response: import("@shared").FriendActionPayload = {
      ok: true,
    };

    return JSON.stringify(response);
  } catch (error) {
    logger.error("friend_action error: %s", (error as Error).message);
    const response: import("@shared").FriendActionPayload = {
      ok: false,
      error: (error as Error).message,
    };
    return JSON.stringify(response);
  }
}

export function inviteToMatchRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
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

  const matchId = typeof json.match_id === "string" ? json.match_id : "";
  const username = typeof json.username === "string" ? json.username : undefined;
  const userId =
    typeof json.userId === "string" ? json.userId : undefined;

  if (!matchId) {
    throw makeNakamaError(
      "match_id required",
      nkruntime.Codes.INVALID_ARGUMENT
    );
  }

  const inviteeId = userId ?? resolveUserId(nk, username);
  if (!inviteeId) {
    throw makeNakamaError("user not found", nkruntime.Codes.NOT_FOUND);
  }

  const nkWrapper = createNakamaWrapper(nk);
  const storage = new StorageService(nkWrapper);
  const read = storage.getMatch(matchId);

  if (!read) {
    throw makeNakamaError("not_found", nkruntime.Codes.NOT_FOUND);
  }

  const match: MatchRecord = read.match;

  if (match.creator !== ctx.userId) {
    throw makeNakamaError("not_creator", nkruntime.Codes.PERMISSION_DENIED);
  }

  if (!match.isPrivate) {
    throw makeNakamaError(
      "match_not_private",
      nkruntime.Codes.FAILED_PRECONDITION
    );
  }

  const invited = Array.isArray(match.invited) ? match.invited : [];
  if (invited.indexOf(inviteeId) === -1) {
    invited.push(inviteeId);
    match.invited = invited;
    storage.writeMatch(match, read.version);
  }

  const inviteToken =
    match.inviteCode ? `${matchId}:${match.inviteCode}` : undefined;

  const response: import("@shared").InviteToMatchPayload = {
    ok: true,
    match_id: matchId,
    inviteeUserId: inviteeId,
    inviteCode: match.inviteCode,
    inviteToken,
  };

  return JSON.stringify(response);
}
