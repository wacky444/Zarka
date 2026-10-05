import Phaser from "phaser";
import { Client, Session } from "@heroiclabs/nakama-js";
import { makeButton, type UIButton } from "../ui/button";
import { SessionManager } from "../services/sessionManager";
import { FacebookService } from "../services/facebookService";
import { t } from "../services/i18n";
import {
  isAdminViewEnabled,
  setAdminViewEnabled
} from "../services/adminView";
import type { AccountService } from "../services/AccountService";
import { TurnService } from "../services/turnService";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushNotificationState,
  type PushNotificationState
} from "../services/pushNotifications";
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
import {
  preloadReplaySounds,
  getStoredVolumeLevel,
  setGameVolumeLevel,
  playRandomSound,
  isMusicEnabled,
  setMusicEnabled,
  stopMenuMusic
} from "../animation/soundPlayer";

function buildSkinItems(category: SkinCategory): GridSelectItem[] {
  const options = SKIN_OPTIONS[category];
  return options.map((frame) => {
    const name = frame.replace(/\.png$/, "").replace(/_/g, " ");
    const shortName = frame
      .replace(/^[^_]+_/, "")
      .replace(/\.png$/, "")
      .replace(/_/g, " ");
    return {
      id: frame,
      name,
      shortName,
      texture: "char",
      frame,
      iconScale: 2,
      centerOpaquePixels: true
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
  setOrigin?: (x: number, y?: number) => void;
  setScrollerEnable?: (enabled: boolean) => void;
  scrollerEnable?: boolean;
  setMouseWheelScrollerEnable?: (enabled: boolean) => void;
  scrollToTop?: () => void;
  mouseWheelScrollerEnable?: boolean;
};

type SliderInstance = Phaser.GameObjects.GameObject & {
  value: number;
  layout: () => void;
  getValue: (min?: number, max?: number) => number;
  setValue: (value?: number, min?: number, max?: number) => SliderInstance;
  setGap: (gap?: number, min?: number, max?: number) => SliderInstance;
  setPosition: (x: number, y: number) => SliderInstance;
  setVisible: (visible: boolean) => SliderInstance;
};

type SettingsTab = "account" | "appearance" | "audio" | "notifications";

const SETTINGS_TABS: ReadonlyArray<{ id: SettingsTab; label: string }> = [
  { id: "account", label: "Account" },
  { id: "appearance", label: "Appearance" },
  { id: "audio", label: "Audio" },
  { id: "notifications", label: "Notifications" }
];

const ACCOUNT_LAYOUT = {
  maxWidth: 760,
  horizontalPadding: 20,
  sectionGap: 16,
  narrowSkinBreakpoint: 620,
  previewSize: 96,
  selectorGap: 8
};

export class SettingsScene extends Phaser.Scene {
  private accountRoot!: Phaser.GameObjects.Container;
  private accountScrollPanel!: ScrollablePanelInstance;
  private tabButtons: Partial<Record<SettingsTab, UIButton>> = {};
  private activeSettingsTab: SettingsTab = "account";
  private displayNameLoaded = false;
  private titleText!: Phaser.GameObjects.Text;
  private skinStatsTitle!: Phaser.GameObjects.Text;
  private skinTitle!: Phaser.GameObjects.Text;
  private facebookTitle!: Phaser.GameObjects.Text;
  private pushTitle!: Phaser.GameObjects.Text;
  private pushDescription!: Phaser.GameObjects.Text;
  private pushStatusText!: Phaser.GameObjects.Text;
  private pushButton!: UIButton;
  private audioTitle!: Phaser.GameObjects.Text;
  private volumeLabel!: Phaser.GameObjects.Text;
  private volumeSlider!: SliderInstance;
  private musicToggleButton!: UIButton;
  private musicEnabled = true;
  private linkFacebookButton!: UIButton;
  private unlinkFacebookButton!: UIButton;
  private backButton!: UIButton;
  private previewLabel!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private client!: Client;
  private session!: Session;
  private turnService!: TurnService;
  private pushState: PushNotificationState = "disabled";
  private pushBusy = false;
  private userInfoText!: Phaser.GameObjects.Text;
  private displayNameText!: Phaser.GameObjects.Text;
  private changeDisplayNameButton!: UIButton;
  private adminViewToggle!: UIButton;
  private adminServerButton!: UIButton;
  private isAdmin = false;
  private adminViewEnabled = false;
  private skinSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private skinSavePending = false;
  private currentDisplayName = "";
  private playerStatsText!: Phaser.GameObjects.Text;
  private facebookStatusText!: Phaser.GameObjects.Text;
  private skinSelectors: Partial<Record<SkinCategory, GridSelect>> = {};
  private skinCategoryOrder: SkinCategory[] = [];
  private previewLayers: SkinLayers = {};
  private currentSkin: Skin = { ...DEFAULT_SKIN };
  private saving = false;

  constructor() {
    super("SettingsScene");
  }

  preload() {
    if (!this.textures.exists("char")) {
      this.load.atlasXML(
        "char",
        assetPath("assets/spritesheets/roguelikeChar_transparent.png"),
        assetPath("assets/spritesheets/roguelikeChar_transparent.xml")
      );
    }
    preloadReplaySounds(this);
  }

  async create(data?: { client?: Client; session?: Session }) {
    if (!data || !data.client || !data.session) {
      this.scene.start("LoginScene");
      return;
    }

    this.client = data.client;
    this.session = data.session;
    this.turnService =
      (this.registry.get("turnService") as TurnService | undefined) ??
      new TurnService(this.client, this.session);

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
        rectBoundsInteractive: true,
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
    this.accountScrollPanel.setOrigin?.(0, 0);

    this.titleText = this.add
      .text(0, 0, t("Settings"), {
        color: "#ffffff",
        fontSize: "28px",
        fontStyle: "bold"
      })
      .setOrigin(0.5, 0);
    this.accountRoot.add(this.titleText);

    this.statusText = this.add
      .text(0, 0, "", {
        color: "#cccccc",
        fontSize: "16px",
        align: "center"
      })
      .setOrigin(0.5, 0);
    this.accountRoot.add(this.statusText);

    this.userInfoText = this.add
      .text(0, 0, "", {
        color: "#cccccc",
        fontSize: "13px",
        align: "center"
      })
      .setOrigin(0.5, 0);
    this.accountRoot.add(this.userInfoText);

    this.displayNameText = this.add
      .text(0, 0, "", {
        color: "#cccccc",
        fontSize: "13px",
        align: "center"
      })
      .setOrigin(0.5, 0);
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
    this.changeDisplayNameButton.setOrigin(0.5, 0);
    this.changeDisplayNameButton.setFontSize("13px");
    this.changeDisplayNameButton.setPadding(4, 2);
    this.changeDisplayNameButton.setVisible(false);
    this.accountRoot.add(this.changeDisplayNameButton);

    this.adminViewToggle = makeButton(
      this,
      0,
      0,
      "[ ] View all actions and players",
      () => {
        this.adminViewEnabled = !this.adminViewEnabled;
        setAdminViewEnabled(this.adminViewEnabled);
        this.updateAdminViewToggle();
      },
      ["account"]
    ).setOrigin(0.5, 0);
    this.adminViewToggle.setVisible(false);
    this.accountRoot.add(this.adminViewToggle);

    this.adminServerButton = makeButton(
      this,
      0,
      0,
      "Nakama Server Logs",
      () => this.openAdminServerView(),
      ["account"],
    ).setOrigin(0.5, 0);
    this.adminServerButton.setVisible(false);
    this.accountRoot.add(this.adminServerButton);

    this.skinStatsTitle = this.add
      .text(0, 0, "Player Stats", {
        color: "#ffffff",
        fontSize: "18px"
      })
      .setOrigin(0.5, 0);
    this.accountRoot.add(this.skinStatsTitle);

    this.playerStatsText = this.add
      .text(0, 0, "", {
        color: "#cccccc",
        fontSize: "13px",
        align: "center"
      })
      .setOrigin(0.5, 0);
    this.accountRoot.add(this.playerStatsText);

    this.skinTitle = this.add
      .text(0, 0, "Skin Customization", {
        color: "#ffffff",
        fontSize: "18px"
      })
      .setOrigin(0.5, 0);
    this.accountRoot.add(this.skinTitle);

    this.createSkinPreview(0, 0);
    this.createSkinSelectors(0, 0);

    this.facebookTitle = this.add
      .text(0, 0, "Facebook Account", {
        color: "#ffffff",
        fontSize: "18px"
      })
      .setOrigin(0.5, 0);
    this.accountRoot.add(this.facebookTitle);

    this.facebookStatusText = this.add
      .text(0, 0, "Checking Facebook link status...", {
        color: "#cccccc",
        fontSize: "13px",
        align: "center"
      })
      .setOrigin(0.5, 0);
    this.accountRoot.add(this.facebookStatusText);

    this.linkFacebookButton = makeButton(this, 0, 0, "Link Facebook", async () => {
      await this.linkFacebook();
    }).setOrigin(0.5, 0);
    this.accountRoot.add(this.linkFacebookButton);

    this.unlinkFacebookButton = makeButton(
      this,
      0,
      0,
      "Unlink Facebook",
      async () => {
        await this.unlinkFacebook();
      }
    ).setOrigin(0.5, 0);
    this.accountRoot.add(this.unlinkFacebookButton);

    this.pushTitle = this.add
      .text(0, 0, t("Notifications"), {
        color: "#ffffff",
        fontSize: "18px"
      })
      .setOrigin(0.5, 0);
    this.accountRoot.add(this.pushTitle);

    this.pushDescription = this.add
      .text(
        0,
        0,
        t("Turn reminders can be delayed by Android or browser power management."),
        {
          color: "#cccccc",
          fontSize: "13px",
          align: "center",
          wordWrap: { width: 600 }
        }
      )
      .setOrigin(0.5, 0);
    this.accountRoot.add(this.pushDescription);

    this.pushStatusText = this.add
      .text(0, 0, t("Checking notification support..."), {
        color: "#cccccc",
        fontSize: "13px",
        align: "center",
        wordWrap: { width: 600 }
      })
      .setOrigin(0.5, 0);
    this.accountRoot.add(this.pushStatusText);

    this.pushButton = makeButton(
      this,
      0,
      0,
      t("Enable notifications"),
      async () => this.togglePushNotifications()
    ).setOrigin(0.5, 0);
    this.pushButton.setAlpha(0.5);
    this.pushButton.disableInteractive();
    this.accountRoot.add(this.pushButton);

    const initialVolume = getStoredVolumeLevel();
    setGameVolumeLevel(this, initialVolume);

    this.audioTitle = this.add
      .text(0, 0, "Audio Settings", {
        color: "#ffffff",
        fontSize: "18px"
      })
      .setOrigin(0.5, 0);
    this.accountRoot.add(this.audioTitle);

    this.volumeLabel = this.add
      .text(0, 0, `Volume: ${initialVolume}`, {
        color: "#cccccc",
        fontSize: "13px",
        align: "center"
      })
      .setOrigin(0.5, 0);
    this.accountRoot.add(this.volumeLabel);

    const sliderWidth = 240;
    this.volumeSlider = this.rexUI.add.slider({
      x: 0,
      y: 0,
      width: sliderWidth,
      height: 28,
      orientation: "x",
      track: this.rexUI.add.roundRectangle(0, 0, sliderWidth, 8, 4, 0x1f2a4a),
      indicator: this.rexUI.add.roundRectangle(0, 0, 0, 8, 4, 0x3b82f6),
      thumb: this.rexUI.add.roundRectangle(0, 0, 18, 18, 9, 0x60a5fa),
      input: "click",
      gap: 0.1,
      value: initialVolume / 10,
      valuechangeCallback: (newValue: number) => {
        const level = Math.round(newValue * 10);
        setGameVolumeLevel(this, level);
        this.volumeLabel.setText(`Volume: ${level}`);
      }
    }) as SliderInstance;
    this.volumeSlider.on("inputend", () => {
      playRandomSound(this, ["pop_1"]);
    });
    this.volumeSlider.layout();
    this.accountRoot.add(this.volumeSlider);

    this.musicEnabled = isMusicEnabled();
    this.musicToggleButton = makeButton(
      this,
      0,
      0,
      this.getMusicToggleLabel(),
      () => {
        this.musicEnabled = !this.musicEnabled;
        setMusicEnabled(this.musicEnabled);
        if (!this.musicEnabled) {
          stopMenuMusic(this);
        }
        this.musicToggleButton.setText(`[ ${this.getMusicToggleLabel()} ]`);
        playRandomSound(this, ["pop_1"]);
      },
      ["account"]
    ).setOrigin(0.5, 0);
    this.accountRoot.add(this.musicToggleButton);

    this.backButton = makeButton(this, 0, 0, "Back to Game", () => {
      this.scene.start("MainScene", {
        client: this.client,
        session: this.session
      });
    }).setOrigin(0.5, 0);
    this.accountRoot.add(this.backButton);

    this.createSettingsTabs();
    this.updateSettingsTabVisibility();
    this.layoutAccount();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutAccount, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutAccount, this);
      if (this.skinSaveTimer !== null) {
        clearTimeout(this.skinSaveTimer);
        this.skinSaveTimer = null;
      }
    });

    void this.refreshPushNotificationUi();
    await this.loadUserInfo();
  }

  private createSettingsTabs(): void {
    for (const tab of SETTINGS_TABS) {
      const button = makeButton(
        this,
        0,
        0,
        t(tab.label),
        () => this.selectSettingsTab(tab.id),
        ["account"]
      ).setOrigin(0.5, 0);
      this.tabButtons[tab.id] = button;
      this.accountRoot.add(button);
    }
    this.updateSettingsTabButtons();
  }

  private selectSettingsTab(tab: SettingsTab): void {
    if (this.activeSettingsTab === tab) {
      return;
    }
    this.activeSettingsTab = tab;
    this.updateSettingsTabButtons();
    this.updateSettingsTabVisibility();
    this.layoutAccount();
    this.accountScrollPanel.scrollToTop?.();
  }

  private updateSettingsTabButtons(): void {
    for (const tab of SETTINGS_TABS) {
      const button = this.tabButtons[tab.id];
      if (!button) {
        continue;
      }
      button.setText(
        this.activeSettingsTab === tab.id ? `[ ${t(tab.label)} ]` : t(tab.label)
      );
    }
  }

  private updateSettingsTabVisibility(): void {
    const showAccount = this.activeSettingsTab === "account";
    const showAppearance = this.activeSettingsTab === "appearance";
    const showAudio = this.activeSettingsTab === "audio";
    const showNotifications = this.activeSettingsTab === "notifications";

    this.userInfoText.setVisible(showAccount);
    this.displayNameText.setVisible(showAccount);
    this.changeDisplayNameButton.setVisible(showAccount && this.displayNameLoaded);
    this.adminViewToggle.setVisible(showAccount && this.isAdmin);
    this.adminServerButton.setVisible(showAccount && this.isAdmin);
    this.skinStatsTitle.setVisible(showAccount);
    this.playerStatsText.setVisible(showAccount);
    this.facebookTitle.setVisible(showAccount);
    this.facebookStatusText.setVisible(showAccount);
    this.linkFacebookButton.setVisible(showAccount);
    this.unlinkFacebookButton.setVisible(showAccount);

    this.skinTitle.setVisible(showAppearance);
    this.previewLabel.setVisible(showAppearance);
    this.updatePreview();
    for (const selector of Object.values(this.skinSelectors)) {
      selector?.setVisible(showAppearance);
    }

    this.audioTitle.setVisible(showAudio);
    this.volumeLabel.setVisible(showAudio);
    this.volumeSlider.setVisible(showAudio);
    this.musicToggleButton.setVisible(showAudio);

    this.pushTitle.setVisible(showNotifications);
    this.pushDescription.setVisible(showNotifications);
    this.pushStatusText.setVisible(showNotifications);
    this.pushButton.setVisible(showNotifications);
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
    const centerX = viewportWidth / 2;
    let cursorY = ACCOUNT_LAYOUT.horizontalPadding;

    this.titleText.setPosition(centerX, cursorY);
    cursorY += this.titleText.height + 8;

    this.statusText.setWordWrapWidth(contentWidth, true);
    this.statusText.setPosition(centerX, cursorY);
    cursorY += this.statusText.height + 10;

    const tabColumns = contentWidth >= 600 ? SETTINGS_TABS.length : 2;
    const tabGapX = 8;
    const tabGapY = 6;
    const tabCellWidth =
      (contentWidth - tabGapX * (tabColumns - 1)) / tabColumns;
    const tabRowHeight = Math.max(
      ...SETTINGS_TABS.map((tab) => this.tabButtons[tab.id]?.height ?? 0)
    );
    for (let i = 0; i < SETTINGS_TABS.length; i++) {
      const button = this.tabButtons[SETTINGS_TABS[i].id];
      if (!button) {
        continue;
      }
      const column = i % tabColumns;
      const row = Math.floor(i / tabColumns);
      button.setPosition(
        contentLeft + column * (tabCellWidth + tabGapX) + tabCellWidth / 2,
        cursorY + row * (tabRowHeight + tabGapY)
      );
    }
    cursorY +=
      Math.ceil(SETTINGS_TABS.length / tabColumns) * (tabRowHeight + tabGapY) +
      ACCOUNT_LAYOUT.sectionGap;

    if (this.activeSettingsTab === "account") {
      this.userInfoText.setWordWrapWidth(contentWidth, true);
      this.userInfoText.setPosition(centerX, cursorY);
      cursorY += this.userInfoText.height + 8;

      this.displayNameText.setPosition(centerX, cursorY);
      cursorY += this.displayNameText.height + 6;
      if (this.changeDisplayNameButton.visible) {
        this.changeDisplayNameButton.setPosition(centerX, cursorY);
        cursorY += this.changeDisplayNameButton.height + 8;
      }
      if (this.adminViewToggle.visible) {
        this.adminViewToggle.setPosition(centerX, cursorY);
        cursorY += this.adminViewToggle.height + ACCOUNT_LAYOUT.sectionGap;
      }
      if (this.adminServerButton.visible) {
        this.adminServerButton.setPosition(centerX, cursorY);
        cursorY += this.adminServerButton.height + ACCOUNT_LAYOUT.sectionGap;
      }

      this.skinStatsTitle.setPosition(centerX, cursorY);
      cursorY += this.skinStatsTitle.height + 16;
      this.playerStatsText.setWordWrapWidth(contentWidth, true);
      this.playerStatsText.setPosition(centerX, cursorY);
      cursorY += this.playerStatsText.height + ACCOUNT_LAYOUT.sectionGap;

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
        const buttonsLeft = (viewportWidth - facebookButtonsWidth) / 2;
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
    } else if (this.activeSettingsTab === "appearance") {
      this.skinTitle.setPosition(centerX, cursorY);
      cursorY += this.skinTitle.height + 12;

      const narrowSkinLayout = contentWidth < ACCOUNT_LAYOUT.narrowSkinBreakpoint;
      const previewColumnWidth = ACCOUNT_LAYOUT.previewSize + 40;
      const previewTop = cursorY;
      let selectorX = contentLeft;
      let selectorY = cursorY;
      let selectorWidth = contentWidth;
      const previewCenterY =
        previewTop + this.previewLabel.height + 12 + ACCOUNT_LAYOUT.previewSize / 2;
      const previewBottom =
        previewTop + this.previewLabel.height + 12 + ACCOUNT_LAYOUT.previewSize;

      if (!narrowSkinLayout) {
        selectorX = contentLeft + previewColumnWidth + ACCOUNT_LAYOUT.sectionGap;
        selectorWidth = contentWidth - (previewColumnWidth + ACCOUNT_LAYOUT.sectionGap);
        const previewCenterX = contentLeft + previewColumnWidth / 2;
        this.previewLabel.setPosition(previewCenterX, previewTop);
        for (const layer of Object.values(this.previewLayers)) {
          layer.setPosition(previewCenterX, previewCenterY);
        }
      } else {
        this.previewLabel.setPosition(centerX, previewTop);
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
      cursorY = Math.max(previewBottom, selectorBottom) + ACCOUNT_LAYOUT.sectionGap;
    } else if (this.activeSettingsTab === "notifications") {
      this.pushTitle.setPosition(centerX, cursorY);
      cursorY += this.pushTitle.height + 6;
      this.pushDescription.setWordWrapWidth(contentWidth, true);
      this.pushDescription.setPosition(centerX, cursorY);
      cursorY += this.pushDescription.height + 6;
      this.pushStatusText.setWordWrapWidth(contentWidth, true);
      this.pushStatusText.setPosition(centerX, cursorY);
      cursorY += this.pushStatusText.height + 8;
      this.pushButton.setPosition(centerX, cursorY);
      cursorY += this.pushButton.height + ACCOUNT_LAYOUT.sectionGap;
    } else {
      this.audioTitle.setPosition(centerX, cursorY);
      cursorY += this.audioTitle.height + 6;
      this.volumeLabel.setPosition(centerX, cursorY);
      cursorY += this.volumeLabel.height + 12;
      this.volumeSlider.setPosition(centerX, cursorY + 14);
      cursorY += 34 + 12;
      this.musicToggleButton.setPosition(centerX, cursorY);
      cursorY += this.musicToggleButton.height + ACCOUNT_LAYOUT.sectionGap;
    }

    this.backButton.setPosition(centerX, cursorY);
    cursorY += this.backButton.height + ACCOUNT_LAYOUT.horizontalPadding;

    this.accountRoot.setPosition(0, 0);
    this.accountRoot.setSize(viewportWidth, cursorY);
    this.accountScrollPanel.setOrigin?.(0, 0);
    this.accountScrollPanel.setPosition?.(0, 0);
    this.accountScrollPanel.setSize?.(viewportWidth, viewportHeight);
    this.accountScrollPanel.setMinSize?.(viewportWidth, viewportHeight);
    this.accountScrollPanel.layout?.();
  }

  private getMusicToggleLabel(): string {
    return this.musicEnabled ? "Music: ON" : "Music: OFF";
  }

  private createSkinPreview(x: number, y: number) {
    this.previewLabel = this.add
      .text(x, y, "Preview", {
        color: "#aaaaaa",
        fontSize: "13px"
      })
      .setOrigin(0.5, 0);
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
    if (this.activeSettingsTab !== "appearance") {
      for (const layer of Object.values(this.previewLayers)) {
        layer.setVisible(false);
      }
    }
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
        autoSelectFirst: false,
        mobileCellContent: "image",
        mobileImageLabels: true
      });

      const items = buildSkinItems(cat);
      selector.setItems(items);
      selector.setValue(this.currentSkin[cat], false);

      selector.on("change", (id: string | null) => {
        if (id) {
          this.currentSkin = { ...this.currentSkin, [cat]: id };
          this.updatePreview();
          this.scheduleSkinSave();
        }
      });
      selector.on("modal-open", () => {
        this.accountScrollPanel?.setScrollerEnable?.(false);
        this.accountScrollPanel?.setMouseWheelScrollerEnable?.(false);
      });
      selector.on("modal-close", () => {
        this.accountScrollPanel?.setScrollerEnable?.(true);
        this.accountScrollPanel?.setMouseWheelScrollerEnable?.(true);
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

  private scheduleSkinSave(): void {
    this.skinSavePending = true;
    if (this.skinSaveTimer !== null) {
      clearTimeout(this.skinSaveTimer);
    }
    this.skinSaveTimer = setTimeout(() => {
      this.skinSaveTimer = null;
      this.skinSavePending = false;
      void this.saveSkin();
    }, 250);
  }

  private async saveSkin() {
    if (this.saving) {
      this.skinSavePending = true;
      return;
    }
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
      if (this.skinSavePending && this.skinSaveTimer === null) {
        this.scheduleSkinSave();
      }
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
          this.isAdmin = rpcPayload.account.isAdmin === true;
          this.adminViewEnabled = this.isAdmin && isAdminViewEnabled();
          this.updateSettingsTabVisibility();
          this.updateAdminViewToggle();
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

      this.displayNameLoaded = true;
      this.updateSettingsTabVisibility();
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

  private async refreshPushNotificationUi(): Promise<void> {
    this.pushState = await getPushNotificationState();
    const statusKeys: Record<PushNotificationState, string> = {
      unsupported: "Web Push is not supported by this browser.",
      unconfigured: "Push notifications are not configured for this app.",
      denied: "Notifications are blocked. Allow them in browser settings.",
      disabled: "Notifications are off on this device.",
      enabled: "Notifications are on for this device.",
      error: "Notification setup failed. Check connection and retry."
    };
    this.pushStatusText.setText(t(statusKeys[this.pushState]));
    this.updatePushButton();
    this.layoutAccount();
  }

  private updatePushButton(): void {
    this.pushButton.setText(
      `[ ${t(this.pushState === "enabled" ? "Disable notifications" : "Enable notifications")} ]`
    );
    const canInteract =
      !this.pushBusy &&
      this.pushState !== "unsupported" &&
      this.pushState !== "unconfigured" &&
      this.pushState !== "denied";
    if (canInteract) {
      this.pushButton.setAlpha(1);
      this.pushButton.setInteractive({ useHandCursor: true });
    } else {
      this.pushButton.setAlpha(0.5);
      this.pushButton.disableInteractive();
    }
  }

  private async togglePushNotifications(): Promise<void> {
    if (this.pushBusy) return;
    const disabling = this.pushState === "enabled";
    this.pushBusy = true;
    this.pushStatusText.setText(
      t(disabling ? "Disabling notifications..." : "Enabling notifications...")
    );
    this.updatePushButton();
    this.layoutAccount();
    try {
      if (disabling) {
        await disablePushNotifications(this.turnService);
      } else {
        await enablePushNotifications(this.turnService);
      }
      await this.refreshPushNotificationUi();
    } catch (error) {
      console.warn("Push notification settings update failed:", error);
      this.pushState = await getPushNotificationState();
      this.pushStatusText.setText(
        t(disabling ? "Failed to disable notifications." : "Failed to enable notifications.")
      );
    } finally {
      this.pushBusy = false;
      this.updatePushButton();
      this.layoutAccount();
    }
  }

  private openAdminServerView(): void {
    if (!this.isAdmin) {
      return;
    }
    this.scene.start("AdminServerScene", {
      client: this.client,
      session: this.session,
    });
  }

  private updateAdminViewToggle(): void {
    if (!this.adminViewToggle) {
      return;
    }
    this.adminViewToggle.setText(
      this.adminViewEnabled
        ? "[x] View all actions and players"
        : "[ ] View all actions and players"
    );
  }

  private async promptChangeDisplayName() {
    const current = this.currentDisplayName || "";
    const input = window.prompt(t("Enter new display name:"), current);
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
