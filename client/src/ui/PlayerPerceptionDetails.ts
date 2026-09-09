import {
  canPerceiveCharacterDetails,
  ItemLibrary,
  type ItemId,
  type PlayerCharacter,
  type PlayerConditionFlag
} from "@shared";

const CONDITION_LABELS: Record<PlayerConditionFlag, string> = {
  unconscious: "Unconscious",
  injured: "Injured",
  hungry: "Hungry",
  intoxicated: "Intoxicated",
  burned: "Burned",
  infected: "Infected",
  dead: "Dead",
  protected: "Protected"
};

export function formatPlayerPerceptionDetails(
  viewer: PlayerCharacter | null | undefined,
  target: PlayerCharacter | null | undefined
): string {
  if (!canPerceiveCharacterDetails(viewer, target) || !target) {
    return "";
  }

  const energy = target.stats?.energy;
  const lines = [energy ? `Energy: ${energy.current}` : "Energy: Unknown"];
  const activeTemporary =
    (energy as { activeTemporary?: number } | undefined)?.activeTemporary ?? 0;
  if (activeTemporary > 0) {
    lines.push(`Extra energy (remaining): ${activeTemporary}`);
  }
  if (energy?.temporary && energy.temporary > 0) {
    lines.push(`Extra energy (next turn): ${energy.temporary}`);
  }

  const conditions = target.statuses?.conditions ?? [];
  const state =
    conditions.length > 0
      ? conditions
          .map((condition) => CONDITION_LABELS[condition] ?? condition)
          .join(", ")
      : "Normal";
  lines.push(`State: ${state}`);
  const carried = target.inventory?.carriedItems ?? [];
  const quantities = new Map<string, number>();
  for (const stack of carried) {
    if (Number.isFinite(stack.quantity) && stack.quantity > 0) {
      quantities.set(
        stack.itemId,
        (quantities.get(stack.itemId) ?? 0) + stack.quantity
      );
    }
  }
  lines.push("Carried items:");
  if (quantities.size === 0) {
    lines.push("None");
  } else {
    for (const [itemId, quantity] of quantities) {
      const name = ItemLibrary[itemId as ItemId]?.name ?? itemId;
      lines.push(`${name} x${quantity}`);
    }
  }
  return lines.join("\n");
}
