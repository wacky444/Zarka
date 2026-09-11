import Phaser from "phaser";
import { Client, Session } from "@heroiclabs/nakama-js";
import { makeButton, type UIButton } from "../ui/button";
import { SessionManager } from "../services/sessionManager";
import { FacebookService } from "../services/facebookService";
import type { AccountService } from "../services/AccountService";
import type { TurnService } from "../services/turnService";
import { GridSelect, type GridSelectItem } from "../ui/GridSelect";
import { assetPath } from "../utils/assetPath";
import type {
  GetUserAccountPayload,
  UpdateSkinPayload,
  UserAccount,
  Skin,
  SkinCategory
} from "@shared";
import { SKIN_OPTIONS, SKIN_CATEGORIES, DEFAULT_SKIN } from "@shared";
import {
  createSkinLayers,
  updateSkinLayers,
  type SkinLayers
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
      iconScale: 2
    };
  });
}

function categoryLabel(cat: SkinCategory): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

type ScrollablePanelInstance = Phaser.GameObjects.GameObject & {
  layout?: () => void;
  setMinSize?: (width: number, height: number) => void;
  setSize?: (width: number, height: number) => void;
  setPosition?: (x: number, y: number) => void;
};

const ACCOUNT_LAYOUT = {
  maxWidth: 760,
  horizontalPadding: 20,
  sectionGap: 16,
  narrowSkinBreakpoint: 620,
  previewSize: 96,
  selectorGap: 8
};

export class AccountScene extends Phaser.Scene {
  private accountRoot!: Phaser.GameObjects.Container;
  private accountScrollPanel!: ScrollablePanelInstance;
  private titleText!: Phaser.GameObjects.Text;
  private skinStatsTitle!: Phaser.GameObjects.Text;
  private skinTitle!: Phaser.GameObjects.Text;
  private facebookTitle!: Phaser.GameObjects.Text;
  private linkFacebookButton!: UIButton;
  private unlinkFacebookButton!: UIButton;
  private backButton!: UIButton;
  private previewLabel!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private client!: Client;
  private session!: Session;
  private userInfoText!: Phaser.GameObjects.Text;
  private displayNameText!: Phaser.GameObjects.Text;
  private changeDisplayNameButton!: UIButton;
  private currentDisplayName = "";
  private playerStatsText!: Phaser.GameObjects.Text;
  private facebookStatusText!: Phaser.GameObjects.Text;
  private skinSelectors: Partial<Record<SkinCategory, GridSelect>> = {};
  private skinCategoryOrder: SkinCategory[] = [];
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
        assetPath("assets/spritesheets/roguelikeChar_transparent.xml")
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

    this.accountRoot = this.add.container(0, 0);
    this.accountScrollPanel = this.rexUI.add.scrollablePanel({
      x: 0,
      y: 0,
      width: this.scale.width,
      height: this.scale.height,
      scrollMode: 0,
      panel: {
        child: this.accountRoot,
        mask: true
      },
      slider: {
        track: this.rexUI.add.roundRectangle(0, 0, 4, 120, 2, 0x1f2a4a),
        thumb: this.rexUI.add.roundRectangle(0, 0, 6, 36, 3, 0x3b82f6)
      },
      scroller: {
        threshold: 10,
        slidingDeceleration: 5000,
        backDeceleration: 2000,
        pointerOutRelease: true
      },
      mouseWheelScroller: {
        focus: 2,
        speed: 0.35
      },
      space: { left: 0, right: 8, top: 0, bottom: 0, panel: 8 }
    }) as ScrollablePanelInstance;

    this.titleText = this.add
      .text(0, 0, "Account Settings", {
        color: "#ffffff",
        fontSize: "28px",
        fontStyle: "bold"
      })
      .setOrigin(0.5);
    this.accountRoot.add(this.titleText);

    this.statusText = this.add
      .text(0, 0, "", {
        color: "#cccccc",
        fontSize: "16px",
        align: "center"
      })
      .setOrigin(0.5);
    this.accountRoot.add(this.statusText);

    this.userInfoText = this.add
      .text(0, 0, "", {
        color: "#cccccc",
        fontSize: "13px",
        align: "center"
      })
      .setOrigin(0.5);
    this.accountRoot.add(this.userInfoText);

