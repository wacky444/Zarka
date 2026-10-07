const STARTUP_LOADING_SCREEN_ID = "startup-loading";

export function hideStartupLoadingScreen(): void {
  const loadingScreen = document.getElementById(STARTUP_LOADING_SCREEN_ID);
  if (!loadingScreen) {
    return;
  }

  loadingScreen.classList.add("startup-loading-hidden");
  loadingScreen.setAttribute("aria-hidden", "true");
}
