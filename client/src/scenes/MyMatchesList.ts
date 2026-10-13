import Phaser from "phaser";
import { TurnService } from "../services/turnService";
import { t } from "../services/i18n";
import { makeButton, type UIButton } from "../ui/button";
import { THEME } from "../ui/ColorPalette";
import {
  createMatchCardScrollPanel,
  MatchCardList,
  type MatchCardScrollPanel
} from "../ui/MatchCardList";
import { isPointerTap } from "../ui/pointerInput";
import type {
  GetRankedQueueStatusPayload,
  ListMyMatchesPayload,
  MatchCardStatus,
  MyMatchCardSummary
} from "@shared";
import {
  formatFinishedHeading,
  formatOnlineHeading,
  groupMyMatches,
  toggleSectionCollapse,
  type MyMatchesGroupResult,
  type SectionCollapseState,
  type SectionId
} from "./MyMatchesListModel";
export type MyMatchSelectHandler = (
  matchId: string,
  status: MatchCardStatus,
  match: MyMatchCardSummary
) => void;

const MY_MATCHES_LAYOUT = {
  contentWidth: 720,
  horizontalPadding: 32,
  cardGap: 10,
  sectionGap: 14,
  actionsGap: 16
};

class CollapsibleSectionHeader extends Phaser.GameObjects.Container {
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly arrowText: Phaser.GameObjects.Text;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly hitArea: Phaser.GameObjects.Zone;
  private downPointerId: number | null = null;

  constructor(scene: Phaser.Scene, onToggle: () => void) {
    super(scene, 0, 0);
    this.background = scene.add
      .rectangle(0, 0, 100, 38, THEME.colors.collapsedBackground)
      .setOrigin(0)
      .setStrokeStyle(1, THEME.colors.collapsedBorder, 1);
    this.add(this.background);

    this.arrowText = scene.add
      .text(12, 19, "▼", {
        color: THEME.colors.zarkanGold,
        fontSize: "14px"
      })
      .setOrigin(0, 0.5);
    this.add(this.arrowText);

    this.titleText = scene.add
      .text(32, 19, "", {
        color: THEME.colors.textPrimary,
        fontSize: "15px",
        fontStyle: "bold"
      })
      .setOrigin(0, 0.5);
    this.add(this.titleText);

    this.hitArea = scene.add
      .zone(0, 0, 100, 38)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    this.hitArea.on(
      Phaser.Input.Events.POINTER_DOWN,
      (pointer: Phaser.Input.Pointer) => {
        this.downPointerId = pointer.id;
      }
    );
    this.hitArea.on(
      Phaser.Input.Events.POINTER_UP,
      (pointer: Phaser.Input.Pointer) => {
        if (
          this.downPointerId === pointer.id &&
          isPointerTap(pointer)
        ) {
          onToggle();
        }
        this.downPointerId = null;
      }
    );
    this.hitArea.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.background.setAlpha(0.8);
    });
    this.hitArea.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.downPointerId = null;
      this.background.setAlpha(1);
    });
    this.add(this.hitArea);
  }

  updateHeader(width: number, label: string, collapsed: boolean): void {
    this.setSize(width, 38);
    this.background.setSize(width, 38);
    this.hitArea.setSize(width, 38);
    this.hitArea.input?.hitArea.setTo(0, 0, width, 38);
    this.arrowText.setText(collapsed ? "▶" : "▼");
    this.titleText.setText(label);
  }
}

export class MyMatchesListView {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly contentRoot: Phaser.GameObjects.Container;
  private readonly scrollPanel?: MatchCardScrollPanel;

  private readonly titleText: Phaser.GameObjects.Text;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly queueStatusText: Phaser.GameObjects.Text;
  private readonly refreshButton: UIButton;
  private readonly backButton: UIButton;

  private readonly onlineHeader: CollapsibleSectionHeader;
  private readonly onlineEmptyText: Phaser.GameObjects.Text;
  private readonly finishedHeader: CollapsibleSectionHeader;
  private readonly finishedEmptyText: Phaser.GameObjects.Text;

  private readonly onlineCardList: MatchCardList<MyMatchCardSummary>;
  private readonly finishedCardList: MatchCardList<MyMatchCardSummary>;
  private onlineMatches: MyMatchCardSummary[] = [];
  private finishedMatches: MyMatchCardSummary[] = [];
  private maxCurrentMatches = 10;

