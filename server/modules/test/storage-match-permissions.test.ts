import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReplayRecord } from "@shared";
import {
  MATCH_COLLECTION,
  PUSH_NOTIFICATION_OUTBOX_COLLECTION,
  REPLAY_COLLECTION,
  SERVER_USER_ID,
  TURN_COLLECTION
} from "../src/constants";
import type { MatchRecord, TurnRecord } from "../src/models/types";
import type {
  PushNotificationOutbox,
  TurnNotificationOutbox
} from "../src/models/pushNotifications";
import { createNakamaWrapper } from "../src/services/nakamaWrapper";
import { StorageService } from "../src/services/storageService";

test("all match storage writes are server-readable only", () => {
  const writes: nkruntime.StorageWriteRequest[][] = [];
  const nakama = {
    storageRead: () => [],
    storageWrite: (requests: nkruntime.StorageWriteRequest[]) => {
      writes.push(requests);
      return [];
    },
    storageList: () => ({ objects: [], cursor: "" }),
    storageDelete: () => undefined,
    matchCreate: () => "runtime-match",
    matchList: () => [],
    matchSignal: () => ""
  } as unknown as nkruntime.Nakama;
  const storage = new StorageService(createNakamaWrapper(nakama));
  const match = { match_id: "match-private" } as unknown as MatchRecord;
  const replay = {
    match_id: match.match_id,
    turn: 0
  } as unknown as ReplayRecord;
  const turn: TurnRecord = {
    match_id: match.match_id,
    turn: 1,
    player: "player",
    move: {},
    created_at: 1
  };
  const turnOutbox = { id: "turn-outbox" } as TurnNotificationOutbox;
  const rankedOutbox = { id: "ranked-outbox" } as PushNotificationOutbox;

  storage.writeMatch(match);
  storage.writeMatchWithReplayTurn0(match, replay);
  storage.writeMatchWithPushOutbox(match, turnOutbox);
  storage.writeMatchWithReplayTurn0AndPushOutbox(
    match,
    replay,
    rankedOutbox
  );
  storage.writeMatchWithTurn(match, turn);

  const matchWrites = writes.flat().filter(
    (request) =>
      request.collection === MATCH_COLLECTION &&
      request.userId === SERVER_USER_ID
  );
  assert.equal(matchWrites.length, 5);
  for (const request of matchWrites) {
    assert.equal(request.permissionRead, 0);
    assert.equal(request.permissionWrite, 0);
  }
  assert.ok(writes.flat().some((request) => request.collection === REPLAY_COLLECTION));
  assert.ok(writes.flat().some((request) => request.collection === TURN_COLLECTION));
  assert.ok(
    writes
      .flat()
      .some((request) => request.collection === PUSH_NOTIFICATION_OUTBOX_COLLECTION)
  );
});
