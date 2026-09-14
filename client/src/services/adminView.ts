export const ADMIN_VIEW_STORAGE_KEY = "zarka_admin_view_all";

export function isAdminViewEnabled(): boolean {
  return localStorage.getItem(ADMIN_VIEW_STORAGE_KEY) === "true";
}

export function setAdminViewEnabled(enabled: boolean): void {
  localStorage.setItem(ADMIN_VIEW_STORAGE_KEY, enabled ? "true" : "false");
}
