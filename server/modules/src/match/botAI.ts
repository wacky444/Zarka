import {
  ActionLibrary,
  CellLibrary,
  neighbors,
  type ActionDefinition,
  type ActionId,
  type ActionTag,
  type Axial,
  type HexTileSnapshot,
  type PlayerCharacter,
  type PlayerPlannedAction,
} from "@shared";
import { MatchRecord } from "src/models/types";
import { hasFeedConsumable } from "./actions/feed";
import {
  isActionOnCooldown,
  updateCharacterCooldowns,
} from "./actions/cooldowns";

export enum BotPersonality {
  Safe = "Safe",
  Aggressive = "Aggressive",
  Hoarder = "Hoarder",
  Random = "Random",
}

const PERSONALITY_ROTATION: BotPersonality[] = [
  BotPersonality.Safe,
  BotPersonality.Aggressive,
  BotPersonality.Hoarder,
  BotPersonality.Random,
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
  TargetItems: 1.1,
};

const PERSONALITY_TAG_MULTIPLIERS: Record<
  BotPersonality,
  Partial<Record<ActionTag, number>>
> = {
  [BotPersonality.Safe]: {
    Movement: 2,
    Support: 1.5,
    Logistics: 1.2,
    Attack: 0.4,
  },
  [BotPersonality.Aggressive]: {
    Attack: 2.2,
    Movement: 1.2,
    Support: 0.9,
    Logistics: 0.6,
  },
  [BotPersonality.Hoarder]: {
    Logistics: 2.3,
    TargetItems: 1.8,
    Recon: 1.3,
    Movement: 0.9,
    Attack: 0.5,
  },
  [BotPersonality.Random]: {},
};

const SUPPORTED_ACTION_IDS: ActionId[] = [
  ActionLibrary.move.id,
  ActionLibrary.pick_up.id,
  ActionLibrary.search.id,
  ActionLibrary.feed.id,
  ActionLibrary.focus.id,
  ActionLibrary.use_bandage.id,
  ActionLibrary.protect.id,
  ActionLibrary.sleep.id,
  ActionLibrary.recover.id,
  ActionLibrary.scare.id,
  ActionLibrary.punch.id,
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
    if (isCharacterIncapacitated(character)) {
      clearBotPlans(character);
      match.playerCharacters[playerId] = character;
      continue;
    }

    updateCharacterCooldowns(character, currentTurn);
    const personality = determinePersonality(playerId);
    const context: BotActionContext = {
      match,
      playerId,
      character,
      map,
      currentTurn,
      personality,
      rng,
    };
    const candidates = buildExecutableActionCandidates(context).filter(
      (candidate) => candidate.weight > 0
    );
    if (candidates.length === 0) {
      clearBotPlans(character);
      match.playerCharacters[playerId] = character;
      continue;
    }

    const choice = pickWeighted(candidates, rng);
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

function isBotId(playerId: string): boolean {
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
  delete character.actionPlan.nextMain;
  if (
    character.actionPlan.main === undefined &&
    character.actionPlan.secondary === undefined &&
    character.actionPlan.nextMain === undefined
  ) {
    delete character.actionPlan;
  }
}

function isCharacterIncapacitated(character: PlayerCharacter): boolean {
  const conditions = character.statuses?.conditions ?? [];
  return (
    conditions.indexOf("dead") !== -1 ||
    conditions.indexOf("unconscious") !== -1
  );
}

function buildExecutableActionCandidates(
  context: BotActionContext
): BotActionCandidate[] {
  const developed = getSupportedDevelopedActions();
  const results: BotActionCandidate[] = [];
  for (let i = 0; i < developed.length; i += 1) {
    const definition = developed[i];
    if (
      isActionOnCooldown(context.character, definition.id, context.currentTurn)
    ) {
      continue;
    }
    if (!hasEnoughEnergy(context.character, definition.energyCost)) {
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
    case "move":
      return createMoveCandidate(definition, context);
    case "pick_up":
      return createPickUpCandidate(definition, context);
    case "search":
      return createSearchCandidate(definition, context);
    case "feed":
      return createFeedCandidate(definition, context);
    case "focus":
      return createFocusCandidate(definition, context);
    case "use_bandage":
      return createBandageCandidate(definition, context);
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
    default:
      return null;
  }
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
    .filter((tile): tile is HexTileSnapshot => !!tile && tile.walkable);
  if (destinations.length === 0) {
    return null;
  }
  const destination = pickRandom(destinations, context.rng);
  if (!destination) {
    return null;
  }
  const plan: PlayerPlannedAction = {
    actionId: definition.id,
    targetLocationId: destination.coord,
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
  const plan: PlayerPlannedAction = {
    actionId: definition.id,
    targetItemIds: visibleItems.slice(0, 3),
  };
  const weight =
    computeBaseWeight(definition, context.personality) *
    (1 + visibleItems.length / 3);
  return { definition, plan, weight };
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
    actionId: definition.id,
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
    targetPlayerIds: [context.playerId],
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
    actionId: definition.id,
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
    targetPlayerIds: [context.playerId],
  };
  const weight =
    computeBaseWeight(definition, context.personality) * (1 + deficit / 5);
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
    targetPlayerIds: [context.playerId],
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
    actionId: definition.id,
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
    actionId: definition.id,
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
    targetLocationId: destination.coord,
  };
  const weight =
    computeBaseWeight(definition, context.personality) * (1 + targets.length);
  return { definition, plan, weight };
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
    targetPlayerIds: [target.id],
  };
  const weight =
    computeBaseWeight(definition, context.personality) *
    (1 + targets.length / 2);
  return { definition, plan, weight };
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
  if (!tileId) {
    return undefined;
  }
  return context.map.byId[tileId];
}

function getVisibleItems(
  tile: HexTileSnapshot,
  character: PlayerCharacter
): string[] {
  const tileItems = Array.isArray(tile.itemIds) ? tile.itemIds : [];
  const found = buildFoundLookup(character);
  if (!found) {
    return tileItems.slice();
  }
  const visible: string[] = [];
  for (let i = 0; i < tileItems.length; i += 1) {
    const id = tileItems[i];
    if (Object.prototype.hasOwnProperty.call(found, id)) {
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
  const found = buildFoundLookup(character);
  if (!found) {
    return tileItems.slice();
  }
  const undiscovered: string[] = [];
  for (let i = 0; i < tileItems.length; i += 1) {
    const id = tileItems[i];
    if (!Object.prototype.hasOwnProperty.call(found, id)) {
      undiscovered.push(id);
    }
  }
  return undiscovered;
}

function buildFoundLookup(
  character: PlayerCharacter
): Record<string, true> | null {
  const list = Array.isArray(character.foundItems)
    ? character.foundItems.filter(
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

function getSameTileTargets(
  context: BotActionContext,
  options: { excludeProtected: boolean }
): TargetOption[] {
  const originTileId = context.character.position?.tileId;
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

function selectTarget(
  targets: TargetOption[],
  context: BotActionContext
): TargetOption | undefined {
  if (targets.length === 0) {
    return undefined;
  }
  // Prefer human players when available so bots harass real opponents.
  const humanTargets = targets.filter((entry) => !isBotId(entry.id));
  if (humanTargets.length > 0) {
    return pickRandom(humanTargets, context.rng);
  }
  return pickRandom(targets, context.rng);
}
