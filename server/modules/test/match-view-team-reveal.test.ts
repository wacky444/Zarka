import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlayerCharacter } from "@shared";
import type { MatchRecord } from "../src/models/types";
import { tailorMatchForPlayer, getLivingLoverPartner } from "../src/utils/matchView";
import { detectiveRevealedTeamId } from "../src/rpc/buyShopItem";

function character(
  id: string,
  health: number,
  options: { teamId?: string; secretTeamId?: string; dead?: boolean } = {}
): PlayerCharacter {
  return {
    id,
    name: id,
    teamId: options.teamId,
    secretTeamId: options.secretTeamId,
    stats: { health: { current: health }, baseViewRange: 2 },
    statuses: { conditions: options.dead ? ["dead"] : [] },
    position: { tileId: "tile", coord: { q: 0, r: 0 } }
  } as unknown as PlayerCharacter;
}

test("match view reveals dead characters' teams without revealing living teams", () => {
  const match = {
    match_id: "dead-team-reveal-test",
    players: ["viewer", "dead-player", "living-player"],
    playerCharacters: {
      viewer: character("viewer", 10),
      "dead-player": character("dead-player", 0, {
        teamId: "Cover team",
        secretTeamId: "Secret team",
        dead: true
      }),
      "living-player": character("living-player", 10, {
        teamId: "Cover team",
        secretTeamId: "Secret team"
      })
    }
  } as unknown as MatchRecord;

  const view = tailorMatchForPlayer(match, "viewer");
  assert.deepEqual(view.revealedTeamsByPlayerId, {
    "dead-player": "Secret team"
  });
  assert.equal(view.playerCharacters["dead-player"]?.teamId, "Secret team");
  assert.equal(view.playerCharacters["dead-player"]?.secretTeamId, undefined);
  assert.equal(view.playerCharacters["living-player"]?.teamId, undefined);
  assert.equal(view.playerCharacters["living-player"]?.secretTeamId, undefined);
});

test("detectiveRevealedTeamId reveals cover team for Enamorados and Gemelos, but effectiveTeamId for others", () => {
  assert.equal(
    detectiveRevealedTeamId({ secretTeamId: "Enamorados", teamId: "Equipo Rojo" }),
    "Equipo Rojo"
  );
  assert.equal(
    detectiveRevealedTeamId({ secretTeamId: "Gemelos", teamId: "Equipo Azul" }),
    "Equipo Azul"
  );
  assert.equal(
    detectiveRevealedTeamId({ secretTeamId: "Cult", teamId: "Equipo Rojo" }),
    "Cult"
  );
  assert.equal(
    detectiveRevealedTeamId({ teamId: "Equipo Verde" }),
    "Equipo Verde"
  );
});

test("tailorMatchForPlayer strips loversTriggerTurn, loversFormedTurn, and loverPlayerIds when !viewAll", () => {
  const match = {
    match_id: "redact-lovers-fields-test",
    players: ["viewer"],
    playerCharacters: {
      viewer: character("viewer", 10, { teamId: "Red" }),
    },
    loversTriggerTurn: 7,
    loversFormedTurn: 7,
    loverPlayerIds: ["viewer", "partner"],
  } as unknown as MatchRecord;

  const normalView = tailorMatchForPlayer(match, "viewer", false);
  assert.equal((normalView as any).loversTriggerTurn, undefined);
  assert.equal((normalView as any).loversFormedTurn, undefined);
  assert.equal((normalView as any).loverPlayerIds, undefined);

  const adminView = tailorMatchForPlayer(match, "viewer", true);
  assert.equal((adminView as any).loversTriggerTurn, 7);
  assert.equal((adminView as any).loversFormedTurn, 7);
  assert.deepEqual((adminView as any).loverPlayerIds, ["viewer", "partner"]);
});

test("Lover viewer retains both teamId and secretTeamId on their own character", () => {
  const match = {
    match_id: "lover-own-teams-test",
    players: ["loverA"],
    playerCharacters: {
      loverA: character("loverA", 10, {
        teamId: "Equipo Rojo",
        secretTeamId: "Enamorados",
      }),
    },
  } as unknown as MatchRecord;

  const view = tailorMatchForPlayer(match, "loverA", false);
  assert.equal(view.playerCharacters["loverA"]?.teamId, "Equipo Rojo");
  assert.equal(view.playerCharacters["loverA"]?.secretTeamId, "Enamorados");
});

