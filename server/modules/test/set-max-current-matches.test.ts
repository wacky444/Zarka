import assert from "node:assert/strict";
import { test } from "node:test";
import { setMaxCurrentMatchesRpc } from "../src/rpc/setMaxCurrentMatches";

Object.assign(globalThis, { nkruntime: { Codes: { INTERNAL: 13 } } });

test("setter validates range and persists only caller preference without clobbering metadata", () => {
  const writes = new Map<string, { value: unknown; version: string }>();
  let metadata: Record<string, unknown> = { admin: true, zarka: { rankedMatchSlots: 2, maxCurrentMatches: 10 } };
  const nk = {
    uuidv4: () => "lock-token",
    storageRead: (requests: Array<{ collection: string; key: string; userId: string }>) => requests.flatMap((request) => {
      const value = writes.get(`${request.collection}:${request.userId}:${request.key}`);
      return value ? [{ ...value, collection: request.collection, key: request.key, userId: request.userId }] : [];
    }),
    storageWrite: (requests: Array<{ collection: string; key: string; userId: string; value: unknown; version?: string }>) => requests.forEach((request) => writes.set(`${request.collection}:${request.userId}:${request.key}`, { value: request.value, version: "v1" })),
    usersGetId: () => [{ id: "u", metadata }],
    accountUpdateId: (_id: string, _username: null, _display: null, _timezone: null, _location: null, _lang: null, _avatar: null, next: Record<string, unknown>) => { metadata = next; }
  } as unknown as nkruntime.Nakama;
  const logger = {} as nkruntime.Logger;
  const invoke = (userId: string, value: unknown) => JSON.parse(setMaxCurrentMatchesRpc({ userId } as nkruntime.Context, logger, nk, JSON.stringify({ max_current_matches: value }))) as { ok?: boolean; error?: string; max_current_matches?: number };

  assert.equal(invoke("u", 0).error, "invalid_max_current_matches");
  assert.equal(invoke("u", 21).error, "invalid_max_current_matches");
  assert.deepEqual(invoke("u", 5), { ok: true, max_current_matches: 5 });
  assert.equal((metadata.zarka as { rankedMatchSlots: number }).rankedMatchSlots, 2);
  assert.equal((metadata.zarka as { maxCurrentMatches: number }).maxCurrentMatches, 5);
  assert.equal(invoke("someone-else", 5).ok, true);
});
