import Phaser from "phaser";
import {
  ActionLibrary,
  ItemLibrary,
  type ActionId,
  type Axial,
  type ReplayEvent,
} from "@shared";

function readAxialMetadata(value: unknown): Axial | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as { q?: unknown; r?: unknown };
  if (typeof candidate.q !== "number" || typeof candidate.r !== "number") {
    return null;
  }
  return { q: candidate.q, r: candidate.r };
}

export interface CharacterPanelLogElements {
  prevButton: Phaser.GameObjects.Text;
  nextButton: Phaser.GameObjects.Text;
  playButton: Phaser.GameObjects.Text;
  turnLabel: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  eventsBox: Phaser.GameObjects.Rectangle;
  eventsText: Phaser.GameObjects.Text;
}

interface CharacterPanelLogViewOptions {
  panel: Phaser.Events.EventEmitter;
  elements: CharacterPanelLogElements;
  onRequestReplay: (turn: number) => void;
  onPlay: (turn: number) => void;
  formatActionName: (id: string) => string;
}

export class CharacterPanelLogView {
  private readonly elements: CharacterPanelLogElements;
  private readonly allElements: Phaser.GameObjects.GameObject[];
  private maxTurn = 0;
  private selectedTurn: number | null = null;
  private displayedTurn: number | null = null;
  private eventStrings: string[] = [];
  private loading = false;
  private playbackActive = false;
  private lastRequestedTurn: number | null = null;
  private usernames: Record<string, string> = {};
  private visible = false;

  constructor(private readonly options: CharacterPanelLogViewOptions) {
    this.elements = options.elements;
    this.allElements = [
      options.elements.prevButton,
      options.elements.nextButton,
      options.elements.playButton,
      options.elements.turnLabel,
      options.elements.statusText,
      options.elements.eventsBox,
      options.elements.eventsText,
    ];
    this.bindInteractions();
  }

  destroy(): void {
    const { prevButton, nextButton, playButton } = this.elements;
    prevButton.off(Phaser.Input.Events.POINTER_UP, this.handlePrevClick, this);
    nextButton.off(Phaser.Input.Events.POINTER_UP, this.handleNextClick, this);
    playButton.off(Phaser.Input.Events.POINTER_UP, this.handlePlayClick, this);
  }

  setUsernames(map: Record<string, string>): void {
    this.usernames = { ...map };
  }

  setTurnInfo(maxTurn: number): void {
    const normalized = Math.max(0, Math.floor(maxTurn));
    const previous = this.maxTurn;
    this.maxTurn = normalized;
    if (normalized === 0) {
      this.selectedTurn = null;
      this.displayedTurn = null;
      this.eventStrings = [];
      this.lastRequestedTurn = null;
      this.showStatus("No replays yet.");
    } else if (
      this.selectedTurn === null ||
      this.selectedTurn > normalized ||
      (normalized > previous && this.selectedTurn === previous)
    ) {
      this.selectedTurn = normalized;
    }
    this.updateTurnLabel();
    this.updateButtons();
    if (this.visible) {
      this.ensureSelection(false);
    }
  }

  setReplay(turn: number, maxTurn: number, events: ReplayEvent[]): void {
    const resolvedTurn = Math.max(0, Math.floor(turn));
    this.maxTurn = Math.max(this.maxTurn, Math.floor(maxTurn), resolvedTurn);
    if (this.selectedTurn === null) {
      this.selectedTurn = resolvedTurn > 0 ? resolvedTurn : this.maxTurn;
    }
    if (this.selectedTurn !== null) {
      this.selectedTurn = Math.min(
        Math.max(1, this.selectedTurn),
        this.maxTurn
      );
    }
    this.displayedTurn = this.selectedTurn;
    this.lastRequestedTurn = this.selectedTurn;
    this.loading = false;
    this.eventStrings = this.formatReplayEvents(events);
    if (this.eventStrings.length > 0) {
      this.elements.eventsText.setText(this.eventStrings.join("\n"));
      this.elements.statusText.setVisible(false);
      this.elements.statusText.setText("");
      if (this.visible) {
        this.elements.eventsText.setVisible(true);
      }
    } else {
      this.showStatus("No events recorded.");
    }
    this.updateTurnLabel();
    this.updateButtons();
    this.refreshDisplay();
  }