test("living Lover partners share visibility, items, and C4s across map", () => {
  const loverA = {
    ...character("loverA", 10, {
      teamId: "Equipo Rojo",
      secretTeamId: "Enamorados",
    }),
    position: { tileId: "tile_0_0", coord: { q: 0, r: 0 } },
    stats: { health: { current: 10 }, baseViewRange: 1 },
    relationships: { confirmedTeammates: ["loverB"] },
    discoveredItemIds: ["item_near_a"],
    discoveredC4Ids: ["c4_near_a"],
  } as unknown as PlayerCharacter;

  const loverB = {
    ...character("loverB", 10, {
      teamId: "Equipo Azul",
      secretTeamId: "Enamorados",
    }),
    position: { tileId: "tile_10_10", coord: { q: 10, r: 10 } },
    stats: { health: { current: 10 }, baseViewRange: 2 },
    relationships: { confirmedTeammates: ["loverA"] },
    discoveredItemIds: ["item_near_b"],
    discoveredC4Ids: ["c4_near_b"],
  } as unknown as PlayerCharacter;

  const bystanderNearB = {
    ...character("bystander", 10, { teamId: "Equipo Verde" }),
    position: { tileId: "tile_10_11", coord: { q: 10, r: 11 } },
  } as unknown as PlayerCharacter;

  const farEnemy = {
    ...character("farEnemy", 10, { teamId: "Equipo Amarillo" }),
    position: { tileId: "tile_5_5", coord: { q: 5, r: 5 } },
  } as unknown as PlayerCharacter;

  const match = {
    match_id: "lovers-sight-test",
    players: ["loverA", "loverB", "bystander", "farEnemy"],
    playerCharacters: {
      loverA,
      loverB,
      bystander: bystanderNearB,
      farEnemy,
    },
    items: [
      { item_id: "item_near_a", item_type: "bandage" },
      { item_id: "item_near_b", item_type: "pistol" },
      { item_id: "item_undiscovered", item_type: "knife" },
    ],
    c4s: [
      { id: "c4_near_a", ownerId: "enemy1", tileId: "tile_0_0", coord: { q: 0, r: 0 }, placedTurn: 1 },
      { id: "c4_near_b", ownerId: "enemy2", tileId: "tile_10_10", coord: { q: 10, r: 10 }, placedTurn: 1 },
      { id: "c4_undiscovered", ownerId: "enemy3", tileId: "tile_5_5", coord: { q: 5, r: 5 }, placedTurn: 1 },
    ],
    map: {
      tiles: [
        { id: "tile_0_0", coord: { q: 0, r: 0 }, itemIds: ["item_near_a"] },
        { id: "tile_10_10", coord: { q: 10, r: 10 }, itemIds: ["item_near_b"] },
        { id: "tile_5_5", coord: { q: 5, r: 5 }, itemIds: ["item_undiscovered"] },
      ],
    },
  } as unknown as MatchRecord;

  const view = tailorMatchForPlayer(match, "loverA", false);

  // Lover A sees partner Lover B regardless of distance
  assert.ok(view.playerCharacters["loverB"]);
  assert.equal(view.playerCharacters["loverB"]?.teamId, "Enamorados");
  assert.equal(view.playerCharacters["loverB"]?.secretTeamId, undefined);

  // Lover A sees bystander who is within Lover B's sight radius
  assert.ok(view.playerCharacters["bystander"]);
  // farEnemy is not within A or B's sight radius
  assert.equal(view.playerCharacters["farEnemy"], undefined);

  // Items discovered by B are visible to A
  assert.ok(view.items?.some((i) => i.item_id === "item_near_a"));
  assert.ok(view.items?.some((i) => i.item_id === "item_near_b"));
  assert.equal(view.items?.some((i) => i.item_id === "item_undiscovered"), false);

  // C4s discovered by B are visible to A
  assert.ok(view.c4s?.some((c) => c.id === "c4_near_a"));
  assert.ok(view.c4s?.some((c) => c.id === "c4_near_b"));
  assert.equal(view.c4s?.some((c) => c.id === "c4_undiscovered"), false);
});

test("when one Lover dies, shared sight stops and deceased Lover team is revealed as Enamorados", () => {
  const loverA = {
    ...character("loverA", 10, {
      teamId: "Equipo Rojo",
      secretTeamId: "Enamorados",
    }),
    position: { tileId: "tile_0_0", coord: { q: 0, r: 0 } },
    stats: { health: { current: 10 }, baseViewRange: 1 },
    relationships: { confirmedTeammates: ["loverB"] },
    discoveredItemIds: ["item_near_a"],
  } as unknown as PlayerCharacter;

  const deadLoverB = {
    ...character("loverB", 0, {
      teamId: "Equipo Azul",
      secretTeamId: "Enamorados",
      dead: true,
    }),
    position: { tileId: "tile_10_10", coord: { q: 10, r: 10 } },
    stats: { health: { current: 0 }, baseViewRange: 2 },
    relationships: { confirmedTeammates: ["loverA"] },
    discoveredItemIds: ["item_near_b"],
  } as unknown as PlayerCharacter;

  const bystanderNearB = {
    ...character("bystander", 10, { teamId: "Equipo Verde" }),
    position: { tileId: "tile_10_11", coord: { q: 10, r: 11 } },
  } as unknown as PlayerCharacter;

  const match = {
    match_id: "lovers-death-sight-test",
    players: ["loverA", "loverB", "bystander"],
    playerCharacters: {
      loverA,
      loverB: deadLoverB,
      bystander: bystanderNearB,
    },
    items: [
      { item_id: "item_near_a", item_type: "bandage" },
      { item_id: "item_near_b", item_type: "pistol" },
    ],
  } as unknown as MatchRecord;

  const view = tailorMatchForPlayer(match, "loverA", false);

  // Shared sight from dead Lover B stops: bystander near dead B is not seen
  assert.equal(view.playerCharacters["bystander"], undefined);
  // Item discovered only by dead B is not seen
  assert.equal(view.items?.some((i) => i.item_id === "item_near_b"), false);

  // Deceased Lover's team is publicly revealed as Enamorados
  assert.equal(view.revealedTeamsByPlayerId?.["loverB"], "Enamorados");
});
