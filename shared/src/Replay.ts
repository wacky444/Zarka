import type { ActionId } from "./Action";
import type { Axial, GameMap } from "./hexTile";
import type { C4Record, MatchItemRecord, TrapRecord } from "./match";
import type { PlayerCharacter } from "./playerCharacter";
import type { ItemId } from "./Item";
import type {
  ManipulateMode,
  ManipulateRecipeId,
  RecipeComponent
} from "./RecipesLibrary";

export interface ReplayTurn {
  turnNumber: number;
  events: ReplayEvent[];
}

export enum ReplayImportance {
  Routine = 0,
  Notable = 1,
  Critical = 2
}

export type ReplayEvent = ReplayPlayerEvent | ReplayMapEvent;

export interface ReplayPlayerEvent {
  kind: "player";
  importance: ReplayImportance;
  actorId: string;
  action: ReplayActionDone;
  targets?: ReplayActionTarget[];
  visibility?: ReplayVisibility;
}

export interface ReplayMapEvent {
  kind: "map";
  importance: ReplayImportance;
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

export interface FabricateReplayMetadata {
  craftedItemId: ItemId;
  outcome: "success" | "failure";
  reason?: "location_skill_requirement" | "inventory_capacity" | "invalid_selection";
}

export interface ManipulateReplayMetadata {
  mode: ManipulateMode;
  recipeId: ManipulateRecipeId;
  outcome: "success" | "failure";
  operationIndex: number;
  resultingItems?: RecipeComponent[];
  reason?: "missing_items" | "inventory_capacity" | "invalid_selection";
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
  Guard = 3,
  Armored = 4,
  Heal = 5,
}

export type ReplayActionEffectMask = number;

export interface ReplaySnapshot {
  map?: GameMap;
  items?: MatchItemRecord[];
  traps?: TrapRecord[];
  c4s?: C4Record[];
  playerCharacters?: Record<string, PlayerCharacter>;
  deadCharacters?: Record<string, boolean>;
}

export interface ReplayRecord {
  match_id: string;
  turn: number;
  events: ReplayEvent[];
  snapshot?: ReplaySnapshot;
  created_at: number;
}

export interface ReplayLog {
  turns: ReplayTurn[];
}

export const DEFAULT_REPLAY_VIEW_DISTANCE = 0;
