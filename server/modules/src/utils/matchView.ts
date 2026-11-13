import {
  canSeeHiddenCharacter,
  isCharacterHidden,
  RANKED_MATCH_METADATA_KEY,
  type C4Record,
  type GameMap,
  type MatchItemRecord,
  type MatchRecord as SharedMatchRecord,
  type TrapRecord,
  type PlayerCharacter,
  type PlayerCharacterUnknown,
  type PlayerInventory,
  type PlayerItemStack
} from "@shared";
import type { MatchRecord } from "../models/types";
import { axialDistance } from "./location";
import { isCharacterDead } from "./playerCharacter";
import { canCharacterDetectFire } from "./fireVisibility";
import { canReceiveTrackerSignal } from "../match/trackerState";

type DiscoveredItemLookup = Record<string, true>;

function buildDiscoveredItemLookup(
  character: PlayerCharacter | undefined | null,
  partner?: PlayerCharacter | undefined | null
): DiscoveredItemLookup {
  const lookup: DiscoveredItemLookup = {};
  const addIds = (char: PlayerCharacter | undefined | null) => {
    if (!char || !Array.isArray(char.discoveredItemIds)) {
      return;
    }
    for (const entry of char.discoveredItemIds) {
      if (typeof entry !== "string" || entry.length === 0) {
        continue;
      }
      lookup[entry] = true;
    }
  };
  addIds(character);
  addIds(partner);
  return lookup;
}

function filterMapByDiscoveredLookup(
  map: GameMap | undefined,
  discovered: DiscoveredItemLookup,
  viewer: PlayerCharacter | undefined | null,
  partner?: PlayerCharacter | undefined | null
): GameMap | undefined {
  if (!map) {
    return undefined;
  }
  const tiles = Array.isArray(map.tiles)
    ? map.tiles.map((tile) => {
        const itemIds = Array.isArray(tile.itemIds)
          ? tile.itemIds.filter((itemId) =>
              Object.prototype.hasOwnProperty.call(discovered, itemId)
            )
          : [];
        const hasFire =
          typeof tile.meta?.fireStartTurn === "number" ||
          typeof tile.meta?.fireEndTurn === "number";
        const canDetect =
          canCharacterDetectFire(viewer, tile.coord) ||
          (partner ? canCharacterDetectFire(partner, tile.coord) : false);
        if (canDetect || !hasFire) {
          return { ...tile, itemIds };
        }
        const meta = { ...(tile.meta ?? {}) };
        delete meta.fireStartTurn;
        delete meta.fireEndTurn;
        return { ...tile, itemIds, meta };
      })
    : [];
  return {
    ...map,
    tiles
  };
}

function filterItemsByDiscoveredLookup(
  items: MatchItemRecord[] | undefined,
  discovered: DiscoveredItemLookup
): MatchItemRecord[] | undefined {
  if (!Array.isArray(items)) {
    return items;
  }
  if (items.length === 0) {
    return [];
  }
  if (Object.keys(discovered).length === 0) {
    return [];
  }
  const filtered = items.filter((item) =>
    Object.prototype.hasOwnProperty.call(discovered, item.item_id)
  );
  if (filtered.length === 0) {
    return [];
  }
  return filtered.map((item) => ({ ...item }));
}

export function tailorC4sForViewer(
  c4s: C4Record[] | undefined,
  viewerId: string | undefined | null,
  viewAll = false,
  discoveredC4Ids: string[] = [],
): C4Record[] | undefined {
  if (!Array.isArray(c4s) || viewAll) {
    return c4s;
  }
  if (!viewerId) {
    return [];
  }
  const discovered = new Set(discoveredC4Ids);
  return c4s.filter(
    (charge) => charge.ownerId === viewerId || discovered.has(charge.id)
  );
}

export function tailorTrapsForViewer(
  traps: TrapRecord[] | undefined,
  viewerId: string | undefined | null,
  viewAll = false,
): TrapRecord[] | undefined {
  if (!Array.isArray(traps) || viewAll) {
    return traps;
  }
  if (!viewerId) {
    return [];
  }
  return traps.filter((trap) => trap.ownerId === viewerId);
}