    this.displayNameText = this.add
      .text(0, 0, "", {
        color: "#cccccc",
        fontSize: "13px",
        align: "center"
      })
      .setOrigin(0.5, 0.5);
    this.accountRoot.add(this.displayNameText);

    this.changeDisplayNameButton = makeButton(
      this,
      0,
      0,
      "Change",
      async () => {
        await this.promptChangeDisplayName();
      },
      ["account"]
    );
    this.changeDisplayNameButton.setOrigin(0.5, 0.5);
    this.changeDisplayNameButton.setFontSize("13px");
    this.changeDisplayNameButton.setPadding(4, 2);
    this.changeDisplayNameButton.setVisible(false);
    this.accountRoot.add(this.changeDisplayNameButton);

    this.skinStatsTitle = this.add
      .text(0, 0, "Player Stats", {
        color: "#ffffff",
        fontSize: "18px"
      })
      .setOrigin(0.5);
    this.accountRoot.add(this.skinStatsTitle);

    this.playerStatsText = this.add
      .text(0, 0, "", {
        color: "#cccccc",
        fontSize: "13px",
        align: "center"
      })
      .setOrigin(0.5);
    this.accountRoot.add(this.playerStatsText);

    this.skinTitle = this.add
      .text(0, 0, "Skin Customization", {
        color: "#ffffff",
        fontSize: "18px"
      })
      .setOrigin(0.5);
    this.accountRoot.add(this.skinTitle);

    this.createSkinPreview(0, 0);
    this.createSkinSelectors(0, 0);

    this.facebookTitle = this.add
      .text(0, 0, "Facebook Account", {
        color: "#ffffff",
        fontSize: "18px"
      })
      .setOrigin(0.5);
    this.accountRoot.add(this.facebookTitle);

    this.facebookStatusText = this.add
      .text(0, 0, "Checking Facebook link status...", {
        color: "#cccccc",
        fontSize: "13px",
        align: "center"
      })
      .setOrigin(0.5);
    this.accountRoot.add(this.facebookStatusText);

    this.linkFacebookButton = makeButton(this, 0, 0, "Link Facebook", async () => {
      await this.linkFacebook();
    }).setOrigin(0.5);
    this.accountRoot.add(this.linkFacebookButton);

    this.unlinkFacebookButton = makeButton(
      this,
      0,
      0,
      "Unlink Facebook",
      async () => {
        await this.unlinkFacebook();
      }
    ).setOrigin(0.5);
    this.accountRoot.add(this.unlinkFacebookButton);

    this.backButton = makeButton(this, 0, 0, "Back to Game", () => {
      this.scene.start("MainScene", {
        client: this.client,
        session: this.session
      });
    }).setOrigin(0.5);
    this.accountRoot.add(this.backButton);

