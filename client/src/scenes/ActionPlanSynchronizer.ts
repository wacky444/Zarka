import type { RpcResponse } from "@heroiclabs/nakama-js";
import {
  ActionCategory,
  ActionLibrary,
  normalizeAxial,
  type ActionId,
  type ActionSubmission,
  type Axial,
  type MatchRecord,
  type PlayerPlannedAction,
  type UpdateMainActionPayload,
  type UpdateSecondaryActionPayload,
} from "@shared";
import type {
  MainActionSelection,
  SecondaryActionSelection,
} from "../ui/CharacterPanel";
import type { TurnService } from "../services/turnService";

export interface ActionPlanSynchronizerContext {
  getTurnService(): TurnService | null;
  getCurrentUserId(): string | null;
  getCurrentMatchId(): string | null;
  getCurrentMatch(): MatchRecord | null;
  isReplayViewActive(): boolean;
  cancelMainActionLocationPick(): void;
  parseRpcPayload<T>(response: RpcResponse): T;
  updateCharacterPanel(match: MatchRecord): void;
}

export class ActionPlanSynchronizer {
  private readonly context: ActionPlanSynchronizerContext;

  private mainActionUpdateRunning = false;
  private pendingMainActionSelection: MainActionSelection | undefined;
  private mainActionDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private queuedMainActionSelection:
    | MainActionSelection
    | null
    | undefined;
  private secondaryActionUpdateRunning = false;
  private pendingSecondaryActionSelection:
    | SecondaryActionSelection
    | undefined;
  private secondaryActionDebounceTimer: ReturnType<typeof setTimeout> | null =
    null;
  private queuedSecondaryActionSelection:
    | SecondaryActionSelection
    | null
    | undefined;
  private extraSecondaryActionUpdateRunning = false;
  private pendingExtraSecondaryActionSelection:
    | SecondaryActionSelection
    | undefined;
  private extraSecondaryActionDebounceTimer:
    | ReturnType<typeof setTimeout>
    | null = null;
  private queuedExtraSecondaryActionSelection:
    | SecondaryActionSelection
    | null
    | undefined;

  constructor(context: ActionPlanSynchronizerContext) {
    this.context = context;
  }

  destroy(): void {
    if (this.mainActionDebounceTimer !== null) {
      clearTimeout(this.mainActionDebounceTimer);
      this.mainActionDebounceTimer = null;
    }
    if (this.secondaryActionDebounceTimer !== null) {
      clearTimeout(this.secondaryActionDebounceTimer);
      this.secondaryActionDebounceTimer = null;
    }
    if (this.extraSecondaryActionDebounceTimer !== null) {
      clearTimeout(this.extraSecondaryActionDebounceTimer);
      this.extraSecondaryActionDebounceTimer = null;
    }
    this.queuedMainActionSelection = undefined;
    this.queuedSecondaryActionSelection = undefined;
    this.queuedExtraSecondaryActionSelection = undefined;
    this.pendingMainActionSelection = undefined;
    this.pendingSecondaryActionSelection = undefined;
    this.pendingExtraSecondaryActionSelection = undefined;
  }

  scheduleMainActionSelection = (
    selection: MainActionSelection | null | undefined,
  ): void => {
    if (this.context.isReplayViewActive()) {
      return;
    }
    this.queuedMainActionSelection = selection;
    if (this.mainActionDebounceTimer !== null) {
      clearTimeout(this.mainActionDebounceTimer);
    }
    this.mainActionDebounceTimer = setTimeout(() => {
      const nextSelection = this.queuedMainActionSelection;
      this.queuedMainActionSelection = undefined;
      this.mainActionDebounceTimer = null;
      void this.handleMainActionSelection(nextSelection);
    }, 250);
  };

  scheduleSecondaryActionSelection = (
    selection: SecondaryActionSelection | null | undefined,
  ): void => {
    if (this.context.isReplayViewActive()) {
      return;
    }
    this.queuedSecondaryActionSelection = selection;
    if (this.secondaryActionDebounceTimer !== null) {
      clearTimeout(this.secondaryActionDebounceTimer);
    }
    this.secondaryActionDebounceTimer = setTimeout(() => {
      const nextSelection = this.queuedSecondaryActionSelection;
      this.queuedSecondaryActionSelection = undefined;
      this.secondaryActionDebounceTimer = null;
      void this.handleSecondaryActionSelection(nextSelection);
    }, 250);
  };

