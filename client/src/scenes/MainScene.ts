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
  RemoveMatchPayload,
} from "@shared";

export class MainScene extends Phaser.Scene {
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
          "Realtime connection failed. Please try again.",
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
        }`,
      );
      if (this.lobbyView) {
        this.lobbyView.setMatchInfo(matchId, displayName);
        if (typeof parsed.started === "boolean") {
          this.lobbyView.setMatchStarted(parsed.started);
        }
        if (Array.isArray(parsed.players) && parsed.players.length > 0) {
          try {
            const usernameMap = await this.turnService.resolveUsernames(
              parsed.players,
            );
            const playerNames = parsed.players.map(
              (id) => usernameMap[id] ?? id,
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
              matchObj.players,
            );
            const playerNames = matchObj.players.map(
              (id) => usernameMap[id] ?? id,
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

  async create(data?: {
    client?: Client;
    session?: Session;
    spectatorMode?: boolean;
    spectatorMatchId?: string;
  }) {
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
      this.registry.set("turnService", this.turnService);
      this.accountService = new AccountService(client, session);
      this.registry.set("accountService", this.accountService);
      this.setCurrentMatchId(this.currentMatchId);
      this.currentUserId = session.user_id ?? null;
      this.registry.set("currentUserId", this.currentUserId);
      const spectatorMode = data?.spectatorMode === true;
      this.registry.set("spectatorMode", spectatorMode);
      if (spectatorMode) {
        const matchId = data?.spectatorMatchId?.trim();
        if (!matchId) {
          this.statusText.setText("Spectator match ID missing.");
          return;
        }
        this.setCurrentMatchId(matchId);
        this.statusText.setText(`Spectating match ${matchId}`);
        this.scene.sleep("MainScene");
        this.scene.run("GameScene");
        return;
      }
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
          p.started !== undefined ? (p.started ? "started" : "waiting") : null,
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
        this.statusText.setText(
          "Match has been removed by the host. Returning to main menu.",
        );
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

      // Instantiate lobby view (hidden by default)
      this.lobbyView = new LobbyView(this);
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
          move,
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
            `Settings updated: name="${s.name}" players=${s.players}, ${s.cols}x${s.rows}`,
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
          },
          ["main"],
        ),
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
          ["main"],
        ),
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
          ["main"],
        ),
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
          ["main"],
        ),
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
          ["main"],
        ),
      );

      // View-specific buttons for MatchesList
      this.buttons.push(
        makeButton(
          this,
          10,
          70,
          "Refresh",
          () => this.matchesListView.refresh(),
          ["matchList"],
        ),
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
          ["matchList"],
        ),
      );

      // View-specific buttons for MyMatchesList
      this.buttons.push(
        makeButton(
          this,
          10,
          70,
          "Refresh",
          () => this.myMatchesListView.refresh(),
          ["myMatchList"],
        ),
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
          ["myMatchList"],
        ),
      );

      // Placeholder: inMatch view buttons can be added and tagged with ["inMatch"]
      this.buttons.push(
        makeButton(
          this,
          630,
          80,
          "Back to Menu",
          () => {
            this.showView("main");
            this.statusText.setText("Back to main menu (still in match).");
          },
          ["inMatch"],
        ),
      );

      // Initialize in main view
      this.applyViewVisibility();
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);

      // Provide user-friendly error message for server connection issues
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        this.statusText.setText(
          "Server unavailable. Please check your connection or try again later.",
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
      if (this.lobbyView) {
        if (this.activeView === "inMatch") this.lobbyView.show();
        else this.lobbyView.hide();
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
    this.setCurrentMatchId(null);
    this.currentUserId = null;
    this.registry.set("currentUserId", null);
    this.registry.set("turnService", null);
    this.registry.set("accountService", null);
    this.scene.start("LoginScene");
  }
}
