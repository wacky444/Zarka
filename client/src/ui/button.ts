import Phaser from "phaser";
import { THEME } from "./ColorPalette";

export type UIButton = Phaser.GameObjects.Text & { tags: string[] };

export type StepperHandle = {
  container: Phaser.GameObjects.Container;
  setEnabled: (enabled: boolean) => void;
  setDisplayValue: (v: number) => void;
};

export type ToggleHandle = {
  container: Phaser.GameObjects.Container;
  setEnabled: (enabled: boolean) => void;
  setDisplayValue: (v: boolean) => void;
};

export type TimeInputHandle = {
  container: Phaser.GameObjects.Container;
  setEnabled: (enabled: boolean) => void;
  setDisplayValue: (v: string) => void;
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
      color: THEME.buttons.default.text,
      backgroundColor: THEME.buttons.default.background,
      fontSize: "16px"
    })
    .setPadding(6)
    .setInteractive({ useHandCursor: true })
    .on("pointerover", () =>
      txt.setStyle({
        color: THEME.buttons.hover.text,
        backgroundColor: THEME.buttons.hover.background
      })
    )
    .on("pointerout", () =>
      txt.setStyle({
        color: THEME.buttons.default.text,
        backgroundColor: THEME.buttons.default.background
      })
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
  const controlContainer = scene.add.container(x, y);
  container.add(controlContainer);

  const lab = scene.add.text(0, 0, `${label}:`, {
    color: THEME.colors.textPrimary
  });
  controlContainer.add(lab);

  const valText = scene.add.text(80, 0, `${getter()}`, {
    color: THEME.colors.energyCost
  });
  controlContainer.add(valText);

  const decBtn = makeButton(
    scene,
    130,
    -2,
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
    170,
    -2,
    "+",
    () => {
      const v = Math.min(max, getter() + 1);
      setter(v);
      valText.setText(`${v}`);
    },
    ["inMatch"]
  );

  controlContainer.add(decBtn);
  controlContainer.add(incBtn);
  controlContainer.setSize(
    incBtn.x + incBtn.width,
    Math.max(lab.height, incBtn.height)
  );

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
    container: controlContainer,
    setEnabled: (enabled: boolean) => {
      applyEnabled(decBtn, enabled);
      applyEnabled(incBtn, enabled);
    },
    // Update the visual number without calling the provided setter (useful for remote sync)
    setDisplayValue: (v: number) => {
      const clamped = Math.max(min, Math.min(max, v));
      valText.setText(`${clamped}`);
    }
  };
}

// Adds a labeled toggle (on/off) control to a container
export function addLabeledToggle(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  x: number,
  y: number,
  label: string,
  getter: () => boolean,
  setter: (v: boolean) => void,
  onlyHost: boolean = false,
  isHost: boolean = true
): ToggleHandle {
  const controlContainer = scene.add.container(x, y);
  container.add(controlContainer);

  const lab = scene.add.text(0, 0, `${label}:`, {
    color: THEME.colors.textPrimary
  });
  controlContainer.add(lab);

  const valText = scene.add.text(80, 0, getter() ? "ON" : "OFF", {
    color: THEME.colors.energyCost
  });
  controlContainer.add(valText);

  const toggleBtn = makeButton(
    scene,
    130,
    -2,
    "Toggle",
    () => {
      const newValue = !getter();
      setter(newValue);
      valText.setText(newValue ? "ON" : "OFF");
    },
    ["inMatch"]
  );

  controlContainer.add(toggleBtn);
  controlContainer.setSize(
    toggleBtn.x + toggleBtn.width,
    Math.max(lab.height, toggleBtn.height)
  );

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
  applyEnabled(toggleBtn, initialEnabled);

  return {
    container: controlContainer,
    setEnabled: (enabled: boolean) => {
      applyEnabled(toggleBtn, enabled);
    },
    setDisplayValue: (v: boolean) => {
      valText.setText(v ? "ON" : "OFF");
    }
  };
}

// Adds a labeled time input control to a container
export function addLabeledTimeInput(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  x: number,
  y: number,
  label: string,
  getter: () => string,
  setter: (v: string) => void,
  onlyHost: boolean = false,
  isHost: boolean = true
): TimeInputHandle {
  const controlContainer = scene.add.container(x, y);
  container.add(controlContainer);

  const lab = scene.add.text(0, 0, `${label}:`, {
    color: THEME.colors.textPrimary
  });
  controlContainer.add(lab);

  const valText = scene.add.text(110, 0, getter(), {
    color: THEME.colors.energyCost
  });
  controlContainer.add(valText);

  const editBtn = makeButton(
    scene,
    160,
    -2,
    "Edit",
    () => {
      // Simple increment hour for now - in a real game you'd have a proper time picker
      const current = getter();
      const [hours, minutes] = current.split(":").map(Number);
      const newHours = (hours + 1) % 24;
      const newTime = `${newHours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;
      setter(newTime);
      valText.setText(newTime);
    },
    ["inMatch"]
  );

  controlContainer.add(editBtn);
  controlContainer.setSize(
    editBtn.x + editBtn.width,
    Math.max(lab.height, editBtn.height)
  );

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
  applyEnabled(editBtn, initialEnabled);

  return {
    container: controlContainer,
    setEnabled: (enabled: boolean) => {
      applyEnabled(editBtn, enabled);
    },
    setDisplayValue: (v: string) => {
      valText.setText(v);
    }
  };
}
