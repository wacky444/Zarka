import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlayerCharacter } from "@shared";
import type { MatchRecord } from "../src/models/types";
import { tailorMatchForPlayer } from "../src/utils/matchView";

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
