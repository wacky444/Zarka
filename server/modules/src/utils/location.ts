import type { Axial } from "@shared";

function offsetToCube(coord: Axial): { x: number; y: number; z: number } {
  const x = coord.q - (coord.r - (coord.r & 1)) / 2;
  const z = coord.r;
  const y = -x - z;
  return { x, y, z };
}

export function axialDistance(a: Axial, b: Axial): number {
  const aCube = offsetToCube(a);
  const bCube = offsetToCube(b);
  const dx = Math.abs(aCube.x - bCube.x);
  const dy = Math.abs(aCube.y - bCube.y);
  const dz = Math.abs(aCube.z - bCube.z);
  return Math.max(dx, dy, dz);
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
