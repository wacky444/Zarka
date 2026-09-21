import { t } from "../services/i18n";
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
  target: PlayerCharacter | null | undefined,
  currentTurn?: number
): string {
  if (!target) {
    return "";
  }
  const canPerceiveDetails = canPerceiveCharacterDetails(viewer, target);
  const hasRemoteView =
    typeof currentTurn === "number" &&
    viewer?.remoteView?.turn === currentTurn &&
    viewer.remoteView.coord.q === target.position?.coord.q &&
    viewer.remoteView.coord.r === target.position?.coord.r;
  const revealedTypes =
    viewer?.revealedItemTypesByPlayerId?.[target.id] ?? [];
  if (!canPerceiveDetails && !hasRemoteView && revealedTypes.length === 0) {
    return "";
  }

  const lines: string[] = [];
  const energy = target.stats?.energy;
  if (canPerceiveDetails) {
    lines.push(
      energy
        ? `${t("Energy")}: ${energy.current}`
        : t("Energy: Unknown")
    );
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
            .map((condition) => t(CONDITION_LABELS[condition] ?? condition))
            .join(", ")
        : t("Normal");
    lines.push(`${t("State")}: ${state}`);
  } else if (hasRemoteView) {
    const conditions = target.statuses?.conditions ?? [];
    const state =
      conditions.length > 0
        ? conditions
            .map((condition) => t(CONDITION_LABELS[condition] ?? condition))
            .join(", ")
        : t("Normal");
    lines.push(`${t("State")}: ${state}`);
  }
  if (!canPerceiveDetails && revealedTypes.length === 0) {
    return lines.join("\n");
  }
  const carried = target.inventory?.carriedItems ?? [];
  const quantities = new Map<string, number>();
  const revealedLookup = new Set(revealedTypes);
  for (const stack of carried) {
    if (
      Number.isFinite(stack.quantity) &&
      stack.quantity > 0 &&
      (canPerceiveDetails || revealedLookup.has(stack.itemId))
    ) {
      quantities.set(
        stack.itemId,
        (quantities.get(stack.itemId) ?? 0) + stack.quantity
      );
    }
  }
  lines.push(
    canPerceiveDetails
      ? `${t("Carried items")}:`
      : `${t("Revealed carried items")}:`
  );
  if (quantities.size === 0) {
    lines.push(t("None"));
  } else {
    for (const [itemId, quantity] of quantities) {
      const name = ItemLibrary[itemId as ItemId]?.name ?? itemId;
      lines.push(`${name} x${quantity}`);
    }
  }
  return lines.join("\n");
}
