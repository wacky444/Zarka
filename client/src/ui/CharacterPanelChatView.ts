import Phaser from "phaser";
import { t } from "../services/i18n";
import { isMobile } from "../utils/isMobile";
import {
  groupChatMessages,
  type ChatMessageGroupItem
} from "./chatMessageGrouping";
import { THEME } from "./ColorPalette";
import { playRandomSound } from "../animation/soundPlayer";
import { ModalCloseButton } from "./ModalCloseButton";

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

export interface ChatViewLayoutBounds {
  margin?: number;
  contentTop?: number;
  boxWidth: number;
  panelHeight: number;
  panelX: number;
  panelY: number;
  mode?: "panel" | "overlay";
  overlayBottomY?: number;
  maxHeight?: number;
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
  private readonly container: Phaser.GameObjects.Container;
  private readonly elements: Array<
    Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible
  >;
  private readonly overlayBackground: Phaser.GameObjects.Rectangle;
  private readonly headerBackground: Phaser.GameObjects.Rectangle;
  private readonly talkIcon: Phaser.GameObjects.Image;
  private readonly statusDot: Phaser.GameObjects.Arc;
  private readonly expandButton: Phaser.GameObjects.Rectangle;
  private readonly expandIcon: Phaser.GameObjects.Image;
  private readonly expandBadge: Phaser.GameObjects.Arc;
  private readonly closeButton: ModalCloseButton;
  private readonly restoreButton: Phaser.GameObjects.Rectangle;
  private readonly restoreIcon: Phaser.GameObjects.Image;
  private readonly minimizedText: Phaser.GameObjects.Text;
  private readonly scrollDownButton: Phaser.GameObjects.Rectangle;
  private readonly scrollDownIcon: Phaser.GameObjects.Image;
  private readonly massiveMultiplayerButton: Phaser.GameObjects.Rectangle;
  private readonly massiveMultiplayerIcon: Phaser.GameObjects.Image;
  private readonly multiplayerButton: Phaser.GameObjects.Rectangle;
  private readonly multiplayerIcon: Phaser.GameObjects.Image;
  private readonly singleplayerButton: Phaser.GameObjects.Rectangle;
  private readonly singleplayerIcon: Phaser.GameObjects.Image;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly messagesBox: Phaser.GameObjects.Rectangle;
  private readonly messagesText: Phaser.GameObjects.Text;
  private readonly overlayText: Phaser.GameObjects.Text;
  private readonly inputBackground: Phaser.GameObjects.Rectangle;
  private readonly inputElement: HTMLInputElement;
  private readonly sendButton: Phaser.GameObjects.Rectangle;
  private readonly sendIcon: Phaser.GameObjects.Image;
  private sendCooldownUntil = 0;
  private sendCooldownTimer: number | null = null;
  private messageAreaHeight = Number.POSITIVE_INFINITY;
  private messageAreaTop = 0;
  private messageAreaBottom = 0;
  private messageAreaWidth = 0;
  private readonly messagesContent: Phaser.GameObjects.Container;
  private readonly messagesScrollPanel:
    | (Phaser.GameObjects.GameObject &
        Phaser.GameObjects.Components.Visible & {
          layout?: () => void;
          setOrigin?: (x: number, y?: number) => Phaser.GameObjects.GameObject;
          setPosition?: (x: number, y: number) => Phaser.GameObjects.GameObject;
          setSize?: (width: number, height: number) => void;
          setMinSize?: (width: number, height: number) => void;
          setScrollFactor?: (
            x: number,
            y?: number
          ) => Phaser.GameObjects.GameObject;
          setMask?: (
            mask: Phaser.Display.Masks.GeometryMask
          ) => Phaser.GameObjects.GameObject;
          clearMask?: () => Phaser.GameObjects.GameObject;
          setVisible?: (visible: boolean) => Phaser.GameObjects.GameObject;
          setMouseWheelScrollerEnable?: (enabled: boolean) => void;
          setScrollerEnable?: (enabled: boolean) => void;
          scrollToBottom?: () => void;
          t?: number;
        })
    | null;
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
  private mode: "panel" | "overlay" = "panel";
  private expanded = false;
  private minimized = false;
  private unreadWhileCompact = false;
  private boundsRect: Phaser.Geom.Rectangle | null = null;
  private lastLayoutBounds: ChatViewLayoutBounds | null = null;
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

    this.container = this.scene.add.container(0, 0);
    this.container.setScrollFactor(0);

    this.overlayBackground = this.scene.add
      .rectangle(0, 0, 100, 100, 0x0a1020, 0.68)
      .setStrokeStyle(1, 0x253754, 0.85)
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive();
    this.overlayBackground.on(Phaser.Input.Events.POINTER_UP, () => {
      if (this.mode === "overlay" && this.minimized) {
        this.setMinimized(false);
      }
    });

    this.headerBackground = this.scene.add
      .rectangle(0, 0, 100, 26, 0x141d33, 0.85)
      .setStrokeStyle(1, 0x2b3e64, 0.9)
      .setOrigin(0, 0)
      .setVisible(false);

    this.talkIcon = this.scene.add
      .image(0, 0, "chat-talk")
      .setDisplaySize(14, 14)
      .setOrigin(0, 0.5)
      .setVisible(false);

