import Phaser from "phaser";

export type UIButton = Phaser.GameObjects.Text & { tags: string[] };

export type StepperHandle = {
  setEnabled: (enabled: boolean) => void;
  setDisplayValue: (v: number) => void;
};

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
  setter: (v: number) => void,
  onlyHost: boolean = false,
  isHost: boolean = true
): StepperHandle {
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

  // Helper to toggle interactivity/appearance
  const applyEnabled = (btn: UIButton, enabled: boolean) => {
    if (enabled) {
      btn.setAlpha(1);
      btn.setInteractive({ useHandCursor: true });
    } else {
      btn.setAlpha(0.5);
      btn.disableInteractive();
    }
  };

  // Initial state: if host-only and not host, disable
  const initialEnabled = !onlyHost || isHost;
  applyEnabled(decBtn, initialEnabled);
  applyEnabled(incBtn, initialEnabled);

  return {
    setEnabled: (enabled: boolean) => {
      applyEnabled(decBtn, enabled);
      applyEnabled(incBtn, enabled);
    },
    // Update the visual number without calling the provided setter (useful for remote sync)
    setDisplayValue: (v: number) => {
      const clamped = Math.max(min, Math.min(max, v));
      valText.setText(`${clamped}`);
    },
  };
}
