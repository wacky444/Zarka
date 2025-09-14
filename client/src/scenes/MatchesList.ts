import Phaser from "phaser";
import { initNakama } from "../services/nakama";
import { makeButton } from "../ui/button";

// Minimal shape for listMatches entries based on Nakama API
type ApiMatch = {
  match_id?: string;
  size?: number;
  max_size?: number;
  label?: string;
};

// A lightweight view container for the Matches List that can be mounted inside any Scene.
export class MatchesListView {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;
  private listItems: Phaser.GameObjects.Text[] = [];
  private fetching = false;
  private onJoin?: (matchId: string) => void | Promise<void>;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add
      .container(0, 0)
      .setVisible(false)
      .setActive(false);

    const title = scene.add.text(10, 10, "Matches", {
      color: "#ffffff",
      fontSize: "20px",
    });
    this.container.add(title);

    this.statusText = scene.add.text(10, 40, "Fetching...", {
      color: "#cccccc",
    });
    this.container.add(this.statusText);
  }

  setOnJoin(handler: (matchId: string) => void | Promise<void>) {
    this.onJoin = handler;
  }

  show() {
    this.container.setVisible(true).setActive(true);
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

    try {
      const { client, session } = await initNakama();
      const list = await client.listMatches(session, 50, true, "", 0, 500, "");
      const matches: ApiMatch[] = list.matches ?? [];
      if (!matches.length) {
        this.statusText.setText("No matches found.");
        return;
      }
      this.statusText.setText(`Found ${matches.length} matches:`);
      this.renderList(matches);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      this.statusText.setText("Error: " + msg);
    } finally {
      this.fetching = false;
    }
  }

  private renderList(matches: ApiMatch[]) {
    const y = 110;
    const pad = 22;
    matches.forEach((m, idx) => {
      const matchId = m.match_id ?? "?";
      const size = m.size ?? "?";
      const maxSize = m.max_size ?? "?";
      const label = m.label ?? "";
      const text = `${idx + 1}. ${matchId} | ${size}/${maxSize} ${
        label ? `| ${label}` : ""
      }`;
      const lineY = y + idx * pad;
      const line = this.scene.add.text(10, lineY, text, {
        color: "#00ffcc",
      });
      this.container.add(line);
      this.listItems.push(line);

      // Join button next to the entry
      const joinBtn = makeButton(
        this.scene,
        620,
        lineY,
        "Join",
        async () => {
          if (matchId && this.onJoin) {
            await this.onJoin(matchId);
          }
        },
        ["matchList"]
      );
      this.container.add(joinBtn);
      this.listItems.push(joinBtn);
    });
  }

  private clearList() {
    this.listItems.forEach((t) => t.destroy());
    this.listItems = [];
  }
}
