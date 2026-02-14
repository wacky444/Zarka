import Phaser from "phaser";
import type { Skin, SkinCategory } from "@shared";
import { DEFAULT_SKIN } from "@shared";

/** Layer order from back to front for compositing skin sprites. */
export const SKIN_LAYER_ORDER: readonly SkinCategory[] = [
  "body",
  "shoes",
  "shirt",
  "hair",
  "hat",
];

export type SkinLayers = Partial<
  Record<SkinCategory, Phaser.GameObjects.Image>
>;

/**
 * A Container that holds layered skin sprites and proxies tint
 * operations to every child Image so that animation code can call
 * setTint / clearTint / read isTinted transparently.
 */
export class SkinContainer extends Phaser.GameObjects.Container {
  private _isTinted = false;
  private _tintTL = 0xffffff;
  private _tintTR = 0xffffff;
  private _tintBL = 0xffffff;
  private _tintBR = 0xffffff;

  get isTinted() {
    return this._isTinted;
  }
  get tintTopLeft() {
    return this._tintTL;
  }
  get tintTopRight() {
    return this._tintTR;
  }
  get tintBottomLeft() {
    return this._tintBL;
  }
  get tintBottomRight() {
    return this._tintBR;
  }

  setTint(
    topLeft?: number,
    topRight?: number,
    bottomLeft?: number,
    bottomRight?: number,
  ): this {
    for (const child of this.list) {
      if (child instanceof Phaser.GameObjects.Image) {
        (child as Phaser.GameObjects.Image).setTint(
          topLeft,
          topRight,
          bottomLeft,
          bottomRight,
        );
      }
    }
    this._isTinted = true;
    this._tintTL = topLeft ?? 0xffffff;
    this._tintTR = topRight ?? topLeft ?? 0xffffff;
    this._tintBL = bottomLeft ?? topLeft ?? 0xffffff;
    this._tintBR = bottomRight ?? topLeft ?? 0xffffff;
    return this;
  }

  clearTint(): this {
    for (const child of this.list) {
      if (child instanceof Phaser.GameObjects.Image) {
        (child as Phaser.GameObjects.Image).clearTint();
      }
    }
    this._isTinted = false;
    this._tintTL = 0xffffff;
    this._tintTR = 0xffffff;
    this._tintBL = 0xffffff;
    this._tintBR = 0xffffff;
    return this;
  }

  updateSkin(skin: Skin, textures: Phaser.Textures.TextureManager): void {
    for (const child of this.list) {
      if (!(child instanceof Phaser.GameObjects.Image)) continue;
      const cat = child.getData("skinCategory") as SkinCategory | undefined;
      if (!cat) continue;
      const frame = skin[cat];
      if (
        frame &&
        textures.exists("char") &&
        textures.get("char").has(frame)
      ) {
        child.setFrame(frame);
        child.setVisible(true);
      } else {
        child.setVisible(false);
      }
    }
  }
}

const SPRITE_SIZE = 16;

export function createSkinContainer(
  scene: Phaser.Scene,
  x: number,
  y: number,
  skin: Skin,
  scale: number,
): SkinContainer {
  const container = new SkinContainer(scene, x, y);
  scene.add.existing(container);
  container.setSize(SPRITE_SIZE, SPRITE_SIZE);
  container.setScale(scale);

  for (const cat of SKIN_LAYER_ORDER) {
    const frame = skin[cat];
    if (!frame) continue;
    const img = scene.make.image(
      { x: 0, y: 0, key: "char", frame, add: false },
      false,
    );
    img.setData("skinCategory", cat);
    container.add(img);
  }

  return container;
}

/**
 * Create a set of layered Phaser images that together form a composite
 * character preview.  All layers share the same position.
 */
export function createSkinLayers(
  scene: Phaser.Scene,
  x: number,
  y: number,
  skin: Skin,
  scale: number,
): SkinLayers {
  const layers: SkinLayers = {};
  for (const cat of SKIN_LAYER_ORDER) {
    const frame = skin[cat];
    if (!frame) continue;
    const sprite = scene.add.image(x, y, "char", frame);
    sprite.setScale(scale);
    layers[cat] = sprite;
  }
  return layers;
}

/**
 * Update an existing set of skin layers to reflect a new Skin selection.
 * Hides layers whose frame is empty or missing from the texture.
 */
export function updateSkinLayers(
  layers: SkinLayers,
  skin: Skin,
  textures: Phaser.Textures.TextureManager,
): void {
  for (const cat of SKIN_LAYER_ORDER) {
    const sprite = layers[cat];
    if (!sprite) continue;
    const frame = skin[cat];
    if (frame && textures.exists("char") && textures.get("char").has(frame)) {
      sprite.setFrame(frame);
      sprite.setVisible(true);
    } else {
      sprite.setVisible(false);
    }
  }
}

/**
 * Return the body frame from a Skin for use when only a single sprite
 * is needed (e.g. game-map tokens, portrait thumbnails).
 */
export function resolveSkinBodyFrame(skin: Skin | undefined | null): string {
  const body = skin?.body;
  return body && body.length > 0 ? body : DEFAULT_SKIN.body;
}
