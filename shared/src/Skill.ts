export type SkillId =
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

export interface SkillDefinition {
  id: SkillId;
  name: string;
  description: string;
  cost: number;
  max: number;
  implemented: boolean;
  category?: string;
  notes?: string[];
}

export type SkillLibraryDefinition = Record<SkillId, SkillDefinition>;

