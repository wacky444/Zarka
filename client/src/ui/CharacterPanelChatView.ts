import Phaser from "phaser";
import { t } from "../services/i18n";
import { isMobile } from "../utils/isMobile";
import { groupChatMessages, type ChatMessageGroupItem } from "./chatMessageGrouping";
import { THEME } from "./ColorPalette";
import { makeButton, type UIButton } from "./button";
import { playRandomSound } from "../animation/soundPlayer";

export type ChatConnectionState = "idle" | "connecting" | "ready" | "error";

export interface ChatMessageViewModel extends ChatMessageGroupItem {
  id: string;
}

interface CharacterPanelChatViewOptions {
  scene: Phaser.Scene;
  onSend: (message: string) => void;
  onFocusChange?: (focused: boolean) => void;
  maxInputLength?: number;
}

interface ChatInputLayout {
  margin: number;
  panelX: number;
  panelY: number;
  boxWidth: number;
  boxY: number;
  inputWidth: number;
  inputHeight: number;
  inputY: number;
  scaleX: number;
  scaleY: number;
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
  private readonly inputElement: HTMLInputElement;
  private readonly sendButton: UIButton;
  private sendCooldownUntil = 0;
  private sendCooldownTimer: number | null = null;
  private messageAreaHeight = Number.POSITIVE_INFINITY;
  private messageAreaTop = 0;
  private messageAreaBottom = 0;
  private messageAreaWidth = 0;
  private readonly messagesContent: Phaser.GameObjects.Container;
  private readonly messagesScrollPanel: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible & {
    layout?: () => void; setOrigin?: (x: number, y?: number) => Phaser.GameObjects.GameObject;
    setPosition?: (x: number, y: number) => Phaser.GameObjects.GameObject;
    setSize?: (width: number, height: number) => void; setMinSize?: (width: number, height: number) => void;
    setScrollFactor?: (x: number, y?: number) => Phaser.GameObjects.GameObject;
    setMask?: (mask: Phaser.Display.Masks.GeometryMask) => Phaser.GameObjects.GameObject;
    clearMask?: () => Phaser.GameObjects.GameObject;
    setVisible?: (visible: boolean) => Phaser.GameObjects.GameObject;
    setMouseWheelScrollerEnable?: (enabled: boolean) => void; setScrollerEnable?: (enabled: boolean) => void;
  } | null;
  private readonly messagesMask: Phaser.Display.Masks.GeometryMask;
  private readonly messagesMaskShape: Phaser.GameObjects.Rectangle;
  private inputLayout: ChatInputLayout | null = null;
  private previousParentSize: { width: string; height: string } | null = null;
  private inputValue = "";
  private inputFocused = false;
  private inputEnabled = false;
  private visible = false;
  private panelVisible = true;
  private connectionState: ChatConnectionState = "idle";
  private overlayMessage = "";
  private messages: ChatMessageViewModel[] = [];
  private readonly visualViewportChangeHandler = () => {
    this.updateInputForVisualViewport();
  };
  private readonly orientationChangeHandler = () => {
    this.restoreGameParentSize();
  };

