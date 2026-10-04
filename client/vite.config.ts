import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? (process.env.GITHUB_ACTIONS ? "/Zarka/" : "./"),
  server: {
    port: 5173,
    open: true,
  },
  resolve: {
    alias: {
      "@shared": new URL("../shared/src", import.meta.url).pathname,
    },
  },
  build: {
    // Ensure all built assets go into a separate folder
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
    // Generate sourcemaps only in the output folder (not next to TS sources)
    sourcemap: true,
  },
});
