export interface MatchLabelDetails {
  gameId?: string;
  name?: string;
  size: number;
  players: number;
  started: boolean;
  creator?: string;
}

export function buildMatchLabel(details: MatchLabelDetails): string {
  return JSON.stringify({
    mode: "async",
    game_id: details.gameId ?? null,
    name: details.name ?? null,
    size: details.size,
    players: details.players,
    started: details.started,
    creator: details.creator ?? null,
  });
}
