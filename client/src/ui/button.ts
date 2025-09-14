import Phaser from "phaser";

export type UIButton = Phaser.GameObjects.Text & { tags: string[] };

export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => Promise<void> | void,
  tags: string[] = ["main"]
): UIButton {
  const txt = scene.add
    .text(x, y, `[ ${label} ]`, {
      color: "#00ff88",
      backgroundColor: "#00332a",
      fontSize: "16px",
    })
    .setPadding(6)
    .setInteractive({ useHandCursor: true })
    .on("pointerover", () =>
      txt.setStyle({ color: "#ffffff", backgroundColor: "#005c49" })
    )
    .on("pointerout", () =>
      txt.setStyle({ color: "#00ff88", backgroundColor: "#00332a" })
    )
    .on("pointerdown", async () => {
      try {
        await onClick();
      } catch (e) {
        console.error(e);
      }
    });

  // Attach tags for view-based visibility control
  const button = txt as UIButton;
  button.tags = tags;
  return button;
}
