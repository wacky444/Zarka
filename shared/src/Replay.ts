import type { ActionId } from "./Action";
import type { Axial } from "./hexTile";

export interface ReplayTurn {
  turnNumber: number;
  events: ReplayEvent[];
}

export type ReplayEvent = ReplayPlayerEvent | ReplayMapEvent;

export interface ReplayPlayerEvent {
  kind: "player";
  actorId: string;
  action: ReplayActionDone;
  targets?: ReplayActionTarget[];
  visibility?: ReplayVisibility;
}

export interface ReplayMapEvent {
  kind: "map";
  cell: Axial;
  action: ReplayMapEventType;
  sourceActorId?: string;
  visibility?: ReplayVisibility;
}

export interface ReplayActionDone {
  actionId: ActionId;
  originLocation?: Axial;
  targetLocation?: Axial;
  damageDealt?: number;
  effects?: ReplayActionEffectMask;
  metadata?: Record<string, unknown>;
}

export interface ReplayActionTarget {
  targetId: string;
  damageTaken?: number;
  effects?: ReplayActionEffectMask;
  eliminated?: boolean;
  metadata?: Record<string, unknown>;
}

export type ReplayMapEventType = "destroyed" | "gas" | "flame";

export type ReplayVisibility =
  | { scope: "all" }
  | { scope: "limited"; playerIds: string[] };

export enum ReplayActionEffect {
  Hit = 1,
  Dodged = 2,
  Guard = 4,
  Armored = 8,
}

export type ReplayActionEffectMask = number;

export interface ReplayRecord {
  match_id: string;
  turn: number;
  events: ReplayEvent[];
  created_at: number;
}

export interface ReplayLog {
  turns: ReplayTurn[];
}
