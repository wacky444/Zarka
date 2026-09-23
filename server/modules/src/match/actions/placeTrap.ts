/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type {
  ActionId,
  Axial,
  HexTileSnapshot,
  ReplayPlayerEvent,
  TrapRecord,
} from "@shared";
import { ActionLibrary, axialDistance, neighbors } from "@shared";
import type { MatchRecord } from "../../models/types";
import { isCharacterDead } from "../../utils/playerCharacter";
import {
  getRequestedExtraExecutions,
  getUsableExtraExecutions,
} from "../../utils/energy";
import {
  applyHealthDelta,
  consumeCarriedItem,
  getInventoryDamageReduction,
  resolvePlanDestination,
  type PlannedActionParticipant,
} from "./utils";
import { BaseAction } from "./classes/BaseAction";

const TRAP_DAMAGE = 7;

function findTileAtCoord(
  match: MatchRecord,
  coord: Axial,
): HexTileSnapshot | undefined {
  for (const tile of match.map?.tiles ?? []) {
    if (tile.coord.q === coord.q && tile.coord.r === coord.r) {
      return tile;
    }
  }
  return undefined;
}

interface TransitionLocation {
  tileId: string;
  coord: Axial;
}

function sameEdge(
  left: TrapRecord,
  from: TransitionLocation,
  to: TransitionLocation,
): boolean {
  const sameTileEdge =
    (left.from.tileId === from.tileId && left.to.tileId === to.tileId) ||
    (left.from.tileId === to.tileId && left.to.tileId === from.tileId);
  if (sameTileEdge) {
    return true;
  }
  return (
    (left.from.coord.q === from.coord.q &&
      left.from.coord.r === from.coord.r &&
      left.to.coord.q === to.coord.q &&
      left.to.coord.r === to.coord.r) ||
    (left.from.coord.q === to.coord.q &&
      left.from.coord.r === to.coord.r &&
      left.to.coord.q === from.coord.q &&
      left.to.coord.r === from.coord.r)
  );
}

function createTrapId(
  match: MatchRecord,
  ownerId: string,
  turn: number,
): string {
  const existing: Record<string, boolean> = {};
  for (const trap of match.traps ?? []) {
    existing[trap.id] = true;
  }
  let index = (match.traps ?? []).length;
  let id = `trap_${turn}_${ownerId}_${index}`;
  while (existing[id] === true) {
    index += 1;
    id = `trap_${turn}_${ownerId}_${index}`;
  }
  return id;
}

