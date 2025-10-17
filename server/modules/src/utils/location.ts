import type { Axial } from "@shared";

export function axialDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -dq - dr;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}

export function canSeeCoord(
  coord: Axial | undefined,
  viewer: Axial | null,
  viewDistance: number
): boolean {
  if (!coord || !viewer) {
    return false;
  }
  return axialDistance(coord, viewer) <= viewDistance;
}
