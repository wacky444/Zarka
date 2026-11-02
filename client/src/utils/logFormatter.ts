import {
  ItemLibrary,
  type PlayerCharacter,
  type ReplaySnapshot,
  type ReplayEvent
} from "@shared";

export interface CharacterSkillMultiplier {
  readonly code: string;
  readonly level: number;
  readonly multiplier?: number;
}

export interface HugoCharacterInput {
  readonly name: string;
  readonly team?: string;
  readonly skills?: readonly CharacterSkillMultiplier[];
  readonly abilities?: readonly string[];
  readonly speed?: number;
  readonly status?: readonly string[] | string;
  readonly statuses?: { conditions?: string[] };
  readonly coord?: { readonly q: number; readonly r: number };
  readonly position?: { coord: { q: number; r: number } };
  readonly skillPoints?: number;
  readonly progression?: {
    availableSkillPoints?: number;
    experience?: number;
    experienceForNextLevel?: number;
  };
  readonly xp?: { readonly current: number; readonly max: number };
  readonly zarkans?: number;
  readonly economy?: { zarkans?: number };
  readonly weight?: { readonly current: number; readonly max: number };
  readonly stats?: {
    speed?: number;
    health?: { current: number; max: number };
    energy?: { current: number; max: number };
    load?: { current: number; max: number };
    baseViewRange?: number;
  };
  readonly inventory?:
    | readonly {
        readonly id?: string;
        readonly itemId?: string;
        readonly count?: number;
        readonly quantity?: number;
      }[]
    | {
        carriedItems?: readonly {
          readonly itemId: string;
          readonly quantity: number;
        }[];
      };
  readonly hp?: { readonly current: number; readonly max: number };
  readonly energy?: { readonly current: number; readonly max: number };
  readonly turnActions?: readonly string[];
  readonly visibleEntities?: readonly string[];
  readonly recentTurnsHistory?: readonly {
    readonly turn: number;
    readonly actions: readonly string[];
  }[];
}

const CONDITION_SPANISH: Record<string, string> = {
  unconscious: "Inconsciente",
  injured: "Herido",
  hungry: "Hambriento",
  intoxicated: "Intoxicado",
  burned: "Quemado",
  infected: "Infectado",
  dead: "Muerto",
  protected: "Protegido"
};

function axialDist(
  a: { q: number; r: number },
  b: { q: number; r: number }
): number {
  return (
    (Math.abs(a.q - b.q) +
      Math.abs(a.q + a.r - (b.q + b.r)) +
      Math.abs(a.r - b.r)) /
    2
  );
}

export const formatAbilityMultipliers = (
  skills?: readonly CharacterSkillMultiplier[] | readonly string[]
): string => {
  if (!skills || skills.length === 0) {
    return "";
  }
  const first = skills[0];
  if (typeof first === "object" && first !== null && "code" in first) {
    return (skills as readonly CharacterSkillMultiplier[])
      .map((s) => {
        const mult = s.multiplier && s.multiplier > 1 ? `x${s.multiplier}` : "";
        return `${s.code}${s.level}${mult}`;
      })
      .join(" ");
  }

  const counts = new Map<string, number>();
  for (const item of skills as readonly string[]) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  const prefixes: Record<string, string> = {
    strength1: "F1",
    strength2: "F2",
    strength3: "F3",
    strength4: "F4",
    strength5: "F5",
    agility1: "A1",
    agility2: "A2",
    agility3: "A3",
    agility4: "A4"
  };
  const parts: string[] = [];
  for (const [key, prefix] of Object.entries(prefixes)) {
    const count = counts.get(key) ?? 0;
    if (count === 1) {
      parts.push(prefix);
    } else if (count > 1) {
      parts.push(`${prefix}x${count}`);
    }
  }
  return parts.join(" ");
};

type InventoryItemEntry = {
  readonly id?: string;
  readonly itemId?: string;
  readonly count?: number;
  readonly quantity?: number;
};

