import type { ActionId, ReplayPlayerEvent, PlayerCharacter } from "@shared";
import { getKnockoutThreshold } from "@shared";
import type { MatchRecord } from "../../models/types";
import { applyHealthDelta, mergeCharacterState } from "./utils";

export function hasActiveIntoxication(character: PlayerCharacter): boolean {
  return (character.statuses?.intoxication?.remainingActions ?? 0) > 0 ||
    character.statuses?.conditions?.includes("intoxicated") === true;
}

export interface PoisonedFoodOutcome {
  consumedPoison: boolean;
  intoxicationStarted: boolean;
  overdose?: "unconscious" | "dead";
  healthEvent?: ReplayPlayerEvent;
}

export function consumePoisonedServing(character: PlayerCharacter): PoisonedFoodOutcome {
  const poisonedFoodCount = Math.max(0, Math.floor(character.poisonedFoodCount ?? 0));
  if (poisonedFoodCount <= 0) {
    return { consumedPoison: false, intoxicationStarted: false };
  }
  character.poisonedFoodCount = poisonedFoodCount - 1;
  const poisonOwners = Object.entries(character.poisonedFoodBy ?? {});
  const consumedOwner = poisonOwners.find(([, count]) => count > 0)?.[0];
  if (consumedOwner) {
    const remaining = (character.poisonedFoodBy?.[consumedOwner] ?? 0) - 1;
    if (remaining > 0) character.poisonedFoodBy = { ...character.poisonedFoodBy, [consumedOwner]: remaining };
    else {
      const remainingOwners = { ...character.poisonedFoodBy };
      delete remainingOwners[consumedOwner];
      character.poisonedFoodBy = remainingOwners;
    }
    if (Object.keys(character.poisonedFoodBy ?? {}).length === 0) delete character.poisonedFoodBy;
  }
  if (!hasActiveIntoxication(character)) {
    const statuses = character.statuses ?? { conditions: [] };
    const conditions = [...(statuses.conditions ?? [])];
    if (!conditions.includes("intoxicated")) conditions.push("intoxicated");
    character.statuses = {
      ...statuses,
      conditions,
      intoxication: { remainingActions: 5 },
    };
    return { consumedPoison: true, intoxicationStarted: true };
  }

  const injured = character.statuses?.conditions?.includes("injured") === true;
  const currentHealth = character.stats?.health?.current ?? 0;
  if (!injured && currentHealth <= getKnockoutThreshold(character)) {
    const statuses = character.statuses ?? { conditions: [] };
    const conditions = [...(statuses.conditions ?? [])];
    if (!conditions.includes("unconscious")) conditions.push("unconscious");
    character.statuses = { ...statuses, conditions };
    delete character.actionPlan;
    return {
      consumedPoison: true,
      intoxicationStarted: false,
      overdose: "unconscious",
      healthEvent: {
        kind: "player",
        actorId: character.id,
        action: { actionId: "status_unconscious", metadata: { health: currentHealth } },
      },
    };
  }
  const delta = injured
    ? -Math.max(1, currentHealth)
    : getKnockoutThreshold(character) - currentHealth;
  const healthOutcome = applyHealthDelta(character, delta, true, undefined, injured);
  mergeCharacterState(character, healthOutcome.character);
  return {
    consumedPoison: true,
    intoxicationStarted: false,
    overdose: injured ? "dead" : "unconscious",
    healthEvent: healthOutcome.event,
  };
}

export function applyIntoxicationBeforeAction(
  match: MatchRecord,
  actionId: ActionId,
): ReplayPlayerEvent[] {
  const events: ReplayPlayerEvent[] = [];
  for (const [playerId, character] of Object.entries(match.playerCharacters ?? {})) {
    const plan = character.actionPlan;
    const hasThisAction = plan?.main?.actionId === actionId ||
      plan?.secondary?.actionId === actionId ||
      plan?.extraSecondary?.actionId === actionId;
    if (!hasThisAction || !hasActiveIntoxication(character)) continue;
    const remaining = Math.max(1, Math.floor(character.statuses?.intoxication?.remainingActions ?? 1));
    const nextRemaining = remaining - 1;
    const healthOutcome = applyHealthDelta(character, -1);
    mergeCharacterState(character, healthOutcome.character);
    match.playerCharacters![playerId] = character;
    events.push({
      kind: "player",
      actorId: playerId,
      action: {
        actionId: "poison_food",
        metadata: { poisonDamage: true, damage: Math.max(0, -healthOutcome.result.delta), remainingActions: Math.max(0, nextRemaining) },
      },
    });
    if (healthOutcome.event) events.push(healthOutcome.event);
  }
  return events;
}

export function decrementIntoxicationAfterAction(
  match: MatchRecord,
  playerIds: string[],
): void {
  for (const playerId of playerIds) {
    const character = match.playerCharacters?.[playerId];
    if (!character || !hasActiveIntoxication(character)) continue;
    const remaining = Math.max(1, Math.floor(character.statuses?.intoxication?.remainingActions ?? 1));
    const nextRemaining = remaining - 1;
    const statuses = character.statuses ?? { conditions: [] };
    const conditions = [...(statuses.conditions ?? [])];
    if (nextRemaining <= 0) {
      character.statuses = {
        ...statuses,
        conditions: conditions.filter((condition) => condition !== "intoxicated"),
        intoxication: undefined,
      };
    } else {
      character.statuses = {
        ...statuses,
        conditions: conditions.includes("intoxicated") ? conditions : [...conditions, "intoxicated"],
        intoxication: { remainingActions: nextRemaining },
      };
    }
    match.playerCharacters![playerId] = character;
  }
}
