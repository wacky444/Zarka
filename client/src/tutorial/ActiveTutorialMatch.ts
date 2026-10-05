import { TUTORIAL_STEP_IDS, type TutorialStepId } from "@shared";

export interface TutorialMatchStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_KEY_PREFIX = "zarka.active-tutorial-match.";
const PRESENTATION_PROGRESS_KEY_PREFIX = "zarka.tutorial-presentation.";

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

function presentationProgressKey(userId: string, matchId: string): string {
  return `${PRESENTATION_PROGRESS_KEY_PREFIX}${encodeURIComponent(userId)}.${encodeURIComponent(matchId)}`;
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

export function readTutorialPresentationSteps(
  storage: TutorialMatchStorage | null,
  userId: string | null,
  matchId: string | null
): TutorialStepId[] {
  if (!storage || !userId || !matchId) {
    return [];
  }
  try {
    const stored = storage.getItem(presentationProgressKey(userId, matchId));
    if (!stored) {
      return [];
    }
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [];
    }
    const steps = (parsed as { presentationSteps?: unknown }).presentationSteps;
    if (!Array.isArray(steps)) {
      return [];
    }
    const validSteps = new Set<string>(TUTORIAL_STEP_IDS);
    return [...new Set(steps.filter(
      (step): step is TutorialStepId =>
        typeof step === "string" && validSteps.has(step)
    ))];
  } catch {
    return [];
  }
}

export function saveTutorialPresentationStep(
  storage: TutorialMatchStorage | null,
  userId: string | null,
  matchId: string | null,
  stepId: TutorialStepId
): boolean {
  if (!storage || !userId || !matchId) {
    return false;
  }
  try {
    const steps = readTutorialPresentationSteps(storage, userId, matchId);
    if (steps.indexOf(stepId) !== -1) {
      return true;
    }
    steps.push(stepId);
    storage.setItem(
      presentationProgressKey(userId, matchId),
      JSON.stringify({ presentationSteps: steps })
    );
    return true;
  } catch {
    return false;
  }
}

export function clearTutorialPresentationSteps(
  storage: TutorialMatchStorage | null,
  userId: string | null,
  matchId: string | null
): boolean {
  if (!storage || !userId || !matchId) {
    return false;
  }
  try {
    storage.removeItem(presentationProgressKey(userId, matchId));
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
