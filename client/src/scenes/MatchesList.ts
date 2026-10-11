import Phaser from "phaser";
import type { MatchCardSummary } from "@shared";
import { t } from "../services/i18n";
import { makeButton, type UIButton } from "../ui/button";
import { MatchCard } from "../ui/MatchCard";
import type { TurnService } from "../services/turnService";
import {
  appendUniquePublicMatches,
  PUBLIC_MATCH_MAX_PAGES,
  PUBLIC_MATCH_PAGE_SIZE,
  sortPublicMatches
} from "./PublicMatchesModel";

const CARD_GAP = 10;

export class MatchesListView {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly refreshButton: UIButton;
  private readonly backButton: UIButton;
  private readonly nextButton: UIButton;
  private readonly previousButton: UIButton;
  private cards: MatchCard[] = [];
  private matches: MatchCardSummary[] = [];
  private offsets: number[] = [0];
  private nextOffset: number | null = 0;
  private pageIndex = 0;
  private fetching = false;
  private onSelectMatch?: (match: MatchCardSummary, joinable: boolean) => void | Promise<void>;
  private onBack?: () => void;
  private turnService: TurnService | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setVisible(false).setActive(false);
    this.titleText = scene.add.text(0, 0, t("Matches"), {
      color: "#ffffff", fontSize: "28px", fontStyle: "bold"
    }).setOrigin(0.5);
    this.statusText = scene.add.text(0, 36, t("Fetching..."), {
      color: "#cccccc", fontSize: "16px"
    }).setOrigin(0.5);
    this.refreshButton = makeButton(scene, 0, 76, t("Refresh"), () => this.refresh(), ["matchList"]).setOrigin(0.5);
    this.backButton = makeButton(scene, 0, 76, t("Back"), () => this.onBack ? this.onBack() : this.hide(), ["matchList"]).setOrigin(0.5);
    this.previousButton = makeButton(scene, 0, 0, t("Previous"), () => this.previousPage(), ["matchList"]).setOrigin(0.5);
    this.nextButton = makeButton(scene, 0, 0, t("Next"), () => this.nextPage(), ["matchList"]).setOrigin(0.5);
    this.container.add([this.titleText, this.statusText, this.refreshButton, this.backButton, this.previousButton, this.nextButton]);
    this.layoutMatches();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layoutMatches, this);
    scene.events.on(Phaser.Scenes.Events.WAKE, this.layoutMatches, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.layoutMatches, this);
      scene.events.off(Phaser.Scenes.Events.WAKE, this.layoutMatches, this);
    });
  }

  setTurnService(service: TurnService | null): void { this.turnService = service; }
  setOnSelectMatch(handler: (match: MatchCardSummary, joinable: boolean) => void | Promise<void>): void { this.onSelectMatch = handler; }
  setOnBack(handler: () => void): void { this.onBack = handler; }

  show(): void {
    this.container.setVisible(true).setActive(true);
    this.layoutMatches();
    void this.refresh();
  }

  hide(): void { this.container.setVisible(false).setActive(false); }

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
    } finally { this.fetching = false; this.updatePager(); }
  }

  private async previousPage(): Promise<void> {
    if (this.pageIndex > 0) { this.pageIndex--; this.renderCards(); this.updatePager(); }
  }

  private renderCards(): void {
    this.cards.forEach((card) => card.destroy(true));
    this.cards = [];
    const ordered = sortPublicMatches(this.matches);
    const start = this.pageIndex * PUBLIC_MATCH_PAGE_SIZE;
    const currentPage = ordered.slice(start, start + PUBLIC_MATCH_PAGE_SIZE);
    const width = Math.min(720, Math.max(300, this.scene.scale.width - 32));
    currentPage.forEach((match, index) => {
      const card = new MatchCard(this.scene, -width / 2, 120 + index * (124 + CARD_GAP), width, match, {
        isMyMatch: false,
        onSelect: (selected) => { void this.onSelectMatch?.(selected, selected.isJoinable); }
      });
      this.container.add(card);
      this.cards.push(card);
    });
    this.layoutMatches();
    this.updatePager();
  }

  private updatePager(): void {
    this.previousButton.setVisible(this.pageIndex > 0);
    this.nextButton.setVisible(this.nextOffset !== null && this.pageIndex + 1 < PUBLIC_MATCH_MAX_PAGES);
    this.previousButton.setActive(this.pageIndex > 0);
    this.nextButton.setActive(this.nextOffset !== null && this.pageIndex + 1 < PUBLIC_MATCH_MAX_PAGES);
    this.layoutMatches();
  }

  private layoutMatches = (): void => {
    const width = Math.min(720, Math.max(300, this.scene.scale.width - 32));
    this.container.setPosition(this.scene.scale.width / 2, Math.max(24, (this.scene.scale.height - 220) / 2));
    this.cards.forEach((card, index) => {
      card.setPosition(-width / 2, 120 + index * (124 + CARD_GAP));
      card.setSize(width, 124);
    });
    const actionsY = 76;
    this.refreshButton.setPosition(-70, actionsY);
    this.backButton.setPosition(70, actionsY);
    this.previousButton.setPosition(-80, 120 + this.cards.length * (124 + CARD_GAP));
    this.nextButton.setPosition(80, 120 + this.cards.length * (124 + CARD_GAP));
  };
}
