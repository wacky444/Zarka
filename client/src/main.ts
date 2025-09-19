import Phaser from "phaser";
import { LoginScene } from "./scenes/LoginScene";
import { MainScene } from "./scenes/MainScene";
import { GameScene } from "./scenes/GameScene";
import { AccountScene } from "./scenes/AccountScene";
import { SessionManager } from "./services/sessionManager";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  width: 800,
  height: 600,
  backgroundColor: "#202030",
  scene: [LoginScene, MainScene, GameScene, AccountScene],
};

// Initialize the game and check for existing session
async function initGame() {
  const game = new Phaser.Game(config);
  
  // Check if we have a valid session
  if (SessionManager.hasValidSession()) {
    try {
      const sessionData = await SessionManager.restoreSession();
      if (sessionData) {
        // We have a valid session, start with MainScene
        game.scene.start("MainScene", {
          client: sessionData.client,
          session: sessionData.session
        });
        return;
      }
    } catch (error) {
      console.warn("Failed to restore session:", error);
    }
  }
  
  // No valid session, start with LoginScene
  game.scene.start("LoginScene");
}

initGame();
