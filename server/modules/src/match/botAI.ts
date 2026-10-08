import {
  ActionLibrary,
  CellLibrary,
  neighbors,
  axialDistance,
  getActionEnergyDiscount,
  getSkillEffectTotal,
  ItemLibrary,
  type ActionDefinition,
  type ActionId,
  type ActionTag,
  type ItemId,
  type Axial,
  type HexTileSnapshot,
  type PlayerCharacter,
  type PlayerPlannedAction,
  type SkillCategory
} from "@shared";
import { MatchRecord } from "../models/types";
import { hasFeedConsumable } from "./actions/feed";
import {
  isActionOnCooldown,
  updateCharacterCooldowns
} from "./actions/cooldowns";
import {
  isCharacterDead,
  isCharacterIncapacitated
} from "../utils/playerCharacter";
import { isVirusInfected } from "../utils/virus";
import { areSameLocation } from "../utils/location";
import { assignRandomSkillsUntilZero } from "./afkSkills";
import { buildItemLookup } from "./actions/search";
import { hasCarriedItem, isTargetProtected } from "./actions/utils";

export enum BotPersonality {
  Safe = "Safe",
  Aggressive = "Aggressive",
  Hoarder = "Hoarder",
  Random = "Random"
}

const PERSONALITY_ROTATION: BotPersonality[] = [
  BotPersonality.Safe,
  BotPersonality.Aggressive,
  BotPersonality.Hoarder,
  BotPersonality.Random
];

const DEFAULT_TAG_WEIGHTS: Partial<Record<ActionTag, number>> = {
  Attack: 1,
  Support: 1,
  Movement: 1,
  Logistics: 1,
  Crafting: 0.6,
  Utility: 0.9,
  Area: 0.9,
  Ranged: 0.9,
  Recon: 0.8,
  Status: 1,
  Economy: 0.7,
  SingleTarget: 1,
  TargetItems: 1.1
};

const PERSONALITY_SKILL_CATEGORY_WEIGHTS: Record<
  BotPersonality,
  Partial<Record<SkillCategory, number>>
> = {
  [BotPersonality.Safe]: {
    offensive: 0.5,
    defense: 2,
    utility: 1
  },
  [BotPersonality.Aggressive]: {
    offensive: 4,
    defense: 1,
    utility: 0.75
  },
  [BotPersonality.Hoarder]: {
    offensive: 0.75,
    defense: 1,
    utility: 2
  },
  [BotPersonality.Random]: {
    offensive: 1,
    defense: 1,
    utility: 1
  }
};

const PERSONALITY_TAG_MULTIPLIERS: Record<
  BotPersonality,
  Partial<Record<ActionTag, number>>
> = {
  [BotPersonality.Safe]: {
    Movement: 2,
    Support: 1.5,
    Logistics: 1.2,
    Attack: 0.4
  },
  [BotPersonality.Aggressive]: {
    Attack: 2.2,
    Movement: 1.2,
    Support: 0.9,
    Logistics: 0.6
  },
  [BotPersonality.Hoarder]: {
    Logistics: 2.3,
    TargetItems: 1.8,
    Recon: 1.3,
    Movement: 0.9,
    Attack: 0.5
  },
  [BotPersonality.Random]: {}
};

const SUPPORTED_ACTION_IDS: ActionId[] = [
  ActionLibrary.create_fire.id,
  ActionLibrary.breakfast.id,
  ActionLibrary.refuel.id,
  ActionLibrary.place_c4.id,
  ActionLibrary.detonate_c4.id,
  ActionLibrary.place_trap.id,
  ActionLibrary.dodge.id,
  ActionLibrary.move.id,
  ActionLibrary.pick_up.id,
  ActionLibrary.search.id,
  ActionLibrary.feed.id,
  ActionLibrary.focus.id,
  ActionLibrary.use_bandage.id,
  ActionLibrary.use_medicine.id,
  ActionLibrary.protect.id,
  ActionLibrary.sleep.id,
  ActionLibrary.recover.id,
  ActionLibrary.scare.id,
  ActionLibrary.drop.id,
  ActionLibrary.throw_object.id,
  ActionLibrary.steal.id,
  ActionLibrary.black_market_trade.id,
  ActionLibrary.inject_virus.id,
  ActionLibrary.inject_vaccine.id,
  ActionLibrary.punch.id,
  ActionLibrary.knife_attack.id,
  ActionLibrary.axe_attack.id,
  ActionLibrary.bat_attack.id,
  ActionLibrary.shoot_pistol.id,
  ActionLibrary.shoot_harpoon.id,
  ActionLibrary.fire_rocket_launcher.id,
  ActionLibrary.use_chemical_weapon.id
];

function getSupportedDevelopedActions(): ActionDefinition[] {
  const list: ActionDefinition[] = [];
  for (let i = 0; i < SUPPORTED_ACTION_IDS.length; i += 1) {
    const actionId = SUPPORTED_ACTION_IDS[i];
    const definition = ActionLibrary[actionId];
    if (!definition || definition.developed !== true) {
      continue;
    }
    list.push(definition);
  }
  return list;
}

interface MapContext {
  byId: Record<string, HexTileSnapshot>;
  byCoord: Record<string, HexTileSnapshot>;
}

interface BotActionCandidate {
  definition: ActionDefinition;
  plan: PlayerPlannedAction;
  weight: number;
  attackScore?: number;
}

interface BotActionContext {
  match: MatchRecord;
  playerId: string;
  character: PlayerCharacter;
  map: MapContext;
  currentTurn: number;
  personality: BotPersonality;
  rng: () => number;
}