export class PlaceTrapAction extends BaseAction {
  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord,
    logger?: nkruntime.Logger,
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];

    for (const participant of roster) {
      const origin = participant.character.position;
      const originTile = origin?.coord
        ? findTileAtCoord(match, origin.coord)
        : undefined;
      const destination = resolvePlanDestination(match, participant.plan);
      const destinationTile = destination
        ? findTileAtCoord(match, destination.coord)
        : undefined;
      const invalidReason =
        !origin?.coord
          ? "missing_origin"
          : !originTile
            ? "missing_origin_tile"
            : !destination
              ? "missing_destination"
              : !destinationTile
                ? "missing_destination_tile"
                : originTile.walkable === false
                  ? "origin_not_walkable"
                  : originTile.meta?.destroyed === true
                    ? "origin_destroyed"
                    : destinationTile.walkable === false
                      ? "destination_not_walkable"
                      : destinationTile.meta?.destroyed === true
                        ? "destination_destroyed"
                        : axialDistance(origin.coord, destination.coord) !== 1
                          ? "destination_not_adjacent"
                          : undefined;
      if (invalidReason) {
        logger?.debug(
          "place_trap rejected match=%s player=%s turn=%d reason=%s origin=%s target=%s",
          match.match_id,
          participant.playerId,
          match.current_turn ?? 0,
          invalidReason,
          JSON.stringify(origin?.coord ?? null),
          JSON.stringify(destination?.coord ?? null),
        );
        this.clearPlan(participant);
        continue;
      }
      const validOrigin = origin!;
      const validOriginTile = originTile!;
      const validDestination = destination!;
      const validDestinationTile = destinationTile!;

      const trapCount = (participant.character.inventory?.carriedItems ?? [])
        .filter((item) => item.itemId === "trap")
        .reduce(
          (total, item) =>
            total + (typeof item.quantity === "number" ? item.quantity : 0),
          0,
        );
      const requestedExtraExecutions = getRequestedExtraExecutions(
        participant.plan,
      );
      const affordableExtraExecutions = Math.min(
        requestedExtraExecutions,
        Math.max(0, trapCount - 1),
      );
      const extraExecutions = getUsableExtraExecutions(
        participant.character,
        {
          ...participant.plan,
          extraExecutions: affordableExtraExecutions,
        },
        ActionLibrary.place_trap,
      );
      const placements = 1 + extraExecutions;
      match.traps = match.traps ?? [];
      logger?.debug(
        "place_trap attempt match=%s player=%s turn=%d inventory=%d placements=%d traps_before=%d origin=%s target=%s",
        match.match_id,
        participant.playerId,
        match.current_turn ?? 0,
        trapCount,
        placements,
        match.traps.length,
        JSON.stringify(validOrigin.coord),
        JSON.stringify(validDestination.coord),
      );

      for (let index = 0; index < placements; index += 1) {
        if (!consumeCarriedItem(participant.character, "trap")) {
          logger?.debug(
            "place_trap item consumption failed match=%s player=%s index=%d",
            match.match_id,
            participant.playerId,
            index,
          );
          break;
        }
        const trap: TrapRecord = {
          id: createTrapId(
            match,
            participant.playerId,
            (match.current_turn ?? 0) + 1,
          ),
          ownerId: participant.playerId,
          from: {
            tileId: validOriginTile.id,
            coord: { ...validOrigin.coord },
          },
          to: {
            tileId: validDestinationTile.id,
            coord: { ...validDestinationTile.coord },
          },
          damage: TRAP_DAMAGE,
          placedTurn: (match.current_turn ?? 0) + 1,
        };
        match.traps.push(trap);
        logger?.debug(
          "place_trap added match=%s trap=%s owner=%s traps_after=%d",
          match.match_id,
          trap.id,
          participant.playerId,
          match.traps.length,
        );
        events.push({
          kind: "player",
          actorId: participant.playerId,
          action: {
            actionId: ActionLibrary.place_trap.id as ActionId,
            originLocation: trap.from.coord,
            targetLocation: trap.to.coord,
            metadata: {
              trapId: trap.id,
              placed: true,
              damage: trap.damage,
            },
          },
        });
      }

      logger?.debug(
        "place_trap result match=%s player=%s events=%d traps_after=%d",
        match.match_id,
        participant.playerId,
        events.length,
        match.traps.length,
      );
      this.clearPlan(participant);
      match.playerCharacters![participant.playerId] = participant.character;
    }

    return events;
  }
}

const placeTrapAction = new PlaceTrapAction();

export function executePlaceTrapAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord,
  logger?: nkruntime.Logger,
): ReplayPlayerEvent[] {
  return placeTrapAction.execute(participants, match, logger);
}

function findMovementPath(
  match: MatchRecord,
  from: TransitionLocation,
  to: TransitionLocation,
): TransitionLocation[] {
  const tileByCoord: Record<string, HexTileSnapshot> = {};
  for (const tile of match.map?.tiles ?? []) {
    tileByCoord[`${tile.coord.q}:${tile.coord.r}`] = tile;
  }
  const startKey = `${from.coord.q}:${from.coord.r}`;
  const targetKey = `${to.coord.q}:${to.coord.r}`;
  const queue: Axial[] = [{ ...from.coord }];
  const visited: Record<string, boolean> = { [startKey]: true };
  const parent: Record<string, string | undefined> = {};
  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;
    const currentKey = `${current.q}:${current.r}`;
    if (currentKey === targetKey) {
      break;
    }
    for (const candidate of neighbors(current)) {
      const candidateKey = `${candidate.q}:${candidate.r}`;
      if (visited[candidateKey] === true) {
        continue;
      }
      const tile = tileByCoord[candidateKey];
      if (
        !tile ||
        tile.walkable === false ||
        tile.meta?.destroyed === true
      ) {
        continue;
      }
      visited[candidateKey] = true;
      parent[candidateKey] = currentKey;
      queue.push(candidate);
    }
  }
  if (visited[targetKey] !== true) {
    return [to];
  }

  const coordinates: Axial[] = [];
  let currentKey: string | undefined = targetKey;
  while (currentKey && currentKey !== startKey) {
    const separator = currentKey.indexOf(":");
    coordinates.unshift({
      q: Number(currentKey.slice(0, separator)),
      r: Number(currentKey.slice(separator + 1)),
    });
    currentKey = parent[currentKey];
  }
  const path: TransitionLocation[] = [];
  for (const coord of coordinates) {
    const tile = tileByCoord[`${coord.q}:${coord.r}`];
    path.push({
      tileId: tile?.id ?? `hex_${coord.q}_${coord.r}`,
      coord,
    });
  }
  if (path.length === 0 || path[path.length - 1].tileId !== to.tileId) {
    path.push(to);
  }
  return path;
}

