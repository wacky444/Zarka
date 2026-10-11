import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_MAX_CURRENT_MATCHES, MIN_MAX_CURRENT_MATCHES, normalizeMaxCurrentMatches, TUTORIAL_MATCH_METADATA_KEY } from "@shared";
import { assertCanAddMembership, countActiveMemberships } from "../src/services/matchMembershipLimit";
import type { MatchRecord } from "../src/models/types";

function fakeStorage(matches: MatchRecord[]) {
  return { listAllMatches: () => matches.map((match) => ({ match })) } as unknown as import("../src/services/storageService").StorageService;
}

const match = (values: Partial<MatchRecord> = {}): MatchRecord => ({
  match_id: "match",
  players: [],
  playerCharacters: {},
  playerList: {},
  readyStates: {},
  size: 10,
  creator: "user",
  started: false,
  removed: 0,
  ...values
} as MatchRecord);

test("max-current-match setting defaults invalid bounds to ten", () => {
  assert.equal(MIN_MAX_CURRENT_MATCHES, 1);
  assert.equal(MAX_MAX_CURRENT_MATCHES, 20);
  assert.equal(normalizeMaxCurrentMatches(1), 1);
  assert.equal(normalizeMaxCurrentMatches(20), 20);
  for (const value of [0, -1, 21, 1.5, "5"]) assert.equal(normalizeMaxCurrentMatches(value), 10);
});

test("membership count includes participation and own waiting matches once, excluding ended and tutorial matches", () => {
  const records = [
    match({ match_id: "joined", players: ["user"] }),
    match({ match_id: "created-empty", players: [], creator: "user" }),
    match({ match_id: "duplicate-owner", players: ["user"], creator: "user" }),
    match({ match_id: "ended", players: ["user"], removed: 1 }),
    match({ match_id: "tutorial", players: ["user"], metadata: { [TUTORIAL_MATCH_METADATA_KEY]: true } })
  ];
  assert.equal(countActiveMemberships(fakeStorage(records), "user"), 3);
});

test("membership cap rejects new membership but allows cap values to be read from account metadata", () => {
  const nk = { usersGetId: () => [{ metadata: { zarka: { maxCurrentMatches: 1 } } }] } as unknown as nkruntime.Nakama;
  assert.throws(() => assertCanAddMembership(nk, fakeStorage([match({ match_id: "active", players: ["user"] })]), "user"), /max_current_matches_reached/);
  assert.doesNotThrow(() => assertCanAddMembership(nk, fakeStorage([]), "user"));
});
