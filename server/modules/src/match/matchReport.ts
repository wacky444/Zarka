/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import type {
  MatchReport,
  MatchReportPlayer,
  MatchReportProgress,
  MatchReportTeam,
  PlayerCharacter,
  ReplayEvent,
  Skin,
} from "@shared";
import { DEFAULT_SKIN } from "@shared";
import type { MatchRecord } from "../models/types";
import { StorageService } from "../services/storageService";
import { isCharacterDead } from "../utils/playerCharacter";

interface Aggregate extends MatchReportPlayer {
  effectiveTeamId: string;
  consumables_used: number;
  health_restored: number;
  movement_actions: number;
}

type AggregateLookup = Record<string, Aggregate>;

type UserLookup = Record<string, nkruntime.User>;

function asNonNegativeNumber(value: unknown): number {
  return typeof value === "number" && isFinite(value) && value > 0
    ? value
    : 0;
}

function carriedWeight(character: PlayerCharacter): number {
  const items = character.inventory?.carriedItems;
  if (!Array.isArray(items)) {
    return 0;
  }
  let total = 0;
  for (const item of items) {
    total +=
      asNonNegativeNumber(item.quantity) * asNonNegativeNumber(item.weight);
  }
  return total;
}

function effectiveTeamId(character: PlayerCharacter, playerId: string): string {
  return character.secretTeamId || character.teamId || `solo_${playerId}`;
}

function readSkin(user: nkruntime.User | undefined): Skin | undefined {
  const metadata = (user as unknown as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }
  const zarka = (metadata as Record<string, unknown>).zarka;
  if (!zarka || typeof zarka !== "object" || Array.isArray(zarka)) {
    return undefined;
  }
  const cosmetics = (zarka as Record<string, unknown>).cosmetics;
  if (!cosmetics || typeof cosmetics !== "object" || Array.isArray(cosmetics)) {
    return undefined;
  }
  const selected = (cosmetics as Record<string, unknown>).selectedSkinId;
  if (!selected || typeof selected !== "object" || Array.isArray(selected)) {
    return undefined;
  }
  const raw = selected as Record<string, unknown>;
  return {
    body: typeof raw.body === "string" ? raw.body : DEFAULT_SKIN.body,
    shoes: typeof raw.shoes === "string" ? raw.shoes : DEFAULT_SKIN.shoes,
    shirt: typeof raw.shirt === "string" ? raw.shirt : DEFAULT_SKIN.shirt,
    hair: typeof raw.hair === "string" ? raw.hair : DEFAULT_SKIN.hair,
    hat: typeof raw.hat === "string" ? raw.hat : DEFAULT_SKIN.hat,
  };
}

function getUserId(user: nkruntime.User): string | undefined {
  return (
    (user as unknown as { id?: string; userId?: string }).id ??
    (user as unknown as { id?: string; userId?: string }).userId
  );
}

function getUserName(user: nkruntime.User | undefined, fallback: string): string {
  const typed = user as unknown as {
    displayName?: string;
    display_name?: string;
    username?: string;
  } | undefined;
  return (
    typed?.displayName?.trim() ||
    typed?.display_name?.trim() ||
    typed?.username?.trim() ||
    fallback
  );
}

function uniqueHighest(
  players: Aggregate[],
  getValue: (player: Aggregate) => number,
  eligible: (player: Aggregate) => boolean,
): Aggregate | null {
  const candidates = players.filter(eligible);
  if (candidates.length === 0) {
    return null;
  }
  const highest = Math.max(...candidates.map(getValue));
  const winners = candidates.filter((player) => getValue(player) === highest);
  return winners.length === 1 ? winners[0] : null;
}

function collectEvents(
  replayEvents: ReplayEvent[],
  aggregates: AggregateLookup,
): void {
  for (const event of replayEvents) {
    if (
      !event ||
      event.kind !== "player" ||
      !event.action ||
      typeof event.actorId !== "string"
    ) {
      continue;
    }
    const actor = aggregates[event.actorId];
    const actionId = event.action.actionId as string;
    const isNonActionEvent =
      actionId === "zarkan_income" ||
      actionId === "buy_detective" ||
      actionId === "detective_reward" ||
      actionId === "buy_security_camera_app" ||
      actionId === "buy_spy_drone" ||
      actionId === "buy_pyromaniac" ||
      actionId === "fire_damage";
    if (actor && !isNonActionEvent) {
      actor.actions_used += 1;
      actor.damage_dealt += asNonNegativeNumber(event.action.damageDealt);
      if (event.action.actionId === "pick_up") {
        const metadata = event.action.metadata;
        const pickedCount =
          metadata && typeof metadata.pickedCount === "number"
            ? metadata.pickedCount
            : 0;
        actor.items_collected += Math.max(0, pickedCount);
      }
      if (
        event.action.actionId === "feed" ||
        event.action.actionId === "breakfast"
      ) {
        actor.consumables_used += 1;
      }
      if (event.action.actionId === "move") {
        actor.movement_actions += 1;
      }
    }
    for (const target of event.targets ?? []) {
      if (!target || typeof target.targetId !== "string") {
        continue;
      }
      const targetAggregate = aggregates[target.targetId];
      if (targetAggregate) {
        targetAggregate.damage_received += asNonNegativeNumber(
          target.damageTaken,
        );
        const healed = target.metadata?.healed;
        if (typeof healed === "number" && healed > 0 && actor) {
          actor.health_restored += healed;
        }
      }
      if (
        target.eliminated === true &&
        target.targetId !== event.actorId &&
        actor
      ) {
        actor.players_killed += 1;
      }
    }
  }
}

