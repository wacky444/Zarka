import Phaser from "phaser";
import { RpcResponse } from "@heroiclabs/nakama-js";
import { initNakama } from "../services/nakama";
import { TurnService } from "../services/turnService";
import { makeButton, UIButton } from "../ui/button";
import { MatchesListView } from "./MatchesList";
import { InMatchView } from "./InMatchView";
import type {
  LeaveMatchPayload,
  JoinMatchPayload,
  CreateMatchPayload,
  SubmitTurnPayload,
  GetStatePayload,
} from "@shared";

export class MainScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private turnService: TurnService | null = null;
  private currentMatchId: string | null = null;
  private moveCounter = 0;
  private matchesListView!: MatchesListView;
  private inMatchView!: InMatchView;
  private activeView: "main" | "matchList" | "inMatch" = "main";
  private buttons: UIButton[] = [];
  private currentUserId: string | null = null;

  constructor() {
    super("MainScene");
  }

  private async joinMatch(matchId: string) {
    if (!this.turnService) throw new Error("No service");
    const res = await this.turnService.joinMatch(matchId);
    const parsed = this.parseRpcPayload<JoinMatchPayload>(res);
    if (parsed && parsed.ok) {
      // Establish realtime presence in the authoritative match so players appear in state
      try {
        await this.turnService.joinRealtimeMatch(matchId);
      } catch (e) {
        console.warn("Realtime join failed", e);
      }
      // Track joined match
      this.currentMatchId = matchId;
      this.moveCounter = 0;
      const count = Array.isArray(parsed.players)
        ? parsed.players.length
        : undefined;
      this.statusText.setText(
        `Join OK. Players: ${count ?? "?"}/${parsed.size ?? "?"}`
      );
      // Hide list and switch to inMatch view
      if (this.matchesListView) this.matchesListView.hide();
      if (this.inMatchView) {
        this.inMatchView.setMatchInfo(matchId);
        // Fetch creator info to reflect in the UI
        try {
          const stateRes = await this.turnService.getState(matchId);
          const st = this.parseRpcPayload<GetStatePayload>(stateRes);
          const matchObj =
            st && st.match ? (st.match as { creator?: string }) : undefined;
          const creator: string | undefined = matchObj?.creator;
          const isSelf =
            !!creator && !!this.currentUserId && creator === this.currentUserId;
          this.inMatchView.setCreator(creator, isSelf);
        } catch (e) {
          console.warn("Failed to load creator info", e);
        }
        this.inMatchView.show();
      }
      this.showView("inMatch");
    } else {
      this.statusText.setText("join_match error (see console).");
      console.log("join_match response:", parsed);
    }
  }

  preload() {}

  async create() {
    this.statusText = this.add.text(10, 10, "Connecting...", {
      color: "#ffffff",
    });

    try {
      const { client, session } = await initNakama();
      this.turnService = new TurnService(client, session);
      this.currentUserId = session.user_id ?? null;
      // Pre-connect the realtime socket so join calls don't race the connection
      await this.turnService.connectSocket();
      // Real-time settings updates from server
      this.turnService.setOnSettingsUpdate((p) => {
        const s = [
          p.size !== undefined ? `players=${p.size}` : null,
          p.cols !== undefined && p.rows !== undefined
            ? `${p.cols}x${p.rows}`
            : null,
        ]
          .filter(Boolean)
          .join(", ");
        if (s) this.statusText.setText(`Settings sync: ${s}`);
        // Optionally reflect in inMatch UI label
        // (InMatchView already shows current inputs; this just confirms sync)
        // Update the inMatch controls for non-hosts (and host echo) without re-emitting
        if (this.inMatchView) this.inMatchView.applySettings(p);
      });
      this.statusText.setText("Authenticated. Use the buttons below.");

      // Instantiate Matches List view (hidden by default)
      this.matchesListView = new MatchesListView(this);
      this.matchesListView.setOnJoin(async (matchId: string) => {
        await this.joinMatch(matchId);
      });

      // Instantiate In-Match view (hidden by default)
      this.inMatchView = new InMatchView(this);
      this.inMatchView.setOnLeave(async () => {
        if (!this.turnService || !this.currentMatchId) return;
        const res = await this.turnService.leaveMatch(this.currentMatchId);
        const parsed = this.parseRpcPayload<LeaveMatchPayload>(res);
        if (parsed && parsed.ok) {
          // Also leave the realtime match to remove presence from state
          await this.turnService.leaveRealtimeMatch(this.currentMatchId);
          this.currentMatchId = null;
          this.inMatchView.hide();
          this.showView("main");
          this.statusText.setText("Left match.");
        } else {
          this.statusText.setText("leave_match error (see console).");
          console.log("leave_match response:", parsed);
        }
      });
      this.inMatchView.setOnEndTurn(async () => {
        if (!this.currentMatchId || !this.turnService) return;
        const move = { n: ++this.moveCounter, ts: Date.now() };
        const res = await this.turnService.submitTurn(
          this.currentMatchId,
          move
        );
        const parsed = this.parseRpcPayload<SubmitTurnPayload>(res);
        if (parsed && parsed.ok) {
          this.statusText.setText(`Turn submitted. Turn #: ${parsed.turn}`);
        } else {
          this.statusText.setText("submit_turn error (see console).");
        }
      });
      this.inMatchView.setOnSettingsChange(async (s) => {
        if (!this.turnService || !this.currentMatchId) return;
        try {
          await this.turnService.updateSettings(this.currentMatchId, s);
          this.statusText.setText(
            `Settings updated: players=${s.players}, ${s.cols}x${s.rows}`
          );
        } catch (e) {
          console.error("update_settings error", e);
          this.statusText.setText("Failed to update settings");
        }
      });

      // Buttons
      this.buttons.push(
        makeButton(
          this,
          10,
          40,
          "Create Match",
          async () => {
            if (!this.turnService) throw new Error("No service");
            const createRes = await this.turnService.createMatch(2);
            const parsed = this.parseRpcPayload<CreateMatchPayload>(createRes);
            if (!parsed || !parsed.match_id)
              throw new Error("No match_id returned");
            this.currentMatchId = parsed.match_id;
            this.statusText.setText(`Match created: ${this.currentMatchId}`);

            // Auto-join the match we just created
            await this.joinMatch(parsed.match_id);
          },
          ["main"]
        )
      );

      // Open the new Game Scene showcasing a hex grid
      this.buttons.push(
        makeButton(
          this,
          10,
          200,
          "Open Game Scene",
          () => {
            this.scene.start("GameScene");
          },
          ["main"]
        )
      );

      // Matches list view toggle
      this.buttons.push(
        makeButton(
          this,
          10,
          240,
          "List Matches",
          () => {
            this.showView("matchList");
            this.matchesListView.show();
          },
          ["main"]
        )
      );

      // View-specific buttons for MatchesList
      this.buttons.push(
        makeButton(
          this,
          10,
          70,
          "Refresh",
          () => this.matchesListView.refresh(),
          ["matchList"]
        )
      );
      this.buttons.push(
        makeButton(
          this,
          110,
          70,
          "Back",
          () => {
            this.matchesListView.hide();
            this.showView("main");
          },
          ["matchList"]
        )
      );

      // Placeholder: inMatch view buttons can be added and tagged with ["inMatch"]
      this.buttons.push(
        makeButton(
          this,
          290,
          80,
          "Back to Menu",
          () => {
            this.inMatchView.hide();
            this.showView("main");
            this.statusText.setText("Back to main menu (still in match).");
          },
          ["inMatch"]
        )
      );

      // Initialize in main view
      this.applyViewVisibility();
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      this.statusText.setText("Init error: " + msg);
    }
  }

  private parseRpcPayload<T>(res: RpcResponse): T {
    const raw: unknown = (res as RpcResponse).payload as unknown;
    if (typeof raw === "string") {
      return JSON.parse(raw) as T;
    }
    if (raw && typeof raw === "object") {
      return raw as T; // already parsed
    }
    throw new Error("Unsupported payload type: " + typeof raw);
  }

  private showView(view: "main" | "matchList" | "inMatch") {
    this.activeView = view;
    this.applyViewVisibility();
  }

  private applyViewVisibility() {
    // Toggle buttons based on tags
    this.buttons.forEach((btn) => {
      const show = btn.tags.includes(this.activeView);
      btn.setVisible(show).setActive(show);
      // Optional: also disable interaction when hidden
      // btn.disableInteractive();
      // if (show) btn.setInteractive({ useHandCursor: true });
    });
  }
}
