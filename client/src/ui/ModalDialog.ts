import Phaser from "phaser";
import { THEME } from "./ColorPalette";
import { ModalCloseButton } from "./ModalCloseButton";

export interface ModalDialogConfig {
  title?: string;
  subtitle?: string;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  depth?: number;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface ModalContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class ModalDialog extends Phaser.GameObjects.Container {
  private readonly cover: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly subtitleText: Phaser.GameObjects.Text;
  private readonly closeButton: ModalCloseButton;
  public readonly contentContainer: Phaser.GameObjects.Container;

  private isDialogOpen = false;
  private coverPointerId: number | null = null;
  private onOpenCallback?: () => void;
  private onCloseCallback?: () => void;
  private onLayoutCallback?: (bounds: ModalContentBounds) => void;

  private readonly minWidth: number;
  private readonly maxWidth: number;
  private readonly minHeight: number;
  private readonly maxHeight: number;
  private readonly closeOnBackdropClick: boolean;
  private readonly closeOnEscape: boolean;

  private contentBounds: ModalContentBounds = { x: 0, y: 0, width: 0, height: 0 };

  private readonly handleEscape = (event: KeyboardEvent): void => {
    if (this.closeOnEscape && event.key === "Escape" && this.isDialogOpen) {
      this.close();
    }
  };

  private readonly handleResize = (): void => {
    if (this.isDialogOpen) {
      this.layout();
    }
  };

  constructor(
    private readonly ownerScene: Phaser.Scene,
    config: ModalDialogConfig = {}
  ) {
    super(ownerScene, 0, 0);
    ownerScene.add.existing(this);

    const depth = config.depth ?? 12000;
    this.setDepth(depth).setScrollFactor(0).setVisible(false).setActive(false);

    if (ownerScene.cameras.cameras.length > 1) {
      ownerScene.cameras.main.ignore(this);
    }

    this.minWidth = config.minWidth ?? 280;
    this.maxWidth = config.maxWidth ?? 920;
    this.minHeight = config.minHeight ?? 200;
    this.maxHeight = config.maxHeight ?? 720;
    this.closeOnBackdropClick = config.closeOnBackdropClick ?? true;
    this.closeOnEscape = config.closeOnEscape ?? true;
    this.onOpenCallback = config.onOpen;
    this.onCloseCallback = config.onClose;

    const { width, height } = ownerScene.scale;

    this.cover = ownerScene.add
      .rectangle(0, 0, width, height, 0x020617, 0.78)
      .setOrigin(0, 0)
      .setInteractive();

    this.cover.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        this.coverPointerId = pointer.id;
      }
    );

