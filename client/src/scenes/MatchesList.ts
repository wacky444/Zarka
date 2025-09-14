import Phaser from "phaser";
// Minimal shape for listMatches entries based on Nakama API
type ApiMatch = {
  match_id?: string;
  size?: number;
  max_size?: number;
  label?: string;
};
import { initNakama } from "../services/nakama";
import { makeButton } from "../ui/button";

export class MatchesList extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private listItems: Phaser.GameObjects.Text[] = [];
  private fetching = false;

  constructor() {
    super("MatchesList");
  }

  create() {
    this.add.text(10, 10, "Matches", {
      color: "#ffffff",
      fontSize: "20px",
    });

    this.statusText = this.add.text(10, 40, "Fetching...", {
      color: "#cccccc",
    });

    makeButton(this, 10, 70, "Refresh", () => this.refresh());
    makeButton(this, 110, 70, "Back", () => {
      this.scene.start("MainScene");
    });

    this.refresh();
  }

  private async refresh() {
    if (this.fetching) return;
    this.fetching = true;
    this.statusText.setText("Fetching matches...");
    this.clearList();

    try {
      const { client, session } = await initNakama();
      // Limit to 50 entries, no extra filters.
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
      const line = this.add.text(10, y + idx * pad, text, { color: "#00ffcc" });
      this.listItems.push(line);
    });
  }

  private clearList() {
    this.listItems.forEach((t) => t.destroy());
    this.listItems = [];
  }
}