export const formatInventoryItems = (
  inventory?:
    | readonly InventoryItemEntry[]
    | {
        readonly carriedItems?: readonly {
          readonly itemId: string;
          readonly quantity: number;
        }[];
      }
): string => {
  if (!inventory) {
    return "";
  }
  const list: readonly InventoryItemEntry[] = Array.isArray(inventory)
    ? inventory
    : ("carriedItems" in inventory && Array.isArray(inventory.carriedItems)
      ? inventory.carriedItems
      : []);
  if (list.length === 0) {
    return "";
  }
  return list
    .map((item: InventoryItemEntry) => {
      const id = item.itemId ?? item.id ?? "";
      const rawCount = item.quantity ?? item.count ?? 1;
      const libItem = (ItemLibrary as Record<string, { name: string } | undefined>)[id];
      const name = (libItem?.name ?? id).toLowerCase();
      const count = rawCount > 1 ? `x${rawCount}` : "";
      return `${name}${count}`;
    })
    .join(", ");
};

export const formatStatusCondition = (
  status?: readonly string[] | string
): string => {
  if (Array.isArray(status)) {
    if (status.length === 0) {
      return "Bien";
    }
    return status.map((s) => CONDITION_SPANISH[s] ?? s).join(", ");
  }
  if (!status) {
    return "Bien";
  }
  const str = String(status);
  return CONDITION_SPANISH[str] ?? str;
};

export const formatHugoCharacterLog = (input: HugoCharacterInput): string => {
  const abilities = formatAbilityMultipliers(input.skills ?? input.abilities);
  const headerLine = abilities ? `${input.name} ${abilities}` : input.name;
  const statusStr = formatStatusCondition(
    input.status ?? input.statuses?.conditions ?? []
  );

  const itemsStr = formatInventoryItems(input.inventory);

  const rawTeam = input.team ?? "";
  const teamStr = rawTeam
    ? rawTeam.startsWith("Equipo")
      ? rawTeam
      : `Equipo${rawTeam}`
    : "Sin equipo";

  const speed = input.speed ?? input.stats?.speed ?? 0;
  const coord = input.coord ?? input.position?.coord ?? { q: 0, r: 0 };
  const skillPoints =
    input.skillPoints ?? input.progression?.availableSkillPoints ?? 0;
  const xpCurrent = input.xp?.current ?? input.progression?.experience ?? 0;
  const xpMax = input.xp?.max ?? input.progression?.experienceForNextLevel ?? 10;
  const zarkans = input.zarkans ?? input.economy?.zarkans ?? 0;
  const weightCurrent = input.weight?.current ?? input.stats?.load?.current ?? 0;
  const weightMax = input.weight?.max ?? input.stats?.load?.max ?? 25;
  const hpCurrent = input.hp?.current ?? input.stats?.health?.current ?? 12;
  const hpMax = input.hp?.max ?? input.stats?.health?.max ?? 12;
  const energyCurrent =
    input.energy?.current ?? input.stats?.energy?.current ?? 20;
  const energyMax = input.energy?.max ?? input.stats?.energy?.max ?? 20;

  const turnActions = input.turnActions ?? [];
  const visibleEntities = input.visibleEntities ?? [];
  const recentHistory = input.recentTurnsHistory ?? [];

  const lines = [
    headerLine,
    teamStr,
    `Rapidez: ${speed}`,
    `Estado: ${statusStr}`,
    `Localización: ${coord.q},${coord.r}`,
    `Puntos habilidad: ${skillPoints}`,
    `Experiencia: ${xpCurrent}/${xpMax}`,
    `Zarkans: ${zarkans}`,
    `Peso: ${weightCurrent}/${weightMax}`,
    `Objetos: ${itemsStr}`,
    `Vida: ${hpCurrent}/${hpMax}`,
    `Esfuerzo: ${energyCurrent}/${energyMax}`,
    "",
    "Acciones: ",
    ...turnActions,
    "",
    `Ves: ${visibleEntities.join(", ")}`,
    "",
    ...recentHistory.map((h) => `${h.turn}: ${h.actions.join(" - ")}`)
  ];

  return lines.join("\n");
};