export function processBotActions(match: MatchRecord, logger: any): void {
  if (!match.playerCharacters) {
    return;
  }
  const currentTurn = match.current_turn ?? 0;
  const rng = () => Math.random();
  const map = buildMapContext(match);
  for (const playerId in match.playerCharacters) {
    if (
      !Object.prototype.hasOwnProperty.call(match.playerCharacters, playerId)
    ) {
      continue;
    }
    if (!isBotId(playerId)) {
      continue;
    }

    const character = match.playerCharacters[playerId];
    if (!character) {
      continue;
    }
    const personality = determinePersonality(playerId);
    if (
      !isCharacterDead(character) &&
      (character.progression?.availableSkillPoints ?? 0) > 0
    ) {
      assignRandomSkillsUntilZero(character, {
        allowedCategories: ["offensive", "defense", "utility"],
        categoryWeights: PERSONALITY_SKILL_CATEGORY_WEIGHTS[personality],
        random: rng
      });
    }
    if (isCharacterIncapacitated(character)) {
      clearBotPlans(character);
      match.playerCharacters[playerId] = character;
      continue;
    }

    updateCharacterCooldowns(character, currentTurn);
    const context: BotActionContext = {
      match,
      playerId,
      character,
      map,
      currentTurn,
      personality,
      rng
    };
    const candidates = buildExecutableActionCandidates(context).filter(
      (candidate) => candidate.weight > 0
    );
    if (candidates.length === 0) {
      clearBotPlans(character);
      match.playerCharacters[playerId] = character;
      continue;
    }

    const choice = chooseBotAction(candidates, rng);
    if (!choice) {
      clearBotPlans(character);
      match.playerCharacters[playerId] = character;
      continue;
    }

    ensurePlanContainer(character);
    character.actionPlan!.main = choice.plan;
    if (character.actionPlan!.secondary) {
      delete character.actionPlan!.secondary;
    }
    if (character.actionPlan!.nextMain) {
      delete character.actionPlan!.nextMain;
    }
    logger.debug("botAI: updating character", playerId);

    match.playerCharacters[playerId] = character;
  }
}

function buildMapContext(match: MatchRecord): MapContext {
  const byId: Record<string, HexTileSnapshot> = {};
  const byCoord: Record<string, HexTileSnapshot> = {};
  const tiles = match.map?.tiles ?? [];
  for (const tile of tiles) {
    if (!tile) {
      continue;
    }
    byId[tile.id] = tile;
    byCoord[coordKey(tile.coord)] = tile;
  }
  return { byId, byCoord };
}

function coordKey(coord: Axial | undefined): string {
  if (!coord) {
    return "";
  }
  return `${coord.q}:${coord.r}`;
}

export function isBotId(playerId: string): boolean {
  return /^bot\d+$/i.test(playerId);
}

function determinePersonality(playerId: string): BotPersonality {
  const match = /^bot(\d+)$/i.exec(playerId);
  if (!match) {
    return BotPersonality.Random;
  }
  const index = parseInt(match[1], 10);
  if (!isFinite(index) || index <= 0) {
    return BotPersonality.Random;
  }
  const rotationIndex = (index - 1) % PERSONALITY_ROTATION.length;
  return PERSONALITY_ROTATION[rotationIndex];
}

function ensurePlanContainer(character: PlayerCharacter): void {
  if (!character.actionPlan) {
    character.actionPlan = {};
  }
}

function clearBotPlans(character: PlayerCharacter): void {
  if (!character.actionPlan) {
    return;
  }
  delete character.actionPlan.main;
  delete character.actionPlan.secondary;
  delete character.actionPlan.extraSecondary;
  delete character.actionPlan.nextMain;
  if (
    character.actionPlan.main === undefined &&
    character.actionPlan.secondary === undefined &&
    character.actionPlan.extraSecondary === undefined &&
    character.actionPlan.nextMain === undefined
  ) {
    delete character.actionPlan;
  }
}

function checkDangerousCell(
  context: BotActionContext
): BotActionCandidate | null {
  const currentTile = getCurrentTile(context);
  if (!isTileMarked(currentTile, context.currentTurn)) {
    return null;
  }
  const moveDefinition = ActionLibrary.move;
  if (
    !moveDefinition ||
    moveDefinition.developed !== true ||
    isActionOnCooldown(
      context.character,
      moveDefinition.id,
      context.currentTurn
    ) ||
    !hasEnoughEnergy(context.character, moveDefinition.energyCost)
  ) {
    return null;
  }
  return createMoveCandidate(moveDefinition, context);
}

function buildExecutableActionCandidates(
  context: BotActionContext
): BotActionCandidate[] {
  const dangerousCellCandidate = checkDangerousCell(context);
  if (dangerousCellCandidate) {
    return [dangerousCellCandidate];
  }

  const developed = getSupportedDevelopedActions();
  const results: BotActionCandidate[] = [];
  for (let i = 0; i < developed.length; i += 1) {
    const definition = developed[i];
    if (
      isActionOnCooldown(context.character, definition.id, context.currentTurn)
    ) {
      continue;
    }
    const discount = getActionEnergyDiscount(
      context.character,
      definition.id
    );
    const effectiveCost = Math.max(0, definition.energyCost - discount);
    if (!hasEnoughEnergy(context.character, effectiveCost)) {
      continue;
    }
    const candidate = createCandidateForAction(definition, context);
    if (candidate) {
      results.push(candidate);
    }
  }
  return results;
}

function hasEnoughEnergy(character: PlayerCharacter, cost: number): boolean {
  if (cost <= 0) {
    return true;
  }
  const energy = character.stats?.energy;
  if (!energy) {
    return false;
  }
  const current =
    typeof energy.current === "number" && isFinite(energy.current)
      ? energy.current
      : 0;
  const temporary =
    typeof energy.temporary === "number" && isFinite(energy.temporary)
      ? energy.temporary
      : 0;
  return current + temporary >= cost;
}

