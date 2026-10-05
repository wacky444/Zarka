import Phaser from "phaser";
import { DEFAULT_SKIN, type Skin } from "@shared";
import { createSkinContainer } from "../PlayerSkinRenderer";

export interface PlayerOptionSkinInfo {
  texture: string;
  frame?: string;
  iconScale: number;
}

export class PlayerOptionSkinCache {
  private readonly icons = new Map<
    string,
    { textureKey: string; signature: string }
  >();

  constructor(private readonly scene: Phaser.Scene) {}

  resolve(
    playerId: string,
    accountSkin: Skin | null,
    currentUserId: string | null,
    currentPlayerSkin: Skin | null,
    scale: number
  ): PlayerOptionSkinInfo {
    const skin =
      accountSkin ??
      (currentUserId && playerId === currentUserId
        ? (currentPlayerSkin ?? DEFAULT_SKIN)
        : DEFAULT_SKIN);
    const signature = this.skinSignature(skin);
    const existing = this.icons.get(playerId);
    if (
      existing?.signature === signature &&
      this.scene.textures.exists(existing.textureKey)
    ) {
      return { texture: existing.textureKey, iconScale: scale };
    }
    if (existing) {
      if (this.scene.textures.exists(existing.textureKey)) {
        this.scene.textures.remove(existing.textureKey);
      }
      this.icons.delete(playerId);
    }

    const textureKey = `player-option-skin-${playerId}`;
    if (this.createTexture(textureKey, skin)) {
      this.icons.set(playerId, { textureKey, signature });
      return { texture: textureKey, iconScale: scale };
    }
    return { texture: "char", frame: DEFAULT_SKIN.body, iconScale: scale };
  }

  retain(activeIds: ReadonlySet<string>): void {
    for (const [playerId, cached] of this.icons) {
      if (activeIds.has(playerId)) {
        continue;
      }
      if (this.scene.textures.exists(cached.textureKey)) {
        this.scene.textures.remove(cached.textureKey);
      }
      this.icons.delete(playerId);
    }
  }

  dispose(): void {
    this.retain(new Set());
  }

  private createTexture(textureKey: string, skin: Skin): boolean {
    if (this.scene.textures.exists(textureKey)) {
      this.scene.textures.remove(textureKey);
    }
    const sprite = createSkinContainer(this.scene, 0, 0, skin, 1);
    const renderTexture = this.scene.make.renderTexture(
      { width: 16, height: 16 },
      false
    );
    if (!renderTexture) {
      sprite.destroy(true);
      return false;
    }
    renderTexture.draw(sprite, 8, 8);
    renderTexture.saveTexture(textureKey);
    renderTexture.destroy();
    sprite.destroy(true);
    return this.scene.textures.exists(textureKey);
  }

  private skinSignature(skin: Skin): string {
    return [skin.body, skin.shoes, skin.shirt, skin.hair, skin.hat].join("|");
  }
}
