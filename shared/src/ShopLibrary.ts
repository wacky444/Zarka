import type { ShopLibraryDefinition } from "./Shop";

export const ShopLibrary: ShopLibraryDefinition = {
  trafficker_arrow: {
    id: "trafficker_arrow",
    name: "Arrow",
    description: "The trafficker delivers an arrow at the end of the turn.",
    cost: 6,
    implemented: false,
    category: "Trafficker"
  },
  trafficker_antidote: {
    id: "trafficker_antidote",
    name: "Antidote",
    description: "The trafficker delivers an antidote at the end of the turn.",
    cost: 10,
    implemented: false,
    category: "Trafficker"
  },
  trafficker_bullet: {
    id: "trafficker_bullet",
    name: "Bullet",
    description: "The trafficker delivers a bullet at the end of the turn.",
    cost: 15,
    implemented: false,
    category: "Trafficker"
  },
  trafficker_food: {
    id: "trafficker_food",
    name: "Food",
    description: "The trafficker delivers food at the end of the turn.",
    cost: 20,
    implemented: false,
    category: "Trafficker"
  },
  trafficker_bandage: {
    id: "trafficker_bandage",
    name: "Bandage",
    description: "The trafficker delivers a bandage at the end of the turn.",
    cost: 20,
    implemented: false,
    category: "Trafficker"
  },
  trafficker_harpoon: {
    id: "trafficker_harpoon",
    name: "Harpoon",
    description: "The trafficker delivers a harpoon at the end of the turn.",
    cost: 20,
    implemented: false,
    category: "Trafficker"
  },
  trafficker_trap: {
    id: "trafficker_trap",
    name: "Trap",
    description: "The trafficker delivers a trap at the end of the turn.",
    cost: 20,
    implemented: false,
    category: "Trafficker"
  },
  trafficker_pistol: {
    id: "trafficker_pistol",
    name: "Pistol",
    description: "The trafficker delivers a pistol at the end of the turn.",
    cost: 30,
    implemented: false,
    category: "Trafficker"
  },
  trafficker_c4: {
    id: "trafficker_c4",
    name: "C4 explosive",
    description: "The trafficker delivers a C4 explosive at the end of the turn.",
    cost: 30,
    implemented: false,
    category: "Trafficker"
  },
  trafficker_vest: {
    id: "trafficker_vest",
    name: "Bulletproof vest",
    description: "The trafficker delivers a bulletproof vest at the end of the turn.",
    cost: 40,
    implemented: false,
    category: "Trafficker"
  },
  trafficker_rocket_launcher: {
    id: "trafficker_rocket_launcher",
    name: "Rocket launcher",
    description: "The trafficker delivers a rocket launcher at the end of the turn.",
    cost: 60,
    implemented: false,
    category: "Trafficker"
  },
  security_camera_app: {
    id: "security_camera_app",
    name: "Security room camera app",
    description: "Reports the characters visible in the security room that turn.",
    cost: 2,
    implemented: true,
    category: "Applications"
  },
  spy_drone: {
    id: "spy_drone",
    name: "Spy drone",
    description: "Reports the players visible in a chosen location that turn.",
    cost: 6,
    implemented: true,
    category: "Mercenaries"
  },
  detective: {
    id: "detective",
    name: "Detective",
    description: "Reports the investigated player's team immediately.",
    cost: 6,
    implemented: true,
    category: "Mercenaries"
  },
  tracking_app: {
    id: "tracking_app",
    name: "Tracking app",
    description: "Reports the number of traps or C4 one location away.",
    cost: 8,
    implemented: false,
    category: "Applications"
  },
  helicopter: {
    id: "helicopter",
    name: "Helicopter",
    description: "Transports up to four consenting people between locations.",
    cost: 20,
    costLabel: "20 + 5 per person",
    implemented: false,
    category: "Mercenaries"
  },
  fumigator: {
    id: "fumigator",
    name: "Fumigator",
    description: "Intoxicates every character in a location.",
    cost: 20,
    implemented: false,
    category: "Mercenaries"
  },
  pyromaniac: {
    id: "pyromaniac",
    name: "Pyromaniac",
    description: "Creates a three-turn fire in a location.",
    cost: 20,
    implemented: true,
    category: "Mercenaries"
  },
  bomber: {
    id: "bomber",
    name: "Bomber",
    description: "Deals five unavoidable damage to every player in a location.",
    cost: 30,
    implemented: false,
    category: "Mercenaries"
  },
  hitman: {
    id: "hitman",
    name: "Hitman",
    description: "A mercenary that attacks the assigned target team.",
    cost: 30,
    implemented: false,
    category: "Mercenaries"
  },
  cocoman: {
    id: "cocoman",
    name: "Cocoman",
    description: "A prestigious hitman with a chainsaw and bulletproof vest.",
    cost: 50,
    implemented: false,
    category: "Mercenaries"
  }
};
