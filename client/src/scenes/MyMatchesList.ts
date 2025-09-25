import Phaser from "phaser";
import { TurnService } from "../services/turnService";
import { makeButton } from "../ui/button";
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
};

// A lightweight view container for My Matches List that can be mounted inside any Scene.
export class MyMatchesListView {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;
  private listItems: Phaser.GameObjects.Text[] = [];
  private fetching = false;
  private onLeave?: (matchId: string) => void | Promise<void>;
  private onView?: (matchId: string) => void | Promise<void>;
  private turnService: TurnService | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add
      .container(0, 0)
      .setVisible(false)
      .setActive(false);

    const title = scene.add.text(10, 10, "My Matches", {
      color: "#ffffff",
      fontSize: "20px",
    });
    this.container.add(title);

    this.statusText = scene.add.text(10, 40, "Fetching...", {
      color: "#cccccc",
    });
    this.container.add(this.statusText);
  }

  setTurnService(service: TurnService) {
    this.turnService = service;
  }

  setOnLeave(handler: (matchId: string) => void | Promise<void>) {
    this.onLeave = handler;
  }

  setOnView(handler: (matchId: string) => void | Promise<void>) {
    this.onView = handler;
  }

  show() {
    this.container.setVisible(true).setActive(true);
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
        return;
      }

      const matches = payload.matches || [];
      if (!matches.length) {
        this.statusText.setText("You haven't joined any matches yet.");
        return;
      }

      this.statusText.setText(`Found ${matches.length} matches you've joined:`);
      this.renderList(matches);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      this.statusText.setText("Error: " + msg);
    } finally {
      this.fetching = false;
    }
  }

  private renderList(matches: MyMatch[]) {
    const y = 110;
    const pad = 22;
    matches.forEach((m, idx) => {
      const matchId = m.match_id;
      const playerCount = m.players.length;
      const maxPlayers = m.size;
      const turns = m.current_turn;
      const matchName = m.name && m.name.trim() ? m.name : `Match ${idx + 1}`;
      const isCreator = this.scene.registry.get("currentUserId") === m.creator;

      const text = `${
        idx + 1
      }. ${matchName} | ${playerCount}/${maxPlayers} players | ${turns} turns ${
        isCreator ? "(Host)" : ""
      }`;
      const lineY = y + idx * pad;
      const line = this.scene.add.text(10, lineY, text, {
        color: "#00ccff",
      });
      this.container.add(line);
      this.listItems.push(line);

      // View/Enter button
      const viewBtn = makeButton(
        this.scene,
        520,
        lineY,
        "View",
        async () => {
          if (this.onView) {
            await this.onView(matchId);
          }
        },
        ["myMatchList"]
      );
      this.container.add(viewBtn);
      this.listItems.push(viewBtn);

      // Leave button next to the entry
      const leaveBtn = makeButton(
        this.scene,
        580,
        lineY,
        "Leave",
        async () => {
          if (this.onLeave) {
            await this.onLeave(matchId);
          }
        },
        ["myMatchList"]
      );
      this.container.add(leaveBtn);
      this.listItems.push(leaveBtn);
    });
  }

  private clearList() {
    this.listItems.forEach((t) => t.destroy());
    this.listItems = [];
  }
}
