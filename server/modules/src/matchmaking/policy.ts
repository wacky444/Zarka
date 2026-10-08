export const RANKED_MATCH_TOTAL_SEATS = 16;
export const RANKED_HIGH_POPULATION_MIN_HUMANS = 8;
export const RANKED_HIGH_POPULATION_DAILY_CUTOFF = 16;
export const RANKED_WAIT_STEP_SECONDS = 90 * 60;
export const RANKED_BASE_ELO_RANGE = 200;
export const RANKED_ELO_RANGE_STEP = 50;
export const MAX_RANKED_MAP_DIMENSION = 100;

type RankedMatchmakingMode = "low_population" | "high_population";

export type RankedQueuePolicy = {
  mode: RankedMatchmakingMode;
  requiredHumans: number;
};

export type RankedMapDimensions = {
  cols: number;
  rows: number;
};

function normalizeNonNegativeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeWaitSeconds(waitSeconds: number): number {
  return Number.isFinite(waitSeconds) ? Math.max(0, waitSeconds) : 0;
}

export function getRankedQueuePolicy(
  dailyConnectedUsers: number,
  waitSeconds: number
): RankedQueuePolicy | null {
  const dailyUsers = normalizeNonNegativeCount(dailyConnectedUsers);
  if (dailyUsers < 2) {
    return null;
  }

  if (dailyUsers < RANKED_HIGH_POPULATION_DAILY_CUTOFF) {
    return {
      mode: "low_population",
      requiredHumans: Math.max(2, Math.ceil(dailyUsers / 2))
    };
  }

  const elapsedSteps = Math.floor(
    normalizeWaitSeconds(waitSeconds) / RANKED_WAIT_STEP_SECONDS
  );
  return {
    mode: "high_population",
    requiredHumans: Math.max(
      RANKED_HIGH_POPULATION_MIN_HUMANS,
      RANKED_MATCH_TOTAL_SEATS - elapsedSteps
    )
  };
}

export function getRankedBotFillCount(
  dailyConnectedUsers: number,
  humanCount: number,
  waitSeconds: number
): number | null {
  const policy = getRankedQueuePolicy(dailyConnectedUsers, waitSeconds);
  const humans = normalizeNonNegativeCount(humanCount);
  if (!policy || humans < policy.requiredHumans || humans > RANKED_MATCH_TOTAL_SEATS) {
    return null;
  }
  return policy.mode === "low_population"
    ? RANKED_MATCH_TOTAL_SEATS - humans
    : 0;
}

export function getRankedEloSearchRange(waitSeconds: number): number {
  const elapsedSteps = Math.floor(
    normalizeWaitSeconds(waitSeconds) / RANKED_WAIT_STEP_SECONDS
  );
  return RANKED_BASE_ELO_RANGE + elapsedSteps * RANKED_ELO_RANGE_STEP;
}

export function getRankedMapDimensions(totalRoster: number): RankedMapDimensions {
  if (
    !Number.isInteger(totalRoster) ||
    totalRoster < 1 ||
    totalRoster > RANKED_MATCH_TOTAL_SEATS
  ) {
    throw new RangeError("totalRoster must be an integer from 1 to 16");
  }

  const tileBudget = Math.ceil(1.25 * totalRoster);
  const cols = Math.min(
    MAX_RANKED_MAP_DIMENSION,
    Math.max(3, Math.ceil(Math.sqrt((tileBudget * 5) / 4)))
  );
  const rows = Math.min(
    MAX_RANKED_MAP_DIMENSION,
    Math.max(3, Math.ceil(tileBudget / cols))
  );
  return { cols, rows };
}
