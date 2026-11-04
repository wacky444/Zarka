import Phaser from "phaser";
import { t } from "../services/i18n";
import { THEME } from "./ColorPalette";
import {
  ModalDialog,
  type ModalContentBounds,
  type ModalDialogConfig
} from "./ModalDialog";

export interface ConfirmDialogConfig extends ModalDialogConfig {
  defaultConfirmLabel?: string;
  defaultCancelLabel?: string;
}

export interface ConfirmOptions {
  title?: string;
  subtitle?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export class ConfirmDialog {
  private readonly dialog: ModalDialog;
  private readonly messageText: Phaser.GameObjects.Text;
  private readonly cancelButton: Phaser.GameObjects.Container;
  private readonly cancelButtonBg: Phaser.GameObjects.Rectangle;
  private readonly cancelButtonLabel: Phaser.GameObjects.Text;
  private readonly confirmButton: Phaser.GameObjects.Container;
  private readonly confirmButtonBg: Phaser.GameObjects.Rectangle;
  private readonly confirmButtonLabel: Phaser.GameObjects.Text;

  private pendingResolve: ((value: boolean) => void) | null = null;
  private currentOptions: ConfirmOptions | null = null;
  private wasConfirmed = false;
  private onOpenCallback?: () => void;
  private onCloseCallback?: () => void;

  private readonly handleSceneShutdown = (): void => {
    this.destroy();
  };

  constructor(
    private readonly scene: Phaser.Scene,
    config: ConfirmDialogConfig = {}
  ) {
    this.dialog = new ModalDialog(scene, {
      minWidth: config.minWidth ?? 320,
      maxWidth: config.maxWidth ?? 480,
      minHeight: config.minHeight ?? 180,
      maxHeight: config.maxHeight ?? 260,
      depth: config.depth ?? 12000,
      closeOnBackdropClick: config.closeOnBackdropClick ?? true,
      closeOnEscape: config.closeOnEscape ?? true,
      onOpen: () => {
        this.onOpenCallback?.();
        config.onOpen?.();
      },
      onClose: () => {
        this.handleClose();
        config.onClose?.();
      }
    });

    this.messageText = scene.add
      .text(0, 0, "", {
        fontSize: "15px",
        color: "#e2e8f0",
        fontFamily: "Arial, sans-serif",
        lineSpacing: 4,
        align: "center"
      })
      .setOrigin(0.5, 0);
    this.dialog.contentContainer.add(this.messageText);

    this.cancelButton = scene.add.container(0, 0);
    this.cancelButtonBg = scene.add
      .rectangle(0, 0, 110, 38, THEME.colors.buttonRevertFill, 1)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0x64748b, 1)
      .setInteractive({ useHandCursor: true });
    this.cancelButtonLabel = scene.add
      .text(0, 0, config.defaultCancelLabel ?? t("Cancel"), {
        fontSize: "15px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold"
      })
      .setOrigin(0.5);

    let cancelPointerId: number | null = null;
    this.cancelButtonBg.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.cancelButtonBg.setFillStyle(0x64748b);
    });
    this.cancelButtonBg.on(Phaser.Input.Events.POINTER_OUT, () => {
      cancelPointerId = null;
      this.cancelButtonBg.setFillStyle(THEME.colors.buttonRevertFill);
    });
    this.cancelButtonBg.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        cancelPointerId = pointer.id;
        event.stopPropagation();
      }
    );
    this.cancelButtonBg.on(
      Phaser.Input.Events.POINTER_UP,
      (
        pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        if (cancelPointerId !== pointer.id) {
          return;
        }
        cancelPointerId = null;
        this.wasConfirmed = false;
        this.dialog.close();
      }
    );
    this.cancelButton.add([this.cancelButtonBg, this.cancelButtonLabel]);
    this.dialog.contentContainer.add(this.cancelButton);

    this.confirmButton = scene.add.container(0, 0);
    this.confirmButtonBg = scene.add
      .rectangle(0, 0, 110, 38, THEME.colors.buttonConfirmFill, 1)
      .setOrigin(0.5)
      .setStrokeStyle(1, THEME.colors.buttonConfirmBorder, 1)
      .setInteractive({ useHandCursor: true });
    this.confirmButtonLabel = scene.add
      .text(0, 0, config.defaultConfirmLabel ?? t("Confirm"), {
        fontSize: "15px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold"
      })
      .setOrigin(0.5);

    let confirmPointerId: number | null = null;
    this.confirmButtonBg.on(Phaser.Input.Events.POINTER_OVER, () => {
      const isDanger = this.currentOptions?.isDanger;
      this.confirmButtonBg.setFillStyle(
        isDanger ? THEME.colors.buttonDangerHover : THEME.colors.buttonConfirmHover
      );
    });
    this.confirmButtonBg.on(Phaser.Input.Events.POINTER_OUT, () => {
      confirmPointerId = null;
      this.updateConfirmButtonColors();
    });
    this.confirmButtonBg.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        confirmPointerId = pointer.id;
        event.stopPropagation();
      }
    );
    this.confirmButtonBg.on(
      Phaser.Input.Events.POINTER_UP,
      (
        pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        if (confirmPointerId !== pointer.id) {
          return;
        }
        confirmPointerId = null;
        this.wasConfirmed = true;
        this.dialog.close();
      }
    );
    this.confirmButton.add([this.confirmButtonBg, this.confirmButtonLabel]);
    this.dialog.contentContainer.add(this.confirmButton);

    this.dialog.setOnLayout((bounds) => this.layoutContent(bounds));
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);
  }

  setCallbacks(onOpen?: () => void, onClose?: () => void): this {
    this.onOpenCallback = onOpen;
    this.onCloseCallback = onClose;
    return this;
  }

  isOpen(): boolean {
    return this.dialog.isOpen();
  }

  on(
    event: string | symbol,
    fn: (...args: unknown[]) => void,
    context?: unknown
  ): this {
    this.dialog.on(event, fn, context);
    return this;
  }

  off(
    event: string | symbol,
    fn?: (...args: unknown[]) => void,
    context?: unknown,
    once?: boolean
  ): this {
    this.dialog.off(event, fn, context, once);
    return this;
  }

  confirm(options: string | ConfirmOptions): Promise<boolean> {
    const opts: ConfirmOptions =
      typeof options === "string" ? { message: options } : options;

    if (this.pendingResolve) {
      const prevResolve = this.pendingResolve;
      const prevOptions = this.currentOptions;
      this.pendingResolve = null;
      this.currentOptions = null;
      this.wasConfirmed = false;
      prevOptions?.onCancel?.();
      prevResolve(false);
    }

    this.currentOptions = opts;
    this.wasConfirmed = false;

    this.dialog.setTitle(opts.title !== undefined ? opts.title : t("Confirm"));
    this.dialog.setSubtitle(opts.subtitle ?? "");

    this.messageText.setText(opts.message);
    this.confirmButtonLabel.setText(opts.confirmLabel ?? t("Confirm"));
    this.cancelButtonLabel.setText(opts.cancelLabel ?? t("Cancel"));
    this.updateConfirmButtonColors();

    return new Promise<boolean>((resolve) => {
      this.pendingResolve = resolve;
      this.dialog.open();
      this.layoutContent(this.dialog.getContentBounds());
    });
  }

  close(): void {
    this.dialog.close();
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);
    if (this.pendingResolve) {
      const resolve = this.pendingResolve;
      const options = this.currentOptions;
      this.pendingResolve = null;
      this.currentOptions = null;
      this.wasConfirmed = false;
      options?.onCancel?.();
      resolve(false);
    }
    this.dialog.destroy();
  }

  private handleClose(): void {
    const resolve = this.pendingResolve;
    const options = this.currentOptions;
    const confirmed = this.wasConfirmed;

    this.pendingResolve = null;
    this.currentOptions = null;
    this.wasConfirmed = false;

    if (resolve) {
      if (confirmed) {
        options?.onConfirm?.();
        resolve(true);
      } else {
        options?.onCancel?.();
        resolve(false);
      }
    }

    this.onCloseCallback?.();
  }

  private updateConfirmButtonColors(): void {
    const isDanger = Boolean(this.currentOptions?.isDanger);
    if (isDanger) {
      this.confirmButtonBg.setFillStyle(THEME.colors.buttonDangerFill);
      this.confirmButtonBg.setStrokeStyle(1, 0xf87171);
    } else {
      this.confirmButtonBg.setFillStyle(THEME.colors.buttonConfirmFill);
      this.confirmButtonBg.setStrokeStyle(1, THEME.colors.buttonConfirmBorder);
    }
  }

  private layoutContent(bounds: ModalContentBounds): void {
    if (!this.dialog.isOpen()) {
      return;
    }
    const centerX = Math.round(bounds.width / 2);
    const wrapWidth = Math.max(160, bounds.width - 24);

    this.messageText.setWordWrapWidth(wrapWidth, true);

    const btnHeight = 38;
    const btnGap = 12;
    const btnWidth = Math.min(
      125,
      Math.max(80, Math.floor((bounds.width - 20 - btnGap) / 2))
    );

    this.cancelButtonBg.setSize(btnWidth, btnHeight);
    this.confirmButtonBg.setSize(btnWidth, btnHeight);

    const totalBtnWidth = btnWidth * 2 + btnGap;
    const btnStartX = Math.round((bounds.width - totalBtnWidth) / 2);
    const btnY = bounds.height - Math.round(btnHeight / 2) - 4;

    const cancelX = btnStartX + Math.round(btnWidth / 2);
    const confirmX = btnStartX + btnWidth + btnGap + Math.round(btnWidth / 2);

    this.cancelButton.setPosition(cancelX, btnY);
    this.confirmButton.setPosition(confirmX, btnY);

    const availableHeightForText = Math.max(0, btnY - Math.round(btnHeight / 2) - 8);
    const textY = Math.max(
      4,
      Math.round((availableHeightForText - this.messageText.height) / 2)
    );
    this.messageText.setPosition(centerX, textY);
  }

  static confirm(
    scene: Phaser.Scene,
    options: string | ConfirmOptions
  ): Promise<boolean> {
    const dialog = new ConfirmDialog(scene);
    return dialog.confirm(options).finally(() => {
      dialog.destroy();
    });
  }

  static show(
    scene: Phaser.Scene,
    options: string | ConfirmOptions
  ): Promise<boolean> {
    return ConfirmDialog.confirm(scene, options);
  }
}