  setError(message: string): void {
    this.loading = false;
    this.displayedTurn = null;
    this.eventStrings = [];
    this.showStatus(message || "Replay not available.");
    this.updateTurnLabel();
    this.updateButtons();
  }

  setLoading(active: boolean): void {
    this.loading = active;
    if (active) {
      this.showStatus("Loading...");
    }
    this.updateButtons();
    this.refreshDisplay();
  }

  setPlaybackState(active: boolean): void {
    this.playbackActive = active;
    this.updateButtons();
  }

  handleVisibilityChange(options: {
    visible: boolean;
    forceEnsure: boolean;
  }): void {
    this.visible = options.visible;
    for (const obj of this.allElements) {
      (
        obj as Phaser.GameObjects.GameObject & {
          setVisible?: (value: boolean) => void;
        }
      ).setVisible?.(options.visible);
    }
    if (options.visible) {
      this.updateButtons();
      this.refreshDisplay();
      this.ensureSelection(options.forceEnsure);
    } else {
      this.elements.prevButton.disableInteractive();
      this.elements.nextButton.disableInteractive();
      this.elements.playButton.disableInteractive();
    }
  }

  ensureSelection(force = false): void {
    if (this.maxTurn === 0) {
      this.selectedTurn = null;
      this.displayedTurn = null;
      this.eventStrings = [];
      this.updateButtons();
      this.refreshDisplay();
      return;
    }
    if (this.selectedTurn === null || this.selectedTurn > this.maxTurn) {
      this.selectedTurn = this.maxTurn;
    }
    this.updateTurnLabel();
    const shouldRequest =
      this.selectedTurn !== null &&
      (force || this.lastRequestedTurn !== this.selectedTurn);
    if (shouldRequest) {
      this.emitReplayRequest(true);
    }
  }

  layout(bounds: {
    margin: number;
    tabHeight: number;
    contentTop: number;
    boxWidth: number;
    panelHeight: number;
  }): void {
    const { margin, contentTop, boxWidth, panelHeight } = bounds;
    const controlY = contentTop;
    const baseX = margin + 12;
    this.elements.prevButton.setPosition(baseX, controlY);
    this.elements.turnLabel.setPosition(
      this.elements.prevButton.x + this.elements.prevButton.width + 16,
      controlY + 2
    );
    this.elements.nextButton.setPosition(
      this.elements.turnLabel.x + this.elements.turnLabel.width + 16,
      controlY
    );
    this.elements.playButton.setPosition(
      this.elements.nextButton.x + this.elements.nextButton.width + 24,
      controlY + 2
    );
    const logBoxY = contentTop + 48;
    const logBoxHeight = Math.max(180, panelHeight - logBoxY - margin);
    this.elements.eventsBox.setPosition(margin, logBoxY);
    this.elements.eventsBox.setSize(boxWidth, logBoxHeight);
    this.elements.eventsBox.setDisplaySize(boxWidth, logBoxHeight);
    this.elements.statusText.setPosition(margin + 16, logBoxY + 16);
    this.elements.eventsText.setPosition(margin + 16, logBoxY + 16);
    this.elements.eventsText.setWordWrapWidth(boxWidth - 32);
  }

  getElements(): Phaser.GameObjects.GameObject[] {
    return this.allElements;
  }

  getSelectedTurn(): number | null {
    return this.selectedTurn;
  }

  private bindInteractions(): void {
    const { prevButton, nextButton, playButton } = this.elements;
    prevButton.on(Phaser.Input.Events.POINTER_UP, this.handlePrevClick, this);
    nextButton.on(Phaser.Input.Events.POINTER_UP, this.handleNextClick, this);
    playButton.on(Phaser.Input.Events.POINTER_UP, this.handlePlayClick, this);
  }

  private handlePrevClick = () => {
    this.navigate(-1);
  };

  private handleNextClick = () => {
    this.navigate(1);
  };

  private handlePlayClick = () => {
    if (
      !this.visible ||
      this.selectedTurn === null ||
      this.loading ||
      this.playbackActive ||
      this.eventStrings.length === 0 ||
      this.displayedTurn !== this.selectedTurn
    ) {
      return;
    }
    this.options.onPlay(this.selectedTurn);
  };

