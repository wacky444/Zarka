import type { Axial } from "@shared";
import { axialDistance, offsetToCube } from "@shared";

export { axialDistance, offsetToCube };

export function parseAxial(
  value: unknown,
  options: { coerceNumericCoordinates?: boolean } = {}
): Axial | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as { q?: unknown; r?: unknown };
  const { coerceNumericCoordinates = false } = options;
  const q =
    typeof candidate.q === "number"
      ? candidate.q
      : coerceNumericCoordinates
        ? Number(candidate.q)
        : Number.NaN;
  const r =
    typeof candidate.r === "number"
      ? candidate.r
      : coerceNumericCoordinates
        ? Number(candidate.r)
        : Number.NaN;
  if (!isFinite(q) || !isFinite(r)) {
    return null;
  }
  return { q, r };
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
