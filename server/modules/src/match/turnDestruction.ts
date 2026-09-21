/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import type { HexTileSnapshot, ReplayEvent } from "@shared";
import type { MatchRecord } from "../models/types";
import { applyHealthDelta } from "./actions/utils";
import { isCharacterDead } from "../utils/playerCharacter";

export function applyScheduledDestruction(
  match: MatchRecord,
  resolvedTurn: number,
  logger: nkruntime.Logger,
): ReplayEvent[] {
  const replayEvents: ReplayEvent[] = [];

  if (match.map?.tiles) {
    for (const tile of match.map.tiles) {
      if (tile.meta?.destructionTurn !== resolvedTurn) {
        continue;
      }
      const rocketExplosionVisible =
        tile.meta.rocketLauncherExplosionVisible === true;
      tile.meta.destroyed = true;
      tile.walkable = false;
      delete tile.meta.rocketLauncherExplosionVisible;
      replayEvents.push({
        kind: "map",
        cell: tile.coord,
        action: "destroyed",
        ...(rocketExplosionVisible
          ? { visibility: { scope: "all" as const } }
          : {}),
      });
    }
  }

  const characters = match.playerCharacters;
  if (!characters) {
    return replayEvents;
  }
  for (const playerId in characters) {
    if (!Object.prototype.hasOwnProperty.call(characters, playerId)) {
      continue;
    }
    const character = characters[playerId];
    if (!character || isCharacterDead(character)) {
      continue;
    }
    const coord = character.position?.coord;
    if (!coord) {
      continue;
    }
    let standingTile: HexTileSnapshot | undefined;
    for (const tile of match.map?.tiles ?? []) {
      if (tile.coord.q === coord.q && tile.coord.r === coord.r) {
        standingTile = tile;
        break;
      }
    }
    if (
      !standingTile ||
      (standingTile.meta?.destroyed !== true &&
        !(
          typeof standingTile.meta?.destructionTurn === "number" &&
          standingTile.meta.destructionTurn <= resolvedTurn
        ))
    ) {
      continue;
    }

    const outcome = applyHealthDelta(character, -999, true, logger, true);
    match.playerCharacters[playerId] = outcome.character;
    const deadTeamId = character.secretTeamId || character.teamId;
    replayEvents.push({
      kind: "player",
      actorId: character.id,
      action: {
        actionId: "status_dead",
        metadata: {
          teamId: deadTeamId,
        },
      },
      targets: [
        {
          targetId: character.id,
          eliminated: true,
          metadata: {
            teamId: deadTeamId,
          },
        },
      ],
    });
  }

  return replayEvents;
}
