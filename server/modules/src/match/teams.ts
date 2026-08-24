/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import type { PlayerCharacter } from "@shared";
import type { MatchRecord } from "../models/types";

export const THEME_PLANETS = [
  "Mercurio",
  "Venus",
  "Tierra",
  "Marte",
  "Júpiter",
  "Saturno",
  "Urano",
  "Neptuno",
  "Plutón",
  "Ceres",
  "Eris",
  "Makemake",
  "Haumea",
  "Sedna",
  "Caronte",
  "Ganímedes",
  "Titán",
  "Calisto",
  "Ío",
  "Europa"
];

export const THEME_FRUITS = [
  "Manzana",
  "Plátano",
  "Fresa",
  "Naranja",
  "Limón",
  "Uva",
  "Sandía",
  "Melón",
  "Piña",
  "Melocotón",
  "Cereza",
  "Mango",
  "Pera",
  "Kiwi",
  "Ciruela",
  "Higo",
  "Frambuesa",
  "Mora",
  "Granada",
  "Papaya"
];

export const THEME_CONSTELLATIONS = [
  "Orión",
  "Andrómeda",
  "Casiopea",
  "Fénix",
  "Pegaso",
  "Perseo",
  "Centauro",
  "Dragón",
  "Lira",
  "Cisne",
  "Osa Mayor",
  "Osa Menor",
  "Hércules",
  "Acuario",
  "Tauro",
  "Géminis",
  "Leo",
  "Escorpio",
  "Sagitario",
  "Aries"
];

export const ALL_THEMES = [
  { name: "planets", names: THEME_PLANETS },
  { name: "fruits", names: THEME_FRUITS },
  { name: "constellations", names: THEME_CONSTELLATIONS }
];

export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

export function findPartitionsOf3And4(total: number): Array<{ threes: number; fours: number }> {
  const partitions: Array<{ threes: number; fours: number }> = [];
  if (total <= 0) {
    return partitions;
  }
  for (let fours = 0; fours * 4 <= total; fours += 1) {
    const remaining = total - fours * 4;
    if (remaining % 3 === 0) {
      partitions.push({ threes: remaining / 3, fours });
    }
  }
  return partitions;
}

export function generateTeamSizes(total: number): number[] {
  if (total <= 0) {
    return [];
  }
  if (total < 3) {
    return [total];
  }
  if (total === 5) {
    return [3, 2];
  }

  const partitions = findPartitionsOf3And4(total);
  if (partitions.length > 0) {
    const chosen = partitions[Math.floor(Math.random() * partitions.length)];
    const sizes: number[] = [];
    for (let i = 0; i < chosen.threes; i += 1) {
      sizes.push(3);
    }
    for (let i = 0; i < chosen.fours; i += 1) {
      sizes.push(4);
    }
    return shuffleArray(sizes);
  }

  const sizes: number[] = [];
  let remaining = total;
  while (remaining >= 7) {
    sizes.push(4);
    remaining -= 4;
  }
  if (remaining === 6) {
    sizes.push(3, 3);
  } else if (remaining === 5) {
    sizes.push(3, 2);
  } else if (remaining === 4) {
    sizes.push(4);
  } else if (remaining === 3) {
    sizes.push(3);
  } else if (remaining > 0) {
    if (sizes.length > 0) {
      sizes[0] += remaining;
    } else {
      sizes.push(remaining);
    }
  }
  return shuffleArray(sizes);
}

export interface TeamAssignmentResult {
  theme: string;
  heroPlayerId?: string;
  twinPlayerIds?: [string, string];
  teams: Record<string, string[]>;
}

