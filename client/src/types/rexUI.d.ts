import type Phaser from "phaser";

declare module "phaser3-rex-plugins/templates/ui/ui-plugin" {
  export default class RexUIPlugin extends Phaser.Plugins.ScenePlugin {
    add: {
      dropDownList(
        config: Record<string, unknown>
      ): Phaser.GameObjects.GameObject;
      simpleDropDownList(
        config: Record<string, unknown>
      ): Phaser.GameObjects.GameObject;
      roundRectangle(
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number,
        color: number
      ): Phaser.GameObjects.GameObject;
      scrollablePanel(
        config: Record<string, unknown>
      ): Phaser.GameObjects.GameObject;
      label(config: Record<string, unknown>): Phaser.GameObjects.GameObject;
      simpleLabel(
        config: Record<string, unknown>
      ): Phaser.GameObjects.GameObject;
      sizer(config: Record<string, unknown>): Phaser.GameObjects.GameObject;
      gridTable(config: Record<string, unknown>): Phaser.GameObjects.GameObject;
      BBCodeText(
        x: number,
        y: number,
        text: string,
        style?: Record<string, unknown>
      ): Phaser.GameObjects.GameObject;
    };
  }
}

declare global {
  namespace Phaser {
    interface Scene {
      rexUI: {
        add: {
          dropDownList(
            config: Record<string, unknown>
          ): Phaser.GameObjects.GameObject;
          simpleDropDownList(
            config: Record<string, unknown>
          ): Phaser.GameObjects.GameObject;
          roundRectangle(
            x: number,
            y: number,
            width: number,
            height: number,
            radius: number,
            color: number
          ): Phaser.GameObjects.GameObject;
          scrollablePanel(
            config: Record<string, unknown>
          ): Phaser.GameObjects.GameObject;
          label(config: Record<string, unknown>): Phaser.GameObjects.GameObject;
          simpleLabel(
            config: Record<string, unknown>
          ): Phaser.GameObjects.GameObject;
          sizer(config: Record<string, unknown>): Phaser.GameObjects.GameObject;
          gridTable(
            config: Record<string, unknown>
          ): Phaser.GameObjects.GameObject;
          BBCodeText(
            x: number,
            y: number,
            text: string,
            style?: Record<string, unknown>
          ): Phaser.GameObjects.GameObject;
        };
      };
    }
  }
}