  private collapseState: SectionCollapseState = {
    onlineCollapsed: false,
    finishedCollapsed: false
  };

  private fetching = false;
  private turnService: TurnService | null = null;
  private onSelectMatch?: MyMatchSelectHandler;
  private onLeave?: (matchId: string) => void | Promise<void>;
  private onView?: (matchId: string) => void | Promise<void>;
  private onReport?: (matchId: string) => void | Promise<void>;
  private onBack?: () => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add
      .container(0, 0)
      .setVisible(false)
      .setActive(false);

    this.contentRoot = scene.add.container(0, 0);

    const rexUi = (scene as unknown as { rexUI?: unknown }).rexUI;

    if (rexUi) {
      this.scrollPanel = createMatchCardScrollPanel(scene, this.contentRoot);
      this.scrollPanel.setOrigin?.(0, 0);
      this.scrollPanel.setVisible?.(false);
      this.scrollPanel.setActive?.(false);
      this.container.add(this.scrollPanel);
    } else {
      this.container.add(this.contentRoot);
    }

    this.titleText = scene.add
      .text(0, 0, t("My Matches"), {
        color: THEME.colors.textPrimary,
        fontSize: "28px",
        fontStyle: "bold"
      })
      .setOrigin(0.5, 0);
    this.contentRoot.add(this.titleText);

    this.statusText = scene.add
      .text(0, 0, t("Fetching..."), {
        color: THEME.colors.textMuted,
        fontSize: "15px",
        align: "center"
      })
      .setOrigin(0.5, 0);
    this.contentRoot.add(this.statusText);

    this.queueStatusText = scene.add
      .text(0, 0, t("Fetching ranked queue status..."), {
        color: THEME.colors.textMuted,
        fontSize: "13px",
        align: "center"
      })
      .setOrigin(0.5, 0);
    this.contentRoot.add(this.queueStatusText);

    this.refreshButton = makeButton(
      scene,
      0,
      0,
      t("Refresh"),
      () => this.refresh(),
      ["myMatchList"]
    ).setOrigin(0.5, 0);
    this.contentRoot.add(this.refreshButton);

    this.backButton = makeButton(
      scene,
      0,
      0,
      t("Back"),
      () => {
        if (this.onBack) {
          this.onBack();
        } else {
          this.hide();
        }
      },
      ["myMatchList"]
    ).setOrigin(0.5, 0);
    this.contentRoot.add(this.backButton);

    this.onlineHeader = new CollapsibleSectionHeader(scene, () => {
      this.toggleSection("online");
    });
    this.contentRoot.add(this.onlineHeader);

    this.onlineEmptyText = scene.add
      .text(0, 0, t("No online matches"), {
        color: THEME.colors.textMuted,
        fontSize: "14px",
        align: "center"
      })
      .setOrigin(0.5, 0)
      .setVisible(false);
    this.contentRoot.add(this.onlineEmptyText);

    this.finishedHeader = new CollapsibleSectionHeader(scene, () => {
      this.toggleSection("finished");
    });
    this.contentRoot.add(this.finishedHeader);

    this.finishedEmptyText = scene.add
      .text(0, 0, t("No finished matches"), {
        color: THEME.colors.textMuted,
        fontSize: "14px",
        align: "center"
      })
      .setOrigin(0.5, 0)
      .setVisible(false);
    this.contentRoot.add(this.finishedEmptyText);

    this.onlineCardList = new MatchCardList(scene, true, (match) => {
      this.handleCardSelect(match);
    });
    this.finishedCardList = new MatchCardList(scene, true, (match) => {
      this.handleCardSelect(match);
    });
    this.contentRoot.add([this.onlineCardList, this.finishedCardList]);

