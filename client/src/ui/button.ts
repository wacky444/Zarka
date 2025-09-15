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

// Adds a labeled numeric stepper to a container. Updates the provided setter/getter on click.
export function addLabeledStepper(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  x: number,
  y: number,
  label: string,
  min: number,
  max: number,
  getter: () => number,
  setter: (v: number) => void
): void {
  const lab = scene.add.text(x, y, `${label}:`, { color: "#ffffff" });
  container.add(lab);

  const valText = scene.add.text(x + 80, y, `${getter()}`, {
    color: "#ffff88",
  });
  container.add(valText);

  const decBtn = makeButton(
    scene,
    x + 130,
    y - 2,
    "-",
    () => {
      const v = Math.max(min, getter() - 1);
      setter(v);
      valText.setText(`${v}`);
    },
    ["inMatch"]
  );
  const incBtn = makeButton(
    scene,
    x + 170,
    y - 2,
    "+",
    () => {
      const v = Math.min(max, getter() + 1);
      setter(v);
      valText.setText(`${v}`);
    },
    ["inMatch"]
  );

  container.add(decBtn);
  container.add(incBtn);
}
