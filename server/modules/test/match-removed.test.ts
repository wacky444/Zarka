import test from "node:test";
import assert from "node:assert/strict";
import { OPCODE_MATCH_REMOVED } from "@shared";
import { asyncTurnMatchSignal } from "../src/match/async_turn/signal";
import { asyncTurnMatchLoop } from "../src/match/async_turn/loop";
import { removeMatchRpc } from "../src/rpc/removeMatch";
import { joinMatchRpc } from "../src/rpc/joinMatch";
import { getStateRpc } from "../src/rpc/getState";
import { createMatchRpc } from "../src/rpc/createMatch";
import type { AsyncTurnState } from "../src/models/types";

Object.assign(globalThis, {
  nkruntime: {
    Codes: {
      INVALID_ARGUMENT: 3,
      NOT_FOUND: 5,
      PERMISSION_DENIED: 7,
      FAILED_PRECONDITION: 9,
      INTERNAL: 13,
    },
  },
});

function createMockHarness() {
  const storage = new Map<string, { value: unknown; version: string }>();
  const signals: Array<{ matchId: string; data: string }> = [];
  const users = new Map<string, unknown>();
  let versionCounter = 0;
  let matchCounter = 0;

  users.set("host-user", { zarka: { tutorialCompleted: true } });
  users.set("guest-user", { zarka: { tutorialCompleted: true } });

  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  } as unknown as nkruntime.Logger;

  const fakeNakama = {
    storageRead: (requests: Array<{ collection: string; key: string; userId: string }>) =>
      requests.flatMap((req) => {
        const item = storage.get(`${req.collection}:${req.key}:${req.userId}`);
        return item ? [{ ...item, collection: req.collection, key: req.key, userId: req.userId }] : [];
      }),
    storageWrite: (
      requests: Array<{
        collection: string;
        key: string;
        userId: string;
        value: unknown;
        version?: string;
      }>
    ) => {
      for (const req of requests) {
        storage.set(`${req.collection}:${req.key}:${req.userId}`, {
          value: JSON.parse(JSON.stringify(req.value)),
          version: String(++versionCounter),
        });
      }
    },
    storageDelete: (requests: Array<{ collection: string; key: string; userId: string }>) => {
      for (const req of requests) {
        storage.delete(`${req.collection}:${req.key}:${req.userId}`);
      }
    },
    storageList: () => ({ objects: [] }),
    matchCreate: () => `runtime-${++matchCounter}`,
    matchList: () => ({ matches: [] }),
    matchSignal: (matchId: string, data: string) => {
      signals.push({ matchId, data });
      return "";
    },
    uuidv4: () => `match-${++matchCounter}`,
    usersGetId: (userIds: string[]) =>
      userIds.flatMap((id) => {
        const u = users.get(id);
        return u ? [{ id, username: id, displayName: id, metadata: u }] : [];
      }),
  };

  return {
    logger,
    nk: fakeNakama as unknown as nkruntime.Nakama,
    signals,
  };
}

test("asyncTurnMatchSignal broadcasts OPCODE_MATCH_REMOVED and returns object with state property", () => {
  let broadcastOpCode: number | null = null;
  let broadcastPayload: string | null = null;
  const dispatcher = {
    broadcastMessage: (opCode: number, data: string) => {
      broadcastOpCode = opCode;
      broadcastPayload = data;
    },
  } as unknown as nkruntime.MatchDispatcher;

  const state = {
    game_id: "match-123",
    players: {},
    order: [],
    size: 2,
  } as unknown as AsyncTurnState;

  const result = asyncTurnMatchSignal(
    {} as nkruntime.Context,
    {} as nkruntime.Logger,
    {} as nkruntime.Nakama,
    dispatcher,
    0,
    state,
    JSON.stringify({ type: "match_removed" })
  );

  assert.ok(result, "matchSignal must return an object, not null");
  assert.ok(result.state, "matchSignal must return an object with state property");
  assert.equal(result.state.matchRemoved, true);
  assert.equal(broadcastOpCode, OPCODE_MATCH_REMOVED);
  assert.deepEqual(JSON.parse(broadcastPayload ?? "{}"), { match_removed: true });
});

test("asyncTurnMatchLoop terminates match when state.matchRemoved is true", () => {
  const state = {
    game_id: "match-123",
    matchRemoved: true,
  } as unknown as AsyncTurnState;

  const result = asyncTurnMatchLoop(
    { matchId: "match-123" } as nkruntime.Context,
    {} as nkruntime.Logger,
    {} as nkruntime.Nakama,
    {} as nkruntime.MatchDispatcher,
    0,
    state,
    []
  );

  assert.equal(result, null, "matchLoop must return null to terminate match when matchRemoved is true");
});

test("removeMatch marks match removed and join/getState reject removed match", () => {
  const harness = createMockHarness();
  const hostId = "host-user";
  const guestId = "guest-user";

  const hostCtx = { userId: hostId } as nkruntime.Context;
  const guestCtx = { userId: guestId } as nkruntime.Context;

  const createRes = JSON.parse(
    createMatchRpc(hostCtx, harness.logger, harness.nk, JSON.stringify({ size: 2 }))
  ) as { match_id: string };

  const matchId = createRes.match_id;

  // Guest joins
  joinMatchRpc(guestCtx, harness.logger, harness.nk, JSON.stringify({ match_id: matchId }));

  // Host removes match
  const removeRes = JSON.parse(
    removeMatchRpc(hostCtx, harness.logger, harness.nk, JSON.stringify({ match_id: matchId }))
  ) as { ok: boolean };
  assert.equal(removeRes.ok, true);

  // Match signal was sent
  assert.ok(
    harness.signals.some((s) => {
      try {
        return JSON.parse(s.data).type === "match_removed";
      } catch {
        return false;
      }
    })
  );

  // State returns not_found
  const stateRes = JSON.parse(
    getStateRpc(guestCtx, harness.logger, harness.nk, JSON.stringify({ match_id: matchId }))
  ) as { error?: string };
  assert.equal(stateRes.error, "not_found");

  // Joining removed match throws not_found
  assert.throws(
    () => {
      joinMatchRpc(guestCtx, harness.logger, harness.nk, JSON.stringify({ match_id: matchId }));
    },
    (err: unknown) => {
      return (err as { message?: string }).message === "not_found";
    }
  );
});
