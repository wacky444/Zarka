import Phaser from "phaser";
import type { MatchCardSummary } from "@shared";
import { t } from "../services/i18n";
import { makeButton, type UIButton } from "../ui/button";
import {
  createMatchCardScrollPanel,
  MatchCardList,
  type MatchCardScrollPanel
} from "../ui/MatchCardList";
import type { TurnService } from "../services/turnService";
import {
  appendUniquePublicMatches,
  PUBLIC_MATCH_MAX_PAGES,
  PUBLIC_MATCH_PAGE_SIZE,
  sortPublicMatches
} from "./PublicMatchesModel";

const CONTENT_MAX_WIDTH = 720;
const HORIZONTAL_PADDING = 32;
const ACTIONS_GAP = 24;

export class MatchesListView {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly scrollPanel: MatchCardScrollPanel;
  private readonly cardList: MatchCardList<MatchCardSummary>;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly refreshButton: UIButton;
  private readonly backButton: UIButton;
  private readonly nextButton: UIButton;
  private readonly previousButton: UIButton;
  private matches: MatchCardSummary[] = [];
  private offsets: number[] = [0];
  private nextOffset: number | null = null;
  private pageIndex = 0;
  private fetching = false;
  private onSelectMatch?: (match: MatchCardSummary, joinable: boolean) => void | Promise<void>;
  private onBack?: () => void;
  private turnService: TurnService | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setVisible(false).setActive(false);
    this.cardList = new MatchCardList(scene, false, (match) => {
      void this.onSelectMatch?.(match, match.isJoinable);
    });
    this.scrollPanel = createMatchCardScrollPanel(scene, this.cardList);
    this.scrollPanel.setOrigin?.(0, 0);
    this.scrollPanel.setVisible?.(false);
    this.scrollPanel.setActive?.(false);
    this.container.add(this.scrollPanel);

    this.titleText = scene.add.text(0, 0, t("Matches"), {
      color: "#ffffff",
      fontSize: "28px",
      fontStyle: "bold"
    }).setOrigin(0.5);
    this.statusText = scene.add.text(0, 0, t("Fetching..."), {
      color: "#cccccc",
      fontSize: "16px",
      align: "center"
    }).setOrigin(0.5);
    this.refreshButton = makeButton(
      scene,
      0,
      0,
      t("Refresh"),
      () => this.refresh(),
      ["matchList"]
    ).setOrigin(0.5);
    this.backButton = makeButton(
      scene,
      0,
      0,
      t("Back"),
      () => this.onBack ? this.onBack() : this.hide(),
      ["matchList"]
    ).setOrigin(0.5);
    this.previousButton = makeButton(
      scene,
      0,
      0,
      t("Previous"),
      () => this.previousPage(),
      ["matchList"]
    ).setOrigin(0.5);
    this.nextButton = makeButton(
      scene,
      0,
      0,
      t("Next"),
      () => this.nextPage(),
      ["matchList"]
    ).setOrigin(0.5);
    this.container.add([
      this.titleText,
      this.statusText,
      this.refreshButton,
      this.backButton,
      this.previousButton,
      this.nextButton
    ]);

