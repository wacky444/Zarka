import {
  ItemLibrary,
  LocalizationType,
  SkillLibrary,
  type HexTileSnapshot,
  type PlayerCharacter,
  type ReplaySnapshot,
  type ReplayEvent
} from "@shared";
import { t } from "../services/i18n";

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
  readonly cellType?: LocalizationType | string;
  readonly cellTypeName?: string;
  readonly localizationType?: LocalizationType | string;
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

export const formatCellType = (
  cellType?: LocalizationType | string
): string => {
  if (!cellType) {
    return "";
  }
  return t(String(cellType));
};

export const isZarkanIncomeAction = (action: string): boolean => {
  if (!action || typeof action !== "string") {
    return false;
  }
  const normalized = action.trim().toLowerCase();
  return (
    normalized === "zarkan income" ||
    normalized === "zarkan_income" ||
    normalized.includes("daily zarkans") ||
    normalized.includes("zarkans diarios")
  );
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

const CODE_TO_NAME: Record<string, string> = {
  F: "Fuerza",
  A: "Agilidad",
  D: "Destreza",
  R: "Resistencia",
  S: "Simpatía",
  P: "Percepción",
  V: "Vitalidad"
};

const SHORTHAND_TO_SKILL_ID: Record<string, string> = {
  F1: "strength1",
  F2: "strength2",
  F3: "strength3",
  F4: "strength4",
  F5: "strength5",
  A1: "agility1",
  A2: "agility2",
  A3: "agility3",
  A4: "agility4",
  D1: "dexterity1",
  D2: "dexterity2",
  D3: "dexterity3",
  D4: "dexterity4",
  R1: "resilience1",
  R2: "resilience2",
  R3: "resilience3",
  R4: "resilience4",
  S1: "charisma1",
  S2: "charisma2",
  S3: "charisma3",
  S4: "charisma4",
  P1: "perception1",
  P2: "perception2",
  P3: "perception3",
  P4: "perception4",
  P5: "perception5",
  P6: "perception6",
  V: "vitality"
};

const SKILL_NAMES: Record<string, string> = {
  vitality: "Vitalidad",
  strength1: "Fuerza 1",
  strength2: "Fuerza 2",
  strength3: "Fuerza 3",
  strength4: "Fuerza 4",
  strength5: "Fuerza 5",
  agility1: "Agilidad 1",
  agility2: "Agilidad 2",
  agility3: "Agilidad 3",
  agility4: "Agilidad 4",
  dexterity1: "Destreza 1",
  dexterity2: "Destreza 2",
  dexterity3: "Destreza 3",
  dexterity4: "Destreza 4",
  resilience1: "Resistencia 1",
  resilience2: "Resistencia 2",
  resilience3: "Resistencia 3",
  resilience4: "Resistencia 4",
  charisma1: "Simpatía 1",
  charisma2: "Simpatía 2",
  charisma3: "Simpatía 3",
  charisma4: "Simpatía 4",
  perception1: "Percepción 1",
  perception2: "Percepción 2",
  perception3: "Percepción 3",
  perception4: "Percepción 4",
  perception5: "Percepción 5",
  perception6: "Percepción 6",
  greedy: "H1 Codicioso",
  cannibal: "H2 Caníbal",
  salesman: "H3 Vendedor",
  pensioner: "H4 Pensionista",
  undetectable: "H5 Indetectable",
  brave: "H6 Valiente",
  vengeful: "H7 Vengativo",
  charming: "H8 Encantador",
  coward: "H9 Cobarde"
};

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
        const mult = s.multiplier && s.multiplier > 1 ? `(x${s.multiplier})` : "";
        const name = CODE_TO_NAME[s.code] ?? s.code;
        const levelStr =
          typeof s.level === "number" && s.level > 0 ? ` ${s.level}` : "";
        return `${name}${levelStr}${mult}`;
      })
      .join(", ");
  }

  const counts = new Map<string, number>();
  for (const item of skills as readonly string[]) {
    const key = SHORTHAND_TO_SKILL_ID[item] ?? item;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const parts: string[] = [];
  const handled = new Set<string>();

  for (const [key, name] of Object.entries(SKILL_NAMES)) {
    const count = counts.get(key) ?? 0;
    if (count === 1) {
      parts.push(name);
      handled.add(key);
    } else if (count > 1) {
      parts.push(`${name}(x${count})`);
      handled.add(key);
    }
  }

  for (const [key, count] of counts.entries()) {
    if (!handled.has(key) && count > 0) {
      const name =
        (SkillLibrary as Record<string, { name: string } | undefined>)[key]
          ?.name ?? key;
      if (count === 1) {
        parts.push(name);
      } else {
        parts.push(`${name}(x${count})`);
      }
    }
  }

  return parts.join(", ");
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
    : "carriedItems" in inventory && Array.isArray(inventory.carriedItems)
      ? inventory.carriedItems
      : [];
  if (list.length === 0) {
    return "";
  }
  return list
    .map((item: InventoryItemEntry) => {
      const id = item.itemId ?? item.id ?? "";
      const rawCount = item.quantity ?? item.count ?? 1;
      const libItem = (
        ItemLibrary as Record<string, { name: string } | undefined>
      )[id];
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
      : `Equipo ${rawTeam}`
    : "Sin equipo";

  const speed = input.speed ?? input.stats?.speed ?? 0;
  const coord = input.coord ?? input.position?.coord ?? { q: 0, r: 0 };
  const skillPoints =
    input.skillPoints ?? input.progression?.availableSkillPoints ?? 0;
  const xpCurrent = input.xp?.current ?? input.progression?.experience ?? 0;
  const xpMax =
    input.xp?.max ?? input.progression?.experienceForNextLevel ?? 10;
  const zarkans = input.zarkans ?? input.economy?.zarkans ?? 0;
  const weightCurrent =
    input.weight?.current ?? input.stats?.load?.current ?? 0;
  const weightMax = input.weight?.max ?? input.stats?.load?.max ?? 25;
  const hpCurrent = input.hp?.current ?? input.stats?.health?.current ?? 12;
  const hpMax = input.hp?.max ?? input.stats?.health?.max ?? 12;
  const energyCurrent =
    input.energy?.current ?? input.stats?.energy?.current ?? 20;
  const energyMax = input.energy?.max ?? input.stats?.energy?.max ?? 20;

  const turnActions = (input.turnActions ?? []).filter(
    (action) => !isZarkanIncomeAction(action)
  );
  const visibleEntities = input.visibleEntities ?? [];
  const recentHistory = (input.recentTurnsHistory ?? []).map((h) => ({
    turn: h.turn,
    actions: h.actions.filter((a) => !isZarkanIncomeAction(a))
  }));

  const cellTypeStr = formatCellType(
    input.cellType ?? input.cellTypeName ?? input.localizationType
  );
  const locationLine = cellTypeStr
    ? `Localización: (${coord.q},${coord.r}) ${cellTypeStr}`
    : `Localización: (${coord.q},${coord.r})`;

  const lines = [
    headerLine,
    teamStr,
    `Rapidez: ${speed}`,
    `Estado: ${statusStr}`,
    locationLine,
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
      cellType?: LocalizationType | string;
      cellTypeName?: string;
      localizationType?: LocalizationType | string;
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
  }[],
  displayName?: string,
  usernames?: Record<string, string>
): string => {
  if (
    teamName === undefined &&
    turn === undefined &&
    character &&
    typeof character === "object" &&
    "name" in character &&
    ("turnActions" in character || "skills" in character)
  ) {
    const input = displayName
      ? { ...(character as HugoCharacterInput), name: displayName }
      : (character as HugoCharacterInput);
    return formatHugoCharacterLog(input);
  }

  const char = character as HugoCharacterInput & Partial<PlayerCharacter>;
  const charCoord = char.coord ?? char.position?.coord ?? { q: 0, r: 0 };
  let cellType = char.cellType ?? char.localizationType ?? char.cellTypeName;
  if (!cellType && snapshot?.map?.tiles) {
    const tileList: readonly HexTileSnapshot[] = Array.isArray(
      snapshot.map.tiles
    )
      ? snapshot.map.tiles
      : (Object.values(snapshot.map.tiles) as readonly HexTileSnapshot[]);
    const tile = tileList.find(
      (t) => t?.coord && t.coord.q === charCoord.q && t.coord.r === charCoord.r
    );
    if (tile?.localizationType) {
      cellType = tile.localizationType;
    }
  }

  let visibleEntities: string[] = [];
  if (Array.isArray(char.visibleEntities)) {
    visibleEntities = [...char.visibleEntities];
  } else if (snapshot) {
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
        const otherId = other.id ?? "";
        const otherName =
          usernames?.[otherId] ??
          (other.name && other.name !== otherId ? other.name : undefined) ??
          other.name ??
          other.id ??
          "Player";
        visibleEntities.push(otherName);
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
        itemCoord && itemCoord.q === charCoord.q && itemCoord.r === charCoord.r;
      if (isHere || (raw.id && discoveredItemIds.has(raw.id))) {
        const itemId = raw.itemId ?? "";
        const libItem = (
          ItemLibrary as Record<string, { name: string } | undefined>
        )[itemId];
        const itemName = (libItem?.name ?? itemId).toLowerCase();
        if (itemName) {
          visibleEntities.push(itemName);
        }
      }
    }
  }

  let turnActions: string[] = [];
  if (Array.isArray(events)) {
    turnActions = events
      .filter((e) => {
        if (typeof e === "object" && e !== null && "action" in e) {
          const action = (e as { action?: { actionId?: string } }).action;
          if (action && typeof action === "object" && "actionId" in action) {
            if (action.actionId === "zarkan_income") {
              return false;
            }
          }
        }
        return true;
      })
      .map((e) =>
        typeof e === "string"
          ? e
          : ((e as unknown as { description?: string })?.description ?? "")
      )
      .filter((a: string) => !isZarkanIncomeAction(a));
  } else if (Array.isArray(char.turnActions)) {
    turnActions = char.turnActions.filter((a: string) => !isZarkanIncomeAction(a));
  }

  let recentHistory: Array<{ turn: number; actions: readonly string[] }> = [];
  if (Array.isArray(pastTurnsActions)) {
    recentHistory = pastTurnsActions.map((h) => ({
      turn: h.turn,
      actions: h.actions.filter((a: string) => !isZarkanIncomeAction(a))
    }));
  } else if (Array.isArray(char.recentTurnsHistory)) {
    recentHistory = char.recentTurnsHistory.map((h) => ({
      turn: h.turn,
      actions: h.actions.filter((a: string) => !isZarkanIncomeAction(a))
    }));
  }

  const resolvedName =
    displayName ??
    (char.id && char.name && char.name !== char.id ? char.name : undefined) ??
    (char.id && usernames?.[char.id]) ??
    char.name ??
    "Player";

  const input: HugoCharacterInput = {
    name: resolvedName,
    team: teamName ?? char.secretTeamId ?? char.teamId ?? "Sin equipo",
    skills: char.skills,
    abilities: char.abilities,
    speed: char.speed ?? char.stats?.speed,
    status: char.status,
    statuses: char.statuses,
    coord: charCoord,
    cellType,
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
      const filtered = (eventStrings as readonly string[]).filter(
        (line) => !isZarkanIncomeAction(line)
      );
      parts.push("Acciones:", ...(filtered.length > 0 ? filtered : ["Ninguna"]));
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
  filterRowHeight: number = 76
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