    this.layoutAccount();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutAccount, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutAccount, this);
    });

    await this.loadUserInfo();
  }

  private layoutAccount(): void {
    const viewportWidth = this.scale.width;
    const viewportHeight = this.scale.height;
    const contentWidth = Math.min(
      ACCOUNT_LAYOUT.maxWidth,
      Math.max(
        280,
        viewportWidth - ACCOUNT_LAYOUT.horizontalPadding * 2
      )
    );
    const contentLeft = (viewportWidth - contentWidth) / 2;
    const centerX = contentWidth / 2;
    const contentTop = ACCOUNT_LAYOUT.horizontalPadding;

    this.accountRoot.setPosition(contentLeft, contentTop);
    let cursorY = 0;

    this.titleText.setPosition(centerX, cursorY);
    cursorY += this.titleText.height + 8;

    this.statusText.setWordWrapWidth(contentWidth, true);
    this.statusText.setPosition(centerX, cursorY);
    cursorY += this.statusText.height + 10;

    this.userInfoText.setWordWrapWidth(contentWidth, true);
    this.userInfoText.setPosition(centerX, cursorY);
    cursorY += this.userInfoText.height + 8;

    this.displayNameText.setPosition(centerX, cursorY);
    cursorY += this.displayNameText.height + 6;
    if (this.changeDisplayNameButton.visible) {
      this.changeDisplayNameButton.setPosition(centerX, cursorY);
      cursorY += this.changeDisplayNameButton.height + ACCOUNT_LAYOUT.sectionGap;
    }

    this.skinStatsTitle.setPosition(centerX, cursorY);
    cursorY += this.skinStatsTitle.height + 6;
    this.playerStatsText.setWordWrapWidth(contentWidth, true);
    this.playerStatsText.setPosition(centerX, cursorY);
    cursorY += this.playerStatsText.height + ACCOUNT_LAYOUT.sectionGap;

    this.skinTitle.setPosition(centerX, cursorY);
    cursorY += this.skinTitle.height + 12;

    const narrowSkinLayout = contentWidth < ACCOUNT_LAYOUT.narrowSkinBreakpoint;
    const previewColumnWidth = ACCOUNT_LAYOUT.previewSize + 40;
    const previewTop = cursorY;
    let selectorX = 0;
    let selectorY = cursorY;
    let selectorWidth = contentWidth;
    const previewBottom = previewTop + ACCOUNT_LAYOUT.previewSize + 30;

    if (!narrowSkinLayout) {
      selectorX = previewColumnWidth + ACCOUNT_LAYOUT.sectionGap;
      selectorWidth = contentWidth - selectorX;
      this.previewLabel.setPosition(previewColumnWidth / 2, previewTop);
      const previewCenterY = previewTop + 30 + ACCOUNT_LAYOUT.previewSize / 2;
      for (const layer of Object.values(this.previewLayers)) {
        layer.setPosition(previewColumnWidth / 2, previewCenterY);
      }
    } else {
      this.previewLabel.setPosition(centerX, previewTop);
      const previewCenterY = previewTop + 30 + ACCOUNT_LAYOUT.previewSize / 2;
      for (const layer of Object.values(this.previewLayers)) {
        layer.setPosition(centerX, previewCenterY);
      }
      selectorY = previewBottom + ACCOUNT_LAYOUT.sectionGap;
    }

    let selectorBottom = selectorY;
    for (const category of this.skinCategoryOrder) {
      const selector = this.skinSelectors[category];
      if (!selector) {
        continue;
      }
      selector.setDisplayWidth(Math.max(180, selectorWidth));
      selector.setPosition(selectorX, selectorBottom);
      selectorBottom += selector.height + ACCOUNT_LAYOUT.selectorGap;
    }

    const skinBottom = Math.max(previewBottom, selectorBottom);
    cursorY = skinBottom + ACCOUNT_LAYOUT.sectionGap;

    this.facebookTitle.setPosition(centerX, cursorY);
    cursorY += this.facebookTitle.height + 6;
    this.facebookStatusText.setWordWrapWidth(contentWidth, true);
    this.facebookStatusText.setPosition(centerX, cursorY);
    cursorY += this.facebookStatusText.height + 10;

    const facebookButtonGap = 12;
    const facebookButtonsWidth =
      this.linkFacebookButton.width +
      facebookButtonGap +
      this.unlinkFacebookButton.width;
    if (facebookButtonsWidth <= contentWidth) {
      const buttonsLeft = (contentWidth - facebookButtonsWidth) / 2;
      this.linkFacebookButton.setPosition(
        buttonsLeft + this.linkFacebookButton.width / 2,
        cursorY
      );
      this.unlinkFacebookButton.setPosition(
        buttonsLeft +
          this.linkFacebookButton.width +
          facebookButtonGap +
          this.unlinkFacebookButton.width / 2,
        cursorY
      );
      cursorY +=
        Math.max(
          this.linkFacebookButton.height,
          this.unlinkFacebookButton.height
        ) + ACCOUNT_LAYOUT.sectionGap;
    } else {
      this.linkFacebookButton.setPosition(centerX, cursorY);
      cursorY += this.linkFacebookButton.height + 8;
      this.unlinkFacebookButton.setPosition(centerX, cursorY);
      cursorY += this.unlinkFacebookButton.height + ACCOUNT_LAYOUT.sectionGap;
    }

    this.backButton.setPosition(centerX, cursorY);
    cursorY += this.backButton.height + ACCOUNT_LAYOUT.horizontalPadding;

    this.accountRoot.setSize(contentWidth, cursorY);
    this.accountScrollPanel.setPosition?.(0, 0);
    this.accountScrollPanel.setSize?.(viewportWidth, viewportHeight);
    this.accountScrollPanel.setMinSize?.(viewportWidth, viewportHeight);
    this.accountScrollPanel.layout?.();
  }

  private createSkinPreview(x: number, y: number) {
    this.previewLabel = this.add
      .text(x, y, "Preview", {
        color: "#aaaaaa",
        fontSize: "13px"
      })
      .setOrigin(0.5);
    this.accountRoot.add(this.previewLabel);

    this.previewLayers = createSkinLayers(
      this,
      x,
      y + ACCOUNT_LAYOUT.previewSize / 2 + 12,
      this.currentSkin,
      6
    );
    for (const layer of Object.values(this.previewLayers)) {
      this.accountRoot.add(layer);
    }
  }

  private updatePreview() {
    updateSkinLayers(this.previewLayers, this.currentSkin, this.textures);
  }

  private createSkinSelectors(startX: number, startY: number) {
    const selectorWidth = 340;
    const rowHeight = 44;
    const gap = 4;

    const categoriesToShow = SKIN_CATEGORIES.filter(
      (cat) => SKIN_OPTIONS[cat].length > 0
    );
    this.skinCategoryOrder = categoriesToShow;

    for (let i = 0; i < categoriesToShow.length; i++) {
      const cat = categoriesToShow[i];
      const y = startY + i * (rowHeight + gap);

      const selector = new GridSelect(this, startX, y, {
        width: selectorWidth,
        height: rowHeight,
        columns: 5,
        title: `Select ${categoryLabel(cat)}`,
        subtitle: `Choose a ${cat} style`,
        placeholder: categoryLabel(cat),
        cellHeight: 96,
        modalWidth: 500,
        modalHeight: 380,
        autoSelectFirst: false
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
      this.accountRoot.add(selector);
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
        skin: this.currentSkin
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
          {}
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
        userInfo += `Username: ${account.user.username}`;
      }
      if (account.email) {
        userInfo += `\nEmail: ${account.email}`;
      }

      this.userInfoText.setText(userInfo.trimEnd());

      const displayName =
        userAccount?.displayName || account.user?.display_name || "";
      this.currentDisplayName = displayName;

      this.displayNameText.setText(
        `Display Name: ${displayName || "(not set)"}`
      );

      this.changeDisplayNameButton.setVisible(true);
      this.layoutAccount();

      if (userAccount) {
        const s = userAccount.stats;

        const lines: string[] = [];
        lines.push(
          `Matches: ${s.matchesPlayed} | Wins: ${s.wins} | Losses: ${s.losses} | Draws: ${s.draws}`
        );
        lines.push(
          `ELO: ${s.elo} (peak ${s.highestElo}) | Rank: ${s.rankTier ?? "unranked"}`
        );
        lines.push(
          `Win streak: ${s.currentWinStreak} (best ${s.bestWinStreak})`
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
        device.id?.startsWith("facebook:")
      );
      this.facebookStatusText.setText(
        hasFacebook
          ? "✓ Facebook account is linked"
          : "Facebook account is not linked"
      );
      this.layoutAccount();
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
        authResponse.accessToken
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

  private async promptChangeDisplayName() {
    const current = this.currentDisplayName || "";
    const input = window.prompt("Enter new display name:", current);
    if (input === null) {
      return;
    }

    const trimmed = input.trim();
    if (trimmed === current) {
      return;
    }

    if (trimmed.length > 128) {
      this.statusText.setText("Display name must be 128 characters or less");
      return;
    }

    this.statusText.setText("Updating display name...");
    try {
      await this.client.updateAccount(this.session, {
        display_name: trimmed
      });

      const accountService = this.registry.get("accountService") as
        | AccountService
        | undefined;
      accountService?.invalidate(this.session.user_id);

      const turnService = this.registry.get("turnService") as
        | TurnService
        | undefined;
      turnService?.invalidateUsernames(this.session.user_id);

      this.statusText.setText("Display name updated!");
      await this.loadUserInfo();
    } catch (error) {
      console.error("Failed to update display name:", error);
      this.statusText.setText("Failed to update display name");
    }
  }
}
