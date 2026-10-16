import type { ItemId } from "./Item";

export interface RecipeComponent {
  readonly itemId: ItemId;
  readonly quantity: number;
}

export interface ManipulateRecipe {
  readonly id: ItemId;
  readonly inputs: readonly RecipeComponent[];
  readonly outputs: readonly RecipeComponent[];
}

export const DEXTERITY3_PRODUCTS = [
  "chemical_weapon",
  "medicine",
  "poison",
  "antidote"
] as const satisfies readonly ItemId[];

export type Dexterity3ProductId = (typeof DEXTERITY3_PRODUCTS)[number];

export function isDexterity3ProductId(value: unknown): value is Dexterity3ProductId {
  return typeof value === "string" && DEXTERITY3_PRODUCTS.includes(value as Dexterity3ProductId);
}

export const CRAFTABLE_ITEMS = [
  "pistol",
  "bullet",
  "molotov",
  "bat",
  "axe",
  "knife",
  "harpoon",
  "arrow",
  "trap",
  "c4"
] as const satisfies readonly ItemId[];

export const MANIPULATE_RECIPES = [
  {
    id: "knife",
    inputs: [
      { itemId: "wood", quantity: 1 },
      { itemId: "spike", quantity: 2 }
    ],
    outputs: [{ itemId: "knife", quantity: 1 }]
  },
  {
    id: "bat",
    inputs: [{ itemId: "wood", quantity: 4 }],
    outputs: [{ itemId: "bat", quantity: 1 }]
  },
  {
    id: "nail_bat",
    inputs: [
      { itemId: "bat", quantity: 1 },
      { itemId: "nails", quantity: 2 }
    ],
    outputs: [{ itemId: "nail_bat", quantity: 1 }]
  },
  {
    id: "axe",
    inputs: [
      { itemId: "wood", quantity: 3 },
      { itemId: "spike", quantity: 2 }
    ],
    outputs: [{ itemId: "axe", quantity: 1 }]
  },
  {
    id: "molotov",
    inputs: [
      { itemId: "bottle", quantity: 1 },
      { itemId: "fuel", quantity: 1 }
    ],
    outputs: [{ itemId: "molotov", quantity: 1 }]
  },
  {
    id: "arrow",
    inputs: [
      { itemId: "wood", quantity: 1 },
      { itemId: "spike", quantity: 1 }
    ],
    outputs: [{ itemId: "arrow", quantity: 1 }]
  },
  {
    id: "suppressed_pistol",
    inputs: [
      { itemId: "pistol", quantity: 1 },
      { itemId: "silencer", quantity: 1 }
    ],
    outputs: [{ itemId: "suppressed_pistol", quantity: 1 }]
  }
] as const satisfies readonly ManipulateRecipe[];

export type CraftableItemId = (typeof CRAFTABLE_ITEMS)[number];
export type ManipulateRecipeId = (typeof MANIPULATE_RECIPES)[number]["id"];
export type ManipulateMode = "combine" | "separate";

export interface ManipulateOperationSelection {
  readonly mode: ManipulateMode;
  readonly recipeId: ManipulateRecipeId;
}

export function isCraftableItemId(value: unknown): value is CraftableItemId {
  return (
    typeof value === "string" &&
    CRAFTABLE_ITEMS.includes(value as CraftableItemId)
  );
}

export function isManipulateRecipeId(
  value: unknown
): value is ManipulateRecipeId {
  return (
    typeof value === "string" &&
    MANIPULATE_RECIPES.some((recipe) => recipe.id === value)
  );
}

export const SEPARATE_RECIPES = MANIPULATE_RECIPES.map(
  ({ id, inputs, outputs }) => ({ id, inputs: outputs, outputs: inputs })
);
