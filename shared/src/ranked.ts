export const RANKED_MATCH_METADATA_KEY = "ranked" as const;

export type RankedQueueMode = "low_population" | "high_population";

export interface RankedTeamPlacement {
  teamId: string;
  place: number;
  eliminated: boolean;
  eliminationTurn?: number;
}

export interface RankedMatchMetadata {
  assignmentId: string;
  humanCount: number;
  botCount: number;
  queueMode: RankedQueueMode;
  eloSnapshots: Record<string, number>;
  placements?: RankedTeamPlacement[];
}
