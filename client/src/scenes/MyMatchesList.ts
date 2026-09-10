import Phaser from "phaser";
import { TurnService } from "../services/turnService";
import { makeButton, type UIButton } from "../ui/button";
import type { ListMyMatchesPayload } from "@shared";

// Type for my matches entries from the RPC response
type MyMatch = {
  match_id: string;
  size: number;
  players: string[];
  current_turn: number;
  created_at: number;
  creator?: string;
  cols?: number;
  rows?: number;
  name?: string;
  started?: boolean;
};

type MyMatchRowItem = {
  textObj: Phaser.GameObjects.Text;
  viewBtn: UIButton;
  leaveBtn: UIButton;
};

const MY_MATCHES_LAYOUT = {
  contentWidth: 720,
  horizontalPadding: 32,
  titleY: 0,
  statusY: 36,
  actionsY: 76,
  actionsGap: 16,
  listStartY: 120,
  rowGap: 34,
  buttonGap: 10,
  minTop: 24
};

// A lightweight view container for My Matches List that can be mounted inside any Scene.
export class MyMatchesListView {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private refreshButton!: UIButton;
  private backButton!: UIButton;
  private listItems: Phaser.GameObjects.Text[] = [];
  private rowItems: MyMatchRowItem[] = [];
  private fetching = false;
  private onLeave?: (matchId: string) => void | Promise<void>;
  private onView?: (matchId: string) => void | Promise<void>;
  private onBack?: () => void;
  private turnService: TurnService | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add
      .container(0, 0)
      .setVisible(false)
      .setActive(false);

    this.titleText = scene.add
      .text(0, 0, "My Matches", {
        color: "#ffffff",
        fontSize: "28px",
        fontStyle: "bold"
      })
      .setOrigin(0.5);
    this.container.add(this.titleText);

    this.statusText = scene.add
      .text(0, 0, "Fetching...", {
        color: "#cccccc",
        fontSize: "16px"
      })
      .setOrigin(0.5);
    this.container.add(this.statusText);

    this.refreshButton = makeButton(
      this.scene,
      0,
      0,
      "Refresh",
      () => this.refresh(),
      ["myMatchList"]
    ).setOrigin(0.5);
    this.container.add(this.refreshButton);

    this.backButton = makeButton(
      this.scene,
      0,
      0,
      "Back",
      () => {
        if (this.onBack) {
          this.onBack();
        } else {
          this.hide();
        }
      },
      ["myMatchList"]
    ).setOrigin(0.5);
    this.container.add(this.backButton);

