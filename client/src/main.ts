import Phaser from "phaser";
import { MainScene } from "./scenes/MainScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  width: 800,
  height: 600,
  backgroundColor: "#202030",
  scene: [MainScene],
};

new Phaser.Game(config);
