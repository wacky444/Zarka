import Phaser from "phaser";
import { ItemLibrary } from "@shared";
import { PlayerSelector, type PlayerOption } from "./PlayerSelector";
import { resolveItemTexture } from "./itemIcons";
import { THEME } from "./ColorPalette";
import { t } from "../services/i18n";

export type ZarkanDonationSelection = {
  targetPlayerId: string;
  amount: number;
};

export class ZarkanDonationModal extends Phaser.GameObjects.Container {
  private readonly cover: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly targetSelector: PlayerSelector;
  private readonly amountLabel: Phaser.GameObjects.Text;
  private readonly amountValue: Phaser.GameObjects.Text;
  private readonly balanceLabel: Phaser.GameObjects.Text;
  private readonly sliderTrack: Phaser.GameObjects.Rectangle;
  private readonly sliderFill: Phaser.GameObjects.Rectangle;
  private readonly sliderThumb: Phaser.GameObjects.Image;
  private readonly decreaseButton: Phaser.GameObjects.Container;
  private readonly increaseButton: Phaser.GameObjects.Container;
  private readonly sendButton: Phaser.GameObjects.Container;
  private readonly sendButtonBackground: Phaser.GameObjects.Rectangle;
  private readonly sendButtonLabel: Phaser.GameObjects.Text;
  private readonly cancelButton: Phaser.GameObjects.Container;
  private readonly errorLabel: Phaser.GameObjects.Text;
  private readonly sliderWidth = 176;
  private sliderLeft = 0;
  private sliderY = 0;
  private maxAmount = 0;
  private amount = 1;
  private selectedTargetPlayerId: string | null = null;
  private pending = false;
  private draggingSlider = false;
  private coverPointerId: number | null = null;
  private visibleModal = false;

  private readonly pointerMoveHandler = (pointer: Phaser.Input.Pointer) => {
    if (this.draggingSlider) {
      this.setAmountFromPointer(pointer.x);
    }
  };
  private readonly pointerUpHandler = () => {
    this.draggingSlider = false;
  };
  private readonly resizeHandler = () => this.layout();