export function distributeTeams(
  match: MatchRecord,
  logger?: nkruntime.Logger
): TeamAssignmentResult {
  const characters = match.playerCharacters ?? {};
  const humanPlayers = Array.isArray(match.players) ? [...match.players] : [];
  const totalBots =
    typeof match.botPlayers === "number" ? Math.max(0, match.botPlayers) : 0;
  const botPlayers: string[] = [];
  for (let i = 1; i <= totalBots; i += 1) {
    botPlayers.push(`bot${i}`);
  }

  const orderedRoster: string[] = [...humanPlayers];
  for (const botId of botPlayers) {
    if (orderedRoster.indexOf(botId) === -1) {
      orderedRoster.push(botId);
    }
  }
  for (const charId of Object.keys(characters)) {
    if (orderedRoster.indexOf(charId) === -1) {
      orderedRoster.push(charId);
    }
  }

  const totalPlayers = orderedRoster.length;
  const chosenTheme = ALL_THEMES[Math.floor(Math.random() * ALL_THEMES.length)];
  const shuffledThemeNames = shuffleArray(chosenTheme.names);

  const result: TeamAssignmentResult = {
    theme: chosenTheme.name,
    teams: {}
  };

  if (totalPlayers === 0) {
    return result;
  }

  let heroPlayerId: string | undefined;
  let remainingPlayers = [...orderedRoster];
  let teamSizes: number[] = [];
  let allowTwins = false;

  if (totalPlayers <= 6) {
    if (totalPlayers === 2) {
      teamSizes = [1, 1];
    } else if (totalPlayers % 2 !== 0) {
      for (let i = 0; i < totalPlayers; i += 1) {
        teamSizes.push(1);
      }
    } else {
      const teamCount = Math.floor(totalPlayers / 2);
      for (let i = 0; i < teamCount; i += 1) {
        teamSizes.push(2);
      }
    }
  } else if (totalPlayers <= 10) {
    const specialOptions = ["hero", "twin", "none"] as const;
    const specialChoice =
      specialOptions[Math.floor(Math.random() * specialOptions.length)];

    if (specialChoice === "hero") {
      heroPlayerId = remainingPlayers.pop();
      result.heroPlayerId = heroPlayerId;
      teamSizes = generateTeamSizes(remainingPlayers.length);
    } else if (specialChoice === "twin") {
      teamSizes = generateTeamSizes(remainingPlayers.length);
      allowTwins = true;
    } else {
      teamSizes = generateTeamSizes(remainingPlayers.length);
    }
  } else {
    heroPlayerId = remainingPlayers.pop();
    result.heroPlayerId = heroPlayerId;
    teamSizes = generateTeamSizes(remainingPlayers.length);
    allowTwins = true;
  }

  const normalTeams: Array<{ name: string; memberIds: string[] }> = [];

  let nameIndex = 0;
  for (const size of teamSizes) {
    const teamName =
      nameIndex < shuffledThemeNames.length
        ? shuffledThemeNames[nameIndex]
        : `Equipo ${nameIndex + 1}`;
    nameIndex += 1;
    const memberIds = remainingPlayers.splice(0, size);
    normalTeams.push({ name: teamName, memberIds });
    result.teams[teamName] = memberIds;
  }

  let twinPlayerIds: [string, string] | undefined;
  if (allowTwins && normalTeams.length >= 2) {
    const teamIndices = shuffleArray(normalTeams.map((_, idx) => idx));
    const teamA = normalTeams[teamIndices[0]];
    const teamB = normalTeams[teamIndices[1]];
    if (teamA.memberIds.length > 0 && teamB.memberIds.length > 0) {
      const twinAId = teamA.memberIds[teamA.memberIds.length - 1];
      const twinBId = teamB.memberIds[teamB.memberIds.length - 1];
      twinPlayerIds = [twinAId, twinBId];
      result.twinPlayerIds = twinPlayerIds;
    }
  }

  for (const team of normalTeams) {
    for (const memberId of team.memberIds) {
      const char = characters[memberId];
      if (!char) {
        continue;
      }
      char.teamId = team.name;
      char.progression = {
        ...char.progression,
        availableSkillPoints: 10
      };
      if (char.stats?.energy) {
        char.stats.energy.max = 20;
        char.stats.energy.current = 10;
      }
      char.inventory = {
        carriedItems: [{ itemId: "food", quantity: 1, weight: 3 }],
        stash: []
      };
      char.relationships = {
        confirmedTeammates: [],
        alliances: [],
        representatives: []
      };
    }
  }

  if (twinPlayerIds) {
    const [twinAId, twinBId] = twinPlayerIds;
    const charA = characters[twinAId];
    const charB = characters[twinBId];
    if (charA && charB) {
      charA.secretTeamId = "Gemelos";
      charA.progression = {
        ...charA.progression,
        availableSkillPoints: 25
      };
      if (charA.stats?.energy) {
        charA.stats.energy.max = 30;
        charA.stats.energy.current = 15;
      }
      charA.relationships = {
        confirmedTeammates: [twinBId],
        alliances: [],
        representatives: []
      };

      charB.secretTeamId = "Gemelos";
      charB.progression = {
        ...charB.progression,
        availableSkillPoints: 25
      };
      if (charB.stats?.energy) {
        charB.stats.energy.max = 30;
        charB.stats.energy.current = 15;
      }
      charB.relationships = {
        confirmedTeammates: [twinAId],
        alliances: [],
        representatives: []
      };
      result.teams["Gemelos"] = [twinAId, twinBId];
    }
  }

  if (heroPlayerId) {
    const heroChar = characters[heroPlayerId];
    if (heroChar) {
      heroChar.teamId = "Héroe";
      heroChar.progression = {
        ...heroChar.progression,
        availableSkillPoints: 50
      };
      if (heroChar.stats?.energy) {
        heroChar.stats.energy.max = 50;
        heroChar.stats.energy.current = 50;
      }
      heroChar.inventory = {
        carriedItems: [{ itemId: "food", quantity: 3, weight: 9 }],
        stash: []
      };
      heroChar.relationships = {
        confirmedTeammates: [],
        alliances: [],
        representatives: []
      };
      result.teams["Héroe"] = [heroPlayerId];
    }
  }

  match.teams = Object.keys(result.teams);

  if (logger) {
    logger.info(
      "distributeTeams match %s theme: %s, teams: %o",
      match.match_id,
      chosenTheme.name,
      result
    );
  }

  return result;
}