  scheduleExtraSecondaryActionSelection = (
    selection: SecondaryActionSelection | null | undefined,
  ): void => {
    if (this.context.isReplayViewActive()) {
      return;
    }
    this.queuedExtraSecondaryActionSelection = selection;
    if (this.extraSecondaryActionDebounceTimer !== null) {
      clearTimeout(this.extraSecondaryActionDebounceTimer);
    }
    this.extraSecondaryActionDebounceTimer = setTimeout(() => {
      const nextSelection = this.queuedExtraSecondaryActionSelection;
      this.queuedExtraSecondaryActionSelection = undefined;
      this.extraSecondaryActionDebounceTimer = null;
      void this.handleExtraSecondaryActionSelection(nextSelection);
    }, 250);
  };

  private async handleMainActionSelection(
    selection: MainActionSelection | null | undefined,
  ): Promise<void> {
    this.context.cancelMainActionLocationPick();
    const turnService = this.context.getTurnService();
    const currentUserId = this.context.getCurrentUserId();
    const matchId = this.context.getCurrentMatchId();
    if (!turnService || !currentUserId || !matchId) {
      return;
    }

    const normalizedPlayers = this.normalizeTargetPlayers(
      selection?.targetPlayerIds ?? undefined,
    );
    const normalizedItems = this.normalizeTargetItems(
      selection?.targetItemIds ?? undefined,
    );
    const normalizedSelection: MainActionSelection = {
      actionId: selection?.actionId ?? null,
      targetLocation: normalizeAxial(selection?.targetLocation),
      secondTargetLocation: normalizeAxial(
        selection?.secondTargetLocation,
      ),
      targetPlayerIds: normalizedPlayers,
      secondTargetPlayerId: this.normalizePlayerId(
        selection?.secondTargetPlayerId,
      ),
      targetItemIds: normalizedItems,
      extraExecutions:
        typeof selection?.extraExecutions === "number"
          ? selection.extraExecutions
          : undefined,
    };
    const character =
      this.context.getCurrentMatch()?.playerCharacters?.[currentUserId] ?? null;
    const previousPlan = character?.actionPlan?.main ?? null;
    const previousActionId = previousPlan?.actionId ?? null;
    const previousTarget = normalizeAxial(previousPlan?.targetLocationId);
    const previousSecondTarget = normalizeAxial(
      previousPlan?.secondTargetLocationId,
    );
    const previousSecondTargetPlayerId = this.normalizePlayerId(
      previousPlan?.secondTargetPlayerId,
    );
    const previousPlayers = this.normalizeTargetPlayers(
      previousPlan?.targetPlayerIds ?? undefined,
    );
    const previousItems = this.normalizeTargetItems(
      previousPlan?.targetItemIds ?? undefined,
    );
    if (
      normalizedSelection.actionId === previousActionId &&
      this.isSameAxial(normalizedSelection.targetLocation, previousTarget) &&
      this.isSameAxial(
        normalizedSelection.secondTargetLocation,
        previousSecondTarget,
      ) &&
      normalizedSelection.secondTargetPlayerId ===
        previousSecondTargetPlayerId &&
      this.isSameTargetPlayers(
        normalizedSelection.targetPlayerIds,
        previousPlayers,
      ) &&
      this.isSameTargetItems(
        normalizedSelection.targetItemIds,
        previousItems,
      ) &&
      (normalizedSelection.extraExecutions ?? 0) ===
        (previousPlan?.extraExecutions ?? 0)
    ) {
      return;
    }
    if (this.mainActionUpdateRunning) {
      this.pendingMainActionSelection = normalizedSelection;
      return;
    }
    this.mainActionUpdateRunning = true;
    this.pendingMainActionSelection = undefined;
    try {
      const submission = normalizedSelection.actionId
        ? this.buildMainActionSubmission(
            normalizedSelection.actionId,
            normalizedSelection.targetLocation,
            normalizedSelection.secondTargetLocation ?? null,
            normalizedSelection.targetPlayerIds,
            normalizedSelection.secondTargetPlayerId ?? undefined,
            normalizedSelection.targetItemIds,
            normalizedSelection.extraExecutions,
          )
        : null;
      const response = await turnService.updateMainAction(matchId, submission);
      const payload = this.context.parseRpcPayload<UpdateMainActionPayload>(
        response,
      );
      if (payload.error) {
        throw new Error(payload.error);
      }
      const match = this.context.getCurrentMatch();
      if (!match) {
        return;
      }
      const target = match.playerCharacters?.[currentUserId] ?? null;
      if (!target) {
        return;
      }
      target.actionPlan = target.actionPlan ?? {};
      if (!submission) {
        if (target.actionPlan.main) {
          delete target.actionPlan.main;
        }
        if (
          target.actionPlan.secondary === undefined &&
          target.actionPlan.extraSecondary === undefined &&
          target.actionPlan.nextMain === undefined &&
          target.actionPlan.main === undefined
        ) {
          delete target.actionPlan;
        }
      } else {
        const nextPlan: PlayerPlannedAction = {
          ...(target.actionPlan.main ?? {}),
          actionId: submission.actionId,
        };
        if (payload.targetLocationId) {
          nextPlan.targetLocationId = payload.targetLocationId;
        } else if (nextPlan.targetLocationId) {
          delete nextPlan.targetLocationId;
        }
        if (payload.secondTargetLocationId) {
          nextPlan.secondTargetLocationId = payload.secondTargetLocationId;
        } else {
          delete nextPlan.secondTargetLocationId;
        }
        if (payload.secondTargetPlayerId) {
          nextPlan.secondTargetPlayerId = payload.secondTargetPlayerId;
        } else {
          delete nextPlan.secondTargetPlayerId;
        }
        if (payload.targetPlayerIds && payload.targetPlayerIds.length > 0) {
          nextPlan.targetPlayerIds = [...payload.targetPlayerIds];
        } else if (nextPlan.targetPlayerIds) {
          delete nextPlan.targetPlayerIds;
        }
        if (payload.targetItemIds && payload.targetItemIds.length > 0) {
          nextPlan.targetItemIds = [...payload.targetItemIds];
        } else if (nextPlan.targetItemIds) {
          delete nextPlan.targetItemIds;
        }
        if (
          typeof payload.extraExecutions === "number" &&
          payload.extraExecutions > 0
        ) {
          nextPlan.extraExecutions = payload.extraExecutions;
        } else if (nextPlan.extraExecutions) {
          delete nextPlan.extraExecutions;
        }
        target.actionPlan.main = nextPlan;
      }
      if (
        this.pendingMainActionSelection === undefined &&
        this.queuedMainActionSelection === undefined
      ) {
        this.context.updateCharacterPanel(match);
      }
    } catch (error) {
      console.warn("update_main_action failed", error);
    } finally {
      this.mainActionUpdateRunning = false;
      if (this.pendingMainActionSelection) {
        const nextSelection = this.pendingMainActionSelection;
        this.pendingMainActionSelection = undefined;
        void this.handleMainActionSelection(nextSelection);
      }
    }
  }