function createCandidateForAction(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  switch (definition.id) {
    case "create_fire":
      return createFireCandidate(definition, context);
    case "breakfast":
      return createBreakfastCandidate(definition, context);
    case "refuel":
      return createRefuelCandidate(definition, context);
    case "place_c4":
      return createPlaceC4Candidate(definition, context);
    case "detonate_c4":
      return createDetonateC4Candidate(definition, context);
    case "place_trap":
      return createPlaceTrapCandidate(definition, context);
    case "dodge":
      return createDodgeCandidate(definition, context);
    case "move":
      return createMoveCandidate(definition, context);
    case "pick_up":
      return createPickUpCandidate(definition, context);
    case "drop":
      return createDropCandidate(definition, context);
    case "throw_object":
      return createThrowCandidate(definition, context);
    case "steal":
      return createStealCandidate(definition, context);
    case "black_market_trade":
      return createBlackMarketTradeCandidate(definition, context);
    case "inject_virus":
      return createInjectVirusCandidate(definition, context);
    case "inject_vaccine":
      return createInjectVaccineCandidate(definition, context);
    case "search":
      return createSearchCandidate(definition, context);
    case "feed":
      return createFeedCandidate(definition, context);
    case "focus":
      return createFocusCandidate(definition, context);
    case "use_bandage":
      return createBandageCandidate(definition, context);
    case "use_medicine":
      return createMedicineCandidate(definition, context);
    case "protect":
      return createProtectCandidate(definition, context);
    case "sleep":
      return createSleepCandidate(definition, context);
    case "recover":
      return createRecoverCandidate(definition, context);
    case "scare":
      return createScareCandidate(definition, context);
    case "punch":
      return createPunchCandidate(definition, context);
    case "knife_attack":
    case "axe_attack":
    case "bat_attack":
    case "shoot_pistol":
    case "shoot_harpoon":
    case "fire_rocket_launcher":
    case "use_chemical_weapon":
      return createWeaponAttackCandidate(definition, context);
    default:
      return null;
  }
}

function isTileMarked(
  tile: HexTileSnapshot | undefined,
  currentTurn: number
): boolean {
  if (!tile) {
    return false;
  }
  if (tile.meta?.destroyed === true || tile.walkable === false) {
    return true;
  }
  const destructionTurn =
    typeof tile.meta?.destructionTurn === "number"
      ? tile.meta.destructionTurn
      : undefined;
  const warningTurn =
    typeof tile.meta?.warningTurn === "number"
      ? tile.meta.warningTurn
      : undefined;
  if (destructionTurn !== undefined && currentTurn >= destructionTurn) {
    return true;
  }
  if (warningTurn !== undefined && currentTurn >= warningTurn) {
    return true;
  }
  return false;
}

function createFireCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  const origin = context.character.position?.coord;
  if (!origin || countCarriedItem(context.character, "fuel") < 2) {
    return null;
  }
  const targets = getAttackTargets(context, definition).filter((target) => {
    const coord = target.character.position?.coord;
    if (!coord) {
      return false;
    }
    const distance = axialDistance(origin, coord);
    const fuelCost = distance === 0 ? 2 : distance === 1 ? 5 : 0;
    const tile = context.map.byCoord[coordKey(coord)];
    return (
      fuelCost > 0 &&
      countCarriedItem(context.character, "fuel") >= fuelCost &&
      !!tile &&
      tile.walkable !== false &&
      !isTileMarked(tile, context.currentTurn) &&
      !hasTeammateAtCoord(context, coord)
    );
  });
  const target = selectTarget(targets, context);
  const targetCoord = target?.character.position?.coord;
  if (!target || !targetCoord) {
    return null;
  }
  const enemiesAtLocation = targets.filter(
    (candidate) =>
      coordKey(candidate.character.position?.coord) === coordKey(targetCoord)
  ).length;
  return {
    definition,
    plan: {
      actionId: definition.id,
      targetLocationId: { ...targetCoord }
    },
    weight:
      computeBaseWeight(definition, context.personality) *
      (1 + enemiesAtLocation),
    attackScore: 5
  };
}

function createBreakfastCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  const energy = getEnergyStats(context.character);
  if (
    !isActionAllowedAtLocation(context, definition.id) ||
    energy.max <= 0 ||
    energy.current / energy.max >= 0.5
  ) {
    return null;
  }
  const deficit = energy.max - energy.current;
  return {
    definition,
    plan: { actionId: definition.id },
    weight:
      computeBaseWeight(definition, context.personality) *
      (1 + deficit / energy.max)
  };
}

function createRefuelCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  const load = getLoadUsage(context.character);
  const refuelWeight = ItemLibrary.fuel.weight * 3;
  if (
    !isActionAllowedAtLocation(context, definition.id) ||
    !load ||
    load.current + refuelWeight > load.max
  ) {
    return null;
  }
  return {
    definition,
    plan: { actionId: definition.id },
    weight:
      computeBaseWeight(definition, context.personality) *
      (1 + (load.max - load.current - refuelWeight) / load.max)
  };
}

function createPlaceC4Candidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  const origin = context.character.position?.coord;
  const tile = getCurrentTile(context);
  if (
    !origin ||
    !tile ||
    tile.walkable === false ||
    isTileMarked(tile, context.currentTurn) ||
    countCarriedItem(context.character, "c4") <= 0 ||
    context.match.c4s?.some(
      (charge) =>
        charge.ownerId === context.playerId &&
        areSameLocation(charge.coord, origin)
    )
  ) {
    return null;
  }
  const nearbyEnemies = getNearbyEnemies(context, origin, 1);
  if (nearbyEnemies.length === 0) {
    return null;
  }
  return {
    definition,
    plan: { actionId: definition.id },
    weight:
      computeBaseWeight(definition, context.personality) *
      (1 + nearbyEnemies.length),
    attackScore: 3,
  };
}

function createDetonateC4Candidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  if (countCarriedItem(context.character, "detonator") <= 0) {
    return null;
  }
  const origin = context.character.position?.coord;
  const chargeOptions = (context.match.c4s ?? [])
    .filter((charge) => charge.ownerId === context.playerId)
    .map((charge) => ({
      charge,
      targets: getNearbyEnemies(context, charge.coord, 0),
    }))
    .filter(({ charge, targets }) => {
      const canSelfDestruct =
        context.personality === BotPersonality.Aggressive && targets.length >= 2;
      return (
        targets.length > 0 &&
        (canSelfDestruct || !areSameLocation(origin, charge.coord)) &&
        !hasTeammateAtCoord(context, charge.coord)
      );
    });
  const selected = pickRandom(chargeOptions, context.rng);
  if (!selected) {
    return null;
  }
  return {
    definition,
    plan: {
      actionId: definition.id,
      targetLocationId: { ...selected.charge.coord },
    },
    weight:
      computeBaseWeight(definition, context.personality) *
      (1 + selected.targets.length * 2),
    attackScore: 12,
  };
}

function createPlaceTrapCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  const origin = context.character.position?.coord;
  if (!origin || countCarriedItem(context.character, "trap") <= 0) {
    return null;
  }
  const destinations = neighbors(origin)
    .map((coord) => context.map.byCoord[coordKey(coord)])
    .filter(
      (tile): tile is HexTileSnapshot =>
        !!tile &&
        tile.walkable !== false &&
        tile.meta?.destroyed !== true &&
        axialDistance(origin, tile.coord) === 1 &&
        !hasTeammateAtCoord(context, tile.coord) &&
        !hasOwnedTrapOnEdge(context, origin, tile.coord)
    );
  if (destinations.length === 0) {
    return null;
  }
  const enemyOccupied = destinations.filter(
    (tile) => getNearbyEnemies(context, tile.coord, 0).length > 0
  );
  const preferredDestinations =
    enemyOccupied.length > 0 ? enemyOccupied : destinations;
  const destination = pickRandom(preferredDestinations, context.rng);
  if (!destination) {
    return null;
  }
  return {
    definition,
    plan: {
      actionId: definition.id,
      targetLocationId: { ...destination.coord },
    },
    weight:
      computeBaseWeight(definition, context.personality) *
      (1 + enemyOccupied.length),
    ...(enemyOccupied.length > 0 ? { attackScore: 2 } : {}),
  };
}

function createDodgeCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  if ((context.character.statuses?.dodgeAttempts ?? 0) > 0) {
    return null;
  }
  const origin = context.character.position?.coord;
  const threats = origin ? getNearbyEnemies(context, origin, 1) : [];
  if (threats.length === 0) {
    return null;
  }
  const health = getHealthStats(context.character);
  const healthDeficit =
    health.max > 0 ? (health.max - health.current) / health.max : 0;
  return {
    definition,
    plan: { actionId: definition.id },
    weight:
      computeBaseWeight(definition, context.personality) *
      (1 + threats.length + Math.max(0, healthDeficit)),
  };
}

function createMoveCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  const origin = context.character.position?.coord;
  if (!origin) {
    return null;
  }
  const destinations = neighbors(origin)
    .map((coord) => context.map.byCoord[coordKey(coord)])
    .filter(
      (tile): tile is HexTileSnapshot =>
        !!tile &&
        tile.walkable &&
        tile.meta?.destroyed !== true &&
        !hasOwnedTrapOnEdge(context, origin, tile.coord)
    );
  if (destinations.length === 0) {
    return null;
  }
  const safeDestinations = destinations.filter(
    (tile) => !isTileMarked(tile, context.currentTurn)
  );
  const candidatesList =
    safeDestinations.length > 0 ? safeDestinations : destinations;
  const destination = pickRandom(candidatesList, context.rng);
  if (!destination) {
    return null;
  }
  const plan: PlayerPlannedAction = {
    actionId: definition.id,
    targetLocationId: destination.coord
  };
  const weight = computeBaseWeight(definition, context.personality) * 1.1;
  return { definition, plan, weight };
}

function createPickUpCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  const tile = getCurrentTile(context);
  if (!tile) {
    return null;
  }
  const visibleItems = getVisibleItems(tile, context.character);
  if (visibleItems.length === 0) {
    return null;
  }
  const itemLookup = buildItemLookup(context.match);
  const load = getLoadUsage(context.character);
  let currentLoad = load?.current ?? 0;
  let maxLoad = load?.max ?? Number.POSITIVE_INFINITY;
  let hasBandolier = hasCarriedItem(context.character, "bandolier");
  const pickupLimit =
    3 + Math.max(0, Math.floor(getSkillEffectTotal(context.character, "pickup_scope_increase")));
  const pickupQueue = visibleItems
    .filter((itemId) => itemLookup[itemId] !== undefined)
    .sort((left, right) => {
      const leftIsBandolier = itemLookup[left]?.item_type === "bandolier";
      const rightIsBandolier = itemLookup[right]?.item_type === "bandolier";
      return Number(rightIsBandolier) - Number(leftIsBandolier);
    });
  const pickableItems: string[] = [];
  for (const itemId of pickupQueue) {
    if (pickableItems.length >= pickupLimit) {
      break;
    }
    const itemType = itemLookup[itemId].item_type;
    const item = ItemLibrary[itemType];
    if (!item || item.canBePickedUp === false) {
      continue;
    }
    const itemWeight =
      typeof item.weight === "number" && Number.isFinite(item.weight)
        ? Math.max(0, item.weight)
        : 0;
    const addedCapacity =
      itemType === "bandolier" && !hasBandolier ? 5 : 0;
    if (currentLoad + itemWeight > maxLoad + addedCapacity) {
      continue;
    }
    pickableItems.push(itemId);
    currentLoad += itemWeight;
    maxLoad += addedCapacity;
    if (addedCapacity > 0) {
      hasBandolier = true;
    }
  }
  if (pickableItems.length === 0) {
    return null;
  }
  const plan: PlayerPlannedAction = {
    actionId: definition.id,
    targetItemIds: pickableItems
  };
  const weight =
    computeBaseWeight(definition, context.personality) *
    (1 + pickableItems.length / 3);
  return { definition, plan, weight };
}

function createDropCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  const load = getLoadUsage(context.character);
  if (!load || load.ratio <= 0.75) {
    return null;
  }
  const item = getCarriedItemOptions(context.character)
    .filter(
      (candidate) => candidate.weight > 0 && candidate.itemId !== "bandolier"
    )
    .sort((left, right) => right.weight - left.weight)[0];
  if (!item) {
    return null;
  }
  return {
    definition,
    plan: { actionId: definition.id, targetItemIds: [item.itemId] },
    weight:
      computeBaseWeight(definition, context.personality) *
      (1 + Math.max(0, load.ratio - 0.75) * 4)
  };
}

function createThrowCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  const items = getCarriedItemOptions(context.character).filter(
    (item) => item.itemId !== "zarkans" && item.itemId !== "zarkan3"
  );
  const molotov = items.find((item) => item.itemId === "molotov");
  const load = getLoadUsage(context.character);
  if (!molotov && (!load || load.ratio <= 0.75)) {
    return null;
  }
  const targets = getAttackTargets(context, definition).filter((target) => {
    const coord = target.character.position?.coord;
    return !!coord && !hasTeammateAtCoord(context, coord);
  });
  const target = selectTarget(targets, context);
  const targetCoord = target?.character.position?.coord;
  if (!target || !targetCoord) {
    return null;
  }
  const throwable =
    molotov ?? items.slice().sort((left, right) => right.weight - left.weight)[0];
  if (!throwable) {
    return null;
  }
  return {
    definition,
    plan: {
      actionId: definition.id,
      targetLocationId: { ...targetCoord },
      targetPlayerIds: [target.character.id],
      targetItemIds: [throwable.itemId]
    },
    weight:
      computeBaseWeight(definition, context.personality) *
      (1 + targets.length / 2),
    attackScore: throwable.itemId === "molotov" ? 4 : 1
  };
}

function createStealCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  const load = getLoadUsage(context.character);
  if (!load || load.ratio >= 0.5) {
    return null;
  }
  const targets = getSameTileTargets(context, { excludeProtected: true }).filter(
    (target) =>
      getCarriedItemOptions(target.character).some(
        (item) => ItemLibrary[item.itemId]?.canBeStolen !== false
      )
  );
  const target = selectTarget(targets, context);
  if (!target) {
    return null;
  }
  return {
    definition,
    plan: { actionId: definition.id, targetPlayerIds: [target.id] },
    weight:
      computeBaseWeight(definition, context.personality) *
      (1 + targets.length / 2 + (0.5 - load.ratio))
  };
}

function createBlackMarketTradeCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  const load = getLoadUsage(context.character);
  if (
    !load ||
    load.ratio <= 0.5 ||
    !isActionAllowedAtLocation(context, definition.id)
  ) {
    return null;
  }
  const item = getCarriedItemOptions(context.character)
    .filter((candidate) => candidate.weight > 0)
    .sort((left, right) => right.weight - left.weight)[0];
  if (!item) {
    return null;
  }
  return {
    definition,
    plan: { actionId: definition.id, targetItemIds: [item.itemId] },
    weight:
      computeBaseWeight(definition, context.personality) *
      (1 + load.ratio)
  };
}

function createInjectVirusCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  if (!hasCarriedItem(context.character, "virus")) {
    return null;
  }
  const targets = getSameTileTargets(context, { excludeProtected: false }).filter(
    (target) =>
      !isVirusInfected(target.character) &&
      target.character.statuses?.vaccine?.immune !== true
  );
  const target = selectTarget(targets, context);
  if (!target) {
    return null;
  }
  return {
    definition,
    plan: { actionId: definition.id, targetPlayerIds: [target.id] },
    weight:
      computeBaseWeight(definition, context.personality) *
      (1 + targets.length / 2),
    attackScore: 4
  };
}

function createInjectVaccineCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  if (!hasCarriedItem(context.character, "vaccine")) {
    return null;
  }
  const tileId = context.character.position?.tileId;
  if (!tileId) {
    return null;
  }
  const teamId = getEffectiveTeamId(context.character);
  const occupants = Object.entries(context.match.playerCharacters ?? {}).filter(
    ([, character]) =>
      !!character &&
      character.position?.tileId === tileId &&
      !isCharacterIncapacitated(character)
  );
  const contagiousPresent = occupants.some(
    ([, character]) => isVirusInfected(character)
  );
  if (!contagiousPresent) {
    return null;
  }
  let targetId: string | undefined;
  if (
    context.character.statuses?.vaccine?.immune !== true &&
    (isVirusInfected(context.character) || contagiousPresent)
  ) {
    targetId = context.playerId;
  } else {
    targetId = occupants.find(
      ([playerId, character]) =>
        playerId !== context.playerId &&
        teamId !== undefined &&
        getEffectiveTeamId(character) === teamId &&
        isVirusInfected(character) &&
        character.statuses?.vaccine?.immune !== true
    )?.[0];
  }
  if (!targetId) {
    return null;
  }
  return {
    definition,
    plan: { actionId: definition.id, targetPlayerIds: [targetId] },
    weight: computeBaseWeight(definition, context.personality) * 1.5
  };
}

function createSearchCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  const tile = getCurrentTile(context);
  if (!tile) {
    return null;
  }
  const undiscovered = getUndiscoveredItems(tile, context.character);
  if (undiscovered.length === 0) {
    return null;
  }
  const plan: PlayerPlannedAction = {
    actionId: definition.id
  };
  const weight =
    computeBaseWeight(definition, context.personality) *
    (1 + undiscovered.length / 4);
  return { definition, plan, weight };
}

function createFeedCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  if (!hasFeedConsumable(context.character)) {
    return null;
  }
  const energyStats = getEnergyStats(context.character);
  const deficit = Math.max(0, energyStats.max - energyStats.current);
  if (deficit <= 0) {
    return null;
  }
  const plan: PlayerPlannedAction = {
    actionId: definition.id,
    targetPlayerIds: [context.playerId]
  };
  const weight =
    computeBaseWeight(definition, context.personality) * (1 + deficit / 8);
  return { definition, plan, weight };
}

function createFocusCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  const energyStats = getEnergyStats(context.character);
  const deficit = Math.max(0, energyStats.max - energyStats.current);
  if (deficit < 4) {
    return null;
  }
  const plan: PlayerPlannedAction = {
    actionId: definition.id
  };
  const weight =
    computeBaseWeight(definition, context.personality) * (1 + deficit / 10);
  return { definition, plan, weight };
}

function createBandageCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  if (!hasBandage(context.character)) {
    return null;
  }
  const healthStats = getHealthStats(context.character);
  const deficit = Math.max(0, healthStats.max - healthStats.current);
  if (deficit < 2) {
    return null;
  }
  const plan: PlayerPlannedAction = {
    actionId: definition.id,
    targetPlayerIds: [context.playerId]
  };
  const weight =
    computeBaseWeight(definition, context.personality) * (1 + deficit / 5);
  return { definition, plan, weight };
}

function createMedicineCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  if (!hasMedicine(context.character)) {
    return null;
  }
  const healthStats = getHealthStats(context.character);
  const deficit = Math.max(0, healthStats.max - healthStats.current);
  if (deficit < 4) {
    return null;
  }
  const plan: PlayerPlannedAction = {
    actionId: definition.id,
    targetPlayerIds: [context.playerId]
  };
  const weight =
    computeBaseWeight(definition, context.personality) * (1 + deficit / 8);
  return { definition, plan, weight };
}

function createProtectCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  const protectConditions = context.character.statuses?.conditions ?? [];
  const alreadyProtected = protectConditions.indexOf("protected") !== -1;
  if (alreadyProtected) {
    return null;
  }
  const healthStats = getHealthStats(context.character);
  const deficit = Math.max(0, healthStats.max - healthStats.current);
  const plan: PlayerPlannedAction = {
    actionId: definition.id,
    targetPlayerIds: [context.playerId]
  };
  const weight =
    computeBaseWeight(definition, context.personality) *
    (deficit > 0 ? 1.5 : 0.8);
  return { definition, plan, weight };
}

function createSleepCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  const healthStats = getHealthStats(context.character);
  const deficit = Math.max(0, healthStats.max - healthStats.current);
  if (deficit <= 0) {
    return null;
  }
  const plan: PlayerPlannedAction = {
    actionId: definition.id
  };
  const weight =
    computeBaseWeight(definition, context.personality) * (1 + deficit / 6);
  return { definition, plan, weight };
}

function createRecoverCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  if (!isActionAllowedAtLocation(context, definition.id)) {
    return null;
  }
  const healthStats = getHealthStats(context.character);
  const deficit = Math.max(0, healthStats.max - healthStats.current);
  if (deficit < 3) {
    return null;
  }
  const plan: PlayerPlannedAction = {
    actionId: definition.id
  };
  const weight =
    computeBaseWeight(definition, context.personality) * (1 + deficit / 4);
  return { definition, plan, weight };
}

function createScareCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  const origin = context.character.position?.coord;
  if (!origin) {
    return null;
  }
  const targets = getSameTileTargets(context, { excludeProtected: true });
  if (targets.length === 0) {
    return null;
  }
  const destinations = neighbors(origin)
    .map((coord) => context.map.byCoord[coordKey(coord)])
    .filter((tile): tile is HexTileSnapshot => !!tile && tile.walkable);
  if (destinations.length === 0) {
    return null;
  }
  const target = selectTarget(targets, context);
  const destination = pickRandom(destinations, context.rng);
  if (!target || !destination) {
    return null;
  }
  const plan: PlayerPlannedAction = {
    actionId: definition.id,
    targetPlayerIds: [target.id],
    targetLocationId: destination.coord
  };
  const weight =
    computeBaseWeight(definition, context.personality) * (1 + targets.length);
  return { definition, plan, weight, attackScore: 3 };
}

function createPunchCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  const targets = getSameTileTargets(context, { excludeProtected: false });
  if (targets.length === 0) {
    return null;
  }
  const target = selectTarget(targets, context);
  if (!target) {
    return null;
  }
  const plan: PlayerPlannedAction = {
    actionId: definition.id,
    targetPlayerIds: [target.id]
  };
  const weight =
    computeBaseWeight(definition, context.personality) *
    (1 + targets.length / 2);
  return { definition, plan, weight, attackScore: 2 };
}

function createWeaponAttackCandidate(
  definition: ActionDefinition,
  context: BotActionContext
): BotActionCandidate | null {
  if (!hasAttackWeapon(context.character, definition.id)) {
    return null;
  }

  const targets = getAttackTargets(context, definition);
  if (targets.length === 0) {
    return null;
  }

  if (definition.id === "fire_rocket_launcher") {
    const rocketTargets = targets.filter((target) => {
      const coord = target.character.position?.coord;
      return !!coord && !hasTeammateAtCoord(context, coord);
    });
    const target = selectTarget(rocketTargets, context);
    const targetCoord = target?.character.position?.coord;
    if (!target || !targetCoord) {
      return null;
    }
    return {
      definition,
      plan: {
        actionId: definition.id,
        targetLocationId: targetCoord
      },
      weight:
        computeBaseWeight(definition, context.personality) *
        (1 + rocketTargets.length),
      attackScore: 20
    };
  }

  const target = selectTarget(targets, context);
  if (!target) {
    return null;
  }
  return {
    definition,
    plan: {
      actionId: definition.id,
      targetPlayerIds: [target.id],
      ...(definition.id === "use_chemical_weapon"
        ? { singleTarget: true }
        : {})
    },
    weight:
      computeBaseWeight(definition, context.personality) *
      (1 + targets.length / 2),
    attackScore: getAttackScore(definition.id, context.character)
  };
}

function hasAttackWeapon(character: PlayerCharacter, actionId: ActionId): boolean {
  switch (actionId) {
    case "knife_attack":
      return hasCarriedItem(character, "knife");
    case "axe_attack":
      return hasCarriedItem(character, "axe");
    case "bat_attack":
      return (
        hasCarriedItem(character, "bat") ||
        hasCarriedItem(character, "nail_bat")
      );
    case "shoot_pistol":
      return (
        hasCarriedItem(character, "pistol") &&
        hasCarriedItem(character, "bullet")
      );
    case "shoot_harpoon":
      return (
        hasCarriedItem(character, "harpoon") &&
        hasCarriedItem(character, "arrow")
      );
    case "fire_rocket_launcher":
      return hasCarriedItem(character, "rocket_launcher");
    case "use_chemical_weapon":
      return hasCarriedItem(character, "chemical_weapon");
    default:
      return false;
  }
}

function getAttackScore(
  actionId: ActionId,
  character: PlayerCharacter
): number {
  switch (actionId) {
    case "knife_attack":
      return 4;
    case "axe_attack":
      return 8;
    case "bat_attack":
      return hasCarriedItem(character, "nail_bat") ? 7 : 5;
    case "shoot_pistol":
      return 10;
    case "shoot_harpoon":
      return 7;
    case "use_chemical_weapon":
      return 11;
    case "fire_rocket_launcher":
      return 20;
    default:
      return 0;
  }
}

function computeBaseWeight(
  definition: ActionDefinition,
  personality: BotPersonality
): number {
  const tags = definition.tags ?? [];
  if (tags.length === 0) {
    return 1;
  }
  let weight = 1;
  for (const tag of tags) {
    const base = DEFAULT_TAG_WEIGHTS[tag] ?? 1;
    const modifier = PERSONALITY_TAG_MULTIPLIERS[personality][tag] ?? 1;
    weight *= base * modifier;
  }
  return weight > 0 ? weight : 0.1;
}

