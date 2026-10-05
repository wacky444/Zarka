import Phaser from "phaser";
import { LoginScene } from "./scenes/LoginScene";
import { MainScene } from "./scenes/MainScene";
import { GameScene } from "./scenes/GameScene";
import { SettingsScene } from "./scenes/SettingsScene";
import { EndGameReportScene } from "./scenes/EndGameReportScene";
import { AdminServerScene } from "./scenes/AdminServerScene";
import RexUIPlugin from "phaser3-rex-plugins/templates/ui/ui-plugin";
import { SessionManager } from "./services/sessionManager";
import { installPhaserLocalization } from "./services/i18n";
import { registerPushServiceWorker } from "./services/pushNotifications";

import { isMobile } from "./utils/isMobile";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  width: 800,
  height: 600,
  backgroundColor: "#202030",
  pixelArt: true,
  input: {
    activePointers: 2
  },
  plugins: {
    scene: [
      {
        key: "rexUI",
        plugin: RexUIPlugin,
        mapping: "rexUI"
      }
    ]
  },
  scene: [
    LoginScene,
    MainScene,
    GameScene,
    SettingsScene,
    EndGameReportScene,
    AdminServerScene,
  ],
  scale: {
    mode: isMobile() ? Phaser.Scale.RESIZE : Phaser.Scale.RESIZE
  }
};

installPhaserLocalization();
void registerPushServiceWorker().catch((error: unknown) => {
  console.warn("Failed to register the push service worker:", error);
});

// Initialize the game and check for existing session
async function initGame() {
  const game = new Phaser.Game(config);

  // Check if we have a valid session
  if (SessionManager.hasValidSession()) {
    try {
      const sessionData = await SessionManager.restoreSession();
      if (sessionData) {
        game.scene.start("MainScene", {
          client: sessionData.client,
          session: sessionData.session
        });
      } else {
        game.scene.start("LoginScene");
      }
    } catch (error) {
      console.warn("Failed to restore session:", error);
      game.scene.start("LoginScene");
    }
  } else {
    game.scene.start("LoginScene");
  }
}

initGame();
