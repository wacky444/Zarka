import Phaser from "phaser";

export type ChatConnectionState = "idle" | "connecting" | "ready" | "error";

export interface ChatMessageViewModel {
  id: string;
  senderLabel: string;
  content: string;
  timestamp: number;
  isSelf: boolean;
  isSystem?: boolean;
}

interface CharacterPanelChatViewOptions {
  scene: Phaser.Scene;
  onSend: (message: string) => void;
  onFocusChange?: (focused: boolean) => void;
  maxInputLength?: number;
}

const MAX_MESSAGES = 31;

function clampLength(value: string, max: number) {
  if (value.length <= max) {
    return value;
  }
  return value.slice(0, max);
}

function formatTime(value: number) {
  const date = new Date(value);
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

export class CharacterPanelChatView {
  private readonly scene: Phaser.Scene;
  private readonly onSend: (message: string) => void;
  private readonly onFocusChange?: (focused: boolean) => void;
  private readonly maxInputLength: number;
  private readonly elements: Array<
    Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible
  >;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly messagesBox: Phaser.GameObjects.Rectangle;
  private readonly messagesText: Phaser.GameObjects.Text;
  private readonly overlayText: Phaser.GameObjects.Text;
  private readonly inputBackground: Phaser.GameObjects.Rectangle;
  private readonly inputText: Phaser.GameObjects.Text;
  private readonly placeholderText: Phaser.GameObjects.Text;
  private readonly sendButton: Phaser.GameObjects.Text;
  private readonly keyListener: (event: KeyboardEvent) => void;
  private sendCooldownUntil = 0;
  private sendCooldownTimer: number | null = null;
  private inputValue = "";
  private inputFocused = false;
  private inputEnabled = false;
  private visible = false;
  private connectionState: ChatConnectionState = "idle";
  private overlayMessage = "";
  private messages: ChatMessageViewModel[] = [];

  constructor(options: CharacterPanelChatViewOptions) {
    this.scene = options.scene;
    this.onSend = options.onSend;
    this.onFocusChange = options.onFocusChange;
    this.maxInputLength = options.maxInputLength ?? 70;
    this.titleText = this.scene.add
      .text(0, 0, "Match Chat", { fontSize: "16px", color: "#ffffff" })
      .setVisible(false);
    this.statusText = this.scene.add
      .text(0, 0, "", { fontSize: "14px", color: "#a0b7ff" })
      .setVisible(false);
    this.messagesBox = this.scene.add
      .rectangle(0, 0, 100, 100, 0x1b2440)
      .setOrigin(0, 0)
      .setVisible(false);
    this.messagesText = this.scene.add
      .text(0, 0, "", {
        fontSize: "15px",
        color: "#cbd5f5",
        wordWrap: { width: 280, useAdvancedWrap: true },
      })
      .setVisible(false);
    this.overlayText = this.scene.add
      .text(0, 0, "No messages yet.", {
        fontSize: "15px",
        color: "#7f8ab8",
      })
      .setVisible(false);
    this.inputBackground = this.scene.add
      .rectangle(0, 0, 100, 44, 0x11152a)
      .setStrokeStyle(1, 0x2c3557, 1)
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.inputText = this.scene.add
      .text(0, 0, "", { fontSize: "15px", color: "#ffffff" })
      .setVisible(false);
    this.placeholderText = this.scene.add
      .text(0, 0, "Type a message", { fontSize: "15px", color: "#6c7398" })
      .setVisible(false);
    this.sendButton = this.scene.add
      .text(0, 0, "Send", { fontSize: "16px", color: "#4ade80" })
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.elements = [
      this.titleText,
      this.statusText,
      this.messagesBox,
      this.messagesText,
      this.overlayText,
      this.inputBackground,
      this.inputText,
      this.placeholderText,
      this.sendButton,
    ];
    this.keyListener = (event: KeyboardEvent) => {
      this.handleKeyInput(event);
    };
    this.scene.input.keyboard?.on("keydown", this.keyListener);
    this.inputBackground.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (!this.inputEnabled) {
        return;
      }
      this.focusInput();
    });
    this.sendButton.on(Phaser.Input.Events.POINTER_UP, () => {
      this.trySend();
    });
  }

  destroy() {
    this.scene.input.keyboard?.off("keydown", this.keyListener);
    this.inputBackground.off(Phaser.Input.Events.POINTER_DOWN);
    this.inputBackground.disableInteractive();
    this.sendButton.off(Phaser.Input.Events.POINTER_UP);
    this.sendButton.disableInteractive();
    for (const element of this.elements) {
      element.destroy();
    }
  }

  getElements(): Array<
    Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible
  > {
    return this.elements;
  }

  startSendCooldown(durationMs: number) {
    const now = Date.now();
    this.sendCooldownUntil = now + Math.max(0, durationMs);
    if (this.sendCooldownTimer !== null) {
      clearTimeout(this.sendCooldownTimer);
    }
    this.sendCooldownTimer = window.setTimeout(() => {
      this.sendCooldownUntil = 0;
      this.sendCooldownTimer = null;
      this.updateInputStyles();
    }, Math.max(0, durationMs));
    this.updateInputStyles();
  }

  layout(bounds: {
    margin: number;
    contentTop: number;
    boxWidth: number;
    panelHeight: number;
  }) {
    const { margin, contentTop, boxWidth, panelHeight } = bounds;
    this.titleText.setPosition(margin, contentTop);
    this.statusText.setPosition(
      this.titleText.x + this.titleText.width + 12,
      contentTop
    );
    const boxY = contentTop + 32;
    const inputHeight = 50;
    const boxHeight = Math.max(160, panelHeight - boxY - inputHeight - margin);
    this.messagesBox.setPosition(margin, boxY);
    this.messagesBox.setSize(boxWidth, boxHeight);
    this.messagesBox.setDisplaySize(boxWidth, boxHeight);
    this.messagesText.setPosition(margin + 16, boxY + 8);
    this.messagesText.setWordWrapWidth(boxWidth - 32);
    this.overlayText.setPosition(margin + 16, boxY + 8);
    const inputY = boxY + boxHeight + 16;
    const inputWidth = Math.max(140, boxWidth - 100);
    this.inputBackground.setPosition(margin, inputY);
    this.inputBackground.setSize(inputWidth, inputHeight);
    this.inputBackground.setDisplaySize(inputWidth, inputHeight);
    this.placeholderText.setPosition(margin + 12, inputY + 12);
    this.inputText.setPosition(margin + 12, inputY + 12);
    this.inputText.setWordWrapWidth(inputWidth - 24);
    this.placeholderText.setWordWrapWidth(inputWidth - 24);
    this.sendButton.setPosition(margin + inputWidth + 16, inputY + 10);
    this.updateOverlayVisibility();
  }

  setMessages(messages: ChatMessageViewModel[]) {
    this.messages = messages.slice(-MAX_MESSAGES);
    this.refreshMessages();
  }

  appendMessage(message: ChatMessageViewModel) {
    this.messages = [...this.messages, message].slice(-MAX_MESSAGES);
    this.refreshMessages();
  }

  setConnectionState(state: ChatConnectionState, message?: string) {
    this.connectionState = state;
    this.statusText.setText(message ?? this.buildStateLabel(state));
    if (state === "ready") {
      this.overlayMessage = this.messages.length === 0 ? "Be the first." : "";
    } else if (state === "connecting") {
      this.overlayMessage = "Connecting...";
    } else if (state === "error") {
      this.overlayMessage = message ?? "Chat unavailable.";
    } else {
      this.overlayMessage = "";
    }
    this.updateOverlayVisibility();
  }

  setInputEnabled(enabled: boolean) {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.blurInput();
      this.inputBackground.disableInteractive();
    } else if (this.visible) {
      this.inputBackground.setInteractive({ useHandCursor: true });
    }
    this.updateInputStyles();
  }

  handleVisibilityChange(visible: boolean) {
    this.visible = visible;
    for (const element of this.elements) {
      element.setVisible(visible);
    }
    if (!visible) {
      this.blurInput();
      this.inputBackground.disableInteractive();
      this.sendButton.disableInteractive();
    } else if (this.inputEnabled) {
      this.inputBackground.setInteractive({ useHandCursor: true });
    }
    this.updateOverlayVisibility();
    this.updateInputStyles();
  }

  focusInput() {
    if (!this.inputEnabled) {
      return;
    }
    if (this.inputFocused) {
      return;
    }
    this.inputFocused = true;
    this.onFocusChange?.(true);
    this.updateInputStyles();
  }

  blurInput() {
    if (!this.inputFocused) {
      return;
    }
    this.inputFocused = false;
    this.onFocusChange?.(false);
    this.updateInputStyles();
  }

  private handleKeyInput(event: KeyboardEvent) {
    if (
      !this.inputFocused ||
      !this.inputEnabled ||
      !this.visible ||
      this.isCoolingDown()
    ) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      this.trySend();
      return;
    }
    if (event.key === "Backspace") {
      if (this.inputValue.length > 0) {
        this.inputValue = this.inputValue.slice(0, -1);
        this.updateInputStyles();
      }
      return;
    }
    if (event.key === "Escape") {
      this.blurInput();
      return;
    }
    if (event.key.length === 1) {
      const next = clampLength(
        this.inputValue + event.key,
        this.maxInputLength
      );
      this.inputValue = next;
      this.updateInputStyles();
    }
  }

  private trySend() {
    if (!this.inputEnabled || this.isCoolingDown()) {
      return;
    }
    const trimmed = this.inputValue.trim();
    if (!trimmed) {
      return;
    }
    this.onSend(trimmed);
    this.inputValue = "";
    this.updateInputStyles();
  }

  private refreshMessages() {
    if (this.messages.length === 0) {
      this.messagesText.setText("");
      this.messagesText.setVisible(false);
      this.overlayMessage =
        this.connectionState === "ready"
          ? "Be the first."
          : this.overlayMessage;
      this.updateOverlayVisibility();
      return;
    }
    const lines = this.messages.map((entry) => {
      const time = formatTime(entry.timestamp);
      const label = entry.isSystem
        ? "System"
        : entry.isSelf
        ? "You"
        : entry.senderLabel;
      return `${time} ${label}: ${entry.content}`;
    });
    this.messagesText.setText(lines.join("\n"));
    this.messagesText.setVisible(this.visible);
    this.overlayMessage = "";
    this.updateOverlayVisibility();
  }

  private buildStateLabel(state: ChatConnectionState) {
    if (state === "connecting") {
      return "Connecting...";
    }
    if (state === "ready") {
      return "Connected";
    }
    if (state === "error") {
      return "Unavailable";
    }
    return "";
  }

  private updateInputStyles() {
    const cooling = this.isCoolingDown();
    const caret = this.inputFocused ? "_" : "";
    this.inputText.setText(`${this.inputValue}${caret}`);
    const showPlaceholder =
      !this.inputFocused && this.inputValue.trim().length === 0;
    this.placeholderText.setVisible(this.visible && showPlaceholder);
    const showText = this.inputFocused || this.inputValue.length > 0;
    this.inputText.setVisible(this.visible && showText);
    const canSend =
      this.visible &&
      this.inputEnabled &&
      !cooling &&
      this.inputValue.trim().length > 0;
    if (canSend) {
      this.sendButton.setAlpha(1);
      this.sendButton.setColor("#4ade80");
      this.sendButton.setInteractive({ useHandCursor: true });
    } else {
      this.sendButton.setAlpha(0.4);
      this.sendButton.setColor("#2f9c5f");
      this.sendButton.disableInteractive();
    }
  }

  private isCoolingDown() {
    return this.sendCooldownUntil > Date.now();
  }

  private updateOverlayVisibility() {
    const shouldShow =
      this.visible &&
      (this.overlayMessage.trim().length > 0 || this.messages.length === 0);
    this.overlayText.setVisible(shouldShow);
    this.overlayText.setText(
      this.overlayMessage.trim().length > 0
        ? this.overlayMessage
        : this.messages.length === 0
        ? "No messages yet."
        : ""
    );
  }
}
