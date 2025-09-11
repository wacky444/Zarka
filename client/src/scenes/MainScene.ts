import Phaser from "phaser";
import { RpcResponse } from "@heroiclabs/nakama-js";
import { initNakama } from "../services/nakama";
import { TurnService } from "../services/turnService";
import { makeButton } from "../ui/button";

export class MainScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private turnService: TurnService | null = null;
  private currentMatchId: string | null = null;
  private moveCounter = 0;

  constructor() {
    super("MainScene");
  }

  preload() {}

  async create() {
    this.statusText = this.add.text(10, 10, "Connecting...", {
      color: "#ffffff",
    });

    try {
      const { client, session } = await initNakama();
      this.turnService = new TurnService(client, session);
      this.statusText.setText("Authenticated. Use the buttons below.");

      // Buttons
      makeButton(this, 10, 40, "Create Match", async () => {
        if (!this.turnService) throw new Error("No service");
        const createRes = await this.turnService.createMatch(2);
        interface CreateMatchPayload {
          match_id: string;
          size: number;
        }
        const parsed = this.parseRpcPayload<CreateMatchPayload>(createRes);
        if (!parsed || !parsed.match_id)
          throw new Error("No match_id returned");
        this.currentMatchId = parsed.match_id;
        this.moveCounter = 0;
        this.statusText.setText(`Match created: ${this.currentMatchId}`);
      });

      makeButton(this, 10, 80, "Join Match", async () => {
        if (!this.turnService) throw new Error("No service");
        if (!this.currentMatchId) {
          this.statusText.setText("Create a match first.");
          return;
        }
        const res = await this.turnService.joinMatch(this.currentMatchId);
        interface JoinMatchPayload {
          ok?: boolean;
          joined?: boolean;
          players?: string[];
          size?: number;
          match_id?: string;
          error?: string;
        }
        const parsed = this.parseRpcPayload<JoinMatchPayload>(res);
        if (parsed && parsed.ok) {
          const count = Array.isArray(parsed.players)
            ? parsed.players.length
            : undefined;
          this.statusText.setText(
            `Join OK. Players: ${count ?? "?"}/${parsed.size ?? "?"}`
          );
        } else {
          this.statusText.setText("join_match error (see console).");
          console.log("join_match response:", parsed);
        }
      });

      makeButton(this, 10, 120, "Submit Turn", async () => {
        if (!this.turnService) throw new Error("No service");
        if (!this.currentMatchId) {
          this.statusText.setText("Create a match first.");
          return;
        }
        const move = { n: ++this.moveCounter, ts: Date.now() };
        const res = await this.turnService.submitTurn(
          this.currentMatchId,
          move
        );
        interface SubmitTurnPayload {
          ok?: boolean;
          turn?: number;
          [k: string]: unknown;
        }
        const parsed = this.parseRpcPayload<SubmitTurnPayload>(res);
        if (parsed && parsed.ok) {
          this.statusText.setText(`Turn submitted. Turn #: ${parsed.turn}`);
        } else {
          this.statusText.setText("submit_turn error (see console).");
        }
      });

      makeButton(this, 10, 160, "Get State", async () => {
        if (!this.turnService) throw new Error("No service");
        if (!this.currentMatchId) {
          this.statusText.setText("Create a match first.");
          return;
        }
        const res = await this.turnService.getState(this.currentMatchId);
        interface GetStatePayload {
          error?: string;
          match?: unknown;
          turns?: unknown[];
        }
        const parsed = this.parseRpcPayload<GetStatePayload>(res);
        if (parsed.error) {
          this.statusText.setText("State error: " + parsed.error);
        } else {
          const count = Array.isArray(parsed.turns) ? parsed.turns.length : 0;
          this.statusText.setText(`State OK. Turns: ${count}`);
        }
      });

      // Open the new Game Scene showcasing a hex grid
      makeButton(this, 10, 200, "Open Game Scene", () => {
        this.scene.start("GameScene");
      });
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
}
