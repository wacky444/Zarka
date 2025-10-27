import { defineConfig } from "vite";

export default defineConfig({
  // Set base path for GitHub Pages deployment
  // base: process.env.NODE_ENV === "production" ? "/Zarka/" : "/",
  base: "",
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
