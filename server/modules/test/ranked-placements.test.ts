import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RANKED_MATCH_METADATA_KEY,
  type RankedMatchMetadata
} from "@shared";
import type { MatchRecord } from "../src/models/types";
import { buildMatchReport } from "../src/match/matchReport";
import {
  finalizeRankedTeamPlacements,
  recordRankedTeamEliminations
} from "../src/match/rankedPlacements";
import { createDefaultCharacter } from "../src/utils/playerCharacter";

function createRankedMatch(teamByPlayer: Record<string, string>): MatchRecord {
  const playerCharacters = Object.fromEntries(
    Object.entries(teamByPlayer).map(([playerId, teamId]) => {
      const character = createDefaultCharacter(playerId);
      character.teamId = teamId;
      return [playerId, character];
    })
  );
  const humanIds = Object.keys(teamByPlayer);
  const metadata: RankedMatchMetadata = {
    assignmentId: "placement-test",
    humanCount: humanIds.length,
    botCount: 0,
    queueMode: "high_population",
    eloSnapshots: Object.fromEntries(humanIds.map((userId) => [userId, 1000]))
  };
  return {
    match_id: "placement-test-match",
    players: humanIds,
    playerCharacters,
    playerList: {},
    readyStates: {},
    size: humanIds.length,
    created_at: 100,
    current_turn: 0,
    started: true,
    removed: 0,
    metadata: { [RANKED_MATCH_METADATA_KEY]: metadata }
  };
}

function killTeam(match: MatchRecord, teamId: string): void {
  for (const character of Object.values(match.playerCharacters)) {
    if (character.teamId === teamId) character.stats.health.current = 0;
  }
}

function placements(match: MatchRecord) {
  return match.metadata?.[RANKED_MATCH_METADATA_KEY]?.placements ?? [];
}

test("ranked elimination order assigns places and makes recording idempotent", () => {
  const match = createRankedMatch({ a: "team-a", b: "team-b", c: "team-c", d: "team-d" });
  killTeam(match, "team-a");
  recordRankedTeamEliminations(match, 1);
  recordRankedTeamEliminations(match, 1);
  assert.deepEqual(placements(match), [
    { teamId: "team-a", place: 4, eliminated: true, eliminationTurn: 1 }
  ]);

  killTeam(match, "team-b");
  recordRankedTeamEliminations(match, 2);
  killTeam(match, "team-c");
  recordRankedTeamEliminations(match, 3);
  finalizeRankedTeamPlacements(match, 3);
  assert.deepEqual(
    placements(match).map(({ teamId, place }) => [teamId, place]),
    [["team-a", 4], ["team-b", 3], ["team-c", 2], ["team-d", 1]]
  );
});

test("ranked teams eliminated in one turn tie and later eliminations rank higher", () => {
  const match = createRankedMatch({
    a: "team-a",
    b: "team-b",
    c: "team-c",
    d: "team-d",
    e: "team-e"
  });
  killTeam(match, "team-a");
  recordRankedTeamEliminations(match, 1);
  killTeam(match, "team-b");
  killTeam(match, "team-c");
  recordRankedTeamEliminations(match, 2);
  killTeam(match, "team-d");
  recordRankedTeamEliminations(match, 3);
  finalizeRankedTeamPlacements(match, 3);

  const byTeam = new Map(placements(match).map((entry) => [entry.teamId, entry]));
  assert.equal(byTeam.get("team-a")?.place, 5);
  assert.equal(byTeam.get("team-b")?.place, 3);
  assert.equal(byTeam.get("team-c")?.place, 3);
  assert.equal(byTeam.get("team-d")?.place, 2);
  assert.equal(byTeam.get("team-e")?.place, 1);
});

test("all teams eliminated in one turn share first place", () => {
  const match = createRankedMatch({ a: "team-a", b: "team-b", c: "team-c" });
  for (const teamId of ["team-a", "team-b", "team-c"]) killTeam(match, teamId);
  recordRankedTeamEliminations(match, 7);
  finalizeRankedTeamPlacements(match, 7);
  assert.deepEqual(
    placements(match).map((entry) => [entry.place, entry.eliminationTurn]),
    [[1, 7], [1, 7], [1, 7]]
  );
});

test("secret teams share elimination identity; solo players get stable identities", () => {
  const match = createRankedMatch({ a: "public-a", b: "public-b", c: "public-c" });
  match.playerCharacters.a.secretTeamId = "hidden-team";
  match.playerCharacters.b.secretTeamId = "hidden-team";
  match.playerCharacters.c.teamId = "";
  killTeam(match, "public-a");
  recordRankedTeamEliminations(match, 1);
  assert.equal(placements(match).length, 0);
  match.playerCharacters.b.stats.health.current = 0;
  recordRankedTeamEliminations(match, 2);
  match.playerCharacters.c.stats.health.current = 0;
  finalizeRankedTeamPlacements(match, 2);

  const byTeam = new Map(placements(match).map((entry) => [entry.teamId, entry]));
  assert.equal(byTeam.get("hidden-team")?.place, 2);
  assert.equal(byTeam.get("solo_c")?.place, 1);
});

test("ranked placements survive serialization and drive report ranks without changing unranked sorting", () => {
  const ranked = createRankedMatch({ a: "team-a", b: "team-b", c: "team-c" });
  killTeam(ranked, "team-a");
  recordRankedTeamEliminations(ranked, 1);
  const restored = JSON.parse(JSON.stringify(ranked)) as MatchRecord;
  recordRankedTeamEliminations(restored, 1);
  killTeam(restored, "team-b");
  recordRankedTeamEliminations(restored, 2);
  finalizeRankedTeamPlacements(restored, 2);

  const storage = {
    listReplaysForMatch: () => []
  } as unknown as import("../src/services/storageService").StorageService;
  const rankedReport = buildMatchReport(
    restored,
    storage,
    200,
    "last_alive",
    2,
    [],
    []
  );
  assert.deepEqual(
    rankedReport.teams.map((team) => [team.team_id, team.rank, team.placement]),
    [["team-c", 1, 1], ["team-b", 2, 2], ["team-a", 3, 3]]
  );
  assert.equal(rankedReport.teams.find((team) => team.team_id === "team-a")?.elimination_turn, 1);

  const unranked = { ...restored, metadata: undefined } as MatchRecord;
  const unrankedReport = buildMatchReport(
    unranked,
    storage,
    200,
    "last_alive",
    2,
    [],
    []
  );
  assert.ok(unrankedReport.teams.every((team) => team.placement === undefined));
});
