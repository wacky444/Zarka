import Phaser from "phaser";
import { Client, Session } from "@heroiclabs/nakama-js";
import { makeButton } from "../ui/button";
import { SessionManager } from "../services/sessionManager";
import { FacebookService } from "../services/facebookService";
import { GridSelect, type GridSelectItem } from "../ui/GridSelect";
import { assetPath } from "../utils/assetPath";
import type {
  GetUserAccountPayload,
  UpdateSkinPayload,
  UserAccount,
  Skin,
  SkinCategory,
} from "@shared";
import { SKIN_OPTIONS, SKIN_CATEGORIES, DEFAULT_SKIN } from "@shared";
import {
  createSkinLayers,
  updateSkinLayers,
  type SkinLayers,
} from "../ui/PlayerSkinRenderer";

function buildSkinItems(category: SkinCategory): GridSelectItem[] {
  const options = SKIN_OPTIONS[category];
  return options.map((frame) => {
    const name = frame.replace(/\.png$/, "").replace(/_/g, " ");
    return {
      id: frame,
      name,
      texture: "char",
      frame,
      iconScale: 2,
    };
  });
}

function categoryLabel(cat: SkinCategory): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

export class AccountScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private client!: Client;
  private session!: Session;
  private userInfoText!: Phaser.GameObjects.Text;
  private playerStatsText!: Phaser.GameObjects.Text;
  private facebookStatusText!: Phaser.GameObjects.Text;
  private skinSelectors: Partial<Record<SkinCategory, GridSelect>> = {};
  private previewLayers: SkinLayers = {};
  private currentSkin: Skin = { ...DEFAULT_SKIN };
  private saving = false;

  constructor() {
    super("AccountScene");
  }

  preload() {
    if (!this.textures.exists("char")) {
      this.load.atlasXML(
        "char",
        assetPath("assets/spritesheets/roguelikeChar_transparent.png"),
        assetPath("assets/spritesheets/roguelikeChar_transparent.xml"),
      );
    }
  }

  async create(data?: { client?: Client; session?: Session }) {
    if (!data || !data.client || !data.session) {
      this.scene.start("LoginScene");
      return;
    }

    this.client = data.client;
    this.session = data.session;

    this.add
      .text(400, 30, "Account Settings", {
        color: "#ffffff",
        fontSize: "28px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(400, 60, "", {
        color: "#cccccc",
        fontSize: "16px",
      })
      .setOrigin(0.5);

    this.add
      .text(400, 90, "Account Information", {
        color: "#ffffff",
        fontSize: "18px",
      })
      .setOrigin(0.5);

    this.userInfoText = this.add
      .text(400, 115, "", {
        color: "#cccccc",
        fontSize: "13px",
      })
      .setOrigin(0.5);

    this.add
      .text(400, 155, "Player Stats", {
        color: "#ffffff",
        fontSize: "18px",
      })
      .setOrigin(0.5);

    this.playerStatsText = this.add
      .text(400, 185, "", {
        color: "#cccccc",
        fontSize: "13px",
        align: "center",
        wordWrap: { width: 740 },
      })
      .setOrigin(0.5);

    this.add
      .text(400, 230, "Skin Customization", {
        color: "#ffffff",
        fontSize: "18px",
      })
      .setOrigin(0.5);

    this.createSkinPreview(110, 340);
    this.createSkinSelectors(230, 255);

    const fbY = 480;
    this.add
      .text(400, fbY, "Facebook Account", {
        color: "#ffffff",
        fontSize: "18px",
      })
      .setOrigin(0.5);

    this.facebookStatusText = this.add
      .text(400, fbY + 25, "Checking Facebook link status...", {
        color: "#cccccc",
        fontSize: "13px",
      })
      .setOrigin(0.5);

    makeButton(this, 300, fbY + 55, "Link Facebook", async () => {
      await this.linkFacebook();
    }).setOrigin(0.5);

    makeButton(this, 500, fbY + 55, "Unlink Facebook", async () => {
      await this.unlinkFacebook();
    }).setOrigin(0.5);

    makeButton(this, 400, 570, "Back to Game", () => {
      this.scene.start("MainScene", {
        client: this.client,
        session: this.session,
      });
    }).setOrigin(0.5);

    await this.loadUserInfo();
  }

  private createSkinPreview(x: number, y: number) {
    this.add
      .text(x, y - 80, "Preview", {
        color: "#aaaaaa",
        fontSize: "13px",
      })
      .setOrigin(0.5);

    this.previewLayers = createSkinLayers(this, x, y, this.currentSkin, 6);
  }

  private updatePreview() {
    updateSkinLayers(this.previewLayers, this.currentSkin, this.textures);
  }

  private createSkinSelectors(startX: number, startY: number) {
    const selectorWidth = 340;
    const rowHeight = 44;
    const gap = 4;

    const categoriesToShow = SKIN_CATEGORIES.filter(
      (cat) => SKIN_OPTIONS[cat].length > 0,
    );

    for (let i = 0; i < categoriesToShow.length; i++) {
      const cat = categoriesToShow[i];
      const y = startY + i * (rowHeight + gap);

      const selector = new GridSelect(this, startX, y, {
        width: selectorWidth,
        height: rowHeight,
        columns: 6,
        title: `Select ${categoryLabel(cat)}`,
        subtitle: `Choose a ${cat} style`,
        placeholder: categoryLabel(cat),
        cellHeight: 96,
        modalWidth: 500,
        modalHeight: 380,
        autoSelectFirst: false,
      });

      const items = buildSkinItems(cat);
      selector.setItems(items);
      selector.setValue(this.currentSkin[cat], false);

      selector.on("change", (id: string | null) => {
        if (id) {
          this.currentSkin = { ...this.currentSkin, [cat]: id };
          this.updatePreview();
          this.saveSkin();
        }
      });

      this.skinSelectors[cat] = selector;
    }
  }

  private applySkinToSelectors(skin: Skin) {
    this.currentSkin = { ...skin };
    for (const cat of SKIN_CATEGORIES) {
      const selector = this.skinSelectors[cat];
      if (selector && skin[cat]) {
        selector.setValue(skin[cat], false);
      }
    }
    this.updatePreview();
  }

  private async saveSkin() {
    if (this.saving) return;
    this.saving = true;
    try {
      const rpcRes = await this.client.rpc(this.session, "update_skin", {
        skin: this.currentSkin,
      });
      const raw = (rpcRes as unknown as { payload?: unknown }).payload;
      const result = (typeof raw === "string" ? JSON.parse(raw) : raw) as
        | UpdateSkinPayload
        | undefined;
      if (result?.ok) {
        this.statusText.setText("Skin saved!");
      } else {
        this.statusText.setText(`Save failed: ${result?.error ?? "unknown"}`);
      }
    } catch (e) {
      console.error("Failed to save skin:", e);
      this.statusText.setText("Failed to save skin");
    } finally {
      this.saving = false;
    }
  }

  private async loadUserInfo() {
    try {
      const account = await this.client.getAccount(this.session);

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

        this.playerStatsText.setText(lines.join("\n"));

        const skin = userAccount.cosmetics.selectedSkinId;
        if (skin && typeof skin === "object") {
          this.applySkinToSelectors(skin);
        }
      } else {
        this.playerStatsText.setText("Stats unavailable");
      }

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

      await SessionManager.linkFacebookAccount(
        this.client,
        this.session,
        authResponse.accessToken,
      );

      this.statusText.setText("Facebook account linked successfully!");
      await this.loadUserInfo();
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
      await this.loadUserInfo();
    } catch (error) {
      console.error("Error unlinking Facebook:", error);
      this.statusText.setText("Failed to unlink Facebook account");
    }
  }
}
