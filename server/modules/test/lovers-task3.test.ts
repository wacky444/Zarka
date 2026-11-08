import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ReplayImportance,
  TUTORIAL_MATCH_METADATA_KEY,
  type PlayerCharacter,
  type ReplayPlayerEvent,
} from "@shared";
import { ENAMORADOS_TEAM_ID, resolveLoversFormation } from "../src/match/lovers";
import { createDefaultCharacter } from "../src/utils/playerCharacter";
import type { MatchRecord } from "../src/models/types";
import { advanceTurn } from "../src/match/advanceTurn";
import { applyHealthDelta, createDeathReplayEvent } from "../src/match/actions/utils";
import { tailorReplayEvents } from "../src/match/replay/tailorReplay";
import { checkEndGameOutcome } from "../src/match/checkEndGame";

function makeMatch(overrides?: Partial<MatchRecord>): MatchRecord {
  const p1 = createDefaultCharacter("p1");
  p1.teamId = "Red";
  p1.position = { coord: { q: 0, r: 0 }, tileId: "tile_0_0" };

  const p2 = createDefaultCharacter("p2");
  p2.teamId = "Blue";
  p2.position = { coord: { q: 0, r: 0 }, tileId: "tile_0_0" };

  const p3 = createDefaultCharacter("p3");
  p3.teamId = "Red";
  p3.position = { coord: { q: 2, r: 2 }, tileId: "tile_2_2" };

  const p4 = createDefaultCharacter("p4");
  p4.teamId = "Blue";
  p4.position = { coord: { q: 3, r: 3 }, tileId: "tile_3_3" };

  return {
    match_id: "match_lovers_test",
    players: ["p1", "p2", "p3", "p4"],
    started: true,
    loversMode: true,
    loversTriggerTurn: 4,
    teams: ["Red", "Blue"],
    map: {
      columns: 10,
      rows: 10,
      tiles: [
        { id: "tile_0_0", coord: { q: 0, r: 0 }, type: "empty" },
        { id: "tile_2_2", coord: { q: 2, r: 2 }, type: "empty" },
        { id: "tile_3_3", coord: { q: 3, r: 3 }, type: "empty" },
      ],
    },
    playerCharacters: { p1, p2, p3, p4 },
    ...overrides,
  } as unknown as MatchRecord;
}

test("resolveLoversFormation returns [] when loversMode is false", () => {
  const match = makeMatch({ loversMode: false });
  const events = resolveLoversFormation(match, 4);
  assert.equal(events.length, 0);
  assert.equal(match.loverPlayerIds, undefined);
});

test("resolveLoversFormation returns [] for tutorial matches", () => {
  const match = makeMatch({
    metadata: { [TUTORIAL_MATCH_METADATA_KEY]: { version: 1 } },
  });
  const events = resolveLoversFormation(match, 4);
  assert.equal(events.length, 0);
  assert.equal(match.loverPlayerIds, undefined);
});

test("resolveLoversFormation returns [] if turn is outside [4, 20]", () => {
  const matchUnder = makeMatch({ loversTriggerTurn: 4 });
  assert.equal(resolveLoversFormation(matchUnder, 3).length, 0);

  const matchOver = makeMatch({ loversTriggerTurn: 4 });
  assert.equal(resolveLoversFormation(matchOver, 21).length, 0);
});

test("resolveLoversFormation returns [] if resolvedTurn < loversTriggerTurn or trigger turn undefined", () => {
  const match1 = makeMatch({ loversTriggerTurn: 7 });
  assert.equal(resolveLoversFormation(match1, 5).length, 0);

  const match2 = makeMatch({ loversTriggerTurn: undefined });
  assert.equal(resolveLoversFormation(match2, 5).length, 0);
});

test("resolveLoversFormation returns [] if lovers already formed", () => {
  const match = makeMatch({
    loverPlayerIds: ["p1", "p2"],
    loversFormedTurn: 4,
  });
  const events = resolveLoversFormation(match, 5);
  assert.equal(events.length, 0);
});

test("resolveLoversFormation ignores dead characters and same-team characters", () => {
  const match = makeMatch();
  // Mark p2 dead
  match.playerCharacters!.p2.stats.health.current = 0;
  match.playerCharacters!.p2.statuses.conditions = ["dead"];
  const events = resolveLoversFormation(match, 4);
  assert.equal(events.length, 0);
  assert.equal(match.loverPlayerIds, undefined);

  // Both on Red
  const matchSameTeam = makeMatch();
  matchSameTeam.playerCharacters!.p2.teamId = "Red";
  assert.equal(resolveLoversFormation(matchSameTeam, 4).length, 0);
});

test("resolveLoversFormation never pairs Gemelos secret team members", () => {
  const match = makeMatch();
  match.playerCharacters!.p1.secretTeamId = "Gemelos";
  const events = resolveLoversFormation(match, 4);
  assert.equal(events.length, 0);
  assert.equal(match.loverPlayerIds, undefined);
});

