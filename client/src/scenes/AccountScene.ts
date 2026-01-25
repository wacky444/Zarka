import Phaser from "phaser";
import { Client, Session } from "@heroiclabs/nakama-js";
import { makeButton } from "../ui/button";
import { SessionManager } from "../services/sessionManager";
import { FacebookService } from "../services/facebookService";
import type { GetUserAccountPayload, UserAccount } from "@shared";

export class AccountScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private client!: Client;
  private session!: Session;
  private userInfoText!: Phaser.GameObjects.Text;
  private playerStatsText!: Phaser.GameObjects.Text;
  private facebookStatusText!: Phaser.GameObjects.Text;

  constructor() {
    super("AccountScene");
  }

  preload() {}

  async create(data?: { client?: Client; session?: Session }) {
    if (!data || !data.client || !data.session) {
      this.scene.start("LoginScene");
      return;
    }

    this.client = data.client;
    this.session = data.session;

    // Title
    this.add
      .text(400, 50, "Account Settings", {
        color: "#ffffff",
        fontSize: "28px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(400, 100, "", {
        color: "#cccccc",
        fontSize: "16px",
      })
      .setOrigin(0.5);

    // User Info Section
    this.add
      .text(400, 150, "Account Information", {
        color: "#ffffff",
        fontSize: "20px",
      })
      .setOrigin(0.5);

    this.userInfoText = this.add
      .text(400, 180, "", {
        color: "#cccccc",
        fontSize: "14px",
      })
      .setOrigin(0.5);

    // Player Stats Section
    this.add
      .text(400, 250, "Player Stats", {
        color: "#ffffff",
        fontSize: "20px",
      })
      .setOrigin(0.5);

    this.playerStatsText = this.add
      .text(400, 300, "", {
        color: "#cccccc",
        fontSize: "14px",
        align: "center",
        wordWrap: { width: 740 },
      })
      .setOrigin(0.5);

    // Facebook Account Section
    const facebookSectionOffsetY = 200;
    this.add
      .text(400, 250 + facebookSectionOffsetY, "Facebook Account", {
        color: "#ffffff",
        fontSize: "20px",
      })
      .setOrigin(0.5);

    this.facebookStatusText = this.add
      .text(
        400,
        280 + facebookSectionOffsetY,
        "Checking Facebook link status...",
        {
          color: "#cccccc",
          fontSize: "14px",
        },
      )
      .setOrigin(0.5);

    // Link Facebook Button
    makeButton(
      this,
      300,
      320 + facebookSectionOffsetY,
      "Link Facebook",
      async () => {
        await this.linkFacebook();
      },
    ).setOrigin(0.5);

    // Unlink Facebook Button
    makeButton(
      this,
      500,
      320 + facebookSectionOffsetY,
      "Unlink Facebook",
      async () => {
        await this.unlinkFacebook();
      },
    ).setOrigin(0.5);

    // Back Button
    makeButton(this, 400, 570, "Back to Game", () => {
      this.scene.start("MainScene", {
        client: this.client,
        session: this.session,
      });
    }).setOrigin(0.5);

    // Load user information
    await this.loadUserInfo();
  }

  private async loadUserInfo() {
    try {
      // Get account information
      const account = await this.client.getAccount(this.session);

      // Get game-specific account data (metadata + stats)
      let userAccount: UserAccount | undefined;
      try {
        const rpcRes = await this.client.rpc(
          this.session,
          "get_user_account",
          {},
        );
        const raw = (rpcRes as unknown as { payload?: unknown }).payload;
        const rpcPayload = (typeof raw === "string" ? JSON.parse(raw) : raw) as
          | GetUserAccountPayload
          | undefined;
        if (rpcPayload?.ok && rpcPayload.account) {
          userAccount = rpcPayload.account;
        }
      } catch (e) {
        console.warn("Failed to load user account metadata:", e);
      }

      let userInfo = `User ID: ${this.session.user_id}\n`;
      if (account.user?.username) {
        userInfo += `Username: ${account.user.username}\n`;
      }
      if (account.email) {
        userInfo += `Email: ${account.email}\n`;
      }

      if (userAccount?.displayName) {
        userInfo += `Display Name: ${userAccount.displayName}\n`;
      }

      this.userInfoText.setText(userInfo);

      if (userAccount) {
        const s = userAccount.stats;
        const c = userAccount.cosmetics;

        const unlockedSkinsCount = Array.isArray(c.unlockedSkinIds)
          ? c.unlockedSkinIds.length
          : undefined;

        const lines: string[] = [];
        lines.push(
          `Matches: ${s.matchesPlayed} | Wins: ${s.wins} | Losses: ${s.losses} | Draws: ${s.draws}`,
        );
        lines.push(
          `ELO: ${s.elo} (peak ${s.highestElo}) | Rank: ${s.rankTier ?? "unranked"}`,
        );
        lines.push(
          `Win streak: ${s.currentWinStreak} (best ${s.bestWinStreak})`,
        );
        lines.push(
          `Skin: ${c.selectedSkinId}${typeof unlockedSkinsCount === "number" ? ` (unlocked ${unlockedSkinsCount})` : ""}`,
        );

        this.playerStatsText.setText(lines.join("\n"));
      } else {
        this.playerStatsText.setText("Stats unavailable");
      }

      // Check Facebook link status
      const hasFacebook = account.devices?.some((device) =>
        device.id?.startsWith("facebook:"),
      );
      this.facebookStatusText.setText(
        hasFacebook
          ? "✓ Facebook account is linked"
          : "Facebook account is not linked",
      );
    } catch (error) {
      console.error("Error loading user info:", error);
      this.statusText.setText("Error loading account information");
    }
  }

  private async linkFacebook() {
    this.statusText.setText("Linking Facebook account...");

    try {
      // Initialize Facebook and login
      const initialized = await FacebookService.initialize();
      if (!initialized) {
        this.statusText.setText("Facebook SDK not available");
        return;
      }

      const authResponse = await FacebookService.login();
      if (!authResponse) {
        this.statusText.setText("Facebook login cancelled");
        return;
      }

      // Link the Facebook account
      await SessionManager.linkFacebookAccount(
        this.client,
        this.session,
        authResponse.accessToken,
      );

      this.statusText.setText("Facebook account linked successfully!");
      await this.loadUserInfo(); // Refresh user info
    } catch (error) {
      console.error("Error linking Facebook:", error);
      this.statusText.setText("Failed to link Facebook account");
    }
  }

  private async unlinkFacebook() {
    this.statusText.setText("Unlinking Facebook account...");

    try {
      await SessionManager.unlinkFacebookAccount(this.client, this.session);
      this.statusText.setText("Facebook account unlinked successfully!");
      await this.loadUserInfo(); // Refresh user info
    } catch (error) {
      console.error("Error unlinking Facebook:", error);
      this.statusText.setText("Failed to unlink Facebook account");
    }
  }
}
