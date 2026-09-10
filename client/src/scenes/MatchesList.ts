import Phaser from "phaser";
import { initNakama } from "../services/nakama";
import { makeButton, type UIButton } from "../ui/button";
import type { TurnService } from "../services/turnService";

// Minimal shape for listMatches entries based on Nakama API
type ApiMatch = {
  match_id?: string;
  size?: number;
  max_size?: number;
  label?: string;
};

type MatchRowItem = {
  textObj: Phaser.GameObjects.Text;
  joinBtn: UIButton;
};

const MATCHES_LAYOUT = {
  contentWidth: 680,
  horizontalPadding: 32,
  titleY: 0,
  statusY: 36,
  actionsY: 76,
  actionsGap: 16,
  listStartY: 120,
  rowGap: 34,
  minTop: 24
};

// A lightweight view container for the Matches List that can be mounted inside any Scene.
export class MatchesListView {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private refreshButton!: UIButton;
  private backButton!: UIButton;
  private listItems: Phaser.GameObjects.Text[] = [];
  private rowItems: MatchRowItem[] = [];
  private fetching = false;
  private onJoin?: (matchId: string) => void | Promise<void>;
  private onBack?: () => void;
  private turnService: TurnService | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add
      .container(0, 0)
      .setVisible(false)
      .setActive(false);

