import type { MatchRecord } from "../models/types";

export function getRuntimeMatchId(match: MatchRecord): string {
  return match.runtime_match_id ?? match.match_id;
}