test("resolveLoversFormation successfully forms Lovers, updates characters and match, and returns 3 events", () => {
  const match = makeMatch();
  // Give p1 an existing confirmed teammate to verify preservation
  match.playerCharacters!.p1.relationships = {
    confirmedTeammates: ["teammate_x"],
    alliances: [],
    representatives: [],
  };

  const events = resolveLoversFormation(match, 4);
  assert.equal(events.length, 3);

  // Match state
  assert.deepEqual(match.loverPlayerIds, ["p1", "p2"]);
  assert.equal(match.loversFormedTurn, 4);
  assert.ok(match.teams.includes(ENAMORADOS_TEAM_ID));

  // Character mutations
  const c1 = match.playerCharacters!.p1;
  const c2 = match.playerCharacters!.p2;
  assert.equal(c1.teamId, "Red");
  assert.equal(c1.secretTeamId, ENAMORADOS_TEAM_ID);
  assert.ok(c1.relationships.confirmedTeammates.includes("teammate_x"));
  assert.ok(c1.relationships.confirmedTeammates.includes("p2"));
  assert.equal(c1.revealedTeamIdsByPlayerId?.p2, ENAMORADOS_TEAM_ID);

  assert.equal(c2.teamId, "Blue");
  assert.equal(c2.secretTeamId, ENAMORADOS_TEAM_ID);
  assert.ok(c2.relationships.confirmedTeammates.includes("p1"));
  assert.equal(c2.revealedTeamIdsByPlayerId?.p1, ENAMORADOS_TEAM_ID);

  // Events check
  const event1 = events[0] as ReplayPlayerEvent;
  assert.equal(event1.kind, "player");
  assert.equal(event1.action.actionId, "lovers_formed");
  assert.equal(event1.actorId, "p1");
  assert.equal(event1.importance, ReplayImportance.Critical);
  assert.deepEqual(event1.visibility, { scope: "limited", playerIds: ["p1"] });
  assert.deepEqual(event1.action.metadata, {
    teamId: ENAMORADOS_TEAM_ID,
    coverTeamId: "Red",
    partnerPlayerId: "p2",
  });

  const event2 = events[1] as ReplayPlayerEvent;
  assert.equal(event2.kind, "player");
  assert.equal(event2.action.actionId, "lovers_formed");
  assert.equal(event2.actorId, "p2");
  assert.equal(event2.importance, ReplayImportance.Critical);
  assert.deepEqual(event2.visibility, { scope: "limited", playerIds: ["p2"] });
  assert.deepEqual(event2.action.metadata, {
    teamId: ENAMORADOS_TEAM_ID,
    coverTeamId: "Blue",
    partnerPlayerId: "p1",
  });

  const eventAnnounce = events[2] as ReplayPlayerEvent;
  assert.equal(eventAnnounce.kind, "player");
  assert.equal(eventAnnounce.action.actionId, "lovers_announced");
  assert.equal(eventAnnounce.actorId, "");
  assert.equal(eventAnnounce.importance, ReplayImportance.Critical);
  assert.deepEqual(eventAnnounce.visibility, { scope: "all" });
});

test("resolveLoversFormation rolls over to later turns when no co-located pair exists on trigger turn", () => {
  const match = makeMatch();
  // Separate p1 and p2 on turn 4
  match.playerCharacters!.p1.position = { coord: { q: 0, r: 0 }, tileId: "tile_0_0" };
  match.playerCharacters!.p2.position = { coord: { q: 1, r: 0 }, tileId: "tile_1_0" };

  // Turn 4: no eligible pair
  const events4 = resolveLoversFormation(match, 4);
  assert.equal(events4.length, 0);
  assert.equal(match.loverPlayerIds, undefined);

  // Turn 5: players meet at tile (0, 0)
  match.playerCharacters!.p2.position = { coord: { q: 0, r: 0 }, tileId: "tile_0_0" };
  const events5 = resolveLoversFormation(match, 5);
  assert.equal(events5.length, 3);
  assert.deepEqual(match.loverPlayerIds, ["p1", "p2"]);
  assert.equal(match.loversFormedTurn, 5);
});

test("advanceTurn executes resolveLoversFormation before planned player actions", () => {
  const match = makeMatch({
    current_turn: 3,
    loversTriggerTurn: 4,
  });

  // p1 plans to give an apple to p2 on turn 4
  match.playerCharacters!.p1.inventory.carriedItems = [
    { itemId: "apple", quantity: 1, weight: 1 },
  ];
  match.playerCharacters!.p1.actionPlan = {
    main: {
      actionId: "give",
      targetId: "p2",
      selectedInventorySlotIndex: 0,
    },
  };

  const fakeLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as nkruntime.Logger;

  const result = advanceTurn(match, 4, fakeLogger);

  // Lovers formed event should precede give action in replay events
  const loversFormedIndex = result.events.findIndex(
    (e) => e.kind === "player" && e.action.actionId === "lovers_formed"
  );
  assert.ok(loversFormedIndex !== -1, "lovers_formed event should be present");

  // Lovers are now confirmed teammates
  assert.deepEqual(match.loverPlayerIds, ["p1", "p2"]);
  assert.ok(match.playerCharacters!.p1.relationships.confirmedTeammates.includes("p2"));
});