  constructor(private readonly ownerScene: Phaser.Scene) {
    super(ownerScene, 0, 0);
    ownerScene.add.existing(this);
    this.setDepth(9000).setScrollFactor(0).setVisible(false).setActive(false);
    if (ownerScene.cameras.cameras.length > 1) {
      ownerScene.cameras.main.ignore(this);
    }

    const { width, height } = ownerScene.scale;
    this.cover = ownerScene.add
      .rectangle(0, 0, width, height, 0x020617, 0.76)
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
        this.coverPointerId = pointer.id;
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
          this.close();
        }
      }
    );
    this.add(this.cover);

    this.panel = ownerScene.add
      .rectangle(0, 0, 360, 350, 0x1b2440, 1)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x475569, 1)
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

    this.title = ownerScene.add
      .text(0, 0, t("Donate zarkans"), {
        fontSize: "22px",
        color: "#ffffff",
        fontStyle: "bold"
      })
      .setOrigin(0.5);
    this.add(this.title);

    this.targetSelector = new PlayerSelector(ownerScene, 0, 0, 300);
    this.targetSelector.setLabel(t("Recipient"));
    this.targetSelector.on("change", (playerId: string | null) => {
      this.selectedTargetPlayerId = playerId;
      this.updateSendButton();
    });
    this.targetSelector.on("modal-open", () => this.emit("modal-open"));
    this.targetSelector.on("modal-close", () => this.emit("modal-close"));
    this.add(this.targetSelector);

    this.amountLabel = ownerScene.add
      .text(0, 0, t("Amount"), {
        fontSize: "16px",
        color: "#ffffff",
        fontStyle: "bold"
      })
      .setOrigin(0, 0.5);
    this.add(this.amountLabel);
    this.amountValue = ownerScene.add
      .text(0, 0, "1", {
        fontSize: "18px",
        color: THEME.colors.zarkanGold,
        fontStyle: "bold"
      })
      .setOrigin(0.5);
    this.add(this.amountValue);
    this.balanceLabel = ownerScene.add
      .text(0, 0, "", {
        fontSize: "12px",
        color: THEME.colors.zarkanGold
      })
      .setOrigin(1, 0.5);
    this.add(this.balanceLabel);

    this.sliderTrack = ownerScene.add
      .rectangle(0, 0, this.sliderWidth, 8, 0x334155, 1)
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    this.sliderTrack.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        this.draggingSlider = true;
        this.setAmountFromPointer(pointer.x);
      }
    );
    this.add(this.sliderTrack);

    this.sliderFill = ownerScene.add
      .rectangle(0, 0, 1, 8, 0x3b82f6, 1)
      .setOrigin(0, 0.5);
    this.add(this.sliderFill);
    const zarkanTexture = resolveItemTexture(ItemLibrary.zarkans);
    this.sliderThumb = ownerScene.add
      .image(0, 0, zarkanTexture.texture, zarkanTexture.frame)
      .setDisplaySize(24, 24)
      .setInteractive({ useHandCursor: true });
    this.sliderThumb.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        this.draggingSlider = true;
      }
    );
    this.add(this.sliderThumb);

    this.decreaseButton = this.createButton("−", 40, 38, 38, 0x334155, () => {
      this.setAmount(this.amount - 1);
    });
    this.add(this.decreaseButton);
    this.increaseButton = this.createButton("+", 40, 38, 38, 0x334155, () => {
      this.setAmount(this.amount + 1);
    });
    this.add(this.increaseButton);
    this.errorLabel = ownerScene.add
      .text(0, 0, "", {
        fontSize: "13px",
        color: "#fca5a5",
        align: "center",
        wordWrap: { width: 300, useAdvancedWrap: true }
      })
      .setOrigin(0.5, 0.5)
      .setVisible(false);
    this.add(this.errorLabel);

    this.sendButton = ownerScene.add.container(0, 0);
    this.sendButtonBackground = ownerScene.add
      .rectangle(0, 0, 132, 42, 0x16a34a, 1)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0x4ade80, 1)
      .setInteractive({ useHandCursor: true });
    this.sendButtonLabel = ownerScene.add
      .text(0, 0, t("Send"), {
        fontSize: "15px",
        color: "#ffffff",
        fontStyle: "bold"
      })
      .setOrigin(0.5);
    let sendPointerId: number | null = null;
    this.sendButtonBackground.on(
      Phaser.Input.Events.POINTER_DOWN,
      (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        sendPointerId = pointer.id;
        event.stopPropagation();
      }
    );
    this.sendButtonBackground.on(
      Phaser.Input.Events.POINTER_OUT,
      () => {
        sendPointerId = null;
      }
    );
    this.sendButtonBackground.on(
      Phaser.Input.Events.POINTER_UP,
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        if (sendPointerId !== _pointer.id) {
          return;
        }
        sendPointerId = null;
        const targetPlayerId = this.selectedTargetPlayerId;
        if (!targetPlayerId || !this.canSend()) {
          return;
        }
        this.errorLabel.setVisible(false);
        this.emit("send", { targetPlayerId, amount: this.amount });
      }
    );
    this.sendButton.add([this.sendButtonBackground, this.sendButtonLabel]);
    this.add(this.sendButton);

    this.cancelButton = this.createButton(t("Cancel"), 132, 42, 15, 0x475569, () => {
      this.close();
    });
    this.add(this.cancelButton);

    ownerScene.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveHandler);
    ownerScene.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUpHandler);
    ownerScene.scale.on(Phaser.Scale.Events.RESIZE, this.resizeHandler);
    this.layout();
  }

  open(targets: PlayerOption[], maxAmount: number): void {
    this.targetSelector.setOptions(targets);
    this.targetSelector.setValue(null, false);
    this.selectedTargetPlayerId = null;
    this.maxAmount = Math.max(0, Math.floor(maxAmount));
    this.amount = this.maxAmount > 0 ? 1 : 0;
    this.pending = false;
    this.sendButtonLabel.setText(t("Send"));
    this.errorLabel.setVisible(false);
    this.visibleModal = true;
    this.layout();
    this.setVisible(true).setActive(true);
    this.updateAmountControls();
    this.updateSendButton();
    this.emit("modal-open");
  }

  setPending(pending: boolean, error?: string): void {
    this.pending = pending;
    if (error) {
      this.errorLabel.setText(error).setVisible(true);
    } else if (pending) {
      this.errorLabel.setText(t("Sending donation...")).setVisible(true);
    } else {
      this.errorLabel.setVisible(false);
    }
    this.sendButtonLabel.setText(pending ? t("Sending...") : t("Send"));
    this.updateSendButton();
  }

  close(): void {
    if (!this.visibleModal) {
      return;
    }
    this.targetSelector.hideDropdown();
    this.draggingSlider = false;
    this.visibleModal = false;
    this.setVisible(false).setActive(false);
    this.emit("modal-close");
  }

  override destroy(fromScene?: boolean): void {
    this.close();
    this.ownerScene.input.off(
      Phaser.Input.Events.POINTER_MOVE,
      this.pointerMoveHandler
    );
    this.ownerScene.input.off(
      Phaser.Input.Events.POINTER_UP,
      this.pointerUpHandler
    );
    this.ownerScene.scale.off(Phaser.Scale.Events.RESIZE, this.resizeHandler);
    this.targetSelector.destroy();
    super.destroy(fromScene);
  }

  layout(): void {
    const width = this.ownerScene.scale.width;
    const height = this.ownerScene.scale.height;
    this.cover.setSize(width, height).setDisplaySize(width, height);

    const panelWidth = Math.min(420, Math.max(280, width - 32));
    const panelHeight = Math.min(390, Math.max(330, height - 32));
    const centerX = width / 2;
    const centerY = height / 2;
    const left = centerX - panelWidth / 2;
    const top = centerY - panelHeight / 2;
    this.panel.setPosition(centerX, centerY);
    this.panel.setSize(panelWidth, panelHeight);
    this.panel.setDisplaySize(panelWidth, panelHeight);
    this.title.setPosition(centerX, top + 32);

    this.targetSelector.setPosition(left + 24, top + 62);
    this.targetSelector.setSelectorWidth(panelWidth - 48);
    const amountY = top + 62 + this.targetSelector.height + 12;
    this.amountLabel.setPosition(left + 24, amountY);
    this.amountValue.setPosition(centerX, amountY + 26);
    this.balanceLabel.setPosition(left + panelWidth - 24, amountY);

    this.sliderLeft = centerX - this.sliderWidth / 2;
    this.sliderY = amountY + 60;
    this.sliderTrack.setPosition(this.sliderLeft, this.sliderY);
    this.decreaseButton.setPosition(left + 42, this.sliderY);
    this.increaseButton.setPosition(left + panelWidth - 42, this.sliderY);

    this.errorLabel.setPosition(centerX, top + panelHeight - 82);
    this.errorLabel.setWordWrapWidth(panelWidth - 44, true);
    this.sendButton.setPosition(centerX - 74, top + panelHeight - 34);
    this.cancelButton.setPosition(centerX + 82, top + panelHeight - 34);
    this.updateAmountControls();
  }

  private createButton(
    label: string,
    width: number,
    height: number,
    fontSize: number,
    color: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const button = this.ownerScene.add.container(0, 0);
    const background = this.ownerScene.add
      .rectangle(0, 0, width, height, color, 1)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0x64748b, 1)
      .setInteractive({ useHandCursor: true });
    const text = this.ownerScene.add
      .text(0, 0, label, {
        fontSize: `${fontSize}px`,
        color: "#ffffff",
        fontStyle: "bold"
      })
      .setOrigin(0.5);
    let downPointerId: number | null = null;
    background.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        downPointerId = pointer.id;
        event.stopPropagation();
      }
    );
    background.on(Phaser.Input.Events.POINTER_OUT, () => {
      downPointerId = null;
    });
    background.on(
      Phaser.Input.Events.POINTER_UP,
      (
        pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData
      ) => {
        if (downPointerId !== pointer.id) {
          return;
        }
        downPointerId = null;
        event.stopPropagation();
        onClick();
      }
    );
    button.add([background, text]);
    button.setSize(width, height);
    return button;
  }

  private setAmountFromPointer(screenX: number): void {
    const ratio = Phaser.Math.Clamp(
      (screenX - this.sliderLeft) / this.sliderWidth,
      0,
      1
    );
    this.setAmount(1 + Math.round(ratio * Math.max(0, this.maxAmount - 1)));
  }

  private setAmount(amount: number): void {
    if (this.maxAmount <= 0) {
      return;
    }
    this.amount = Phaser.Math.Clamp(Math.floor(amount), 1, this.maxAmount);
    this.updateAmountControls();
    this.updateSendButton();
  }

  private updateAmountControls(): void {
    const available = this.maxAmount > 0;
    this.amountValue.setText(`${Math.max(0, this.amount)}`);
    this.balanceLabel.setText(`${t("Available")}: ${this.maxAmount}`);
    const ratio =
      this.maxAmount <= 1 ? 0 : (this.amount - 1) / (this.maxAmount - 1);
    const fillWidth = Math.max(1, this.sliderWidth * ratio);
    this.sliderFill
      .setPosition(this.sliderLeft, this.sliderY)
      .setSize(fillWidth, 8)
      .setDisplaySize(fillWidth, 8);
    this.sliderThumb.setPosition(this.sliderLeft + this.sliderWidth * ratio, this.sliderY);
    this.setControlEnabled(this.decreaseButton, available && this.amount > 1);
    this.setControlEnabled(
      this.increaseButton,
      available && this.amount < this.maxAmount
    );
    this.sliderTrack.setAlpha(available ? 1 : 0.45);
    this.sliderThumb.setAlpha(available ? 1 : 0.45);
  }

  private setControlEnabled(
    control: Phaser.GameObjects.Container,
    enabled: boolean
  ): void {
    const background = control.list[0] as Phaser.GameObjects.Rectangle | undefined;
    background?.setAlpha(enabled ? 1 : 0.45);
    if (enabled) {
      background?.setInteractive({ useHandCursor: true });
    } else {
      background?.disableInteractive();
    }
  }

  private canSend(): boolean {
    return Boolean(
      !this.pending &&
        this.selectedTargetPlayerId &&
        Number.isSafeInteger(this.amount) &&
        this.amount > 0 &&
        this.amount <= this.maxAmount
    );
  }

  private updateSendButton(): void {
    const enabled = this.canSend();
    this.sendButtonBackground.setAlpha(enabled ? 1 : 0.45);
    if (enabled) {
      this.sendButtonBackground.setInteractive({ useHandCursor: true });
    } else {
      this.sendButtonBackground.disableInteractive();
    }
  }
}
