import Phaser from "phaser";
import { MainScene } from "./scenes/MainScene";
import { GameScene } from "./scenes/GameScene";
import { MatchesList } from "./scenes/MatchesList";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  width: 800,
  height: 600,
  backgroundColor: "#202030",
  scene: [MainScene, GameScene, MatchesList],
};

new Phaser.Game(config);
