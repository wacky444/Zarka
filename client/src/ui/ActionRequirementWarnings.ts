import {
  ItemLibrary,
  LocalizationType,
  type ActionDefinition,
  type ActionId,
  type GameMap,
  type HexTileSnapshot,
  type ItemId,
  type PlayerCharacter,
} from "@shared";
import { t } from "../services/i18n";

export const ACTION_REQUIRED_LOCATIONS: Partial<
  Record<ActionId, LocalizationType[]>
> = {
  breakfast: [LocalizationType.Restaurant],
  recover: [LocalizationType.Hospital],
  refuel: [LocalizationType.GasStation],
  fabricate: [LocalizationType.Workshop],
  activate_cameras: [LocalizationType.Security],
  black_market_trade: [LocalizationType.Market],
  look_through_window: [LocalizationType.House, LocalizationType.Pharmacy],
};

export const LOCATION_DISPLAY_NAMES: Partial<
  Record<LocalizationType, string>
> = {
  [LocalizationType.Restaurant]: "restaurant",
  [LocalizationType.Hospital]: "hospital",
  [LocalizationType.GasStation]: "gas station",
  [LocalizationType.Workshop]: "workshop",
  [LocalizationType.Security]: "security room",
  [LocalizationType.Market]: "black market",
  [LocalizationType.House]: "house",
  [LocalizationType.Pharmacy]: "pharmacy",
};

const ITEM_DISPLAY_NAMES: Record<string, string> = {
  axe: "axe",
  bat: "bat",
  nail_bat: "nail bat",
  knife: "knife",
  bandage: "bandage",
  medicine: "medicine",
  chemical_weapon: "chemical weapon",
  fuel: "fuel",
  chainsaw: "chainsaw",
  pistol: "pistol",
  suppressed_pistol: "silenced pistol",
  bullet: "bullet",
  harpoon: "harpoon",
  arrow: "arrow",
  rocket_launcher: "rocket launcher",
  antidote: "antidote",
  virus: "virus",
  vaccine: "vaccine",
  poison: "poison",
  tracker: "tracker",
  c4: "c4",
  trap: "trap",
  detonator: "detonator",
  binoculars: "binoculars",
};

function getCurrentCharacterTile(
  character: PlayerCharacter | null,
  map: GameMap | undefined
): HexTileSnapshot | null {
  if (!map || !character?.position) {
    return null;
  }
  const tiles = Array.isArray(map.tiles) ? map.tiles : [];
  const tileId = character.position.tileId;
  if (tileId) {
    const tile = tiles.find((entry) => entry && entry.id === tileId);
    if (tile) {
      return tile;
    }
  }
  const coord = character.position.coord;
  if (coord && typeof coord.q === "number" && typeof coord.r === "number") {
    const tile = tiles.find(
      (entry) =>
        entry && entry.coord && entry.coord.q === coord.q && entry.coord.r === coord.r
    );
    if (tile) {
      return tile;
    }
  }
  return null;
}

export function getMissingRequirement(
  definition: ActionDefinition,
  character: PlayerCharacter | null,
  map: GameMap | undefined
): string | null {
  const requiredLocations = ACTION_REQUIRED_LOCATIONS[definition.id];
  if (requiredLocations && requiredLocations.length > 0) {
    const currentTile = getCurrentCharacterTile(character, map);
    const currentLocType = currentTile?.localizationType;
    if (!currentLocType || !requiredLocations.includes(currentLocType)) {
      if (requiredLocations.length === 1) {
        const locName =
          LOCATION_DISPLAY_NAMES[requiredLocations[0]] ??
          requiredLocations[0].toLowerCase();
        return `Not in ${locName}`;
      }
      const names = requiredLocations
        .map((type) => LOCATION_DISPLAY_NAMES[type] ?? type.toLowerCase())
        .join(" or ");
      return `Not in ${names}`;
    }
  }

  if (definition.id === "throw_object") {
    const hasThrowableItem = (character?.inventory?.carriedItems ?? []).some(
      (stack) =>
        stack.itemId !== "zarkans" &&
        typeof stack.quantity === "number" &&
        stack.quantity > 0 &&
        ItemLibrary[stack.itemId as ItemId] !== undefined
    );
    if (!hasThrowableItem) {
      return t("Missing throwable item");
    }
  }

  if (!definition.requiredItems || definition.requiredItems.length === 0) {
    return null;
  }
  const carried = Array.isArray(character?.inventory?.carriedItems)
    ? character.inventory.carriedItems
    : [];

  if (definition.id === "create_fire") {
    const fuelQuantity = carried.reduce(
      (total, stack) =>
        stack.itemId === "fuel" &&
        typeof stack.quantity === "number" &&
        Number.isFinite(stack.quantity)
          ? total + Math.max(0, Math.floor(stack.quantity))
          : total,
      0
    );
    if (fuelQuantity < 2) {
      return t("Missing 2 units of fuel");
    }
  } else if (definition.id === "bat_attack") {
    const hasBat = carried.some(
      (stack) =>
        (stack.itemId === "bat" || stack.itemId === "nail_bat") &&
        typeof stack.quantity === "number" &&
        stack.quantity > 0
    );
    if (!hasBat) {
      return t("Missing bat");
    }
  } else if (definition.id === "shoot_pistol") {
    const hasPistol = carried.some(
      (stack) =>
        (stack.itemId === "pistol" || stack.itemId === "suppressed_pistol") &&
        typeof stack.quantity === "number" &&
        stack.quantity > 0
    );
    const hasBullet = carried.some(
      (stack) =>
        stack.itemId === "bullet" &&
        typeof stack.quantity === "number" &&
        stack.quantity > 0
    );
    if (!hasPistol && !hasBullet) {
      return t("Missing pistol, bullet");
    }
    if (!hasPistol) {
      return t("Missing pistol");
    }
    if (!hasBullet) {
      return t("Missing bullet");
    }
  } else if (definition.id === "use_bandage") {
    const hasBandage = carried.some(
      (stack) =>
        stack.itemId === "bandage" &&
        typeof stack.quantity === "number" &&
        stack.quantity > 0
    );
    if (!hasBandage) {
      return t("Missing bandage");
    }
  } else if (definition.id === "use_medicine") {
    const hasMedicine = carried.some(
      (stack) =>
        stack.itemId === "medicine" &&
        typeof stack.quantity === "number" &&
        stack.quantity > 0
    );
    if (!hasMedicine) {
      return t("Missing medicine");
    }
  } else {
    const missingItems: string[] = [];
    for (const itemId of definition.requiredItems) {
      const hasItem = carried.some(
        (stack) =>
          stack.itemId === itemId &&
          typeof stack.quantity === "number" &&
          stack.quantity > 0
      );
      if (!hasItem) {
        const itemName =
          ItemLibrary[itemId as ItemId]?.name ??
          ITEM_DISPLAY_NAMES[itemId] ??
          itemId.replace(/_/g, " ");
        missingItems.push(t(itemName));
      }
    }
    if (missingItems.length > 0) {
      return `${t("Missing")} ${missingItems.join(", ")}`;
    }
  }

  return null;
}