  private async handleSecondaryActionSelection(
    selection: SecondaryActionSelection | null | undefined,
  ): Promise<void> {
    const turnService = this.context.getTurnService();
    const currentUserId = this.context.getCurrentUserId();
    const matchId = this.context.getCurrentMatchId();
    if (!turnService || !currentUserId || !matchId) {
      return;
    }
    const normalizedPlayers = this.normalizeTargetPlayers(
      selection?.targetPlayerIds ?? undefined,
    );
    const normalizedItems = this.normalizeTargetItems(
      selection?.targetItemIds ?? undefined,
    );
    const normalizedSelection: SecondaryActionSelection = {
      actionId: selection?.actionId ?? null,
      targetLocation: normalizeAxial(selection?.targetLocation),
      targetPlayerIds: normalizedPlayers,
      targetItemIds: normalizedItems,
      extraExecutions:
        typeof selection?.extraExecutions === "number"
          ? selection.extraExecutions
          : undefined,
      prioritizeFoodDrink: selection?.prioritizeFoodDrink === true,
      sellInstead: selection?.sellInstead === true,
      singleTarget: selection?.singleTarget === true,
      inspectAdditionalTarget: selection?.inspectAdditionalTarget === true,
    };
    const character =
      this.context.getCurrentMatch()?.playerCharacters?.[currentUserId] ?? null;
    const previousPlan = character?.actionPlan?.secondary ?? null;
    const previousActionId = previousPlan?.actionId ?? null;
    const previousTarget = normalizeAxial(
      previousPlan?.targetLocationId ?? null,
    );
    const previousPlayers = this.normalizeTargetPlayers(
      previousPlan?.targetPlayerIds ?? undefined,
    );
    const previousItems = this.normalizeTargetItems(
      previousPlan?.targetItemIds ?? undefined,
    );
    if (
      normalizedSelection.actionId === previousActionId &&
      this.isSameAxial(normalizedSelection.targetLocation, previousTarget) &&
      this.isSameTargetPlayers(
        normalizedSelection.targetPlayerIds,
        previousPlayers,
      ) &&
      this.isSameTargetItems(
        normalizedSelection.targetItemIds,
        previousItems,
      ) &&
      (normalizedSelection.extraExecutions ?? 0) ===
        (previousPlan?.extraExecutions ?? 0) &&
      normalizedSelection.prioritizeFoodDrink ===
        (previousPlan?.prioritizeFoodDrink ?? false) &&
      normalizedSelection.sellInstead === (previousPlan?.sellInstead ?? false) &&
      normalizedSelection.singleTarget === (previousPlan?.singleTarget ?? false) &&
      normalizedSelection.inspectAdditionalTarget ===
        (previousPlan?.inspectAdditionalTarget ?? false)
    ) {
      return;
    }
    if (this.secondaryActionUpdateRunning) {
      this.pendingSecondaryActionSelection = normalizedSelection;
      return;
    }
    this.secondaryActionUpdateRunning = true;
    this.pendingSecondaryActionSelection = undefined;
    try {
      const submission = normalizedSelection.actionId
        ? this.buildSecondaryActionSubmission(
            normalizedSelection.actionId,
            normalizedSelection.targetLocation,
            normalizedSelection.targetPlayerIds,
            normalizedSelection.targetItemIds,
            normalizedSelection.extraExecutions,
            normalizedSelection.prioritizeFoodDrink,
            normalizedSelection.sellInstead,
            normalizedSelection.singleTarget,
            normalizedSelection.inspectAdditionalTarget,
          )
        : null;
      const response = await turnService.updateSecondaryAction(
        matchId,
        submission,
      );
      const payload =
        this.context.parseRpcPayload<UpdateSecondaryActionPayload>(response);
      if (payload.error) {
        throw new Error(payload.error);
      }
      const match = this.context.getCurrentMatch();
      if (!match) {
        return;
      }
      const target = match.playerCharacters?.[currentUserId] ?? null;
      if (!target) {
        return;
      }
      target.actionPlan = target.actionPlan ?? {};
      if (!submission) {
        if (target.actionPlan.secondary) {
          delete target.actionPlan.secondary;
        }
        if (
          target.actionPlan.secondary === undefined &&
          target.actionPlan.extraSecondary === undefined &&
          target.actionPlan.nextMain === undefined &&
          target.actionPlan.main === undefined
        ) {
          delete target.actionPlan;
        }
      } else {
        const nextPlan: PlayerPlannedAction = {
          ...(target.actionPlan.secondary ?? {}),
          actionId: submission.actionId,
        };
        if (payload.targetLocationId) {
          nextPlan.targetLocationId = payload.targetLocationId;
        } else if (nextPlan.targetLocationId) {
          delete nextPlan.targetLocationId;
        }
        if (payload.targetPlayerIds && payload.targetPlayerIds.length > 0) {
          nextPlan.targetPlayerIds = [...payload.targetPlayerIds];
        } else if (nextPlan.targetPlayerIds) {
          delete nextPlan.targetPlayerIds;
        }
        if (payload.targetItemIds && payload.targetItemIds.length > 0) {
          nextPlan.targetItemIds = [...payload.targetItemIds];
        } else if (nextPlan.targetItemIds) {
          delete nextPlan.targetItemIds;
        }
        if (
          typeof payload.extraExecutions === "number" &&
          payload.extraExecutions > 0
        ) {
          nextPlan.extraExecutions = payload.extraExecutions;
        } else if (nextPlan.extraExecutions) {
          delete nextPlan.extraExecutions;
        }
        if (payload.prioritizeFoodDrink === true) {
          nextPlan.prioritizeFoodDrink = true;
        } else {
          delete nextPlan.prioritizeFoodDrink;
        }
        if (payload.sellInstead === true) {
          nextPlan.sellInstead = true;
        } else {
          delete nextPlan.sellInstead;
        }
        if (payload.singleTarget === true) {
          nextPlan.singleTarget = true;
        } else {
          delete nextPlan.singleTarget;
        }
        if (payload.inspectAdditionalTarget === true) {
          nextPlan.inspectAdditionalTarget = true;
        } else {
          delete nextPlan.inspectAdditionalTarget;
        }
        target.actionPlan.secondary = nextPlan;
      }
      if (
        this.pendingSecondaryActionSelection === undefined &&
        this.queuedSecondaryActionSelection === undefined
      ) {
        this.context.updateCharacterPanel(match);
      }
    } catch (error) {
      console.warn("update_secondary_action failed", error);
    } finally {
      this.secondaryActionUpdateRunning = false;
      if (this.pendingSecondaryActionSelection) {
        const nextSelection = this.pendingSecondaryActionSelection;
        this.pendingSecondaryActionSelection = undefined;
        void this.handleSecondaryActionSelection(nextSelection);
      }
    }
  }