export type LogCharacterSource =
  | HugoCharacterInput
  | PlayerCharacter
  | (Partial<PlayerCharacter> & {
      skills?: readonly CharacterSkillMultiplier[];
      turnActions?: readonly string[];
      visibleEntities?: readonly string[];
      recentTurnsHistory?: readonly {
        readonly turn: number;
        readonly actions: readonly string[];
      }[];
      xp?: { readonly current: number; readonly max: number };
      weight?: { readonly current: number; readonly max: number };
      hp?: { readonly current: number; readonly max: number };
      energy?: { readonly current: number; readonly max: number };
      speed?: number;
      coord?: { readonly q: number; readonly r: number };
      status?: readonly string[] | string;
    });

export const formatCharacterTurnLog = (
  character: LogCharacterSource,
  teamName?: string,
  turn?: number,
  events?: readonly (string | ReplayEvent)[],
  snapshot?: ReplaySnapshot | null,
  pastTurnsActions?: readonly {
    readonly turn: number;
    readonly actions: readonly string[];
  }[]
): string => {
  if (
    teamName === undefined &&
    turn === undefined &&
    character &&
    typeof character === "object" &&
    "name" in character &&
    ("turnActions" in character || "skills" in character)
  ) {
    return formatHugoCharacterLog(character as HugoCharacterInput);
  }

  const char = character as HugoCharacterInput & Partial<PlayerCharacter>;
  let visibleEntities: string[] = [];
  if (Array.isArray(char.visibleEntities)) {
    visibleEntities = [...char.visibleEntities];
  } else if (snapshot) {
    const charCoord = char.coord ?? char.position?.coord ?? { q: 0, r: 0 };
    const viewRange = char.stats?.baseViewRange ?? 3;
    const playersMap = snapshot.playerCharacters ?? {};
    const playerList = Array.isArray(playersMap)
      ? playersMap
      : Object.values(playersMap);
    for (const p of playerList) {
      const other = p as {
        id?: string;
        name?: string;
        coord?: { q: number; r: number };
        position?: { coord: { q: number; r: number } };
      };
      if (!other || other.id === (char as PlayerCharacter).id) {
        continue;
      }
      const otherCoord = other.coord ?? other.position?.coord;
      if (otherCoord && axialDist(charCoord, otherCoord) <= viewRange) {
        visibleEntities.push(other.name ?? other.id ?? "Player");
      }
    }
    const itemsMap = snapshot.items ?? {};
    const itemsList = Array.isArray(itemsMap)
      ? itemsMap
      : Object.values(itemsMap);
    const discoveredItemIds = new Set<string>(
      (char as PlayerCharacter).discoveredItemIds ?? []
    );
    for (const item of itemsList) {
      const raw = item as {
        id?: string;
        itemId?: string;
        coord?: { q: number; r: number };
      };
      if (!raw) {
        continue;
      }
      const itemCoord = raw.coord;
      const isHere =
        itemCoord &&
        itemCoord.q === charCoord.q &&
        itemCoord.r === charCoord.r;
      if (isHere || (raw.id && discoveredItemIds.has(raw.id))) {
        const itemId = raw.itemId ?? "";
        const libItem = (ItemLibrary as Record<string, { name: string } | undefined>)[itemId];
        const itemName = (libItem?.name ?? itemId).toLowerCase();
        if (itemName) {
          visibleEntities.push(itemName);
        }
      }
    }
  }

  let turnActions: string[] = [];
  if (Array.isArray(events)) {
    turnActions = events.map((e) =>
      typeof e === "string" ? e : (((e as unknown as { description?: string })?.description) ?? "")
    );
  } else if (Array.isArray(char.turnActions)) {
    turnActions = [...char.turnActions];
  }

  let recentHistory: Array<{ turn: number; actions: readonly string[] }> = [];
  if (Array.isArray(pastTurnsActions)) {
    recentHistory = [...pastTurnsActions];
  } else if (Array.isArray(char.recentTurnsHistory)) {
    recentHistory = [...char.recentTurnsHistory];
  }

  const input: HugoCharacterInput = {
    name: char.name ?? "Player",
    team: teamName ?? char.secretTeamId ?? char.teamId ?? "Sin equipo",
    skills: char.skills,
    abilities: char.abilities,
    speed: char.speed ?? char.stats?.speed,
    status: char.status,
    statuses: char.statuses,
    coord: char.coord ?? char.position?.coord,
    skillPoints: char.skillPoints ?? char.progression?.availableSkillPoints,
    progression: char.progression,
    xp: char.xp,
    zarkans: char.zarkans ?? char.economy?.zarkans,
    weight: char.weight,
    stats: char.stats,
    inventory: char.inventory,
    hp: char.hp,
    energy: char.energy,
    turnActions,
    visibleEntities,
    recentTurnsHistory: recentHistory
  };

  return formatHugoCharacterLog(input);
};

