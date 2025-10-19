import { Axial } from "./hexTile";

export enum ActionCategory {
  Primary = "Primary",
  Secondary = "Secondary",
}

export enum ConditionKind {
  Avoid = "Avoid",
  Prioritize = "Prioritize",
}

export enum ConditionTargetType {
  Self = "Self",
  Player = "Player",
  Ally = "Ally",
  Enemy = "Enemy",
  Location = "Location",
  Group = "Group",
}

export type ActionId =
  | "create_fire"
  | "recover"
  | "feed"
  | "breakfast"
  | "use_bandage"
  | "use_medicine"
  | "talk"
  | "place_tracker"
  | "place_c4"
  | "place_trap"
  | "protect"
  | "dodge"
  | "knife_attack"
  | "move"
  | "refuel"
  | "pick_up"
  | "search"
  | "manipulate"
  | "give"
  | "poison_food"
  | "drop"
  | "throw_object"
  | "use_chemical_weapon"
  | "scare"
  | "detonate_c4"
  | "axe_attack"
  | "bat_attack"
  | "chainsaw_attack"
  | "start_chainsaw"
  | "shoot_pistol"
  | "shoot_harpoon"
  | "fire_rocket_launcher"
  | "punch"
  | "pick_lock"
  | "steal"
  | "fabricate"
  | "black_market_trade"
  | "inspect"
  | "focus"
  | "train"
  | "activate_cameras"
  | "look_through_window"
  | "use_binoculars"
  | "detect"
  | "use_antidote"
  | "inject_virus"
  | "inject_vaccine"
  | "sleep";

export type ActionTag =
  | "Attack"
  | "Support"
  | "Movement"
  | "Logistics"
  | "Crafting"
  | "Utility"
  | "Area"
  | "Ranged"
  | "Recon"
  | "Status"
  | "Economy"
  | "SingleTarget";

export interface ActionRequirement {
  description: string;
  consumesResource?: boolean;
}

export interface ActionEffect {
  description: string;
}

export interface ActionExtraExecution {
  cost: number;
  maxRepetitions?: number;
  description: string;
}

export interface ActionExperienceReward {
  base?: number;
  conditional?: {
    value: number;
    condition: string;
  }[];
}

export interface ActionDefinition {
  id: ActionId;
  name: string;
  category: ActionCategory;
  energyCost: number;
  cooldown: number;
  texture: string;
  frame: string;
  actionOrder: number;
  actionSubOrder: number;
  developed?: boolean;
  experience?: ActionExperienceReward;
  requirements?: ActionRequirement[];
  extraExecution?: ActionExtraExecution;
  effects?: ActionEffect[];
  notes?: string[];
  tags?: ActionTag[];
}

export type ActionLibraryDefinition = Record<ActionId, ActionDefinition>;

export interface ActionCondition {
  kind: ConditionKind;
  target: ConditionTargetType;
  ids?: string[];
  description?: string;
}

export interface ActionSubmission {
  playerId: string;
  actionId: ActionId;
  category: ActionCategory;
  extraExecutions?: number;
  targetPlayerIds?: string[];
  targetLocationId?: Axial;
  conditions?: ActionCondition[];
  notes?: string;
}
