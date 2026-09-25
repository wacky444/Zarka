import Phaser from "phaser";
import type { Client, Session } from "@heroiclabs/nakama-js";
import { t } from "../services/i18n";
import {
  AdminServerApiError,
  requestAdminLogs,
  requestServerUpdate,
} from "../services/adminServer";
import { makeButton, type UIButton } from "../ui/button";

interface AdminServerSceneData {
  client: Client;
  session: Session;
}

const ADMIN_API_ERROR_LABELS: Record<string, string> = {
  invalid_password: "Invalid console password.",
  too_many_attempts: "Too many failed password attempts. Try again later.",
  repository_has_local_changes:
    "The repository has local changes. Commit or discard them before updating.",
  repository_not_on_main: "The server checkout is not on the main branch.",
  update_already_in_progress: "An update is already in progress.",
  nakama_logs_unavailable: "Nakama logs are unavailable.",
  git_status_failed: "Update failed while checking the repository.",
  git_pull_failed: "Update failed while pulling changes.",
  dependency_install_failed: "Update failed while installing dependencies.",
  module_build_failed: "Update failed while building the module.",
  nakama_rebuild_failed: "Update failed while restarting Nakama.",
  host_repository_path_unavailable:
    "The host repository path could not be resolved from Docker.",
  docker_inspect_failed: "Unable to inspect the Docker repository mount."
};

function getAdminErrorMessage(error: unknown): string {
  if (!(error instanceof AdminServerApiError)) {
    return t("Admin operation failed.");
  }
  return t(ADMIN_API_ERROR_LABELS[error.message] ?? error.message);
}

interface ScrollablePanel extends Phaser.GameObjects.GameObject {
  layout?: () => void;
  setOrigin: (x: number, y: number) => ScrollablePanel;
  setPosition: (x: number, y: number) => ScrollablePanel;
  setSize?: (width: number, height: number) => ScrollablePanel;
}

export class AdminServerScene extends Phaser.Scene {
  private client!: Client;
  private session!: Session;
  private titleText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private errorOnlyText!: Phaser.GameObjects.Text;
  private logsText!: Phaser.GameObjects.Text;
  private scrollContent!: Phaser.GameObjects.Container;
  private scrollPanel!: ScrollablePanel;
  private returnButton!: UIButton;
  private refreshButton!: UIButton;
  private updateButton!: UIButton;
  private passwordOverlay: HTMLDivElement | null = null;
  private passwordInput: HTMLInputElement | null = null;
  private adminPassword = "";
  private errorOnly = false;
  private busy = false;

  constructor() {
    super("AdminServerScene");
  }

  create(data?: AdminServerSceneData): void {
    if (!data?.client || !data.session) {
      this.scene.start("LoginScene");
      return;
    }
    this.client = data.client;
    this.session = data.session;
    this.cameras.main.setBackgroundColor("#070913");

    this.titleText = this.add
      .text(0, 0, t("Nakama Server Logs"), {
        color: "#ffffff",
        fontSize: "24px",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);

    this.statusText = this.add
      .text(0, 0, t("Enter the Nakama console password to continue."), {
        color: "#cbd5e1",
        fontSize: "14px",
        align: "center",
        wordWrap: { width: Math.max(240, this.scale.width - 32) },
      })
      .setOrigin(0.5, 0);

    this.returnButton = makeButton(this, 0, 0, "Back", () => {
      this.returnToAccount();
    }).setOrigin(0, 0);

    this.errorOnlyText = this.add
      .text(0, 0, "[ ] Errors only", {
        color: "#f8fafc",
        fontSize: "15px",
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.POINTER_UP, () => {
        if (this.busy || !this.adminPassword) {
          return;
        }
        this.errorOnly = !this.errorOnly;
        this.updateErrorOnlyLabel();
        void this.refreshLogs();
      });

    this.refreshButton = makeButton(this, 0, 0, "Refresh", async () => {
      await this.refreshLogs();
    }).setOrigin(0.5, 0);

    this.updateButton = makeButton(this, 0, 0, "Update", async () => {
      await this.updateServer();
    }).setOrigin(0.5, 0);

    this.scrollContent = this.add.container(0, 0);
    this.logsText = this.add.text(12, 10, "", {
      color: "#d1d5db",
      fontFamily: "Consolas, monospace",
      fontSize: "12px",
      lineSpacing: 2,
      wordWrap: { width: Math.max(200, this.scale.width - 48) },
    });
    this.scrollContent.add(this.logsText);
    this.scrollPanel = this.rexUI.add.scrollablePanel({
      x: 0,
      y: 130,
      width: this.scale.width,
      height: Math.max(120, this.scale.height - 150),
      scrollMode: 0,
      panel: { child: this.scrollContent, mask: true },
      slider: {
        track: this.rexUI.add.roundRectangle(0, 0, 4, 120, 2, 0x1f2a4a),
        thumb: this.rexUI.add.roundRectangle(0, 0, 6, 36, 3, 0x3b82f6),
      },
      scroller: {
        threshold: 10,
        rectBoundsInteractive: true,
        slidingDeceleration: 5000,
        backDeceleration: 2000,
        pointerOutRelease: true,
      },
      mouseWheelScroller: { focus: 2, speed: 0.5 },
      space: { left: 8, right: 8, top: 8, bottom: 8, panel: 6 },
    }) as unknown as ScrollablePanel;
    this.scrollPanel.setOrigin(0, 0);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.removePasswordPrompt();
      this.adminPassword = "";
    });

    this.updateErrorOnlyLabel();
    this.layout();
    this.showPasswordPrompt();
  }