    this.updatePager();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layoutMatches, this);
    scene.events.on(Phaser.Scenes.Events.WAKE, this.layoutMatches, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.layoutMatches, this);
      scene.events.off(Phaser.Scenes.Events.WAKE, this.layoutMatches, this);
    });
  }

  setTurnService(service: TurnService | null): void {
    this.turnService = service;
  }

  setOnSelectMatch(
    handler: (match: MatchCardSummary, joinable: boolean) => void | Promise<void>
  ): void {
    this.onSelectMatch = handler;
  }

  setOnBack(handler: () => void): void {
    this.onBack = handler;
  }

  show(): void {
    this.container.setVisible(true).setActive(true);
    this.scrollPanel.setVisible?.(true);
    this.scrollPanel.setActive?.(true);
    this.layoutMatches();
    void this.refresh();
  }

  hide(): void {
    this.container.setVisible(false).setActive(false);
    this.scrollPanel.setVisible?.(false);
    this.scrollPanel.setActive?.(false);
  }

  async refresh(): Promise<void> {
    if (this.fetching || !this.turnService) return;
    this.fetching = true;
    this.matches = [];
    this.offsets = [0];
    this.pageIndex = 0;
    this.nextOffset = 0;
    this.statusText.setText(t("Fetching matches..."));
    this.renderCards();
    try {
      await this.loadPage(0, true);
    } catch (error) {
      console.error(error);
      this.statusText.setText(`${t("Error")}: ${error instanceof Error ? error.message : String(error)}`);
      this.layoutMatches();
    } finally {
      this.fetching = false;
      this.updatePager();
    }
  }

  private async loadPage(offset: number, replace: boolean): Promise<void> {
    if (!this.turnService) return;
    const response = await this.turnService.listMatchCards({ offset, limit: PUBLIC_MATCH_PAGE_SIZE });
    if (!response.ok || !Array.isArray(response.matches)) {
      throw new Error(response.error || "invalid_response");
    }
    this.nextOffset = response.nextOffset ?? null;
    this.matches = replace ? response.matches : appendUniquePublicMatches(this.matches, response.matches);
    this.statusText.setText(this.matches.length ? `${t("Found matches")}: ${this.matches.length}` : t("No matches found."));
    this.renderCards();
  }

  private async nextPage(): Promise<void> {
    if (this.fetching) return;
    const knownNext = this.offsets[this.pageIndex + 1];
    const offset = knownNext ?? this.nextOffset;
    if (offset === null || offset === undefined || this.pageIndex + 1 >= PUBLIC_MATCH_MAX_PAGES) return;
    this.fetching = true;
    this.updatePager();
    try {
      if (knownNext === undefined) {
        this.offsets.push(offset);
        await this.loadPage(offset, false);
      }
      this.pageIndex++;
      this.renderCards();
    } catch (error) {
      console.error(error);
      this.statusText.setText(`${t("Error")}: ${error instanceof Error ? error.message : String(error)}`);
      this.layoutMatches();
    } finally {
      this.fetching = false;
      this.updatePager();
    }
  }

  private async previousPage(): Promise<void> {
    if (!this.fetching && this.pageIndex > 0) {
      this.pageIndex--;
      this.renderCards();
    }
  }

  private renderCards(): void {
    const ordered = sortPublicMatches(this.matches);
    const start = this.pageIndex * PUBLIC_MATCH_PAGE_SIZE;
    this.cardList.setMatches(ordered.slice(start, start + PUBLIC_MATCH_PAGE_SIZE));
    this.scrollPanel.scrollToTop?.();
    this.layoutMatches();
    this.updatePager();
  }

  private updatePager(): void {
    const showPrevious = !this.fetching && this.pageIndex > 0;
    const showNext =
      !this.fetching &&
      this.matches.length > 0 &&
      this.nextOffset !== null &&
      this.pageIndex + 1 < PUBLIC_MATCH_MAX_PAGES;
    this.previousButton.setVisible(showPrevious).setActive(showPrevious);
    this.nextButton.setVisible(showNext).setActive(showNext);
    this.layoutMatches();
  }

  private layoutMatches = (): void => {
    const viewportWidth = this.scene.scale.width;
    const viewportHeight = this.scene.scale.height;
    const contentWidth = Math.min(
      CONTENT_MAX_WIDTH,
      Math.max(300, viewportWidth - HORIZONTAL_PADDING)
    );
    const centerX = viewportWidth / 2;
    this.container.setPosition(0, 0);
    this.cardList.layout(viewportWidth);

    const titleY = 24;
    this.titleText.setPosition(centerX, titleY);
    this.statusText.setWordWrapWidth(contentWidth, true);
    const statusY = titleY + this.titleText.height / 2 + this.statusText.height / 2 + 10;
    this.statusText.setPosition(centerX, statusY);

    const actionHeight = Math.max(this.refreshButton.height, this.backButton.height);
    const actionsY = statusY + this.statusText.height / 2 + actionHeight / 2 + 14;
    const actionsWidth =
      this.refreshButton.width + ACTIONS_GAP + this.backButton.width;
    this.refreshButton.setPosition(
      centerX - actionsWidth / 2 + this.refreshButton.width / 2,
      actionsY
    );
    this.backButton.setPosition(
      centerX + actionsWidth / 2 - this.backButton.width / 2,
      actionsY
    );

    const pagerHeight = Math.max(
      this.previousButton.visible ? this.previousButton.height : 0,
      this.nextButton.visible ? this.nextButton.height : 0
    );
    const pagerY = viewportHeight - pagerHeight / 2 - 12;
    this.previousButton.setPosition(centerX - 80, pagerY);
    this.nextButton.setPosition(centerX + 80, pagerY);

    const listTop = actionsY + actionHeight / 2 + 14;
    const listBottom = pagerHeight > 0
      ? pagerY - pagerHeight / 2 - 12
      : viewportHeight - 12;
    const listHeight = Math.max(100, listBottom - listTop);
    this.scrollPanel.setPosition?.(0, listTop);
    this.scrollPanel.setSize?.(viewportWidth, listHeight);
    this.scrollPanel.setMinSize?.(viewportWidth, listHeight);
    this.scrollPanel.layout?.();
  };
}