test("createDeathReplayEvent includes { teamId: 'Enamorados', wasLover: true } when a Lover dies", () => {
  const lover = createDefaultCharacter("lover1");
  lover.teamId = "Red";
  lover.secretTeamId = ENAMORADOS_TEAM_ID;
  lover.stats.health = { current: 2, max: 20 };

  const outcome = applyHealthDelta(lover, -5, true);
  assert.equal(outcome.result.dead, true);
  assert.equal(outcome.result.becameDead, true);
  assert.ok(outcome.event);
  assert.equal(outcome.event.action.actionId, "status_dead");
  assert.deepEqual(outcome.event.action.metadata, {
    teamId: ENAMORADOS_TEAM_ID,
    wasLover: true,
  });

  // Direct createDeathReplayEvent call check
  const event = createDeathReplayEvent("lover1", ENAMORADOS_TEAM_ID, true);
  assert.deepEqual(event?.action.metadata, {
    teamId: ENAMORADOS_TEAM_ID,
    wasLover: true,
  });

  // Non-lover check
  const regular = createDefaultCharacter("regular");
  regular.teamId = "Red";
  regular.stats.health = { current: 2, max: 20 };
  const regularOutcome = applyHealthDelta(regular, -5, true);
  assert.deepEqual(regularOutcome.event?.action.metadata, {
    teamId: "Red",
  });
});

test("tailorReplayEvents preserves wasLover metadata and protects identities in lovers_announced", () => {
  const events: ReplayPlayerEvent[] = [
    {
      kind: "player",
      importance: ReplayImportance.Critical,
      actorId: "p1",
      action: {
        actionId: "status_dead",
        metadata: { teamId: ENAMORADOS_TEAM_ID, wasLover: true },
      },
      visibility: { scope: "all" },
    },
    {
      kind: "player",
      importance: ReplayImportance.Critical,
      actorId: "p1", // even if actorId was mistakenly set
      action: {
        actionId: "lovers_announced",
      },
      visibility: { scope: "all" },
    },
    {
      kind: "player",
      importance: ReplayImportance.Critical,
      actorId: "p1",
      action: {
        actionId: "lovers_formed",
        metadata: { teamId: ENAMORADOS_TEAM_ID, coverTeamId: "Red", partnerPlayerId: "p2" },
      },
      visibility: { scope: "limited", playerIds: ["p1"] },
    },
  ];

  // Viewer is p3 (uninvolved player)
  const tailoredForP3 = tailorReplayEvents(events, "p3", {}, 5);
  // Should see status_dead with wasLover: true
  const deadEvent = tailoredForP3.find(
    (e) => e.kind === "player" && e.action.actionId === "status_dead"
  ) as ReplayPlayerEvent;
  assert.ok(deadEvent);
  assert.deepEqual(deadEvent.action.metadata, {
    teamId: ENAMORADOS_TEAM_ID,
    wasLover: true,
  });

  // Should see lovers_announced with actorId: ""
  const announcedEvent = tailoredForP3.find(
    (e) => e.kind === "player" && e.action.actionId === "lovers_announced"
  ) as ReplayPlayerEvent;
  assert.ok(announcedEvent);
  assert.equal(announcedEvent.actorId, "");

  // Should NOT see p1's private lovers_formed event
  const loversFormedEvent = tailoredForP3.find(
    (e) => e.kind === "player" && e.action.actionId === "lovers_formed"
  );
  assert.equal(loversFormedEvent, undefined);

  // Viewer is p1 (the lover)
  const tailoredForP1 = tailorReplayEvents(events, "p1", {}, 5);
  const p1Formed = tailoredForP1.find(
    (e) => e.kind === "player" && e.action.actionId === "lovers_formed"
  );
  assert.ok(p1Formed);
});

test("checkEndGameOutcome declares victory for Enamorados when only the Lovers are alive", () => {
  const match = makeMatch();
  match.playerCharacters!.p1.secretTeamId = ENAMORADOS_TEAM_ID;
  match.playerCharacters!.p2.secretTeamId = ENAMORADOS_TEAM_ID;
  // Kill p3 and p4
  match.playerCharacters!.p3.stats.health.current = 0;
  match.playerCharacters!.p3.statuses.conditions = ["dead"];
  match.playerCharacters!.p4.stats.health.current = 0;
  match.playerCharacters!.p4.statuses.conditions = ["dead"];

  const outcome = checkEndGameOutcome(match);
  assert.equal(outcome.ended, true);
  assert.equal(outcome.reason, "last_alive");
  if (outcome.ended && outcome.reason === "last_alive") {
    assert.deepEqual(outcome.aliveCharacterIds.sort(), ["p1", "p2"]);
  }
});