function addAchievement(
  achievements: MatchReport["achievements"],
  id: string,
  player: Aggregate | null,
  value?: number,
): void {
  if (!player) {
    return;
  }
  achievements.push({
    id,
    player_id: player.player_id,
    team_id: player.effectiveTeamId,
    ...(typeof value === "number" ? { value } : {}),
  });
}

function playerArray(aggregates: AggregateLookup): Aggregate[] {
  const result: Aggregate[] = [];
  for (const playerId of Object.keys(aggregates)) {
    result.push(aggregates[playerId]);
  }
  return result;
}

function uniqueValue(
  players: Aggregate[],
  getValue: (player: Aggregate) => number,
): number | undefined {
  if (players.length === 0) {
    return undefined;
  }
  const highest = Math.max(...players.map(getValue));
  return players.filter((player) => getValue(player) === highest).length === 1
    ? highest
    : undefined;
}

export function recordMatchReportProgress(match: MatchRecord): void {
  const progress: MatchReportProgress = match.reportProgress ?? {};
  for (const playerId of Object.keys(match.playerCharacters ?? {})) {
    const character = match.playerCharacters[playerId];
    if (!character || isCharacterDead(character)) {
      continue;
    }
    const existing = progress[playerId] ?? {
      aliveTurns: 0,
      carriedWeightTotal: 0,
    };
    existing.aliveTurns += 1;
    existing.carriedWeightTotal += carriedWeight(character);
    progress[playerId] = existing;
  }
  match.reportProgress = progress;
}

