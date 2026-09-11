import Phaser from "phaser";
import { Client, Session, RpcResponse } from "@heroiclabs/nakama-js";
import { initNakama } from "../services/nakama";
import { SessionManager } from "../services/sessionManager";
import { TurnService } from "../services/turnService";
import { AccountService } from "../services/AccountService";
import { makeButton, UIButton } from "../ui/button";
import { MatchesListView } from "./MatchesList";
import { MyMatchesListView } from "./MyMatchesList";
import { LobbyView } from "./LobbyView";
import type {
  LeaveMatchPayload,
  JoinMatchPayload,
  CreateMatchPayload,
  SubmitTurnPayload,
  GetStatePayload,
  StartMatchPayload,
  RemoveMatchPayload
} from "@shared";

const MAIN_LAYOUT = {
  contentWidth: 380,
  horizontalPadding: 32,
  titleY: 0,
  statusY: 48,
  controlsY: 112,
  buttonGap: 58,
  minTop: 24
};

export class MainScene extends Phaser.Scene {
  private mainRoot!: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private turnService: TurnService | null = null;
  private accountService: AccountService | null = null;
  private currentMatchId: string | null = null;
  private currentMatchName: string | null = null;
  private moveCounter = 0;
  private matchesListView!: MatchesListView;
  private myMatchesListView!: MyMatchesListView;
  private lobbyView!: LobbyView;
  private activeView: "main" | "matchList" | "myMatchList" | "inMatch" = "main";
  private buttons: UIButton[] = [];
  private mainButtons: UIButton[] = [];
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
        this.statusText.setText(
          "Realtime connection failed. Please try again."
        );
        return;
      }
      // Track joined match
      this.setCurrentMatchId(matchId);
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
      const stateSuffix =
        typeof parsed.started === "boolean"
          ? parsed.started
            ? " (Started)"
            : " (Waiting)"
          : "";
      this.statusText.setText(
        `Join OK: ${nameForStatus}${stateSuffix}. Players: ${count ?? "?"}/${
          parsed.size ?? "?"
        }`
      );
      if (this.lobbyView) {
        this.lobbyView.setMatchInfo(matchId, displayName);
        if (typeof parsed.started === "boolean") {
          this.lobbyView.setMatchStarted(parsed.started);
        }
        if (Array.isArray(parsed.players) && parsed.players.length > 0) {
          try {
            const usernameMap = await this.turnService.resolveUsernames(
              parsed.players
            );
            const playerNames = parsed.players.map(
              (id) => usernameMap[id] ?? id
            );
            this.lobbyView.setPlayers(playerNames);
          } catch (e) {
            console.warn("Failed to resolve player usernames", e);
            this.lobbyView.setPlayers(parsed.players);
          }
        } else {
          this.lobbyView.setPlayers([]);
        }
        // Fetch creator info to reflect in the UI
        try {
          const stateRes = await this.turnService.getState(matchId);
          const st = this.parseRpcPayload<GetStatePayload>(stateRes);
          const matchObj =
            st && st.match
              ? (st.match as {
                  creator?: string;
                  name?: string;
                  players?: string[];
                  started?: boolean;
                })
              : undefined;
          const creator: string | undefined = matchObj?.creator;
          const isSelf =
            !!creator && !!this.currentUserId && creator === this.currentUserId;
          if (Array.isArray(matchObj?.players) && matchObj.players.length > 0) {
            const usernameMap = await this.turnService.resolveUsernames(
              matchObj.players
            );
            const playerNames = matchObj.players.map(
              (id) => usernameMap[id] ?? id
            );
            this.lobbyView.setPlayers(playerNames);
            const creatorDisplay = creator ? usernameMap[creator] : undefined;
            this.lobbyView.setCreator(creator, isSelf, creatorDisplay);
          } else {
            let creatorDisplay: string | undefined;
            if (creator) {
              const single = await this.turnService.resolveUsernames([creator]);
              creatorDisplay = single[creator];
            }
            this.lobbyView.setCreator(creator, isSelf, creatorDisplay);
          }
          if (matchObj?.name) {
            this.lobbyView.setMatchName(matchObj.name);
            this.currentMatchName = matchObj.name;
          }
          if (typeof matchObj?.started === "boolean") {
            this.lobbyView.setMatchStarted(matchObj.started);
            if (matchObj.started) {
              this.showView("inMatch");
              this.scene.sleep("MainScene");
              this.scene.run("GameScene");
              return;
            }
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
    this.mainRoot = this.add.container(0, 0);

    this.titleText = this.add
      .text(0, 0, "Zarka", {
        color: "#ffffff",
        fontSize: "32px",
        fontStyle: "bold"
      })
      .setOrigin(0.5);
    this.mainRoot.add(this.titleText);

    this.statusText = this.add
      .text(0, 0, "Connecting...", {
        color: "#cccccc",
        fontSize: "16px",
        align: "center",
        wordWrap: { width: 500 }
      })
      .setOrigin(0.5);
    this.mainRoot.add(this.statusText);

    this.createMainButtons();
    this.layoutMain();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutMain, this);
    this.events.on(Phaser.Scenes.Events.WAKE, this.layoutMain, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutMain, this);
      this.events.off(Phaser.Scenes.Events.WAKE, this.layoutMain, this);
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
      SessionManager.attachSessionRefreshHandler(client);

      const unregisterSessionExpired = SessionManager.onSessionExpired(() => {
        this.logout("Your session has expired. Please log in again.");
      });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        unregisterSessionExpired();
      });

      this.turnService = new TurnService(client, session);
      this.registry.set("turnService", this.turnService);
      this.accountService = new AccountService(client, session);
      this.registry.set("accountService", this.accountService);
      this.setCurrentMatchId(this.currentMatchId);
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
          p.started !== undefined ? (p.started ? "started" : "waiting") : null
        ]
          .filter(Boolean)
          .join(", ");
        if (s) this.statusText.setText(`Settings sync: ${s}`);
        const view = this.lobbyView;
        if (!view) return;
        view.applySettings(p);
        if (Array.isArray(p.players)) {
          const players = [...p.players];
          if (players.length === 0) {
            view.setPlayers([]);
          } else if (this.turnService) {
            this.turnService
              .resolveUsernames(players)
              .then((map) => {
                const names = players.map((id) => map[id] ?? id);
                view.setPlayers(names);
              })
              .catch((e) => {
                console.warn("Failed to resolve player usernames", e);
                view.setPlayers(players);
              });
          } else {
            view.setPlayers(players);
          }
        }
        if (p.started && this.activeView === "inMatch") {
          this.scene.sleep("MainScene");
          this.scene.run("GameScene");
        }
      });
      this.turnService.setOnMatchRemoved(() => {
        const gameScene = this.scene.get("GameScene") as import("./GameScene").GameScene | undefined;
        if (gameScene && gameScene.isVictoryOverlayActive()) {
          return;
        }
        this.statusText.setText(
          "Match has been removed by the host. Returning to main menu."
        );
        if (
          this.scene.isActive("GameScene") ||
          this.scene.isSleeping("GameScene")
        ) {
          this.scene.stop("GameScene");
        }
        if (this.scene.isSleeping("MainScene")) {
          this.scene.wake("MainScene");
        }
        if (this.currentMatchId && this.turnService) {
          this.turnService
            .leaveRealtimeMatch(this.currentMatchId)
            .catch((e) => console.warn("Failed to leave realtime match", e));
        }
        this.setCurrentMatchId(null);
        this.currentMatchName = null;
        this.lobbyView.setPlayers([]);
        this.lobbyView.setCreator(undefined, false);
        this.lobbyView.setMatchInfo();
        this.lobbyView.setMatchStarted(false);
        this.showView("main");
      });
      this.statusText.setText("Authenticated. Use the buttons below.");

      // Instantiate Matches List view (hidden by default)
      this.matchesListView = new MatchesListView(this);
      this.matchesListView.setTurnService(this.turnService);
      this.matchesListView.setOnJoin(async (matchId: string) => {
        await this.joinMatch(matchId);
      });
      this.matchesListView.setOnBack(() => {
        this.showView("main");
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
            this.setCurrentMatchId(null);
            this.currentMatchName = null;
            this.lobbyView.setPlayers([]);
            this.lobbyView.setCreator(undefined, false);
            this.lobbyView.setMatchInfo();
            this.lobbyView.setMatchStarted(false);
            this.lobbyView.hide();
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
      this.myMatchesListView.setOnBack(() => {
        this.showView("main");
      });

      // Instantiate lobby view (hidden by default)
      this.lobbyView = new LobbyView(this);
      this.lobbyView.setOnBackToMenu(() => {
        this.showView("main");
        this.statusText.setText("Back to main menu (still in match).");
      });
      this.lobbyView.setOnLeave(async () => {
        if (!this.turnService || !this.currentMatchId) return;
        const res = await this.turnService.leaveMatch(this.currentMatchId);
        const parsed = this.parseRpcPayload<LeaveMatchPayload>(res);
        if (parsed && parsed.ok) {
          // Also leave the realtime match to remove presence from state
          await this.turnService.leaveRealtimeMatch(this.currentMatchId);
          this.setCurrentMatchId(null);
          this.currentMatchName = null;
          this.lobbyView.setPlayers([]);
          this.lobbyView.setCreator(undefined, false);
          this.lobbyView.setMatchInfo();
          this.lobbyView.setMatchStarted(false);
          this.showView("main");
          this.statusText.setText("Left match.");
        } else {
          this.statusText.setText("leave_match error (see console).");
          console.log("leave_match response:", parsed);
        }
      });
      this.lobbyView.setOnEndTurn(async () => {
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
      this.lobbyView.setOnStartMatch(async () => {
        if (!this.turnService || !this.currentMatchId) return;
        try {
          const res = await this.turnService.startMatch(this.currentMatchId);
          const parsed = this.parseRpcPayload<StartMatchPayload>(res);
          if (parsed && parsed.ok) {
            this.lobbyView.setMatchStarted(true);
            if (parsed.already_started) {
              this.statusText.setText("Match was already started.");
            } else {
              this.statusText.setText("Match started.");
            }
            this.scene.sleep("MainScene");
            this.scene.run("GameScene");
          } else {
            this.statusText.setText("start_match error (see console).");
            console.log("start_match response:", parsed);
          }
        } catch (e) {
          console.error("start_match error", e);
          this.statusText.setText("start_match error (see console).");
        }
      });
      this.lobbyView.setOnSettingsChange(async (s) => {
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
      this.lobbyView.setOnRemoveMatch(async () => {
        if (!this.turnService || !this.currentMatchId) return;
        try {
          const res = await this.turnService.removeMatch(this.currentMatchId);
          const parsed = this.parseRpcPayload<RemoveMatchPayload>(res);
          if (parsed && parsed.ok) {
            await this.turnService.leaveRealtimeMatch(this.currentMatchId);
            this.setCurrentMatchId(null);
            this.currentMatchName = null;
            this.lobbyView.setPlayers([]);
            this.lobbyView.setCreator(undefined, false);
            this.lobbyView.setMatchInfo();
            this.lobbyView.setMatchStarted(false);
            this.showView("main");
            this.statusText.setText("Match removed successfully.");
          } else {
            this.statusText.setText("remove_match error (see console).");
            console.log("remove_match response:", parsed);
          }
        } catch (e) {
          console.error("remove_match error", e);
          this.statusText.setText("Failed to remove match (see console).");
        }
      });

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

  private setCurrentMatchId(matchId: string | null) {
    this.currentMatchId = matchId;
    this.registry.set("currentMatchId", matchId);
    this.registry.set("currentMatchMap", null);
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
    if (view === "main") {
      this.layoutMain();
    }
    this.applyViewVisibility();
  }

  private applyViewVisibility() {
    const isMain = this.activeView === "main";
    if (this.mainRoot) {
      this.mainRoot.setVisible(isMain).setActive(isMain);
    }

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
      if (this.lobbyView) {
        if (this.activeView === "inMatch") this.lobbyView.show();
        else this.lobbyView.hide();
      }
    } catch (e) {
      console.warn("applyViewVisibility: view toggle error", e);
    }
  }

  private createMainButtons() {
    const createMatchButton = makeButton(
      this,
      0,
      0,
      "Create Match",
      async () => {
        if (!this.turnService) throw new Error("No service");
        try {
          const createRes = await this.turnService.createMatch(2);
          const parsed = this.parseRpcPayload<CreateMatchPayload>(createRes);
          if (!parsed || !parsed.match_id)
            throw new Error("No match_id returned");
          this.setCurrentMatchId(parsed.match_id);
          const createdName = parsed.name ?? "Untitled Match";
          this.currentMatchName = createdName;
          this.statusText.setText(`Match created: ${createdName}`);
          if (this.lobbyView) {
            this.lobbyView.setMatchName(createdName);
            this.lobbyView.setMatchStarted(parsed.started ?? false);
          }

          // Auto-join the match we just created
          await this.joinMatch(parsed.match_id);
        } catch (e: unknown) {
          console.error("create_match error", e);
          let code: number | undefined;
          let msg: string | undefined;

          if (e && typeof (e as { json?: unknown }).json === "function") {
            try {
              const json = await (e as Response).json();
              if (typeof json?.code === "number") code = json.code;
              if (typeof json?.message === "string") msg = json.message;
            } catch {
              // Ignore JSON parse failure
            }
          } else if (e && typeof e === "object") {
            const errObj = e as { code?: number; message?: string };
            if (typeof errObj.code === "number") code = errObj.code;
            if (typeof errObj.message === "string") msg = errObj.message;
          } else if (e instanceof Error) {
            msg = e.message;
          }

          if (code === 8) {
            this.statusText.setText(msg || "Maximum of 3 matches per user reached");
          } else {
            this.statusText.setText(msg ? `Error: ${msg}` : "Failed to create match (see console).");
          }
        }
      },
      ["main"]
    ).setOrigin(0.5);

    const listMatchesButton = makeButton(
      this,
      0,
      0,
      "List Matches",
      () => {
        this.showView("matchList");
      },
      ["main"]
    ).setOrigin(0.5);

    const myMatchesButton = makeButton(
      this,
      0,
      0,
      "My Matches",
      () => {
        this.showView("myMatchList");
      },
      ["main"]
    ).setOrigin(0.5);

    const accountSettingsButton = makeButton(
      this,
      0,
      0,
      "Account Settings",
      () => {
        this.scene.start("AccountScene", {
          client: this.turnService?.getClient(),
          session: this.turnService?.getSession()
        });
      },
      ["main"]
    ).setOrigin(0.5);

    const logoutButton = makeButton(
      this,
      0,
      0,
      "Logout",
      () => {
        this.logout();
      },
      ["main"]
    ).setOrigin(0.5);

    this.mainButtons = [
      createMatchButton,
      listMatchesButton,
      myMatchesButton,
      accountSettingsButton,
      logoutButton
    ];
    this.mainRoot.add(this.mainButtons);
    this.buttons.push(...this.mainButtons);
  }

  private layoutMain(): void {
    const viewportWidth = this.scale.width;
    const viewportHeight = this.scale.height;
    const contentHeight =
      MAIN_LAYOUT.controlsY +
      Math.max(0, this.mainButtons.length - 1) * MAIN_LAYOUT.buttonGap +
      32;
    const top = Math.max(
      MAIN_LAYOUT.minTop,
      (viewportHeight - contentHeight) / 2
    );

    this.mainRoot.setPosition(viewportWidth / 2, top);
    this.titleText.setPosition(0, MAIN_LAYOUT.titleY);
    this.statusText.setPosition(0, MAIN_LAYOUT.statusY);

    this.mainButtons.forEach((button, index) => {
      button.setPosition(
        0,
        MAIN_LAYOUT.controlsY + index * MAIN_LAYOUT.buttonGap
      );
    });
  }

  private logout(message?: string) {
    if (this.scene.isActive("GameScene") || this.scene.isSleeping("GameScene")) {
      this.scene.stop("GameScene");
    }

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
    this.setCurrentMatchId(null);
    this.currentUserId = null;
    this.registry.set("currentUserId", null);
    this.registry.set("turnService", null);
    this.registry.set("accountService", null);
    this.scene.start("LoginScene", message ? { message } : undefined);
  }
}
