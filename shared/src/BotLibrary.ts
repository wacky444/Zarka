import { NUM_HAIR, NUM_SHIRT, NUM_SHOE } from "./SkinOptions";
import type { Skin } from "./UserAccount";

export interface BotProfile {
  readonly name: string;
  readonly skin: Skin;
}

const BOT_NAMES = [
  "John",
  "Pepe",
  "Doris",
  "Donna",
  "Heken",
  "Ruth",
  "Sarah",
  "Carol",
  "Bicho",
  "Alex",
  "Rafa",
  "Ada",
  "Leo",
  "Nora",
  "Milo",
  "Kiko",
  "Maya",
  "Nico",
  "Lola",
  "Otto",
  "Cleo",
  "Paco",
  "Tina",
  "Hugo",
  "Vera",
  "Enzo",
  "Rita",
  "Max",
  "Alma",
  "Toby",
  "Luna",
  "Dani",
  "Iris",
  "Coco",
  "Elsa",
  "Sam",
  "Manu",
  "Gina",
  "Teo",
  "Clara",
  "Curro",
  "Mia",
  "Eric",
  "Gala",
  "Bruno",
  "Lía",
  "Félix",
  "Tati",
  "Ian",
  "Mara",
  "Yago",
  "Charly",
  "Olga",
  "Vito",
  "Rosa",
  "Luca",
  "Bea",
  "Tito",
  "Sara",
  "Lucas",
  "Pip"
] as const;

const BODIES = [
  "body_human_white.png",
  "body_human_light.png",
  "body_human_tan.png",
  "body_orc.png"
] as const;

function buildBotProfile(name: string, index: number): BotProfile {
  if (name === "John") {
    return {
      name,
      skin: {
        body: "body_human_white.png",
        shoes: "shoe_01.png",
        shirt: "shirt_001.png",
        hair: "hair_001.png",
        hat: ""
      }
    };
  }
  if (name === "Pepe") {
    return {
      name,
      skin: {
        body: "body_human_tan.png",
        shoes: "shoe_03.png",
        shirt: "shirt_014.png",
        hair: "hair_012.png",
        hat: ""
      }
    };
  }
  if (name === "Doris") {
    return {
      name,
      skin: {
        body: "body_human_light.png",
        shoes: "shoe_05.png",
        shirt: "shirt_027.png",
        hair: "hair_024.png",
        hat: ""
      }
    };
  }
  const shoes = String(((index * 7) % NUM_SHOE) + 1).padStart(2, "0");
  const shirt = String(((index * 17) % NUM_SHIRT) + 1).padStart(3, "0");
  const hair = String(((index * 13) % NUM_HAIR) + 1).padStart(3, "0");
  return {
    name,
    skin: {
      body: BODIES[index % BODIES.length],
      shoes: `shoe_${shoes}.png`,
      shirt: `shirt_${shirt}.png`,
      hair: `hair_${hair}.png`,
      hat: ""
    }
  };
}

export const BOT_LIBRARY: readonly BotProfile[] = BOT_NAMES.map((name, index) =>
  buildBotProfile(name, index)
);

export function isBot(playerId: string | null | undefined): boolean {
  if (!playerId) {
    return false;
  }
  return /^bot\d+$/i.test(playerId);
}

export const isBotId = isBot;
