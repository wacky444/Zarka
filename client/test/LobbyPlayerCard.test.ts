import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SKIN } from "@shared";
import type { LobbyPlayerData } from "../src/ui/LobbyPlayerCard";

test("LobbyPlayerData structure supports player sprite, name, elo score, and host badge", () => {
  const hostPlayer: LobbyPlayerData = {
    id: "user-1",
    name: "Hugo Jj",
    elo: 1450,
    skin: DEFAULT_SKIN,
    isHost: true,
    isSelf: true,
    index: 1
  };

  const opponentPlayer: LobbyPlayerData = {
    id: "user-2",
    name: "uRPZLBZaZK",
    elo: 1200,
    skin: {
      body: "body_human_white.png",
      shoes: "shoe_01.png",
      shirt: "shirt_002.png",
      hair: "hair_002.png",
      hat: "hat_001.png"
    },
    isHost: false,
    isSelf: false,
    index: 2
  };

  assert.equal(hostPlayer.name, "Hugo Jj");
  assert.equal(hostPlayer.elo, 1450);
  assert.equal(hostPlayer.isHost, true);
  assert.equal(hostPlayer.isSelf, true);
  assert.equal(hostPlayer.index, 1);

  assert.equal(opponentPlayer.name, "uRPZLBZaZK");
  assert.equal(opponentPlayer.elo, 1200);
  assert.equal(opponentPlayer.isHost, false);
  assert.equal(opponentPlayer.isSelf, false);
  assert.equal(opponentPlayer.index, 2);
  assert.equal(opponentPlayer.skin?.hat, "hat_001.png");
});
