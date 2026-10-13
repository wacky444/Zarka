export function isPointerTap(pointer: { getDistance: () => number }): boolean {
  return pointer.getDistance() < 10;
}
