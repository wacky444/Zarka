/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  ReplayImportance,
  TUTORIAL_MATCH_METADATA_KEY,
  type PlayerCharacter,
  type ReplayEvent,
  type ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../models/types";
import { isCharacterDead } from "../utils/playerCharacter";

export const ENAMORADOS_TEAM_ID = "Enamorados";

export function resolveLoversFormation(
  match: MatchRecord,
  resolvedTurn: number,
  logger?: nkruntime.Logger
): ReplayEvent[] {
  if (
    match.loversMode === false ||
    Boolean(match.metadata?.[TUTORIAL_MATCH_METADATA_KEY])
  ) {
    return [];
  }

  if (resolvedTurn < 4 || resolvedTurn > 20) {
    return [];
  }

  if (
    Array.isArray(match.loverPlayerIds) &&
    match.loverPlayerIds.length === 2
  ) {
    return [];
  }

  if (
    typeof match.loversTriggerTurn !== "number" ||
    resolvedTurn < match.loversTriggerTurn
  ) {
    return [];
  }

  const characters = match.playerCharacters;
  if (!characters) {
    return [];
  }

  const charactersByCoord: Record<string, PlayerCharacter[]> = {};
  for (const playerId in characters) {
    if (!Object.prototype.hasOwnProperty.call(characters, playerId)) {
      continue;
    }
    const char = characters[playerId];
    if (!char || isCharacterDead(char)) {
      continue;
    }
    const coord = char.position?.coord;
    if (
      !coord ||
      typeof coord.q !== "number" ||
      typeof coord.r !== "number" ||
      isNaN(coord.q) ||
      isNaN(coord.r)
    ) {
      continue;
    }
    const key = `${coord.q},${coord.r}`;
    if (!charactersByCoord[key]) {
      charactersByCoord[key] = [];
    }
    charactersByCoord[key].push(char);
  }

  const isExcludedSecretTeam = (char: PlayerCharacter): boolean => {
    const secret = char.secretTeamId?.trim();
    return secret === "Gemelos" || secret === ENAMORADOS_TEAM_ID;
  };

  const eligiblePairs: Array<[PlayerCharacter, PlayerCharacter]> = [];
  for (const key in charactersByCoord) {
    const group = charactersByCoord[key];
    if (!group || group.length < 2) {
      continue;
    }
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const charA = group[i];
        const charB = group[j];
        if (isExcludedSecretTeam(charA) || isExcludedSecretTeam(charB)) {
          continue;
        }
        const teamA = charA.teamId?.trim();
        const teamB = charB.teamId?.trim();
        if (!teamA || !teamB) {
          continue;
        }
        const effectiveA = charA.secretTeamId?.trim() || teamA;
        const effectiveB = charB.secretTeamId?.trim() || teamB;
        if (effectiveA === effectiveB) {
          continue;
        }
        eligiblePairs.push([charA, charB]);
      }
    }
  }

  if (eligiblePairs.length === 0) {
    return [];
  }

  const selectedIndex = Math.floor(Math.random() * eligiblePairs.length);
  const [charA, charB] = eligiblePairs[selectedIndex];

  charA.secretTeamId = ENAMORADOS_TEAM_ID;
  charB.secretTeamId = ENAMORADOS_TEAM_ID;

  if (!charA.relationships) {
    charA.relationships = {
      confirmedTeammates: [],
      alliances: [],
      representatives: [],
    };
  } else if (!Array.isArray(charA.relationships.confirmedTeammates)) {
    charA.relationships.confirmedTeammates = [];
  }
  if (!charA.relationships.confirmedTeammates.includes(charB.id)) {
    charA.relationships.confirmedTeammates.push(charB.id);
  }

  if (!charB.relationships) {
    charB.relationships = {
      confirmedTeammates: [],
      alliances: [],
      representatives: [],
    };
  } else if (!Array.isArray(charB.relationships.confirmedTeammates)) {
    charB.relationships.confirmedTeammates = [];
  }
  if (!charB.relationships.confirmedTeammates.includes(charA.id)) {
    charB.relationships.confirmedTeammates.push(charA.id);
  }

  charA.revealedTeamIdsByPlayerId = {
    ...(charA.revealedTeamIdsByPlayerId ?? {}),
    [charB.id]: ENAMORADOS_TEAM_ID,
  };
  charB.revealedTeamIdsByPlayerId = {
    ...(charB.revealedTeamIdsByPlayerId ?? {}),
    [charA.id]: ENAMORADOS_TEAM_ID,
  };

  characters[charA.id] = charA;
  characters[charB.id] = charB;

  match.loverPlayerIds = [charA.id, charB.id];
  match.loversFormedTurn = resolvedTurn;

  if (!Array.isArray(match.teams)) {
    match.teams = [ENAMORADOS_TEAM_ID];
  } else if (!match.teams.includes(ENAMORADOS_TEAM_ID)) {
    match.teams.push(ENAMORADOS_TEAM_ID);
  }

  logger?.info?.(
    "lovers_formed match=%s turn=%d loverA=%s loverB=%s",
    match.match_id,
    resolvedTurn,
    charA.id,
    charB.id
  );

  const privateEventA: ReplayPlayerEvent = {
    kind: "player",
    importance: ReplayImportance.Critical,
    actorId: charA.id,
    action: {
      actionId: "lovers_formed",
      metadata: {
        teamId: ENAMORADOS_TEAM_ID,
        coverTeamId: charA.teamId,
        partnerPlayerId: charB.id,
      },
    },
    visibility: {
      scope: "limited",
      playerIds: [charA.id],
    },
  };

  const privateEventB: ReplayPlayerEvent = {
    kind: "player",
    importance: ReplayImportance.Critical,
    actorId: charB.id,
    action: {
      actionId: "lovers_formed",
      metadata: {
        teamId: ENAMORADOS_TEAM_ID,
        coverTeamId: charB.teamId,
        partnerPlayerId: charA.id,
      },
    },
    visibility: {
      scope: "limited",
      playerIds: [charB.id],
    },
  };

  const publicAnnounceEvent: ReplayPlayerEvent = {
    kind: "player",
    importance: ReplayImportance.Critical,
    actorId: "",
    action: {
      actionId: "lovers_announced",
    },
    visibility: {
      scope: "all",
    },
  };

  return [privateEventA, privateEventB, publicAnnounceEvent];
}