  private navigate(delta: number): void {
    if (!this.visible || this.loading || this.maxTurn === 0) {
      return;
    }
    if (this.selectedTurn === null) {
      this.selectedTurn = this.maxTurn;
    }
    if (this.selectedTurn === null) {
      return;
    }
    const next = Phaser.Math.Clamp(this.selectedTurn + delta, 1, this.maxTurn);
    if (next === this.selectedTurn) {
      return;
    }
    this.selectedTurn = next;
    this.displayedTurn = null;
    this.eventStrings = [];
    this.updateTurnLabel();
    this.updateButtons();
    this.emitReplayRequest(true);
  }

  private emitReplayRequest(force = false): void {
    if (this.selectedTurn === null) {
      return;
    }
    if (!force && this.lastRequestedTurn === this.selectedTurn) {
      return;
    }
    this.lastRequestedTurn = this.selectedTurn;
    if (this.visible) {
      this.setLoading(true);
    }
    this.options.onRequestReplay(this.selectedTurn);
  }

  private updateButtons(): void {
    if (!this.visible) {
      return;
    }
    const selected = this.selectedTurn;
    const max = this.maxTurn;
    const hasSelection = selected !== null && max > 0;
    const canPrev =
      hasSelection && selected !== null && selected > 1 && !this.loading;
    const canNext =
      hasSelection && selected !== null && selected < max && !this.loading;
    const canPlay =
      hasSelection &&
      !this.loading &&
      !this.playbackActive &&
      this.displayedTurn === selected &&
      this.eventStrings.length > 0;
    this.applyButtonState(this.elements.prevButton, canPrev, false);
    this.applyButtonState(this.elements.nextButton, canNext, false);
    this.applyButtonState(this.elements.playButton, canPlay, true);
  }

  private applyButtonState(
    button: Phaser.GameObjects.Text,
    enabled: boolean,
    isPlay: boolean
  ): void {
    if (!enabled) {
      button.setAlpha(0.4);
      button.setColor(isPlay ? "#355e3b" : "#5b678a");
      button.disableInteractive();
      return;
    }
    button.setAlpha(1);
    button.setColor(isPlay ? "#4ade80" : "#a0b7ff");
    button.setInteractive({ useHandCursor: true });
  }

  private updateTurnLabel(): void {
    const current = this.selectedTurn ?? 0;
    this.elements.turnLabel.setText(`Turn ${current} / ${this.maxTurn}`);
  }

  private showStatus(message: string): void {
    this.elements.statusText.setText(message);
    this.elements.statusText.setVisible(
      this.visible && message.trim().length > 0
    );
    this.elements.eventsText.setVisible(false);
  }

  private refreshDisplay(): void {
    if (!this.visible) {
      this.elements.statusText.setVisible(false);
      this.elements.eventsText.setVisible(false);
      return;
    }
    if (this.loading) {
      this.elements.statusText.setVisible(true);
      this.elements.eventsText.setVisible(false);
      return;
    }
    if (this.eventStrings.length > 0) {
      this.elements.eventsText.setVisible(true);
      this.elements.statusText.setVisible(false);
    } else {
      const text = this.elements.statusText.text.trim();
      this.elements.statusText.setVisible(text.length > 0);
      this.elements.eventsText.setVisible(false);
    }
  }

