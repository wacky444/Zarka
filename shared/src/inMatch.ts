export const DEFAULT_NORMAL_MATCH_SIZE = 16;
export const MAX_NORMAL_MATCH_SIZE = 100;
export const MAX_BOT_PLAYERS = 20;

export type InMatchSettings = {
  players: number;
  cols: number;
  rows: number;
  roundTime: string; // Time of day to force next round, default "23:00"
  autoSkip: boolean; // Auto-skip if someone has moved and time limit passed, default true
  botPlayers: number; // Number of bot players, default 0
  turnsToBeAt1Tile?: number; // Total turns to shrink map to 1 tile, default 30
  name: string;
  seed?: string; // Map generation seed
};
