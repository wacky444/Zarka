import Phaser from "phaser";
import { getLocale, setLocale, type Locale } from "../services/i18n";
import { assetPath } from "../utils/assetPath";

export function preloadLanguageFlags(scene: Phaser.Scene): void {
  if (!scene.textures.exists("login-flag-en")) {
    scene.load.image("login-flag-en", assetPath("assets/images/flags/GB.png"));
  }
  if (!scene.textures.exists("login-flag-es")) {
    scene.load.image("login-flag-es", assetPath("assets/images/flags/ES.png"));
  }
}

export class LanguageSelector extends Phaser.GameObjects.Container {
  private readonly languageFrames: Record<Locale, Phaser.GameObjects.Rectangle>;
  private readonly languageFlags: Record<Locale, Phaser.GameObjects.Image>;
  private readonly onLanguageChanged?: (locale: Locale) => void;

  constructor(
    scene: Phaser.Scene,
    x = 0,
    y = 0,
    onLanguageChanged?: (locale: Locale) => void
  ) {
    super(scene, x, y);
    this.onLanguageChanged = onLanguageChanged;

    this.languageFrames = {
      en: scene.add.rectangle(-34, 0, 60, 60),
      es: scene.add.rectangle(34, 0, 60, 60)
    };
    this.languageFlags = {
      en: scene.add.image(-34, 0, "login-flag-en").setDisplaySize(48, 48),
      es: scene.add.image(34, 0, "login-flag-es").setDisplaySize(48, 48)
    };

    const flags: Array<{ locale: Locale }> = [
      { locale: "en" },
      { locale: "es" }
    ];

    for (const { locale } of flags) {
      const frame = this.languageFrames[locale];
      const flag = this.languageFlags[locale];

      frame.setInteractive({ useHandCursor: true });
      flag.setInteractive({ useHandCursor: true });

      const onSelect = () => {
        this.selectLocale(locale);
      };

      const onHover = () => {
        if (getLocale() !== locale) {
          frame.setStrokeStyle(2, 0xffffff, 0.9);
          flag.setAlpha(0.9);
        }
      };

      const onOut = () => {
        if (getLocale() !== locale) {
          frame.setStrokeStyle(1, 0x666666, 0.8);
          flag.setAlpha(0.65);
        }
      };

      frame.on("pointerdown", onSelect);
      flag.on("pointerdown", onSelect);
      frame.on("pointerover", onHover);
      flag.on("pointerover", onHover);
      frame.on("pointerout", onOut);
      flag.on("pointerout", onOut);

      this.add([frame, flag]);
    }

    this.updateSelection();
    scene.add.existing(this);
  }

  public selectLocale(locale: Locale): void {
    if (getLocale() === locale) {
      return;
    }
    setLocale(locale);
    this.updateSelection();
    this.onLanguageChanged?.(locale);
  }

  public updateSelection(): void {
    const currentLocale = getLocale();
    for (const locale of ["en", "es"] as const) {
      const selected = currentLocale === locale;
      this.languageFrames[locale]
        .setFillStyle(selected ? 0xffcc00 : 0x000000, selected ? 0.2 : 0.25)
        .setStrokeStyle(
          selected ? 3 : 1,
          selected ? 0xffcc00 : 0x666666,
          selected ? 1 : 0.8
        );
      this.languageFlags[locale].setAlpha(selected ? 1 : 0.65);
    }
  }
}

export function createLanguageSelector(
  scene: Phaser.Scene,
  x = 0,
  y = 0,
  onLanguageChanged?: (locale: Locale) => void
): LanguageSelector {
  return new LanguageSelector(scene, x, y, onLanguageChanged);
}