  private layout(): void {
    if (!this.titleText) {
      return;
    }
    const width = this.scale.width;
    const height = this.scale.height;
    const narrow = width < 520;
    this.returnButton.setPosition(16, 12);
    this.titleText.setPosition(width / 2, narrow ? 44 : 16);
    this.statusText.setWordWrapWidth(Math.max(240, width - 32), true);
    this.errorOnlyText.setPosition(16, narrow ? 80 : 77);
    this.refreshButton.setPosition(
      narrow ? width * 0.36 : width - 220,
      narrow ? 102 : 62,
    );
    this.updateButton.setPosition(
      narrow ? width * 0.74 : width - 96,
      narrow ? 102 : 62,
    );
    this.statusText.setPosition(width / 2, narrow ? 140 : 98);

    const scrollY = narrow ? 178 : 126;
    const scrollHeight = Math.max(96, height - scrollY - 12);
    this.scrollPanel.setPosition(0, scrollY);
    this.scrollPanel.setSize?.(width, scrollHeight);
    this.logsText.setWordWrapWidth(Math.max(200, width - 48), true);
    this.updateLogsContentSize(width, scrollHeight);
    this.scrollPanel.layout?.();
  }

  private getScrollViewportHeight(): number {
    const scrollY = this.scale.width < 520 ? 178 : 126;
    return Math.max(96, this.scale.height - scrollY - 12);
  }

  private updateLogsContentSize(width: number, viewportHeight: number): void {
    if (!this.scrollContent || !this.logsText) {
      return;
    }
    this.scrollContent.setSize(
      width,
      Math.max(viewportHeight, this.logsText.height + 20),
    );
  }

  private updateErrorOnlyLabel(): void {
    if (!this.errorOnlyText) {
      return;
    }
    this.errorOnlyText.setText(
      this.errorOnly ? `[x] ${t("Errors only")}` : `[ ] ${t("Errors only")}`,
    );
  }

  private async refreshLogs(): Promise<void> {
    if (!this.adminPassword || this.busy) {
      return;
    }
    this.busy = true;
    this.setControlsEnabled(false);
    this.statusText.setText(t("Loading Nakama logs..."));
    try {
      const logs = await requestAdminLogs(this.adminPassword, this.errorOnly);
      this.logsText.setText(logs || t("No logs returned."));
      this.updateLogsContentSize(this.scale.width, this.getScrollViewportHeight());
      this.scrollPanel.layout?.();
      this.statusText.setText(t("Logs loaded."));
    } catch (error) {
      this.showRequestError(error);
    } finally {
      this.busy = false;
      this.setControlsEnabled(true);
    }
  }

  private async updateServer(): Promise<void> {
    if (!this.adminPassword || this.busy) {
      return;
    }
    if (!window.confirm(t("Pull changes and rebuild Nakama?"))) {
      return;
    }
    this.busy = true;
    this.setControlsEnabled(false);
    this.statusText.setText(t("Pulling changes and rebuilding Nakama..."));
    this.logsText.setText(t("Update in progress. Please keep this page open."));
    this.updateLogsContentSize(this.scale.width, this.getScrollViewportHeight());
    this.scrollPanel.layout?.();
    try {
      const output = await requestServerUpdate(this.adminPassword);
      this.logsText.setText(output || t("Update completed."));
      this.statusText.setText(t("Update completed. Refreshing logs..."));
      this.updateLogsContentSize(this.scale.width, this.getScrollViewportHeight());
      this.scrollPanel.layout?.();
      try {
        const logs = await requestAdminLogs(this.adminPassword, this.errorOnly);
        this.logsText.setText(logs || t("No logs returned."));
        this.statusText.setText(t("Update completed."));
        this.updateLogsContentSize(this.scale.width, this.getScrollViewportHeight());
        this.scrollPanel.layout?.();
      } catch {
        this.statusText.setText(
          t("Update completed, but logs could not be refreshed."),
        );
      }
    } catch (error) {
      this.showRequestError(error);
    } finally {
      this.busy = false;
      this.setControlsEnabled(true);
    }
  }