export const formatAllMatchTurnLog = (
  matchId: string,
  turn: number,
  eventStrings:
    | readonly string[]
    | readonly { readonly playerName: string; readonly log: string }[]
): string => {
  const parts: string[] = [
    `=== TURNO ${turn} - REGISTRO GLOBAL DE COMBATE ===`,
    `Partida: ${matchId} - Turno ${turn}`,
    ""
  ];

  if (eventStrings.length > 0) {
    const first = eventStrings[0];
    if (typeof first === "object" && first !== null && "playerName" in first) {
      const playerLogs = eventStrings as readonly {
        readonly playerName: string;
        readonly log: string;
      }[];
      for (const entry of playerLogs) {
        parts.push(`--- Jugador: ${entry.playerName} ---`, entry.log, "");
      }
    } else {
      parts.push("Acciones:", ...(eventStrings as readonly string[]));
    }
  } else {
    parts.push("Acciones:", "Ninguna");
  }

  return parts.join("\n");
};

export const formatCombinedAllPlayersLog = (
  turn: number,
  playerLogs: readonly { readonly playerName: string; readonly log: string }[],
  globalEvents: readonly string[] = []
): string => {
  const parts: string[] = [
    `=== TURNO ${turn} - REGISTRO GLOBAL DE COMBATE ===`,
    ""
  ];

  if (globalEvents.length > 0) {
    parts.push("Eventos Globales:", ...globalEvents, "");
  }

  for (const entry of playerLogs) {
    parts.push(`--- Jugador: ${entry.playerName} ---`, entry.log, "");
  }

  return parts.join("\n");
};

export const getBannerNotificationText = (
  selectedCharacterName: string | null
): string => {
  if (!selectedCharacterName || selectedCharacterName.toLowerCase() === "all") {
    return "All log copied";
  }
  return `${selectedCharacterName} log copied`;
};

export const getExportFileName = (matchId: string, turn: number): string => {
  const sanitizedMatchId = matchId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${sanitizedMatchId}_turn_${turn}.txt`;
};

export const isCharacterFilterRowVisible = (
  hasMatchReport: boolean,
  isAdmin: boolean
): boolean => {
  return hasMatchReport || isAdmin;
};

export const calculateLogBoxHeight = (
  panelHeight: number,
  baseOffset: number,
  hasFilterRow: boolean,
  filterRowHeight: number = 44
): number => {
  const available = panelHeight - baseOffset;
  return hasFilterRow ? available - filterRowHeight : available;
};

export const generateReplayCacheKey = (
  turn: number,
  characterId: string | null
): string => {
  return `${turn}:${characterId ?? "all"}`;
};