  private async handleExtraSecondaryActionSelection(
    selection: SecondaryActionSelection | null | undefined,
  ): Promise<void> {
    const turnService = this.context.getTurnService();
    const currentUserId = this.context.getCurrentUserId();
    const matchId = this.context.getCurrentMatchId();
    if (!turnService || !currentUserId || !matchId) {
      return;
    }
    const normalizedSelection: SecondaryActionSelection = {
      actionId: selection?.actionId ?? null,
      targetLocation: normalizeAxial(selection?.targetLocation),
      targetPlayerIds: this.normalizeTargetPlayers(
        selection?.targetPlayerIds ?? undefined,
      ),
      targetItemIds: this.normalizeTargetItems(
        selection?.targetItemIds ?? undefined,
      ),
      extraExecutions:
        typeof selection?.extraExecutions === "number"
          ? selection.extraExecutions
          : undefined,
      prioritizeFoodDrink: selection?.prioritizeFoodDrink === true,
      sellInstead: selection?.sellInstead === true,
      singleTarget: selection?.singleTarget === true,
    };
    const character =
      this.context.getCurrentMatch()?.playerCharacters?.[currentUserId] ?? null;
    const previousPlan = character?.actionPlan?.extraSecondary ?? null;
    if (
      normalizedSelection.actionId === (previousPlan?.actionId ?? null) &&
      this.isSameAxial(
        normalizedSelection.targetLocation,
        normalizeAxial(previousPlan?.targetLocationId ?? null),
      ) &&
      this.isSameTargetPlayers(
        normalizedSelection.targetPlayerIds,
        this.normalizeTargetPlayers(previousPlan?.targetPlayerIds),
      ) &&
      this.isSameTargetItems(
        normalizedSelection.targetItemIds,
        this.normalizeTargetItems(previousPlan?.targetItemIds),
      ) &&
      (normalizedSelection.extraExecutions ?? 0) ===
        (previousPlan?.extraExecutions ?? 0) &&
      normalizedSelection.prioritizeFoodDrink ===
        (previousPlan?.prioritizeFoodDrink ?? false) &&
      normalizedSelection.sellInstead === (previousPlan?.sellInstead ?? false) &&
      normalizedSelection.singleTarget === (previousPlan?.singleTarget ?? false)
    ) {
      return;
    }
    if (this.extraSecondaryActionUpdateRunning) {
      this.pendingExtraSecondaryActionSelection = normalizedSelection;
      return;
    }
    this.extraSecondaryActionUpdateRunning = true;
    this.pendingExtraSecondaryActionSelection = undefined;
    try {
      const submission = normalizedSelection.actionId
        ? this.buildSecondaryActionSubmission(
            normalizedSelection.actionId,
            normalizedSelection.targetLocation,
            normalizedSelection.targetPlayerIds,
            normalizedSelection.targetItemIds,
            normalizedSelection.extraExecutions,
            normalizedSelection.prioritizeFoodDrink,
            normalizedSelection.sellInstead,
            normalizedSelection.singleTarget,
          )
        : null;
      const response = await turnService.updateSecondaryAction(
        matchId,
        submission,
        "extra_secondary",
      );
      const payload =
        this.context.parseRpcPayload<UpdateSecondaryActionPayload>(response);
      if (payload.error) {
        throw new Error(payload.error);
      }
      const match = this.context.getCurrentMatch();
      if (!match) {
        return;
      }
      const target = match.playerCharacters?.[currentUserId] ?? null;
      if (!target) {
        return;
      }
      target.actionPlan = target.actionPlan ?? {};
      if (!submission) {
        delete target.actionPlan.extraSecondary;
        if (
          target.actionPlan.main === undefined &&
          target.actionPlan.secondary === undefined &&
          target.actionPlan.extraSecondary === undefined &&
          target.actionPlan.nextMain === undefined
        ) {
          delete target.actionPlan;
        }
      } else {
        const nextPlan: PlayerPlannedAction = {
          ...(target.actionPlan.extraSecondary ?? {}),
          actionId: submission.actionId,
        };
        if (payload.targetLocationId) {
          nextPlan.targetLocationId = payload.targetLocationId;
        } else {
          delete nextPlan.targetLocationId;
        }
        if (payload.targetPlayerIds && payload.targetPlayerIds.length > 0) {
          nextPlan.targetPlayerIds = [...payload.targetPlayerIds];
        } else {
          delete nextPlan.targetPlayerIds;
        }
        if (payload.targetItemIds && payload.targetItemIds.length > 0) {
          nextPlan.targetItemIds = [...payload.targetItemIds];
        } else {
          delete nextPlan.targetItemIds;
        }
        if (
          typeof payload.extraExecutions === "number" &&
          payload.extraExecutions > 0
        ) {
          nextPlan.extraExecutions = payload.extraExecutions;
        } else {
          delete nextPlan.extraExecutions;
        }
        if (payload.prioritizeFoodDrink === true) {
          nextPlan.prioritizeFoodDrink = true;
        } else {
          delete nextPlan.prioritizeFoodDrink;
        }
        if (payload.sellInstead === true) {
          nextPlan.sellInstead = true;
        } else {
          delete nextPlan.sellInstead;
        }
        if (payload.singleTarget === true) {
          nextPlan.singleTarget = true;
        } else {
          delete nextPlan.singleTarget;
        }
        target.actionPlan.extraSecondary = nextPlan;
      }
      if (
        this.pendingExtraSecondaryActionSelection === undefined &&
        this.queuedExtraSecondaryActionSelection === undefined
      ) {
        this.context.updateCharacterPanel(match);
      }
    } catch (error) {
      console.warn("update_extra_secondary_action failed", error);
    } finally {
      this.extraSecondaryActionUpdateRunning = false;
      if (this.pendingExtraSecondaryActionSelection) {
        const nextSelection = this.pendingExtraSecondaryActionSelection;
        this.pendingExtraSecondaryActionSelection = undefined;
        void this.handleExtraSecondaryActionSelection(nextSelection);
      }
    }
  }