    this.statusDot = this.scene.add
      .circle(0, 0, 4, 0x22c55e)
      .setOrigin(0.5, 0.5)
      .setVisible(false);

    this.expandButton = this.scene.add
      .rectangle(0, 0, 24, 22, 0x1a2640, 0.9)
      .setStrokeStyle(1, 0x3d547c, 1)
      .setOrigin(0.5, 0.5)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.expandButton.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.expandButton.setFillStyle(0x2d3e66, 0.95);
    });
    this.expandButton.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.expandButton.setFillStyle(0x1a2640, 0.9);
    });
    this.expandButton.on(Phaser.Input.Events.POINTER_UP, () => {
      this.toggleExpand();
    });

    this.expandIcon = this.scene.add
      .image(0, 0, "chat-expand")
      .setDisplaySize(20, 20)
      .setOrigin(0.5, 0.5)
      .setVisible(false);

    this.expandBadge = this.scene.add
      .circle(0, 0, 4, THEME.colors.unreadBadge)
      .setOrigin(0.5, 0.5)
      .setVisible(false);

    this.closeButton = new ModalCloseButton(this.scene, 0, 0, {
      size: 22,
      onClick: () => {
        this.setMinimized(true);
      }
    });
    this.closeButton.setVisible(false);

    this.restoreButton = this.scene.add
      .rectangle(0, 0, 22, 22, 0x162238, 0.85)
      .setStrokeStyle(1, 0x2b3d60, 1)
      .setOrigin(0.5, 0.5)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.restoreButton.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.restoreButton.setFillStyle(0x283a5e, 0.95);
    });
    this.restoreButton.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.restoreButton.setFillStyle(0x162238, 0.85);
    });
    this.restoreButton.on(Phaser.Input.Events.POINTER_UP, () => {
      this.setMinimized(false);
    });

    this.restoreIcon = this.scene.add
      .image(0, 0, "chat-restore-up")
      .setDisplaySize(16, 16)
      .setOrigin(0.5, 0.5)
      .setVisible(false);

    this.minimizedText = (
      this.scene.rexUI
        ? this.scene.rexUI.add.BBCodeText(0, 0, "", {
            fontSize: "13px",
            fontFamily: "Arial, sans-serif",
            color: THEME.colors.textPrimary
          })
        : this.scene.add.text(0, 0, "", {
            fontSize: "13px",
            fontFamily: "Arial, sans-serif",
            color: THEME.colors.textPrimary
          })
    ) as Phaser.GameObjects.Text;
    this.minimizedText.setOrigin(0, 0.5).setVisible(false);
    this.minimizedText.setInteractive({ useHandCursor: true });
    this.minimizedText.on(Phaser.Input.Events.POINTER_UP, () => {
      if (this.mode === "overlay" && this.minimized) {
        this.setMinimized(false);
      }
    });

    this.scrollDownButton = this.scene.add
      .rectangle(0, 0, 22, 22, 0x162238, 0.85)
      .setStrokeStyle(1, 0x2b3d60, 1)
      .setOrigin(0.5, 0.5)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.scrollDownButton.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.scrollDownButton.setFillStyle(0x283a5e, 0.95);
    });
    this.scrollDownButton.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.scrollDownButton.setFillStyle(0x162238, 0.85);
    });
    this.scrollDownButton.on(Phaser.Input.Events.POINTER_UP, () => {
      this.scrollToBottom();
    });

    this.scrollDownIcon = this.scene.add
      .image(0, 0, "chat-arrow-down")
      .setDisplaySize(18, 18)
      .setOrigin(0.5, 0.5)
      .setVisible(false);

    this.massiveMultiplayerButton = this.scene.add
      .rectangle(0, 0, 22, 22, 0x162238, 0.85)
      .setStrokeStyle(1, 0x2b3d60, 1)
      .setOrigin(0.5, 0.5)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.massiveMultiplayerButton.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.massiveMultiplayerButton.setFillStyle(0x283a5e, 0.95);
    });
    this.massiveMultiplayerButton.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.massiveMultiplayerButton.setFillStyle(0x162238, 0.85);
    });
    this.massiveMultiplayerButton.on(Phaser.Input.Events.POINTER_UP, () => {
      // buttons does nothing for now
    });

    this.massiveMultiplayerIcon = this.scene.add
      .image(0, 0, "chat-massive-multiplayer")
      .setDisplaySize(18, 18)
      .setOrigin(0.5, 0.5)
      .setVisible(false);

    this.multiplayerButton = this.scene.add
      .rectangle(0, 0, 22, 22, 0x162238, 0.85)
      .setStrokeStyle(1, 0x2b3d60, 1)
      .setOrigin(0.5, 0.5)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.multiplayerButton.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.multiplayerButton.setFillStyle(0x283a5e, 0.95);
    });
    this.multiplayerButton.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.multiplayerButton.setFillStyle(0x162238, 0.85);
    });
    this.multiplayerButton.on(Phaser.Input.Events.POINTER_UP, () => {
      // buttons does nothing for now
    });

    this.multiplayerIcon = this.scene.add
      .image(0, 0, "chat-multiplayer")
      .setDisplaySize(18, 18)
      .setOrigin(0.5, 0.5)
      .setVisible(false);

    this.singleplayerButton = this.scene.add
      .rectangle(0, 0, 22, 22, 0x162238, 0.85)
      .setStrokeStyle(1, 0x2b3d60, 1)
      .setOrigin(0.5, 0.5)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.singleplayerButton.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.singleplayerButton.setFillStyle(0x283a5e, 0.95);
    });
    this.singleplayerButton.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.singleplayerButton.setFillStyle(0x162238, 0.85);
    });
    this.singleplayerButton.on(Phaser.Input.Events.POINTER_UP, () => {
      // buttons does nothing for now
    });

    this.singleplayerIcon = this.scene.add
      .image(0, 0, "chat-singleplayer")
      .setDisplaySize(18, 18)
      .setOrigin(0.5, 0.5)
      .setVisible(false);

    this.titleText = this.scene.add
      .text(0, 0, t("General"), {
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
    this.messagesMaskShape = this.scene.add
      .rectangle(0, 0, 1, 1, 0xffffff, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0);
    this.messagesMask = this.messagesMaskShape.createGeometryMask();

    this.messagesScrollPanel = this.scene.rexUI
      ? (this.scene.rexUI.add.scrollablePanel({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          scrollMode: 0,
          panel: { child: this.messagesContent, mask: false },
          slider: {
            track: this.scene.rexUI.add.roundRectangle(
              0,
              0,
              4,
              80,
              2,
              0x1f2a4a
            ),
            thumb: this.scene.rexUI.add.roundRectangle(0, 0, 6, 32, 3, 0x3b82f6)
          },
          scroller: {
            threshold: 10,
            rectBoundsInteractive: true,
            slidingDeceleration: 5000,
            backDeceleration: 2000,
            pointerOutRelease: true
          },
          mouseWheelScroller: { focus: 2, speed: 0.35 },
          space: { left: 0, right: 2, top: 0, bottom: 0, panel: 4 }
        }) as typeof this.messagesScrollPanel)
      : null;
    this.messagesScrollPanel?.setOrigin?.(0, 0);
    this.messagesScrollPanel?.setScrollFactor?.(0);
    this.messagesScrollPanel?.setMask?.(this.messagesMask);
    this.messagesContent.setScrollFactor(0);

    this.overlayText = this.scene.add
      .text(0, 0, "No messages yet.", {
        fontSize: "15px",
        fontFamily: "Arial, sans-serif",
        color: THEME.colors.textMuted
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

    this.sendButton = this.scene.add
      .rectangle(0, 0, 36, 36, 0x162238, 0.85)
      .setStrokeStyle(1, 0x2b3d60, 1)
      .setOrigin(0.5, 0.5)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.sendButton.on(Phaser.Input.Events.POINTER_OVER, () => {
      if (this.canSend()) {
        this.sendButton.setFillStyle(0x283a5e, 0.95);
      }
    });
    this.sendButton.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.sendButton.setFillStyle(0x162238, 0.85);
    });
    this.sendButton.on(Phaser.Input.Events.POINTER_UP, () => {
      this.trySend();
    });

    this.sendIcon = this.scene.add
      .image(0, 0, "chat-send")
      .setDisplaySize(18, 18)
      .setOrigin(0.5, 0.5)
      .setVisible(false);

    this.container.add([
      this.overlayBackground,
      this.headerBackground,
      this.talkIcon,
      this.titleText,
      this.statusDot,
      this.statusText,
      this.expandButton,
      this.expandIcon,
      this.expandBadge,
      this.closeButton,
      this.massiveMultiplayerButton,
      this.massiveMultiplayerIcon,
      this.multiplayerButton,
      this.multiplayerIcon,
      this.singleplayerButton,
      this.singleplayerIcon,
      this.scrollDownButton,
      this.scrollDownIcon,
      this.messagesBox,
      ...(this.messagesScrollPanel
        ? [this.messagesScrollPanel]
        : [this.messagesText]),
      this.overlayText,
      this.inputBackground,
      this.sendButton,
      this.sendIcon,
      this.minimizedText,
      this.restoreButton,
      this.restoreIcon
    ]);

    this.elements = [
      this.titleText,
      this.statusText,
      this.messagesBox,
      ...(this.messagesScrollPanel
        ? [this.messagesScrollPanel]
        : [this.messagesText]),
      this.overlayText,
      this.inputBackground,
      this.sendButton,
      this.sendIcon
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
    this.sendButton.off(Phaser.Input.Events.POINTER_UP);
    this.sendButton.off(Phaser.Input.Events.POINTER_OVER);
    this.sendButton.off(Phaser.Input.Events.POINTER_OUT);
    this.sendButton.disableInteractive();
    this.expandButton.off(Phaser.Input.Events.POINTER_UP);
    this.expandButton.off(Phaser.Input.Events.POINTER_OVER);
    this.expandButton.off(Phaser.Input.Events.POINTER_OUT);
    this.scrollDownButton.off(Phaser.Input.Events.POINTER_UP);
    this.scrollDownButton.off(Phaser.Input.Events.POINTER_OVER);
    this.scrollDownButton.off(Phaser.Input.Events.POINTER_OUT);
    this.massiveMultiplayerButton.off(Phaser.Input.Events.POINTER_UP);
    this.massiveMultiplayerButton.off(Phaser.Input.Events.POINTER_OVER);
    this.massiveMultiplayerButton.off(Phaser.Input.Events.POINTER_OUT);
    this.massiveMultiplayerButton.disableInteractive();
    this.multiplayerButton.off(Phaser.Input.Events.POINTER_UP);
    this.multiplayerButton.off(Phaser.Input.Events.POINTER_OVER);
    this.multiplayerButton.off(Phaser.Input.Events.POINTER_OUT);
    this.multiplayerButton.disableInteractive();
    this.singleplayerButton.off(Phaser.Input.Events.POINTER_UP);
    this.singleplayerButton.off(Phaser.Input.Events.POINTER_OVER);
    this.singleplayerButton.off(Phaser.Input.Events.POINTER_OUT);
    this.singleplayerButton.disableInteractive();
    this.closeButton.destroy();
    this.restoreButton.off(Phaser.Input.Events.POINTER_UP);
    this.restoreButton.off(Phaser.Input.Events.POINTER_OVER);
    this.restoreButton.off(Phaser.Input.Events.POINTER_OUT);
    this.restoreButton.disableInteractive();
    this.minimizedText.off(Phaser.Input.Events.POINTER_UP);
    this.minimizedText.disableInteractive();
    this.overlayBackground.off(Phaser.Input.Events.POINTER_UP);
    this.container.destroy();
  }

  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  getElements(): Array<
    Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible
  > {
    return [this.container];
  }

  isExpanded(): boolean {
    return this.expanded;
  }

  isMinimized(): boolean {
    return this.minimized;
  }

  setMinimized(minimized: boolean): void {
    if (this.minimized === minimized) {
      return;
    }
    this.minimized = minimized;
    if (minimized) {
      this.blurInput();
    } else {
      this.unreadWhileCompact = false;
      this.expandBadge.setVisible(false);
    }
    if (this.lastLayoutBounds) {
      this.layout(this.lastLayoutBounds);
    }
  }

  getMode(): "panel" | "overlay" {
    return this.mode;
  }

  setExpanded(expanded: boolean): void {
    if (this.expanded === expanded) {
      return;
    }
    this.expanded = expanded;
    if (expanded) {
      this.unreadWhileCompact = false;
      this.expandBadge.setVisible(false);
    }
    if (
      this.scene.textures.exists("chat-collapse") &&
      this.scene.textures.exists("chat-expand")
    ) {
      this.expandIcon.setTexture(expanded ? "chat-collapse" : "chat-expand");
    }
    if (this.lastLayoutBounds) {
      this.layout(this.lastLayoutBounds);
    }
  }

  toggleExpand(): void {
    this.setExpanded(!this.expanded);
  }

  containsPoint(x: number, y: number): boolean {
    if (!this.visible || this.mode !== "overlay" || !this.boundsRect) {
      return false;
    }
    return this.boundsRect.contains(x, y);
  }

  startSendCooldown(durationMs: number) {
    const now = Date.now();
    this.sendCooldownUntil = now + Math.max(0, durationMs);
    if (this.sendCooldownTimer !== null) {
      clearTimeout(this.sendCooldownTimer);
    }
    this.sendCooldownTimer = window.setTimeout(
      () => {
        this.sendCooldownUntil = 0;
        this.sendCooldownTimer = null;
        this.updateInputStyles();
      },
      Math.max(0, durationMs)
    );
    this.updateInputStyles();
  }

  layout(bounds: ChatViewLayoutBounds) {
    this.lastLayoutBounds = bounds;
    if (bounds.mode) {
      this.mode = bounds.mode;
    }

    if (this.mode === "overlay") {
      this.layoutOverlay(bounds);
    } else {
      this.layoutPanel(bounds);
    }
  }

  private layoutOverlay(bounds: ChatViewLayoutBounds) {
    const currentWidth = bounds.boxWidth;
    const currentHeight = this.minimized
      ? 30
      : this.expanded
        ? Math.min(360, Math.max(260, (bounds.maxHeight ?? 600) - 100))
        : 210;
    const bottomY = bounds.overlayBottomY ?? bounds.panelY + bounds.panelHeight;
    const panelY = bottomY - currentHeight;
    const panelX = bounds.panelX;

    this.container.setPosition(panelX, panelY);
    this.boundsRect = new Phaser.Geom.Rectangle(
      panelX,
      panelY,
      currentWidth,
      currentHeight
    );

    if (this.minimized) {
      this.overlayBackground
        .setPosition(0, 0)
        .setSize(currentWidth, currentHeight)
        .setDisplaySize(currentWidth, currentHeight)
        .setVisible(this.visible);

      this.headerBackground.setVisible(false);
      this.titleText.setVisible(false);
      this.statusDot.setVisible(false);
      this.statusText.setVisible(false);
      this.expandButton.setVisible(false);
      this.expandIcon.setVisible(false);
      this.expandBadge.setVisible(false);
      this.closeButton.setVisible(false);

      this.massiveMultiplayerButton.setVisible(false);
      this.massiveMultiplayerIcon.setVisible(false);
      this.multiplayerButton.setVisible(false);
      this.multiplayerIcon.setVisible(false);
      this.singleplayerButton.setVisible(false);
      this.singleplayerIcon.setVisible(false);
      this.scrollDownButton.setVisible(false);
      this.scrollDownIcon.setVisible(false);

      this.messagesBox.setVisible(false);
      this.messagesScrollPanel?.setVisible?.(false);
      this.messagesText.setVisible(false);
      this.overlayText.setVisible(false);
      this.inputBackground.setVisible(false);
      this.sendButton.setVisible(false);
      this.sendIcon.setVisible(false);

      this.talkIcon.setPosition(8, currentHeight / 2).setVisible(this.visible);

      const restoreBtnX = currentWidth - 16;
      const restoreBtnY = currentHeight / 2;
      this.restoreButton
        .setPosition(restoreBtnX, restoreBtnY)
        .setVisible(this.visible);
      this.restoreIcon
        .setPosition(restoreBtnX, restoreBtnY)
        .setVisible(this.visible);
      if (this.scene.textures.exists("chat-restore-up")) {
        this.restoreIcon.setTexture("chat-restore-up");
      }

      const textStartX = 28;
      const availableTextWidth = Math.max(20, restoreBtnX - 14 - textStartX);
      this.minimizedText
        .setPosition(textStartX, currentHeight / 2)
        .setVisible(this.visible);
      this.updateMinimizedText(availableTextWidth);

      this.inputElement.style.display = "none";
      return;
    }

    this.minimizedText.setVisible(false);
    this.restoreButton.setVisible(false);
    this.restoreIcon.setVisible(false);

    this.overlayBackground
      .setPosition(0, 0)
      .setSize(currentWidth, currentHeight)
      .setDisplaySize(currentWidth, currentHeight)
      .setVisible(this.visible);

    this.headerBackground
      .setPosition(6, 6)
      .setSize(currentWidth - 12, 26)
      .setDisplaySize(currentWidth - 12, 26)
      .setVisible(this.visible);

    this.talkIcon.setPosition(12, 19).setVisible(this.visible);

    this.titleText
      .setFontSize("13px")
      .setText(t("General"))
      .setPosition(30, 11)
      .setVisible(this.visible);

    this.statusDot
      .setPosition(this.titleText.x + this.titleText.width + 10, 19)
      .setVisible(this.visible);

    this.statusText
      .setPosition(this.statusDot.x + 8, 11)
      .setFontSize("12px")
      .setVisible(this.visible);

    const closeBtnX = currentWidth - 18;
    const expandBtnX = currentWidth - 44;

    this.closeButton.setPosition(closeBtnX, 19).setVisible(this.visible);

    this.expandButton
      .setPosition(expandBtnX, 19)
      .setVisible(this.visible);
    this.expandIcon.setPosition(expandBtnX, 19).setVisible(this.visible);
    if (
      this.scene.textures.exists("chat-collapse") &&
      this.scene.textures.exists("chat-expand")
    ) {
      this.expandIcon.setTexture(
        this.expanded ? "chat-collapse" : "chat-expand"
      );
    }
    this.expandBadge
      .setPosition(expandBtnX + 9, 10)
      .setVisible(this.visible && !this.expanded && this.unreadWhileCompact);

    const railX = 17;
    const boxX = 32;
    const boxY = 36;
    const inputHeight = 36;
    const inputY = currentHeight - inputHeight - 8;
    const boxHeight = Math.max(40, inputY - boxY - 6);
    const boxWidth = currentWidth - boxX - 8;

    const btnSize = 22;
    const btnGap = 3;
    const y1 = boxY + 11;
    const y2 = y1 + btnSize + btnGap;
    const y3 = y2 + btnSize + btnGap;

    this.massiveMultiplayerButton
      .setPosition(railX, y1)
      .setVisible(this.visible);
    this.massiveMultiplayerIcon.setPosition(railX, y1).setVisible(this.visible);

    this.multiplayerButton.setPosition(railX, y2).setVisible(this.visible);
    this.multiplayerIcon.setPosition(railX, y2).setVisible(this.visible);

    this.singleplayerButton.setPosition(railX, y3).setVisible(this.visible);
    this.singleplayerIcon.setPosition(railX, y3).setVisible(this.visible);

    this.scrollDownButton
      .setPosition(railX, boxY + boxHeight - 12)
      .setVisible(this.visible);
    this.scrollDownIcon
      .setPosition(railX, boxY + boxHeight - 12)
      .setVisible(this.visible);

    this.messagesBox
      .setPosition(boxX, boxY)
      .setSize(boxWidth, boxHeight)
      .setDisplaySize(boxWidth, boxHeight)
      .setFillStyle(0x060b16, 0.6)
      .setStrokeStyle(1, 0x1c2b44, 0.7)
      .setVisible(this.visible);

    this.messageAreaTop = boxY + 8;
    this.messageAreaBottom = boxY + boxHeight - 8;
    this.messageAreaHeight = Math.max(0, boxHeight - 16);
    const messageWidthChanged = this.messageAreaWidth !== boxWidth;
    this.messageAreaWidth = boxWidth;

    this.messagesMaskShape.setPosition(panelX + boxX, panelY + boxY);
    this.messagesMaskShape.setSize(boxWidth, boxHeight);

    this.messagesScrollPanel?.setPosition?.(boxX, boxY);
    this.messagesScrollPanel?.setSize?.(boxWidth, boxHeight);
    this.messagesScrollPanel?.setMinSize?.(boxWidth, boxHeight);
    this.messagesScrollPanel?.setVisible?.(
      this.visible && this.messages.length > 0
    );
    this.messagesScrollPanel?.layout?.();

    if (messageWidthChanged) {
      this.messagesText.setWordWrapWidth(boxWidth - 16);
    }
    this.refreshMessages();
    this.alignMessagesTextToBottom();
    this.scrollToBottom();
    this.scene.time?.delayedCall(0, () => this.scrollToBottom());
    this.scene.time?.delayedCall(50, () => this.scrollToBottom());
    this.overlayText.setPosition(boxX + 8, boxY + 8);

    const sendBtnSize = 36;
    const inputX = 6;
    const inputWidth = currentWidth - 12 - sendBtnSize - 6;

    this.inputBackground
      .setPosition(inputX, inputY)
      .setSize(inputWidth, inputHeight)
      .setDisplaySize(inputWidth, inputHeight)
      .setFillStyle(0x0a1020, 0.85)
      .setStrokeStyle(
        1,
        this.inputFocused ? THEME.colors.loadingFill : 0x283856,
        1
      )
      .setVisible(this.visible);

    const sendBtnX = inputX + inputWidth + 6 + sendBtnSize / 2;
    const sendBtnY = inputY + inputHeight / 2;
    this.sendButton
      .setPosition(sendBtnX, sendBtnY)
      .setSize(sendBtnSize, inputHeight)
      .setDisplaySize(sendBtnSize, inputHeight)
      .setVisible(this.visible);
    this.sendIcon.setPosition(sendBtnX, sendBtnY).setVisible(this.visible);

    const canvasRect = this.scene.game.canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / this.scene.scale.width;
    const scaleY = canvasRect.height / this.scene.scale.height;

    this.inputLayout = {
      margin: inputX,
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

    this.inputElement.style.left = `${canvasRect.left + (panelX + inputX) * scaleX}px`;
    this.inputElement.style.top = `${canvasRect.top + (panelY + inputY) * scaleY}px`;
    this.inputElement.style.width = `${inputWidth * scaleX}px`;
    this.inputElement.style.height = `${inputHeight * scaleY}px`;

    this.updateOverlayVisibility();
    this.updateInputStyles();
  }

  private updateMinimizedText(availableWidth: number) {
    if (this.messages.length === 0) {
      const emptyText =
        this.connectionState === "connecting"
          ? "Connecting..."
          : this.connectionState === "error"
            ? "Chat unavailable."
            : t("No messages yet.");
      this.minimizedText.setText(emptyText);
      return;
    }

    const last = this.messages[this.messages.length - 1];
    const time = formatTime(last.timestamp);
    const rawName = last.senderLabel.trim();
    const name = rawName.replace(/\s*\(You\)$/, "").trim();
    const label = last.isSystem ? "System" : name || "Unknown";

    const senderColor = last.isSystem
      ? THEME.colors.zarkanGold
      : last.isSelf
        ? THEME.colors.loadingPercent
        : THEME.colors.textPrimary;

    const timeTag = this.scene.rexUI
      ? `[color=${THEME.colors.textMuted}]${time}[/color]`
      : time;
    const senderTag = this.scene.rexUI
      ? `[color=${senderColor}][b]${label}:[/b][/color]`
      : `${label}:`;

    const singleLineContent = last.content.trim().replace(/\r?\n+/g, " ");
    const prefixLen = `${time} ${label}: `.length;
    const maxChars = Math.max(6, Math.floor(availableWidth / 7.2) - prefixLen);
    const content =
      singleLineContent.length > maxChars
        ? singleLineContent.slice(0, Math.max(0, maxChars - 1)) + "…"
        : singleLineContent;

    this.minimizedText.setText(`${timeTag} ${senderTag} ${content}`);
  }

  private layoutPanel(bounds: ChatViewLayoutBounds) {
    this.container.setPosition(0, 0);
    this.boundsRect = new Phaser.Geom.Rectangle(
      bounds.panelX,
      bounds.panelY,
      bounds.boxWidth,
      bounds.panelHeight
    );

    this.overlayBackground.setVisible(false);
    this.headerBackground.setVisible(false);
    this.talkIcon.setVisible(false);
    this.statusDot.setVisible(false);
    this.expandButton.setVisible(false);
    this.expandIcon.setVisible(false);
    this.expandBadge.setVisible(false);
    this.closeButton.setVisible(false);
    this.restoreButton.setVisible(false);
    this.restoreIcon.setVisible(false);
    this.minimizedText.setVisible(false);
    this.scrollDownButton.setVisible(false);
    this.scrollDownIcon.setVisible(false);
    this.massiveMultiplayerButton.setVisible(false);
    this.massiveMultiplayerIcon.setVisible(false);
    this.multiplayerButton.setVisible(false);
    this.multiplayerIcon.setVisible(false);
    this.singleplayerButton.setVisible(false);
    this.singleplayerIcon.setVisible(false);

    const margin = bounds.margin ?? 16;
    const contentTop = bounds.contentTop ?? 50;
    const boxWidth = bounds.boxWidth;
    const panelHeight = bounds.panelHeight;
    const panelX = bounds.panelX;
    const panelY = bounds.panelY;

    this.titleText
      .setFontSize("16px")
      .setText(t("Match Chat"))
      .setPosition(margin, contentTop)
      .setVisible(this.visible);

    this.statusText
      .setFontSize("14px")
      .setPosition(this.titleText.x + this.titleText.width + 12, contentTop)
      .setVisible(this.visible);

    const boxY = contentTop + 32;
    const inputHeight = 50;
    const inputBottomInset = 64;
    const inputY = Math.max(
      boxY + 64,
      panelHeight - inputHeight - inputBottomInset
    );
    this.overlayText.setPosition(margin + 16, boxY + 8);
    const inputWidth = Math.max(140, boxWidth - 100);

    this.messagesBox
      .setFillStyle(THEME.colors.cardBackground, 1)
      .setStrokeStyle(1, THEME.colors.collapsedBorder, 1);
    this.inputBackground.setFillStyle(THEME.colors.collapsedBackground, 1);

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
    this.messagesMaskShape.setPosition(
      layout.panelX + layout.margin,
      layout.panelY + layout.boxY
    );
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
    const sendBtnSize = 40;
    const sendBtnX = layout.margin + layout.inputWidth + 16 + sendBtnSize / 2;
    const sendBtnY = inputY + layout.inputHeight / 2;
    this.sendButton
      .setPosition(sendBtnX, sendBtnY)
      .setSize(sendBtnSize, sendBtnSize)
      .setDisplaySize(sendBtnSize, sendBtnSize)
      .setVisible(this.visible);
    this.sendIcon.setPosition(sendBtnX, sendBtnY).setVisible(this.visible);
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
    if (this.mode === "panel") {
      this.positionInputRow(inputY);
    }
  }

  private restoreInputRowPosition() {
    if (this.inputLayout && this.mode === "panel") {
      this.positionInputRow(this.inputLayout.inputY);
    }
  }

  scrollToBottom(): void {
    if (!this.messagesScrollPanel) {
      return;
    }
    this.messagesScrollPanel.layout?.();
    if (this.messagesScrollPanel.scrollToBottom) {
      this.messagesScrollPanel.scrollToBottom();
    } else if (this.messagesScrollPanel.t !== undefined) {
      this.messagesScrollPanel.t = 1;
    }
    this.messagesScrollPanel.layout?.();
  }

  private alignMessagesTextToBottom() {
    if (this.messagesScrollPanel) {
      this.messagesText.setPosition(0, 0);
      this.messagesContent.setSize(
        this.messageAreaWidth,
        this.messagesText.height
      );
      this.messagesScrollPanel.layout?.();
      this.scrollToBottom();
      return;
    }
    this.messagesText.setPosition(
      this.messagesText.x,
      Math.max(
        this.messageAreaTop,
        this.messageAreaBottom - this.messagesText.height
      )
    );
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
    if (this.mode === "overlay" && this.minimized && this.lastLayoutBounds) {
      this.updateMinimizedText(
        Math.max(20, this.lastLayoutBounds.boxWidth - 58)
      );
    }
    this.scrollToBottom();
    this.scene.time?.delayedCall(0, () => this.scrollToBottom());
    this.scene.time?.delayedCall(50, () => this.scrollToBottom());
    this.scene.time?.delayedCall(150, () => this.scrollToBottom());
  }

  appendMessage(message: ChatMessageViewModel) {
    this.messages = [...this.messages, message].slice(-MAX_MESSAGES);
    this.refreshMessages();
    if (this.mode === "overlay" && this.minimized && this.lastLayoutBounds) {
      this.updateMinimizedText(
        Math.max(20, this.lastLayoutBounds.boxWidth - 58)
      );
    }
    this.scrollToBottom();
    this.scene.time?.delayedCall(0, () => this.scrollToBottom());
    this.scene.time?.delayedCall(50, () => this.scrollToBottom());
    if (!message.isSelf) {
      playRandomSound(this.scene, "sci_fi_hover", {
        pitchRange: 0,
        rateRange: 0
      });
      if (this.mode === "overlay" && !this.expanded && !this.minimized) {
        this.unreadWhileCompact = true;
        this.expandBadge?.setVisible(this.visible);
      }
    }
  }

  setConnectionState(state: ChatConnectionState, message?: string) {
    this.connectionState = state;
    this.statusText.setText(message ?? this.buildStateLabel(state));
    const dotColor =
      state === "ready"
        ? 0x22c55e
        : state === "connecting"
          ? 0xeab308
          : state === "error"
            ? 0xef4444
            : 0x64748b;
    this.statusDot.setFillStyle(dotColor);
    if (state === "ready") {
      this.overlayMessage = this.messages.length === 0 ? "Be the first." : "";
    } else if (state === "connecting") {
      this.overlayMessage = "Connecting...";
    } else if (state === "error") {
      this.overlayMessage = message ?? "Chat unavailable.";
    } else {
      this.overlayMessage = "";
    }
    if (this.mode === "overlay" && this.minimized && this.lastLayoutBounds) {
      this.updateMinimizedText(
        Math.max(20, this.lastLayoutBounds.boxWidth - 58)
      );
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
    this.container.setVisible(visible);
    if (this.mode === "overlay" && this.minimized) {
      for (const element of this.elements) {
        element.setVisible(false);
      }
      this.overlayBackground.setVisible(visible);
      this.talkIcon.setVisible(visible);
      this.minimizedText.setVisible(visible);
      this.restoreButton.setVisible(visible);
      this.restoreIcon.setVisible(visible);
      this.closeButton.setVisible(false);
      this.expandButton.setVisible(false);
      this.expandIcon.setVisible(false);
      this.expandBadge.setVisible(false);
      this.headerBackground.setVisible(false);
      this.statusDot.setVisible(false);
      this.statusText.setVisible(false);
      this.scrollDownButton.setVisible(false);
      this.scrollDownIcon.setVisible(false);
      this.massiveMultiplayerButton.setVisible(false);
      this.massiveMultiplayerIcon.setVisible(false);
      this.multiplayerButton.setVisible(false);
      this.multiplayerIcon.setVisible(false);
      this.singleplayerButton.setVisible(false);
      this.singleplayerIcon.setVisible(false);
    } else {
      for (const element of this.elements) {
        element.setVisible(visible);
      }
      if (this.mode === "overlay") {
        this.overlayBackground.setVisible(visible);
        this.headerBackground.setVisible(visible);
        this.talkIcon.setVisible(visible);
        this.statusDot.setVisible(visible);
        this.expandButton.setVisible(visible);
        this.expandIcon.setVisible(visible);
        this.expandBadge.setVisible(
          visible && !this.expanded && this.unreadWhileCompact
        );
        this.closeButton.setVisible(visible);
        this.scrollDownButton.setVisible(visible);
        this.scrollDownIcon.setVisible(visible);
        this.massiveMultiplayerButton.setVisible(visible);
        this.massiveMultiplayerIcon.setVisible(visible);
        this.multiplayerButton.setVisible(visible);
        this.multiplayerIcon.setVisible(visible);
        this.singleplayerButton.setVisible(visible);
        this.singleplayerIcon.setVisible(visible);
        const showMessages = visible && this.messages.length > 0;
        this.messagesScrollPanel?.setVisible?.(showMessages);
        this.messagesText.setVisible(showMessages);
        this.minimizedText.setVisible(false);
        this.restoreButton.setVisible(false);
        this.restoreIcon.setVisible(false);
      } else {
        this.closeButton.setVisible(false);
        this.restoreButton.setVisible(false);
        this.restoreIcon.setVisible(false);
        this.minimizedText.setVisible(false);
      }
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
    if (this.mode === "overlay" && this.minimized) {
      this.setMinimized(false);
    }
    this.inputElement.focus();
  }

  blurInput() {
    this.inputElement.blur();
  }

  isInputFocused(): boolean {
    return this.inputFocused;
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
      this.messagesScrollPanel?.setVisible?.(false);
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
      const rawName = entry.senderLabel.trim();
      const name = rawName.replace(/\s*\(You\)$/, "").trim();
      const label = entry.isSystem ? "System" : name || "Unknown";

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
    const showMessages =
      this.visible && !(this.mode === "overlay" && this.minimized);
    this.messagesText.setVisible(showMessages);
    this.messagesScrollPanel?.setVisible?.(showMessages);
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

  private canSend(): boolean {
    return (
      this.visible &&
      this.panelVisible &&
      this.inputEnabled &&
      !this.isCoolingDown() &&
      this.inputValue.trim().length > 0
    );
  }

  private updateInputStyles() {
    const showInput =
      this.visible &&
      this.panelVisible &&
      !(this.mode === "overlay" && this.minimized);
    this.inputElement.style.display = showInput ? "block" : "none";
    this.inputElement.disabled =
      !showInput || !this.inputEnabled;
    this.inputBackground.setStrokeStyle(
      1,
      this.inputFocused
        ? THEME.colors.loadingFill
        : THEME.colors.collapsedBorder,
      1
    );
    const canSend = this.canSend();
    if (canSend) {
      this.sendButton.setAlpha(1);
      this.sendIcon.setAlpha(1);
      this.sendButton.setStrokeStyle(1, 0x3b82f6, 1);
      this.sendButton.setInteractive({ useHandCursor: true });
    } else {
      this.sendButton.setAlpha(0.4);
      this.sendIcon.setAlpha(0.35);
      this.sendButton.setStrokeStyle(1, 0x22314a, 0.8);
      this.sendButton.disableInteractive();
    }
  }

  private isCoolingDown() {
    return this.sendCooldownUntil > Date.now();
  }

  private updateOverlayVisibility() {
    const shouldShow =
      this.visible &&
      !(this.mode === "overlay" && this.minimized) &&
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