function pickRandom<T>(items: T[], rng: () => number): T | undefined {
  if (items.length === 0) {
    return undefined;
  }
  const index = Math.floor(rng() * items.length);
  return items[index];
}

function chooseBotAction(
  candidates: BotActionCandidate[],
  rng: () => number
): BotActionCandidate | null {
  const initialChoice = pickWeighted(candidates, rng);
  if (!initialChoice || !isAttackCandidate(initialChoice)) {
    return initialChoice;
  }
  const attacks = candidates.filter(isAttackCandidate);
  if (attacks.length === 0) {
    return initialChoice;
  }
  const bestScore = Math.max(
    ...attacks.map((candidate) => candidate.attackScore ?? 0)
  );
  const bestAttacks = attacks.filter(
    (candidate) => (candidate.attackScore ?? 0) === bestScore
  );
  return pickRandom(bestAttacks, rng) ?? initialChoice;
}

function isAttackCandidate(candidate: BotActionCandidate): boolean {
  return (candidate.definition.tags?.indexOf("Attack") ?? -1) !== -1;
}

function pickWeighted<T extends { weight: number }>(
  items: T[],
  rng: () => number
): T | null {
  if (items.length === 0) {
    return null;
  }
  const total = items.reduce(
    (sum, entry) => sum + Math.max(0, entry.weight),
    0
  );
  if (total <= 0) {
    return null;
  }
  const threshold = rng() * total;
  let accumulated = 0;
  for (const entry of items) {
    accumulated += Math.max(0, entry.weight);
    if (threshold <= accumulated) {
      return entry;
    }
  }
  return items[items.length - 1];
}

function getCurrentTile(
  context: BotActionContext
): HexTileSnapshot | undefined {
  const tileId = context.character.position?.tileId;
  if (tileId && context.map.byId[tileId]) {
    return context.map.byId[tileId];
  }
  const coord = context.character.position?.coord;
  if (coord) {
    return context.map.byCoord[coordKey(coord)];
  }
  return undefined;
}

function getVisibleItems(
  tile: HexTileSnapshot,
  character: PlayerCharacter
): string[] {
  const tileItems = Array.isArray(tile.itemIds) ? tile.itemIds : [];
  const discovered = buildDiscoveredLookup(character);
  if (!discovered) {
    return tileItems.slice();
  }
  const visible: string[] = [];
  for (let i = 0; i < tileItems.length; i += 1) {
    const id = tileItems[i];
    if (Object.prototype.hasOwnProperty.call(discovered, id)) {
      visible.push(id);
    }
  }
  return visible;
}

function getUndiscoveredItems(
  tile: HexTileSnapshot,
  character: PlayerCharacter
): string[] {
  const tileItems = Array.isArray(tile.itemIds) ? tile.itemIds : [];
  const discovered = buildDiscoveredLookup(character);
  if (!discovered) {
    return tileItems.slice();
  }
  const undiscovered: string[] = [];
  for (let i = 0; i < tileItems.length; i += 1) {
    const id = tileItems[i];
    if (!Object.prototype.hasOwnProperty.call(discovered, id)) {
      undiscovered.push(id);
    }
  }
  return undiscovered;
}

function buildDiscoveredLookup(
  character: PlayerCharacter
): Record<string, true> | null {
  const list = Array.isArray(character.discoveredItemIds)
    ? character.discoveredItemIds.filter(
        (entry): entry is string => typeof entry === "string"
      )
    : [];
  if (list.length === 0) {
    return null;
  }
  const lookup: Record<string, true> = {};
  for (let i = 0; i < list.length; i += 1) {
    const id = list[i];
    if (!id || Object.prototype.hasOwnProperty.call(lookup, id)) {
      continue;
    }
    lookup[id] = true;
  }
  return lookup;
}

function getHealthStats(character: PlayerCharacter): {
  current: number;
  max: number;
} {
  const stats = character.stats?.health;
  const current =
    stats && typeof stats.current === "number" && isFinite(stats.current)
      ? stats.current
      : 0;
  const max =
    stats && typeof stats.max === "number" && isFinite(stats.max)
      ? stats.max
      : current;
  return { current, max };
}

function getEnergyStats(character: PlayerCharacter): {
  current: number;
  max: number;
} {
  const stats = character.stats?.energy;
  const current =
    stats && typeof stats.current === "number" && isFinite(stats.current)
      ? stats.current
      : 0;
  const max =
    stats && typeof stats.max === "number" && isFinite(stats.max)
      ? stats.max
      : current;
  return { current, max };
}

interface LoadUsage {
  current: number;
  max: number;
  ratio: number;
}

interface CarriedItemOption {
  itemId: ItemId;
  quantity: number;
  weight: number;
  sellValue: number;
}

function getLoadUsage(character: PlayerCharacter): LoadUsage | undefined {
  const load = character.stats?.load;
  const current = load?.current;
  const max = load?.max;
  if (
    typeof current !== "number" ||
    !Number.isFinite(current) ||
    typeof max !== "number" ||
    !Number.isFinite(max) ||
    max <= 0
  ) {
    return undefined;
  }
  const safeCurrent = Math.max(0, current);
  return { current: safeCurrent, max, ratio: safeCurrent / max };
}

function countCarriedItem(character: PlayerCharacter, itemId: string): number {
  return (character.inventory?.carriedItems ?? []).reduce(
    (total, stack) =>
      stack?.itemId === itemId &&
      typeof stack.quantity === "number" &&
      Number.isFinite(stack.quantity)
        ? total + Math.max(0, Math.floor(stack.quantity))
        : total,
    0
  );
}

function getCarriedItemOptions(character: PlayerCharacter): CarriedItemOption[] {
  const options: CarriedItemOption[] = [];
  for (const stack of character.inventory?.carriedItems ?? []) {
    const itemId = stack?.itemId;
    const definition =
      typeof itemId === "string" ? ItemLibrary[itemId as ItemId] : undefined;
    const quantity = stack?.quantity;
    if (
      !definition ||
      typeof quantity !== "number" ||
      !Number.isFinite(quantity) ||
      Math.floor(quantity) <= 0
    ) {
      continue;
    }
    options.push({
      itemId: itemId as ItemId,
      quantity: Math.floor(quantity),
      weight:
        typeof definition.weight === "number" &&
        Number.isFinite(definition.weight)
          ? Math.max(0, definition.weight)
          : 0,
      sellValue:
        typeof definition.sellValue === "number" &&
        Number.isFinite(definition.sellValue)
          ? Math.max(0, definition.sellValue)
          : 0
    });
  }
  return options;
}