    this.titleText = scene.add
      .text(0, 0, "Matches", {
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
      ["matchList"]
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
      ["matchList"]
    ).setOrigin(0.5);
    this.container.add(this.backButton);

    this.layoutMatches();
    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.layoutMatches, this);
    this.scene.events.on(Phaser.Scenes.Events.WAKE, this.layoutMatches, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layoutMatches, this);
      this.scene.events.off(Phaser.Scenes.Events.WAKE, this.layoutMatches, this);
    });
  }

  setTurnService(service: TurnService | null) {
    this.turnService = service;
  }

  setOnJoin(handler: (matchId: string) => void | Promise<void>) {
    this.onJoin = handler;
  }

  setOnBack(handler: () => void) {
    this.onBack = handler;
  }

  show() {
    this.container.setVisible(true).setActive(true);
    this.layoutMatches();
    this.refresh();
  }

  hide() {
    this.container.setVisible(false).setActive(false);
  }

  async refresh() {
    if (this.fetching) return;
    this.fetching = true;
    this.statusText.setText("Fetching matches...");
    this.clearList();
    this.layoutMatches();

    try {
      const { client, session } = await initNakama();
      const list = await client.listMatches(session, 50, true, "", 0, 500, "");
      const matches: ApiMatch[] = list.matches ?? [];
      if (!matches.length) {
        this.statusText.setText("No matches found.");
        this.layoutMatches();
        return;
      }

      const hostUserIds = Array.from(
        new Set(
          matches
            .map((m) => {
              if (!m.label) return null;
              try {
                const parsed = JSON.parse(m.label) as { creator?: string };
                return typeof parsed.creator === "string" && parsed.creator.trim()
                  ? parsed.creator.trim()
                  : null;
              } catch {
                return null;
              }
            })
            .filter((id): id is string => Boolean(id))
        )
      );

      let hostMap: Record<string, string> = {};
      if (hostUserIds.length > 0) {
        if (this.turnService) {
          try {
            hostMap = await this.turnService.resolveUsernames(hostUserIds);
          } catch (e) {
            console.warn("Failed to resolve host usernames via turnService", e);
          }
        } else {
          try {
            const response = await client.getUsers(session, hostUserIds);
            const users = Array.isArray(response?.users) ? response.users : [];
            for (const u of users) {
              const id = u.id;
              if (id) {
                hostMap[id] =
                  (typeof u.display_name === "string" && u.display_name.trim()) ||
                  (typeof u.username === "string" && u.username.trim()) ||
                  id;
              }
            }
          } catch (e) {
            console.warn("Failed to resolve host usernames via client", e);
          }
        }
      }

      this.statusText.setText(`Found ${matches.length} matches:`);
      this.renderList(matches, hostMap);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      this.statusText.setText("Error: " + msg);
      this.layoutMatches();
    } finally {
      this.fetching = false;
    }
  }

  private renderList(
    matches: ApiMatch[],
    hostMap: Record<string, string> = {}
  ) {
    matches.forEach((m, idx) => {
      const matchId = m.match_id ?? "?";
      const size = m.size ?? "?";
      const maxSize = m.max_size ?? "?";
      let matchName: string | undefined;
      let stateTag = "";
      let hostName = "-";
      if (m.label) {
        try {
          const parsed = JSON.parse(m.label) as {
            name?: string;
            started?: boolean;
            players?: number;
            size?: number | string;
            creator?: string;
          };
          if (parsed && typeof parsed.name === "string" && parsed.name.trim()) {
            matchName = parsed.name.trim();
          }
          if (parsed && typeof parsed.started === "boolean") {
            stateTag = parsed.started ? "In Progress" : "Open";
          }
          if (parsed && typeof parsed.creator === "string" && parsed.creator.trim()) {
            const creatorId = parsed.creator.trim();
            hostName = hostMap[creatorId] || creatorId;
          }
          if (parsed && parsed.players !== undefined) {
            const currentPlayers = Number(parsed.players);
            if (!Number.isNaN(currentPlayers)) {
              // override live size if available
              const max =
                parsed.size !== undefined ? Number(parsed.size) : undefined;
              const maxDisplay = !Number.isNaN(max ?? NaN) ? max : maxSize;
              const displayName =
                matchName && matchName.length ? matchName : `Match ${idx + 1}`;
              const line = `${
                idx + 1
              }. ${displayName} | ${hostName} | ${currentPlayers}/${maxDisplay}`;
              const status = stateTag ? ` | ${stateTag}` : "";
              const text = line + status;
              this.createRow(matchId, text);
              return;
            }
          }
        } catch (e) {
          console.warn("Failed to parse match label", e);
        }
      }
      const displayName =
        matchName && matchName.length ? matchName : `Match ${idx + 1}`;
      const textBase = `${idx + 1}. ${displayName} | ${hostName} | ${size}/${maxSize}`;
      const text = stateTag ? `${textBase} | ${stateTag}` : textBase;
      this.createRow(matchId, text);
    });

    this.layoutMatches();
  }

  private createRow(matchId: string, text: string) {
    const lineObj = this.scene.add
      .text(0, 0, text, {
        color: "#00ffcc",
        fontSize: "15px"
      })
      .setOrigin(0, 0.5);
    this.container.add(lineObj);
    this.listItems.push(lineObj);

    const joinBtn = makeButton(
      this.scene,
      0,
      0,
      "Join",
      async () => {
        if (matchId && this.onJoin) {
          await this.onJoin(matchId);
        }
      },
      ["matchList"]
    ).setOrigin(0.5);
    this.container.add(joinBtn);
    this.listItems.push(joinBtn);

    this.rowItems.push({ textObj: lineObj, joinBtn });
  }

  private layoutMatches(): void {
    const viewportWidth = this.scene.scale.width;
    const viewportHeight = this.scene.scale.height;
    const contentWidth = Math.min(
      MATCHES_LAYOUT.contentWidth,
      Math.max(300, viewportWidth - MATCHES_LAYOUT.horizontalPadding)
    );
    const rowCount = Math.max(1, this.rowItems.length);
    const contentHeight =
      this.rowItems.length > 0
        ? MATCHES_LAYOUT.listStartY +
          (rowCount - 1) * MATCHES_LAYOUT.rowGap +
          32
        : MATCHES_LAYOUT.actionsY + 40;
    const top = Math.max(
      MATCHES_LAYOUT.minTop,
      (viewportHeight - contentHeight) / 2
    );

    this.container.setPosition(viewportWidth / 2, top);
    this.titleText.setPosition(0, MATCHES_LAYOUT.titleY);
    this.statusText.setPosition(0, MATCHES_LAYOUT.statusY);

    const refreshWidth = this.refreshButton.width;
    const backWidth = this.backButton.width;
    const totalActionWidth =
      refreshWidth + MATCHES_LAYOUT.actionsGap + backWidth;
    this.refreshButton.setPosition(
      -totalActionWidth / 2 + refreshWidth / 2,
      MATCHES_LAYOUT.actionsY
    );
    this.backButton.setPosition(
      totalActionWidth / 2 - backWidth / 2,
      MATCHES_LAYOUT.actionsY
    );

    const left = -contentWidth / 2;
    const right = contentWidth / 2;

    this.rowItems.forEach((row, idx) => {
      const rowY = MATCHES_LAYOUT.listStartY + idx * MATCHES_LAYOUT.rowGap;
      row.textObj.setPosition(left, rowY);
      row.joinBtn.setPosition(right - row.joinBtn.width / 2, rowY);
    });
  }

  private clearList() {
    this.listItems.forEach((t) => t.destroy());
    this.listItems = [];
    this.rowItems = [];
  }
}