  private formatReplayEvents(events: ReplayEvent[]): string[] {
    if (!Array.isArray(events) || events.length === 0) {
      return [];
    }
    const lines: string[] = [];
    for (const event of events) {
      if (event.kind === "player") {
        const actor = this.resolvePlayerName(event.actorId);
        const actionId = event.action.actionId;
        if (actionId === "status_unconscious") {
          lines.push(`${actor} fell unconscious`);
          continue;
        }
        const definition = ActionLibrary[actionId as ActionId] ?? null;
        const actionName = definition
          ? definition.name
          : this.options.formatActionName(actionId);
        if (actionId === "move" && event.action.targetLocation) {
          const { q, r } = event.action.targetLocation;
          lines.push(`${actor} moved to (${q}, ${r})`);
        } else {
          lines.push(`${actor} used ${actionName}`);
          if (actionId === "search") {
            const foundItems = this.extractSearchItemNames(
              event.action.metadata
            );
            if (foundItems.length > 0) {
              lines.push(`${actor} found ${foundItems.join(", ")}`);
            } else if (this.didSearchFindNothing(event.action.metadata)) {
              lines.push(`${actor} found nothing`);
            }
          }
        }
        if (Array.isArray(event.targets)) {
          for (const target of event.targets) {
            const targetName = this.resolvePlayerName(target.targetId);
            const healed =
              typeof target?.metadata?.healed === "number"
                ? target.metadata.healed
                : null;
            const metadata = target.metadata as
              | undefined
              | {
                  movedTo?: unknown;
                  movedFrom?: unknown;
                  energyLost?: unknown;
                };
            const movedTo = readAxialMetadata(metadata?.movedTo);
            const energyLost =
              typeof metadata?.energyLost === "number"
                ? metadata.energyLost
                : null;
            if (healed && healed > 0) {
              lines.push(`${targetName} recovered ${healed} health`);
              continue;
            }
            if (
              typeof target.damageTaken === "number" &&
              target.damageTaken > 0
            ) {
              lines.push(`${targetName} took ${target.damageTaken} damage`);
            } else if (target.eliminated) {
              lines.push(`${targetName} was eliminated`);
            } else if (movedTo) {
              lines.push(`${targetName} fled to (${movedTo.q}, ${movedTo.r})`);
              if (energyLost && energyLost > 0) {
                lines.push(`${targetName} lost ${energyLost} energy`);
              }
            } else {
              lines.push(`${targetName} was affected`);
            }
          }
        }
      } else if (event.kind === "map") {
        const { q, r } = event.cell;
        let description = "changed";
        if (event.action === "destroyed") {
          description = "was destroyed";
        } else if (event.action === "gas") {
          description = "filled with gas";
        } else if (event.action === "flame") {
          description = "erupted in flames";
        }
        lines.push(`Cell (${q}, ${r}) ${description}`);
      }
    }
    return lines;
  }

  private resolvePlayerName(playerId: string | undefined): string {
    if (!playerId) {
      return "Unknown";
    }
    return this.usernames[playerId] ?? playerId;
  }

  private extractSearchItemNames(metadata: unknown): string[] {
    if (!metadata || typeof metadata !== "object") {
      return [];
    }
    const container = metadata as {
      discoveredItems?: unknown;
      discoveredItemIds?: unknown;
      foundAny?: unknown;
    };
    const seen: Record<string, true> = {};
    const result: string[] = [];
    if (Array.isArray(container.discoveredItems)) {
      for (const entry of container.discoveredItems) {
        if (!entry || typeof entry !== "object") {
          continue;
        }
        const record = entry as { itemType?: unknown };
        if (typeof record.itemType !== "string") {
          continue;
        }
        const name = this.resolveItemName(record.itemType);
        if (!seen[name]) {
          seen[name] = true;
          result.push(name);
        }
      }
    }
    if (result.length === 0 && Array.isArray(container.discoveredItemIds)) {
      for (const entry of container.discoveredItemIds) {
        if (typeof entry !== "string") {
          continue;
        }
        const name = this.resolveItemName(entry);
        if (!seen[name]) {
          seen[name] = true;
          result.push(name);
        }
      }
    }
    return result;
  }

  private resolveItemName(itemType: string): string {
    const definition = (ItemLibrary as Record<string, { name?: string }>)[
      itemType
    ];
    if (definition?.name) {
      return definition.name;
    }
    return itemType;
  }

  private didSearchFindNothing(metadata: unknown): boolean {
    if (!metadata || typeof metadata !== "object") {
      return false;
    }
    const container = metadata as {
      foundAny?: unknown;
      discoveredItems?: unknown;
      discoveredItemIds?: unknown;
    };
    if (typeof container.foundAny === "boolean") {
      return container.foundAny === false;
    }
    const hasItems = Array.isArray(container.discoveredItems)
      ? container.discoveredItems.length > 0
      : Array.isArray(container.discoveredItemIds)
      ? container.discoveredItemIds.length > 0
      : false;
    return !hasItems;
  }
}
