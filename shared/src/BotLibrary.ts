import type { Skin } from "./UserAccount";

export interface BotProfile {
  readonly name: string;
  readonly skin: Skin;
}

export const BOT_LIBRARY: readonly BotProfile[] = [
  {
    name: "John",
    skin: {
      body: "body_human_white.png",
      shoes: "shoe_01.png",
      shirt: "shirt_001.png",
      hair: "hair_001.png",
      hat: ""
    }
  },
  {
    name: "Pepe",
    skin: {
      body: "body_human_tan.png",
      shoes: "shoe_03.png",
      shirt: "shirt_014.png",
      hair: "hair_012.png",
      hat: ""
    }
  },
  {
    name: "Doris",
    skin: {
      body: "body_human_light.png",
      shoes: "shoe_05.png",
      shirt: "shirt_027.png",
      hair: "hair_024.png",
      hat: ""
    }
  }
];
