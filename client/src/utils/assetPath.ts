/**
 * Builds an asset path that works both locally and on GitHub Pages.
 * Uses Vite's BASE_URL to handle the /Zarka/ prefix on GitHub Pages.
 */
export function assetPath(path: string): string {
  const base = import.meta.env.BASE_URL;
  // Remove leading slash from path if present to avoid double slashes
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  // Combine base and path, ensuring no double slashes
  return `${base}${cleanPath}`.replace(/\/+/g, "/");
}
