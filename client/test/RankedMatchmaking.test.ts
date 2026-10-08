import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRankedQueueStatusResponse } from "../src/services/rankedMatchmaking";

test("ranked queue status parser accepts empty and populated status", () => {
  assert.deepEqual(parseRankedQueueStatusResponse({
    ok: true,
    desired_slots: 0,
    queued_tickets: 0,
    reserved_tickets: 0,
    assigned_matches: []
  }), {
    ok: true,
    desired_slots: 0,
    queued_tickets: 0,
    reserved_tickets: 0,
    assigned_matches: []
  });
  assert.deepEqual(parseRankedQueueStatusResponse(JSON.stringify({
    ok: true,
    desired_slots: 2,
    queued_tickets: 1,
    reserved_tickets: 0,
    assigned_matches: [{
      assignment_id: "assignment-1",
      match_id: "ranked-assignment-1",
      status: "running",
      current_turn: 4
    }]
  })), {
    ok: true,
    desired_slots: 2,
    queued_tickets: 1,
    reserved_tickets: 0,
    assigned_matches: [{
      assignment_id: "assignment-1",
      match_id: "ranked-assignment-1",
      status: "running",
      current_turn: 4
    }]
  });
});

test("ranked queue status parser preserves RPC errors and handles empty failures", () => {
  assert.deepEqual(parseRankedQueueStatusResponse({ ok: false, error: "unauthorized" }), {
    ok: false,
    error: "unauthorized"
  });
  assert.deepEqual(parseRankedQueueStatusResponse(undefined), {
    ok: false,
    error: "invalid_response"
  });
  assert.deepEqual(parseRankedQueueStatusResponse("not-json"), {
    ok: false,
    error: "invalid_response"
  });
});

test("ranked queue status parser rejects malformed counts and assignments", () => {
  assert.equal(parseRankedQueueStatusResponse({
    ok: true,
    desired_slots: 1.5,
    queued_tickets: 0,
    reserved_tickets: 0,
    assigned_matches: []
  }).error, "invalid_response");
  assert.equal(parseRankedQueueStatusResponse({
    ok: true,
    desired_slots: 1,
    queued_tickets: 0,
    reserved_tickets: 0,
    assigned_matches: [{ assignment_id: "a", match_id: "m", status: "waiting" }]
  }).error, "invalid_response");
});
