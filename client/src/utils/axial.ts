import type { Axial } from "@shared";

export function normalizeAxial(value: Axial | null | undefined): Axial | null {
  if (!value) {
    return null;
  }
  const q = typeof value.q === "number" ? value.q : Number(value.q);
  const r = typeof value.r === "number" ? value.r : Number(value.r);
  if (Number.isNaN(q) || Number.isNaN(r)) {
    return null;
  }
  return { q, r };
}