    this.layoutMyMatches();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layoutMyMatches, this);
    scene.events.on(Phaser.Scenes.Events.WAKE, this.layoutMyMatches, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.layoutMyMatches, this);
      scene.events.off(Phaser.Scenes.Events.WAKE, this.layoutMyMatches, this);
    });
  }

  setTurnService(service: TurnService | null): void {
    this.turnService = service;
  }

  setOnSelectMatch(handler: MyMatchSelectHandler): void {
    this.onSelectMatch = handler;
  }

  setOnLeave(handler: (matchId: string) => void | Promise<void>): void {
    this.onLeave = handler;
  }

  setOnView(handler: (matchId: string) => void | Promise<void>): void {
    this.onView = handler;
  }

  setOnReport(handler: (matchId: string) => void | Promise<void>): void {
    this.onReport = handler;
  }

  setOnBack(handler: () => void): void {
    this.onBack = handler;
  }

  show(): void {
    this.container.setVisible(true).setActive(true);
    this.scrollPanel?.setVisible?.(true);
    this.scrollPanel?.setActive?.(true);
    this.layoutMyMatches();
    void this.refresh();
  }

  hide(): void {
    this.container.setVisible(false).setActive(false);
    this.scrollPanel?.setVisible?.(false);
    this.scrollPanel?.setActive?.(false);
  }

  async refresh(): Promise<void> {
    if (this.fetching || !this.turnService) {
      return;
    }
    this.fetching = true;
    this.statusText.setText(t("Fetching my matches..."));
    this.queueStatusText.setText(t("Fetching ranked queue status..."));
    this.layoutMyMatches();

    try {
      const [res, queueStatus] = await Promise.all([
        this.turnService.listMyMatches(),
        this.turnService.getRankedQueueStatus().catch((error: unknown) => {
          console.warn("Failed to load ranked queue status:", error);
          return { ok: false, error: "status_unavailable" } as GetRankedQueueStatusPayload;
        })
      ]);
      this.renderRankedQueueStatus(queueStatus);

      let payload: ListMyMatchesPayload;
      if (typeof res.payload === "string") {
        payload = JSON.parse(res.payload) as ListMyMatchesPayload;
      } else {
        payload = (res.payload || {}) as ListMyMatchesPayload;
      }

      if (payload.error) {
        this.statusText.setText(`Error: ${payload.error}`);
        this.clearCards();
        this.layoutMyMatches();
        return;
      }

      const matches = payload.matches || [];
      if (!matches.length) {
        this.statusText.setText(t("You haven't joined any matches yet."));
        this.clearCards();
        this.layoutMyMatches();
        return;
      }

      this.statusText.setText("");
      const grouped = groupMyMatches(matches, payload.maxCurrentMatches);
      this.applyGroupedMatches(grouped);
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : String(error);
      this.statusText.setText(`Error: ${msg}`);
      this.clearCards();
      this.layoutMyMatches();
    } finally {
      this.fetching = false;
    }
  }

  private renderRankedQueueStatus(status: GetRankedQueueStatusPayload): void {
    if (
      status.ok !== true ||
      typeof status.desired_slots !== "number" ||
      typeof status.queued_tickets !== "number" ||
      !Array.isArray(status.assigned_matches)
    ) {
      this.queueStatusText.setText(t("Ranked queue status unavailable."));
      return;
    }
    const starting = status.assigned_matches.filter(
      (assignment) => assignment.status === "starting"
    ).length;
    const running = status.assigned_matches.filter(
      (assignment) => assignment.status === "running"
    ).length;
    this.queueStatusText.setText(
      `${t("Random games")}: ${t("Desired")} ${status.desired_slots} | ${t("Queued")} ${status.queued_tickets} | ${t("Starting")} ${starting} | ${t("Running")} ${running}`
    );
  }

  private applyGroupedMatches(grouped: MyMatchesGroupResult): void {
    this.onlineMatches = grouped.onlineMatches;
    this.finishedMatches = grouped.finishedMatches;
    this.maxCurrentMatches = grouped.maxCurrentMatches;
    this.rebuildCards();
    this.layoutMyMatches();
  }

  private toggleSection(section: SectionId): void {
    this.collapseState = toggleSectionCollapse(this.collapseState, section);
    this.layoutMyMatches();
  }

  private clearCards(): void {
    this.onlineMatches = [];
    this.finishedMatches = [];
    this.onlineCardList.setMatches([]);
    this.finishedCardList.setMatches([]);
  }

  private rebuildCards(): void {
    this.onlineCardList.setMatches(this.onlineMatches);
    this.finishedCardList.setMatches(this.finishedMatches);
  }

  private handleCardSelect(match: MyMatchCardSummary): void {
    this.onSelectMatch?.(match.match_id, match.status, match);
  }

  private layoutMyMatches(): void {
    const viewportWidth = this.scene.scale.width;
    const viewportHeight = this.scene.scale.height;
    const contentWidth = Math.min(
      MY_MATCHES_LAYOUT.contentWidth,
      Math.max(300, viewportWidth - MY_MATCHES_LAYOUT.horizontalPadding)
    );
    const contentLeft = (viewportWidth - contentWidth) / 2;
    const centerX = viewportWidth / 2;

    this.onlineCardList.layout(viewportWidth);
    this.finishedCardList.layout(viewportWidth);

    let cursorY = 24;

    this.titleText.setPosition(centerX, cursorY);
    cursorY += this.titleText.height + 6;

    if (this.statusText.text.length > 0) {
      this.statusText.setVisible(true);
      this.statusText.setWordWrapWidth(contentWidth, true);
      this.statusText.setPosition(centerX, cursorY);
      cursorY += this.statusText.height + 6;
    } else {
      this.statusText.setVisible(false);
    }

    this.queueStatusText.setWordWrapWidth(contentWidth, true);
    this.queueStatusText.setPosition(centerX, cursorY);
    cursorY += this.queueStatusText.height + 12;

    const refreshWidth = this.refreshButton.width;
    const backWidth = this.backButton.width;
    const totalActionsWidth =
      refreshWidth + MY_MATCHES_LAYOUT.actionsGap + backWidth;
    this.refreshButton.setPosition(
      centerX - totalActionsWidth / 2 + refreshWidth / 2,
      cursorY
    );
    this.backButton.setPosition(
      centerX + totalActionsWidth / 2 - backWidth / 2,
      cursorY
    );
    cursorY += Math.max(this.refreshButton.height, this.backButton.height) + 18;

    this.onlineHeader.setPosition(contentLeft, cursorY);
    this.onlineHeader.updateHeader(
      contentWidth,
      formatOnlineHeading(this.onlineMatches.length, this.maxCurrentMatches),
      this.collapseState.onlineCollapsed
    );
    cursorY += 38 + MY_MATCHES_LAYOUT.cardGap;

    if (this.collapseState.onlineCollapsed) {
      this.onlineEmptyText.setVisible(false);
      this.onlineCardList.setItemsVisible(false);
    } else {
      if (this.onlineMatches.length === 0) {
        this.onlineCardList.setItemsVisible(false);
        this.onlineEmptyText.setVisible(true);
        this.onlineEmptyText.setPosition(centerX, cursorY + 6);
        cursorY += this.onlineEmptyText.height + 16;
      } else {
        this.onlineEmptyText.setVisible(false);
        this.onlineCardList.setItemsVisible(true);
        this.onlineCardList.setPosition(0, cursorY);
        cursorY += this.onlineCardList.height + MY_MATCHES_LAYOUT.cardGap;
      }
    }

    cursorY += MY_MATCHES_LAYOUT.sectionGap;

    this.finishedHeader.setPosition(contentLeft, cursorY);
    this.finishedHeader.updateHeader(
      contentWidth,
      formatFinishedHeading(this.finishedMatches.length),
      this.collapseState.finishedCollapsed
    );
    cursorY += 38 + MY_MATCHES_LAYOUT.cardGap;

    if (this.collapseState.finishedCollapsed) {
      this.finishedEmptyText.setVisible(false);
      this.finishedCardList.setItemsVisible(false);
    } else {
      if (this.finishedMatches.length === 0) {
        this.finishedCardList.setItemsVisible(false);
        this.finishedEmptyText.setVisible(true);
        this.finishedEmptyText.setPosition(centerX, cursorY + 6);
        cursorY += this.finishedEmptyText.height + 16;
      } else {
        this.finishedEmptyText.setVisible(false);
        this.finishedCardList.setItemsVisible(true);
        this.finishedCardList.setPosition(0, cursorY);
        cursorY += this.finishedCardList.height + MY_MATCHES_LAYOUT.cardGap;
      }
    }

    cursorY += 28;

    this.contentRoot.setSize(viewportWidth, cursorY);
    this.scrollPanel?.setPosition?.(0, 0);
    this.scrollPanel?.setSize?.(viewportWidth, viewportHeight);
    this.scrollPanel?.setMinSize?.(viewportWidth, viewportHeight);
    this.scrollPanel?.layout?.();
  }
}
