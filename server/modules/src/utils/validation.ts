export function clampNumber(
  value: unknown,
  min: number,
  max: number
): number | undefined {
  const parsed = parseInt(String(value ?? ""), 10);
  if (isNaN(parsed)) {
    return undefined;
  }

  return Math.max(min, Math.min(max, parsed));
}

export function validateTime(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(value) ? value : undefined;
}
