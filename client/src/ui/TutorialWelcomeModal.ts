import Phaser from "phaser";
import { t } from "../services/i18n";
import { THEME } from "./ColorPalette";
import { ModalDialog, type ModalContentBounds } from "./ModalDialog";

type PositionableText = Phaser.GameObjects.GameObject & {
  setPosition(x: number, y: number): void;
  height: number;
  setWrapWidth?(w: number): void;
  setWordWrapWidth?(w: number): void;
};

export class TutorialWelcomeModal {
  private readonly dialog: ModalDialog;
  private iconImage: Phaser.GameObjects.Image | null = null;
  private bodyText: PositionableText | null = null;
  private startButton: Phaser.GameObjects.Container | null = null;
  private onOpenCallback?: () => void;
  private onCloseCallback?: () => void;

  constructor(private readonly scene: Phaser.Scene) {
    this.dialog = new ModalDialog(scene, {
      title: t("Bienvenido a Zarka"),
      minWidth: 320,
      maxWidth: 580,
      minHeight: 460,
      maxHeight: 660,
      depth: 12000
    });

    this.dialog.setCallbacks(
      () => this.onOpenCallback?.(),
      () => this.onCloseCallback?.()
    );
    this.dialog.setOnLayout((bounds) => this.layoutContent(bounds));
  }

  setCallbacks(onOpen?: () => void, onClose?: () => void): this {
    this.onOpenCallback = onOpen;
    this.onCloseCallback = onClose;
    return this;
  }

  isOpen(): boolean {
    return this.dialog.isOpen();
  }

  open(): void {
    this.build();
    this.dialog.open();
  }

  close(): void {
    this.dialog.close();
  }

  destroy(): void {
    this.dialog.destroy(true);
  }

  private build(): void {
    this.dialog.contentContainer.removeAll(true);
    this.dialog.setTitle(t("Bienvenido a Zarka"));

    const textureKey = this.scene.textures.exists("zarka-welcome")
      ? "zarka-welcome"
      : this.scene.textures.exists("zarka-main-title")
      ? "zarka-main-title"
      : null;

    if (textureKey) {
      this.iconImage = this.scene.add.image(0, 0, textureKey);
      this.dialog.contentContainer.add(this.iconImage);
    } else {
      this.iconImage = null;
    }

    const p1 = t(
      "Has llegado voluntariamente a un pueblo abandonado con un único objetivo: sobrevivir. En este juego de rol y estrategia por turnos, varios equipos se enfrentan a muerte, pero hay un problema: [b]aún no sabes quiénes son tus aliados.[/b]"
    );
    const p2 = t(
      "Empiezas a solas, equipado únicamente con una mochila y una ración de comida. Cada día deberás elegir tus acciones, explorar el mapa, reunirte con tu equipo y eliminar a tus rivales."
    );
    const p3Text = t("Solo puede quedar un equipo en pie.");
    const p3 = `[color=#f87171][b]${p3Text}[/b][/color]`;

    const fullText = `${p1}\n\n${p2}\n\n${p3}`;

    const bbcode = this.scene.rexUI?.add?.BBCodeText?.(0, 0, fullText, {
      fontSize: "15px",
      color: "#e2e8f0",
      fontFamily: "Arial, sans-serif",
      lineSpacing: 4,
      wrap: { mode: "word", width: 440 }
    });

    if (bbcode) {
      this.bodyText = bbcode as unknown as PositionableText;
    } else {
      const stripped = fullText.replace(/\[\/?(b|color[^\]]*)\]/g, "");
      this.bodyText = this.scene.add.text(0, 0, stripped, {
        fontSize: "15px",
        color: "#e2e8f0",
        fontFamily: "Arial, sans-serif",
        lineSpacing: 4,
        wordWrap: { width: 440, useAdvancedWrap: true }
      });
    }
    this.dialog.contentContainer.add(this.bodyText);

    const btnWidth = 160;
    const btnHeight = 40;
    const btnBg = this.scene.add
      .rectangle(0, 0, btnWidth, btnHeight, THEME.colors.buttonConfirmFill, 1)
      .setStrokeStyle(2, THEME.colors.buttonConfirmBorder, 1)
      .setInteractive({ useHandCursor: true });

    const btnLabel = this.scene.add
      .text(0, 0, t("Comenzar"), {
        fontSize: "16px",
        fontStyle: "bold",
        color: "#ffffff",
        align: "center"
      })
      .setOrigin(0.5, 0.5);

    btnBg.on(Phaser.Input.Events.POINTER_OVER, () => {
      btnBg.setFillStyle(THEME.colors.buttonConfirmHover);
    });
    btnBg.on(Phaser.Input.Events.POINTER_OUT, () => {
      btnBg.setFillStyle(THEME.colors.buttonConfirmFill);
    });
    btnBg.on(Phaser.Input.Events.POINTER_UP, () => {
      this.close();
    });

    this.startButton = this.scene.add.container(0, 0, [btnBg, btnLabel]);
    this.dialog.contentContainer.add(this.startButton);
  }

  private layoutContent(bounds: ModalContentBounds): void {
    if (!this.dialog.isOpen()) {
      return;
    }
    const centerX = Math.round(bounds.width / 2);
    const wrapWidth = Math.max(200, bounds.width - 24);

    let cursorY = 4;

    if (this.iconImage) {
      const imgSize = bounds.height < 460 ? 56 : 76;
      this.iconImage.setDisplaySize(imgSize, imgSize);
      this.iconImage.setPosition(centerX, cursorY + imgSize / 2);
      cursorY += imgSize + 12;
    }

    if (this.bodyText) {
      if (typeof this.bodyText.setWrapWidth === "function") {
        this.bodyText.setWrapWidth(wrapWidth);
      } else if (typeof this.bodyText.setWordWrapWidth === "function") {
        this.bodyText.setWordWrapWidth(wrapWidth);
      }
      this.bodyText.setPosition(12, cursorY);
      cursorY += this.bodyText.height + 16;
    }

    if (this.startButton) {
      const btnY = Math.max(cursorY + 20, bounds.height - 24);
      this.startButton.setPosition(centerX, btnY);
    }
  }
}
