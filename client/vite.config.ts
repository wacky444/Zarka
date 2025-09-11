import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    open: true,
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
