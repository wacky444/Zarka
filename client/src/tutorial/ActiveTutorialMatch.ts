export interface TutorialMatchStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_KEY_PREFIX = "zarka.active-tutorial-match.";

export function getBrowserTutorialMatchStorage(): TutorialMatchStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

export function readActiveTutorialMatchId(
  storage: TutorialMatchStorage | null,
  userId: string | null
): string | null {
  if (!storage || !userId) {
    return null;
  }
  try {
    const value = storage.getItem(storageKey(userId));
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function saveActiveTutorialMatchId(
  storage: TutorialMatchStorage | null,
  userId: string | null,
  matchId: string
): boolean {
  if (!storage || !userId || !matchId.trim()) {
    return false;
  }
  try {
    storage.setItem(storageKey(userId), matchId.trim());
    return true;
  } catch {
    return false;
  }
}

export function clearActiveTutorialMatchId(
  storage: TutorialMatchStorage | null,
  userId: string | null,
  expectedMatchId?: string
): boolean {
  if (!storage || !userId) {
    return false;
  }
  try {
    const key = storageKey(userId);
    if (
      expectedMatchId &&
      storage.getItem(key)?.trim() !== expectedMatchId.trim()
    ) {
      return false;
    }
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