  private buildMainActionSubmission(
    actionId: string,
    target: Axial | null,
    secondTarget: Axial | null,
    targetPlayerIds: string[] | undefined,
    secondTargetPlayerId: string | undefined,
    targetItemIds: string[] | undefined,
    extraExecutions?: number,
  ): ActionSubmission {
    const typedId = actionId as ActionId;
    const definition = ActionLibrary[typedId] ?? null;
    const category = definition?.category ?? ActionCategory.Primary;
    const submission: ActionSubmission = {
      playerId: this.context.getCurrentUserId()!,
      actionId: definition ? definition.id : typedId,
      category,
    };
    if (target) {
      submission.targetLocationId = { q: target.q, r: target.r };
    }
    if (secondTarget) {
      submission.secondTargetLocationId = {
        q: secondTarget.q,
        r: secondTarget.r,
      };
    }
    if (secondTargetPlayerId) {
      submission.secondTargetPlayerId = secondTargetPlayerId;
    }
    if (targetPlayerIds !== undefined) {
      submission.targetPlayerIds =
        targetPlayerIds.length > 0 ? [...targetPlayerIds] : [];
    }
    if (targetItemIds !== undefined) {
      submission.targetItemIds =
        targetItemIds.length > 0 ? [...targetItemIds] : [];
    }
    if (typeof extraExecutions === "number" && extraExecutions > 0) {
      submission.extraExecutions = extraExecutions;
    }
    return submission;
  }

