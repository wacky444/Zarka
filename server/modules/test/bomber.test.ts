/// <reference path="../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LocalizationType,
  type ReplayPlayerEvent,
} from "@shared";
import { MATCH_COLLECTION, MATCH_KEY_PREFIX, SERVER_USER_ID } from "../src/constants";
import type { MatchRecord } from "../src/models/types";
import { buyShopItemRpc } from "../src/rpc/buyShopItem";
import { createNakamaWrapper } from "../src/services/nakamaWrapper";
import { StorageService } from "../src/services/storageService";
import { tailorReplayEvents } from "../src/match/replay/tailorReplay";
import { createDefaultCharacter } from "../src/utils/playerCharacter";

const MATCH_ID = "bomber-damage-visibility";
const BLAST_COORD = { q: 0, r: 0 };

test("bomber damage log is private to each affected player", () => {
  const characters = Object.fromEntries(
    ["buyer", "victim1", "victim2", "bystander"].map((playerId) => {
      const character = createDefaultCharacter(playerId);
      character.economy.zarkans = playerId === "buyer" ? 100 : 0;
      const coord =
        playerId === "victim1" || playerId === "victim2"
          ? BLAST_COORD
          : { q: 1, r: 0 };
      character.position = {
        tileId: playerId === "victim1" || playerId === "victim2" ? "blast" : "other",
        coord,
      };
      return [playerId, character];
    })
  ) as MatchRecord["playerCharacters"];
  const match: MatchRecord = {
    match_id: MATCH_ID,
    players: Object.keys(characters),
    playerCharacters: characters,
    playerList: {},
    size: 4,
    created_at: 1,
    current_turn: 1,
    started: true,
    removed: 0,
    map: {
      cols: 1,
      rows: 1,
      seed: MATCH_ID,
      tiles: [
        {
          id: "blast",
          coord: BLAST_COORD,
          localizationType: LocalizationType.Road,
          walkable: true,
          itemIds: [],
        },
      ],
    },
  };
  const stored = new Map<string, { value: unknown; version: string }>();
  const keyFor = (collection: string, key: string, userId: string) =>
    `${collection}:${key}:${userId}`;
  stored.set(
    keyFor(MATCH_COLLECTION, `${MATCH_KEY_PREFIX}${MATCH_ID}`, SERVER_USER_ID),
    { value: match, version: "v1" }
  );
  const nakama = {
    storageRead: (requests: nkruntime.StorageReadRequest[]) =>
      requests.flatMap((request) => {
        const item = stored.get(
          keyFor(request.collection, request.key, request.userId)
        );
        return item
          ? [{
              ...request,
              value: item.value,
              version: item.version,
              permissionRead: 2,
              permissionWrite: 0,
              createTime: 0,
              updateTime: 0,
            }]
          : [];
      }),
    storageWrite: (writes: nkruntime.StorageWriteRequest[]) =>
      writes.map((write) => {
        const version = `v${stored.size + 1}`;
        stored.set(keyFor(write.collection, write.key, write.userId), {
          value: JSON.parse(JSON.stringify(write.value)) as unknown,
          version,
        });
        return { key: write.key, version };
      }),
    storageList: () => ({ objects: [] }),
    storageDelete: () => undefined,
    matchCreate: () => "",
    matchList: () => ({ matches: [] }),
    matchSignal: () => "",
  } as unknown as nkruntime.Nakama;
  const context = { userId: "buyer" } as nkruntime.Context;
  const logger = { debug: () => undefined } as unknown as nkruntime.Logger;

  const response = JSON.parse(
    buyShopItemRpc(
      context,
      logger,
      nakama,
      JSON.stringify({
        match_id: MATCH_ID,
        shop_id: "bomber",
        target_location: BLAST_COORD,
      })
    )
  ) as { event: ReplayPlayerEvent };

  assert.equal(response.event.action.actionId, "buy_bomber");
  assert.equal(response.event.targets, undefined);
  assert.equal(
    (response.event.action.metadata as Record<string, unknown>).targetCount,
    undefined
  );
  const replay = new StorageService(createNakamaWrapper(nakama)).readReplay(
    MATCH_ID,
    1
  );
  assert.ok(replay);
  const personalDamageEvents = replay.events.filter(
    (event): event is ReplayPlayerEvent =>
      event.kind === "player" &&
      (event.action.metadata as { personalDamage?: unknown } | undefined)
        ?.personalDamage === 5
  );
  assert.deepEqual(
    personalDamageEvents.map((event) => event.actorId).sort(),
    ["victim1", "victim2"]
  );
  assert.ok(
    personalDamageEvents.every(
      (event) =>
        event.visibility?.scope === "limited" &&
        event.visibility.playerIds.length === 1 &&
        event.visibility.playerIds[0] === event.actorId
    )
  );

  const victimView = tailorReplayEvents(
    replay.events,
    "victim1",
    match.playerCharacters,
    0
  );
  const bystanderView = tailorReplayEvents(
    replay.events,
    "bystander",
    match.playerCharacters,
    0
  );
  assert.equal(
    victimView.filter(
      (event) =>
        event.kind === "player" &&
        (event.action.metadata as { personalDamage?: unknown } | undefined)
          ?.personalDamage !== undefined
    ).length,
    1
  );
  assert.equal(
    bystanderView.some(
      (event) =>
        event.kind === "player" &&
        (event.action.metadata as { personalDamage?: unknown } | undefined)
          ?.personalDamage !== undefined
    ),
    false
  );
});
