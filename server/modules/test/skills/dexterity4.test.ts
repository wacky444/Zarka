/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  SkillLibrary,
  type MatchRecord,
} from "@shared";
import { executeAction } from "../../src/match/actionExecutor";
import { upgradeSkillRpc } from "../../src/rpc/upgradeSkill";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";
import { MATCH_COLLECTION, MATCH_KEY_PREFIX, SERVER_USER_ID } from "../../src/constants";

const MATCH_ID = "dexterity4-test";
const logger = { debug: () => undefined } as unknown as nkruntime.Logger;

test("Dexterity 4 can be purchased and enables Crafting outside Workshop", () => {
  assert.equal(SkillLibrary.dexterity4.implemented, true);
  const character = createDefaultCharacter("player");
  character.actionPlan = {
    secondary: { actionId: "fabricate", craftedItemId: "bat" },
  };
  const match: MatchRecord = {
    match_id: MATCH_ID,
    players: [character.id],
    playerCharacters: { [character.id]: character },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 4,
    started: true,
    removed: 0,
    map: {
      cols: 1,
      rows: 1,
      seed: MATCH_ID,
      tiles: [
        {
          id: "road",
          coord: { q: 0, r: 0 },
          localizationType: LocalizationType.Road,
          walkable: true,
          itemIds: [],
        },
      ],
    },
  };
  let storedMatch = match;
  let version = "v1";
  const nakama = {
    storageRead: (requests: nkruntime.StorageReadRequest[]) =>
      requests.flatMap((request) =>
        request.collection === MATCH_COLLECTION &&
        request.key === `${MATCH_KEY_PREFIX}${MATCH_ID}`
          ? [
              {
                collection: request.collection,
                key: request.key,
                userId: SERVER_USER_ID,
                value: storedMatch,
                version,
                permissionRead: 2,
                permissionWrite: 1,
                createTime: 0,
                updateTime: 0,
              },
            ]
          : []
      ),
    storageWrite: (writes: nkruntime.StorageWriteRequest[]) => {
      for (const write of writes) {
        if (
          write.collection === MATCH_COLLECTION &&
          write.key === `${MATCH_KEY_PREFIX}${MATCH_ID}`
        ) {
          storedMatch =
            typeof write.value === "string"
              ? (JSON.parse(write.value) as MatchRecord)
              : (write.value as MatchRecord);
          version = "v2";
        }
      }
      return [{ key: `${MATCH_KEY_PREFIX}${MATCH_ID}`, version }];
    },
    storageList: () => ({ objects: [], cursor: "" }),
    storageDelete: () => undefined,
    matchCreate: () => "",
    matchList: () => ({ matches: [] }),
    matchSignal: () => "",
  } as unknown as nkruntime.Nakama;

  const result = JSON.parse(
    upgradeSkillRpc(
      { userId: character.id } as nkruntime.Context,
      logger,
      nakama,
      JSON.stringify({ match_id: MATCH_ID, skill_id: "dexterity4" })
    )
  ) as { ok?: boolean };

  assert.equal(result.ok, true);
  const upgradedCharacter = storedMatch.playerCharacters[character.id];
  assert.deepEqual(upgradedCharacter.abilities, ["dexterity4"]);
  assert.equal(upgradedCharacter.progression.availableSkillPoints, 0);

  const events = executeAction(
    storedMatch,
    ActionLibrary.fabricate,
    5,
    { road: storedMatch.map!.tiles[0] },
    logger
  );
  assert.ok(
    upgradedCharacter.inventory.carriedItems.some(
      (stack) => stack.itemId === "bat"
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.kind === "player" && event.action.actionId === "fabricate"
    )
  );
});