function redactInventory(
  inventory: PlayerInventory,
  viewerId?: string | null,
  viewAll = false
): PlayerInventory {
  if (!inventory || !Array.isArray(inventory.carriedItems)) return inventory;
  if (viewAll) return inventory;
  const carriedItems: PlayerItemStack[] = [];
  for (const stack of inventory.carriedItems) {
    if (!stack || stack.quantity <= 0) continue;
    const isPoisoned = !!stack.metadata?.poisonedBy;
    const canSeePoison = !!viewerId && stack.metadata?.poisonedBy === viewerId;
    if (!isPoisoned || canSeePoison) {
      carriedItems.push({ ...stack, ...(stack.metadata ? { metadata: { ...stack.metadata } } : {}) });
    } else {
      const { poisonedBy: _p, ...cleanMeta } = stack.metadata!;
      const cleanStack: PlayerItemStack = {
        ...stack,
        ...(Object.keys(cleanMeta).length > 0 ? { metadata: cleanMeta } : {}),
      };
      if (Object.keys(cleanMeta).length === 0) delete cleanStack.metadata;
      const existing = carriedItems.find((s) => s.itemId === cleanStack.itemId && !s.metadata?.poisonedBy);
      if (existing) {
        existing.quantity += cleanStack.quantity;
        existing.weight += cleanStack.weight;
      } else {
        carriedItems.push(cleanStack);
      }
    }
  }
  return { ...inventory, carriedItems };
}

function redactPoisonAttribution(character: PlayerCharacter, viewerId: string | undefined | null, viewAll: boolean): PlayerCharacter {
  const sanitized = { ...character };
  if (sanitized.inventory) {
    sanitized.inventory = redactInventory(sanitized.inventory, viewerId, viewAll);
  }
  if (viewAll) return sanitized;
  const ownAttribution = viewerId ? sanitized.poisonedFoodBy?.[viewerId] : undefined;
  if (typeof ownAttribution === "number" && ownAttribution > 0) {
    sanitized.poisonedFoodBy = { [viewerId!]: ownAttribution };
  } else {
    delete sanitized.poisonedFoodBy;
  }
  return sanitized;
}

function redactVirusStatus(character: PlayerCharacter): PlayerCharacter {
  const sanitized = { ...character };
  if (sanitized.statuses) {
    const statuses = { ...sanitized.statuses };
    if (Array.isArray(statuses.conditions)) {
      statuses.conditions = statuses.conditions.filter(
        (condition) => condition !== "infected"
      );
    }
    delete statuses.virus;
    sanitized.statuses = statuses;
  }
  return sanitized;
}

function computeViewRange(
  character: PlayerCharacter | undefined | null
): number {
  const raw = character?.stats?.baseViewRange;
  if (typeof raw !== "number" || !isFinite(raw)) {
    return 0;
  }
  return Math.max(0, Math.floor(raw));
}

export function getLivingLoverPartner(
  viewer: PlayerCharacter | undefined | null,
  playerCharacters: Record<string, PlayerCharacter> | undefined
): PlayerCharacter | undefined {
  if (viewer?.secretTeamId?.trim() !== "Enamorados" || isCharacterDead(viewer)) {
    return undefined;
  }
  if (!playerCharacters) {
    return undefined;
  }
  for (const id in playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(playerCharacters, id)) {
      continue;
    }
    const partner = playerCharacters[id];
    if (
      partner &&
      partner.id !== viewer.id &&
      partner.secretTeamId?.trim() === "Enamorados" &&
      !isCharacterDead(partner) &&
      viewer.relationships?.confirmedTeammates?.includes(partner.id)
    ) {
      return partner;
    }
  }
  return undefined;
}

