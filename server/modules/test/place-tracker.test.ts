/// <reference path="../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  type PlayerCharacter,
  type ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../src/models/types";
import { executeAction } from "../src/match/actionExecutor";
import { refreshTrackerViews } from "../src/match/trackerState";
import { createDefaultCharacter } from "../src/utils/playerCharacter";
import {
  tailorMatchForPlayer,
  tailorPlayerCharactersForViewer,
} from "../src/utils/matchView";

const logger = { debug: () => {} } as unknown as nkruntime.Logger;

function createCharacter(
  id: string,
  q: number,
  trackerQuantity = 0,
): PlayerCharacter {
  const character = createDefaultCharacter(id);
  character.position = { tileId: `tile-${id}`, coord: { q, r: 0 } };
  character.stats.baseViewRange = 0;
  character.inventory.carriedItems = trackerQuantity > 0
    ? [{ itemId: "tracker", quantity: trackerQuantity, weight: 0 }]
    : [];
  return character;
}

function createMatch(
  characters: PlayerCharacter[],
  currentTurn: number,
): MatchRecord {
  const playerCharacters: Record<string, PlayerCharacter> = {};
  for (const character of characters) {
    playerCharacters[character.id] = character;
  }
  return {
    match_id: "place-tracker-test",
    players: characters.map((character) => character.id),
    playerCharacters,
    playerList: {},
    size: characters.length,
    created_at: 1,
    current_turn: currentTurn,
    started: true,
    removed: 0,
  };
}

function planTracker(
  actor: PlayerCharacter,
  targetPlayerIds?: string[],
  targetLocationId?: { q: number; r: number },
  extraExecutions = 0,
): void {
  actor.actionPlan = {
    secondary: {
      actionId: ActionLibrary.place_tracker.id,
      ...(targetPlayerIds ? { targetPlayerIds } : {}),
      ...(targetLocationId ? { targetLocationId } : {}),
      ...(extraExecutions > 0 ? { extraExecutions } : {}),
    },
  };
}

function resolveTrackerAction(
  match: MatchRecord,
  resolvedTurn: number,
): ReplayPlayerEvent[] {
  return executeAction(
    match,
    ActionLibrary.place_tracker,
    resolvedTurn,
    {},
    logger,
  ).filter(
    (event): event is ReplayPlayerEvent => event.kind === "player",
  );
}

function addWalkieTalkie(character: PlayerCharacter): void {
  character.inventory.carriedItems.push({
    itemId: "walkie_talkie",
    quantity: 1,
    weight: 2,
  });
}

test("placing a tracker consumes it and reports known target position for six turns", () => {
  const actor = createCharacter("actor", 0, 1);
  const target = createCharacter("target", 0);
  const match = createMatch([actor, target], 0);
  planTracker(actor, [target.id]);

  const events = resolveTrackerAction(match, 1);
  assert.equal(actor.inventory.carriedItems.length, 0);
  assert.equal(actor.stats.energy.current, 9);
  assert.equal(match.trackers?.length, 1);
  assert.equal(match.trackers?.[0]?.targetIdKnownToOwner, true);
  assert.equal(match.trackers?.[0]?.placedTurn, 1);
  assert.equal(match.trackers?.[0]?.expiresTurn, 6);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0]?.visibility, {
    scope: "limited",
    playerIds: [actor.id],
  });
  assert.equal(events[0]?.targets, undefined);

  refreshTrackerViews(match, 1);
  assert.deepEqual(actor.trackerViews?.[0], {
    trackerId: match.trackers?.[0]?.id,
    coord: { q: 0, r: 0 },
    expiresTurn: 6,
    targetPlayerId: target.id,
  });

  target.position = { tileId: "moved", coord: { q: 2, r: 0 } };
  refreshTrackerViews(match, 2);
  assert.deepEqual(actor.trackerViews?.[0]?.coord, { q: 2, r: 0 });
  assert.equal(actor.trackerViews?.[0]?.targetPlayerId, target.id);
  const tailored = tailorPlayerCharactersForViewer(
    match.playerCharacters,
    actor.id,
    false,
    2,
  );
  assert.equal(tailored?.[target.id], undefined);

  const targetView = tailorMatchForPlayer(match, target.id);
  assert.equal("trackers" in targetView, false);
  assert.equal(targetView.playerCharacters[actor.id]?.trackerViews, undefined);
});

test("adjacent location placement reports position without revealing target identity", () => {
  const actor = createCharacter("actor", 0, 1);
  const target = createCharacter("target", 1);
  const match = createMatch([actor, target], 1);
  planTracker(actor, undefined, { q: 1, r: 0 });

  resolveTrackerAction(match, 2);
  refreshTrackerViews(match, 2);

  assert.equal(match.trackers?.[0]?.targetId, target.id);
  assert.equal(match.trackers?.[0]?.targetIdKnownToOwner, false);
  assert.deepEqual(actor.trackerViews?.[0]?.coord, { q: 1, r: 0 });
  assert.equal(actor.trackerViews?.[0]?.targetPlayerId, undefined);
  const tailored = tailorPlayerCharactersForViewer(
    match.playerCharacters,
    actor.id,
    false,
    2,
  );
  assert.equal(tailored?.[target.id], undefined);
});

test("binocular remote view allows selecting adjacent target identity", () => {
  const actor = createCharacter("actor", 0, 1);
  const target = createCharacter("target", 1);
  const match = createMatch([actor, target], 1);
  actor.remoteView = { coord: { q: 1, r: 0 }, turn: 1 };
  planTracker(actor, [target.id]);

  resolveTrackerAction(match, 2);
  refreshTrackerViews(match, 2);

  assert.equal(match.trackers?.[0]?.targetIdKnownToOwner, true);
  assert.equal(actor.trackerViews?.[0]?.targetPlayerId, target.id);
});

