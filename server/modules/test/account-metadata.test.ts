import assert from "node:assert/strict";
import { test } from "node:test";
import { SERVER_USER_ID } from "../src/constants";
import {
  acquireAccountMetadataLock,
  releaseAccountMetadataLock,
  updateAccountMetadata
} from "../src/services/accountMetadata";

test("account metadata writers share one per-user lock and read fresh metadata", () => {
  const userId = "metadata-user";
  const user = {
    id: userId,
    username: userId,
    metadata: { unrelated: { preserved: true }, zarka: { stats: { elo: 1000 } } }
  } as unknown as nkruntime.User;
  const objects = new Map<string, { value: unknown; version: string }>();
  let version = 0;
  let uuid = 0;
  const storageKey = (request: { collection: string; key: string; userId: string }) =>
    `${request.collection}:${request.userId}:${request.key}`;
  const nakama = {
    uuidv4: () => `owner-${++uuid}`,
    usersGetId: (ids: string[]) => ids.includes(userId) ? [user] : [],
    storageRead: (requests: nkruntime.StorageReadRequest[]) =>
      requests.flatMap((request) => {
        const stored = objects.get(storageKey(request));
        return stored
          ? [{ ...request, ...stored, permissionRead: 0, permissionWrite: 0 }]
          : [];
      }),
    storageWrite: (requests: nkruntime.StorageWriteRequest[]) => {
      for (const request of requests) {
        const key = storageKey({
          collection: request.collection,
          key: request.key,
          userId: request.userId ?? ""
        });
        const current = objects.get(key);
        const expected =
          request.version === "" || request.version === "*"
            ? undefined
            : request.version;
        if (request.version !== undefined && expected !== current?.version) {
          throw new Error("version conflict");
        }
      }
      for (const request of requests) {
        const key = storageKey({
          collection: request.collection,
          key: request.key,
          userId: request.userId ?? ""
        });
        objects.set(key, {
          value: request.value,
          version: String(++version)
        });
      }
      return [];
    },
    accountUpdateId: (
      accountUserId: string,
      _username: null,
      _displayName: null,
      _timezone: null,
      _location: null,
      _langTag: null,
      _avatarUrl: null,
      metadata: Record<string, unknown>
    ) => {
      assert.equal(accountUserId, userId);
      Object.assign(user, { metadata });
    }
  } as unknown as nkruntime.Nakama;

  const ownerId = acquireAccountMetadataLock(nakama, userId, 1_000);
  assert.equal(typeof ownerId, "string");
  const busy = updateAccountMetadata(
    nakama,
    userId,
    (metadata) => ({ ...metadata, lost: true }),
    undefined,
    1_001
  );
  assert.equal(busy, "busy");
  assert.equal((user.metadata as Record<string, unknown>).lost, undefined);

  releaseAccountMetadataLock(nakama, userId, ownerId!, 1_002);
  const updated = updateAccountMetadata(
    nakama,
    userId,
    (metadata) => {
      const zarka = metadata.zarka as Record<string, unknown>;
      return {
        ...metadata,
        zarka: { ...zarka, rankedMatchSlots: 2 }
      };
    },
    undefined,
    1_003
  );
  assert.equal(updated, "updated");
  assert.deepEqual(user.metadata, {
    unrelated: { preserved: true },
    zarka: { stats: { elo: 1000 }, rankedMatchSlots: 2 }
  });
});
