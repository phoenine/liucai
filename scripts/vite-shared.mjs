import react from "@vitejs/plugin-react";

/**
 * Shared Vite build config used by both:
 *   - vite.config.ts  (standalone / IDE integration)
 *   - scripts/build.mjs  (multi-entry production build)
 *
 * Fields specific to programmatic build() API (root, configFile, lib, rollupOptions)
 * belong in build.mjs, not here.
 */
export const sharedBuildConfig = {
  plugins: [react()],
  esbuild: { charset: "ascii" },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    target: "chrome120",
    sourcemap: true,
    emptyOutDir: false,
  },
};