export function buildMatchReport(
  match: MatchRecord,
  storage: StorageService,
  endedAt: number,
  reason: MatchReport["reason"],
  resolvedTurn: number,
  currentTurnEvents: ReplayEvent[],
  users: nkruntime.User[] = [],
): MatchReport {
  const userMap: UserLookup = {};
  for (const user of users) {
    const userId = getUserId(user);
    if (userId) {
      userMap[userId] = user;
    }
  }

  const progress = match.reportProgress ?? {};
  const aggregates: AggregateLookup = {};
  for (const playerId of Object.keys(match.playerCharacters ?? {})) {
    const character = match.playerCharacters[playerId];
    if (!character) {
      continue;
    }
    const tracked = progress[playerId] ?? {
      aliveTurns: 0,
      carriedWeightTotal: 0,
    };
    const user = userMap[playerId];
    aggregates[playerId] = {
      player_id: playerId,
      player_name: getUserName(user, playerId),
      character_id: character.id,
      character_name: character.name,
      team_id: effectiveTeamId(character, playerId),
      skin: readSkin(user),
      alive: !isCharacterDead(character),
      damage_dealt: 0,
      damage_received: 0,
      players_killed: 0,
      actions_used: 0,
      items_collected: 0,
      items_carried: (character.inventory?.carriedItems ?? []).reduce(
        (total, item) => total + asNonNegativeNumber(item.quantity),
        0,
      ),
      average_weight_carried:
        tracked.aliveTurns > 0
          ? tracked.carriedWeightTotal / tracked.aliveTurns
          : 0,
      effectiveTeamId: effectiveTeamId(character, playerId),
      consumables_used: 0,
      health_restored: 0,
      movement_actions: 0,
    };
  }

  const replays = storage.listReplaysForMatch(match.match_id);
  for (const replay of replays) {
    collectEvents(replay.replay.events, aggregates);
  }
  collectEvents(currentTurnEvents, aggregates);

  const aggregatePlayers = playerArray(aggregates);
  const players: MatchReportPlayer[] = aggregatePlayers.map((player) => ({
    player_id: player.player_id,
    player_name: player.player_name,
    character_id: player.character_id,
    character_name: player.character_name,
    team_id: player.team_id,
    ...(player.skin ? { skin: player.skin } : {}),
    alive: player.alive,
    damage_dealt: player.damage_dealt,
    damage_received: player.damage_received,
    players_killed: player.players_killed,
    actions_used: player.actions_used,
    items_collected: player.items_collected,
    items_carried: player.items_carried,
    average_weight_carried: player.average_weight_carried,
  }));

  const alivePlayers = aggregatePlayers.filter((player) => player.alive);
  const winningTeamId =
    reason === "last_alive" && alivePlayers.length > 0
      ? alivePlayers[0].effectiveTeamId
      : undefined;
  const winningCharacterIds = winningTeamId
    ? alivePlayers
        .filter((player) => player.effectiveTeamId === winningTeamId)
        .map((player) => player.character_id)
    : [];

  const teamLookup: Record<string, MatchReportTeam> = {};
  for (const player of aggregatePlayers) {
    const team =
      teamLookup[player.effectiveTeamId] ??
      {
        team_id: player.effectiveTeamId,
        rank: 0,
        won: false,
        player_ids: [],
        total_damage_dealt: 0,
        total_damage_received: 0,
        kills: 0,
      };
    team.player_ids.push(player.player_id);
    team.total_damage_dealt += player.damage_dealt;
    team.total_damage_received += player.damage_received;
    team.kills += player.players_killed;
    team.won = player.effectiveTeamId === winningTeamId;
    teamLookup[player.effectiveTeamId] = team;
  }
  const teams: MatchReportTeam[] = [];
  for (const teamId of Object.keys(teamLookup)) {
    teams.push(teamLookup[teamId]);
  }
  teams.sort((a, b) => {
    if (a.won !== b.won) {
      return a.won ? -1 : 1;
    }
    if (b.kills !== a.kills) {
      return b.kills - a.kills;
    }
    return b.total_damage_dealt - a.total_damage_dealt;
  });
  for (let index = 0; index < teams.length; index += 1) {
    teams[index].rank = index + 1;
  }

  const achievements: MatchReport["achievements"] = [];
  addAchievement(
    achievements,
    "mvp",
    uniqueHighest(
      aggregatePlayers,
      (player) => player.damage_dealt,
      (player) => player.damage_dealt > 0,
    ),
    uniqueValue(aggregatePlayers, (player) => player.damage_dealt),
  );
  addAchievement(
    achievements,
    "executioner",
    uniqueHighest(
      aggregatePlayers,
      (player) => player.players_killed,
      (player) => player.players_killed > 0,
    ),
    uniqueValue(aggregatePlayers, (player) => player.players_killed),
  );
  addAchievement(
    achievements,
    "tank",
    uniqueHighest(
      aggregatePlayers,
      (player) => player.damage_received,
      (player) => player.damage_received > 0,
    ),
    uniqueValue(aggregatePlayers, (player) => player.damage_received),
  );
  addAchievement(
    achievements,
    "pacifist",
    uniqueHighest(
      aggregatePlayers,
      () => 0,
      (player) => player.alive && player.damage_dealt === 0,
    ),
  );
  addAchievement(
    achievements,
    "hoarder",
    uniqueHighest(
      aggregatePlayers,
      (player) => player.average_weight_carried,
      (player) => player.average_weight_carried > 0,
    ),
    uniqueValue(aggregatePlayers, (player) => player.average_weight_carried),
  );
  addAchievement(
    achievements,
    "scavenger",
    uniqueHighest(
      aggregatePlayers,
      (player) => player.items_collected,
      (player) => player.items_collected > 0,
    ),
    uniqueValue(aggregatePlayers, (player) => player.items_collected),
  );
  addAchievement(
    achievements,
    "glutton",
    uniqueHighest(
      aggregatePlayers,
      (player) => player.consumables_used,
      (player) => player.consumables_used > 0,
    ),
    uniqueValue(aggregatePlayers, (player) => player.consumables_used),
  );
  addAchievement(
    achievements,
    "medic",
    uniqueHighest(
      aggregatePlayers,
      (player) => player.health_restored,
      (player) => player.health_restored > 0,
    ),
    uniqueValue(aggregatePlayers, (player) => player.health_restored),
  );
  addAchievement(
    achievements,
    "runner",
    uniqueHighest(
      aggregatePlayers,
      (player) => player.movement_actions,
      (player) => player.movement_actions > 0,
    ),
    uniqueValue(aggregatePlayers, (player) => player.movement_actions),
  );

  return {
    match_id: match.match_id,
    ...(match.name ? { name: match.name } : {}),
    created_at: match.created_at,
    ended_at: endedAt,
    turns: resolvedTurn,
    reason,
    ...(winningTeamId ? { winning_team_id: winningTeamId } : {}),
    winning_character_ids: winningCharacterIds,
    teams,
    players,
    achievements,
  };
}