function hasBandage(character: PlayerCharacter): boolean {
  const stacks = character.inventory?.carriedItems;
  if (!Array.isArray(stacks)) {
    return false;
  }
  for (const stack of stacks) {
    if (!stack || typeof stack.itemId !== "string") {
      continue;
    }
    if (stack.itemId === "bandage") {
      const quantity =
        typeof stack.quantity === "number" && isFinite(stack.quantity)
          ? stack.quantity
          : 0;
      if (quantity > 0) {
        return true;
      }
    }
  }
  return false;
}

function hasMedicine(character: PlayerCharacter): boolean {
  const stacks = character.inventory?.carriedItems;
  if (!Array.isArray(stacks)) {
    return false;
  }
  return stacks.some(
    (stack) =>
      stack?.itemId === "medicine" &&
      typeof stack.quantity === "number" &&
      isFinite(stack.quantity) &&
      stack.quantity > 0
  );
}

function isActionAllowedAtLocation(
  context: BotActionContext,
  actionId: ActionId
): boolean {
  const tile = getCurrentTile(context);
  if (!tile) {
    return false;
  }
  const definition = CellLibrary[tile.localizationType];
  if (!definition) {
    return false;
  }
  const specials = definition.specialActionIds ?? [];
  for (let i = 0; i < specials.length; i += 1) {
    if (specials[i] === actionId) {
      return true;
    }
  }
  return false;
}

interface TargetOption {
  id: string;
  character: PlayerCharacter;
}

function getEffectiveTeamId(character: PlayerCharacter): string | undefined {
  return character.secretTeamId?.trim() || character.teamId?.trim();
}

function getSameTileTargets(
  context: BotActionContext,
  options: { excludeProtected: boolean }
): TargetOption[] {
  const originTileId = context.character.position?.tileId;
  const actorTeamId = getEffectiveTeamId(context.character);
  if (!originTileId) {
    return [];
  }
  const roster = context.match.playerCharacters ?? {};
  const results: TargetOption[] = [];
  for (const id in roster) {
    if (!Object.prototype.hasOwnProperty.call(roster, id)) {
      continue;
    }
    const contender = roster[id];
    if (!contender || id === context.playerId) {
      continue;
    }
    if (contender.position?.tileId !== originTileId) {
      continue;
    }
    if (
      actorTeamId &&
      getEffectiveTeamId(contender) === actorTeamId
    ) {
      continue;
    }
    if (isCharacterIncapacitated(contender)) {
      continue;
    }
    const isProtected =
      contender.statuses?.conditions &&
      contender.statuses.conditions.indexOf("protected") !== -1;
    if (options.excludeProtected && isProtected) {
      continue;
    }
    results.push({ id, character: contender });
  }
  return results;
}

function hasOwnedTrapOnEdge(
  context: BotActionContext,
  from: Axial,
  to: Axial
): boolean {
  return (context.match.traps ?? []).some(
    (trap) =>
      trap.ownerId === context.playerId &&
      ((areSameLocation(trap.from.coord, from) &&
        areSameLocation(trap.to.coord, to)) ||
        (areSameLocation(trap.from.coord, to) &&
          areSameLocation(trap.to.coord, from)))
  );
}

function getNearbyEnemies(
  context: BotActionContext,
  center: Axial,
  maxDistance: number
): TargetOption[] {
  const actorTeamId = getEffectiveTeamId(context.character);
  const roster = context.match.playerCharacters ?? {};
  const results: TargetOption[] = [];
  for (const id in roster) {
    if (!Object.prototype.hasOwnProperty.call(roster, id)) {
      continue;
    }
    const contender = roster[id];
    const coord = contender?.position?.coord;
    if (
      !contender ||
      id === context.playerId ||
      !coord ||
      axialDistance(center, coord) > maxDistance ||
      isCharacterIncapacitated(contender)
    ) {
      continue;
    }
    if (actorTeamId && getEffectiveTeamId(contender) === actorTeamId) {
      continue;
    }
    results.push({ id, character: contender });
  }
  return results;
}

function getAttackTargets(
  context: BotActionContext,
  definition: ActionDefinition
): TargetOption[] {
  const origin = context.character.position?.coord;
  if (!origin) {
    return [];
  }
  const allowedDistances =
    definition.range && definition.range.length > 0 ? definition.range : [0];
  const actorTeamId = getEffectiveTeamId(context.character);
  const roster = context.match.playerCharacters ?? {};
  const results: TargetOption[] = [];
  for (const id in roster) {
    if (!Object.prototype.hasOwnProperty.call(roster, id)) {
      continue;
    }
    const contender = roster[id];
    const coord = contender?.position?.coord;
    if (!contender || id === context.playerId || !coord) {
      continue;
    }
    if (allowedDistances.indexOf(axialDistance(origin, coord)) === -1) {
      continue;
    }
    if (
      actorTeamId &&
      getEffectiveTeamId(contender) === actorTeamId
    ) {
      continue;
    }
    if (isCharacterIncapacitated(contender)) {
      continue;
    }
    results.push({ id, character: contender });
  }
  return results;
}

function hasTeammateAtCoord(context: BotActionContext, coord: Axial): boolean {
  const actorTeamId = getEffectiveTeamId(context.character);
  if (!actorTeamId) {
    return false;
  }
  const roster = context.match.playerCharacters ?? {};
  for (const id in roster) {
    if (!Object.prototype.hasOwnProperty.call(roster, id)) {
      continue;
    }
    if (id === context.playerId) {
      continue;
    }
    const contender = roster[id];
    const contenderCoord = contender?.position?.coord;
    if (
      contenderCoord &&
      contenderCoord.q === coord.q &&
      contenderCoord.r === coord.r &&
      getEffectiveTeamId(contender) === actorTeamId
    ) {
      return true;
    }
  }
  return false;
}

function selectTarget(
  targets: TargetOption[],
  context: BotActionContext
): TargetOption | undefined {
  if (targets.length === 0) {
    return undefined;
  }
  return pickRandom(targets, context.rng);
}
