export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && isFinite(value) ? value : undefined;
}

export function clampNonNegativeInt(value: unknown, fallback: number): number {
  const n = asNumber(value);
  if (typeof n !== "number") {
    return fallback;
  }
  const rounded = Math.floor(n);
  return Math.max(0, rounded);
}

export function clampNonNegativeNumber(
  value: unknown,
  fallback: number,
): number {
  const n = asNumber(value);
  if (typeof n !== "number") {
    return fallback;
  }
  return Math.max(0, n);
}
