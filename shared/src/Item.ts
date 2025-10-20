export enum ItemCategory {
  Consumable = "Consumable",
  Medical = "Medical",
  Weapon = "Weapon",
  Equipment = "Equipment",
  Material = "Material",
  Tool = "Tool",
  Technology = "Technology",
  Special = "Special",
}

export type ItemId =
  | "bottle"
  | "drink"
  | "food"
  | "bandage"
  | "medicine"
  | "antidote"
  | "bulletproof_vest"
  | "bandolier"
  | "wood"
  | "spike"
  | "knife"
  | "bat"
  | "nail_bat"
  | "axe"
  | "chainsaw"
  | "molotov"
  | "pistol"
  | "silencer"
  | "suppressed_pistol"
  | "bullet"
  | "harpoon"
  | "arrow"
  | "chemical_weapon"
  | "rocket_launcher"
  | "trap"
  | "c4"
  | "detonator"
  | "fuel"
  | "nails"
  | "poison"
  | "virus"
  | "vaccine"
  | "lockpick"
  | "binoculars"
  | "walkie_talkie"
  | "tracker"
  | "zarkans"
  | "bicycle"
  | "locker"
  | "safe"
  | "corpse";

export type ItemTag =
  | "Energy"
  | "Healing"
  | "Status"
  | "Wearable"
  | "Component"
  | "Crafting"
  | "Melee"
  | "Area"
  | "Ranged"
  | "Explosive"
  | "Fire"
  | "Trap"
  | "Communication"
  | "Detection"
  | "Infection"
  | "Currency"
  | "Movement"
  | "Storage"
  | "Structure"
  | "Corpse"
  | "Tool"
  | "Protective"
  | "Ammo"
  | "Poison";

export interface ItemDefinition {
  id: ItemId;
  name: string;
  category: ItemCategory;
  sprite: string;
  weapon: boolean;
  consumable: boolean;
  weight: number;
  description: string;
  sellValue?: number;
  recipes?: string[];
  notes?: string[];
  tags?: ItemTag[];
}

export type ItemLibraryDefinition = Record<ItemId, ItemDefinition>;
