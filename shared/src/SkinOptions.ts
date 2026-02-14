import type { Skin, SkinId } from "./UserAccount";

export type SkinCategory = keyof Skin;

export const SKIN_CATEGORIES: readonly SkinCategory[] = [
  "body",
  "shoes",
  "shirt",
  "hair",
  "hat",
];

export const BODY_OPTIONS: readonly SkinId[] = [
  "body_human_white.png",
  "body_human_light.png",
  "body_human_tan.png",
  "body_orc.png",
];

function buildRange(prefix: string, count: number, digits: number): SkinId[] {
  const result: SkinId[] = [];
  for (let i = 1; i <= count; i++) {
    let num = String(i);
    while (num.length < digits) num = "0" + num;
    result.push(prefix + num + ".png");
  }
  return result;
}

export const SHOES_OPTIONS: readonly SkinId[] = buildRange("shoe_", 20, 2);

export const SHIRT_OPTIONS: readonly SkinId[] = buildRange("shirt_", 120, 3);

export const HAIR_OPTIONS: readonly SkinId[] = buildRange("hair_", 96, 3);

export const HAT_OPTIONS: readonly SkinId[] = [];

export const SKIN_OPTIONS: Readonly<Record<SkinCategory, readonly SkinId[]>> = {
  body: BODY_OPTIONS,
  shoes: SHOES_OPTIONS,
  shirt: SHIRT_OPTIONS,
  hair: HAIR_OPTIONS,
  hat: HAT_OPTIONS,
};

export const DEFAULT_SKIN: Skin = {
  body: "body_human_white.png",
  shoes: "shoe_01.png",
  shirt: "shirt_001.png",
  hair: "hair_001.png",
  hat: "",
};

export function isValidSkinId(category: SkinCategory, id: SkinId): boolean {
  if (category === "hat" && id === "") return true;
  const options = SKIN_OPTIONS[category];
  return options.indexOf(id) !== -1;
}

export function isValidSkin(skin: unknown): skin is Skin {
  if (!skin || typeof skin !== "object" || Array.isArray(skin)) return false;
  const record = skin as Record<string, unknown>;
  for (let i = 0; i < SKIN_CATEGORIES.length; i++) {
    const cat = SKIN_CATEGORIES[i];
    const val = record[cat];
    if (typeof val !== "string") return false;
    if (!isValidSkinId(cat, val)) return false;
  }
  return true;
}
