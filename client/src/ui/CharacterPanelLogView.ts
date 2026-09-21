import Phaser from "phaser";
import { t } from "../services/i18n";
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
  onElimination: (payload: {
    playerId: string;
    playerName: string;
    teamName?: string;
    turn: number;
  }) => void;
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
  private teams: Record<string, string> = {};
  private visible = false;
  private eliminationKeys = new Set<string>();

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

  setTeams(map: Record<string, string>): void {
    this.teams = { ...map };
  }

  setTurnInfo(maxTurn: number): void {
    const normalized = Math.max(0, Math.floor(maxTurn));
    const previous = this.maxTurn;
    this.maxTurn = normalized;
    if (
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
      this.selectedTurn = resolvedTurn >= 0 ? resolvedTurn : this.maxTurn;
    }
    if (this.selectedTurn !== null) {
      this.selectedTurn = Math.min(
        Math.max(0, this.selectedTurn),
        this.maxTurn
      );
    }
    this.displayedTurn = this.selectedTurn;
    this.lastRequestedTurn = this.selectedTurn;
    this.loading = false;
    this.eventStrings = this.formatReplayEvents(events);
    this.notifyEliminationEvents(resolvedTurn, events);
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

  appendReplay(
    turn: number,
    maxTurn: number,
    events: ReplayEvent[]
  ): void {
    const resolvedTurn = Math.max(0, Math.floor(turn));
    if (
      this.selectedTurn !== null &&
      this.selectedTurn !== resolvedTurn &&
      this.displayedTurn !== resolvedTurn
    ) {
      return;
    }
    this.setReplay(resolvedTurn, maxTurn, events);
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
    if (!this.visible || this.loading) {
      return;
    }
    if (this.selectedTurn === null) {
      this.selectedTurn = this.maxTurn;
    }
    if (this.selectedTurn === null) {
      return;
    }
    const next = Phaser.Math.Clamp(this.selectedTurn + delta, 0, this.maxTurn);
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
    const hasSelection = selected !== null && max >= 0;
    const canPrev =
      hasSelection && selected !== null && selected > 0 && !this.loading;
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
        if (actionId === "team_assigned") {
          const meta = event.action.metadata as
            | { teamId?: string; coverTeamId?: string }
            | undefined;
          const team = meta?.teamId;
          const cover = meta?.coverTeamId;
          if (team && cover) {
            lines.push(
              `${actor} ${t("belongs to the team")} ${team} (${t(
                "infiltrated in team"
              )} ${cover})`
            );
          } else if (team) {
            lines.push(
              `${actor} ${t("belongs to the team")} ${team}`
            );
          }
          continue;
        }
        if (actionId === "status_dead") {
          const team =
            (event.action.metadata as { teamId?: string })?.teamId ||
            this.resolvePlayerTeam(event.actorId);
          const teamSuffix = team ? ` (${t("Team")} ${team})` : "";
          lines.push(`${actor}${teamSuffix} died`);
          continue;
        }
        if (actionId === "status_unconscious") {
          lines.push(`${actor} fell unconscious`);
          continue;
        }
        if ((actionId as string) === "zarkan_income") {
          const amount =
            typeof (event.action.metadata as { zarkansReceived?: unknown })
              ?.zarkansReceived === "number"
              ? ((event.action.metadata as { zarkansReceived: number })
                  .zarkansReceived ?? 0)
              : 0;
          lines.push(`${actor} received ${amount} daily zarkans`);
          continue;
        }
        if (actionId === "buy_detective") {
          const metadata = event.action.metadata as
            | { targetPlayerId?: unknown; targetTeamId?: unknown }
            | undefined;
          const targetId =
            typeof metadata?.targetPlayerId === "string"
              ? metadata.targetPlayerId
              : event.targets?.[0]?.targetId;
          const targetTeam =
            typeof metadata?.targetTeamId === "string"
              ? metadata.targetTeamId
              : event.targets?.[0]?.metadata?.teamId;
          lines.push(
            targetId && typeof targetTeam === "string"
              ? `${actor} hired a detective and discovered ${this.resolvePlayerName(
                  targetId
                )} belongs to team ${targetTeam}`
              : `${actor} hired a detective`
          );
          continue;
        }
        if (actionId === "detective_reward") {
          const amount =
            typeof (event.action.metadata as { zarkansReceived?: unknown })
              ?.zarkansReceived === "number"
              ? ((event.action.metadata as { zarkansReceived: number })
                  .zarkansReceived ?? 0)
              : 0;
          lines.push(`${actor} received ${amount} zarkans from a detective`);
          continue;
        }
        if (actionId === "buy_security_camera_app") {
          const metadata = event.action.metadata as
            | { observedCount?: unknown; observedPlayerIds?: unknown }
            | undefined;
          const count =
            typeof metadata?.observedCount === "number"
              ? metadata.observedCount
              : 0;
          const observedNames = Array.isArray(metadata?.observedPlayerIds)
            ? metadata.observedPlayerIds
                .filter((id): id is string => typeof id === "string")
                .map((id) => this.resolvePlayerName(id))
            : [];
          lines.push(
            observedNames.length > 0
              ? `${actor} used the security camera app and saw ${observedNames.join(", ")}`
              : `${actor} used the security camera app and saw ${count} characters`
          );
          continue;
        }
        if (actionId === "buy_spy_drone") {
          const metadata = event.action.metadata as
            | { observedCount?: unknown; observedPlayerIds?: unknown; observedLocation?: unknown }
            | undefined;
          const location = readAxialMetadata(metadata?.observedLocation);
          const count =
            typeof metadata?.observedCount === "number"
              ? metadata.observedCount
              : 0;
          const observedNames = Array.isArray(metadata?.observedPlayerIds)
            ? metadata.observedPlayerIds
                .filter((id): id is string => typeof id === "string")
                .map((id) => this.resolvePlayerName(id))
            : [];
          const observedText =
            observedNames.length > 0
              ? observedNames.join(", ")
              : `${count} characters`;
          lines.push(
            location
              ? `${actor} used a spy drone at (${location.q}, ${location.r}) and saw ${observedText}`
              : `${actor} used a spy drone and saw ${observedText}`
          );
          continue;
        }
        if (actionId === "activate_cameras") {
          lines.push(`${actor} activated the cameras`);
          continue;
        }
        if (actionId === "failedAction") {
          lines.push(this.buildFailedActionLine(actor, event.action.metadata));
          continue;
        }
        const actionMetadata = event.action.metadata as
          | { testament?: unknown }
          | undefined;
        if (actionId === "give" && actionMetadata?.testament === true) {
          const target = event.targets?.[0];
          const amount =
            typeof target?.metadata?.zarkansReceived === "number"
              ? target.metadata.zarkansReceived
              : 0;
          if (target && amount > 0) {
            const recipient = this.resolvePlayerName(target.targetId);
            lines.push(
              `${recipient} received ${amount} zarkans as testamento`
            );
          }
          continue;
        }
        const definition = ActionLibrary[actionId as ActionId] ?? null;
        const actionName = definition
          ? t(definition.name)
          : t(this.options.formatActionName(actionId));
        if (actionId === "move" && event.action.targetLocation) {
          const { q, r } = event.action.targetLocation;
          lines.push(`${actor} moved to (${q}, ${r})`);
        } else {
          const extraExecutions =
            typeof (event.action.metadata as { extraExecutions?: unknown })
              ?.extraExecutions === "number"
              ? ((event.action.metadata as { extraExecutions: number })
                  .extraExecutions ?? 0)
              : 0;
          const extraLabel =
            extraExecutions > 0 ? ` (+${extraExecutions} extra)` : "";
          lines.push(`${actor} used ${actionName}${extraLabel}`);
          if (
            actionId === "axe_attack" ||
            actionId === "knife_attack" ||
            actionId === "bat_attack"
          ) {
            const totalDamage =
              typeof event.action.damageDealt === "number"
                ? event.action.damageDealt
                : 0;
            const weaponUsed = (
              event.action.metadata as { weaponUsed?: string }
            )?.weaponUsed;
            const weaponLabel =
              actionId === "axe_attack"
                ? "an axe"
                : actionId === "knife_attack"
                ? "a knife"
                : weaponUsed === "nail_bat"
                ? "a nail bat"
                : "a bat";
            if (totalDamage > 0) {
              lines.push(
                `${actor} dealt ${totalDamage} damage with ${weaponLabel}`
              );
            } else {
              lines.push(`${actor} failed to connect with ${weaponLabel}`);
            }
          } else if (actionId === "use_chemical_weapon") {
            const totalDamage =
              typeof event.action.damageDealt === "number"
                ? event.action.damageDealt
                : 0;
            if (totalDamage > 0) {
              lines.push(
                `${actor} dealt ${totalDamage} damage with a chemical weapon`
              );
            } else {
              lines.push(`${actor} hit nobody with the chemical weapon`);
            }
          } else if (actionId === "shoot_pistol") {
            const totalDamage =
              typeof event.action.damageDealt === "number"
                ? event.action.damageDealt
                : 0;
            const weaponUsed = (
              event.action.metadata as { weaponUsed?: string }
            )?.weaponUsed;
            const weaponLabel =
              weaponUsed === "suppressed_pistol"
                ? "a silenced pistol"
                : "a pistol";
            if (totalDamage > 0) {
              lines.push(
                `${actor} dealt ${totalDamage} damage with ${weaponLabel}`
              );
            } else {
              lines.push(`${actor} missed with ${weaponLabel}`);
            }
          } else if (actionId === "shoot_harpoon") {
            const totalDamage =
              typeof event.action.damageDealt === "number"
                ? event.action.damageDealt
                : 0;
            if (totalDamage > 0) {
              lines.push(
                `${actor} dealt ${totalDamage} damage with a harpoon`
              );
            } else {
              lines.push(`${actor} missed with a harpoon`);
            }
          } else if (actionId === "fire_rocket_launcher") {
            const totalDamage =
              typeof event.action.damageDealt === "number"
                ? event.action.damageDealt
                : 0;
            lines.push(
              `${actor} fired a rocket launcher${
                totalDamage > 0 ? ` and dealt ${totalDamage} damage` : ""
              }`
            );
          } else if (actionId === "inject_virus") {
            const infectionTick = (
              event.action.metadata as { infectionTick?: boolean } | undefined
            )?.infectionTick;
            if (infectionTick) {
              const damage =
                typeof event.action.damageDealt === "number"
                  ? event.action.damageDealt
                  : 0;
              const targetId = event.targets?.[0]?.targetId;
              const targetName = this.resolvePlayerName(targetId);
              lines.push(
                damage > 0
                  ? `${targetName} ${t(
                      "was affected by a virus"
                    )} and lost ${damage} health`
                  : `${targetName} ${t("was exposed to a virus")}`
              );
            } else {
              const targetId = event.targets?.[0]?.targetId;
              lines.push(
                targetId
                  ? `${actor} injected a virus into ${this.resolvePlayerName(targetId)}`
                  : `${actor} injected a virus`
              );
            }
          } else if (actionId === "search") {
            const foundItems = this.extractSearchItemNames(
              event.action.metadata
            );
            if (foundItems.length > 0) {
              lines.push(`${actor} found ${foundItems.join(", ")}`);
            } else if (this.didSearchFindNothing(event.action.metadata)) {
              lines.push(`${actor} found nothing`);
            }
          } else if (actionId === "inspect") {
            const results = this.extractInspectResults(event.action.metadata);
            if (results.length > 0) {
              for (const result of results) {
                const targetName = this.resolvePlayerName(result.targetId);
                lines.push(
                  result.itemNames.length > 0
                    ? `${actor} inspected ${targetName} and found ${result.itemNames.join(", ")}`
                    : `${actor} inspected ${targetName} and found nothing new`
                );
              }
            } else {
              const targetId =
                Array.isArray(event.targets) && event.targets.length > 0
                  ? event.targets[0].targetId
                  : (event.action.metadata as { targetPlayerId?: unknown } | undefined)
                      ?.targetPlayerId;
              if (targetId) {
                lines.push(
                  `${actor} inspected ${this.resolvePlayerName(
                    typeof targetId === "string" ? targetId : undefined
                  )} and found nothing new`
                );
              }
            }
          } else if (actionId === "detect") {
            if (Array.isArray(event.targets) && event.targets.length > 0) {
              for (const target of event.targets) {
                const targetName = this.resolvePlayerName(target.targetId);
                const distance =
                  (target.metadata as { distance?: number } | undefined)
                    ?.distance ?? -1;
                const locationLabel =
                  distance === 0
                    ? "(same location)"
                    : distance > 0
                    ? `(distance ${distance})`
                    : "(nearby)";
                lines.push(`${t("Detected")} ${targetName} ${locationLabel}`);
              }
            } else {
              lines.push(`${actor} ${t("detected nobody")}`);
            }
          } else if (actionId === "steal") {
            const stolenItems = this.extractStolenItemNames(
              event.action.metadata
            );
            const targetId = (
              event.action.metadata as { targetPlayerId?: unknown } | undefined
            )?.targetPlayerId;
            const targetName =
              typeof targetId === "string"
                ? this.resolvePlayerName(targetId)
                : "the target";
            lines.push(
              stolenItems.length > 0
                ? `${actor} stole ${stolenItems.join(", ")} from ${targetName}`
                : `${actor} stole nothing from ${targetName}`
            );
          } else if (actionId === "pick_up") {
            const pickedItems = this.extractPickedItemNames(
              event.action.metadata
            );
            if (pickedItems.length > 0) {
              lines.push(`${actor} picked up ${pickedItems.join(", ")}`);
            }
          } else if (actionId === "black_market_trade") {
            const meta = event.action.metadata as
              | { soldItems?: unknown; zarkansEarned?: unknown }
              | undefined;
            const soldItems = this.extractSoldItemNames(event.action.metadata);
            const zarkans =
              typeof meta?.zarkansEarned === "number"
                ? meta.zarkansEarned
                : 0;
            lines.push(
              soldItems.length > 0
                ? `${actor} sold ${soldItems.join(", ")} at the black market for ${zarkans} zarkans`
                : `${actor} sold nothing at the black market`
            );
          } else if (actionId === "drop") {
            const meta = event.action.metadata as
              | {
                  droppedItems?: unknown;
                  sellInstead?: unknown;
                  zarkansEarned?: unknown;
                }
              | undefined;
            const droppedItems = this.extractDroppedItemNames(
              event.action.metadata
            );
            if (droppedItems.length > 0) {
              if (meta?.sellInstead === true) {
                const zarkans =
                  typeof meta.zarkansEarned === "number"
                    ? meta.zarkansEarned
                    : 0;
                lines.push(
                  `${actor} sold ${droppedItems.join(", ")} for ${zarkans} zarkans`
                );
              } else {
                lines.push(`${actor} dropped ${droppedItems.join(", ")}`);
              }
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
                  energyRestored?: unknown;
                };
            const movedTo = readAxialMetadata(metadata?.movedTo);
            const energyLost =
              typeof metadata?.energyLost === "number"
                ? metadata.energyLost
                : null;
            const energyRestored =
              typeof metadata?.energyRestored === "number"
                ? metadata.energyRestored
                : null;
            if (healed && healed > 0) {
              lines.push(`${targetName} ${t("recovered")} ${healed} health`);
              continue;
            }
            if (energyRestored && energyRestored > 0) {
              lines.push(
                `${targetName} ${t("recovered")} ${energyRestored} ${t(
                  "energy"
                )}`
              );
              continue;
            }
            if (
              typeof target.damageTaken === "number" &&
              target.damageTaken >= 0
            ) {
              lines.push(`${targetName} took ${target.damageTaken} damage`);
              if (target.eliminated) {
                const team =
                  (target.metadata as { teamId?: string })?.teamId ||
                  this.resolvePlayerTeam(target.targetId);
                const teamSuffix = team ? ` (${t("Team")} ${team})` : "";
                lines.push(`${targetName}${teamSuffix} was eliminated`);
              }
            } else if (target.eliminated) {
              const team =
                (target.metadata as { teamId?: string })?.teamId ||
                this.resolvePlayerTeam(target.targetId);
              const teamSuffix = team ? ` (${t("Team")} ${team})` : "";
              lines.push(`${targetName}${teamSuffix} was eliminated`);
            } else if (movedTo) {
              lines.push(`${targetName} fled to (${movedTo.q}, ${movedTo.r})`);
              if (energyLost && energyLost > 0) {
                lines.push(
                  `${targetName} ${t("lost")} ${energyLost} ${t("energy")}`
                );
              }
            } else {
              lines.push(`${targetName} ${t("was affected")}`);
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

  private notifyEliminationEvents(turn: number, events: ReplayEvent[]): void {
    if (typeof this.options.onElimination !== "function") {
      return;
    }
    if (!Array.isArray(events) || events.length === 0) {
      return;
    }
    for (const event of events) {
      if (event.kind !== "player" || event.action.actionId !== "status_dead") {
        continue;
      }
      const actorId = event.actorId;
      if (typeof actorId !== "string" || actorId.length === 0) {
        continue;
      }
      const key = `${turn}:${actorId}`;
      if (this.eliminationKeys.has(key)) {
        continue;
      }
      this.eliminationKeys.add(key);
      const playerName = this.resolvePlayerName(actorId);
      const teamName =
        (event.action.metadata as { teamId?: string })?.teamId ||
        this.resolvePlayerTeam(actorId) ||
        undefined;
      this.options.onElimination({
        playerId: actorId,
        playerName,
        teamName,
        turn,
      });
    }
  }

  private resolvePlayerTeam(playerId: string | undefined): string | null {
    if (!playerId) {
      return null;
    }
    return this.teams[playerId] ?? null;
  }

  private buildFailedActionLine(actor: string, metadata: unknown): string {
    if (!metadata || typeof metadata !== "object") {
      return `${actor} failed to use an action`;
    }
    const container = metadata as {
      attemptedActionId?: unknown;
      missingItemId?: unknown;
    };
    const attemptedId =
      typeof container.attemptedActionId === "string"
        ? (container.attemptedActionId as ActionId)
        : null;
    const definition = attemptedId ? ActionLibrary[attemptedId] ?? null : null;
    const attemptedName = definition
      ? definition.name
      : attemptedId
      ? this.options.formatActionName(attemptedId)
      : "an action";
    const missingItemId =
      typeof container.missingItemId === "string"
        ? container.missingItemId
        : null;
    if (missingItemId) {
      const itemName = this.resolveItemName(missingItemId);
      return `${actor} failed to use ${attemptedName} (${t("Missing").toLowerCase()} ${itemName})`;
    }
    return `${actor} failed to use ${attemptedName}`;
  }

  private resolvePlayerName(playerId: string | undefined): string {
    if (!playerId) {
      return t("Unknown");
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
      return t(definition.name);
    }
    return t(itemType);
  }

  private extractInspectResults(
    metadata: unknown
  ): Array<{ targetId: string; itemNames: string[] }> {
    if (!metadata || typeof metadata !== "object") {
      return [];
    }
    const entries = (metadata as { revealedItemsByTarget?: unknown })
      .revealedItemsByTarget;
    if (!Array.isArray(entries)) {
      return [];
    }
    const results: Array<{ targetId: string; itemNames: string[] }> = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const record = entry as { targetId?: unknown; itemTypes?: unknown };
      if (typeof record.targetId !== "string") {
        continue;
      }
      const itemNames = Array.isArray(record.itemTypes)
        ? record.itemTypes
            .filter((itemType): itemType is string =>
              typeof itemType === "string"
            )
            .map((itemType) => this.resolveItemName(itemType))
        : [];
      results.push({ targetId: record.targetId, itemNames });
    }
    return results;
  }

  private extractStolenItemNames(metadata: unknown): string[] {
    if (!metadata || typeof metadata !== "object") {
      return [];
    }
    const entries = (metadata as { stolenItems?: unknown }).stolenItems;
    if (!Array.isArray(entries)) {
      return [];
    }
    const result: string[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const itemType = (entry as { itemType?: unknown }).itemType;
      if (typeof itemType === "string") {
        result.push(this.resolveItemName(itemType));
      }
    }
    return result;
  }

  private extractPickedItemNames(metadata: unknown): string[] {
    if (!metadata || typeof metadata !== "object") {
      return [];
    }
    const container = metadata as {
      pickedItems?: unknown;
      pickedItemIds?: unknown;
    };
    const result: string[] = [];
    if (Array.isArray(container.pickedItems)) {
      for (const entry of container.pickedItems) {
        if (!entry || typeof entry !== "object") {
          continue;
        }
        const record = entry as { itemType?: unknown };
        if (typeof record.itemType !== "string") {
          continue;
        }
        const name = this.resolveItemName(record.itemType);
        result.push(name);
      }
    }
    if (result.length === 0 && Array.isArray(container.pickedItemIds)) {
      for (const entry of container.pickedItemIds) {
        if (typeof entry !== "string") {
          continue;
        }
        const name = this.resolveItemName(entry);
        result.push(name);
      }
    }
    return result;
  }

  private extractSoldItemNames(metadata: unknown): string[] {
    if (!metadata || typeof metadata !== "object") {
      return [];
    }
    const entries = (metadata as { soldItems?: unknown }).soldItems;
    if (!Array.isArray(entries)) {
      return [];
    }
    const result: string[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const itemType = (entry as { itemType?: unknown }).itemType;
      if (typeof itemType === "string") {
        result.push(this.resolveItemName(itemType));
      }
    }
    return result;
  }

  private extractDroppedItemNames(metadata: unknown): string[] {
    if (!metadata || typeof metadata !== "object") {
      return [];
    }
    const container = metadata as {
      droppedItems?: unknown;
    };
    const result: string[] = [];
    if (Array.isArray(container.droppedItems)) {
      for (const entry of container.droppedItems) {
        if (!entry || typeof entry !== "object") {
          continue;
        }
        const record = entry as { itemType?: unknown };
        if (typeof record.itemType !== "string") {
          continue;
        }
        const name = this.resolveItemName(record.itemType);
        result.push(name);
      }
    }
    return result;
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