test("co-located authorized walkie partner can identify adjacent target and receive signal", () => {
  const actor = createCharacter("actor", 0, 1);
  const target = createCharacter("target", 1);
  const partner = createCharacter("partner", 1);
  const unauthorized = createCharacter("unauthorized", 4);
  addWalkieTalkie(actor);
  addWalkieTalkie(partner);
  addWalkieTalkie(unauthorized);
  actor.relationships.confirmedTeammates.push(partner.id);
  const match = createMatch([actor, target, partner, unauthorized], 1);
  planTracker(actor, [target.id]);

  resolveTrackerAction(match, 2);
  refreshTrackerViews(match, 2);

  assert.equal(match.trackers?.[0]?.targetIdKnownToOwner, true);
  assert.equal(actor.trackerViews?.[0]?.targetPlayerId, target.id);
  assert.equal(partner.trackerViews?.[0]?.targetPlayerId, target.id);
  assert.equal(unauthorized.trackerViews, undefined);
  const actorView = tailorPlayerCharactersForViewer(
    match.playerCharacters,
    actor.id,
    false,
    2,
  );
  assert.ok(actorView?.[target.id]);
});

test("extra execution places second tracker on selected target and costs extra energy", () => {
  const actor = createCharacter("actor", 0, 2);
  const target = createCharacter("target", 0);
  const match = createMatch([actor, target], 0);
  planTracker(actor, [target.id], undefined, 1);

  resolveTrackerAction(match, 1);

  assert.equal(actor.inventory.carriedItems.length, 0);
  assert.equal(actor.stats.energy.current, 8);
  assert.equal(match.trackers?.length, 2);
  assert.equal(match.trackers?.[0]?.targetId, target.id);
  assert.equal(match.trackers?.[1]?.targetId, target.id);
});

test("extra execution may place trackers on two different selected targets", () => {
  const actor = createCharacter("actor", 0, 2);
  const firstTarget = createCharacter("first-target", 0);
  const secondTarget = createCharacter("second-target", 1);
  const match = createMatch([actor, firstTarget, secondTarget], 0);
  actor.remoteView = { coord: { q: 1, r: 0 }, turn: 0 };
  planTracker(actor, [firstTarget.id, secondTarget.id], undefined, 1);

  resolveTrackerAction(match, 1);

  assert.equal(match.trackers?.length, 2);
  assert.equal(match.trackers?.[0]?.targetId, firstTarget.id);
  assert.equal(match.trackers?.[1]?.targetId, secondTarget.id);
  assert.equal(match.trackers?.[0]?.targetIdKnownToOwner, true);
  assert.equal(match.trackers?.[1]?.targetIdKnownToOwner, true);
});

test("missing tracker or inaccessible selected target fails privately", () => {
  const actor = createCharacter("actor", 0);
  const target = createCharacter("target", 1);
  const match = createMatch([actor, target], 1);
  planTracker(actor, [target.id]);

  const events = resolveTrackerAction(match, 2);
  const failure = events.find((event) => event.action.actionId === "failedAction");
  assert.equal(match.trackers, undefined);
  assert.equal(actor.stats.energy.current, 9);
  assert.deepEqual(failure?.visibility, {
    scope: "limited",
    playerIds: [actor.id],
  });
  assert.equal(failure?.action.metadata?.attemptedActionId, "place_tracker");
  assert.equal(failure?.action.metadata?.reason, "missing_item");
});

test("expired trackers stop signaling but remain discoverable until inspected", () => {
  const actor = createCharacter("actor", 0, 1);
  const target = createCharacter("target", 0);
  const match = createMatch([actor, target], 0);
  planTracker(actor, [target.id]);
  resolveTrackerAction(match, 1);

  refreshTrackerViews(match, 6);
  assert.ok(actor.trackerViews?.length);
  refreshTrackerViews(match, 7);

  assert.equal(actor.trackerViews, undefined);
  assert.equal(match.trackers?.length, 1);
  assert.equal(match.trackers?.[0]?.discoveredByTarget, undefined);
});

test("self-inspection finds one planted tracker without stopping its signal", () => {
  const actor = createCharacter("actor", 0, 1);
  const target = createCharacter("target", 0);
  const match = createMatch([actor, target], 0);
  planTracker(actor, [target.id]);
  resolveTrackerAction(match, 1);
  refreshTrackerViews(match, 1);

  target.actionPlan = {
    secondary: {
      actionId: ActionLibrary.inspect.id,
      targetPlayerIds: [target.id],
    },
  };
  const inspectEvents = executeAction(
    match,
    ActionLibrary.inspect,
    2,
    {},
    logger,
  ).filter(
    (event): event is ReplayPlayerEvent => event.kind === "player",
  );
  const inspectEvent = inspectEvents.find(
    (event) => event.action.actionId === ActionLibrary.inspect.id,
  );

  assert.equal(target.inventory.carriedItems[0]?.itemId, "tracker");
  assert.equal(target.inventory.carriedItems[0]?.quantity, 1);
  assert.equal(match.trackers?.[0]?.discoveredByTarget, true);
  assert.equal(inspectEvent?.action.metadata?.trackerFound, true);
  const revealedItemTypes = inspectEvent?.action.metadata?.revealedItemTypes;
  assert.ok(
    Array.isArray(revealedItemTypes) && revealedItemTypes.includes("tracker"),
  );

  refreshTrackerViews(match, 2);
  assert.equal(actor.trackerViews?.[0]?.targetPlayerId, target.id);
  refreshTrackerViews(match, 7);
  assert.equal(actor.trackerViews, undefined);
  assert.equal(match.trackers, undefined);
});
