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

export type ManipulateRecipeId = (typeof MANIPULATE_RECIPES)[number]["id"];

export const SEPARATE_RECIPES = MANIPULATE_RECIPES.map(
  ({ id, inputs, outputs }) => ({ id, inputs: outputs, outputs: inputs })
);
