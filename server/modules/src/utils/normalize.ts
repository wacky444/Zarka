import { DEFAULT_MATCH_NAME, MAX_MATCH_NAME_LENGTH } from "../constants";

export function normalizeMatchName(
  value: unknown,
  fallback: string = DEFAULT_MATCH_NAME
): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return fallback;
  }

  return trimmed.slice(0, MAX_MATCH_NAME_LENGTH);
}