  private buildSecondaryActionSubmission(
    actionId: string,
    target: Axial | null,
    targetPlayerIds: string[] | undefined,
    targetItemIds: string[] | undefined,
    extraExecutions?: number,
    prioritizeFoodDrink = false,
    sellInstead = false,
    singleTarget?: boolean,
    inspectAdditionalTarget = false,
  ): ActionSubmission {
    const typedId = actionId as ActionId;
    const definition = ActionLibrary[typedId] ?? null;
    const category = definition?.category ?? ActionCategory.Secondary;
    const submission: ActionSubmission = {
      playerId: this.context.getCurrentUserId()!,
      actionId: definition ? definition.id : typedId,
      category,
    };
    if (target) {
      submission.targetLocationId = { q: target.q, r: target.r };
    }
    if (targetPlayerIds !== undefined) {
      submission.targetPlayerIds =
        targetPlayerIds.length > 0 ? [...targetPlayerIds] : [];
    }
    if (targetItemIds !== undefined) {
      submission.targetItemIds =
        targetItemIds.length > 0 ? [...targetItemIds] : [];
    }
    if (typeof extraExecutions === "number" && extraExecutions > 0) {
      submission.extraExecutions = extraExecutions;
    }
    if (prioritizeFoodDrink) {
      submission.prioritizeFoodDrink = true;
    }
    if (sellInstead) {
      submission.sellInstead = true;
    }
    if (singleTarget !== undefined) {
      submission.singleTarget = singleTarget;
    }
    if (inspectAdditionalTarget) {
      submission.inspectAdditionalTarget = true;
    }
    return submission;
  }