  constructor(options: CharacterPanelChatViewOptions) {
    this.scene = options.scene;
    this.onSend = options.onSend;
    this.onFocusChange = options.onFocusChange;
    this.maxInputLength = options.maxInputLength ?? 70;
    this.titleText = this.scene.add
      .text(0, 0, "Match Chat", {
        fontSize: "16px",
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
        color: THEME.colors.textPrimary
      })
      .setVisible(false);
    this.statusText = this.scene.add
      .text(0, 0, "", {
        fontSize: "14px",
        fontFamily: "Arial, sans-serif",
        color: THEME.colors.loadingPercent
      })
      .setVisible(false);
    this.messagesBox = this.scene.add
      .rectangle(0, 0, 100, 100, THEME.colors.cardBackground)
      .setStrokeStyle(1, THEME.colors.collapsedBorder, 1)
      .setOrigin(0, 0)
      .setVisible(false);
    this.messagesText = (
      this.scene.rexUI
        ? this.scene.rexUI.add.BBCodeText(0, 0, "", {
            fontSize: "14px",
            fontFamily: "Arial, sans-serif",
            color: THEME.colors.modalText,
            wrap: { mode: "word", width: 280 }
          })
        : this.scene.add.text(0, 0, "", {
            fontSize: "14px",
            fontFamily: "Arial, sans-serif",
            color: THEME.colors.modalText,
            wordWrap: { width: 280, useAdvancedWrap: true }
          })
    ) as Phaser.GameObjects.Text;
    this.messagesContent = this.scene.add.container(0, 0);
    this.messagesContent.add(this.messagesText);
    this.messagesMaskShape = this.scene.add.rectangle(0, 0, 1, 1, 0xffffff, 0).setOrigin(0, 0).setScrollFactor(0);
    this.messagesMask = this.messagesMaskShape.createGeometryMask();
    this.messagesScrollPanel = this.scene.rexUI
      ? this.scene.rexUI.add.scrollablePanel({
          x: 0, y: 0, width: 100, height: 100, scrollMode: 0,
          panel: { child: this.messagesContent, mask: false },
          slider: {
            track: this.scene.rexUI.add.roundRectangle(0, 0, 4, 80, 2, 0x1f2a4a),
            thumb: this.scene.rexUI.add.roundRectangle(0, 0, 6, 32, 3, 0x3b82f6)
          },
          scroller: { threshold: 10, rectBoundsInteractive: true, slidingDeceleration: 5000, backDeceleration: 2000, pointerOutRelease: true },
          mouseWheelScroller: { focus: 2, speed: 0.35 },
          space: { left: 0, right: 2, top: 0, bottom: 0, panel: 4 }
        }) as typeof this.messagesScrollPanel
      : null;
    this.messagesScrollPanel?.setOrigin?.(0, 0);
    this.messagesScrollPanel?.setScrollFactor?.(0);
    this.messagesScrollPanel?.setMask?.(this.messagesMask);
    this.messagesContent.setScrollFactor(0);
    this.overlayText = this.scene.add
      .text(0, 0, "No messages yet.", {
        fontSize: "15px",
        fontFamily: "Arial, sans-serif",
        color: THEME.colors.textMuted,
      })
      .setVisible(false);
    this.inputBackground = this.scene.add
      .rectangle(0, 0, 100, 44, THEME.colors.collapsedBackground)
      .setStrokeStyle(1, THEME.colors.collapsedBorder, 1)
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.inputElement = document.createElement("input");
    this.inputElement.type = "text";
    this.inputElement.inputMode = "text";
    this.inputElement.maxLength = this.maxInputLength;
    this.inputElement.placeholder = t("Type a message");
    this.inputElement.setAttribute("aria-label", t("Type a message"));
    this.inputElement.enterKeyHint = "send";
    this.inputElement.autocomplete = "off";
    this.inputElement.style.position = "fixed";
    this.inputElement.style.display = "none";
    this.inputElement.style.zIndex = "1";
    this.inputElement.style.boxSizing = "border-box";
    this.inputElement.style.margin = "0";
    this.inputElement.style.padding = "0 12px";
    this.inputElement.style.color = THEME.colors.textPrimary;
    this.inputElement.style.background = "transparent";
    this.inputElement.style.border = "0";
    this.inputElement.style.font = "16px Arial, sans-serif";
    this.inputElement.style.outline = "none";
    this.inputElement.style.caretColor = THEME.colors.textPrimary;
    document.body.appendChild(this.inputElement);
    window.visualViewport?.addEventListener(
      "resize",
      this.visualViewportChangeHandler
    );
    window.visualViewport?.addEventListener(
      "scroll",
      this.visualViewportChangeHandler
    );
    window.addEventListener("orientationchange", this.orientationChangeHandler);
    window.addEventListener("resize", this.visualViewportChangeHandler);
    this.inputElement.addEventListener("input", () => {
      this.inputValue = clampLength(
        this.inputElement.value,
        this.maxInputLength
      );
      if (this.inputElement.value !== this.inputValue) {
        this.inputElement.value = this.inputValue;
      }
      this.updateInputStyles();
    });
    this.inputElement.addEventListener("focus", () => {
      if (!this.inputEnabled || !this.visible || !this.panelVisible) {
        this.inputElement.blur();
        return;
      }
      this.inputFocused = true;
      this.lockGameParentSize();
      this.onFocusChange?.(true);
      this.updateInputStyles();
      this.updateInputForVisualViewport();
    });
    this.inputElement.addEventListener("blur", () => {
      this.inputFocused = false;
      this.restoreInputRowPosition();
      this.restoreGameParentSize();
      this.onFocusChange?.(false);
      this.updateInputStyles();
    });
    this.inputElement.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        this.blurInput();
      } else if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        this.trySend();
      }
    });
    this.sendButton = makeButton(this.scene, 0, 0, "Send", () => {
      this.trySend();
    });
    this.sendButton.setVisible(false);
    this.elements = [
      this.titleText,
      this.statusText,
      this.messagesBox,
      ...(this.messagesScrollPanel ? [this.messagesScrollPanel] : [this.messagesText]),
      this.overlayText,
      this.inputBackground,
      this.sendButton,
    ];
    this.inputBackground.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (!this.inputEnabled) {
        return;
      }
      this.focusInput();
    });
  }

  destroy() {
    this.blurInput();
    this.restoreGameParentSize();
    window.visualViewport?.removeEventListener(
      "resize",
      this.visualViewportChangeHandler
    );
    window.visualViewport?.removeEventListener(
      "scroll",
      this.visualViewportChangeHandler
    );
    window.removeEventListener(
      "orientationchange",
      this.orientationChangeHandler
    );
    window.removeEventListener("resize", this.visualViewportChangeHandler);
    this.inputElement.remove();
    this.messagesScrollPanel?.clearMask?.();
    this.messagesMask.destroy();
    this.messagesMaskShape.destroy();
    this.messagesContent.destroy();
    this.inputBackground.off(Phaser.Input.Events.POINTER_DOWN);
    this.inputBackground.disableInteractive();
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
    panelX: number;
    panelY: number;
  }) {
    const { margin, contentTop, boxWidth, panelHeight, panelX, panelY } =
      bounds;
    this.titleText.setPosition(margin, contentTop);
    this.statusText.setPosition(
      this.titleText.x + this.titleText.width + 12,
      contentTop
    );
    const boxY = contentTop + 32;
    const inputHeight = 50;
    const inputBottomInset = 64;
    const inputY = Math.max(
      boxY + 64,
      panelHeight - inputHeight - inputBottomInset
    );
    this.overlayText.setPosition(margin + 16, boxY + 8);
    const inputWidth = Math.max(140, boxWidth - 100);
    this.inputBackground.setSize(inputWidth, inputHeight);
    this.inputBackground.setDisplaySize(inputWidth, inputHeight);
    const canvasRect = this.scene.game.canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / this.scene.scale.width;
    const scaleY = canvasRect.height / this.scene.scale.height;
    this.inputLayout = {
      margin,
      panelX,
      panelY,
      boxWidth,
      boxY,
      inputWidth,
      inputHeight,
      inputY,
      scaleX,
      scaleY
    };
    this.positionInputRow(inputY);
    if (this.inputFocused) {
      this.updateInputForVisualViewport();
    }
    this.updateOverlayVisibility();
  }

  private positionInputRow(inputY: number) {
    const layout = this.inputLayout;
    if (!layout) {
      return;
    }
    const canvasRect = this.scene.game.canvas.getBoundingClientRect();
    const boxHeight = Math.max(0, inputY - layout.boxY - 16);
    const messageAreaHeight = Math.max(0, boxHeight - 16);
    const messageWidthChanged = this.messageAreaWidth !== layout.boxWidth;
    const messageAreaChanged =
      messageAreaHeight !== this.messageAreaHeight || messageWidthChanged;
    this.messagesBox.setPosition(layout.margin, layout.boxY);
    this.messagesBox.setSize(layout.boxWidth, boxHeight);
    this.messagesBox.setDisplaySize(layout.boxWidth, boxHeight);
    this.messageAreaTop = layout.boxY + 8;
    this.messageAreaBottom = layout.boxY + boxHeight - 8;
    this.messagesMaskShape.setPosition(layout.panelX + layout.margin, layout.panelY + layout.boxY);
    this.messagesMaskShape.setSize(layout.boxWidth, boxHeight);
    this.messagesScrollPanel?.setPosition?.(layout.margin, layout.boxY);
    this.messagesScrollPanel?.setSize?.(layout.boxWidth, boxHeight);
    this.messagesScrollPanel?.setMinSize?.(layout.boxWidth, boxHeight);
    this.messagesScrollPanel?.layout?.();
    this.messageAreaHeight = messageAreaHeight;
    if (messageWidthChanged) {
      this.messagesText.setWordWrapWidth(layout.boxWidth - 32);
      this.messageAreaWidth = layout.boxWidth;
    }
    this.messagesText.setPosition(layout.margin + 16, this.messageAreaTop);
    if (messageAreaChanged) {
      this.refreshMessages();
    }
    this.alignMessagesTextToBottom();
    this.inputBackground.setPosition(layout.margin, inputY);
    this.sendButton.setPosition(layout.margin + layout.inputWidth + 16, inputY + 10);
    this.inputElement.style.left = `${
      canvasRect.left + (layout.panelX + layout.margin) * layout.scaleX
    }px`;
    this.inputElement.style.top = `${
      canvasRect.top + (layout.panelY + inputY) * layout.scaleY
    }px`;
    this.inputElement.style.width = `${layout.inputWidth * layout.scaleX}px`;
    this.inputElement.style.height = `${layout.inputHeight * layout.scaleY}px`;
  }

  private updateInputForVisualViewport() {
    const viewport = window.visualViewport;
    const layout = this.inputLayout;
    if (!this.inputFocused || !layout) {
      return;
    }
    const canvasRect = this.scene.game.canvas.getBoundingClientRect();
    const normalTop =
      canvasRect.top + (layout.panelY + layout.inputY) * layout.scaleY;
    const visibleTop = viewport?.offsetTop ?? 0;
    const visibleHeight = viewport?.height ?? window.innerHeight;
    const keyboardSafeTop =
      visibleTop + visibleHeight - layout.inputHeight * layout.scaleY - 8;
    const top = Math.max(visibleTop, Math.min(normalTop, keyboardSafeTop));
    const inputY = (top - canvasRect.top) / layout.scaleY - layout.panelY;
    this.positionInputRow(inputY);
  }

  private restoreInputRowPosition() {
    if (this.inputLayout) {
      this.positionInputRow(this.inputLayout.inputY);
    }
  }

  private alignMessagesTextToBottom() {
    if (this.messagesScrollPanel) {
      this.messagesText.setPosition(0, 0);
      this.messagesContent.setSize(this.messageAreaWidth, this.messagesText.height);
      this.messagesScrollPanel.layout?.();
      return;
    }
    this.messagesText.setPosition(this.messagesText.x, Math.max(this.messageAreaTop, this.messageAreaBottom - this.messagesText.height));
  }

  private lockGameParentSize() {
    if (
      this.previousParentSize ||
      (!isMobile() && navigator.maxTouchPoints === 0)
    ) {
      return;
    }
    const parent = this.scene.game.canvas.parentElement;
    if (!parent) {
      return;
    }
    const bounds = parent.getBoundingClientRect();
    this.previousParentSize = {
      width: parent.style.width,
      height: parent.style.height
    };
    parent.style.width = `${bounds.width}px`;
    parent.style.height = `${bounds.height}px`;
  }

  private restoreGameParentSize() {
    if (!this.previousParentSize) {
      return;
    }
    const parent = this.scene.game.canvas.parentElement;
    if (parent) {
      parent.style.width = this.previousParentSize.width;
      parent.style.height = this.previousParentSize.height;
    }
    this.previousParentSize = null;
  }

  setMessages(messages: ChatMessageViewModel[]) {
    this.messages = messages.slice(-MAX_MESSAGES);
    this.refreshMessages();
  }

  appendMessage(message: ChatMessageViewModel) {
    this.messages = [...this.messages, message].slice(-MAX_MESSAGES);
    this.refreshMessages();
    if (!message.isSelf) {
      playRandomSound(this.scene, "sci_fi_hover", {
        pitchRange: 0,
        rateRange: 0,
      });
    }
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
    this.inputElement.disabled =
      !enabled || !this.visible || !this.panelVisible;
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

  setPanelVisible(visible: boolean) {
    this.panelVisible = visible;
    if (!visible) {
      this.blurInput();
    }
    this.updateInputStyles();
  }

  focusInput() {
    if (!this.inputEnabled || !this.visible || !this.panelVisible) {
      return;
    }
    this.inputElement.focus();
  }

  blurInput() {
    this.inputElement.blur();
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
    this.inputElement.value = "";
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
    const hasBBCode = Boolean(this.scene.rexUI);
    const groups = groupChatMessages(this.messages);
    const formattedGroups = groups.map((group) => {
        const entry = group.first;
        const time = formatTime(entry.timestamp);
        const name = entry.senderLabel.trim();
        const label = entry.isSystem
          ? "System"
          : entry.isSelf
          ? name
            ? name.endsWith("(You)")
              ? name
              : `${name} (You)`
            : "You"
          : name || "Unknown";

        const senderColor = entry.isSystem
          ? THEME.colors.zarkanGold
          : entry.isSelf
          ? THEME.colors.loadingPercent
          : THEME.colors.textPrimary;

        const timeTag = hasBBCode
          ? `[color=${THEME.colors.textMuted}]${time}[/color]`
          : time;
        const senderTag = hasBBCode
          ? `[color=${senderColor}][b]${label}[/b][/color]`
          : label;

        const groupMessages =
          group.messages && group.messages.length > 0
            ? group.messages
            : [group.first];

        const lines = groupMessages.map((msg, idx) => {
          const text = msg.content.trim();
          if (idx === 0) {
            return `${timeTag} ${senderTag}: ${text}`;
          }
          return text;
        });

        return lines.join("\n");
      });

    this.messagesText.setText(formattedGroups.join("\n\n"));
    this.alignMessagesTextToBottom();
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
    this.inputElement.style.display =
      this.visible && this.panelVisible ? "block" : "none";
    this.inputElement.disabled =
      !this.visible || !this.inputEnabled || !this.panelVisible;
    this.inputBackground.setStrokeStyle(
      1,
      this.inputFocused
        ? THEME.colors.loadingFill
        : THEME.colors.collapsedBorder,
      1
    );
    const canSend =
      this.visible &&
      this.inputEnabled &&
      !cooling &&
      this.inputValue.trim().length > 0;
    if (canSend) {
      this.sendButton.setAlpha(1);
      this.sendButton.setColor(THEME.colors.healthRecover);
      this.sendButton.setInteractive({ useHandCursor: true });
    } else {
      this.sendButton.setAlpha(0.4);
      this.sendButton.setColor(THEME.buttons.disabled.text);
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