export function tailorPlayerCharactersForViewer(
  playerCharacters: Record<string, PlayerCharacter> | undefined,
  viewerId: string | undefined | null,
  viewAll = false,
  currentTurn?: number
): Record<string, PlayerCharacter> | undefined {
  if (!playerCharacters) {
    return playerCharacters;
  }
  if (viewAll) {
    return { ...playerCharacters };
  }
  const viewerKey = typeof viewerId === "string" ? viewerId : "";
  if (!viewerKey) {
    return { ...playerCharacters };
  }
  const viewer = playerCharacters[viewerKey];
  if (!viewer) {
    return { ...playerCharacters };
  }
  const viewerCoord = viewer.position?.coord;
  const viewRange = computeViewRange(viewer);
  const isInitialSpawnTurn = currentTurn === 0;
  const remoteView =
    typeof currentTurn === "number" && viewer.remoteView?.turn === currentTurn
      ? viewer.remoteView.coord
      : undefined;
  const cameraView =
    typeof currentTurn === "number" && viewer.cameraView?.turn === currentTurn
      ? viewer.cameraView.playerIds
      : undefined;

  const partner = getLivingLoverPartner(viewer, playerCharacters);
  const partnerCoord = partner?.position?.coord;
  const partnerViewRange = partner ? computeViewRange(partner) : 0;
  const partnerRemoteView =
    partner && typeof currentTurn === "number" && partner.remoteView?.turn === currentTurn
      ? partner.remoteView.coord
      : undefined;
  const partnerCameraView =
    partner && typeof currentTurn === "number" && partner.cameraView?.turn === currentTurn
      ? partner.cameraView.playerIds
      : undefined;

  const filtered: Record<string, PlayerCharacter> = {};
  for (const id in playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(playerCharacters, id)) {
      continue;
    }
    const candidate = playerCharacters[id];
    if (id === viewerKey) {
      const sanitizedViewer = redactPoisonAttribution(redactVirusStatus(candidate), viewerId, viewAll);
      filtered[id] = sanitizedViewer;
      continue;
    }

    const isPartner = !!partner && id === partner.id;

    if (!isPartner && !isInitialSpawnTurn && isCharacterHidden(candidate, currentTurn ?? 0)) {
      const canSee =
        canSeeHiddenCharacter(viewer, candidate) ||
        (partner ? canSeeHiddenCharacter(partner, candidate) : false);
      if (!canSee) {
        continue;
      }
    }
    if (!viewerCoord && !isPartner && (!partner || !partnerCoord)) {
      continue;
    }
    const candidateCoord = candidate?.position?.coord;
    if (!candidateCoord) {
      continue;
    }
    const isInNormalView =
      isInitialSpawnTurn || (!!viewerCoord && axialDistance(viewerCoord, candidateCoord) <= viewRange);
    const isInRemoteView =
      !!remoteView &&
      remoteView.q === candidateCoord.q &&
      remoteView.r === candidateCoord.r;
    const isInCameraView =
      !!cameraView && cameraView.indexOf(id) !== -1;
    const isInRadioView = Object.entries(playerCharacters).some(
      ([radioPartnerId, radioPartner]) => {
        const radioCoord = radioPartner.position?.coord;
        return (
          radioPartnerId !== viewerKey &&
          !!radioCoord &&
          radioCoord.q === candidateCoord.q &&
          radioCoord.r === candidateCoord.r &&
          canReceiveTrackerSignal(viewerKey, radioPartnerId, playerCharacters)
        );
      },
    );
    const isInTrackerView = (viewer.trackerViews ?? []).some(
      (trackerView) =>
        trackerView.targetPlayerId === id &&
        Number.isFinite(trackerView.expiresTurn) &&
        trackerView.expiresTurn >= (currentTurn ?? 0) &&
        trackerView.coord.q === candidateCoord.q &&
        trackerView.coord.r === candidateCoord.r,
    );

    let isInLoverPartnerView = false;
    if (partner) {
      const partnerNormalView =
        !!partnerCoord && axialDistance(partnerCoord, candidateCoord) <= partnerViewRange;
      const partnerRemote =
        !!partnerRemoteView &&
        partnerRemoteView.q === candidateCoord.q &&
        partnerRemoteView.r === candidateCoord.r;
      const partnerCamera =
        !!partnerCameraView && partnerCameraView.indexOf(id) !== -1;
      isInLoverPartnerView = partnerNormalView || partnerRemote || partnerCamera;
    }

    const revealedTeamId = viewer.revealedTeamIdsByPlayerId?.[id];
    if (
      isPartner ||
      isInNormalView ||
      isInRemoteView ||
      isInCameraView ||
      isInRadioView ||
      isInTrackerView ||
      isInLoverPartnerView
    ) {
      const isDead =
        isCharacterDead(candidate) ||
        (typeof candidate.stats?.health?.current === "number" &&
          candidate.stats.health.current <= 0);
      const isConfirmedTeammate =
        Array.isArray(viewer.relationships?.confirmedTeammates) &&
        viewer.relationships.confirmedTeammates.indexOf(id) !== -1;
      const sanitized = redactPoisonAttribution(redactVirusStatus(candidate), viewerId, viewAll);
      delete sanitized.secretTeamId;
      delete sanitized.discoveredItemIds;
      delete sanitized.discoveredC4Ids;
      delete sanitized.revealedItemTypesByPlayerId;
      delete sanitized.revealedTeamIdsByPlayerId;
      delete sanitized.actionPlan;
      delete sanitized.poisonedFoodCount;
      delete sanitized.dexterity3SelectedItemId;
      delete sanitized.remoteView;
      delete sanitized.cameraView;
      delete sanitized.trackerViews;
      const publicDeadTeamId = isDead
        ? candidate.secretTeamId?.trim() || candidate.teamId?.trim()
        : undefined;
      if (typeof revealedTeamId === "string" && revealedTeamId.length > 0) {
        sanitized.teamId = revealedTeamId;
      } else if (publicDeadTeamId) {
        sanitized.teamId = publicDeadTeamId;
      } else if (
        isConfirmedTeammate &&
        candidate.secretTeamId &&
        candidate.secretTeamId === viewer.secretTeamId
      ) {
        sanitized.teamId = candidate.secretTeamId;
      } else if (
        !isConfirmedTeammate &&
        candidate.teamId !== undefined
      ) {
        delete sanitized.teamId;
      }
      filtered[id] = sanitized;
    }
  }
  return filtered;
}

