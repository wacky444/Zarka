const BOARD_ICON_FOLDER = "Board Game Icons";
const BOARD_ICON_PREFIX = "board_icon_";
const BOARD_ICON_FOLDER_URL = encodeURIComponent(BOARD_ICON_FOLDER);

export function deriveBoardIconKey(frame: string) {
  const base = frame.replace(/\.[^.]+$/, "");
  return `${BOARD_ICON_PREFIX}${base}`;
}

export function buildBoardIconUrl(frame: string) {
  return `/assets/images/${BOARD_ICON_FOLDER_URL}/${frame}`;
}

export function isBoardIconTexture(texture: string) {
  return texture === BOARD_ICON_FOLDER;
}
