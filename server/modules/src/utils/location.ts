import type { Axial, HexTileSnapshot } from "@shared";
import { axialDistance, neighbors, offsetToCube } from "@shared";

export { axialDistance, offsetToCube };

export function adjacentDestinationToward(
  tiles: readonly HexTileSnapshot[] | undefined,
  origin: Axial,
  requestedDestination: Axial,
): { tileId: string; coord: Axial } | undefined {
  if (origin.q === requestedDestination.q && origin.r === requestedDestination.r) {
    return undefined;
  }

  let closest:
    | { tileId: string; coord: Axial; distance: number }
    | undefined;
  for (const coord of neighbors(origin)) {
    const tile = tiles?.find(
      (candidate) =>
        candidate.coord.q === coord.q && candidate.coord.r === coord.r,
    );
    if (!tile || tile.walkable === false || tile.meta?.destroyed === true) {
      continue;
    }
    const distance = axialDistance(coord, requestedDestination);
    if (!closest || distance < closest.distance) {
      closest = {
        tileId: tile.id,
        coord: { q: tile.coord.q, r: tile.coord.r },
        distance,
      };
    }
  }
  return closest
    ? { tileId: closest.tileId, coord: closest.coord }
    : undefined;
}

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