export function triggerTrapsForTransition(
  match: MatchRecord,
  playerId: string,
  from: TransitionLocation,
  to: TransitionLocation,
  logger?: nkruntime.Logger,
): ReplayPlayerEvent[] {
  if (axialDistance(from.coord, to.coord) !== 1) {
    return [];
  }
  const existingTraps = match.traps ?? [];
  const matchingTraps = existingTraps.filter((trap) =>
    sameEdge(trap, from, to),
  );
  if (existingTraps.length > 0) {
    logger?.debug(
      "trap transition check match=%s player=%s from=%s to=%s traps=%d matching=%d",
      match.match_id,
      playerId,
      JSON.stringify(from.coord),
      JSON.stringify(to.coord),
      existingTraps.length,
      matchingTraps.length,
    );
  }
  if (matchingTraps.length === 0) {
    return [];
  }

  const matchingIds: Record<string, boolean> = {};
  for (const trap of matchingTraps) {
    matchingIds[trap.id] = true;
  }
  const remainingTraps: TrapRecord[] = [];
  for (const trap of match.traps ?? []) {
    if (matchingIds[trap.id] !== true) {
      remainingTraps.push(trap);
    }
  }
  match.traps = remainingTraps;
  logger?.debug(
    "trap triggered match=%s player=%s ids=%s traps_remaining=%d",
    match.match_id,
    playerId,
    JSON.stringify(matchingTraps.map((trap) => trap.id)),
    match.traps.length,
  );
  let character = match.playerCharacters?.[playerId];
  if (!character || isCharacterDead(character)) {
    logger?.debug(
      "trap trigger had no living character match=%s player=%s",
      match.match_id,
      playerId,
    );
    return [];
  }

  const events: ReplayPlayerEvent[] = [];
  for (const trap of matchingTraps) {
    if (isCharacterDead(character)) {
      break;
    }
    const damage = Math.max(
      0,
      trap.damage - getInventoryDamageReduction(character, "physical"),
    );
    const outcome = applyHealthDelta(
      character,
      -damage,
      false,
      logger,
    );
    character.stats = outcome.character.stats;
    character.progression = outcome.character.progression;
    character.economy = outcome.character.economy;
    character.inventory = outcome.character.inventory;
    character.abilities = outcome.character.abilities;
    character.relationships = outcome.character.relationships;
    character.statuses = outcome.character.statuses;
    character.actionPlan = outcome.character.actionPlan;
    character.corpseRations = outcome.character.corpseRations;
    match.playerCharacters![playerId] = character;
    const damageTaken = Math.max(0, -outcome.result.delta);
    events.push({
      kind: "player",
      actorId: trap.ownerId,
      action: {
        actionId: ActionLibrary.place_trap.id,
        originLocation: from.coord,
        targetLocation: to.coord,
        damageDealt: damageTaken,
        metadata: {
          trapId: trap.id,
          triggered: true,
          damage: damageTaken,
        },
      },
      targets: [
        {
          targetId: playerId,
          damageTaken,
          eliminated: outcome.result.becameDead,
          metadata: {
            trapId: trap.id,
          },
        },
      ],
    });
  }
  return events;
}

export function triggerTrapsForMovement(
  match: MatchRecord,
  playerId: string,
  from: TransitionLocation,
  to: TransitionLocation,
  logger?: nkruntime.Logger,
): ReplayPlayerEvent[] {
  const path = findMovementPath(match, from, to);
  const events: ReplayPlayerEvent[] = [];
  let previous = from;
  for (const next of path) {
    events.push(
      ...triggerTrapsForTransition(match, playerId, previous, next, logger),
    );
    previous = next;
  }
  return events;
}