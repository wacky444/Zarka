import Phaser from "phaser";
import { isMobile } from "../utils/isMobile";

let backgroundAudioSuspended = false;
let pausedSounds: Phaser.Sound.BaseSound[] = [];

export function isBackgroundAudioSuspended(): boolean {
  return backgroundAudioSuspended;
}

export function installMobileAudioLifecycle(game: Phaser.Game): void {
  if (!isMobile() || typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  const soundManager = game.sound;
  if (!soundManager) {
    return;
  }
  soundManager.pauseOnBlur = false;

  let windowFocused = document.hasFocus();
  const updateAudioState = (): void => {
    const shouldSuspend =
      document.visibilityState !== "visible" || !windowFocused;
    if (shouldSuspend === backgroundAudioSuspended) {
      return;
    }

    backgroundAudioSuspended = shouldSuspend;
    if (shouldSuspend) {
      pausedSounds = soundManager.getAllPlaying();
      for (const sound of pausedSounds) {
        sound.pause();
      }
      return;
    }

    const soundsToResume = pausedSounds;
    pausedSounds = [];
    for (const sound of soundsToResume) {
      if (!sound.pendingRemove && sound.isPaused) {
        sound.resume();
      }
    }
  };
  const handleBlur = (): void => {
    windowFocused = false;
    updateAudioState();
  };
  const handleFocus = (): void => {
    windowFocused = true;
    updateAudioState();
  };
  const handleVisibilityChange = (): void => {
    if (document.visibilityState === "visible") {
      windowFocused = document.hasFocus();
    }
    updateAudioState();
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("blur", handleBlur);
  window.addEventListener("focus", handleFocus);
  window.addEventListener("pageshow", handleVisibilityChange);

  game.events.once(Phaser.Core.Events.DESTROY, () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("blur", handleBlur);
    window.removeEventListener("focus", handleFocus);
    window.removeEventListener("pageshow", handleVisibilityChange);
    pausedSounds = [];
    backgroundAudioSuspended = false;
  });

  updateAudioState();
}