  private normalizePlayerId(value: string | null | undefined): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeTargetPlayers(
    value: string[] | undefined | null,
  ): string[] | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (!Array.isArray(value) || value.length === 0) {
      return [];
    }
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const entry of value) {
      if (typeof entry !== "string") {
        continue;
      }
      const trimmed = entry.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      normalized.push(trimmed);
    }
    return normalized;
  }

  private normalizeTargetItems(
    value: string[] | undefined | null,
  ): string[] | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (!Array.isArray(value) || value.length === 0) {
      return [];
    }
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const entry of value) {
      if (typeof entry !== "string") {
        continue;
      }
      const trimmed = entry.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      normalized.push(trimmed);
    }
    return normalized;
  }

  private isSameAxial(a: Axial | null, b: Axial | null): boolean {
    if (!a && !b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.q === b.q && a.r === b.r;
  }

  private isSameTargetPlayers(
    a: string[] | undefined | null,
    b: string[] | undefined | null,
  ): boolean {
    const normalize = (input: string[] | undefined | null) => {
      if (!input || input.length === 0) {
        return [] as string[];
      }
      return input
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .sort();
    };
    const aNorm = normalize(a);
    const bNorm = normalize(b);
    if (aNorm.length !== bNorm.length) {
      return false;
    }
    for (let i = 0; i < aNorm.length; i += 1) {
      if (aNorm[i] !== bNorm[i]) {
        return false;
      }
    }
    return true;
  }

  private isSameTargetItems(
    a: string[] | undefined | null,
    b: string[] | undefined | null,
  ): boolean {
    const normalize = (input: string[] | undefined | null) => {
      if (!input || input.length === 0) {
        return [] as string[];
      }
      const result: string[] = [];
      for (const value of input) {
        if (typeof value !== "string") {
          continue;
        }
        const trimmed = value.trim();
        if (!trimmed) {
          continue;
        }
        result.push(trimmed);
      }
      return result;
    };
    const aNormalized = normalize(a);
    const bNormalized = normalize(b);
    if (aNormalized.length !== bNormalized.length) {
      return false;
    }
    for (let index = 0; index < aNormalized.length; index += 1) {
      if (aNormalized[index] !== bNormalized[index]) {
        return false;
      }
    }
    return true;
  }
}
