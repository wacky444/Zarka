import type { ItemDefinition } from "@shared";
import { deriveBoardIconKey, buildBoardIconUrl } from "./actionIcons";
import { assetPath } from "../utils/assetPath";

const ITEM_TEXTURE_PREFIX = "item_icon_";
const ASSETS_ROOT = "assets/images";

export interface ItemSpriteInfo {
  key: string;
  url: string;
  type: "board" | "image";
  frame?: string;
}

export function deriveItemSpriteInfo(
  spritePath: string
): ItemSpriteInfo | null {
  const normalized = spritePath.replace(/\\/g, "/");
  const segments = normalized
    .split("/")
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return null;
  }
  const folder = segments[0];
  const fileName = segments[segments.length - 1];
  if (folder === "Board Game Icons") {
    const key = deriveBoardIconKey(fileName);
    return {
      key,
      url: buildBoardIconUrl(fileName),
      type: "board",
      frame: fileName,
    };
  }
  const keySegments = segments.map((segment) =>
    segment
      .toLowerCase()
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
  );
  const key = `${ITEM_TEXTURE_PREFIX}${keySegments.join("_")}`;
  const encodedPath = segments
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return {
    key,
    url: assetPath(`${ASSETS_ROOT}/${encodedPath}`),
    type: "image",
  };
}

export function resolveItemTexture(definition: ItemDefinition): {
  texture: string;
  frame?: string;
} {
  if (!definition.sprite) {
    return { texture: "hex", frame: "grass_01.png" };
  }
  const info = deriveItemSpriteInfo(definition.sprite);
  if (!info) {
    return { texture: "hex", frame: "grass_01.png" };
  }
  return { texture: info.key };
}

export function collectItemSpriteInfos(definitions: ItemDefinition[]) {
  const map = new Map<string, ItemSpriteInfo>();
  for (const definition of definitions) {
    if (!definition.sprite) {
      continue;
    }
    const info = deriveItemSpriteInfo(definition.sprite);
    if (info && !map.has(info.key)) {
      map.set(info.key, info);
    }
  }
  return Array.from(map.values());
}