  private setControlsEnabled(enabled: boolean): void {
    for (const button of [
      this.returnButton,
      this.refreshButton,
      this.updateButton,
    ]) {
      button.setAlpha(enabled ? 1 : 0.5);
      if (enabled) {
        button.setInteractive({ useHandCursor: true });
      } else {
        button.disableInteractive();
      }
    }
    this.errorOnlyText.setAlpha(enabled ? 1 : 0.5);
  }

  private showRequestError(error: unknown): void {
    if (error instanceof AdminServerApiError) {
      this.statusText.setText(getAdminErrorMessage(error));
      if (error.details) {
        this.logsText.setText(error.details);
        this.updateLogsContentSize(this.scale.width, this.getScrollViewportHeight());
        this.scrollPanel.layout?.();
      }
      if (error.message === "invalid_password") {
        this.adminPassword = "";
        this.showPasswordPrompt();
      }
      return;
    }
    this.statusText.setText(t("Admin operation failed."));
  }

  private showPasswordPrompt(): void {
    this.removePasswordPrompt();
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", t("Admin authentication"));
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "100000";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "16px";
    overlay.style.background = "rgba(2, 6, 23, 0.82)";

    const card = document.createElement("form");
    card.style.width = "min(420px, 100%)";
    card.style.padding = "24px";
    card.style.border = "1px solid #475569";
    card.style.borderRadius = "12px";
    card.style.background = "#111827";
    card.style.color = "#f8fafc";
    card.style.fontFamily = "Arial, sans-serif";

    const heading = document.createElement("h2");
    heading.textContent = t("Admin authentication");
    heading.style.margin = "0 0 8px";
    heading.style.fontSize = "20px";

    const help = document.createElement("p");
    help.textContent = t("Enter the Nakama console password to continue.");
    help.style.margin = "0 0 16px";
    help.style.color = "#cbd5e1";

    const input = document.createElement("input");
    input.type = "password";
    input.name = "console-password";
    input.autocomplete = "off";
    input.required = true;
    input.maxLength = 1024;
    input.setAttribute("aria-label", t("Console password"));
    input.style.boxSizing = "border-box";
    input.style.width = "100%";
    input.style.padding = "10px 12px";
    input.style.border = "1px solid #64748b";
    input.style.borderRadius = "6px";
    input.style.background = "#020617";
    input.style.color = "#ffffff";
    input.style.fontSize = "16px";

    const error = document.createElement("p");
    error.setAttribute("aria-live", "polite");
    error.style.minHeight = "20px";
    error.style.color = "#fca5a5";

    const buttons = document.createElement("div");
    buttons.style.display = "flex";
    buttons.style.justifyContent = "flex-end";
    buttons.style.gap = "8px";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = t("Cancel");
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = t("Continue");
    for (const button of [cancel, submit]) {
      button.style.padding = "8px 14px";
      button.style.border = "0";
      button.style.borderRadius = "6px";
      button.style.background = "#2563eb";
      button.style.color = "#ffffff";
      button.style.fontSize = "14px";
      button.style.cursor = "pointer";
    }
    cancel.style.background = "#334155";
    cancel.addEventListener("click", () => this.returnToAccount());
    card.addEventListener("submit", (event) => {
      event.preventDefault();
      if (input.value.length === 0) {
        error.textContent = t("Console password is required.");
        input.focus();
        return;
      }
      submit.disabled = true;
      error.textContent = t("Checking password...");
      void this.authenticate(input.value, error, submit);
    });

    buttons.append(cancel, submit);
    card.append(heading, help, input, error, buttons);
    overlay.append(card);
    document.body.append(overlay);
    this.passwordOverlay = overlay;
    this.passwordInput = input;
    input.focus();
  }

  private async authenticate(
    password: string,
    errorLabel: HTMLParagraphElement,
    submitButton: HTMLButtonElement,
  ): Promise<void> {
    try {
      const logs = await requestAdminLogs(password, false);
      this.adminPassword = password;
      this.logsText.setText(logs || t("No logs returned."));
      this.statusText.setText(t("Logs loaded."));
      this.removePasswordPrompt();
      this.layout();
    } catch (error) {
      if (
        error instanceof AdminServerApiError &&
        error.message === "nakama_logs_unavailable"
      ) {
        this.adminPassword = password;
        this.statusText.setText(getAdminErrorMessage(error));
        if (error.details) {
          this.logsText.setText(error.details);
        }
        this.removePasswordPrompt();
        this.layout();
        return;
      }
      errorLabel.textContent = getAdminErrorMessage(error);
      this.passwordInput?.select();
      submitButton.disabled = false;
    }
  }

  private removePasswordPrompt(): void {
    this.passwordOverlay?.remove();
    this.passwordOverlay = null;
    this.passwordInput = null;
  }

  private returnToAccount(): void {
    this.adminPassword = "";
    this.scene.start("AccountScene", {
      client: this.client,
      session: this.session,
    });
  }
}
