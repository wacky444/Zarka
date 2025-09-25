import Phaser from "phaser";
import { Client, Session, RpcResponse } from "@heroiclabs/nakama-js";
import { initNakama } from "../services/nakama";
import { SessionManager } from "../services/sessionManager";
import { TurnService } from "../services/turnService";
import { makeButton, UIButton } from "../ui/button";
import { MatchesListView } from "./MatchesList";
import { MyMatchesListView } from "./MyMatchesList";
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
  private currentMatchName: string | null = null;
  private moveCounter = 0;
  private matchesListView!: MatchesListView;
  private myMatchesListView!: MyMatchesListView;
  private inMatchView!: InMatchView;
  private activeView: "main" | "matchList" | "myMatchList" | "inMatch" = "main";
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
      const displayName =
        parsed.name && parsed.name.trim() ? parsed.name.trim() : undefined;
      if (displayName) {
        this.currentMatchName = displayName;
      } else if (!this.currentMatchName) {
        this.currentMatchName = "Match";
      }
      const nameForStatus = this.currentMatchName ?? "Match";
      this.statusText.setText(
        `Join OK: ${nameForStatus}. Players: ${count ?? "?"}/${
          parsed.size ?? "?"
        }`
      );
      if (this.inMatchView) {
        this.inMatchView.setMatchInfo(matchId, displayName);
        // Fetch creator info to reflect in the UI
        try {
          const stateRes = await this.turnService.getState(matchId);
          const st = this.parseRpcPayload<GetStatePayload>(stateRes);
          const matchObj =
            st && st.match
              ? (st.match as { creator?: string; name?: string })
              : undefined;
          const creator: string | undefined = matchObj?.creator;
          const isSelf =
            !!creator && !!this.currentUserId && creator === this.currentUserId;
          this.inMatchView.setCreator(creator, isSelf);
          if (matchObj?.name) {
            this.inMatchView.setMatchName(matchObj.name);
            this.currentMatchName = matchObj.name;
          }
        } catch (e) {
          console.warn("Failed to load creator info", e);
        }
      }
      this.showView("inMatch");
    } else {
      this.statusText.setText("join_match error (see console).");
      console.log("join_match response:", parsed);
    }
  }

  preload() {}

  async create(data?: { client?: Client; session?: Session }) {
    this.statusText = this.add.text(10, 10, "Connecting...", {
      color: "#ffffff",
    });

    try {
      // Use passed session data if available, otherwise initialize new connection
      let client, session;
      if (data && data.client && data.session) {
        client = data.client;
        session = data.session;
      } else {
        const result = await initNakama();
        client = result.client;
        session = result.session;
      }

      this.turnService = new TurnService(client, session);
      this.currentUserId = session.user_id ?? null;
      this.registry.set("currentUserId", this.currentUserId);
      // Pre-connect the realtime socket so join calls don't race the connection
      await this.turnService.connectSocket();
      // Real-time settings updates from server
      this.turnService.setOnSettingsUpdate((p) => {
        const s = [
          p.name ? `name="${p.name}"` : null,
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

      // Instantiate My Matches List view (hidden by default)
      this.myMatchesListView = new MyMatchesListView(this);
      this.myMatchesListView.setTurnService(this.turnService);
      this.myMatchesListView.setOnLeave(async (matchId: string) => {
        if (!this.turnService) return;
        const res = await this.turnService.leaveMatch(matchId);
        const parsed = this.parseRpcPayload<LeaveMatchPayload>(res);
        if (parsed && parsed.ok) {
          this.statusText.setText("Left match.");
          // Also leave the realtime match to remove presence from state
          await this.turnService.leaveRealtimeMatch(matchId);
          // If we're leaving the current match, clear it
          if (this.currentMatchId === matchId) {
            this.currentMatchId = null;
            this.currentMatchName = null;
            this.inMatchView.hide();
            this.showView("main");
          }
          // Refresh the list to reflect the change
          this.myMatchesListView.refresh();
        }
      });
      this.myMatchesListView.setOnView(async (matchId: string) => {
        // Switch to the match view
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
          this.currentMatchName = null;
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
            `Settings updated: name="${s.name}" players=${s.players}, ${s.cols}x${s.rows}`
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
            const createdName = parsed.name ?? "Untitled Match";
            this.currentMatchName = createdName;
            this.statusText.setText(`Match created: ${createdName}`);
            if (this.inMatchView) {
              this.inMatchView.setMatchName(createdName);
            }

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
          },
          ["main"]
        )
      );

      // My Matches list view toggle
      this.buttons.push(
        makeButton(
          this,
          10,
          280,
          "My Matches",
          () => {
            this.showView("myMatchList");
          },
          ["main"]
        )
      );

      // Logout button
      this.buttons.push(
        makeButton(
          this,
          10,
          320,
          "Logout",
          () => {
            this.logout();
          },
          ["main"]
        )
      );

      // Account Settings button
      this.buttons.push(
        makeButton(
          this,
          10,
          360,
          "Account Settings",
          () => {
            this.scene.start("AccountScene", {
              client: this.turnService?.getClient(),
              session: this.turnService?.getSession(),
            });
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
            this.showView("main");
          },
          ["matchList"]
        )
      );

      // View-specific buttons for MyMatchesList
      this.buttons.push(
        makeButton(
          this,
          10,
          70,
          "Refresh",
          () => this.myMatchesListView.refresh(),
          ["myMatchList"]
        )
      );
      this.buttons.push(
        makeButton(
          this,
          110,
          70,
          "Back",
          () => {
            this.showView("main");
          },
          ["myMatchList"]
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

      // Provide user-friendly error message for server connection issues
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        this.statusText.setText(
          "Server unavailable. Please check your connection or try again later."
        );
      } else {
        this.statusText.setText("Init error: " + msg);
      }
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

  private showView(view: "main" | "matchList" | "myMatchList" | "inMatch") {
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

    // Toggle sub-views to ensure only one is visible at a time
    try {
      if (this.matchesListView) {
        if (this.activeView === "matchList") this.matchesListView.show();
        else this.matchesListView.hide();
      }
      if (this.myMatchesListView) {
        if (this.activeView === "myMatchList") this.myMatchesListView.show();
        else this.myMatchesListView.hide();
      }
      if (this.inMatchView) {
        if (this.activeView === "inMatch") this.inMatchView.show();
        else this.inMatchView.hide();
      }
    } catch (e) {
      console.warn("applyViewVisibility: view toggle error", e);
    }
  }

  private logout() {
    // Clear the session
    SessionManager.clearSession();

    // Disconnect from turn service if connected
    if (this.turnService) {
      try {
        this.turnService.disconnect();
      } catch (error) {
        console.warn("Error disconnecting turn service:", error);
      }
    }

    // Reset state
    this.turnService = null;
    this.currentMatchId = null;
    this.currentUserId = null;
    this.registry.set("currentUserId", null);

    // Navigate back to login scene
    this.scene.start("LoginScene");
  }
}