export function tailorMapForCharacter(
  map: GameMap | undefined,
  character: PlayerCharacter | undefined | null,
  partnerOrCharacters?: PlayerCharacter | Record<string, PlayerCharacter> | null
): GameMap | undefined {
  const partner =
    partnerOrCharacters && "id" in partnerOrCharacters
      ? (partnerOrCharacters as PlayerCharacter)
      : getLivingLoverPartner(
          character,
          partnerOrCharacters as Record<string, PlayerCharacter> | undefined
        );
  const discovered = buildDiscoveredItemLookup(character, partner);
  return filterMapByDiscoveredLookup(map, discovered, character, partner);
}

export function tailorMatchItemsForCharacter(
  items: MatchItemRecord[] | undefined,
  character: PlayerCharacter | undefined | null,
  partnerOrCharacters?: PlayerCharacter | Record<string, PlayerCharacter> | null
): MatchItemRecord[] | undefined {
  const partner =
    partnerOrCharacters && "id" in partnerOrCharacters
      ? (partnerOrCharacters as PlayerCharacter)
      : getLivingLoverPartner(
          character,
          partnerOrCharacters as Record<string, PlayerCharacter> | undefined
        );
  const discovered = buildDiscoveredItemLookup(character, partner);
  return filterItemsByDiscoveredLookup(items, discovered);
}

export function getEliminatedTeamsByPlayerId(
  playerCharacters: Record<string, PlayerCharacter>
): Record<string, string> {
  const teamsByPlayerId: Record<string, string> = {};
  for (const id in playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(playerCharacters, id)) {
      continue;
    }
    const character = playerCharacters[id];
    const isDead =
      isCharacterDead(character) ||
      (typeof character.stats?.health?.current === "number" &&
        character.stats.health.current <= 0);
    const teamId = character.secretTeamId?.trim() || character.teamId?.trim();
    if (isDead && teamId) {
      teamsByPlayerId[id] = teamId;
    }
  }
  return teamsByPlayerId;
}

