export const MOBILE_LAYOUT_BREAKPOINT = 760;

export const isMobile = (width?: number): boolean => {
  if (typeof width === "number" && width <= MOBILE_LAYOUT_BREAKPOINT) {
    return true;
  }
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};