    this.layoutMyMatches();
    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.layoutMyMatches, this);
    this.scene.events.on(Phaser.Scenes.Events.WAKE, this.layoutMyMatches, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.scale.off(
        Phaser.Scale.Events.RESIZE,
        this.layoutMyMatches,
        this
      );
      this.scene.events.off(Phaser.Scenes.Events.WAKE, this.layoutMyMatches, this);
    });
  }

  setTurnService(service: TurnService | null) {
    this.turnService = service;
  }

  setOnLeave(handler: (matchId: string) => void | Promise<void>) {
    this.onLeave = handler;
  }

  setOnView(handler: (matchId: string) => void | Promise<void>) {
    this.onView = handler;
  }

  setOnBack(handler: () => void) {
    this.onBack = handler;
  }

  show() {
    this.container.setVisible(true).setActive(true);
    this.layoutMyMatches();
    this.refresh();
  }

  hide() {
    this.container.setVisible(false).setActive(false);
  }

  async refresh() {
    if (this.fetching || !this.turnService) return;
    this.fetching = true;
    this.statusText.setText("Fetching my matches...");
    this.clearList();
    this.layoutMyMatches();

    try {
      const res = await this.turnService.listMyMatches();
      let payload: ListMyMatchesPayload;

      if (typeof res.payload === "string") {
        payload = JSON.parse(res.payload) as ListMyMatchesPayload;
      } else {
        payload = (res.payload || {}) as ListMyMatchesPayload;
      }

      if (payload.error) {
        this.statusText.setText("Error: " + payload.error);
        this.layoutMyMatches();
        return;
      }

      const matches = payload.matches || [];
      if (!matches.length) {
        this.statusText.setText("You haven't joined any matches yet.");
        this.layoutMyMatches();
        return;
      }

      const creatorIds = Array.from(
        new Set(
          matches
            .map((m) => m.creator)
            .filter(
              (id): id is string => typeof id === "string" && id.trim().length > 0
            )
        )
      );

      let hostMap: Record<string, string> = {};
      if (creatorIds.length > 0 && this.turnService) {
        try {
          hostMap = await this.turnService.resolveUsernames(creatorIds);
        } catch (e) {
          console.warn("Failed to resolve creator usernames", e);
        }
      }

      this.statusText.setText(`Found ${matches.length} matches you've joined:`);
      this.renderList(matches, hostMap);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      this.statusText.setText("Error: " + msg);
      this.layoutMyMatches();
    } finally {
      this.fetching = false;
    }
  }

  private renderList(
    matches: MyMatch[],
    hostMap: Record<string, string> = {}
  ) {
    matches.forEach((m, idx) => {
      const matchId = m.match_id;
      const playerCount = m.players.length;
      const maxPlayers = m.size;
      const turns = m.current_turn;
      const matchName = m.name && m.name.trim() ? m.name : `Match ${idx + 1}`;
      const isCreator = this.scene.registry.get("currentUserId") === m.creator;
      const stateLabel = m.started ? "In Progress" : "Waiting";
      const hostName =
        m.creator && hostMap[m.creator]
          ? hostMap[m.creator]
          : m.creator ?? "-";
      const hostDisplay = isCreator ? `${hostName} (Host)` : hostName;

      const text = `${
        idx + 1
      }. ${matchName} | ${hostDisplay} | ${playerCount}/${maxPlayers} players | ${turns} turns | ${stateLabel}`;
      this.createRow(matchId, text);
    });

    this.layoutMyMatches();
  }

  private createRow(matchId: string, text: string) {
    const lineObj = this.scene.add
      .text(0, 0, text, {
        color: "#00ccff",
        fontSize: "14px"
      })
      .setOrigin(0, 0.5);
    this.container.add(lineObj);
    this.listItems.push(lineObj);

    const viewBtn = makeButton(
      this.scene,
      0,
      0,
      "View",
      async () => {
        if (this.onView) {
          await this.onView(matchId);
        }
      },
      ["myMatchList"]
    ).setOrigin(0.5);
    this.container.add(viewBtn);
    this.listItems.push(viewBtn);

    const leaveBtn = makeButton(
      this.scene,
      0,
      0,
      "Leave",
      async () => {
        if (this.onLeave) {
          await this.onLeave(matchId);
        }
      },
      ["myMatchList"]
    ).setOrigin(0.5);
    this.container.add(leaveBtn);
    this.listItems.push(leaveBtn);

    this.rowItems.push({ textObj: lineObj, viewBtn, leaveBtn });
  }

  private layoutMyMatches(): void {
    const viewportWidth = this.scene.scale.width;
    const viewportHeight = this.scene.scale.height;
    const contentWidth = Math.min(
      MY_MATCHES_LAYOUT.contentWidth,
      Math.max(300, viewportWidth - MY_MATCHES_LAYOUT.horizontalPadding)
    );
    const rowCount = Math.max(1, this.rowItems.length);
    const contentHeight =
      this.rowItems.length > 0
        ? MY_MATCHES_LAYOUT.listStartY +
          (rowCount - 1) * MY_MATCHES_LAYOUT.rowGap +
          32
        : MY_MATCHES_LAYOUT.actionsY + 40;
    const top = Math.max(
      MY_MATCHES_LAYOUT.minTop,
      (viewportHeight - contentHeight) / 2
    );

    this.container.setPosition(viewportWidth / 2, top);
    this.titleText.setPosition(0, MY_MATCHES_LAYOUT.titleY);
    this.statusText.setPosition(0, MY_MATCHES_LAYOUT.statusY);

    const refreshWidth = this.refreshButton.width;
    const backWidth = this.backButton.width;
    const totalActionWidth =
      refreshWidth + MY_MATCHES_LAYOUT.actionsGap + backWidth;
    this.refreshButton.setPosition(
      -totalActionWidth / 2 + refreshWidth / 2,
      MY_MATCHES_LAYOUT.actionsY
    );
    this.backButton.setPosition(
      totalActionWidth / 2 - backWidth / 2,
      MY_MATCHES_LAYOUT.actionsY
    );

    const left = -contentWidth / 2;
    const right = contentWidth / 2;

    this.rowItems.forEach((row, idx) => {
      const rowY =
        MY_MATCHES_LAYOUT.listStartY + idx * MY_MATCHES_LAYOUT.rowGap;
      row.textObj.setPosition(left, rowY);

      const leaveWidth = row.leaveBtn.width;
      const viewWidth = row.viewBtn.width;
      const btnGap = MY_MATCHES_LAYOUT.buttonGap;

      const leaveX = right - leaveWidth / 2;
      const viewX = right - leaveWidth - btnGap - viewWidth / 2;

      row.leaveBtn.setPosition(leaveX, rowY);
      row.viewBtn.setPosition(viewX, rowY);
    });
  }

  private clearList() {
    this.listItems.forEach((t) => t.destroy());
    this.listItems = [];
    this.rowItems = [];
  }
}
