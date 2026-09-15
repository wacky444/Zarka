import type { ReplaySnapshot } from "@shared";
import type { MatchRecord } from "../../models/types";

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createReplaySnapshot(match: MatchRecord): ReplaySnapshot {
  const snapshot: ReplaySnapshot = {};
  if (match.map) {
    snapshot.map = cloneJson(match.map);
  }
  snapshot.items = cloneJson(match.items ?? []);
  snapshot.traps = cloneJson(match.traps ?? []);
  if (match.playerCharacters) {
    snapshot.playerCharacters = cloneJson(match.playerCharacters);
  }
  if (match.deadCharacters) {
    snapshot.deadCharacters = cloneJson(match.deadCharacters);
  }
  return snapshot;
}