    this.cover.on(
      Phaser.Input.Events.POINTER_MOVE,
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
      }
    );

    this.cover.on(
      Phaser.Input.Events.POINTER_UP,
      (
        pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        if (this.coverPointerId === pointer.id) {
          this.coverPointerId = null;
          if (this.closeOnBackdropClick) {
            this.close();
          }
        }
      }
    );

    this.cover.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _dx: number,
        _dy: number,
        _dz: number,
        event: WheelEvent
      ) => {
        event.stopPropagation();
      }
    );
    this.add(this.cover);

    this.panel = ownerScene.add
      .rectangle(0, 0, 1, 1, THEME.colors.modalBackground, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x334155, 1)
      .setInteractive();

    this.panel.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
      }
    );

    this.panel.on(
      Phaser.Input.Events.POINTER_UP,
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
      }
    );

    this.panel.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _dx: number,
        _dy: number,
        _dz: number,
        event: WheelEvent
      ) => {
        event.stopPropagation();
      }
    );
    this.add(this.panel);

    this.titleText = ownerScene.add
      .text(0, 0, config.title ?? "", {
        fontSize: "20px",
        color: THEME.colors.modalHeader,
        fontStyle: "bold"
      })
      .setOrigin(0, 0);
    this.add(this.titleText);

    this.subtitleText = ownerScene.add
      .text(0, 0, config.subtitle ?? "", {
        fontSize: "13px",
        color: THEME.colors.modalText
      })
      .setOrigin(0, 0);
    this.add(this.subtitleText);

    this.closeButton = new ModalCloseButton(ownerScene, 0, 0, {
      size: 34,
      onClick: () => this.close()
    });
    this.add(this.closeButton);

    this.contentContainer = ownerScene.add.container(0, 0);
    this.add(this.contentContainer);

    ownerScene.input.keyboard?.on("keydown", this.handleEscape);
    ownerScene.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
  }

  setCallbacks(onOpen?: () => void, onClose?: () => void): this {
    this.onOpenCallback = onOpen;
    this.onCloseCallback = onClose;
    return this;
  }

  setOnLayout(callback: (bounds: ModalContentBounds) => void): this {
    this.onLayoutCallback = callback;
    return this;
  }

  setTitle(title: string): this {
    this.titleText.setText(title);
    return this;
  }

  setSubtitle(subtitle: string): this {
    this.subtitleText.setText(subtitle);
    return this;
  }

  isOpen(): boolean {
    return this.isDialogOpen;
  }

  open(): void {
    this.isDialogOpen = true;
    this.layout();
    this.setVisible(true).setActive(true);
    this.emit("modal-open");
    this.onOpenCallback?.();
  }

  close(): void {
    if (!this.isDialogOpen) {
      return;
    }
    this.isDialogOpen = false;
    this.coverPointerId = null;
    this.setVisible(false).setActive(false);
    this.emit("modal-close");
    this.onCloseCallback?.();
  }

  getContentBounds(): ModalContentBounds {
    return this.contentBounds;
  }

  layout(): void {
    const screenWidth = this.ownerScene.scale.width;
    const screenHeight = this.ownerScene.scale.height;

    this.cover.setSize(screenWidth, screenHeight).setInteractive(
      new Phaser.Geom.Rectangle(0, 0, screenWidth, screenHeight),
      Phaser.Geom.Rectangle.Contains
    );

    const panelWidth = Math.min(
      this.maxWidth,
      Math.max(this.minWidth, screenWidth - 24)
    );
    const panelHeight = Math.min(
      this.maxHeight,
      Math.max(this.minHeight, screenHeight - 24)
    );
    const panelX = Math.round((screenWidth - panelWidth) / 2);
    const panelY = Math.round((screenHeight - panelHeight) / 2);

    this.panel
      .setPosition(panelX, panelY)
      .setSize(panelWidth, panelHeight)
      .setInteractive(
        new Phaser.Geom.Rectangle(0, 0, panelWidth, panelHeight),
        Phaser.Geom.Rectangle.Contains
      );

    const padding = 18;
    this.titleText.setPosition(panelX + padding, panelY + 14);

    const hasSubtitle = Boolean(this.subtitleText.text);
    this.subtitleText.setVisible(hasSubtitle);
    if (hasSubtitle) {
      this.subtitleText.setWordWrapWidth(Math.max(120, panelWidth - 90));
      this.subtitleText.setPosition(panelX + padding, panelY + 42);
    }

    this.closeButton.setPosition(
      panelX + panelWidth - 24,
      panelY + 24
    );

    const headerHeight = hasSubtitle ? 68 : 46;
    this.contentBounds = {
      x: panelX + padding,
      y: panelY + headerHeight,
      width: panelWidth - padding * 2,
      height: panelHeight - headerHeight - padding
    };

    this.contentContainer.setPosition(this.contentBounds.x, this.contentBounds.y);
    this.onLayoutCallback?.(this.contentBounds);
    this.bringToTop(this.closeButton);
  }

  override destroy(fromScene?: boolean): void {
    this.close();
    this.ownerScene.input.keyboard?.off("keydown", this.handleEscape);
    this.ownerScene.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    super.destroy(fromScene);
  }
}
