export type InMatchSettings = {
  players: number;
  cols: number;
  rows: number;
  roundTime: string; // Time of day to force next round, default "23:00"
  autoSkip: boolean; // Auto-skip if someone has moved and time limit passed, default true
  botPlayers: number; // Number of bot players, default 0
};
