/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import type {
  GameMap,
  GeneratedSafeContainer,
  MatchRecord as SharedMatchRecord,
  PlayerCharacter,
  TurnRecord as SharedTurnRecord
} from "@shared";

export type MatchRecord = Omit<SharedMatchRecord, "playerCharacters"> & {
  playerCharacters: Record<string, PlayerCharacter>;
  safeContainers?: GeneratedSafeContainer[];
};
export type TurnRecord = SharedTurnRecord;

export interface AsyncTurnState extends nkruntime.MatchState {
  game_id: string;
  adminViewers: { [userId: string]: boolean };
  players: { [userId: string]: nkruntime.Presence };
  order: string[];
  size: number;
  cols?: number;
  rows?: number;
  roundTime?: string;
  autoSkip?: boolean;
  botPlayers?: number;
  current_turn: number;
  started: boolean;
  creator?: string;
  name?: string;
  map?: GameMap;
  lastAutoAdvanceAt?: number;
  lastAutoCheckAt?: number;
  lastBotAutoAdvanceAt?: number;
}
