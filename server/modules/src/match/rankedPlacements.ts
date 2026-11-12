import {
  RANKED_MATCH_METADATA_KEY,
  type RankedMatchMetadata,
  type RankedTeamPlacement
} from "@shared";
import type { MatchRecord } from "../models/types";
import { isCharacterDead } from "../utils/playerCharacter";
import { isPlayerForfeited } from "../utils/activityClock";

function effectiveTeamId(character: MatchRecord["playerCharacters"][string], playerId: string): string {
  return (
    character.secretTeamId?.trim() ||
    character.teamId?.trim() ||
    `solo_${playerId}`
  );
}

function getTeams(match: MatchRecord): Map<string, string[]> {
  const teams = new Map<string, string[]>();
  for (const playerId of Object.keys(match.playerCharacters ?? {})) {
    const character = match.playerCharacters[playerId];
    if (!character) continue;
    const teamId = effectiveTeamId(character, playerId);
    const members = teams.get(teamId) ?? [];
    members.push(playerId);
    teams.set(teamId, members);
  }
  return teams;
}

function updateRankedPlacements(
  match: MatchRecord,
  placements: RankedTeamPlacement[]
): void {
  const ranked = match.metadata?.[RANKED_MATCH_METADATA_KEY];
  if (!ranked) return;
  match.metadata = {
    ...match.metadata,
    [RANKED_MATCH_METADATA_KEY]: { ...ranked, placements }
  };
}

export function recordRankedTeamEliminations(
  match: MatchRecord,
  resolvedTurn: number
): void {
  const ranked = match.metadata?.[RANKED_MATCH_METADATA_KEY];
  if (!ranked) return;
  const teams = getTeams(match);
  if (teams.size === 0) return;

  const placements = [...(ranked.placements ?? [])];
  const knownTeams = new Set(placements.map((placement) => placement.teamId));
  const newlyEliminated: string[] = [];
  for (const [teamId, memberIds] of teams) {
    if (knownTeams.has(teamId)) continue;
    const hasLivingMember = memberIds.some(
      (playerId) => !isCharacterDead(match.playerCharacters[playerId])
    );
    if (!hasLivingMember) newlyEliminated.push(teamId);
  }
  if (newlyEliminated.length === 0) return;

  const previouslyEliminatedCount = placements.filter(
    (placement) => placement.eliminated
  ).length;
  const place = Math.max(
    1,
    teams.size - previouslyEliminatedCount - newlyEliminated.length + 1
  );
  for (const teamId of newlyEliminated) {
    placements.push({
      teamId,
      place,
      eliminated: true,
      eliminationTurn: resolvedTurn
    });
  }
  updateRankedPlacements(match, placements);
}

export function finalizeRankedTeamPlacements(
  match: MatchRecord,
  resolvedTurn: number
): void {
  if (!match.metadata?.[RANKED_MATCH_METADATA_KEY]) return;
  recordRankedTeamEliminations(match, resolvedTurn);

  const ranked = match.metadata[RANKED_MATCH_METADATA_KEY];
  const placements = [...(ranked.placements ?? [])];
  const knownTeams = new Set(placements.map((placement) => placement.teamId));
  const teams = getTeams(match);
  const survivingTeams = Array.from(teams.entries()).filter(([, memberIds]) =>
    memberIds.some((playerId) => !isCharacterDead(match.playerCharacters[playerId]))
  );

  if (survivingTeams.length === 1) {
    const [winningTeamId] = survivingTeams[0];
    if (!knownTeams.has(winningTeamId)) {
      placements.push({
        teamId: winningTeamId,
        place: 1,
        eliminated: false
      });
    }
  } else {
    for (const teamId of teams.keys()) {
      if (knownTeams.has(teamId)) continue;
      placements.push({
        teamId,
        place: 1,
        eliminated: true,
        eliminationTurn: resolvedTurn
      });
    }
  }
  updateRankedPlacements(match, placements);
}

export function recordRankedTeamForfeit(
  match: MatchRecord,
  forfeitedPlayerId: string,
  resolvedTurn: number
): void {
  const ranked = match.metadata?.[RANKED_MATCH_METADATA_KEY];
  if (!ranked) return;
  const teams = getTeams(match);
  if (teams.size === 0) return;

  const character = match.playerCharacters?.[forfeitedPlayerId];
  if (!character) return;
  const teamId = effectiveTeamId(character, forfeitedPlayerId);

  const placements = [...(ranked.placements ?? [])];
  const knownTeams = new Set(placements.map((placement) => placement.teamId));
  if (knownTeams.has(teamId)) return;

  const memberIds = teams.get(teamId) ?? [forfeitedPlayerId];
  const allDeadOrForfeited = memberIds.every((memberId) => {
    const char = match.playerCharacters?.[memberId];
    return isCharacterDead(char) || isPlayerForfeited(match, memberId);
  });
  if (!allDeadOrForfeited) return;

  const previouslyEliminatedCount = placements.filter(
    (placement) => placement.eliminated
  ).length;
  const place = Math.max(1, teams.size - previouslyEliminatedCount);
  placements.push({
    teamId,
    place,
    eliminated: true,
    eliminationTurn: resolvedTurn
  });
  updateRankedPlacements(match, placements);
}

export function finalizeRankedPlacementsForSoleHumanWinner(
  match: MatchRecord,
  winnerPlayerId: string,
  resolvedTurn: number
): void {
  const ranked = match.metadata?.[RANKED_MATCH_METADATA_KEY];
  if (!ranked) return;
  const teams = getTeams(match);
  if (teams.size === 0) return;

  const winnerChar = match.playerCharacters?.[winnerPlayerId];
  const winnerTeamId = winnerChar
    ? effectiveTeamId(winnerChar, winnerPlayerId)
    : `solo_${winnerPlayerId}`;

  const currentPlacements = [...(ranked.placements ?? [])];
  const knownTeams = new Set(currentPlacements.map((p) => p.teamId));

  const unplacedTeamIds: string[] = [];
  for (const teamId of teams.keys()) {
    if (teamId !== winnerTeamId && !knownTeams.has(teamId)) {
      unplacedTeamIds.push(teamId);
    }
  }
  unplacedTeamIds.sort();

  const unplacedPlacements: RankedTeamPlacement[] = [];
  let nextPlace = 2;
  for (const teamId of unplacedTeamIds) {
    unplacedPlacements.push({
      teamId,
      place: nextPlace++,
      eliminated: true,
      eliminationTurn: resolvedTurn
    });
  }

  const previouslyEliminated = currentPlacements
    .filter((p) => p.teamId !== winnerTeamId && p.eliminated)
    .sort((a, b) => a.place - b.place || (a.eliminationTurn ?? 0) - (b.eliminationTurn ?? 0));

  const reorderedEliminated: RankedTeamPlacement[] = [];
  for (const placement of previouslyEliminated) {
    reorderedEliminated.push({
      ...placement,
      place: nextPlace++
    });
  }

  const finalPlacements: RankedTeamPlacement[] = [
    {
      teamId: winnerTeamId,
      place: 1,
      eliminated: false
    },
    ...unplacedPlacements,
    ...reorderedEliminated
  ];

  updateRankedPlacements(match, finalPlacements);
}
