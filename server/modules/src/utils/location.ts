import type { Axial } from "@shared";
import { axialDistance, offsetToCube } from "@shared";

export { axialDistance, offsetToCube };

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
