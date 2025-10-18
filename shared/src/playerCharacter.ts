import type { Axial } from "./hexTile";
import type { ActionCondition } from "./Action";

export interface PlayerCharacter {
  id: string;
  name: string;
  teamId?: string;
  stats: PlayerCharacterStats;
  progression: PlayerProgression;
  economy: PlayerEconomy;
  inventory: PlayerInventory;
  abilities: PlayerAbilityId[];
  relationships: PlayerRelationships;
  statuses: PlayerStatusState;
  position?: PlayerPosition;
  actionPlan?: PlayerActionPlan;
}

export interface PlayerCharacterStats {
  health: PlayerHealthTrack;
  energy: PlayerEnergyTrack;
  load: PlayerLoadTrack;
  speed: number;
  sympathy: number;
}

export interface PlayerHealthTrack {
  current: number;
  max: number;
  knockoutThreshold: number;
  injuredMax: number;
}

export interface PlayerEnergyTrack {
  current: number;
  max: number;
}

export interface PlayerLoadTrack {
  current: number;
  max: number;
}

export interface PlayerProgression {
  level: number;
  experience: number;
  experienceForNextLevel: number;
  availableSkillPoints: number;
  spentSkillPoints: number;
}

export interface PlayerEconomy {
  zarkans: number;
  pendingZarkans: number;
  incomeInterval: number;
}

export interface PlayerInventory {
  carriedItems: PlayerItemStack[];
  equippedItems: PlayerItemStack[];
  stash?: PlayerItemStack[];
}

export interface PlayerItemStack {
  itemId: string;
  quantity: number;
  weight: number;
}

export interface PlayerRelationships {
  confirmedTeammates: string[];
  alliances: string[];
  representatives: string[];
}

export interface PlayerPosition {
  tileId: string;
  coord: Axial;
}

export interface PlayerStatusState {
  conditions: PlayerConditionFlag[];
  intoxication?: PlayerIntoxicationStatus;
  virus?: PlayerVirusStatus;
  fire?: PlayerFireStatus;
  cooldowns?: PlayerActionCooldown[];
}

export interface PlayerIntoxicationStatus {
  remainingActions: number;
}

export interface PlayerVirusStatus {
  contagious: boolean;
  lastTickTurn: number;
}

export interface PlayerFireStatus {
  remainingTurns: number;
}

export interface PlayerActionCooldown {
  actionId: string;
  remainingTurns: number;
  availableOnTurn?: number;
}

export interface PlayerActionPlan {
  main?: PlayerPlannedAction;
  secondary?: PlayerPlannedAction;
  nextMain?: PlayerPlannedAction;
}

export interface PlayerPlannedAction {
  actionId: string;
  extraEffort?: number;
  conditions?: Array<ActionCondition>;
  targetLocationId?: Axial;
  targetPlayerIds?: string[];
}

export type PlayerConditionFlag =
  | "unconscious"
  | "injured"
  | "hungry"
  | "intoxicated"
  | "burned"
  | "infected"
  | "dead"
  | "protected";

export type PlayerAbilityId =
  | "vitality"
  | "strength1"
  | "strength2"
  | "strength3"
  | "strength4"
  | "strength5"
  | "dexterity1"
  | "dexterity2"
  | "dexterity3"
  | "dexterity4"
  | "resilience1"
  | "resilience2"
  | "resilience3"
  | "resilience4"
  | "agility1"
  | "agility2"
  | "agility3"
  | "agility4"
  | "charisma1"
  | "charisma2"
  | "charisma3"
  | "charisma4"
  | "perception1"
  | "perception2"
  | "perception3"
  | "perception4"
  | "perception5"
  | "perception6"
  | "greedy"
  | "cannibal"
  | "salesman"
  | "pensioner"
  | "undetectable"
  | "brave"
  | "vengeful"
  | "charming"
  | "coward";