export function tailorMatchForPlayer(
  match: MatchRecord,
  playerId: string | undefined | null,
  viewAll = false
): SharedMatchRecord {
  const character =
    playerId && match.playerCharacters
      ? match.playerCharacters[playerId]
      : undefined;
  const partner = getLivingLoverPartner(character, match.playerCharacters);
  const discovered = buildDiscoveredItemLookup(character, partner);
  const map = viewAll
    ? match.map
    : filterMapByDiscoveredLookup(match.map, discovered, character, partner);
  const visibleItems = viewAll
    ? match.items
    : filterItemsByDiscoveredLookup(match.items, discovered);
  const items = visibleItems?.map((item) => {
    if (!item.poisonedBy || viewAll || item.poisonedBy === playerId) return { ...item };
    const { poisonedBy: _hiddenPoisonOwner, ...visibleItem } = item;
    return visibleItem;
  });
  const traps = tailorTrapsForViewer(match.traps, playerId, viewAll);
  const combinedDiscoveredC4Ids = Array.from(
    new Set([
      ...(character?.discoveredC4Ids ?? []),
      ...(partner?.discoveredC4Ids ?? []),
    ])
  );
  const c4s = tailorC4sForViewer(
    match.c4s,
    playerId,
    viewAll,
    combinedDiscoveredC4Ids
  );
  const zarkanDonations = viewAll
    ? match.zarkanDonations ?? []
    : (match.zarkanDonations ?? []).filter(
        (donation) =>
          donation.donor_id === playerId ||
          donation.recipient_id === playerId
      );
  const playerCharacters = tailorPlayerCharactersForViewer(
    match.playerCharacters,
    playerId,
    viewAll,
    match.current_turn
  );
  const revealedTeamsByPlayerId = !viewAll && character
    ? {
        ...(character.revealedTeamIdsByPlayerId ?? {}),
        ...getEliminatedTeamsByPlayerId(match.playerCharacters)
      }
    : undefined;
  const playerList: Record<string, PlayerCharacterUnknown> = {};
  const deadCharacters: Record<string, boolean> = {};
  for (const id in match.playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(match.playerCharacters, id)) {
      continue;
    }
    const char = match.playerCharacters[id];
    playerList[id] = {
      id: char.id,
      name: char.name,
      ...(char.skin ? { skin: char.skin } : {})
    };
    const isDead =
      isCharacterDead(char) ||
      (typeof char.stats?.health?.current === "number" &&
        char.stats.health.current <= 0);
    deadCharacters[id] = !!isDead;
  }
  const teamCounts: Record<string, number> = {};
  if (Array.isArray(match.teams)) {
    for (const teamName of match.teams) {
      teamCounts[teamName] = 0;
    }
  }
  for (const id in match.playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(match.playerCharacters, id)) {
      continue;
    }
    const char = match.playerCharacters[id];
    const isDead =
      isCharacterDead(char) ||
      (typeof char.stats?.health?.current === "number" &&
        char.stats.health.current <= 0);
    if (!isDead) {
      if (char.teamId) {
        teamCounts[char.teamId] = (teamCounts[char.teamId] ?? 0) + 1;
      }
      if (char.secretTeamId) {
        teamCounts[char.secretTeamId] = (teamCounts[char.secretTeamId] ?? 0) + 1;
      }
    }
  }
  const publicMatch = { ...match };
  if (publicMatch.metadata?.[RANKED_MATCH_METADATA_KEY]) {
    const publicMetadata = { ...publicMatch.metadata };
    delete publicMetadata[RANKED_MATCH_METADATA_KEY];
    if (Object.keys(publicMetadata).length > 0) {
      publicMatch.metadata = publicMetadata;
    } else {
      delete publicMatch.metadata;
    }
  }
  delete publicMatch.reportProgress;
  delete publicMatch.safeContainers;
  delete publicMatch.trackers;
  delete publicMatch.pendingBomberStrikes;
  if (!viewAll) {
    delete publicMatch.loversTriggerTurn;
    delete publicMatch.loversFormedTurn;
    delete publicMatch.loverPlayerIds;
  }
  return {
    ...publicMatch,
    playerCharacters: playerCharacters ?? {},
    playerList: playerList ?? {},
    deadCharacters,
    teams: match.teams ? [...match.teams] : Object.keys(teamCounts),
    teamCounts,
    zarkanDonations,
    ...(revealedTeamsByPlayerId ? { revealedTeamsByPlayerId } : {}),
    map,
    items,
    traps,
    c4s
  };
}
