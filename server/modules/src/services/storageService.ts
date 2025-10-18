/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  MATCH_COLLECTION,
  MATCH_KEY_PREFIX,
  REPLAY_COLLECTION,
  SERVER_USER_ID,
  TURN_COLLECTION,
} from "../constants";
import { MatchRecord, TurnRecord } from "../models/types";
import type { ReplayRecord } from "@shared";
import { NakamaWrapper, createNakamaWrapper } from "./nakamaWrapper";

export interface MatchStorageObject {
  match: MatchRecord;
  version: string;
}

export interface ReplayStorageObject {
  key: string;
  replay: ReplayRecord;
}

export function createStorageService(nk: nkruntime.Nakama): StorageService {
  return new StorageService(createNakamaWrapper(nk));
}

export class StorageService {
  constructor(private readonly nk: NakamaWrapper) {}

  getMatch(matchId: string): MatchStorageObject | null {
    const matchKey = this.getMatchKey(matchId);
    const reads = this.nk.storageRead([
      {
        collection: MATCH_COLLECTION,
        key: matchKey,
        userId: SERVER_USER_ID,
      },
    ]);

    if (!reads || reads.length === 0 || !reads[0]) {
      return null;
    }

    const storageObject = reads[0];
    const match = storageObject.value as MatchRecord;
    return {
      match,
      version: storageObject.version,
    };
  }

  writeMatch(match: MatchRecord, version?: string): void {
    this.nk.storageWrite([
      {
        collection: MATCH_COLLECTION,
        key: this.getMatchKey(match.match_id),
        userId: SERVER_USER_ID,
        value: match,
        permissionRead: 2,
        permissionWrite: 0,
        version,
      },
    ]);
  }

  writeMatchWithTurn(
    match: MatchRecord,
    turn: TurnRecord,
    version?: string
  ): void {
    this.nk.storageWrite([
      {
        collection: MATCH_COLLECTION,
        key: this.getMatchKey(match.match_id),
        userId: SERVER_USER_ID,
        value: match,
        permissionRead: 2,
        permissionWrite: 0,
        version,
      },
      {
        collection: TURN_COLLECTION,
        key: this.getTurnKey(turn.match_id, turn.turn),
        userId: SERVER_USER_ID,
        value: turn,
        permissionRead: 2,
        permissionWrite: 0,
      },
    ]);
  }

  appendTurn(turn: TurnRecord): void {
    this.nk.storageWrite([
      {
        collection: TURN_COLLECTION,
        key: this.getTurnKey(turn.match_id, turn.turn),
        userId: SERVER_USER_ID,
        value: turn,
        permissionRead: 2,
        permissionWrite: 0,
      },
    ]);
  }

  appendReplayTurn(replay: ReplayRecord): void {
    this.nk.storageWrite([
      {
        collection: REPLAY_COLLECTION,
        key: this.getReplayKey(replay.match_id, replay.turn),
        userId: SERVER_USER_ID,
        value: replay,
        permissionRead: 2,
        permissionWrite: 0,
      },
    ]);
  }

  readReplay(matchId: string, turnNumber: number): ReplayRecord | null {
    const key = this.getReplayKey(matchId, turnNumber);
    const reads = this.nk.storageRead([
      {
        collection: REPLAY_COLLECTION,
        key,
        userId: SERVER_USER_ID,
      },
    ]);
    if (!reads || reads.length === 0 || !reads[0] || !reads[0].value) {
      return null;
    }
    return reads[0].value as ReplayRecord;
  }

  listReplaysForMatch(matchId: string): ReplayStorageObject[] {
    const items: ReplayStorageObject[] = [];
    let cursor = "";
    let hasMore = true;

    while (hasMore) {
      const response = this.nk.storageList(
        SERVER_USER_ID,
        REPLAY_COLLECTION,
        100,
        cursor
      );

      const objects = response?.objects ?? [];
      if (!objects.length) {
        break;
      }

      for (const obj of objects) {
        if (!obj || !obj.key || !obj.value) {
          continue;
        }
        const suffix = `:${matchId}`;
        if (
          obj.key.length >= suffix.length &&
          obj.key.slice(obj.key.length - suffix.length) === suffix
        ) {
          items.push({
            key: obj.key,
            replay: obj.value as ReplayRecord,
          });
        }
      }

      cursor = response?.cursor ?? "";
      hasMore = !!cursor;
    }

    return items;
  }

  deleteReplayByKey(key: string): void {
    this.nk.storageDelete([
      {
        collection: REPLAY_COLLECTION,
        key,
        userId: SERVER_USER_ID,
      },
    ]);
  }

  readTurns(matchId: string, start: number, end: number): TurnRecord[] {
    const turnReads: nkruntime.StorageReadRequest[] = [];
    for (let i = start; i <= end; i += 1) {
      turnReads.push({
        collection: TURN_COLLECTION,
        key: this.getTurnKey(matchId, i),
        userId: SERVER_USER_ID,
      });
    }

    if (!turnReads.length) {
      return [];
    }

    const turnResults = this.nk.storageRead(turnReads);
    const turns: TurnRecord[] = [];
    for (const record of turnResults) {
      if (record && record.value) {
        turns.push(record.value as TurnRecord);
      }
    }
    return turns;
  }

  listServerMatches(limit = 100, cursor = "") {
    return this.nk.storageList(SERVER_USER_ID, MATCH_COLLECTION, limit, cursor);
  }

  isMatchActive(matchId: string): boolean {
    try {
      this.nk.matchSignal(matchId, JSON.stringify({ type: "ping" }));
      return true;
    } catch (e) {
      return false;
    }
  }

  deleteMatch(matchId: string): void {
    this.nk.storageDelete([
      {
        collection: MATCH_COLLECTION,
        key: this.getMatchKey(matchId),
        userId: SERVER_USER_ID,
      },
    ]);
  }

  private getMatchKey(matchId: string): string {
    return MATCH_KEY_PREFIX + matchId;
  }

  private getTurnKey(matchId: string, turnNumber: number): string {
    return `${turnNumber}:${matchId}`;
  }

  private getReplayKey(matchId: string, turnNumber: number): string {
    return `${turnNumber}:${matchId}`;
  }
}
